import { NextRequest, NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.TASK_TIMEOUT_MS || "900000", 10); // 15 minutes

export async function POST(request: NextRequest) {
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let roundId: string | undefined;

  try {
    const body = await request.json();
    if (body && typeof body.timeoutMs === "number" && body.timeoutMs > 0) {
      timeoutMs = body.timeoutMs;
    }
    if (body && typeof body.roundId === "string" && body.roundId.trim() !== "") {
      roundId = body.roundId.trim();
    }
  } catch (error) {
    console.warn("[任务超时检查][POST] 解析请求体失败，使用默认超时阈值", error);
  }

  try {
    const failedCount = taskStore.failTimedOutTasks(timeoutMs, roundId);
    console.info("[任务超时检查][POST] 标记超时任务完成", {
      timeoutMs,
      roundId: roundId ?? null,
      failedCount,
    });

    return NextResponse.json({
      success: true,
      failedCount,
      timeoutMs,
      roundId: roundId ?? null,
    });
  } catch (error) {
    console.error("[任务超时检查][POST] 标记超时任务失败", {
      timeoutMs,
      roundId: roundId ?? null,
    }, error);

    return NextResponse.json({ error: "标记超时任务失败" }, { status: 500 });
  }
}

