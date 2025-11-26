import { NextRequest, NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query")?.trim();
  const roundId = searchParams.get("roundId") ?? undefined;

  if (!query) {
    console.warn("[任务搜索][GET] 缺少查询参数 query");
    return NextResponse.json(
      { error: "缺少查询参数 query" },
      {
        status: 400,
      },
    );
  }

  try {
    const taskInfo = taskStore.findTaskByIdOrPath(query, roundId ?? undefined);

    if (!taskInfo) {
      return NextResponse.json(
        { error: "未找到匹配的任务", found: false },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      found: true,
      task: {
        id: taskInfo.task.id,
        path: taskInfo.task.path,
        status: taskInfo.task.status,
        failureCount: taskInfo.task.failureCount,
        message: taskInfo.task.message ?? "",
        createdAt: taskInfo.task.createdAt,
        updatedAt: taskInfo.task.updatedAt,
        processingStartedAt: taskInfo.task.processingStartedAt ?? null,
        processingNodeId: taskInfo.task.processingNodeId ?? null,
        roundId: taskInfo.roundId,
      },
    });
  } catch (error) {
    console.error("[任务搜索][GET] 搜索任务失败", {
      query,
      roundId: roundId ?? null,
    }, error);
    return NextResponse.json({ error: "搜索任务失败" }, { status: 500 });
  }
}

