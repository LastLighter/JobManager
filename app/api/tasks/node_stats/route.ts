import { NextRequest, NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

export async function GET(request: NextRequest) {
  const roundId = request.nextUrl.searchParams.get("roundId") ?? undefined;
  const stats = taskStore.getAllNodeStats(roundId);
  const summary = taskStore.getNodeStatsSummary(roundId);

  return NextResponse.json({
    nodes: stats.map((node) => ({
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
    },
    roundId: roundId ?? null,
  });
}

export async function DELETE(request: NextRequest) {
  const roundId = request.nextUrl.searchParams.get("roundId") ?? undefined;
  const result = taskStore.clearNodeStats(roundId);
  return NextResponse.json({
    success: true,
    cleared: result.cleared,
    roundId: roundId ?? null,
  });
}

