import { NextResponse } from "next/server";

import type { ProcessedInfo } from "@/lib/taskStore";
import { taskStore } from "@/lib/taskStore";

export async function POST(request: Request) {
  let payload: ProcessedInfo;

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

  taskStore.recordNodeProcessedInfo(payload);

  return NextResponse.json({
    success: true,
    node_id: payload.node_id,
  });
}

