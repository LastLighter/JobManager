import { NextResponse } from "next/server";

import type { ProcessedInfo } from "@/lib/taskStore";
import { taskStore } from "@/lib/taskStore";

export async function POST(request: Request) {
  let payload: ProcessedInfo;

  try {
    const body = await request.json();
    payload = {
      node_id: body?.node_id,
      item_num: body?.item_num,
      running_time: body?.running_time,
    };
    console.debug("[节点统计][POST] 收到节点处理信息", payload);
  } catch (error) {
    console.warn("[节点统计][POST] 解析请求体失败", error);
    return NextResponse.json(
      { error: "请求体必须是有效的JSON" },
      {
        status: 400,
      },
    );
  }

  if (!payload || typeof payload.node_id !== "string" || payload.node_id.trim() === "") {
    console.warn("[节点统计][POST] 缺少节点ID", payload);
    return NextResponse.json(
      { error: "缺少节点ID" },
      {
        status: 400,
      },
    );
  }

  if (typeof payload.item_num !== "number" || payload.item_num < 0) {
    console.warn("[节点统计][POST] item_num 不合法", payload);
    return NextResponse.json(
      { error: "item_num 必须是非负数字" },
      {
        status: 400,
      },
    );
  }

  if (typeof payload.running_time !== "number" || payload.running_time < 0) {
    console.warn("[节点统计][POST] running_time 不合法", payload);
    return NextResponse.json(
      { error: "running_time 必须是非负数字" },
      {
        status: 400,
      },
    );
  }

  try {
    taskStore.recordNodeProcessedInfo(payload);
  } catch (error) {
    console.error("记录节点统计信息失败:", error);
    return NextResponse.json(
      { error: "记录节点统计信息失败" },
      {
        status: 500,
      },
    );
  }

  console.info("[节点统计][POST] 记录节点处理信息成功", {
    nodeId: payload.node_id,
    itemNum: payload.item_num,
    runningTime: payload.running_time,
  });
  return NextResponse.json({
    success: true,
    node_id: payload.node_id,
  });
}

