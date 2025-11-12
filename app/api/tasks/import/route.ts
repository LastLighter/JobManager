import { NextRequest, NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

function extractPathsFromText(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof Blob)) {
        return NextResponse.json({ error: "未找到有效的文件" }, { status: 400 });
      }
      const text = await file.text();
      const paths = extractPathsFromText(text);
      const result = taskStore.enqueueTasksFromPaths(paths);
      return NextResponse.json({ ...result, total: taskStore.getCounts().total });
    }

    if (contentType.includes("application/json")) {
      const body = await request.json();
      if (!body || !Array.isArray(body.paths)) {
        return NextResponse.json({ error: "JSON格式应包含paths数组" }, { status: 400 });
      }
      const paths = body.paths.filter((item: unknown) => typeof item === "string") as string[];
      const result = taskStore.enqueueTasksFromPaths(paths);
      return NextResponse.json({ ...result, total: taskStore.getCounts().total });
    }

    const text = await request.text();
    const paths = extractPathsFromText(text);
    if (paths.length === 0) {
      return NextResponse.json({ error: "未检测到任何路径" }, { status: 400 });
    }
    const result = taskStore.enqueueTasksFromPaths(paths);
    return NextResponse.json({ ...result, total: taskStore.getCounts().total });
  } catch (error) {
    console.error("导入任务失败", error);
    return NextResponse.json({ error: "导入任务失败" }, { status: 500 });
  }
}


