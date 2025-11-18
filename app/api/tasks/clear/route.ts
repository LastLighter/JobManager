import { NextRequest, NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

export async function DELETE(request: NextRequest) {
  try {
    const roundId = request.nextUrl.searchParams.get("roundId") ?? undefined;
    if (roundId) {
      console.debug("[任务清理][DELETE] 尝试清理指定任务轮", { roundId });
      const result = taskStore.clearRound(roundId);
      if (!result.ok) {
        console.warn("[任务清理][DELETE] 任务轮不存在，无法清理", { roundId });
        return NextResponse.json({ error: "任务轮不存在" }, { status: 404 });
      }

      console.info("[任务清理][DELETE] 成功清理任务轮", { roundId, cleared: result.cleared });
      return NextResponse.json({
        success: true,
        message: `已删除任务轮 ${roundId}，共清除 ${result.cleared} 个任务`,
        cleared: result.cleared,
        roundId,
      });
    }

    const cleared = taskStore.clearAllRounds();
    console.info("[任务清理][DELETE] 成功清理所有任务轮", { cleared });
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

