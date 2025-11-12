import { NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

export async function DELETE() {
  try {
    const result = taskStore.clearAllTasks();
    return NextResponse.json({ 
      success: true, 
      message: `已清除 ${result.cleared} 个任务`,
      cleared: result.cleared
    });
  } catch (error) {
    console.error("清除任务失败", error);
    return NextResponse.json({ error: "清除任务失败" }, { status: 500 });
  }
}

