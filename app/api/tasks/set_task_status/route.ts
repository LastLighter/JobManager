import { NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

const FAILURE_THRESHOLD = Number.parseInt(process.env.TASK_FAILURE_THRESHOLD || "2", 10);

interface TaskStatusPayload {
  task_id: string;
  status: boolean;
  message?: string;
}

export async function POST(request: Request) {
  let payload: TaskStatusPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体必须是有效的JSON" },
      {
        status: 400,
      },
    );
  }

  if (!payload || typeof payload.task_id !== "string" || payload.task_id.trim() === "") {
    return NextResponse.json(
      { error: "缺少任务ID" },
      {
        status: 400,
      },
    );
  }

  if (typeof payload.status !== "boolean") {
    return NextResponse.json(
      { error: "缺少任务状态或状态类型不正确" },
      {
        status: 400,
      },
    );
  }

  const failureThreshold = Number.isNaN(FAILURE_THRESHOLD) ? 3 : FAILURE_THRESHOLD;
  const result = taskStore.updateTaskStatus(
    payload.task_id,
    payload.status,
    payload.message ?? "",
    failureThreshold,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: "任务不存在" },
      {
        status: 404,
      },
    );
  }

  const taskInfo = taskStore.findTaskByIdOrPath(payload.task_id);

  return NextResponse.json({
    task_id: payload.task_id,
    status: result.status,
    round_id: taskInfo?.roundId ?? null,
  });
}


