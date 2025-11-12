import { NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

const DEFAULT_BATCH_SIZE = Number.parseInt(process.env.TASK_BATCH_SIZE || "10", 10);
const MAX_BATCH_SIZE = Number.parseInt(process.env.TASK_BATCH_MAX || "1000", 10);

export async function POST(request: Request) {
  const fallbackBatchSize = Number.isNaN(DEFAULT_BATCH_SIZE) ? 10 : DEFAULT_BATCH_SIZE;
  const safeMaxBatchSize = Number.isNaN(MAX_BATCH_SIZE) ? 1000 : MAX_BATCH_SIZE;

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
  const fallbackBatchSize = Number.isNaN(DEFAULT_BATCH_SIZE) ? 10 : DEFAULT_BATCH_SIZE;
  const tasks = taskStore.getTasksForProcessing(fallbackBatchSize);

  return NextResponse.json(
    tasks.map((task) => ({
      task_id: task.id,
      body: task.path,
    })),
  );
}


