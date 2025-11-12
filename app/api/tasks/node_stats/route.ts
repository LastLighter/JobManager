import { NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

export async function GET() {
  const stats = taskStore.getAllNodeStats();

  return NextResponse.json({
    nodes: stats.map((node) => ({
      nodeId: node.nodeId,
      totalItemNum: node.totalItemNum,
      totalRunningTime: node.totalRunningTime,
      recordCount: node.recordCount,
      avgSpeed: node.avgSpeed,
      lastUpdated: node.lastUpdated,
    })),
  });
}

