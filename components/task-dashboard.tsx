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

interface SummaryResponse {
  status: TaskStatus;
  page: number;
  pageSize: number;
  total: number;
  counts: SummaryCounts;
  tasks: TaskItem[];
}

interface NodeStatsItem {
  nodeId: string;
  totalItemNum: number;
  totalRunningTime: number;
  recordCount: number;
  avgSpeed: number;
  lastUpdated: number;
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

export function TaskDashboard() {
  const [statusFilter, setStatusFilter] = useState<TaskStatus>("pending");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [textAreaValue, setTextAreaValue] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Timeout settings
  const [timeoutMinutes, setTimeoutMinutes] = useState(5);
  const [autoCheckInterval, setAutoCheckInterval] = useState(1); // minutes

  // Node stats
  const [nodeStats, setNodeStats] = useState<NodeStatsItem[]>([]);
  const [showNodeStats, setShowNodeStats] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<TaskItem | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Copy feedback
  const [copiedText, setCopiedText] = useState<string | null>(null);

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
      const response = await fetch("/api/tasks/node_stats", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setNodeStats(data.nodes || []);
      }
    } catch (err) {
      console.error("获取节点统计失败", err);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, pageSize, page]);

  useEffect(() => {
    if (showNodeStats) {
      fetchNodeStats();
    }
  }, [showNodeStats, fetchNodeStats]);

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

  const currentTasks = summary?.tasks ?? [];

  return (
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
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">节点统计</h2>
            <button
              type="button"
              className="text-sm text-slate-600 underline hover:text-slate-800"
              onClick={() => {
                setShowNodeStats(!showNodeStats);
                if (!showNodeStats) {
                  fetchNodeStats();
                }
              }}
            >
              {showNodeStats ? "隐藏" : "显示"}
            </button>
          </div>

          {showNodeStats && (
            <div className="overflow-x-auto">
              {nodeStats.length === 0 ? (
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
                      <th className="px-4 py-3">最后更新</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {nodeStats.map((node) => (
                      <tr key={node.nodeId} className="hover:bg-slate-50">
                        <td className="max-w-xs truncate px-4 py-3 font-mono text-xs">
                          {node.nodeId}
                        </td>
                        <td className="px-4 py-3">{node.totalItemNum.toLocaleString()}</td>
                        <td className="px-4 py-3">{node.totalRunningTime.toFixed(2)}</td>
                        <td className="px-4 py-3">{node.recordCount}</td>
                        <td className="px-4 py-3">{node.avgSpeed.toFixed(4)}</td>
                        <td className="px-4 py-3">{formatDate(node.lastUpdated)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
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
