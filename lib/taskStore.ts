import { randomUUID } from "crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "fs";
import path from "path";

import { getFeishuWebhookUrl } from "./batchSizeConfig";

export type TaskStatus = "pending" | "processing" | "completed" | "failed";

export interface TaskRecord {
  id: string;
  roundId: string;
  path: string;
  status: TaskStatus;
  failureCount: number;
  message?: string;
  createdAt: number;
  updatedAt: number;
  processingStartedAt?: number;
  processingNodeId?: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const ROUNDS_DIR = path.join(DATA_DIR, "rounds");
const MAX_ROUND_NAME_LENGTH = 64;

function sanitizeRoundName(rawName: string | undefined | null): string | undefined {
  if (!rawName) {
    return undefined;
  }
  const trimmed = rawName.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= MAX_ROUND_NAME_LENGTH) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_ROUND_NAME_LENGTH);
}

interface TaskCounts {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

function ensureRoundsDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!existsSync(ROUNDS_DIR)) {
    mkdirSync(ROUNDS_DIR, { recursive: true });
  }
}

function getRoundFilePath(roundId: string) {
  ensureRoundsDir();
  return path.join(ROUNDS_DIR, `${roundId}.json`);
}

export interface PaginatedTasks {
  tasks: TaskRecord[];
  total: number;
}

interface EnqueueResult {
  added: number;
  skipped: number;
  addedTaskIds: string[];
}

export type TaskRoundSourceType = "file" | "folder" | "manual";
export type TaskRoundLifecycle = "pending" | "active" | "completed";

export interface TaskRoundSummary {
  id: string;
  name: string;
  status: TaskRoundLifecycle;
  createdAt: number;
  activatedAt: number | null;
  completedAt: number | null;
  sourceType: TaskRoundSourceType;
  sourceHint?: string;
  counts: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  processed: ProcessedSnapshot;
}

export interface RoundCreationResult {
  roundId: string;
  name: string;
  status: TaskRoundLifecycle;
  createdAt: number;
  activatedAt: number | null;
  completedAt: number | null;
  sourceType: TaskRoundSourceType;
  sourceHint?: string;
  added: number;
  skipped: number;
  counts: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  processed: ProcessedSnapshot;
}

export interface RoundCreationOptions {
  name?: string;
  sourceType: TaskRoundSourceType;
  sourceHint?: string;
  activate?: boolean;
}

export interface NodePerformanceRecord {
  timestamp: number;
  itemNum: number;
  runningTime: number;
  speed: number;
}

export interface NodeStats {
  nodeId: string;
  totalItemNum: number;
  totalRunningTime: number;
  recordCount: number;
  archivedRecordCount: number;
  archivedItemNum: number;
  archivedRunningTime: number;
  avgSpeed: number; // items per second (lifetime)
  avgTimePer100Items: number; // seconds per 100 items (lifetime)
  lastUpdated: number;
  recentRecords: NodePerformanceRecord[];
  requestCount: number;
  assignedTaskCount: number;
  activeTaskIds: string[];
}

export interface NodeStatsSummary {
  nodeCount: number;
  totalItemNum: number;
  totalRunningTime: number;
  recordCount: number;
  averageSpeed: number | null;
  averageTimePer100Items: number | null;
  averageItemNum: number | null;
  totalRequests: number;
  totalAssignedTasks: number;
  totalActiveTasks: number;
}

class NodeStatisticsStore {
  private nodeStats = new Map<string, NodeStats>();
  private nodeActiveTasks = new Map<string, Set<string>>();
  private taskToNode = new Map<string, string>();
  private static readonly MAX_RECENT_NODE_HISTORY = 500;
  private static readonly NODE_RECENT_WINDOW_MS = 2 * 60 * 60 * 1000;

  constructor() {
    // 节点统计仅保存在内存中，无需加载持久化文件
  }

  recordRequest(nodeId: string) {
    const normalized = typeof nodeId === "string" ? nodeId.trim() : "";
    if (!normalized) {
      return;
    }
    const now = Date.now();
    const stats = this.getOrCreateNodeStats(normalized, now);
    stats.requestCount += 1;
    stats.lastUpdated = now;
    this.persist();
  }

  recordAssignment(nodeId: string, taskIds: string[]) {
    const normalized = typeof nodeId === "string" ? nodeId.trim() : "";
    if (!normalized || taskIds.length === 0) {
      return;
    }
    const now = Date.now();
    const stats = this.getOrCreateNodeStats(normalized, now);
    stats.assignedTaskCount += taskIds.length;
    const activeSet = this.ensureActiveSet(normalized);
    for (const taskId of taskIds) {
      if (typeof taskId !== "string" || taskId.trim() === "") {
        continue;
      }
      activeSet.add(taskId);
      this.taskToNode.set(taskId, normalized);
    }
    stats.lastUpdated = now;
    this.updateActiveSnapshot(normalized);
    this.persist();
  }

  detachTask(taskId: string, explicitNodeId?: string) {
    if (typeof taskId !== "string" || taskId.trim() === "") {
      return;
    }
    const mappedNodeId = explicitNodeId ?? this.taskToNode.get(taskId);
    if (!mappedNodeId) {
      this.taskToNode.delete(taskId);
      return;
    }
    const activeSet = this.nodeActiveTasks.get(mappedNodeId);
    if (activeSet) {
      activeSet.delete(taskId);
      if (activeSet.size === 0) {
        this.nodeActiveTasks.delete(mappedNodeId);
      }
    }
    this.taskToNode.delete(taskId);
    const stats = this.nodeStats.get(mappedNodeId);
    if (!stats) {
      return;
    }
    stats.lastUpdated = Date.now();
    this.updateActiveSnapshot(mappedNodeId);
    this.persist();
  }

  recordProcessedInfo(info: ProcessedInfo, referenceTime = Date.now()) {
    if (!info || typeof info.node_id !== "string") {
      return;
    }
    const normalized = info.node_id.trim();
    if (!normalized) {
      return;
    }
    this.archiveOutdated(referenceTime);
    const speed =
      info.running_time > 0 ? info.item_num / info.running_time : 0;
    const record: NodePerformanceRecord = {
      timestamp: referenceTime,
      itemNum: info.item_num,
      runningTime: info.running_time,
      speed,
    };
    const stats = this.getOrCreateNodeStats(normalized, referenceTime);
    stats.recentRecords = [...stats.recentRecords, record];
    stats.totalItemNum += info.item_num;
    stats.totalRunningTime += info.running_time;
    stats.recordCount += 1;
    stats.lastUpdated = referenceTime;
    this.trimAndArchiveNodeRecords(stats, referenceTime);
    this.updateNodeAggregates(stats);
    this.updateActiveSnapshot(normalized);
    this.persist();
  }

  listNodeStats(
    page: number,
    pageSize: number,
  ): { nodes: NodeStats[]; total: number; page: number } {
    const normalizedPage = Math.max(1, Math.floor(page));
    const normalizedPageSize = Math.max(1, Math.floor(pageSize));

    this.archiveOutdated(Date.now());

    const allNodes = [...this.nodeStats.entries()]
      .map(([nodeId, node]) => {
        const activeSet = this.nodeActiveTasks.get(nodeId);
        return {
          ...node,
          activeTaskIds: activeSet ? [...activeSet] : [...node.activeTaskIds],
          recentRecords: [...node.recentRecords],
        };
      })
      .sort((a, b) => b.lastUpdated - a.lastUpdated);

    const total = allNodes.length;
    const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
    const effectivePage = Math.min(normalizedPage, totalPages);
    const start = Math.max(0, (effectivePage - 1) * normalizedPageSize);
    const end = Math.min(start + normalizedPageSize, total);

    return {
      total,
      page: effectivePage,
      nodes: allNodes.slice(start, end),
    };
  }

  getSummarySnapshot(): NodeStatsSummary | null {
    this.archiveOutdated(Date.now());
    if (this.nodeStats.size === 0) {
      return null;
    }

    const stats = [...this.nodeStats.values()];
    const nodeCount = stats.length;
    const totalItemNum = stats.reduce((sum, node) => sum + node.totalItemNum, 0);
    const totalRunningTime = stats.reduce(
      (sum, node) => sum + node.totalRunningTime,
      0,
    );
    const recordCount = stats.reduce((sum, node) => sum + node.recordCount, 0);
    const totalRequests = stats.reduce((sum, node) => sum + node.requestCount, 0);
    const totalAssignedTasks = stats.reduce(
      (sum, node) => sum + node.assignedTaskCount,
      0,
    );
    const totalActiveTasks = stats.reduce(
      (sum, node) => sum + node.activeTaskIds.length,
      0,
    );
    const averageSpeed =
      totalRunningTime > 0
        ? totalItemNum / totalRunningTime
        : nodeCount > 0
          ? 0
          : null;
    const averageTimePer100Items =
      totalItemNum > 0
        ? (totalRunningTime / totalItemNum) * 100
        : nodeCount > 0
          ? 0
          : null;
    const averageItemNum =
      recordCount > 0 ? totalItemNum / recordCount : nodeCount > 0 ? 0 : null;

    return {
      nodeCount,
      totalItemNum,
      totalRunningTime,
      recordCount,
      averageSpeed,
      averageTimePer100Items,
      averageItemNum,
      totalRequests,
      totalAssignedTasks,
      totalActiveTasks,
    };
  }

  clearAll(): { cleared: number } {
    const cleared = this.nodeStats.size;
    this.nodeStats.clear();
    this.nodeActiveTasks.clear();
    this.taskToNode.clear();
    return { cleared };
  }

