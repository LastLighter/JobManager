import { NextRequest, NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

export async function GET(request: NextRequest) {
  const roundId = request.nextUrl.searchParams.get("roundId") ?? undefined;
  const pageParam = Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10);
  const pageSizeParam = Number.parseInt(request.nextUrl.searchParams.get("pageSize") ?? "10", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? Math.min(pageSizeParam, 200) : 10;

  try {
    const {
      nodes,
      total,
      page: effectivePage,
      healthStats,
    } = taskStore.getNodeStatsPage(page, pageSize, roundId);
    const summary = taskStore.getNodeStatsSummary(roundId);
    const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));

    return NextResponse.json({
      nodes: nodes.map((node) => ({
        nodeId: node.nodeId,
        totalItemNum: node.totalItemNum,
        totalRunningTime: node.totalRunningTime,
        recordCount: node.recordCount,
        avgSpeed: node.avgSpeed,
        avgTimePer100Items: node.avgTimePer100Items,
        lastUpdated: node.lastUpdated,
        recentRecords: node.recentRecords,
        requestCount: node.requestCount,
        assignedTaskCount: node.assignedTaskCount,
        activeTaskCount: node.activeTaskIds.length,
      })),
      summary: summary ?? {
        nodeCount: 0,
        totalItemNum: 0,
        totalRunningTime: 0,
        recordCount: 0,
        averageSpeed: null,
        averageTimePer100Items: null,
        averageItemNum: null,
        totalRequests: 0,
        totalAssignedTasks: 0,
        totalActiveTasks: 0,
        healthStats: {
          healthy: 0,
          subHealthy: 0,
          unhealthy: 0,
        },
      },
      roundId: roundId ?? null,
      page: effectivePage,
      pageSize,
      total,
      totalPages,
      healthStats,
    });
  } catch (error) {
    console.error("[节点统计][GET] 获取节点统计失败", {
      roundId: roundId ?? null,
      page,
      pageSize,
    }, error);
    return NextResponse.json({ error: "获取节点统计失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const roundId = request.nextUrl.searchParams.get("roundId") ?? undefined;
  try {
    const result = taskStore.clearNodeStats(roundId);
    return NextResponse.json({
      success: true,
      cleared: result.cleared,
      roundId: roundId ?? null,
    });
  } catch (error) {
    console.error("[节点统计][DELETE] 清理节点统计失败", {
      roundId: roundId ?? null,
    }, error);
    return NextResponse.json({ error: "清理节点统计失败" }, { status: 500 });
  }
}

