"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TaskStatus = "pending" | "processing" | "completed" | "failed" | "all";

interface SummaryCounts {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

interface TaskItem {
  id: string;
  path: string;
  status: TaskStatus;
  failureCount: number;
  message: string;
  updatedAt: number;
  createdAt: number;
  processingStartedAt: number | null;
}

interface RunStats {
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

interface SummaryResponse {
  status: TaskStatus;
  page: number;
  pageSize: number;
  total: number;
  counts: SummaryCounts;
  tasks: TaskItem[];
  runStats: RunStats;
}

interface NodePerformanceRecordItem {
  timestamp: number;
  itemNum: number;
  runningTime: number;
  speed: number;
}

interface NodeStatsItem {
  nodeId: string;
  totalItemNum: number;
  totalRunningTime: number;
  recordCount: number;
  avgSpeed: number;
  lastUpdated: number;
  recentRecords: NodePerformanceRecordItem[];
}

interface AggregatedPerformanceRecord {
  startTimestamp: number;
  endTimestamp: number;
  avgSpeed: number;
  totalItemNum: number;
  totalRunningTime: number;
  count: number;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "未处理" },
  { value: "processing", label: "处理中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "all", label: "全部" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const statusBadgeStyles: Record<TaskStatus, string> = {
  pending: "bg-amber-100 text-amber-600",
  processing: "bg-sky-100 text-sky-600",
  completed: "bg-emerald-100 text-emerald-600",
  failed: "bg-rose-100 text-rose-600",
  all: "bg-slate-200 text-slate-600",
};

function formatDate(timestamp: number | null | undefined) {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null || milliseconds < 0) {
    return "-";
  }
  const totalSecondsPrecise = milliseconds / 1000;
  const hours = Math.floor(totalSecondsPrecise / 3600);
  const minutes = Math.floor((totalSecondsPrecise % 3600) / 60);
  const seconds = totalSecondsPrecise - hours * 3600 - minutes * 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} 小时`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} 分`);
  }
  if (seconds > 0 || parts.length === 0) {
    const secondText = seconds >= 10 ? Math.round(seconds).toString() : seconds.toFixed(2);
    parts.push(`${secondText} 秒`);
  }
  return parts.join(" ");
}

function formatSeconds(seconds: number | null) {
  if (seconds === null || seconds < 0) {
    return "-";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds - hours * 3600 - minutes * 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} 小时`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} 分`);
  }
  if (remainingSeconds > 0 || parts.length === 0) {
    const secondText =
      remainingSeconds >= 10 ? Math.round(remainingSeconds).toString() : remainingSeconds.toFixed(2);
    parts.push(`${secondText} 秒`);
  }
  return parts.join(" ");
}

