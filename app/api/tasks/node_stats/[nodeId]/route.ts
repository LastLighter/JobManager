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
    console.warn("[节点统计][DELETE] 缺少节点ID参数");
    return NextResponse.json(
      { error: "缺少节点ID" },
      { status: 400 },
    );
  }

  try {
    const result = taskStore.deleteNodeStats(nodeId, roundId);

    if (!result.deleted) {
      console.warn("[节点统计][DELETE] 未找到节点或已经删除", {
        nodeId,
        roundId: roundId ?? null,
      });
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
  } catch (error) {
    console.error("[节点统计][DELETE] 删除节点统计信息失败", {
      nodeId,
      roundId: roundId ?? null,
    }, error);
    return NextResponse.json({ error: "删除节点统计信息失败" }, { status: 500 });
  }
}

