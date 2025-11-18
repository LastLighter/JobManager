import { NextResponse } from "next/server";

import type { ProcessedInfo } from "@/lib/taskStore";
import { taskStore } from "@/lib/taskStore";

export async function POST(request: Request) {
  let payload: ProcessedInfo;
  let roundId: string | undefined;

  try {
    const body = await request.json();
    roundId =
      typeof body?.round_id === "string"
        ? body.round_id.trim()
        : typeof body?.roundId === "string"
          ? body.roundId.trim()
          : undefined;
    payload = {
      node_id: body?.node_id,
      item_num: body?.item_num,
      running_time: body?.running_time,
    };
  } catch {
    return NextResponse.json(
      { error: "请求体必须是有效的JSON" },
      {
        status: 400,
      },
    );
  }

  if (!payload || typeof payload.node_id !== "string" || payload.node_id.trim() === "") {
    return NextResponse.json(
      { error: "缺少节点ID" },
      {
        status: 400,
      },
    );
  }

  if (typeof payload.item_num !== "number" || payload.item_num < 0) {
    return NextResponse.json(
      { error: "item_num 必须是非负数字" },
      {
        status: 400,
      },
    );
  }

  if (typeof payload.running_time !== "number" || payload.running_time < 0) {
    return NextResponse.json(
      { error: "running_time 必须是非负数字" },
      {
        status: 400,
      },
    );
  }

  if (!roundId) {
    return NextResponse.json(
      { error: "缺少 round_id" },
      {
        status: 400,
      },
    );
  }

  try {
    taskStore.recordNodeProcessedInfo(payload, roundId);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "No active task round available to record node statistics."
    ) {
      return NextResponse.json(
        { error: "指定的 round_id 没有对应的活动任务轮" },
        {
          status: 409,
        },
      );
    }
    console.error("记录节点统计信息失败:", error);
    return NextResponse.json(
      { error: "记录节点统计信息失败" },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    node_id: payload.node_id,
    round_id: roundId ?? null,
  });
}

