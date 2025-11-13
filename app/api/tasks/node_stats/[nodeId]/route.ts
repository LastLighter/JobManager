import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const { nodeId } = await params;
  const roundId = request.nextUrl.searchParams.get("roundId") ?? undefined;

  if (!nodeId) {
    return NextResponse.json(
      { error: "缺少节点ID" },
      { status: 400 },
    );
  }

  const result = taskStore.deleteNodeStats(nodeId, roundId);

  if (!result.deleted) {
    return NextResponse.json(
      { error: "节点不存在或已被删除" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    nodeId,
    roundId: roundId ?? null,
  });
}