  deleteNode(nodeId: string): { deleted: boolean } {
    const normalized = typeof nodeId === "string" ? nodeId.trim() : "";
    if (!normalized) {
      return { deleted: false };
    }
    const deleted = this.nodeStats.delete(normalized);
    this.nodeActiveTasks.delete(normalized);
    for (const [taskId, mappedNodeId] of [...this.taskToNode.entries()]) {
      if (mappedNodeId === normalized) {
        this.taskToNode.delete(taskId);
      }
    }
    return { deleted };
  }

  private persist() {
    // 节点统计改为仅存储于内存，不再落盘
  }

  private getOrCreateNodeStats(
    nodeId: string,
    referenceTime = Date.now(),
  ): NodeStats {
    const existing = this.nodeStats.get(nodeId);
    if (existing) {
      if (!Array.isArray(existing.activeTaskIds)) {
        const activeSet = this.nodeActiveTasks.get(nodeId);
        existing.activeTaskIds = activeSet ? [...activeSet] : [];
      }
      if (!Number.isFinite(existing.archivedRecordCount)) {
        existing.archivedRecordCount = 0;
      }
      if (!Number.isFinite(existing.archivedItemNum)) {
        existing.archivedItemNum = 0;
      }
      if (!Number.isFinite(existing.archivedRunningTime)) {
        existing.archivedRunningTime = 0;
      }
      return existing;
    }

    const initial: NodeStats = {
      nodeId,
      totalItemNum: 0,
      totalRunningTime: 0,
      recordCount: 0,
      archivedRecordCount: 0,
      archivedItemNum: 0,
      archivedRunningTime: 0,
      avgSpeed: 0,
      avgTimePer100Items: 0,
      lastUpdated: referenceTime,
      recentRecords: [],
      requestCount: 0,
      assignedTaskCount: 0,
      activeTaskIds: [],
    };
    this.nodeStats.set(nodeId, initial);
    return initial;
  }

  private ensureActiveSet(nodeId: string): Set<string> {
    let active = this.nodeActiveTasks.get(nodeId);
    if (!active) {
      active = new Set<string>();
      this.nodeActiveTasks.set(nodeId, active);
    }
    return active;
  }

  private updateActiveSnapshot(nodeId: string) {
    const active = this.nodeActiveTasks.get(nodeId);
    const stats = this.nodeStats.get(nodeId);
    if (stats) {
      stats.activeTaskIds = active ? [...active] : [];
    }
  }

  private archiveOutdated(referenceTime: number) {
    for (const stats of this.nodeStats.values()) {
      this.trimAndArchiveNodeRecords(stats, referenceTime);
      this.updateNodeAggregates(stats);
      this.updateActiveSnapshot(stats.nodeId);
    }
  }

  private trimAndArchiveNodeRecords(stats: NodeStats, referenceTime: number) {
    if (stats.recentRecords.length === 0) {
      return;
    }

    const cutoffTime =
      referenceTime - NodeStatisticsStore.NODE_RECENT_WINDOW_MS;
    const keep: NodePerformanceRecord[] = [];
    const toArchive: NodePerformanceRecord[] = [];

    for (const record of stats.recentRecords) {
      if (record.timestamp >= cutoffTime) {
        keep.push(record);
      } else {
        toArchive.push(record);
      }
    }

    while (keep.length > NodeStatisticsStore.MAX_RECENT_NODE_HISTORY) {
      const record = keep.shift();
      if (record) {
        toArchive.push(record);
      }
    }

    if (toArchive.length > 0) {
      const archivedItemNum = toArchive.reduce(
        (sum, record) => sum + record.itemNum,
        0,
      );
      const archivedRunningTime = toArchive.reduce(
        (sum, record) => sum + record.runningTime,
        0,
      );
      stats.archivedRecordCount += toArchive.length;
      stats.archivedItemNum += archivedItemNum;
      stats.archivedRunningTime += archivedRunningTime;
    }

    stats.recentRecords = keep;
  }

  private updateNodeAggregates(stats: NodeStats) {
    const avgSpeed =
      stats.totalRunningTime > 0
        ? stats.totalItemNum / stats.totalRunningTime
        : 0;
    const avgTimePer100Items =
      stats.totalItemNum > 0
        ? (stats.totalRunningTime / stats.totalItemNum) * 100
        : 0;
    stats.avgSpeed = Number.isFinite(avgSpeed) ? avgSpeed : 0;
    stats.avgTimePer100Items = Number.isFinite(avgTimePer100Items)
      ? avgTimePer100Items
      : 0;

    const latestRecord = stats.recentRecords.at(-1);
    if (latestRecord && latestRecord.timestamp > stats.lastUpdated) {
      stats.lastUpdated = latestRecord.timestamp;
    }
  }
}

export interface ProcessedInfo {
  node_id: string;
  item_num: number;
  running_time: number;
}

export interface RunStatistics {
  hasTasks: boolean;
  allCompleted: boolean;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  processingTasks: number;
  failedTasks: number;
  startTime: number | null;
  endTime: number | null;
  durationMs: number | null;
  totalItemNum: number;
  totalRunningTime: number;
  averageTaskSpeed: number | null;
  averageItemSpeed: number | null;
  averageTimePerItem: number | null;
  averageTimePer100Items: number | null;
}

export interface TimeoutInspectionTaskInfo {
  roundId: string;
  taskId: string;
  path: string;
  status: TaskStatus;
  startedAt: number;
  durationMs: number;
  nodeId: string | null;
}

export interface TimeoutInspectionSummary {
  roundId: string;
  thresholdMs: number;
  inspectedAt: number;
  totalProcessing: number;
  timedOutCount: number;
  nearTimeoutCount: number;
  longestDurationMs: number | null;
  topTimedOut: TimeoutInspectionTaskInfo[];
  topProcessing: TimeoutInspectionTaskInfo[];
}

export interface TimeoutInspectionAggregate {
  thresholdMs: number;
  inspectedAt: number;
  totalProcessing: number;
  timedOutCount: number;
  nearTimeoutCount: number;
  longestDurationMs: number | null;
  topTimedOut: TimeoutInspectionTaskInfo[];
  topProcessing: TimeoutInspectionTaskInfo[];
  roundSummaries: TimeoutInspectionSummary[];
}

interface SerializedRoundData {
  roundId: string;
  tasks: TaskRecord[];
  pendingQueue: string[];
  processingStartedAt: Array<[string, number]>;
  completedList: string[];
  failedList: string[];
  totalProcessedItemNum: number;
  totalProcessedRunningTime: number;
  lastProcessedAt: number | null;
}

interface ProcessedSnapshot {
  totalItemNum: number;
  totalRunningTime: number;
  lastProcessedAt: number | null;
  averageTimePerItem: number | null;
  averageTimePer100Items: number | null;
}

export interface GlobalCompletionStats {
  totalRounds: number;
  completedRounds: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalProcessedItems: number;
  totalRunningTime: number;
  averageTimePerItem: number | null;
  averageTimePer100Items: number | null;
  allRoundsCompleted: boolean;
  generatedAt: number;
}

interface PersistedRoundFile {
  metadata: {
    id: string;
    name: string;
    sourceType: TaskRoundSourceType;
    sourceHint?: string;
    createdAt: number;
    activatedAt: number | null;
    completedAt: number | null;
    status: TaskRoundLifecycle;
    counts: TaskCounts;
  };
  store: SerializedRoundData;
}

class SingleRoundStore {
  private tasks = new Map<string, TaskRecord>();
  private pathToTaskId = new Map<string, string>();

  private pendingQueue: string[] = [];
  private pendingSet = new Set<string>();

  private processingSet = new Set<string>();
  private processingStartedAt = new Map<string, number>();

  private completedSet = new Set<string>();
  private completedList: string[] = [];

  private failedSet = new Set<string>();
  private failedList: string[] = [];

  // Run statistics
  private totalProcessedItemNum = 0;
  private totalProcessedRunningTime = 0;
  private lastProcessedAt: number | null = null;
  private roundId = "";

  constructor(private readonly nodeStore: NodeStatisticsStore) {}

  setRoundId(roundId: string) {
    this.roundId = roundId;
  }

