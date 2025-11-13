import { NextResponse } from "next/server";

import { getBatchSizeConfig } from "@/lib/batchSizeConfig";
import { taskStore } from "@/lib/taskStore";

export async function POST(request: Request) {
  const config = getBatchSizeConfig();
  const fallbackBatchSize = config.defaultBatchSize;
  const safeMaxBatchSize = config.maxBatchSize;

  let requestedBatchSize: number | undefined;
  let requestedRoundId: string | undefined;

  try {
    const body = await request.json();
    if (body && typeof body.batchSize === "number" && Number.isFinite(body.batchSize)) {
      requestedBatchSize = Math.max(1, Math.floor(body.batchSize));
    }
    if (body && typeof body.roundId === "string" && body.roundId.trim() !== "") {
      requestedRoundId = body.roundId.trim();
    }
  } catch {
    // Ignore JSON parse errors; fall back to default batch size.
  }

  const size = Math.min(requestedBatchSize ?? fallbackBatchSize, safeMaxBatchSize);
  const tasks = taskStore.getTasksForProcessing(size, requestedRoundId);

  return NextResponse.json(
    tasks.map((task) => ({
      task_id: task.id,
      round_id: task.roundId,
      body: task.path,
    })),
  );
}

export async function GET(request: Request) {
  // Provide a lightweight way to request tasks without a body.
  const config = getBatchSizeConfig();
  const fallbackBatchSize = config.defaultBatchSize;
  const url = new URL(request.url);
  const roundId = url.searchParams.get("roundId") ?? undefined;
  const tasks = taskStore.getTasksForProcessing(fallbackBatchSize, roundId);

  return NextResponse.json(
    tasks.map((task) => ({
      task_id: task.id,
      round_id: task.roundId,
      body: task.path,
    })),
  );
}


