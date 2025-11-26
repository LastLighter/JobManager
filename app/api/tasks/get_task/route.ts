import { NextResponse } from "next/server";

import { getBatchSizeConfig } from "@/lib/batchSizeConfig";
import { taskStore } from "@/lib/taskStore";

export async function POST(request: Request) {
  const config = getBatchSizeConfig();
  const fallbackBatchSize = config.defaultBatchSize;
  const safeMaxBatchSize = config.maxBatchSize;

  let requestedBatchSize: number | undefined;
  let requestedRoundId: string | undefined;
  let requestedNodeId: string | undefined;

  try {
    const body = await request.json();
    if (body && typeof body.batchSize === "number" && Number.isFinite(body.batchSize)) {
      requestedBatchSize = Math.max(1, Math.floor(body.batchSize));
    }
    if (body && typeof body.roundId === "string" && body.roundId.trim() !== "") {
      requestedRoundId = body.roundId.trim();
    }
    const nodeIdPayload =
      (body && typeof body.node_id === "string" && body.node_id.trim() !== "" && body.node_id.trim()) ||
      (body && typeof body.nodeId === "string" && body.nodeId.trim() !== "" && body.nodeId.trim());
    if (nodeIdPayload) {
      requestedNodeId = nodeIdPayload;
    }
  } catch (error) {
    console.warn("[任务获取][POST] 解析请求体失败，使用默认批次大小与轮次参数", error);
  }

  const size = Math.min(requestedBatchSize ?? fallbackBatchSize, safeMaxBatchSize);

  try {
    const tasks = taskStore.getTasksForProcessing(size, requestedRoundId, requestedNodeId);

    return NextResponse.json(
      tasks.map((task) => ({
        task_id: task.id,
        round_id: task.roundId,
        body: task.path,
      })),
    );
  } catch (error) {
    console.error("[任务获取][POST] 获取任务失败", {
      requestedBatchSize,
      fallbackBatchSize,
      safeMaxBatchSize,
      finalBatchSize: size,
      roundId: requestedRoundId ?? null,
      nodeId: requestedNodeId ?? null,
    }, error);

    return NextResponse.json({ error: "获取任务失败" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  // Provide a lightweight way to request tasks without a body.
  const config = getBatchSizeConfig();
  const fallbackBatchSize = config.defaultBatchSize;
  const url = new URL(request.url);
  const roundId = url.searchParams.get("roundId") ?? undefined;
  const nodeId = url.searchParams.get("node_id") ?? url.searchParams.get("nodeId") ?? undefined;

  try {
    const tasks = taskStore.getTasksForProcessing(fallbackBatchSize, roundId, nodeId ?? undefined);

    return NextResponse.json(
      tasks.map((task) => ({
        task_id: task.id,
        round_id: task.roundId,
        body: task.path,
      })),
    );
  } catch (error) {
    console.error("[任务获取][GET] 获取任务失败", {
      batchSize: fallbackBatchSize,
      roundId: roundId ?? null,
      nodeId: nodeId ?? null,
    }, error);

    return NextResponse.json({ error: "获取任务失败" }, { status: 500 });
  }
}


