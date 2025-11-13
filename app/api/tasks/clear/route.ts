import { NextRequest, NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

export async function DELETE(request: NextRequest) {
  try {
    const roundId = request.nextUrl.searchParams.get("roundId") ?? undefined;
    if (roundId) {
      const result = taskStore.clearRound(roundId);
      if (!result.ok) {
        return NextResponse.json({ error: "任务轮不存在" }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        message: `已删除任务轮 ${roundId}，共清除 ${result.cleared} 个任务`,
        cleared: result.cleared,
        roundId,
      });
    }

    const cleared = taskStore.clearAllRounds();
    return NextResponse.json({
      success: true,
      message: `已清除所有任务轮，共 ${cleared} 个任务`,
      cleared,
      roundId: null,
    });
  } catch (error) {
    console.error("清除任务失败", error);
    return NextResponse.json({ error: "清除任务失败" }, { status: 500 });
  }
}

