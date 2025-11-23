import { NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

interface TaskStatusPayload {
  task_id?: string;
  status?: boolean;
  stautus?: boolean;
  message?: string;
  node_id?: string;
  round_id?: string;
  item_num?: number;
}

export async function POST(request: Request) {
  let payload: TaskStatusPayload;

  try {
    const body = await request.json();
    payload = {
      task_id: typeof body?.task_id === "string" ? body.task_id : undefined,
      status: typeof body?.status === "boolean" ? body.status : undefined,
      stautus: typeof body?.stautus === "boolean" ? body.stautus : undefined,
      message: typeof body?.message === "string" ? body.message : undefined,
      node_id: typeof body?.node_id === "string" ? body.node_id.trim() : undefined,
      round_id: typeof body?.round_id === "string" ? body.round_id.trim() : undefined,
      item_num: typeof body?.item_num === "number" ? body.item_num : undefined,
    };
    if (typeof payload.status !== "boolean" && typeof payload.stautus === "boolean") {
      payload.status = payload.stautus;
    }
    console.debug("[任务状态][POST] 收到任务状态上报", {
      taskId: payload?.task_id ?? null,
      status: payload?.status ?? null,
      nodeId: payload?.node_id ?? null,
      roundId: payload?.round_id ?? null,
      itemNum: payload?.item_num ?? null,
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

  const normalizedTaskId = payload.task_id.trim();

  if (typeof payload.status !== "boolean") {
    console.warn("[任务状态][POST] 状态字段不合法", payload);
    return NextResponse.json(
      { error: "缺少任务状态或状态类型不正确" },
      {
        status: 400,
      },
    );
  }

  const normalizedItemNum =
    typeof payload.item_num === "number" && Number.isFinite(payload.item_num) && payload.item_num >= 0
      ? payload.item_num
      : 0;
  const normalizedNodeId =
    typeof payload.node_id === "string" && payload.node_id.trim().length > 0
      ? payload.node_id.trim()
      : null;

  try {
    if (normalizedNodeId) {
      taskStore.recordNodeHeartbeat(normalizedNodeId);
    }
    const result = taskStore.updateTaskStatus(
      normalizedTaskId,
      payload.status,
      payload.message ?? "",
      normalizedItemNum,
    );

    if (!result.ok) {
      console.warn("[任务状态][POST] 更新失败，任务不存在", { taskId: normalizedTaskId });
      return NextResponse.json(
        { error: "任务不存在" },
        {
          status: 404,
        },
      );
    }

    const taskInfo = taskStore.findTaskByIdOrPath(normalizedTaskId);
    console.info("[任务状态][POST] 更新任务状态成功", {
      taskId: normalizedTaskId,
      status: result.status,
      roundId: taskInfo?.roundId ?? null,
      nodeId: normalizedNodeId,
      itemNum: normalizedItemNum,
    });

    return NextResponse.json({
      task_id: normalizedTaskId,
      status: result.status,
      round_id: taskInfo?.roundId ?? null,
      item_num: normalizedItemNum,
      node_id: normalizedNodeId,
    });
  } catch (error) {
    console.error("[任务状态][POST] 更新任务状态失败", {
      taskId: normalizedTaskId,
      status: payload.status,
      nodeId: normalizedNodeId,
    }, error);
    return NextResponse.json({ error: "更新任务状态失败" }, { status: 500 });
  }
}


