import { randomUUID } from "crypto";

export type TaskStatus = "pending" | "processing" | "completed" | "failed";

export interface TaskRecord {
  id: string;
  path: string;
  status: TaskStatus;
  failureCount: number;
  message?: string;
  createdAt: number;
  updatedAt: number;
  processingStartedAt?: number;
}

export interface PaginatedTasks {
  tasks: TaskRecord[];
  total: number;
}

interface EnqueueResult {
  added: number;
  skipped: number;
}

export interface NodeStats {
  nodeId: string;
  totalItemNum: number;
  totalRunningTime: number;
  recordCount: number;
  avgSpeed: number; // items per second
  lastUpdated: number;
}

export interface ProcessedInfo {
  node_id: string;
  item_num: number;
  running_time: number;
}

class TaskStore {
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

  // Node statistics
  private nodeStats = new Map<string, NodeStats>();

  enqueueTasksFromPaths(paths: string[]): EnqueueResult {
    let added = 0;
    let skipped = 0;

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
    }

    return { added, skipped };
  }

  getTasksForProcessing(batchSize: number): TaskRecord[] {
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

      this.processingSet.add(task.id);
      this.processingStartedAt.set(task.id, task.processingStartedAt);

      results.push({ ...task });
    }

    return results;
  }

  updateTaskStatus(taskId: string, success: boolean, message: string, failureThreshold: number) {
    const task = this.tasks.get(taskId);

    if (!task) {
      return { ok: false as const, reason: "TASK_NOT_FOUND" as const };
    }

    this.processingSet.delete(taskId);
    this.processingStartedAt.delete(taskId);

    task.updatedAt = Date.now();
    task.message = message || undefined;

    if (success) {
      task.status = "completed";
      task.failureCount = 0;
      task.processingStartedAt = undefined;

      if (!this.completedSet.has(taskId)) {
        this.completedSet.add(taskId);
        this.completedList.unshift(taskId);
      }

      return { ok: true as const, status: task.status };
    }

    task.failureCount += 1;
    task.processingStartedAt = undefined;

    if (task.failureCount >= failureThreshold) {
      task.status = "failed";
      if (!this.failedSet.has(taskId)) {
        this.failedSet.add(taskId);
        this.failedList.unshift(taskId);
      }
      return { ok: true as const, status: task.status };
    }

    task.status = "pending";
    this.enqueuePending(taskId);

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

  checkAndRequeueTimedOutTasks(timeoutMs: number): number {
    const now = Date.now();
    let requeuedCount = 0;

    for (const taskId of [...this.processingSet]) {
      const task = this.tasks.get(taskId);
      const startedAt = this.processingStartedAt.get(taskId);

      if (!task || !startedAt) {
        continue;
      }

      if (now - startedAt > timeoutMs) {
        task.status = "pending";
        task.processingStartedAt = undefined;
        task.updatedAt = now;
        this.enqueuePending(taskId);
        this.processingSet.delete(taskId);
        this.processingStartedAt.delete(taskId);
        requeuedCount += 1;
      }
    }

    return requeuedCount;
  }

  recordNodeProcessedInfo(info: ProcessedInfo): void {
    const existing = this.nodeStats.get(info.node_id);
    const now = Date.now();

    if (existing) {
      existing.totalItemNum += info.item_num;
      existing.totalRunningTime += info.running_time;
      existing.recordCount += 1;
      existing.avgSpeed =
        existing.totalRunningTime > 0 ? existing.totalItemNum / existing.totalRunningTime : 0;
      existing.lastUpdated = now;
    } else {
      const avgSpeed = info.running_time > 0 ? info.item_num / info.running_time : 0;
      this.nodeStats.set(info.node_id, {
        nodeId: info.node_id,
        totalItemNum: info.item_num,
        totalRunningTime: info.running_time,
        recordCount: 1,
        avgSpeed,
        lastUpdated: now,
      });
    }
  }

  getAllNodeStats(): NodeStats[] {
    return [...this.nodeStats.values()].sort((a, b) => b.lastUpdated - a.lastUpdated);
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
}

declare global {
  var __TASK_STORE__: TaskStore | undefined;
}

export const taskStore: TaskStore =
  globalThis.__TASK_STORE__ ?? (globalThis.__TASK_STORE__ = new TaskStore());


