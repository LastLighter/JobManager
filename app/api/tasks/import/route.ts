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
      const fileEntries = formData.getAll("files");
      const blobs = fileEntries.length > 0 ? fileEntries : [formData.get("file")];

      const createdRounds = [];
      let totalAdded = 0;
      let totalSkipped = 0;
      let processedFileCount = 0;

      for (const item of blobs) {
        if (!(item instanceof Blob)) {
          console.warn("[任务导入][POST] 跳过非文件类型条目");
          continue;
        }
        const name = "name" in item && typeof item.name === "string" ? item.name : undefined;
        if (name && !name.toLowerCase().endsWith(".txt")) {
          console.warn("[任务导入][POST] 跳过非 txt 文件", { fileName: name });
          continue;
        }

        const text = await item.text();
        const paths = extractPathsFromText(text);
        processedFileCount += 1;
        if (paths.length === 0) {
          totalSkipped += 1;
          continue;
        }

        const roundResult = taskStore.createRoundFromPaths(paths, {
          name,
          sourceType: fileEntries.length > 0 ? "folder" : "file",
          sourceHint: name,
          activate: createdRounds.length === 0,
        });
        totalAdded += roundResult.added;
        totalSkipped += roundResult.skipped;
        createdRounds.push({
          ...roundResult,
          counts: taskStore.getRoundSummary(roundResult.roundId)?.counts ?? roundResult.counts,
        });
      }

      if (createdRounds.length === 0) {
        console.warn("[任务导入][POST] 未找到任何可用任务路径", {
          processedFileCount,
          totalSkipped,
        });
        return NextResponse.json(
          { error: processedFileCount === 0 ? "未找到可处理的文本文件" : "未检测到有效的任务路径" },
          { status: 400 },
        );
      }

      return NextResponse.json({
        rounds: createdRounds,
        totalAdded,
        totalSkipped,
      });
    }

    if (contentType.includes("application/json")) {
      const body = await request.json();
      if (!body || !Array.isArray(body.paths)) {
        console.warn("[任务导入][POST] JSON 请求缺少 paths 数组", { body });
        return NextResponse.json({ error: "JSON格式应包含paths数组" }, { status: 400 });
      }
      const paths = body.paths.filter((item: unknown) => typeof item === "string") as string[];
      if (paths.length === 0) {
        console.warn("[任务导入][POST] JSON 请求 paths 为空");
        return NextResponse.json({ error: "未检测到任何路径" }, { status: 400 });
      }
      const roundResult = taskStore.createRoundFromPaths(paths, {
        name: typeof body.name === "string" ? body.name : undefined,
        sourceType: "manual",
        sourceHint: "manual-json",
        activate: true,
      });
      return NextResponse.json({
        rounds: [
          {
            ...roundResult,
            counts: taskStore.getRoundSummary(roundResult.roundId)?.counts ?? roundResult.counts,
          },
        ],
        totalAdded: roundResult.added,
        totalSkipped: roundResult.skipped,
      });
    }

    const text = await request.text();
    const paths = extractPathsFromText(text);
    if (paths.length === 0) {
      console.warn("[任务导入][POST] 文本请求未包含有效路径");
      return NextResponse.json({ error: "未检测到任何路径" }, { status: 400 });
    }
    const roundResult = taskStore.createRoundFromPaths(paths, {
      sourceType: "manual",
      sourceHint: "manual-text",
      activate: true,
    });
    return NextResponse.json({
      rounds: [
        {
          ...roundResult,
          counts: taskStore.getRoundSummary(roundResult.roundId)?.counts ?? roundResult.counts,
        },
      ],
      totalAdded: roundResult.added,
      totalSkipped: roundResult.skipped,
    });
  } catch (error) {
    console.error("导入任务失败", error);
    return NextResponse.json({ error: "导入任务失败" }, { status: 500 });
  }
}


