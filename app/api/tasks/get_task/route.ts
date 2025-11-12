import { NextResponse } from "next/server";

import { getBatchSizeConfig } from "@/lib/batchSizeConfig";
import { taskStore } from "@/lib/taskStore";

export async function POST(request: Request) {
  const config = getBatchSizeConfig();
  const fallbackBatchSize = config.defaultBatchSize;
  const safeMaxBatchSize = config.maxBatchSize;

  let requestedBatchSize: number | undefined;

  try {
    const body = await request.json();
    if (body && typeof body.batchSize === "number" && Number.isFinite(body.batchSize)) {
      requestedBatchSize = Math.max(1, Math.floor(body.batchSize));
    }
  } catch {
    // Ignore JSON parse errors; fall back to default batch size.
  }

  const size = Math.min(requestedBatchSize ?? fallbackBatchSize, safeMaxBatchSize);
  const tasks = taskStore.getTasksForProcessing(size);

  return NextResponse.json(
    tasks.map((task) => ({
      task_id: task.id,
      body: task.path,
    })),
  );
}

export async function GET() {
  // Provide a lightweight way to request tasks without a body.
  const config = getBatchSizeConfig();
  const fallbackBatchSize = config.defaultBatchSize;
  const tasks = taskStore.getTasksForProcessing(fallbackBatchSize);

  return NextResponse.json(
    tasks.map((task) => ({
      task_id: task.id,
      body: task.path,
    })),
  );
}