function formatSpeed(value: number | null, unit: string) {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) {
    return "-";
  }
  const precision = value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${unit}`;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return Number(value).toLocaleString();
}

function groupRecordsForTrend(
  records: NodePerformanceRecordItem[],
  groupSize = 6,
): AggregatedPerformanceRecord[] {
  if (!records.length) {
    return [];
  }

  const effectiveGroupSize = Math.max(1, groupSize);
  const groups: AggregatedPerformanceRecord[] = [];

  for (let index = 0; index < records.length; index += effectiveGroupSize) {
    const slice = records.slice(index, index + effectiveGroupSize);
    if (slice.length === 0) {
      continue;
    }

    const totalItemNum = slice.reduce((sum, record) => sum + record.itemNum, 0);
    const totalRunningTime = slice.reduce((sum, record) => sum + record.runningTime, 0);
    const avgSpeed =
      totalRunningTime > 0
        ? totalItemNum / totalRunningTime
        : slice.reduce((sum, record) => sum + record.speed, 0) / slice.length;

    groups.push({
      startTimestamp: slice[0].timestamp,
      endTimestamp: slice[slice.length - 1].timestamp,
      avgSpeed: Number.isFinite(avgSpeed) ? avgSpeed : 0,
      totalItemNum,
      totalRunningTime,
      count: slice.length,
    });
  }

  return groups;
}

export function TaskDashboard() {
  const [statusFilter, setStatusFilter] = useState<TaskStatus>("pending");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showCompletionSummary, setShowCompletionSummary] = useState(false);

  const [textAreaValue, setTextAreaValue] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Timeout settings
  const [timeoutMinutes, setTimeoutMinutes] = useState(5);
  const [autoCheckInterval, setAutoCheckInterval] = useState(1); // minutes

  // Node stats
  const [nodeStats, setNodeStats] = useState<NodeStatsItem[]>([]);
  const [nodeStatsLoading, setNodeStatsLoading] = useState(false);
  const [nodeStatsError, setNodeStatsError] = useState<string | null>(null);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeStatsItem | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<TaskItem | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Copy feedback
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Batch size configuration
  const [defaultBatchSize, setDefaultBatchSize] = useState(10);
  const [maxBatchSize, setMaxBatchSize] = useState(1000);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const totalPages = useMemo(() => {
    if (!summary || summary.total === 0) return 1;
    return Math.max(1, Math.ceil(summary.total / summary.pageSize));
  }, [summary]);

  const fetchSummary = useCallback(
    async (opts?: { keepPage?: boolean }) => {
      try {
        setLoading(true);
        setError(null);

        const nextPage = opts?.keepPage ? page : 1;
        if (!opts?.keepPage) {
          setPage(1);
        }

        const response = await fetch(
          `/api/tasks/summary?status=${statusFilter}&page=${nextPage}&pageSize=${pageSize}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = (await response.json()) as SummaryResponse;
        setSummary(data);
        if (data.page !== page) {
          setPage(data.page);
        }
      } catch (err) {
        console.error("获取任务汇总失败", err);
        setError("获取任务数据失败，请稍后重试。");
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, page, pageSize],
  );

  const fetchNodeStats = useCallback(async () => {
    try {
      setNodeStatsLoading(true);
      setNodeStatsError(null);
      const response = await fetch("/api/tasks/node_stats", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      setNodeStats(Array.isArray(data.nodes) ? data.nodes : []);
    } catch (err) {
      console.error("获取节点统计失败", err);
      setNodeStatsError("获取节点统计失败，请稍后重试。");
    } finally {
      setNodeStatsLoading(false);
    }
  }, []);

  const fetchBatchSizeConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks/config", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setDefaultBatchSize(data.defaultBatchSize);
        setMaxBatchSize(data.maxBatchSize);
      }
    } catch (err) {
      console.error("获取批次大小配置失败", err);
    }
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedText(text);
        setTimeout(() => setCopiedText(null), 2000);
      })
      .catch((err) => {
        console.error("复制失败", err);
        setError("复制失败，请手动复制。");
      });
  }, []);

  const checkTimeoutTasks = useCallback(async () => {
    try {
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const response = await fetch("/api/tasks/check_timeout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ timeoutMs }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.requeuedCount > 0) {
          console.log(`自动检查：已将 ${result.requeuedCount} 个超时任务重新加入队列`);
          // Silently refresh the summary
          await fetchSummary({ keepPage: true });
        }
      }
    } catch (err) {
      console.error("自动检查超时任务失败", err);
    }
  }, [timeoutMinutes, fetchSummary]);

  useEffect(() => {
    fetchSummary({ keepPage: true });
    fetchBatchSizeConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, pageSize, page]);

  useEffect(() => {
    fetchNodeStats();
    const interval = window.setInterval(() => {
      fetchNodeStats();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [fetchNodeStats]);

  useEffect(() => {
    if (summary?.runStats?.allCompleted) {
      setShowCompletionSummary(true);
    } else {
      setShowCompletionSummary(false);
    }
  }, [summary?.runStats?.allCompleted]);

  useEffect(() => {
    if (!selectedNode) {
      return;
    }
    const updatedNode = nodeStats.find((node) => node.nodeId === selectedNode.nodeId);
    if (!updatedNode) {
      setSelectedNode(null);
      return;
    }
    if (updatedNode !== selectedNode) {
      setSelectedNode(updatedNode);
    }
  }, [nodeStats, selectedNode]);

  // Auto check timeout tasks periodically
  useEffect(() => {
    if (autoCheckInterval > 0) {
      // Initial check
      checkTimeoutTasks();

      // Set up interval
      const intervalMs = autoCheckInterval * 60 * 1000;
      const timer = setInterval(() => {
        checkTimeoutTasks();
      }, intervalMs);

      return () => clearInterval(timer);
    }
  }, [autoCheckInterval, checkTimeoutTasks]);

  const handlePageChange = (direction: "prev" | "next") => {
    if (!summary) return;
    if (direction === "prev" && page > 1) {
      setPage((prev) => Math.max(prev - 1, 1));
    }
    if (direction === "next" && page < totalPages) {
      setPage((prev) => Math.min(prev + 1, totalPages));
    }
  };

  const resetPageAndFetch = (nextStatus: TaskStatus) => {
    setStatusFilter(nextStatus);
    setPage(1);
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setInfoMessage(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/tasks/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = await response.json();
      setInfoMessage(`成功导入 ${result.added} 条任务，跳过 ${result.skipped} 条。`);

      await fetchSummary({ keepPage: true });
    } catch (err) {
      console.error("导入文件失败", err);
      setError("导入文件失败，请检查文件格式。");
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  const handleTextSubmit = async () => {
    if (!textAreaValue.trim()) {
      setError("请输入至少一条文件路径。");
      return;
    }

    setIsImporting(true);
    setInfoMessage(null);
    setError(null);

    try {
      const paths = textAreaValue
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const response = await fetch("/api/tasks/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paths }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = await response.json();
      setInfoMessage(`成功导入 ${result.added} 条任务，跳过 ${result.skipped} 条。`);
      setTextAreaValue("");
      await fetchSummary({ keepPage: true });
    } catch (err) {
      console.error("导入文本失败", err);
      setError("导入失败，请检查文本格式。");
    } finally {
      setIsImporting(false);
    }
  };


  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchError("请输入任务ID或文件路径。");
      return;
    }

    setIsSearching(true);
    setSearchResult(null);
    setSearchError(null);

    try {
      const response = await fetch(
        `/api/tasks/search?query=${encodeURIComponent(searchQuery.trim())}`,
        { cache: "no-store" },
      );

      const data = await response.json();

      if (!response.ok || !data.found) {
        setSearchError(data.error || "未找到匹配的任务。");
        return;
      }

      setSearchResult(data.task);
    } catch (err) {
      console.error("查询失败", err);
      setSearchError("查询失败，请稍后重试。");
    } finally {
      setIsSearching(false);
    }
  };

  const handleRefresh = async () => {
    await fetchSummary({ keepPage: true });
  };

  const handleClearAllTasks = async () => {
    const confirmed = window.confirm(
      "确定要清除所有任务吗？此操作不可撤销。\n\n" +
      `当前共有 ${summary?.counts.total ?? 0} 个任务。`
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      const response = await fetch("/api/tasks/clear", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = await response.json();
      setInfoMessage(`成功清除了 ${result.cleared} 个任务。`);
      setSelectedNode(null);
      await fetchSummary({ keepPage: false });
    } catch (err) {
      console.error("清除任务失败", err);
      setError("清除任务失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleClearNodeStats = async () => {
    const confirmed = window.confirm(
      "确定要清除所有节点统计数据吗？此操作不可撤销。\n\n" +
      `当前共有 ${nodeStats.length} 个节点。`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setNodeStatsLoading(true);
      setNodeStatsError(null);
      const response = await fetch("/api/tasks/node_stats", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const result = await response.json();
      setInfoMessage(`已清除 ${result.cleared ?? 0} 个节点的统计数据。`);
      await fetchNodeStats();
    } catch (err) {
      console.error("清除节点统计失败", err);
      setNodeStatsError("清除节点统计失败，请稍后重试。");
    } finally {
      setNodeStatsLoading(false);
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    const confirmed = window.confirm("确定要删除该节点的统计数据吗？此操作不可撤销。");
    if (!confirmed) {
      return;
    }

    try {
      setDeletingNodeId(nodeId);
      setNodeStatsError(null);
      const response = await fetch(`/api/tasks/node_stats/${encodeURIComponent(nodeId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setInfoMessage(`已删除节点 ${nodeId} 的统计数据。`);
      await fetchNodeStats();
    } catch (err) {
      console.error("删除节点统计失败", err);
      setNodeStatsError("删除节点统计失败，请稍后重试。");
    } finally {
      setDeletingNodeId(null);
    }
  };

  const handleViewNodeDetails = (node: NodeStatsItem) => {
    setSelectedNode(node);
  };

  const handleCloseNodeDetails = () => {
    setSelectedNode(null);
  };

  const handleSaveBatchSizeConfig = async () => {
    if (defaultBatchSize < 1 || defaultBatchSize > maxBatchSize) {
      setError(`默认批次大小必须在 1 到 ${maxBatchSize} 之间`);
      return;
    }

    if (maxBatchSize < 1) {
      setError("最大批次大小必须大于 0");
      return;
    }

    setIsSavingConfig(true);
    setError(null);
    setInfoMessage(null);

    try {
      const response = await fetch("/api/tasks/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          defaultBatchSize,
          maxBatchSize,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "保存失败");
      }

      const result = await response.json();
      setDefaultBatchSize(result.defaultBatchSize);
      setMaxBatchSize(result.maxBatchSize);
      setInfoMessage("批次大小配置已保存");
    } catch (err) {
      console.error("保存批次大小配置失败", err);
      setError(err instanceof Error ? err.message : "保存配置失败，请稍后重试。");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const currentTasks = summary?.tasks ?? [];
  const nodeCount = nodeStats.length;

  if (summary?.runStats?.allCompleted && showCompletionSummary) {
    return (
      <CompletionSummary
        runStats={summary.runStats}
        counts={summary.counts}
        onViewDashboard={() => setShowCompletionSummary(false)}
        onClearAllTasks={handleClearAllTasks}
        isClearing={loading}
        infoMessage={infoMessage}
        errorMessage={error}
      />
    );
  }

  return (
    <>
      {selectedNode && <NodeDetailModal node={selectedNode} onClose={handleCloseNodeDetails} />}
      <div className="min-h-screen bg-slate-50 py-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6">
          <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-slate-900">任务调度管理系统</h1>
          <p className="text-sm text-slate-600">
            支持批量导入文件路径，分配任务执行节点，并实时监控任务状态。
          </p>
        </header>

        {copiedText && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
            ✓ 已复制到剪贴板
          </div>
        )}

        {infoMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {infoMessage}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-5">
          <SummaryCard title="总任务量" value={summary?.counts.total ?? 0} accent="bg-slate-900" />
          <SummaryCard title="未处理" value={summary?.counts.pending ?? 0} accent="bg-amber-500" />
          <SummaryCard
            title="处理中"
            value={summary?.counts.processing ?? 0}
            accent="bg-sky-500"
          />
          <SummaryCard
            title="已完成"
            value={summary?.counts.completed ?? 0}
            accent="bg-emerald-500"
          />
          <SummaryCard title="失败" value={summary?.counts.failed ?? 0} accent="bg-rose-500" />
        </section>

        {/* Task Search */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">任务查询</h2>
          <div className="flex flex-col gap-4 md:flex-row">
            <input
              type="text"
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="输入任务ID或文件路径..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
            />
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:bg-slate-400"
              onClick={handleSearch}
              disabled={isSearching}
            >
              {isSearching ? "查询中..." : "查询"}
            </button>
          </div>

          {searchError && (
            <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {searchError}
            </div>
          )}

          {searchResult && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-600">任务ID:</span>
                  <div className="flex items-center gap-2">
                    <span className="max-w-md truncate text-slate-900">{searchResult.id}</span>
                    <button
                      type="button"
                      className="rounded px-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                      onClick={() => copyToClipboard(searchResult.id)}
                      title="复制ID"
                    >
                      📋
                    </button>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-600">文件路径:</span>
                  <div className="flex items-center gap-2">
                    <span className="max-w-md truncate text-slate-900">{searchResult.path}</span>
                    <button
                      type="button"
                      className="rounded px-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                      onClick={() => copyToClipboard(searchResult.path)}
                      title="复制路径"
                    >
                      📋
                    </button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-slate-600">状态:</span>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeStyles[searchResult.status]}`}
                  >
                    {STATUS_OPTIONS.find((o) => o.value === searchResult.status)?.label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-slate-600">失败次数:</span>
                  <span className="text-slate-900">{searchResult.failureCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-slate-600">更新时间:</span>
                  <span className="text-slate-900">{formatDate(searchResult.updatedAt)}</span>
                </div>
                {searchResult.message && (
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-600">备注:</span>
                    <span className="max-w-md truncate text-slate-900">{searchResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Timeout Management */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            自动超时管理
            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              已启用
            </span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">超时时间</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="1440"
                  className="w-24 rounded border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={timeoutMinutes}
                  onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
                />
                <span className="text-sm text-slate-600">分钟</span>
              </div>
              <p className="text-xs text-slate-500">
                超过此时间的&ldquo;处理中&rdquo;任务将自动重新加入未处理队列
              </p>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">检查间隔</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="60"
                  className="w-24 rounded border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={autoCheckInterval}
                  onChange={(e) => setAutoCheckInterval(Number(e.target.value))}
                />
                <span className="text-sm text-slate-600">分钟</span>
              </div>
              <p className="text-xs text-slate-500">系统每隔此时间自动检查一次超时任务</p>
            </label>
          </div>
        </section>

        {/* Node Statistics */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">节点统计</h2>
              <p className="text-sm text-slate-500">当前节点数量：{nodeCount}</p>
              <p className="text-xs text-slate-400">系统仅保留最近 2 小时内的节点统计记录。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={fetchNodeStats}
                disabled={nodeStatsLoading}
              >
                {nodeStatsLoading ? "刷新中..." : "刷新节点数据"}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleClearNodeStats}
                disabled={nodeStatsLoading || nodeCount === 0}
              >
                清除节点数据
              </button>
            </div>
          </div>

          {nodeStatsError && (
            <div className="mb-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {nodeStatsError}
            </div>
          )}

          <div className="overflow-x-auto">
            {nodeStatsLoading && nodeCount === 0 ? (
              <p className="text-sm text-slate-500">节点数据加载中...</p>
            ) : nodeCount === 0 ? (
              <p className="text-sm text-slate-500">暂无节点统计数据</p>
            ) : (
              <table className="min-w-full table-auto border-collapse text-left text-sm text-slate-700">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">节点ID</th>
                    <th className="px-4 py-3">总处理量</th>
                    <th className="px-4 py-3">总运行时间 (秒)</th>
                    <th className="px-4 py-3">记录次数</th>
                    <th className="px-4 py-3">平均速度 (项/秒)</th>
                    <th className="px-4 py-3">最近速度 (项/秒)</th>
                    <th className="px-4 py-3">速度趋势</th>
                    <th className="px-4 py-3">最后更新</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {nodeStats.map((node) => {
                    const latestRecord =
                      node.recentRecords[node.recentRecords.length - 1] ?? null;
                    const latestSpeed = latestRecord?.speed ?? null;
                    return (
                      <tr key={node.nodeId} className="hover:bg-slate-50">
                        <td className="max-w-xs truncate px-4 py-3 font-mono text-xs">
                          {node.nodeId}
                        </td>
                        <td className="px-4 py-3">{node.totalItemNum.toLocaleString()}</td>
                        <td className="px-4 py-3">{node.totalRunningTime.toFixed(2)}</td>
                        <td className="px-4 py-3">{node.recordCount}</td>
                        <td className="px-4 py-3">{node.avgSpeed.toFixed(4)}</td>
                        <td className="px-4 py-3">
                          {latestSpeed !== null ? latestSpeed.toFixed(4) : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <SpeedSparkline records={node.recentRecords} />
                        </td>
                        <td className="px-4 py-3">{formatDate(node.lastUpdated)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => handleViewNodeDetails(node)}
                              disabled={node.recentRecords.length === 0}
                            >
                              查看详情
                            </button>
                            <button
                              type="button"
                              className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => handleDeleteNode(node.nodeId)}
                              disabled={deletingNodeId === node.nodeId || nodeStatsLoading}
                            >
                              {deletingNodeId === node.nodeId ? "删除中..." : "删除节点"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Batch Size Configuration */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">批次大小配置</h2>
          <p className="mb-4 text-sm text-slate-600">
            配置工作节点获取任务时的默认批次大小。节点可以在请求时指定自定义批次大小，但不能超过最大限制。
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">默认批次大小</span>
              <input
                type="number"
                min="1"
                max={maxBatchSize}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={defaultBatchSize}
                onChange={(e) => setDefaultBatchSize(Number(e.target.value))}
              />
              <p className="text-xs text-slate-500">
                节点每次获取任务时的默认数量（如果节点未指定批次大小）
              </p>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">最大批次大小</span>
              <input
                type="number"
                min="1"
                max="10000"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={maxBatchSize}
                onChange={(e) => setMaxBatchSize(Number(e.target.value))}
              />
              <p className="text-xs text-slate-500">
                节点单次请求可获取的最大任务数量
              </p>
            </label>
          </div>
          <div className="mt-4">
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              onClick={handleSaveBatchSizeConfig}
              disabled={isSavingConfig}
            >
              {isSavingConfig ? "保存中..." : "保存配置"}
            </button>
          </div>
        </section>

        {/* Task Management */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">任务管理</h2>
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-rose-900">危险操作</h3>
              <p className="mb-3 text-sm text-rose-700">
                清除所有任务将删除所有待处理、处理中、已完成和失败的任务。此操作不可撤销。
              </p>
              <button
                type="button"
                className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleClearAllTasks}
                disabled={loading || (summary?.counts.total ?? 0) === 0}
              >
                清除所有任务
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-slate-900">上传文本文件</h2>
            <p className="text-sm text-slate-600">
              每行代表一个文件路径。系统会自动过滤空行，并跳过已存在的路径。
            </p>
            <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600 hover:border-slate-400 hover:bg-slate-100">
              <input
                type="file"
                className="hidden"
                accept=".txt"
                onChange={handleFileUpload}
                disabled={isImporting}
              />
              {isImporting ? "导入中..." : "点击或拖拽上传文本文件 (.txt)"}
            </label>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-slate-900">直接粘贴路径</h2>
            <p className="text-sm text-slate-600">
              支持一次粘贴多行文本，导入后将自动去重。
            </p>
            <textarea
              className="min-h-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="例：C:\data\file-1.csv"
              value={textAreaValue}
              onChange={(event) => setTextAreaValue(event.target.value)}
              disabled={isImporting}
            />
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              onClick={handleTextSubmit}
              disabled={isImporting}
            >
              {isImporting ? "导入中..." : "导入任务"}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => resetPageAndFetch(option.value)}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    option.value === statusFilter
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <label className="flex items-center gap-2">
                <span>每页数量</span>
                <select
                  className="rounded border border-slate-200 px-2 py-1"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                onClick={handleRefresh}
                disabled={loading}
              >
                {loading ? "刷新中..." : "刷新"}
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full table-fixed border-collapse text-left text-sm text-slate-700">
              <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-32 px-4 py-3">任务ID</th>
                  <th className="w-64 px-4 py-3">文件路径</th>
                  <th className="w-24 px-4 py-3">状态</th>
                  <th className="w-20 px-4 py-3">失败次数</th>
                  <th className="w-44 px-4 py-3">更新时间</th>
                  <th className="px-4 py-3">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                      {loading ? "加载中..." : "暂无数据"}
                    </td>
                  </tr>
                ) : (
                  currentTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[120px] truncate font-mono text-xs" title={task.id}>
                            {task.id}
                          </span>
                          <button
                            type="button"
                            className="rounded px-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 active:bg-slate-300"
                            onClick={() => copyToClipboard(task.id)}
                            title="复制ID"
                          >
                            📋
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[240px] truncate" title={task.path}>
                            {task.path}
                          </span>
                          <button
                            type="button"
                            className="rounded px-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 active:bg-slate-300"
                            onClick={() => copyToClipboard(task.path)}
                            title="复制路径"
                          >
                            📋
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${statusBadgeStyles[task.status]}`}
                        >
                          {STATUS_OPTIONS.find((o) => o.value === task.status)?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">{task.failureCount}</td>
                      <td className="px-4 py-3 text-xs">{formatDate(task.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <span className="line-clamp-2 text-xs" title={task.message}>
                          {task.message || "-"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 text-sm text-slate-600">
            <div>
              第 {page} 页，共 {totalPages} 页（共 {summary?.total ?? 0} 条）
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-slate-200 px-4 py-2 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => handlePageChange("prev")}
                disabled={page === 1 || loading}
              >
                上一页
              </button>
              <button
                type="button"
                className="rounded border border-slate-200 px-4 py-2 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => handlePageChange("next")}
                disabled={page === totalPages || loading}
              >
                下一页
              </button>
            </div>
          </div>
        </section>
        </div>
      </div>
    </>
  );
}

function CompletionSummary({
  runStats,
  counts,
  onViewDashboard,
  onClearAllTasks,
  isClearing,
  infoMessage,
  errorMessage,
}: {
  runStats: RunStats;
  counts: SummaryCounts;
  onViewDashboard: () => void;
  onClearAllTasks: () => void;
  isClearing: boolean;
  infoMessage: string | null;
  errorMessage: string | null;
}) {
  const totalDurationText = formatDuration(runStats.durationMs);
  const startTimeText = formatDate(runStats.startTime);
  const endTimeText = formatDate(runStats.endTime);
  const totalRunningTimeText = formatSeconds(runStats.totalRunningTime);

  const averageTaskSpeedPerMinute =
    runStats.averageTaskSpeed !== null ? runStats.averageTaskSpeed * 60 : null;
  const averageItemSpeedPerMinute =
    runStats.averageItemSpeed !== null ? runStats.averageItemSpeed * 60 : null;

  const averageTaskSpeedText = formatSpeed(averageTaskSpeedPerMinute, "任务/分钟");
  const averageTaskSpeedSub =
    averageTaskSpeedText !== "-" && runStats.averageTaskSpeed !== null
      ? `约 ${formatSpeed(runStats.averageTaskSpeed, "任务/秒")}`
      : undefined;

  const averageItemSpeedText = formatSpeed(averageItemSpeedPerMinute, "项/分钟");
  const averageItemSpeedSub =
    averageItemSpeedText !== "-" && runStats.averageItemSpeed !== null
      ? `约 ${formatSpeed(runStats.averageItemSpeed, "项/秒")}`
      : undefined;

  const hasItemStats = runStats.totalItemNum > 0 || runStats.totalRunningTime > 0;

  const metricTiles: Array<{ label: string; value: string; subValue?: string }> = [
    {
      label: "总任务数",
      value: formatNumber(runStats.totalTasks),
      subValue: `完成 ${formatNumber(runStats.completedTasks)} 个任务`,
    },
    {
      label: "处理总时长",
      value: totalDurationText,
      subValue: startTimeText !== "-" && endTimeText !== "-" ? `${startTimeText} → ${endTimeText}` : undefined,
    },
    {
      label: "平均任务速度",
      value: averageTaskSpeedText,
      subValue: averageTaskSpeedSub,
    },
  ];

  if (hasItemStats) {
    metricTiles.push(
      {
        label: "总处理项数",
        value: formatNumber(runStats.totalItemNum),
        subValue:
          runStats.totalRunningTime > 0
            ? `节点累计 ${totalRunningTimeText}`
            : undefined,
      },
      {
        label: "平均项速度",
        value: averageItemSpeedText,
        subValue: averageItemSpeedSub,
      },
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6">
        <header className="flex flex-col gap-2 text-center md:text-left">
          <h1 className="text-3xl font-semibold text-slate-900">本轮任务已全部完成 🎉</h1>
          <p className="text-sm text-slate-600">以下为本轮任务的整体执行统计，方便评估节点效率与处理表现。</p>
        </header>

        {infoMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {infoMessage}
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          {metricTiles.map((tile) => (
            <CompletionMetricTile key={tile.label} label={tile.label} value={tile.value} subValue={tile.subValue} />
          ))}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">时间统计</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <CompletionMetricTile label="开始时间" value={startTimeText} />
            <CompletionMetricTile label="结束时间" value={endTimeText} />
            <CompletionMetricTile label="总耗时" value={totalDurationText} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">状态概览</h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatusTile label="未处理" value={counts.pending} />
            <StatusTile label="处理中" value={counts.processing} />
            <StatusTile label="失败" value={counts.failed} />
            <StatusTile label="已完成" value={counts.completed} highlight />
          </div>
        </section>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700"
            onClick={onViewDashboard}
          >
            查看任务仪表盘
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-300 bg-white px-6 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onClearAllTasks}
            disabled={isClearing}
          >
            {isClearing ? "清除中..." : "清除所有任务"}
          </button>
        </div>

        <p className="text-center text-xs text-slate-500">
          如需开始新一轮任务，可返回仪表盘导入新的任务列表或上传文件。
        </p>
      </div>
    </div>
  );
}

function CompletionMetricTile({
  label,
  value,
  subValue,
}: {
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="text-2xl font-semibold text-slate-900">{value}</span>
      {subValue && <span className="text-xs text-slate-500">{subValue}</span>}
    </div>
  );
}

function StatusTile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-4 text-center shadow-sm ${
        highlight
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xl font-semibold text-slate-900">{value.toLocaleString()}</span>
    </div>
  );
}

function NodeDetailModal({ node, onClose }: { node: NodeStatsItem; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const aggregatedRecords = useMemo(
    () => groupRecordsForTrend(node.recentRecords, 6),
    [node.recentRecords],
  );

  const lastUpdatedText = formatDate(node.lastUpdated);
  const averageSpeedPerMinute =
    Number.isFinite(node.avgSpeed) && node.avgSpeed >= 0 ? node.avgSpeed * 60 : null;

  const metrics = [
    {
      label: "最近记录次数",
      value: formatNumber(node.recentRecords.length),
      subValue:
        aggregatedRecords.length !== node.recentRecords.length
          ? `聚合后 ${formatNumber(aggregatedRecords.length)} 组`
          : undefined,
    },
    {
      label: "总处理项数",
      value: formatNumber(node.totalItemNum),
    },
    {
      label: "累计运行时长",
      value: formatSeconds(node.totalRunningTime),
    },
    {
      label: "平均速度",
      value: formatSpeed(averageSpeedPerMinute, "项/分钟"),
      subValue:
        averageSpeedPerMinute !== null ? `约 ${formatSpeed(node.avgSpeed, "项/秒")}` : undefined,
    },
  ];

  const formatRange = (record: AggregatedPerformanceRecord) => {
    const start = new Date(record.startTimestamp);
    const end = new Date(record.endTimestamp);
    const sameDay = start.toDateString() === end.toDateString();
    const startLabel = sameDay ? start.toLocaleTimeString() : start.toLocaleString();
    const endLabel = sameDay ? end.toLocaleTimeString() : end.toLocaleString();
    return `${startLabel} ~ ${endLabel}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose}></div>
      <div className="relative z-10 flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-8 py-6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-900">节点详情</h2>
            <p className="text-sm text-slate-500">
              节点 <span className="font-mono text-xs text-slate-700">{node.nodeId}</span>，
              最后更新时间 {lastUpdatedText}
            </p>
            <p className="text-xs text-slate-400">
              趋势图基于每 6 条记录取平均值，以减少瞬时波动。
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            onClick={onClose}
          >
            关闭
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <CompletionMetricTile
                key={metric.label}
                label={metric.label}
                value={metric.value}
                subValue={metric.subValue}
              />
            ))}
          </section>
          <section className="mb-8 rounded-xl border border-slate-200 bg-slate-50 p-6">
            <h3 className="mb-4 text-base font-semibold text-slate-900">速度趋势</h3>
            <DetailedSpeedChart data={aggregatedRecords} />
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-slate-900">聚合记录明细</h3>
            {aggregatedRecords.length === 0 ? (
              <p className="text-sm text-slate-500">暂无聚合数据。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto border-collapse text-sm text-slate-700">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">序号</th>
                      <th className="px-4 py-2 text-left">时间范围</th>
                      <th className="px-4 py-2 text-left">平均速度 (项/分钟)</th>
                      <th className="px-4 py-2 text-left">平均速度 (项/秒)</th>
                      <th className="px-4 py-2 text-left">包含记录数</th>
                      <th className="px-4 py-2 text-left">处理项数</th>
                      <th className="px-4 py-2 text-left">运行时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {aggregatedRecords.map((record, index) => (
                      <tr key={`${record.startTimestamp}-${record.endTimestamp}`}>
                        <td className="px-4 py-2">{index + 1}</td>
                        <td className="px-4 py-2">{formatRange(record)}</td>
                        <td className="px-4 py-2">
                          {formatSpeed(record.avgSpeed * 60, "项/分钟")}
                        </td>
                        <td className="px-4 py-2">{formatSpeed(record.avgSpeed, "项/秒")}</td>
                        <td className="px-4 py-2">{record.count}</td>
                        <td className="px-4 py-2">{formatNumber(record.totalItemNum)}</td>
                        <td className="px-4 py-2">{formatSeconds(record.totalRunningTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function DetailedSpeedChart({ data }: { data: AggregatedPerformanceRecord[] }) {
  if (!data.length) {
    return <p className="text-sm text-slate-500">暂无速度记录。</p>;
  }

  const width = Math.max(720, data.length * 80);
  const height = 240;
  const padding = { top: 24, right: 24, bottom: 48, left: 64 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const speeds = data.map((record) => record.avgSpeed);
  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);
  const speedRange = maxSpeed - minSpeed;
  const normalizedRange = speedRange === 0 ? 1 : speedRange;

  const points = data.map((record, index) => {
    const x =
      data.length === 1
        ? padding.left + plotWidth / 2
        : padding.left + (index / (data.length - 1)) * plotWidth;
    const normalized = (record.avgSpeed - minSpeed) / normalizedRange;
    const y = padding.top + (1 - normalized) * plotHeight;
    return { x, y, record, index };
  });

  const yTickCount = speedRange === 0 ? 0 : 4;
  const yTickValues =
    speedRange === 0
      ? [minSpeed]
      : Array.from({ length: yTickCount + 1 }, (_, idx) => minSpeed + (speedRange * idx) / yTickCount);

  const labelStep = Math.max(1, Math.floor(data.length / 6));
  const latestPoint = points[points.length - 1];

  const ariaLabel = `节点最近 ${data.length} 个平均速度点，每 6 条记录计算一次平均速度，最新平均速度为 ${latestPoint.record.avgSpeed.toFixed(4)} 项/秒`;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-60 min-w-[640px] text-sky-500"
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          stroke="#cbd5f5"
          strokeWidth={1}
        />
        {yTickValues.map((value, idx) => {
          const normalized = speedRange === 0 ? 0.5 : (value - minSpeed) / normalizedRange;
          const y = padding.top + (1 - normalized) * plotHeight;
          const precision = value >= 10 ? 1 : 2;
          return (
            <g key={`y-tick-${idx}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 12}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400 text-xs"
              >
                {`${value.toFixed(precision)} 项/秒`}
              </text>
            </g>
          );
        })}

        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
        />

        {points.map((point) => (
          <circle key={`pt-${point.index}`} cx={point.x} cy={point.y} r={3.5} fill="currentColor" />
        ))}

        <text
          x={latestPoint.x + 8}
          y={latestPoint.y - 8}
          className="fill-slate-600 text-xs"
        >
          {`最新 ${formatSpeed(latestPoint.record.avgSpeed, "项/秒")}`}
        </text>

        {points.map((point) => {
          if (point.index % labelStep !== 0 && point.index !== points.length - 1) {
            return null;
          }
          const timeLabel = new Date(point.record.endTimestamp).toLocaleTimeString();
          return (
            <text
              key={`x-label-${point.index}`}
              x={point.x}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              className="fill-slate-400 text-xs"
            >
              {timeLabel}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function SpeedSparkline({ records }: { records: NodePerformanceRecordItem[] }) {
  const aggregatedRecords = useMemo(() => groupRecordsForTrend(records, 6), [records]);

  if (!aggregatedRecords.length) {
    return <span className="text-xs text-slate-400">-</span>;
  }

  const width = 140;
  const height = 40;
  const paddingX = 8;
  const paddingY = 6;

  const speeds = aggregatedRecords.map((record) => record.avgSpeed);
  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);
  const range = maxSpeed - minSpeed || 1;

  const points = aggregatedRecords.map((record, index) => {
    const x =
      aggregatedRecords.length === 1
        ? width / 2
        : paddingX + (index / (aggregatedRecords.length - 1)) * (width - paddingX * 2);
    const normalized = (record.avgSpeed - minSpeed) / range;
    const y = height - (paddingY + normalized * (height - paddingY * 2));
    return { x, y };
  });

  const latestSpeed = speeds[speeds.length - 1];
  const svgLabel = `节点最近 ${records.length} 次速度记录，每 6 条取平均后展示 ${aggregatedRecords.length} 个点，最新平均速度 ${latestSpeed.toFixed(4)} 项/秒`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-32 text-sky-500"
      role="img"
      aria-label={svgLabel}
    >
      <title>{svgLabel}</title>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.map((point) => `${point.x},${point.y}`).join(" ")}
      />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={2.5}
        fill="currentColor"
      />
    </svg>
  );
}

function SummaryCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`h-1 w-12 rounded-full ${accent}`}></div>
      <div className="text-3xl font-bold text-slate-900">{value.toLocaleString()}</div>
      <div className="text-sm font-medium text-slate-500">{title}</div>
    </div>
  );
}
