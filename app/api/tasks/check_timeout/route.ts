import { NextRequest, NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.TASK_TIMEOUT_MS || "300000", 10); // 5 minutes

export async function POST(request: NextRequest) {
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  try {
    const body = await request.json();
    if (body && typeof body.timeoutMs === "number" && body.timeoutMs > 0) {
      timeoutMs = body.timeoutMs;
    }
  } catch {
    // Use default timeout
  }

  const requeuedCount = taskStore.checkAndRequeueTimedOutTasks(timeoutMs);

  return NextResponse.json({
    success: true,
    requeuedCount,
    timeoutMs,
  });
}

