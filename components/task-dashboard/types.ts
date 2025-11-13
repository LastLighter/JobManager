export type TaskStatus = "pending" | "processing" | "completed" | "failed" | "all";

export interface SummaryCounts {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface RoundStatsSummary {
  totalRounds: number;
  statusCounts: {
    pending: number;
    active: number;
    completed: number;
  };
  aggregateTaskCounts: SummaryCounts;
}

export interface RoundPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  selectedRoundPage: number | null;
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

export interface TimeoutInspectionRoundSummary {
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

export interface TimeoutMetricsPayload {
  thresholdMs: number;
  inspectedAt: number;
  totalProcessing: number;
  timedOutCount: number;
  nearTimeoutCount: number;
  longestDurationMs: number | null;
  topTimedOut: TimeoutInspectionTaskInfo[];
  topProcessing: TimeoutInspectionTaskInfo[];
  roundSummaries: TimeoutInspectionRoundSummary[];
  selectedRound: TimeoutInspectionRoundSummary | null;
}

export type TaskRoundLifecycle = "pending" | "active" | "completed";

export interface TaskRoundSummary {
  id: string;
  name: string;
  status: TaskRoundLifecycle;
  createdAt: number;
  activatedAt: number | null;
  completedAt: number | null;
  sourceType: string;
  sourceHint?: string;
  counts: SummaryCounts;
}

export interface TaskItem {
  id: string;
  roundId?: string;
  path: string;
  status: TaskStatus;
  failureCount: number;
  message: string;
  updatedAt: number;
  createdAt: number;
  processingStartedAt: number | null;
  processingNodeId: string | null;
}

export interface RunStats {
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
}

export interface SummaryResponse {
  status: TaskStatus;
  page: number;
  pageSize: number;
  total: number;
  counts: SummaryCounts;
  tasks: TaskItem[];
  runStats: RunStats;
  rounds: TaskRoundSummary[];
  currentRoundId: string | null;
  roundStats?: RoundStatsSummary;
  roundPagination: RoundPagination;
  timeoutMetrics: TimeoutMetricsPayload;
  timeoutMs: number;
}

export interface NodePerformanceRecordItem {
  timestamp: number;
  itemNum: number;
  runningTime: number;
  speed: number;
}

export interface NodeStatsItem {
  nodeId: string;
  totalItemNum: number;
  totalRunningTime: number;
  recordCount: number;
  avgSpeed: number;
  lastUpdated: number;
  recentRecords: NodePerformanceRecordItem[];
  requestCount: number;
  assignedTaskCount: number;
  activeTaskCount: number;
  activeTaskIds: string[];
}

export interface NodeStatsSummary {
  nodeCount: number;
  totalItemNum: number;
  totalRunningTime: number;
  recordCount: number;
  averageSpeed: number | null;
  averageRunningTime: number | null;
  averageItemNum: number | null;
  totalRequests: number;
  totalAssignedTasks: number;
  totalActiveTasks: number;
}

export interface AggregatedPerformanceRecord {
  startTimestamp: number;
  endTimestamp: number;
  avgSpeed: number;
  totalItemNum: number;
  totalRunningTime: number;
  count: number;
}

