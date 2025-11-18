import { NextResponse } from "next/server";

import { taskStore } from "@/lib/taskStore";

const ERROR_STATUS_MAP: Record<string, number> = {
  NO_WEBHOOK: 400,
  REPORTING_DISABLED: 400,
  IN_FLIGHT: 429,
  HTTP_ERROR: 502,
  EXCEPTION: 500,
};

export async function POST() {
  try {
    const result = await taskStore.triggerFeishuReport("manual", { force: true });

    if (!result.ok) {
      const status = ERROR_STATUS_MAP[result.reason] ?? 500;
      const message =
        result.reason === "NO_WEBHOOK"
          ? "尚未配置飞书 Webhook 地址，请先在控制台设置后再试。"
          : result.reason === "REPORTING_DISABLED"
            ? "飞书汇报已禁用，请在控制台启用定时汇报或重新配置间隔。"
            : result.reason === "IN_FLIGHT"
              ? "飞书汇报正在发送中，请稍后再试。"
              : "飞书汇报发送失败，请稍后重试。";
      return NextResponse.json(
        {
          error: message,
          detail: result.error ?? null,
          status: result.status ?? status,
        },
        { status },
      );
    }

    const reportingState = taskStore.getFeishuReportingState();
    return NextResponse.json({
      success: true,
      message: result.message,
      lastReportAt: result.lastReportAt,
      nextReportAt: result.nextReportAt,
      intervalMinutes: result.intervalMinutes,
      reportingState,
    });
  } catch (error) {
    console.error("[飞书汇报][POST] 手动触发失败", error);
    return NextResponse.json(
      { error: "飞书汇报发送失败，请稍后重试。" },
      { status: 500 },
    );
  }
}

