import type { TaskRoundLifecycle, TaskStatus } from "./types";

export const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "pending", label: "未处理" },
  { value: "processing", label: "处理中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "all", label: "全部" },
];

export const ROUND_STATUS_LABELS: Record<TaskRoundLifecycle, string> = {
  pending: "待执行",
  active: "进行中",
  completed: "已完成",
};

export const ROUND_STATUS_BADGES: Record<TaskRoundLifecycle, string> = {
  pending: "bg-slate-100 text-slate-600",
  active: "bg-emerald-100 text-emerald-700",
  completed: "bg-slate-200 text-slate-600",
};

export const TASK_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
export const ROUND_PAGE_SIZE_OPTIONS = [5, 10, 20];
export const NODE_PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

export const statusBadgeStyles: Record<TaskStatus, string> = {
  pending: "bg-amber-100 text-amber-600",
  processing: "bg-sky-100 text-sky-600",
  completed: "bg-emerald-100 text-emerald-600",
  failed: "bg-rose-100 text-rose-600",
  all: "bg-slate-200 text-slate-600",
};

