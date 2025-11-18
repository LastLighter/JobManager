import { NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

interface TaskStatusPayload {
  task_id: string;
  status: boolean;
  message?: string;
}

export async function POST(request: Request) {
  let payload: TaskStatusPayload;

  try {
    payload = await request.json();
    console.debug("[任务状态][POST] 收到任务状态上报", {
      taskId: payload?.task_id ?? null,
      status: payload?.status ?? null,
      hasMessage: typeof payload?.message === "string" && payload.message.length > 0,
    });
  } catch (error) {
    console.warn("[任务状态][POST] 解析请求体失败", error);
    return NextResponse.json(
      { error: "请求体必须是有效的JSON" },
      {
        status: 400,
      },
    );
  }

  if (!payload || typeof payload.task_id !== "string" || payload.task_id.trim() === "") {
    console.warn("[任务状态][POST] 缺少任务ID", payload);
    return NextResponse.json(
      { error: "缺少任务ID" },
      {
        status: 400,
      },
    );
  }

  if (typeof payload.status !== "boolean") {
    console.warn("[任务状态][POST] 状态字段不合法", payload);
    return NextResponse.json(
      { error: "缺少任务状态或状态类型不正确" },
      {
        status: 400,
      },
    );
  }

  try {
    const result = taskStore.updateTaskStatus(
      payload.task_id,
      payload.status,
      payload.message ?? "",
    );

    if (!result.ok) {
      console.warn("[任务状态][POST] 更新失败，任务不存在", { taskId: payload.task_id });
      return NextResponse.json(
        { error: "任务不存在" },
        {
          status: 404,
        },
      );
    }

    const taskInfo = taskStore.findTaskByIdOrPath(payload.task_id);
    console.info("[任务状态][POST] 更新任务状态成功", {
      taskId: payload.task_id,
      status: result.status,
      roundId: taskInfo?.roundId ?? null,
    });

    return NextResponse.json({
      task_id: payload.task_id,
      status: result.status,
      round_id: taskInfo?.roundId ?? null,
    });
  } catch (error) {
    console.error("[任务状态][POST] 更新任务状态失败", {
      taskId: payload.task_id,
      status: payload.status,
    }, error);
    return NextResponse.json({ error: "更新任务状态失败" }, { status: 500 });
  }
}


