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
  } catch {
    // Use default timeout
  }

  const requeuedCount = taskStore.checkAndRequeueTimedOutTasks(timeoutMs, roundId);

  return NextResponse.json({
    success: true,
    requeuedCount,
    timeoutMs,
    roundId: roundId ?? null,
  });
}

