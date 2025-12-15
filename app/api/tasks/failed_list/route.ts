import { NextRequest, NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

const MAX_EXPORT_LIMIT = 200_000;

function sanitizeFileNameSegment(segment: string | null | undefined) {
  if (!segment) {
    return "all-rounds";
  }
  const safe = segment.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return safe.length > 0 ? safe.slice(0, 64) : "all-rounds";
}

function formatCsvValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return '""';
  }
  const text = String(value);
  const needsEscaping = /[",\r\n]/.test(text);
  if (needsEscaping) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return `"${text}"`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const roundId = searchParams.get("roundId") ?? undefined;
  const requestedFormat = (searchParams.get("format") ?? "csv").toLowerCase();
  const limitParam = searchParams.get("limit");
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_EXPORT_LIMIT) : undefined;

  try {
    const failedTasks = taskStore.listFailedTasks({ roundId, limit });

    if (requestedFormat === "json") {
      return NextResponse.json({
        roundId: roundId ?? null,
        total: failedTasks.length,
        tasks: failedTasks.map(({ roundId: rid, task }) => ({
          id: task.id,
          roundId: rid,
          path: task.path,
          failureCount: task.failureCount,
          message: task.message ?? "",
          updatedAt: task.updatedAt,
          createdAt: task.createdAt,
        })),
      });
    }

    const header = ["task_id", "round_id", "file_path", "failure_count", "message"].join(",");
    const rows = failedTasks.map(({ roundId: rid, task }) =>
      [
        formatCsvValue(task.id),
        formatCsvValue(rid),
        formatCsvValue(task.path),
        formatCsvValue(task.failureCount),
        formatCsvValue(task.message ?? ""),
      ].join(","),
    );
    const csvContent = [header, ...rows].join("\r\n");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `failed-tasks-${sanitizeFileNameSegment(roundId)}-${timestamp}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[失败列表][GET] 导出失败任务列表失败", { roundId: roundId ?? null }, error);
    return NextResponse.json({ error: "导出失败任务列表失败" }, { status: 500 });
  }
}











