import { NextRequest, NextResponse } from "next/server";

import type { TaskStatus } from "@/lib/taskStore";
import { taskStore } from "@/lib/taskStore";

const DEFAULT_PAGE_SIZE = Number.parseInt(process.env.TASK_PAGE_SIZE || "20", 10);
const MAX_PAGE_SIZE = Number.parseInt(process.env.TASK_PAGE_MAX || "200", 10);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const statusParam = (searchParams.get("status") ?? "pending").toLowerCase();
  const status = (["pending", "processing", "completed", "failed", "all"].includes(statusParam)
    ? statusParam
    : "pending") as TaskStatus | "all";

  const page = Math.max(Number.parseInt(searchParams.get("page") ?? "1", 10), 1);

  const basePageSize = Number.isNaN(DEFAULT_PAGE_SIZE) ? 20 : DEFAULT_PAGE_SIZE;
  const maxPageSize = Number.isNaN(MAX_PAGE_SIZE) ? 200 : MAX_PAGE_SIZE;
  const requestedPageSize = Number.parseInt(searchParams.get("pageSize") ?? `${basePageSize}`, 10);
  const pageSize = Math.min(Math.max(1, requestedPageSize), maxPageSize);

  const counts = taskStore.getCounts();

  let targetPage = page;
  let paginated = taskStore.listTasksByStatus(status, targetPage, pageSize);
  const maxPage = Math.max(1, Math.ceil((paginated.total || 0) / pageSize));

  if (targetPage > maxPage) {
    targetPage = maxPage;
    paginated = taskStore.listTasksByStatus(status, targetPage, pageSize);
  }

  return NextResponse.json({
    status,
    page: targetPage,
    pageSize,
    total: paginated.total,
    counts,
    tasks: paginated.tasks.map((task) => ({
      id: task.id,
      path: task.path,
      status: task.status,
      failureCount: task.failureCount,
      message: task.message ?? "",
      updatedAt: task.updatedAt,
      createdAt: task.createdAt,
      processingStartedAt: task.processingStartedAt ?? null,
    })),
  });
}