  enqueueTasksFromPaths(paths: string[]): EnqueueResult {
    let added = 0;
    let skipped = 0;
    const addedTaskIds: string[] = [];

    for (const rawPath of paths) {
      const path = rawPath.trim();

      if (!path) {
        skipped += 1;
        continue;
      }

      const existingId = this.pathToTaskId.get(path);
      if (existingId) {
        const existingTask = this.tasks.get(existingId);
        if (existingTask && existingTask.status !== "failed") {
          skipped += 1;
          continue;
        }

        // Allow requeuing for failed tasks by removing old references.
        if (existingTask) {
          this.failedSet.delete(existingId);
          this.failedList = this.failedList.filter((id) => id !== existingId);
          this.tasks.delete(existingId);
        }
      }

      const id = `task_${randomUUID()}`;
      const now = Date.now();

      const task: TaskRecord = {
        id,
        roundId: this.roundId,
        path,
        status: "pending",
        failureCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      this.tasks.set(id, task);
      this.pathToTaskId.set(path, id);
      this.enqueuePending(id);
      added += 1;
      addedTaskIds.push(id);
    }

    return { added, skipped, addedTaskIds };
  }

  getTasksForProcessing(batchSize: number, nodeId?: string): TaskRecord[] {
    const normalizedNodeId = typeof nodeId === "string" && nodeId.trim() !== "" ? nodeId.trim() : undefined;
    if (normalizedNodeId) {
      this.nodeStore.recordRequest(normalizedNodeId);
    }

    const results: TaskRecord[] = [];

    while (results.length < batchSize) {
      const taskId = this.dequeueNextPending();
      if (!taskId) {
        break;
      }

      const task = this.tasks.get(taskId);
      if (!task) {
        continue;
      }

      task.status = "processing";
      task.processingStartedAt = Date.now();
      task.updatedAt = task.processingStartedAt;
      if (normalizedNodeId) {
        task.processingNodeId = normalizedNodeId;
      } else {
        task.processingNodeId = undefined;
      }

      this.processingSet.add(task.id);
      this.processingStartedAt.set(task.id, task.processingStartedAt);

      results.push({ ...task });
    }

    if (normalizedNodeId) {
      this.nodeStore.recordAssignment(
        normalizedNodeId,
        results.map((task) => task.id),
      );
    }

    return results;
  }

  updateTaskStatus(taskId: string, success: boolean, message: string) {
    const task = this.tasks.get(taskId);

    if (!task) {
      return { ok: false as const, reason: "TASK_NOT_FOUND" as const };
    }

    const previousNodeId = task.processingNodeId;

    this.processingSet.delete(taskId);
    this.processingStartedAt.delete(taskId);
    this.pendingSet.delete(taskId);
    this.removeIdFromList(this.pendingQueue, taskId);
    this.detachTaskFromNode(taskId, previousNodeId);

    if (task.status === "completed" && !success) {
      return { ok: true as const, status: task.status };
    }

    task.updatedAt = Date.now();
    task.message = message || undefined;

    if (success) {
      task.status = "completed";
      task.failureCount = 0;
      task.processingStartedAt = undefined;
      if (this.failedSet.delete(taskId)) {
        this.removeIdFromList(this.failedList, taskId);
      }

      if (!this.completedSet.has(taskId)) {
        this.completedSet.add(taskId);
        this.completedList.unshift(taskId);
      }

      return { ok: true as const, status: task.status };
    }

    task.failureCount += 1;
    task.processingStartedAt = undefined;
    task.status = "failed";
    this.removeIdFromList(this.failedList, taskId);
    if (!this.failedSet.has(taskId)) {
      this.failedSet.add(taskId);
    }
    this.failedList.unshift(taskId);

    return { ok: true as const, status: task.status };
  }

  resetProcessingTasks(): void {
    // Requeue any tasks that were left in processing (e.g., after a crash).
    for (const taskId of [...this.processingSet]) {
      const task = this.tasks.get(taskId);
      if (!task) {
        continue;
      }

      task.status = "pending";
      task.processingStartedAt = undefined;
      this.detachTaskFromNode(taskId);
      this.enqueuePending(taskId);
      this.processingSet.delete(taskId);
      this.processingStartedAt.delete(taskId);
    }
  }

  getCounts() {
    return {
      total: this.tasks.size,
      pending: this.pendingSet.size,
      processing: this.processingSet.size,
      completed: this.completedSet.size,
      failed: this.failedSet.size,
    };
  }

  markTimedOutTasksAsFailed(timeoutMs: number): number {
    const now = Date.now();
    const safeTimeout =
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0;
    let handledCount = 0;

    for (const taskId of [...this.processingSet]) {
      const task = this.tasks.get(taskId);
      const startedAt = this.processingStartedAt.get(taskId);

      if (!task || !startedAt) {
        continue;
      }

      if (safeTimeout > 0 && now - startedAt <= safeTimeout) {
        continue;
      }

      const previousNodeId = task.processingNodeId;
      this.processingSet.delete(taskId);
      this.processingStartedAt.delete(taskId);
      this.pendingSet.delete(taskId);
      this.removeIdFromList(this.pendingQueue, taskId);
      this.detachTaskFromNode(taskId, previousNodeId);

      task.processingStartedAt = undefined;
      task.updatedAt = now;

      if (task.failureCount < 1) {
        const retryCount = task.failureCount + 1;
        task.failureCount = retryCount;
        task.status = "pending";
        task.message = `任务超时，已重新排入队列进行第${retryCount}次重试`;
        this.failedSet.delete(taskId);
        this.removeIdFromList(this.failedList, taskId);
        this.enqueuePending(taskId);
      } else {
        task.failureCount += 1;
        task.status = "failed";
        task.message = "任务超时失败（已达到最大重试次数）";
        if (!this.failedSet.has(taskId)) {
          this.failedSet.add(taskId);
        }
        this.removeIdFromList(this.failedList, taskId);
        this.failedList.unshift(taskId);
      }

      handledCount += 1;
    }

    return handledCount;
  }

  inspectProcessingTasks(timeoutMs: number): TimeoutInspectionSummary {
    const now = Date.now();
    const safeThreshold = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0;
    const records: TimeoutInspectionTaskInfo[] = [];

    for (const [taskId, startedAt] of this.processingStartedAt.entries()) {
      if (typeof startedAt !== "number") {
        continue;
      }
      const task = this.tasks.get(taskId);
      if (!task) {
        continue;
      }
      const durationMs = Math.max(0, now - startedAt);
      records.push({
        roundId: this.roundId,
        taskId,
        path: task.path,
        status: task.status,
        startedAt,
        durationMs,
        nodeId: task.processingNodeId ?? null,
      });
    }

    records.sort((a, b) => b.durationMs - a.durationMs);

    const timedOutRecords =
      safeThreshold > 0 ? records.filter((record) => record.durationMs > safeThreshold) : [];
    const nearThresholdMs = safeThreshold > 0 ? safeThreshold * 0.8 : 0;
    const nearTimeoutRecords =
      safeThreshold > 0
        ? records.filter(
            (record) =>
              record.durationMs >= nearThresholdMs && record.durationMs <= safeThreshold,
          )
        : [];

    const longestDurationMs = records.length > 0 ? records[0].durationMs : null;

    return {
      roundId: this.roundId,
      thresholdMs: safeThreshold,
      inspectedAt: now,
      totalProcessing: records.length,
      timedOutCount: timedOutRecords.length,
      nearTimeoutCount: nearTimeoutRecords.length,
      longestDurationMs,
      topTimedOut: timedOutRecords.slice(0, 5),
      topProcessing: records.slice(0, 5),
    };
  }

  recordNodeProcessedInfo(info: ProcessedInfo, recordNodeStats = true): void {
    const now = Date.now();
    if (recordNodeStats) {
      this.nodeStore.recordProcessedInfo(info, now);
    }
    this.totalProcessedItemNum += info.item_num;
    this.totalProcessedRunningTime += info.running_time;
    this.lastProcessedAt = now;
  }

  findTaskByIdOrPath(query: string): TaskRecord | null {
    // First try to find by task ID
    const taskById = this.tasks.get(query);
    if (taskById) {
      return { ...taskById };
    }

    // Then try to find by path
    const taskId = this.pathToTaskId.get(query);
    if (taskId) {
      const task = this.tasks.get(taskId);
      if (task) {
        return { ...task };
      }
    }

    return null;
  }

  clearAllTasks(): { cleared: number } {
    const clearedCount = this.tasks.size;

    for (const task of this.tasks.values()) {
      if (task.processingNodeId) {
        this.nodeStore.detachTask(task.id, task.processingNodeId);
      } else {
        this.nodeStore.detachTask(task.id);
      }
    }

    // Clear all data structures
    this.tasks.clear();
    this.pathToTaskId.clear();
    this.pendingQueue = [];
    this.pendingSet.clear();
    this.processingSet.clear();
    this.processingStartedAt.clear();
    this.completedSet.clear();
    this.completedList = [];
    this.failedSet.clear();
    this.failedList = [];

    this.totalProcessedItemNum = 0;
    this.totalProcessedRunningTime = 0;
    this.lastProcessedAt = null;

    return { cleared: clearedCount };
  }

  listTasksByStatus(status: TaskStatus | "all", page: number, pageSize: number): PaginatedTasks {
    if (status === "pending") {
      return this.getPendingPage(page, pageSize);
    }

    if (status === "processing") {
      return this.getProcessingPage(page, pageSize);
    }

    if (status === "completed") {
      return this.paginateByIdList(this.completedList, page, pageSize);
    }

    if (status === "failed") {
      return this.paginateByIdList(this.failedList, page, pageSize);
    }

    const tasks = [...this.tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    const total = tasks.length;
    const start = Math.max((page - 1) * pageSize, 0);
    const end = Math.min(start + pageSize, total);

    return {
      tasks: tasks.slice(start, end).map((task) => ({ ...task })),
      total,
    };
  }

  getRunStatistics(): RunStatistics {
    const tasks = [...this.tasks.values()];
    const counts = this.getCounts();

    if (tasks.length === 0) {
      const averageItemSpeed =
        this.totalProcessedRunningTime > 0
          ? this.totalProcessedItemNum / this.totalProcessedRunningTime
          : null;
      const averageTimePerItem =
        this.totalProcessedItemNum > 0
          ? this.totalProcessedRunningTime / this.totalProcessedItemNum
          : null;
      const averageTimePer100Items =
        averageTimePerItem !== null ? averageTimePerItem * 100 : null;

      return {
        hasTasks: false,
        allCompleted: false,
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        processingTasks: 0,
        failedTasks: 0,
        startTime: null,
        endTime: null,
        durationMs: null,
        totalItemNum: this.totalProcessedItemNum,
        totalRunningTime: this.totalProcessedRunningTime,
        averageTaskSpeed: null,
        averageItemSpeed,
        averageTimePerItem,
        averageTimePer100Items,
      };
    }

    const totalTasks = tasks.length;
    const completedTasks = counts.completed;
    const pendingTasks = counts.pending;
    const processingTasks = counts.processing;
    const failedTasks = counts.failed;

    const rawStartTime = tasks.reduce(
      (min, task) => Math.min(min, task.createdAt),
      Number.POSITIVE_INFINITY,
    );
    const completedTaskTimestamps = tasks
      .filter((task) => task.status === "completed")
      .map((task) => task.updatedAt);

    const startTime = Number.isFinite(rawStartTime) ? rawStartTime : null;
    const endTime =
      completedTaskTimestamps.length > 0
        ? Math.max(...completedTaskTimestamps)
        : null;

    const durationMs =
      startTime !== null && endTime !== null && endTime >= startTime
        ? endTime - startTime
        : null;

    const averageTaskSpeed =
      durationMs && durationMs > 0
        ? completedTasks / (durationMs / 1000)
        : null;

    const averageItemSpeed =
      this.totalProcessedRunningTime > 0
        ? this.totalProcessedItemNum / this.totalProcessedRunningTime
        : null;
    const averageTimePerItem =
      this.totalProcessedItemNum > 0
        ? this.totalProcessedRunningTime / this.totalProcessedItemNum
        : null;
    const averageTimePer100Items =
      averageTimePerItem !== null ? averageTimePerItem * 100 : null;

    const allCompleted =
      totalTasks > 0 &&
      completedTasks === totalTasks &&
      pendingTasks === 0 &&
      processingTasks === 0 &&
      failedTasks === 0;

    return {
      hasTasks: true,
      allCompleted,
      totalTasks,
      completedTasks,
      pendingTasks,
      processingTasks,
      failedTasks,
      startTime,
      endTime,
      durationMs,
      totalItemNum: this.totalProcessedItemNum,
      totalRunningTime: this.totalProcessedRunningTime,
      averageTaskSpeed,
      averageItemSpeed,
      averageTimePerItem,
      averageTimePer100Items,
    };
  }

  getProcessedSnapshot(): ProcessedSnapshot {
    const averageTimePerItem =
      this.totalProcessedItemNum > 0
        ? this.totalProcessedRunningTime / this.totalProcessedItemNum
        : null;
    const averageTimePer100Items =
      averageTimePerItem !== null ? averageTimePerItem * 100 : null;

    return {
      totalItemNum: this.totalProcessedItemNum,
      totalRunningTime: this.totalProcessedRunningTime,
      lastProcessedAt: this.lastProcessedAt,
      averageTimePerItem,
      averageTimePer100Items,
    };
  }

  private detachTaskFromNode(taskId: string, explicitNodeId?: string) {
    const task = this.tasks.get(taskId);
    const nodeId = explicitNodeId ?? task?.processingNodeId;
    if (task) {
      task.processingNodeId = undefined;
    }
    if (nodeId) {
      this.nodeStore.detachTask(taskId, nodeId);
    } else {
      this.nodeStore.detachTask(taskId);
    }
  }

  private removeIdFromList(list: string[], id: string) {
    let index = list.indexOf(id);
    while (index !== -1) {
      list.splice(index, 1);
      index = list.indexOf(id, index);
    }
  }

  private enqueuePending(id: string) {
    if (this.pendingSet.has(id)) {
      return;
    }
    this.pendingSet.add(id);
    this.pendingQueue.push(id);
  }

  private dequeueNextPending(): string | undefined {
    while (this.pendingQueue.length > 0) {
      const candidate = this.pendingQueue.shift()!;
      if (this.pendingSet.delete(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  private getPendingPage(page: number, pageSize: number): PaginatedTasks {
    const total = this.pendingSet.size;

    const startIndex = Math.max((page - 1) * pageSize, 0);
    const endIndex = startIndex + pageSize;

    let index = 0;
    const result: TaskRecord[] = [];
    const seen = new Set<string>();

    for (const id of this.pendingQueue) {
      if (seen.has(id)) {
        continue;
      }
      if (!this.pendingSet.has(id)) {
        continue;
      }
      if (index >= startIndex && index < endIndex) {
        const task = this.tasks.get(id);
        if (task) {
          result.push({ ...task });
        }
      }
      seen.add(id);
      index += 1;
      if (index >= endIndex) {
        break;
      }
    }

    if (result.length < Math.min(pageSize, total - startIndex)) {
      // Fallback in case of inconsistencies between queue and set.
      for (const id of this.pendingSet) {
        if (seen.has(id)) continue;
        const task = this.tasks.get(id);
        if (!task) continue;

        if (index >= startIndex && index < endIndex) {
          result.push({ ...task });
        }
        seen.add(id);
        index += 1;
        if (index >= endIndex) break;
      }
    }

    return { tasks: result, total };
  }

  private getProcessingPage(page: number, pageSize: number): PaginatedTasks {
    const entries = [...this.processingStartedAt.entries()].sort(
      (a, b) => (b[1] ?? 0) - (a[1] ?? 0),
    );
    const total = entries.length;
    const start = Math.max((page - 1) * pageSize, 0);
    const end = Math.min(start + pageSize, total);

    const slice = entries.slice(start, end).flatMap(([id]) => {
      const task = this.tasks.get(id);
      return task ? [{ ...task }] : [];
    });

    return { tasks: slice, total };
  }

  private paginateByIdList(list: string[], page: number, pageSize: number): PaginatedTasks {
    const total = list.length;
    const start = Math.max((page - 1) * pageSize, 0);
    const end = Math.min(start + pageSize, total);

    const tasks: TaskRecord[] = [];

    for (const id of list.slice(start, end)) {
      const task = this.tasks.get(id);
      if (task) {
        tasks.push({ ...task });
      }
    }

    return { tasks, total };
  }

  toSnapshot(): SerializedRoundData {
    return {
      roundId: this.roundId,
      tasks: [...this.tasks.values()].map((task) => ({ ...task })),
      pendingQueue: [...this.pendingQueue],
      processingStartedAt: [...this.processingStartedAt.entries()],
      completedList: [...this.completedList],
      failedList: [...this.failedList],
      totalProcessedItemNum: this.totalProcessedItemNum,
      totalProcessedRunningTime: this.totalProcessedRunningTime,
      lastProcessedAt: this.lastProcessedAt,
    };
  }

  static fromSnapshot(
    snapshot: SerializedRoundData,
    nodeStore: NodeStatisticsStore,
  ): SingleRoundStore {
    const store = new SingleRoundStore(nodeStore);
    store.roundId = snapshot.roundId;

    store.tasks = new Map();
    store.pathToTaskId = new Map();
    store.pendingQueue = snapshot.pendingQueue.filter(Boolean);
    store.pendingSet = new Set();
    store.processingSet = new Set();
    store.processingStartedAt = new Map(snapshot.processingStartedAt);
    store.completedSet = new Set(snapshot.completedList);
    store.completedList = snapshot.completedList.filter(Boolean);
    store.failedSet = new Set(snapshot.failedList);
    store.failedList = snapshot.failedList.filter(Boolean);

    for (const task of snapshot.tasks) {
      const clonedTask: TaskRecord = { ...task };
      store.tasks.set(clonedTask.id, clonedTask);
      store.pathToTaskId.set(clonedTask.path, clonedTask.id);
      if (clonedTask.status === "pending") {
        store.pendingSet.add(clonedTask.id);
      } else if (clonedTask.status === "processing") {
        store.processingSet.add(clonedTask.id);
      } else if (clonedTask.status === "completed") {
        store.completedSet.add(clonedTask.id);
      } else if (clonedTask.status === "failed") {
        store.failedSet.add(clonedTask.id);
      }
    }

    store.pendingQueue = store.pendingQueue.filter((id) => store.tasks.has(id) && store.pendingSet.has(id));
    store.completedList = store.completedList.filter((id) => store.tasks.has(id) && store.completedSet.has(id));
    store.failedList = store.failedList.filter((id) => store.tasks.has(id) && store.failedSet.has(id));

    store.processingStartedAt = new Map(
      [...store.processingStartedAt.entries()].filter(
        ([id, startedAt]) => store.tasks.has(id) && store.processingSet.has(id) && typeof startedAt === "number",
      ),
    );
    store.processingSet = new Set(store.processingStartedAt.keys());

    store.totalProcessedItemNum = snapshot.totalProcessedItemNum;
    store.totalProcessedRunningTime = snapshot.totalProcessedRunningTime;
    store.lastProcessedAt = snapshot.lastProcessedAt;

    return store;
  }

  listTaskIds(): string[] {
    return [...this.tasks.keys()];
  }

  *iterateTasks(): IterableIterator<TaskRecord> {
    for (const task of this.tasks.values()) {
      yield task;
    }
  }

  *iteratePendingQueueOrder(): IterableIterator<string> {
    for (const id of this.pendingQueue) {
      if (!id) {
        continue;
      }
      yield id;
    }
  }

  *iterateProcessingStartedAtEntries(): IterableIterator<[string, number]> {
    for (const [id, startedAt] of this.processingStartedAt.entries()) {
      if (!this.tasks.has(id) || !this.processingSet.has(id)) {
        continue;
      }
      if (typeof startedAt === "number" && Number.isFinite(startedAt)) {
        yield [id, startedAt];
      }
    }
  }

  *iterateCompletedTaskIds(): IterableIterator<string> {
    for (const id of this.completedList) {
      if (this.completedSet.has(id) && this.tasks.has(id)) {
        yield id;
      }
    }
  }

  *iterateFailedTaskIds(): IterableIterator<string> {
    for (const id of this.failedList) {
      if (this.failedSet.has(id) && this.tasks.has(id)) {
        yield id;
      }
    }
  }

  getTotalProcessedItemNumForPersistence(): number {
    return this.totalProcessedItemNum;
  }

  getTotalProcessedRunningTimeForPersistence(): number {
    return this.totalProcessedRunningTime;
  }

  getLastProcessedAtForPersistence(): number | null {
    return this.lastProcessedAt ?? null;
  }

}

interface RoundEntry {
  id: string;
  name: string;
  sourceType: TaskRoundSourceType;
  sourceHint?: string;
  createdAt: number;
  activatedAt: number | null;
  completedAt: number | null;
  status: TaskRoundLifecycle;
  store: SingleRoundStore | null;
  countsSnapshot: TaskCounts;
  processedSnapshot: ProcessedSnapshot;
  isDirty: boolean;
  hasPersisted: boolean;
}

function writeJsonArray<T>(
  write: (chunk: string) => void,
  iterable: Iterable<T>,
  serialize: (item: T) => string,
) {
  write("[");
  let first = true;
  for (const item of iterable) {
    if (!first) {
      write(",");
    }
    write(serialize(item));
    first = false;
  }
  write("]");
}

function persistRoundSnapshotToDisk(entry: RoundEntry, store: SingleRoundStore) {
  ensureRoundsDir();
  const counts = store.getCounts();
  const metadata = {
    id: entry.id,
    name: entry.name,
    sourceType: entry.sourceType,
    sourceHint: entry.sourceHint,
    createdAt: entry.createdAt,
    activatedAt: entry.activatedAt,
    completedAt: entry.completedAt,
    status: entry.status,
    counts,
  };

  const filePath = getRoundFilePath(entry.id);
  const tempPath = `${filePath}.tmp-${Date.now()}-${randomUUID()}`;
  let fd: number | null = null;

  try {
    fd = openSync(tempPath, "w");
    const write = (chunk: string) => {
      writeSync(fd!, chunk);
    };

    write("{\"metadata\":");
    write(JSON.stringify(metadata));
    write(",\"store\":{");

    write("\"roundId\":");
    write(JSON.stringify(entry.id));

    write(",\"tasks\":");
    writeJsonArray(write, store.iterateTasks(), (task) => JSON.stringify(task));

    write(",\"pendingQueue\":");
    writeJsonArray(write, store.iteratePendingQueueOrder(), (id) => JSON.stringify(id));

    write(",\"processingStartedAt\":");
    writeJsonArray(write, store.iterateProcessingStartedAtEntries(), (pair) => JSON.stringify(pair));

    write(",\"completedList\":");
    writeJsonArray(write, store.iterateCompletedTaskIds(), (id) => JSON.stringify(id));

    write(",\"failedList\":");
    writeJsonArray(write, store.iterateFailedTaskIds(), (id) => JSON.stringify(id));

    write(",\"totalProcessedItemNum\":");
    write(String(store.getTotalProcessedItemNumForPersistence()));

    write(",\"totalProcessedRunningTime\":");
    write(String(store.getTotalProcessedRunningTimeForPersistence()));

    write(",\"lastProcessedAt\":");
    const lastProcessedAt = store.getLastProcessedAtForPersistence();
    write(lastProcessedAt === null ? "null" : String(lastProcessedAt));

    write("}}");
  } finally {
    if (fd !== null) {
      closeSync(fd);
    }
  }

  try {
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
    renameSync(tempPath, filePath);
  } catch (error) {
    try {
      rmSync(tempPath, { force: true });
    } catch {
      // ignore cleanup error
    }
    throw error;
  }

  entry.countsSnapshot = counts;
  entry.processedSnapshot = store.getProcessedSnapshot();
  entry.isDirty = false;
  entry.hasPersisted = true;
}

class TaskStore {
  private rounds = new Map<string, RoundEntry>();
  private roundOrder: string[] = [];
  private activeRoundId: string | null = null;
  private taskIdToRoundId = new Map<string, string>();
  private roundSequence = 1;
  private completionDigest: string | null = null;
  private readonly nodeStore = new NodeStatisticsStore();
  private readonly numberFormatter = new Intl.NumberFormat("zh-CN");

  private generateRoundId(): string {
    const next = this.roundSequence.toString().padStart(4, "0");
    this.roundSequence += 1;
    return `round_${next}`;
  }

  private registerRoundTasks(entry: RoundEntry) {
    if (!entry.store) {
      return;
    }
    for (const taskId of entry.store.listTaskIds()) {
      this.taskIdToRoundId.set(taskId, entry.id);
    }
  }

  private unregisterRoundTasks(entry: RoundEntry) {
    if (!entry.store) {
      return;
    }
    for (const taskId of entry.store.listTaskIds()) {
      this.taskIdToRoundId.delete(taskId);
    }
  }

  private loadRoundStore(entry: RoundEntry): SingleRoundStore | null {
    if (entry.store) {
      return entry.store;
    }

    try {
      const filePath = getRoundFilePath(entry.id);
      if (!existsSync(filePath)) {
        return null;
      }
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as PersistedRoundFile;
      const store = SingleRoundStore.fromSnapshot(parsed.store, this.nodeStore);
      store.setRoundId(entry.id);
      entry.store = store;
      entry.isDirty = false;
      entry.hasPersisted = true;
      entry.name = sanitizeRoundName(parsed.metadata.name) ?? entry.id;
      entry.sourceType = parsed.metadata.sourceType;
      entry.sourceHint = parsed.metadata.sourceHint;
      entry.createdAt = parsed.metadata.createdAt;
      entry.activatedAt = parsed.metadata.activatedAt;
      entry.completedAt = parsed.metadata.completedAt;
      entry.status = parsed.metadata.status;
      entry.countsSnapshot = store.getCounts();
      entry.processedSnapshot = store.getProcessedSnapshot();
      return store;
    } catch (error) {
      console.error(`加载任务轮 ${entry.id} 的持久化数据失败:`, error);
      return null;
    }
  }

  private persistRoundEntry(entry: RoundEntry, options: { unload?: boolean; deregister?: boolean } = {}) {
    if (!entry.store) {
      return;
    }

    try {
      persistRoundSnapshotToDisk(entry, entry.store);

      if (options.unload) {
        this.unloadRoundEntry(entry, { deregister: options.deregister });
      }
    } catch (error) {
      console.error(`持久化任务轮 ${entry.id} 到本地文件失败:`, error);
    }
  }

  private unloadRoundEntry(entry: RoundEntry, options: { deregister?: boolean } = {}) {
    if (!entry.store) {
      return;
    }
    if (options.deregister !== false) {
      this.unregisterRoundTasks(entry);
    }
    entry.store = null;
  }

  private getCountsForEntry(entry: RoundEntry): TaskCounts {
    return entry.store ? entry.store.getCounts() : entry.countsSnapshot;
  }

  private getProcessedSnapshotForEntry(entry: RoundEntry): ProcessedSnapshot {
    const snapshot = entry.store ? entry.store.getProcessedSnapshot() : entry.processedSnapshot;
    return { ...snapshot };
  }

  private updateCountsSnapshot(entry: RoundEntry) {
    if (entry.store) {
      entry.countsSnapshot = entry.store.getCounts();
    }
  }

  private updateProcessedSnapshot(entry: RoundEntry) {
    if (entry.store) {
      entry.processedSnapshot = entry.store.getProcessedSnapshot();
    }
  }

  private ensureStoreLoaded(
    entry: RoundEntry,
    options: { keepLoaded?: boolean; registerTasks?: boolean } = {},
  ): SingleRoundStore | null {
    const store = entry.store ?? this.loadRoundStore(entry);
    if (!store) {
      return null;
    }
    if (options.registerTasks) {
      this.registerRoundTasks(entry);
    }
    if (!options.keepLoaded && entry.status !== "active") {
      // For read-only access, caller should handle persistence/unload.
    }
    return store;
  }

  private withRoundStore<T>(
    entry: RoundEntry,
    fn: (store: SingleRoundStore) => T,
    options: { keepLoaded?: boolean; registerTasks?: boolean } = {},
  ): T {
    const keepLoaded = options.keepLoaded ?? entry.status === "active";
    const registerTasks = options.registerTasks ?? keepLoaded;
    const store = this.ensureStoreLoaded(entry, { keepLoaded: true, registerTasks });
    if (!store) {
      throw new Error(`任务轮 ${entry.id} 当前不可用`);
    }

    let threw = false;
    try {
      const result = fn(store);
      this.updateCountsSnapshot(entry);
      this.updateProcessedSnapshot(entry);
      return result;
    } catch (error) {
      threw = true;
      throw error;
    } finally {
      if (!keepLoaded && !threw && entry.store) {
        if (entry.isDirty || !entry.hasPersisted) {
          this.persistRoundEntry(entry, { unload: true, deregister: registerTasks });
        } else {
          this.unloadRoundEntry(entry, { deregister: registerTasks });
        }
      }
    }
  }

  private buildCountsOnlyRunStats(entry: RoundEntry): RunStatistics {
    const counts = this.getCountsForEntry(entry);
    const hasTasks = counts.total > 0;
    const allCompleted =
      hasTasks &&
      counts.completed === counts.total &&
      counts.pending === 0 &&
      counts.processing === 0 &&
      counts.failed === 0;
    const startTime = hasTasks ? entry.createdAt : null;
    const endTime = allCompleted ? entry.completedAt ?? entry.activatedAt ?? entry.createdAt : null;
    const durationMs =
      startTime !== null && endTime !== null && endTime >= startTime ? endTime - startTime : null;
    const processed = entry.processedSnapshot;
    const totalItemNum = processed.totalItemNum;
    const totalRunningTime = processed.totalRunningTime;
    const averageItemSpeed =
      totalRunningTime > 0 ? totalItemNum / totalRunningTime : null;
    const averageTaskSpeed =
      durationMs && durationMs > 0 ? counts.completed / (durationMs / 1000) : null;
    const averageTimePerItem =
      totalItemNum > 0 ? totalRunningTime / totalItemNum : null;
    const averageTimePer100Items =
      averageTimePerItem !== null ? averageTimePerItem * 100 : null;

    return {
      hasTasks,
      allCompleted,
      totalTasks: counts.total,
      completedTasks: counts.completed,
      pendingTasks: counts.pending,
      processingTasks: counts.processing,
      failedTasks: counts.failed,
      startTime,
      endTime,
      durationMs,
      totalItemNum,
      totalRunningTime,
      averageTaskSpeed,
      averageItemSpeed,
      averageTimePerItem,
      averageTimePer100Items,
    };
  }

  private getEntry(roundId?: string): RoundEntry | null {
    if (roundId) {
      return this.rounds.get(roundId) ?? null;
    }
    return this.ensureActiveRound();
  }

  private ensureActiveRound(): RoundEntry | null {
    if (this.activeRoundId) {
      const entry = this.rounds.get(this.activeRoundId);
      if (entry) {
        this.refreshRoundStatus(entry);
        if (entry.status !== "completed") {
          return entry;
        }
        this.activeRoundId = null;
      } else {
        this.activeRoundId = null;
      }
    }

    for (const roundId of this.roundOrder) {
      const entry = this.rounds.get(roundId);
      if (!entry) continue;
      this.refreshRoundStatus(entry);
      if (entry.status === "completed") {
        continue;
      }
      return entry;
    }

    return null;
  }

  private refreshRoundStatus(entry: RoundEntry): TaskRoundLifecycle {
    const counts = this.getCountsForEntry(entry);
    const total = counts.total;
    const remainingWork = counts.pending + counts.processing;
    if (total === 0) {
      entry.status = "completed";
      entry.completedAt = entry.completedAt ?? Date.now();
      return entry.status;
    }
    if (remainingWork === 0) {
      entry.status = "completed";
      entry.completedAt = entry.completedAt ?? Date.now();
      if (this.activeRoundId === entry.id) {
        this.activeRoundId = null;
      }
      if (entry.store) {
        this.persistRoundEntry(entry, { unload: true, deregister: true });
      }
      return entry.status;
    }

    const hasProcessing = counts.processing > 0;
    const hasPending = counts.pending > 0;

    if (hasProcessing) {
      if (entry.status !== "active") {
        entry.status = "active";
        entry.activatedAt = entry.activatedAt ?? Date.now();
      }
      entry.completedAt = null;
      return entry.status;
    }

    if (entry.status === "active") {
      entry.status = "pending";
    } else if (entry.status === "completed") {
      entry.status = "pending";
    }

    if (hasPending) {
      entry.completedAt = null;
    }

    return entry.status;
  }

  private setActiveRoundInternal(roundId: string): RoundEntry | null {
    const entry = this.rounds.get(roundId);
    if (!entry) {
      return null;
    }
    if (this.activeRoundId && this.activeRoundId !== roundId) {
      const current = this.rounds.get(this.activeRoundId);
      if (current) {
        this.refreshRoundStatus(current);
        if (current.status === "active") {
          current.status = "pending";
        }
        if (current.store) {
          this.persistRoundEntry(current, { unload: true, deregister: true });
        }
      }
    }
    const store = this.ensureStoreLoaded(entry, { keepLoaded: true, registerTasks: true });
    if (!store) {
      return null;
    }
    this.activeRoundId = roundId;
    entry.status = "active";
    entry.activatedAt = entry.activatedAt ?? Date.now();
    entry.completedAt = null;
    return entry;
  }

  private prepareRoundForProcessing(entry: RoundEntry): RoundEntry | null {
    const store = this.ensureStoreLoaded(entry, { keepLoaded: true, registerTasks: true });
    if (!store) {
      return null;
    }
    if (!this.activeRoundId) {
      this.activeRoundId = entry.id;
    }
    return entry;
  }

  createRoundFromPaths(paths: string[], options: RoundCreationOptions): RoundCreationResult {
    const roundId = this.generateRoundId();
    const store = new SingleRoundStore(this.nodeStore);
    store.setRoundId(roundId);
    const enqueueResult = store.enqueueTasksFromPaths(paths);
    const sanitizedName = sanitizeRoundName(options.name) ?? roundId;

    const entry: RoundEntry = {
      id: roundId,
      name: sanitizedName,
      sourceType: options.sourceType,
      sourceHint: options.sourceHint,
      createdAt: Date.now(),
      activatedAt: null,
      completedAt: null,
      status: "pending",
      store,
      countsSnapshot: store.getCounts(),
      processedSnapshot: store.getProcessedSnapshot(),
      isDirty: true,
      hasPersisted: false,
    };

    this.rounds.set(roundId, entry);
    this.roundOrder.push(roundId);

    const counts = store.getCounts();
    entry.countsSnapshot = counts;
    this.refreshRoundStatus(entry);

    const shouldActivate =
      options.activate ?? (!this.activeRoundId && entry.status !== "completed");

    if (shouldActivate) {
      const activated = this.setActiveRoundInternal(roundId);
      if (!activated) {
        // 如果无法激活（例如持久化文件损坏），则退回为待激活状态并尝试持久化
        entry.status = "pending";
        entry.activatedAt = null;
        this.persistRoundEntry(entry, { unload: true, deregister: false });
      } else {
        entry.isDirty = true;
      }
    } else {
      this.persistRoundEntry(entry, { unload: true, deregister: false });
    }

    this.handleRoundsStateChange();

    return {
      roundId,
      name: entry.name,
      status: entry.status,
      createdAt: entry.createdAt,
      activatedAt: entry.activatedAt,
      completedAt: entry.completedAt,
      sourceType: entry.sourceType,
      sourceHint: entry.sourceHint,
      added: enqueueResult.added,
      skipped: enqueueResult.skipped,
      counts,
      processed: entry.processedSnapshot,
    };
  }

  listRounds(): TaskRoundSummary[] {
    const summaries: TaskRoundSummary[] = [];
    for (const roundId of this.roundOrder) {
      const entry = this.rounds.get(roundId);
      if (!entry) {
        continue;
      }
      this.refreshRoundStatus(entry);
      const counts = this.getCountsForEntry(entry);
      const processed = this.getProcessedSnapshotForEntry(entry);
      summaries.push({
        id: entry.id,
        name: entry.name,
        status: entry.status,
        createdAt: entry.createdAt,
        activatedAt: entry.activatedAt,
        completedAt: entry.completedAt,
        sourceType: entry.sourceType,
        sourceHint: entry.sourceHint,
        counts,
        processed,
      });
    }
    return summaries;
  }

  getRoundSummary(roundId: string): TaskRoundSummary | null {
    const entry = this.rounds.get(roundId);
    if (!entry) {
      return null;
    }
    this.refreshRoundStatus(entry);
    const counts = this.getCountsForEntry(entry);
    const processed = this.getProcessedSnapshotForEntry(entry);
    return {
      id: entry.id,
      name: entry.name,
      status: entry.status,
      createdAt: entry.createdAt,
      activatedAt: entry.activatedAt,
      completedAt: entry.completedAt,
      sourceType: entry.sourceType,
      sourceHint: entry.sourceHint,
      counts,
      processed,
    };
  }

  setActiveRound(
    roundId: string,
  ): { ok: boolean; reason?: "ROUND_NOT_FOUND" | "ROUND_COMPLETED" } {
    const entry = this.rounds.get(roundId);
    if (!entry) {
      return { ok: false, reason: "ROUND_NOT_FOUND" };
    }
    const status = this.refreshRoundStatus(entry);
    if (status === "completed") {
      return { ok: false, reason: "ROUND_COMPLETED" };
    }
    const activated = this.setActiveRoundInternal(roundId);
    if (!activated) {
      return { ok: false, reason: "ROUND_NOT_FOUND" };
    }
    return { ok: true };
  }

  getCounts(roundId?: string) {
    const entry = this.getEntry(roundId);
    return entry ? this.getCountsForEntry(entry) : { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 };
  }

  listTasksByStatus(
    status: TaskStatus | "all",
    page: number,
    pageSize: number,
    roundId?: string,
  ): PaginatedTasks {
    const entry = this.getEntry(roundId);
    if (!entry) {
      return { tasks: [], total: 0 };
    }
    const keepLoaded = entry.status === "active";
    try {
      return this.withRoundStore(
        entry,
        (store) => store.listTasksByStatus(status, page, pageSize),
        { keepLoaded, registerTasks: keepLoaded },
      );
    } catch (error) {
      console.error(`读取任务轮 ${entry.id} 的任务列表失败:`, error);
      return { tasks: [], total: 0 };
    }
  }

  getRunStatistics(roundId?: string): RunStatistics {
    const entry = this.getEntry(roundId);
    if (!entry) {
      return {
        hasTasks: false,
        allCompleted: false,
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        processingTasks: 0,
        failedTasks: 0,
        startTime: null,
        endTime: null,
        durationMs: null,
        totalItemNum: 0,
        totalRunningTime: 0,
        averageTaskSpeed: null,
        averageItemSpeed: null,
        averageTimePerItem: null,
        averageTimePer100Items: null,
      };
    }
    const keepLoaded = entry.status === "active";
    try {
      return this.withRoundStore(
        entry,
        (store) => store.getRunStatistics(),
        { keepLoaded, registerTasks: keepLoaded },
      );
    } catch (error) {
      console.error(`读取任务轮 ${entry.id} 的运行统计失败:`, error);
      return this.buildCountsOnlyRunStats(entry);
    }
  }

  getTasksForProcessing(batchSize: number, roundId?: string, nodeId?: string): TaskRecord[] {
    const safeBatchSize = Math.max(1, Math.floor(batchSize));
    const collected: TaskRecord[] = [];
    const processedRounds = new Set<string>();
    let shouldStopDistributing = false;

    const fetchFromEntry = (entry: RoundEntry | null, limit: number) => {
      if (!entry || processedRounds.has(entry.id)) {
        return;
      }
      this.refreshRoundStatus(entry);
      if (entry.status === "completed") {
        return;
      }
      const prepared = this.prepareRoundForProcessing(entry);
      if (!prepared) {
        return;
      }
      if (limit <= 0) {
        processedRounds.add(entry.id);
        return;
      }
      const tasks = this.withRoundStore(
        prepared,
        (store) => {
          const fetched = store.getTasksForProcessing(limit, nodeId);
          if (fetched.length > 0) {
            prepared.isDirty = true;
          }
          return fetched;
        },
        { keepLoaded: true, registerTasks: true },
      );
      for (const task of tasks) {
        this.taskIdToRoundId.set(task.id, prepared.id);
      }
      this.refreshRoundStatus(prepared);
      const countsAfterDistribution = this.getCountsForEntry(prepared);
      const hasFetchedTasks = tasks.length > 0;
      const hasRemainingPending = countsAfterDistribution.pending > 0;
      if (hasFetchedTasks) {
        this.activeRoundId = prepared.id;
      }
      if (hasFetchedTasks || hasRemainingPending) {
        shouldStopDistributing = true;
      }
      collected.push(...tasks);
      processedRounds.add(prepared.id);
    };

    if (roundId) {
      const entry = this.rounds.get(roundId);
      fetchFromEntry(entry ?? null, safeBatchSize);
      return collected.slice(0, safeBatchSize);
    }

    const activeEntry = this.ensureActiveRound();
    if (activeEntry) {
      fetchFromEntry(activeEntry, safeBatchSize - collected.length);
      if (shouldStopDistributing) {
        return collected.slice(0, safeBatchSize);
      }
    }

    if (collected.length >= safeBatchSize) {
      return collected.slice(0, safeBatchSize);
    }

    for (const roundKey of this.roundOrder) {
      if (shouldStopDistributing) {
        break;
      }
      if (collected.length >= safeBatchSize) {
        break;
      }
      const entry = this.rounds.get(roundKey);
      if (!entry || processedRounds.has(entry.id)) {
        continue;
      }
      const remaining = safeBatchSize - collected.length;
      fetchFromEntry(entry, remaining);
    }

    return collected.slice(0, safeBatchSize);
  }

  updateTaskStatus(
    taskId: string,
    success: boolean,
    message: string,
  ): { ok: true; status: TaskStatus } | { ok: false; reason: "TASK_NOT_FOUND" } {
    const roundId = this.taskIdToRoundId.get(taskId);
    if (!roundId) {
      return { ok: false, reason: "TASK_NOT_FOUND" };
    }
    const entry = this.rounds.get(roundId);
    if (!entry) {
      this.taskIdToRoundId.delete(taskId);
      return { ok: false, reason: "TASK_NOT_FOUND" };
    }
    try {
      const result = this.withRoundStore(
        entry,
        (store) => {
          const outcome = store.updateTaskStatus(taskId, success, message);
          if (outcome.ok) {
            entry.isDirty = true;
          } else if (outcome.reason === "TASK_NOT_FOUND") {
            this.taskIdToRoundId.delete(taskId);
          }
          return outcome;
        },
        { keepLoaded: true, registerTasks: true },
      );
      this.refreshRoundStatus(entry);
      this.handleRoundsStateChange();
      return result;
    } catch (error) {
      console.error(`更新任务 ${taskId} 状态失败:`, error);
      return { ok: false, reason: "TASK_NOT_FOUND" };
    }
  }

  failTimedOutTasks(timeoutMs: number, roundId?: string): number {
    if (roundId) {
      const entry = this.rounds.get(roundId);
      if (!entry) return 0;
      try {
        const keepLoaded = entry.status === "active";
        const count = this.withRoundStore(
          entry,
          (store) => {
            const failed = store.markTimedOutTasksAsFailed(timeoutMs);
            if (failed > 0) {
              entry.isDirty = true;
            }
            return failed;
          },
          { keepLoaded, registerTasks: keepLoaded },
        );
        this.refreshRoundStatus(entry);
        this.handleRoundsStateChange();
        return count;
      } catch (error) {
        console.error(`检查任务轮 ${entry.id} 超时任务失败:`, error);
        return 0;
      }
    }

    let total = 0;
    for (const entry of this.rounds.values()) {
      try {
        const keepLoaded = entry.status === "active";
        const count = this.withRoundStore(
          entry,
          (store) => {
            const failed = store.markTimedOutTasksAsFailed(timeoutMs);
            if (failed > 0) {
              entry.isDirty = true;
            }
            return failed;
          },
          { keepLoaded, registerTasks: keepLoaded },
        );
        total += count;
        this.refreshRoundStatus(entry);
      } catch (error) {
        console.error(`检查任务轮 ${entry.id} 超时任务失败:`, error);
      }
    }
    this.handleRoundsStateChange();
    return total;
  }

  inspectProcessingTasks(
    timeoutMs: number,
    roundId?: string,
  ): { selectedRound: TimeoutInspectionSummary | null; aggregate: TimeoutInspectionAggregate } {
    const summaries: TimeoutInspectionSummary[] = [];
    let selectedSummary: TimeoutInspectionSummary | null = null;
    const safeThreshold = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0;

    for (const entry of this.rounds.values()) {
      try {
        const keepLoaded = entry.status === "active";
        const summary = this.withRoundStore(
          entry,
          (store) => store.inspectProcessingTasks(safeThreshold),
          { keepLoaded, registerTasks: keepLoaded },
        );
        summaries.push(summary);
        if (roundId && entry.id === roundId) {
          selectedSummary = summary;
        }
      } catch (error) {
        console.error(`检查任务轮 ${entry.id} 的超时信息失败:`, error);
      }
    }

    if (roundId && !selectedSummary) {
      const entry = this.rounds.get(roundId);
      if (entry) {
        try {
          const keepLoaded = entry.status === "active";
          selectedSummary = this.withRoundStore(
            entry,
            (store) => store.inspectProcessingTasks(safeThreshold),
            { keepLoaded, registerTasks: keepLoaded },
          );
          summaries.push(selectedSummary);
        } catch (error) {
          console.error(`检查任务轮 ${entry.id} 的超时信息失败:`, error);
        }
      }
    }

    const inspectedAt = Date.now();
    const totalProcessing = summaries.reduce((sum, item) => sum + item.totalProcessing, 0);
    const timedOutCount = summaries.reduce((sum, item) => sum + item.timedOutCount, 0);
    const nearTimeoutCount = summaries.reduce((sum, item) => sum + item.nearTimeoutCount, 0);
    const longestDurationMs = summaries.reduce<number | null>((max, item) => {
      if (item.longestDurationMs === null) {
        return max;
      }
      if (max === null) {
        return item.longestDurationMs;
      }
      return Math.max(max, item.longestDurationMs);
    }, null);

    const topTimedOut = summaries
      .flatMap((item) => item.topTimedOut)
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);

    const topProcessing = summaries
      .flatMap((item) => item.topProcessing)
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);

    const aggregate: TimeoutInspectionAggregate = {
      thresholdMs: safeThreshold,
      inspectedAt,
      totalProcessing,
      timedOutCount,
      nearTimeoutCount,
      longestDurationMs,
      topTimedOut,
      topProcessing,
      roundSummaries: summaries,
    };

    const selectedRound = selectedSummary;
    return { selectedRound, aggregate };
  }

  recordNodeProcessedInfo(info: ProcessedInfo) {
    this.nodeStore.recordProcessedInfo(info);
    const entry = this.ensureActiveRound();
    if (!entry) {
      return;
    }

    const keepLoaded = true;
    try {
      this.withRoundStore(
        entry,
        (store) => {
          store.recordNodeProcessedInfo(info, false);
          entry.isDirty = true;
          return null;
        },
        { keepLoaded, registerTasks: keepLoaded },
      );
    } catch (error) {
      console.error("记录节点统计信息时更新当前任务轮失败:", error);
    }
  }

  getNodeStatsPage(
    page: number,
    pageSize: number,
    roundId?: string,
  ): { nodes: NodeStats[]; total: number; page: number } {
    if (roundId && !this.rounds.has(roundId)) {
      return { nodes: [], total: 0, page: 1 };
    }
    return this.nodeStore.listNodeStats(page, pageSize);
  }

  getNodeStatsSummary(roundId?: string): NodeStatsSummary | null {
    if (roundId && !this.rounds.has(roundId)) {
      return null;
    }
    return this.nodeStore.getSummarySnapshot();
  }

  getGlobalCompletionStats(): GlobalCompletionStats {
    const generatedAt = Date.now();
    if (this.rounds.size === 0) {
      return {
        totalRounds: 0,
        completedRounds: 0,
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        totalProcessedItems: 0,
        totalRunningTime: 0,
        averageTimePerItem: null,
        averageTimePer100Items: null,
        allRoundsCompleted: false,
        generatedAt,
      };
    }

    let totalTasks = 0;
    let completedTasks = 0;
    let failedTasks = 0;
    let totalProcessedItems = 0;
    let totalRunningTime = 0;
    let completedRounds = 0;

    for (const entry of this.rounds.values()) {
      this.refreshRoundStatus(entry);
      if (entry.status === "completed") {
        completedRounds += 1;
      }
      const counts = this.getCountsForEntry(entry);
      totalTasks += counts.total;
      completedTasks += counts.completed;
      failedTasks += counts.failed;

      const processed = this.getProcessedSnapshotForEntry(entry);
      totalProcessedItems += processed.totalItemNum;
      totalRunningTime += processed.totalRunningTime;
    }

    const averageTimePerItem =
      totalProcessedItems > 0 ? totalRunningTime / totalProcessedItems : null;
    const averageTimePer100Items =
      averageTimePerItem !== null ? averageTimePerItem * 100 : null;
    const allRoundsCompleted = completedRounds === this.rounds.size && this.rounds.size > 0;

    return {
      totalRounds: this.rounds.size,
      completedRounds,
      totalTasks,
      completedTasks,
      failedTasks,
      totalProcessedItems,
      totalRunningTime,
      averageTimePerItem,
      averageTimePer100Items,
      allRoundsCompleted,
      generatedAt,
    };
  }

  private formatCount(value: number): string {
    if (!Number.isFinite(value)) {
      return "0";
    }
    if (Number.isInteger(value)) {
      return this.numberFormatter.format(value);
    }
    return value.toFixed(2);
  }

  private formatSecondsForMessage(value: number | null): string {
    if (!Number.isFinite(value ?? NaN) || value === null) {
      return "-";
    }
    if (value <= 0) {
      return "0 秒";
    }
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const seconds = value - hours * 3600 - minutes * 60;
    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${hours} 小时`);
    }
    if (minutes > 0) {
      parts.push(`${minutes} 分`);
    }
    if (seconds > 0 || parts.length === 0) {
      const formattedSeconds = seconds >= 10 ? Math.round(seconds).toString() : seconds.toFixed(2);
      parts.push(`${formattedSeconds} 秒`);
    }
    return parts.join(" ");
  }

  private buildCompletionDigest(stats: GlobalCompletionStats): string {
    return JSON.stringify({
      totalRounds: stats.totalRounds,
      completedRounds: stats.completedRounds,
      totalTasks: stats.totalTasks,
      completedTasks: stats.completedTasks,
      failedTasks: stats.failedTasks,
      totalProcessedItems: Number(stats.totalProcessedItems.toFixed(2)),
      totalRunningTime: Number(stats.totalRunningTime.toFixed(2)),
    });
  }

  private buildFeishuMessage(stats: GlobalCompletionStats): string {
    const lines = [
      "任务轮全部完成 ✅",
      `完成进度：${this.formatCount(stats.completedRounds)} / ${this.formatCount(stats.totalRounds)}`,
      `任务完成：成功 ${this.formatCount(stats.completedTasks)} / 总计 ${this.formatCount(stats.totalTasks)}`,
      `任务失败：${this.formatCount(stats.failedTasks)}`,
      `节点累计运行时长：${this.formatSecondsForMessage(stats.totalRunningTime)}`,
      `累计处理项数：${this.formatCount(stats.totalProcessedItems)}`,
      `平均每项耗时：${this.formatSecondsForMessage(stats.averageTimePerItem)}`,
      `平均每100项耗时：${this.formatSecondsForMessage(stats.averageTimePer100Items)}`,
      `统计时间：${new Date(stats.generatedAt).toLocaleString()}`,
    ];
    return lines.join("\n");
  }

  private handleRoundsStateChange() {
    const stats = this.getGlobalCompletionStats();
    if (!stats.allRoundsCompleted) {
      this.completionDigest = null;
      return;
    }

    const digest = this.buildCompletionDigest(stats);
    if (this.completionDigest === digest) {
      return;
    }
    this.completionDigest = digest;

    const webhookUrl = getFeishuWebhookUrl();
    if (!webhookUrl) {
      return;
    }

    void this.sendFeishuCompletionNotification(stats, webhookUrl);
  }

  private async sendFeishuCompletionNotification(
    stats: GlobalCompletionStats,
    webhookUrl: string,
  ): Promise<void> {
    if (!webhookUrl) {
      return;
    }
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          msg_type: "text",
          content: {
            text: this.buildFeishuMessage(stats),
          },
        }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("发送飞书通知失败:", response.status, errorText);
      }
    } catch (error) {
      console.error("发送飞书通知异常:", error);
    }
  }

  clearNodeStats(roundId?: string): { cleared: number } {
    if (roundId && !this.rounds.has(roundId)) {
      return { cleared: 0 };
    }
    return this.nodeStore.clearAll();
  }

  deleteNodeStats(nodeId: string, roundId?: string): { deleted: boolean } {
    if (!nodeId) {
      return { deleted: false };
    }
    if (roundId && !this.rounds.has(roundId)) {
      return { deleted: false };
    }
    return this.nodeStore.deleteNode(nodeId);
  }

  findTaskByIdOrPath(
    query: string,
    roundId?: string,
  ): { task: TaskRecord; roundId: string } | null {
    if (roundId) {
      const entry = this.rounds.get(roundId);
      if (!entry) {
        return null;
      }
      const keepLoaded = entry.status === "active";
      try {
        return this.withRoundStore(
          entry,
          (store) => {
            const task = store.findTaskByIdOrPath(query);
            return task ? { task, roundId: entry.id } : null;
          },
          { keepLoaded, registerTasks: keepLoaded },
        );
      } catch (error) {
        console.error(`查找任务轮 ${entry.id} 中的任务失败:`, error);
        return null;
      }
    }

    const visited = new Set<string>();
    const mappedRound = this.taskIdToRoundId.get(query);
    if (mappedRound) {
      const entry = this.rounds.get(mappedRound);
      if (entry) {
        visited.add(entry.id);
        const keepLoaded = entry.status === "active";
        try {
          const result = this.withRoundStore(
            entry,
            (store) => {
              const task = store.findTaskByIdOrPath(query);
              return task ? { task, roundId: entry.id } : null;
            },
            { keepLoaded, registerTasks: keepLoaded },
          );
          if (result) {
            return result;
          }
        } catch (error) {
          console.error(`查找任务轮 ${entry.id} 中的任务失败:`, error);
        }
      }
    }

    for (const entry of this.rounds.values()) {
      if (visited.has(entry.id)) {
        continue;
      }
      const keepLoaded = entry.status === "active";
      try {
        const result = this.withRoundStore(
          entry,
          (store) => {
            const task = store.findTaskByIdOrPath(query);
            return task ? { task, roundId: entry.id } : null;
          },
          { keepLoaded, registerTasks: keepLoaded },
        );
        if (result) {
          return result;
        }
      } catch (error) {
        console.error(`查找任务轮 ${entry.id} 中的任务失败:`, error);
      }
    }
    return null;
  }

  clearRound(roundId: string): { ok: boolean; cleared: number } {
    const entry = this.rounds.get(roundId);
    if (!entry) {
      return { ok: false, cleared: 0 };
    }
    let cleared = 0;
    const store = entry.store ?? this.loadRoundStore(entry);

    if (store) {
      const counts = store.getCounts();
      cleared = counts.total;
      this.unregisterRoundTasks(entry);
      store.clearAllTasks();
      entry.countsSnapshot = store.getCounts();
      entry.processedSnapshot = store.getProcessedSnapshot();
      entry.isDirty = true;
    } else {
      cleared = entry.countsSnapshot.total;
    }

    try {
      const filePath = getRoundFilePath(roundId);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`删除任务轮 ${roundId} 的持久化文件失败:`, error);
    }
    for (const [taskId, mappedRoundId] of [...this.taskIdToRoundId.entries()]) {
      if (mappedRoundId === roundId) {
        this.taskIdToRoundId.delete(taskId);
      }
    }

    this.rounds.delete(roundId);
    this.roundOrder = this.roundOrder.filter((id) => id !== roundId);
    if (this.activeRoundId === roundId) {
      this.activeRoundId = null;
      this.ensureActiveRound();
    }

    this.handleRoundsStateChange();

    return { ok: true, cleared };
  }

  getActiveRoundId(): string | null {
    return this.ensureActiveRound()?.id ?? null;
  }

  clearAllRounds(): number {
    let cleared = 0;
    for (const [roundId, entry] of [...this.rounds.entries()]) {
      const store = entry.store ?? this.loadRoundStore(entry);
      if (store) {
        const counts = store.getCounts();
        cleared += counts.total;
        this.unregisterRoundTasks(entry);
        store.clearAllTasks();
        entry.countsSnapshot = store.getCounts();
        entry.processedSnapshot = store.getProcessedSnapshot();
      } else {
        cleared += entry.countsSnapshot.total;
      }
      try {
        const filePath = getRoundFilePath(roundId);
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      } catch (error) {
        console.error(`删除任务轮 ${roundId} 的持久化文件失败:`, error);
      }
      this.rounds.delete(roundId);
    }
    this.roundOrder = [];
    this.taskIdToRoundId.clear();
    this.activeRoundId = null;
    this.handleRoundsStateChange();
    return cleared;
  }
}

declare global {
  var __TASK_STORE__: TaskStore | undefined;
}

export const taskStore: TaskStore =
  globalThis.__TASK_STORE__ ?? (globalThis.__TASK_STORE__ = new TaskStore());


