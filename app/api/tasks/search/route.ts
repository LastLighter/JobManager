import { NextRequest, NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query")?.trim();

  if (!query) {
    return NextResponse.json(
      { error: "缺少查询参数 query" },
      {
        status: 400,
      },
    );
  }

  const task = taskStore.findTaskByIdOrPath(query);

  if (!task) {
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
      id: task.id,
      path: task.path,
      status: task.status,
      failureCount: task.failureCount,
      message: task.message ?? "",
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      processingStartedAt: task.processingStartedAt ?? null,
    },
  });
}

