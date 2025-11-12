import { NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

export async function DELETE(
  _request: Request,
  context: { params: { nodeId: string } },
) {
  const nodeId = context.params.nodeId;

  if (!nodeId) {
    return NextResponse.json(
      { error: "缺少节点ID" },
      { status: 400 },
    );
  }

  const result = taskStore.deleteNodeStats(nodeId);

  if (!result.deleted) {
    return NextResponse.json(
      { error: "节点不存在或已被删除" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    nodeId,
  });
}

