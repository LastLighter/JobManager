"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ROUND_PAGE_SIZE_OPTIONS,
  ROUND_STATUS_BADGES,
  ROUND_STATUS_LABELS,
  STATUS_OPTIONS,
  TASK_PAGE_SIZE_OPTIONS,
  statusBadgeStyles,
} from "./constants";
import { CompletionSummary } from "./completion-summary";
import { NodeDetailModal } from "./node-detail-modal";
import { SpeedSparkline } from "./charts";
import { TimeoutMetricsSection } from "./timeout-metrics";
import type {
  NodeStatsItem,
  NodeStatsSummary,
  RoundStatsSummary,
  SummaryResponse,
  TaskItem,
  TaskRoundSummary,
  TaskStatus,
} from "./types";
import { NodeSummaryTile, RoundStatTile, SummaryCard } from "./ui";
import { formatDate, formatNumber, formatSeconds, formatSpeed } from "./utils";

export function TaskDashboard() {
  const [statusFilter, setStatusFilter] = useState<TaskStatus>("pending");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [roundPage, setRoundPage] = useState(1);
  const [roundPageSize, setRoundPageSize] = useState(10);

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showCompletionSummary, setShowCompletionSummary] = useState(false);
  const [rounds, setRounds] = useState<TaskRoundSummary[]>([]);
  const [roundStats, setRoundStats] = useState<RoundStatsSummary | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);

  const [textAreaValue, setTextAreaValue] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Timeout settings
  const [timeoutMinutes, setTimeoutMinutes] = useState(15);
  const [autoCheckInterval, setAutoCheckInterval] = useState(1); // minutes

  // Node stats
  const [nodeStats, setNodeStats] = useState<NodeStatsItem[]>([]);
  const [nodeStatsLoading, setNodeStatsLoading] = useState(false);
  const [nodeStatsError, setNodeStatsError] = useState<string | null>(null);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeStatsItem | null>(null);
  const [nodeStatsSummary, setNodeStatsSummary] = useState<NodeStatsSummary | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<TaskItem | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Copy feedback
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Batch size configuration
  const [defaultBatchSize, setDefaultBatchSize] = useState(8);
  const [maxBatchSize, setMaxBatchSize] = useState(1000);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const totalPages = useMemo(() => {
    if (!summary || summary.total === 0) return 1;
    return Math.max(1, Math.ceil(summary.total / summary.pageSize));
  }, [summary]);

  const fetchSummary = useCallback(
    async (opts?: { keepPage?: boolean; keepRoundPage?: boolean; roundId?: string | null }) => {
      try {
        setLoading(true);
        setError(null);

        const nextPage = opts?.keepPage ? page : 1;
        if (!opts?.keepPage) {
          setPage(1);
        }

        const nextRoundPage = opts?.keepRoundPage ? roundPage : 1;
        if (!opts?.keepRoundPage) {
          setRoundPage(1);
        }

        const targetRoundId = opts?.roundId !== undefined ? opts.roundId : selectedRoundId;
        const roundQuery =
          targetRoundId && targetRoundId !== "" ? `&roundId=${encodeURIComponent(targetRoundId)}` : "";

        const timeoutMsValue = Math.max(1, timeoutMinutes) * 60 * 1000;

        const response = await fetch(
          `/api/tasks/summary?status=${statusFilter}&page=${nextPage}&pageSize=${pageSize}` +
            `&roundPage=${nextRoundPage}&roundPageSize=${roundPageSize}` +
            `&timeoutMs=${timeoutMsValue}${roundQuery}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = (await response.json()) as SummaryResponse;
        setSummary(data);
        setRoundStats(data.roundStats && typeof data.roundStats === "object" ? data.roundStats : null);
        setActiveRoundId(data.currentRoundId ?? null);

        if (opts?.roundId !== undefined) {
          setSelectedRoundId(opts.roundId);
        } else if (!targetRoundId && data.currentRoundId) {
          setSelectedRoundId(data.currentRoundId);
        }

        const shouldRefetchForRoundSelection =
          opts?.roundId !== undefined &&
          data.roundPagination?.selectedRoundPage !== null &&
          data.roundPagination.selectedRoundPage !== data.roundPagination.page;

        if (shouldRefetchForRoundSelection) {
          if (data.roundPagination?.selectedRoundPage) {
            setRoundPage(data.roundPagination.selectedRoundPage);
          }
          if (
            data.roundPagination?.pageSize !== undefined &&
            data.roundPagination.pageSize !== roundPageSize
          ) {
            setRoundPageSize(data.roundPagination.pageSize);
          }
          if (data.page !== page) {
            setPage(data.page);
          }
          return;
        }

        setRounds(Array.isArray(data.rounds) ? data.rounds : []);

        if (data.page !== page) {
          setPage(data.page);
        }
        if (data.roundPagination?.page !== undefined && data.roundPagination.page !== roundPage) {
          setRoundPage(data.roundPagination.page);
        }
        if (
          data.roundPagination?.pageSize !== undefined &&
          data.roundPagination.pageSize !== roundPageSize
        ) {
          setRoundPageSize(data.roundPagination.pageSize);
        }
      } catch (err) {
        console.error("获取任务汇总失败", err);
        setError("获取任务数据失败，请稍后重试。");
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, page, pageSize, roundPage, roundPageSize, selectedRoundId, timeoutMinutes],
  );

  const fetchNodeStats = useCallback(async () => {
    try {
      setNodeStatsLoading(true);
      setNodeStatsError(null);
      const roundQuery =
        selectedRoundId && selectedRoundId !== "" ? `?roundId=${encodeURIComponent(selectedRoundId)}` : "";
      const response = await fetch(`/api/tasks/node_stats${roundQuery}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      setNodeStats(Array.isArray(data.nodes) ? data.nodes : []);
      setNodeStatsSummary(
        data.summary && typeof data.summary === "object" ? (data.summary as NodeStatsSummary) : null,
      );
    } catch (err) {
      console.error("获取节点统计失败", err);
      setNodeStatsError("获取节点统计失败，请稍后重试。");
    } finally {
      setNodeStatsLoading(false);
    }
  }, [selectedRoundId]);

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

  const currentTasks = summary?.tasks ?? [];
  const nodeCount = nodeStats.length;
  const roundNameById = useMemo(() => {
    const map = new Map<string, string>();
    rounds.forEach((round) => {
      map.set(round.id, round.name);
    });
    return map;
  }, [rounds]);
  const selectedRound = useMemo(
    () => (selectedRoundId ? rounds.find((round) => round.id === selectedRoundId) ?? null : null),
    [rounds, selectedRoundId],
  );
  const selectedRoundDisplayName = selectedRound?.name ?? (selectedRoundId ?? "全部任务轮");
  const activeRoundDisplayName = useMemo(
    () => (activeRoundId ? roundNameById.get(activeRoundId) ?? activeRoundId : null),
    [activeRoundId, roundNameById],
  );

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
        body: JSON.stringify({
          timeoutMs,
          roundId: selectedRoundId ?? undefined,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.failedCount > 0) {
          console.log(`自动检查（${selectedRoundDisplayName}）：已将 ${result.failedCount} 个超时任务标记为失败`);
          // Silently refresh the summary
          await fetchSummary({ keepPage: true, keepRoundPage: true });
        }
      }
    } catch (err) {
      console.error("自动检查超时任务失败", err);
    }
  }, [timeoutMinutes, selectedRoundId, selectedRoundDisplayName, fetchSummary]);

  useEffect(() => {
    fetchSummary({ keepPage: true, keepRoundPage: true });
  }, [statusFilter, pageSize, page, roundPage, roundPageSize, timeoutMinutes, fetchSummary]);

  useEffect(() => {
    fetchBatchSizeConfig();
  }, [fetchBatchSizeConfig]);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, []);

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

  const handleRoundChange = useCallback((roundId: string | null) => {
    setPage(1);
    setSelectedRoundId(roundId);
  }, []);

  const handleRoundPageChange = (direction: "prev" | "next") => {
    const maxPage = Math.max(1, summary?.roundPagination?.totalPages ?? 1);
    if (direction === "prev" && roundPage > 1) {
      setRoundPage((prev) => Math.max(prev - 1, 1));
    }
    if (direction === "next" && roundPage < maxPage) {
      setRoundPage((prev) => Math.min(prev + 1, maxPage));
    }
  };

  const handleRoundPageSizeChange = (size: number) => {
    setRoundPageSize(size);
    setRoundPage(1);
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    setIsImporting(true);
    setInfoMessage(null);
    setError(null);

    try {
      const formData = new FormData();
      Array.from(fileList).forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/tasks/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = await response.json();
      const createdRounds = Array.isArray(result.rounds) ? result.rounds : [];
      const summaryText =
        createdRounds.length > 0
          ? createdRounds
              .map(
                (round: { name?: string; roundId: string; added: number; skipped: number }) =>
                  `${round.name ?? round.roundId}: 导入 ${round.added} 条，跳过 ${round.skipped} 条`,
              )
              .join("；")
          : "";
      setInfoMessage(summaryText ? `成功创建 ${createdRounds.length} 个任务轮。${summaryText}` : "文件已处理。");

      const firstRoundId =
        createdRounds.length > 0 && typeof createdRounds[0].roundId === "string"
          ? createdRounds[0].roundId
          : selectedRoundId;
      await fetchSummary({ keepPage: false, roundId: firstRoundId ?? null });
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
      const createdRounds = Array.isArray(result.rounds) ? result.rounds : [];
      const summaryText =
        createdRounds.length > 0
          ? createdRounds
              .map(
                (round: { name?: string; roundId: string; added: number; skipped: number }) =>
                  `${round.name ?? round.roundId}: 导入 ${round.added} 条，跳过 ${round.skipped} 条`,
              )
              .join("；")
          : "";
      setInfoMessage(summaryText ? `成功创建 ${createdRounds.length} 个任务轮。${summaryText}` : "导入请求已处理。");
      setTextAreaValue("");
      const firstRoundId =
        createdRounds.length > 0 && typeof createdRounds[0].roundId === "string"
          ? createdRounds[0].roundId
          : selectedRoundId;
      await fetchSummary({ keepPage: false, roundId: firstRoundId ?? null });
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
      const roundQuery =
        selectedRoundId && selectedRoundId !== "" ? `&roundId=${encodeURIComponent(selectedRoundId)}` : "";
      const response = await fetch(
        `/api/tasks/search?query=${encodeURIComponent(searchQuery.trim())}${roundQuery}`,
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
    await fetchSummary({ keepPage: true, keepRoundPage: true, roundId: selectedRoundId });
  };

  const handleClearTasks = useCallback(
    async (scope: "selected" | "all") => {
      const targetRoundId = scope === "selected" ? selectedRoundId : null;
      const targetRound = targetRoundId ? rounds.find((round) => round.id === targetRoundId) ?? null : null;

      if (scope === "selected" && !targetRoundId) {
        window.alert("请先选择一个任务轮，再执行该操作。");
        return;
      }

      const totalTaskCount =
        scope === "selected"
          ? targetRound?.counts.total ?? 0
          : rounds.reduce((sum, round) => sum + round.counts.total, 0);
      const totalTaskLabel = totalTaskCount.toLocaleString();

      if (totalTaskCount === 0) {
        setInfoMessage(scope === "selected" ? "当前任务轮没有任务可清除。" : "当前没有任务可清除。");
        return;
      }

      const confirmMessage =
        scope === "selected"
          ? `确定要清除任务轮「${targetRound?.name ?? targetRoundId}」的所有任务吗？此操作不可撤销。\n\n当前共有 ${totalTaskLabel} 个任务。`
          : `确定要清除全部任务轮吗？此操作不可撤销。\n\n当前共有 ${totalTaskLabel} 个任务。`;

      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) {
        return;
      }

      setLoading(true);
      setError(null);
      setInfoMessage(null);

      try {
        const response = await fetch(
          targetRoundId ? `/api/tasks/clear?roundId=${encodeURIComponent(targetRoundId)}` : "/api/tasks/clear",
          {
            method: "DELETE",
          },
        );

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const result = await response.json();
        setInfoMessage(
          typeof result.message === "string"
            ? result.message
            : scope === "selected"
              ? "已清除当前任务轮的所有任务。"
              : "已清除全部任务轮。",
        );
        setSelectedNode(null);

        setSelectedRoundId(null);
        await fetchSummary({ keepPage: false });
      } catch (err) {
        console.error("清除任务失败", err);
        setError("清除任务失败，请稍后重试。");
      } finally {
        setLoading(false);
      }
    },
    [fetchSummary, selectedRoundId, rounds],
  );

  const handleClearNodeStats = async () => {
    const scopeLabel = selectedRoundId ? `任务轮「${selectedRoundDisplayName}」` : "全部任务轮";
    const confirmed = window.confirm(
      `确定要清除${scopeLabel}的节点统计数据吗？此操作不可撤销。\n\n当前共有 ${nodeStats.length} 个节点。`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setNodeStatsLoading(true);
      setNodeStatsError(null);
      const roundQuery =
        selectedRoundId && selectedRoundId !== "" ? `?roundId=${encodeURIComponent(selectedRoundId)}` : "";
      const response = await fetch(`/api/tasks/node_stats${roundQuery}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const result = await response.json();
      setInfoMessage(
        `已清除 ${result.cleared ?? 0} 个节点的统计数据${
          selectedRoundId ? `（任务轮 ${selectedRoundDisplayName}）` : ""
        }。`,
      );
      setSelectedNode(null);
      await fetchNodeStats();
    } catch (err) {
      console.error("清除节点统计失败", err);
      setNodeStatsError("清除节点统计失败，请稍后重试。");
    } finally {
      setNodeStatsLoading(false);
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    const scopeLabel = selectedRoundId ? `任务轮「${selectedRoundDisplayName}」` : "全部任务轮";
    const confirmed = window.confirm(`确定要删除${scopeLabel}中节点 ${nodeId} 的统计数据吗？`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingNodeId(nodeId);
      setNodeStatsError(null);
      const roundQuery =
        selectedRoundId && selectedRoundId !== "" ? `?roundId=${encodeURIComponent(selectedRoundId)}` : "";
      const response = await fetch(`/api/tasks/node_stats/${encodeURIComponent(nodeId)}${roundQuery}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setInfoMessage(
        `已删除节点 ${nodeId} 的统计数据${
          selectedRoundId ? `（任务轮 ${selectedRoundDisplayName}）` : ""
        }。`,
      );
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

  const roundPaginationInfo = summary?.roundPagination;
  const totalRoundPages = roundPaginationInfo ? Math.max(1, roundPaginationInfo.totalPages) : 1;
  const roundTotalCount = roundPaginationInfo?.total ?? 0;
  const timeoutMetrics = summary?.timeoutMetrics ?? null;
  const selectedRoundTimeout = timeoutMetrics?.selectedRound ?? null;
  const timeoutThresholdMinutesFromSummary = Math.max(
    1,
    Math.round((summary?.timeoutMs ?? timeoutMinutes * 60 * 1000) / 60000),
  );
  const timeoutLastInspected = timeoutMetrics ? formatDate(timeoutMetrics.inspectedAt) : "-";
  const hasTimedOutTasks = Boolean(timeoutMetrics && timeoutMetrics.topTimedOut.length > 0);
  const hasProcessingTasks = Boolean(timeoutMetrics && timeoutMetrics.topProcessing.length > 0);

  if (summary?.runStats?.allCompleted && showCompletionSummary) {
    return (
      <CompletionSummary
        runStats={summary.runStats}
        counts={summary.counts}
        roundName={selectedRoundDisplayName}
        onViewDashboard={() => setShowCompletionSummary(false)}
        onClearSelectedRound={() => void handleClearTasks("selected")}
        onClearAllRounds={() => void handleClearTasks("all")}
        canClearSelectedRound={Boolean(selectedRoundId)}
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
        <div className="mx-auto w-full max-w-7xl px-6">
          <main className="flex flex-col gap-8">
            <header id="overview" className="scroll-mt-24 flex flex-col gap-2">
              <h1 className="text-3xl font-semibold text-slate-900">任务调度管理系统</h1>
              <p className="text-sm text-slate-600">支持批量导入文件路径，分配任务执行节点，并实时监控任务状态。</p>
            </header>

            {copiedText && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">✓ 已复制到剪贴板</div>
            )}

            {infoMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{infoMessage}</div>
            )}

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            )}

            <section id="rounds" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">任务轮管理</h2>
                    <p className="text-xs text-slate-500">{activeRoundDisplayName ? `进行中：${activeRoundDisplayName}` : "暂无运行中的任务轮"}</p>
                    <p className="text-xs text-slate-400">当前查看：{selectedRoundDisplayName}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 sm:grid-cols-4">
                    <RoundStatTile label="任务轮总数" value={roundStats?.totalRounds ?? 0} />
                    <RoundStatTile label="进行中" value={roundStats?.statusCounts.active ?? 0} />
                    <RoundStatTile label="未执行" value={roundStats?.statusCounts.pending ?? 0} />
                    <RoundStatTile label="已完结" value={roundStats?.statusCounts.completed ?? 0} />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto border-collapse text-left text-sm text-slate-700">
                    <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">任务轮</th>
                        <th className="px-4 py-3">状态</th>
                        <th className="px-4 py-3">总任务</th>
                        <th className="px-4 py-3">完成数</th>
                        <th className="px-4 py-3">进度</th>
                        <th className="px-4 py-3">创建时间</th>
                        <th className="px-4 py-3">最近更新</th>
                        <th className="px-4 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rounds.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                            尚未导入任何任务轮。
                          </td>
                        </tr>
                      ) : (
                        rounds.map((round) => {
                          const isSelected = round.id === selectedRoundId;
                          const isActive = round.id === activeRoundId;
                          const progress = round.counts.total > 0 ? Math.round((round.counts.completed / round.counts.total) * 100) : 0;
                          const lastUpdate = round.completedAt ?? round.activatedAt ?? round.createdAt;
                          return (
                            <tr key={round.id} className={`transition ${isSelected ? "bg-slate-100/70" : "hover:bg-slate-50"}`}>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-slate-800">{round.name}</span>
                                    {isActive && (
                                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">当前</span>
                                    )}
                                    {isSelected && (
                                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">查看中</span>
                                    )}
                                  </div>
                                  <span className="text-xs text-slate-400">ID: {round.id}</span>
                                  {round.sourceHint && <span className="text-xs text-slate-400">来源：{round.sourceHint}</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-medium ${ROUND_STATUS_BADGES[round.status]}`}
                                >
                                  {ROUND_STATUS_LABELS[round.status]}
                                </span>
                              </td>
                              <td className="px-4 py-3">{round.counts.total.toLocaleString()}</td>
                              <td className="px-4 py-3">{round.counts.completed.toLocaleString()}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 w-28 rounded-full bg-slate-200">
                                      <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(progress, 100)}%` }}></div>
                                    </div>
                                    <span className="text-xs text-slate-500">{progress}%</span>
                                  </div>
                                  <span className="text-xs text-slate-400">
                                    未处理 {round.counts.pending.toLocaleString()} / 处理中 {round.counts.processing.toLocaleString()} / 失败 {round.counts.failed.toLocaleString()}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs">{formatDate(round.createdAt)}</td>
                              <td className="px-4 py-3 text-xs">{formatDate(lastUpdate)}</td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => handleRoundChange(round.id)}
                                  disabled={isSelected}
                                  className={`rounded-lg px-3 py-1 text-xs font-medium ${
                                    isSelected
                                      ? "cursor-default bg-slate-200 text-slate-500"
                                      : "bg-slate-900 text-white shadow-sm transition hover:bg-slate-700"
                                  }`}
                                >
                                  {isSelected ? "已选择" : "查看"}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {roundStats && (
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    全部任务：{roundStats.aggregateTaskCounts.total.toLocaleString()} 个（未处理 {roundStats.aggregateTaskCounts.pending.toLocaleString()}，处理中 {roundStats.aggregateTaskCounts.processing.toLocaleString()}，已完成 {roundStats.aggregateTaskCounts.completed.toLocaleString()}，失败 {roundStats.aggregateTaskCounts.failed.toLocaleString()}）
                  </div>
                )}
                {roundPaginationInfo && (
                  <div className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-white px-4 py-3 text-xs text-slate-500">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        任务轮分页：第 {roundPaginationInfo.page} / {totalRoundPages} 页（共{" "}
                        {roundTotalCount.toLocaleString()} 个任务轮）
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1">
                          <span>每页</span>
                          <select
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
                            value={roundPageSize}
                            onChange={(event) => handleRoundPageSizeChange(Number(event.target.value))}
                          >
                            {ROUND_PAGE_SIZE_OPTIONS.map((size) => (
                              <option key={size} value={size}>
                                {size}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => handleRoundPageChange("prev")}
                          disabled={roundPaginationInfo.page <= 1}
                        >
                          上一页
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => handleRoundPageChange("next")}
                          disabled={roundPaginationInfo.page >= totalRoundPages}
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                    {roundPaginationInfo.selectedRoundPage !== null &&
                      roundPaginationInfo.selectedRoundPage !== roundPaginationInfo.page && (
                        <p className="text-[11px] text-slate-400">
                          当前选中的任务轮位于第 {roundPaginationInfo.selectedRoundPage} 页。
                        </p>
                      )}
                  </div>
                )}
                {selectedRound && (
                  <div className="grid gap-3 text-xs text-slate-500 md:grid-cols-3">
                    <div>任务总数：{selectedRound.counts.total.toLocaleString()}</div>
                    <div>创建时间：{formatDate(selectedRound.createdAt)}</div>
                    <div>
                      状态更新时间：
                      {selectedRound.completedAt
                        ? formatDate(selectedRound.completedAt)
                        : selectedRound.activatedAt
                          ? formatDate(selectedRound.activatedAt)
                          : "-"}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-5">
              <SummaryCard title="总任务量" value={summary?.counts.total ?? 0} accent="bg-slate-900" />
              <SummaryCard title="未处理" value={summary?.counts.pending ?? 0} accent="bg-amber-500" />
              <SummaryCard title="处理中" value={summary?.counts.processing ?? 0} accent="bg-sky-500" />
              <SummaryCard title="已完成" value={summary?.counts.completed ?? 0} accent="bg-emerald-500" />
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
                <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{searchError}</div>
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
                      <span className="font-medium text-slate-600">任务轮:</span>
                      <span className="text-slate-900">
                        {searchResult.roundId ? roundNameById.get(searchResult.roundId) ?? searchResult.roundId : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-600">状态:</span>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeStyles[searchResult.status]}`}>
                        {STATUS_OPTIONS.find((o) => o.value === searchResult.status)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-600">失败次数:</span>
                      <span className="text-slate-900">{searchResult.failureCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-600">执行节点:</span>
                      <span className="font-mono text-slate-900">
                        {searchResult.processingNodeId ?? "-"}
                      </span>
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
                  {searchResult.roundId && searchResult.roundId !== selectedRoundId && (
                    <div className="mt-4">
                      <button
                        type="button"
                        className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-slate-700"
                        onClick={() => handleRoundChange(searchResult.roundId ?? null)}
                      >
                        切换到该任务轮
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Timeout Management */}
            <section id="run-settings" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
                  <p className="text-xs text-slate-500">超过此时间的“处理中”任务将自动标记为失败</p>
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

            <div id="data-monitor" className="scroll-mt-24 flex flex-col gap-8">
              <TimeoutMetricsSection
                metrics={timeoutMetrics}
                selectedRoundTimeout={selectedRoundTimeout}
                timeoutThresholdMinutes={timeoutThresholdMinutesFromSummary}
                timeoutLastInspected={timeoutLastInspected}
                hasTimedOutTasks={hasTimedOutTasks}
                hasProcessingTasks={hasProcessingTasks}
                copyToClipboard={copyToClipboard}
                roundNameById={roundNameById}
                onRoundSelect={(roundId) => handleRoundChange(roundId)}
              />

              {/* Node Statistics */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">节点统计</h2>
                    <p className="text-sm text-slate-500">
                      当前任务轮：{selectedRoundDisplayName}（节点数：{nodeStatsSummary?.nodeCount ?? nodeCount}）
                    </p>
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

                {nodeStatsSummary && (
                  <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <NodeSummaryTile label="总请求次数" value={formatNumber(nodeStatsSummary.totalRequests)} />
                    <NodeSummaryTile label="已分配任务" value={formatNumber(nodeStatsSummary.totalAssignedTasks)} />
                    <NodeSummaryTile label="进行中任务" value={formatNumber(nodeStatsSummary.totalActiveTasks)} />
                    <NodeSummaryTile label="总处理项数" value={formatNumber(nodeStatsSummary.totalItemNum)} />
                    <NodeSummaryTile label="总运行时间" value={formatSeconds(nodeStatsSummary.totalRunningTime)} />
                    <NodeSummaryTile label="平均速度" value={formatSpeed(nodeStatsSummary.averageSpeed, "项/秒")} />
                    <NodeSummaryTile
                      label="平均运行时间"
                      value={formatSeconds(nodeStatsSummary.averageRunningTime)}
                      subValue={
                        nodeStatsSummary.averageItemNum !== null
                          ? `单次平均处理 ${formatNumber(nodeStatsSummary.averageItemNum)} 项`
                          : undefined
                      }
                    />
                  </div>
                )}

                {nodeStatsError && (
                  <div className="mb-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{nodeStatsError}</div>
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
                          <th className="px-4 py-3">请求次数</th>
                          <th className="px-4 py-3">已分配任务</th>
                          <th className="px-4 py-3">进行中任务</th>
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
                          const latestRecord = node.recentRecords[node.recentRecords.length - 1] ?? null;
                          const latestSpeed = latestRecord?.speed ?? null;
                          return (
                            <tr key={node.nodeId} className="hover:bg-slate-50">
                              <td className="max-w-xs truncate px-4 py-3 font-mono text-xs">{node.nodeId}</td>
                                <td className="px-4 py-3">{node.requestCount.toLocaleString()}</td>
                                <td className="px-4 py-3">{node.assignedTaskCount.toLocaleString()}</td>
                                <td className="px-4 py-3">
                                  {node.activeTaskCount === 0 ? (
                                    "0"
                                  ) : (
                                    <div className="flex flex-col gap-1 text-xs">
                                      <span>{node.activeTaskCount.toLocaleString()}</span>
                                      <div className="flex flex-wrap gap-1">
                                        {node.activeTaskIds.slice(0, 3).map((taskId) => (
                                          <span
                                            key={taskId}
                                            className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600"
                                            title={taskId}
                                          >
                                            {taskId}
                                          </span>
                                        ))}
                                        {node.activeTaskIds.length > 3 && (
                                          <span className="text-[10px] text-slate-400">
                                            +{node.activeTaskIds.length - 3}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              <td className="px-4 py-3">{node.totalItemNum.toLocaleString()}</td>
                              <td className="px-4 py-3">{node.totalRunningTime.toFixed(2)}</td>
                              <td className="px-4 py-3">{node.recordCount}</td>
                              <td className="px-4 py-3">{node.avgSpeed.toFixed(4)}</td>
                              <td className="px-4 py-3">{latestSpeed !== null ? latestSpeed.toFixed(4) : "-"}</td>
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
            </div>

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
                  <p className="text-xs text-slate-500">节点每次获取任务时的默认数量（如果节点未指定批次大小）</p>
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
                  <p className="text-xs text-slate-500">节点单次请求可获取的最大任务数量</p>
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
                    清除任务将删除所选范围内所有待处理、处理中、已完成和失败的任务。当前查看：{selectedRoundDisplayName}。此操作不可撤销，请谨慎使用。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void handleClearTasks("selected")}
                      disabled={loading || !selectedRoundId || (selectedRound?.counts.total ?? 0) === 0}
                    >
                      清除当前任务轮
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void handleClearTasks("all")}
                      disabled={loading || rounds.length === 0}
                    >
                      清除全部任务轮
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section
              id="imports"
              className="scroll-mt-24 grid gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2"
            >
              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-slate-900">上传文本文件</h2>
                <p className="text-sm text-slate-600">每行代表一个文件路径。系统会自动过滤空行，并跳过已存在的路径。</p>
                <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600 hover:border-slate-400 hover:bg-slate-100">
                  <input
                    type="file"
                    className="hidden"
                    accept=".txt"
                    multiple
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    disabled={isImporting}
                  />
                  {isImporting ? "导入中..." : "点击或拖拽上传文本文件 (.txt)"}
                </label>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={isImporting}
                >
                  {isImporting ? "处理中..." : "选择文本文件夹"}
                </button>
                <input
                  type="file"
                  className="hidden"
                  accept=".txt"
                  multiple
                  ref={folderInputRef}
                  onChange={handleFileUpload}
                  disabled={isImporting}
                />
              </div>

              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-slate-900">直接粘贴路径</h2>
                <p className="text-sm text-slate-600">支持一次粘贴多行文本，导入后将自动去重。</p>
                <textarea
                  className="min-h-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="例：C:\\data\\file-1.csv"
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

            <section id="task-list" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
                      {TASK_PAGE_SIZE_OPTIONS.map((size) => (
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
                      <th className="w-36 px-4 py-3">任务轮</th>
                      <th className="w-64 px-4 py-3">文件路径</th>
                      <th className="w-24 px-4 py-3">状态</th>
                      <th className="w-36 px-4 py-3">执行节点</th>
                      <th className="w-20 px-4 py-3">失败次数</th>
                      <th className="w-44 px-4 py-3">更新时间</th>
                      <th className="px-4 py-3">备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentTasks.length === 0 ? (
                      <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
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
                          <td className="px-4 py-3 text-xs text-slate-600" title={task.roundId ?? "-"}>
                            {task.roundId ? roundNameById.get(task.roundId) ?? task.roundId : selectedRoundDisplayName}
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
                            <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${statusBadgeStyles[task.status]}`}>
                              {STATUS_OPTIONS.find((o) => o.value === task.status)?.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {task.processingNodeId ? (
                              <span className="font-mono" title={task.processingNodeId}>
                                {task.processingNodeId}
                              </span>
                            ) : (
                              "-"
                            )}
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
          </main>
        </div>
      </div>
    </>
  );
}

