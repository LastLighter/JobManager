import { NextRequest, NextResponse } from "next/server";

import type { TaskStatus } from "@/lib/taskStore";
import { taskStore } from "@/lib/taskStore";

const DEFAULT_PAGE_SIZE = Number.parseInt(process.env.TASK_PAGE_SIZE || "20", 10);
const MAX_PAGE_SIZE = Number.parseInt(process.env.TASK_PAGE_MAX || "200", 10);
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.TASK_TIMEOUT_MS || "900000", 10);
const ROUND_PAGE_SIZE_MAX = 50;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const statusParam = (searchParams.get("status") ?? "pending").toLowerCase();
  const status = (["pending", "processing", "completed", "failed", "all"].includes(statusParam)
    ? statusParam
    : "pending") as TaskStatus | "all";

  const page = Math.max(Number.parseInt(searchParams.get("page") ?? "1", 10), 1);

  const basePageSize = Number.isNaN(DEFAULT_PAGE_SIZE) ? 20 : DEFAULT_PAGE_SIZE;
  const maxPageSize = Number.isNaN(MAX_PAGE_SIZE) ? 200 : MAX_PAGE_SIZE;
  const requestedPageSize = Number.parseInt(searchParams.get("pageSize") ?? `${basePageSize}`, 10);
  const pageSize = Math.min(Math.max(1, requestedPageSize), maxPageSize);

  const roundPage = Math.max(Number.parseInt(searchParams.get("roundPage") ?? "1", 10), 1);
  const requestedRoundPageSize = Number.parseInt(searchParams.get("roundPageSize") ?? "10", 10);
  const roundPageSize = Math.min(Math.max(1, requestedRoundPageSize), ROUND_PAGE_SIZE_MAX);

  const requestedTimeoutMs = Number.parseInt(searchParams.get("timeoutMs") ?? "0", 10);
  const timeoutMs =
    Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0 ? requestedTimeoutMs : DEFAULT_TIMEOUT_MS;

  const requestedRoundId = searchParams.get("roundId") ?? undefined;
  const allRounds = taskStore.listRounds();
  const activeRoundId = taskStore.getActiveRoundId();
  const aggregateCounts = allRounds.reduce(
    (acc, round) => {
      acc.total += round.counts.total;
      acc.pending += round.counts.pending;
      acc.processing += round.counts.processing;
      acc.completed += round.counts.completed;
      acc.failed += round.counts.failed;
      return acc;
    },
    { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 },
  );
  const roundStatusCounts = {
    pending: allRounds.filter((round) => round.status === "pending").length,
    active: allRounds.filter((round) => round.status === "active").length,
    completed: allRounds.filter((round) => round.status === "completed").length,
  };
  const knownRoundIds = new Set(allRounds.map((round) => round.id));

  let selectedRoundId: string | null = null;
  if (requestedRoundId && knownRoundIds.has(requestedRoundId)) {
    selectedRoundId = requestedRoundId;
  } else if (activeRoundId && knownRoundIds.has(activeRoundId)) {
    selectedRoundId = activeRoundId;
  } else if (allRounds.length > 0) {
    selectedRoundId = allRounds[0].id;
  }

  const counts = taskStore.getCounts(selectedRoundId ?? undefined);

  let targetPage = page;
  let paginated = taskStore.listTasksByStatus(status, targetPage, pageSize, selectedRoundId ?? undefined);
  const maxPage = Math.max(1, Math.ceil((paginated.total || 0) / pageSize));
  const runStats = taskStore.getRunStatistics(selectedRoundId ?? undefined);

  if (targetPage > maxPage) {
    targetPage = maxPage;
    paginated = taskStore.listTasksByStatus(status, targetPage, pageSize, selectedRoundId ?? undefined);
  }

  const totalRounds = allRounds.length;
  const maxRoundPage = Math.max(1, Math.ceil(totalRounds / roundPageSize));
  const currentRoundPage = Math.min(roundPage, maxRoundPage);
  const roundPageStart = (currentRoundPage - 1) * roundPageSize;
  const paginatedRounds = allRounds.slice(roundPageStart, roundPageStart + roundPageSize);
  const selectedRoundIndex = selectedRoundId
    ? allRounds.findIndex((round) => round.id === selectedRoundId)
    : -1;
  const selectedRoundPage =
    selectedRoundIndex >= 0 ? Math.floor(selectedRoundIndex / roundPageSize) + 1 : null;

  const timeoutInspection = taskStore.inspectProcessingTasks(timeoutMs, selectedRoundId ?? undefined);

  return NextResponse.json({
    status,
    page: targetPage,
    pageSize,
    total: paginated.total,
    counts,
    tasks: paginated.tasks.map((task) => ({
      id: task.id,
      roundId: selectedRoundId,
      path: task.path,
      status: task.status,
      failureCount: task.failureCount,
      message: task.message ?? "",
      updatedAt: task.updatedAt,
      createdAt: task.createdAt,
      processingStartedAt: task.processingStartedAt ?? null,
    })),
    runStats,
    rounds: paginatedRounds,
    currentRoundId: selectedRoundId,
    roundStats: {
      totalRounds,
      statusCounts: roundStatusCounts,
      aggregateTaskCounts: aggregateCounts,
    },
    roundPagination: {
      page: currentRoundPage,
      pageSize: roundPageSize,
      total: totalRounds,
      totalPages: maxRoundPage,
      selectedRoundPage,
    },
    timeoutMetrics: {
      thresholdMs: timeoutInspection.aggregate.thresholdMs,
      inspectedAt: timeoutInspection.aggregate.inspectedAt,
      totalProcessing: timeoutInspection.aggregate.totalProcessing,
      timedOutCount: timeoutInspection.aggregate.timedOutCount,
      nearTimeoutCount: timeoutInspection.aggregate.nearTimeoutCount,
      longestDurationMs: timeoutInspection.aggregate.longestDurationMs,
      topTimedOut: timeoutInspection.aggregate.topTimedOut,
      topProcessing: timeoutInspection.aggregate.topProcessing,
      roundSummaries: timeoutInspection.aggregate.roundSummaries,
      selectedRound: timeoutInspection.selectedRound,
    },
    timeoutMs,
  });
}


