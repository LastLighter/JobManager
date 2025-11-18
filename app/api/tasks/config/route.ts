import { NextRequest, NextResponse } from "next/server";

import { getBatchSizeConfig, updateBatchSizeConfig } from "@/lib/batchSizeConfig";
import { taskStore } from "@/lib/taskStore";

export async function GET() {
  const config = getBatchSizeConfig();
  const reportingState = taskStore.getFeishuReportingState();
  console.debug("[任务配置][GET] 返回任务批次配置", { ...config, reportingState });
  return NextResponse.json({
    ...config,
    feishuLastReportAt: reportingState.lastReportAt,
    feishuNextReportAt: reportingState.nextReportAt,
    feishuReportingEnabled: reportingState.reportingEnabled,
    feishuReportInFlight: reportingState.inFlight,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.debug("[任务配置][POST] 收到配置更新请求", body);
    const currentConfig = getBatchSizeConfig();
    const updates: Partial<ReturnType<typeof getBatchSizeConfig>> = {};
    
    // Validate maxBatchSize
    if (body.maxBatchSize !== undefined) {
      const value = Number(body.maxBatchSize);
      if (!Number.isFinite(value) || value < 1) {
        console.warn("[任务配置][POST] 最大批次大小不合法", { maxBatchSize: body.maxBatchSize });
        return NextResponse.json(
          { error: "最大批次大小必须大于 0" },
          { status: 400 }
        );
      }
      updates.maxBatchSize = Math.floor(value);
    }

    // Validate defaultBatchSize (use pending max value if provided)
    if (body.defaultBatchSize !== undefined) {
      const value = Number(body.defaultBatchSize);
      const targetMax = updates.maxBatchSize ?? currentConfig.maxBatchSize;
      if (!Number.isFinite(value) || value < 1 || value > targetMax) {
        console.warn("[任务配置][POST] 默认批次大小不合法", {
          defaultBatchSize: body.defaultBatchSize,
          targetMax,
        });
        return NextResponse.json(
          { error: `默认批次大小必须在 1 到 ${targetMax} 之间` },
          { status: 400 },
        );
      }
      updates.defaultBatchSize = Math.floor(value);
    }

    if (body.feishuWebhookUrl !== undefined) {
      if (body.feishuWebhookUrl === null) {
        updates.feishuWebhookUrl = null;
      } else if (typeof body.feishuWebhookUrl === "string") {
        const trimmed = body.feishuWebhookUrl.trim();
        if (trimmed.length === 0) {
          updates.feishuWebhookUrl = null;
        } else if (!/^https:\/\//i.test(trimmed)) {
          console.warn("[任务配置][POST] 飞书 Webhook 地址格式错误", { feishuWebhookUrl: body.feishuWebhookUrl });
          return NextResponse.json(
            { error: "飞书 Webhook 地址需以 https:// 开头" },
            { status: 400 },
          );
        } else {
          updates.feishuWebhookUrl = trimmed;
        }
      } else {
        console.warn("[任务配置][POST] 飞书 Webhook 地址类型错误", { feishuWebhookUrl: body.feishuWebhookUrl });
        return NextResponse.json(
          { error: "飞书 Webhook 地址格式不正确" },
          { status: 400 },
        );
      }
    }

    if (body.feishuReportIntervalMinutes !== undefined) {
      const value = Number(body.feishuReportIntervalMinutes);
      if (!Number.isFinite(value) || value < 0) {
        console.warn("[任务配置][POST] 飞书汇报间隔不合法", {
          feishuReportIntervalMinutes: body.feishuReportIntervalMinutes,
        });
        return NextResponse.json(
          { error: "飞书汇报间隔必须大于等于 0" },
          { status: 400 },
        );
      }
      updates.feishuReportIntervalMinutes = Math.floor(value);
    }

    if (updates.maxBatchSize !== undefined && updates.defaultBatchSize !== undefined) {
      if (updates.defaultBatchSize > updates.maxBatchSize) {
        console.warn("[任务配置][POST] 默认批次大小超过最大值", {
          defaultBatchSize: updates.defaultBatchSize,
          maxBatchSize: updates.maxBatchSize,
        });
        return NextResponse.json(
          { error: `默认批次大小必须在 1 到 ${updates.maxBatchSize} 之间` },
          { status: 400 }
        );
      }
    }
    
    const updatedConfig = updateBatchSizeConfig(updates);
    taskStore.applyFeishuConfig(updatedConfig);
    const reportingState = taskStore.getFeishuReportingState();
    
    console.info("[任务配置][POST] 更新任务配置成功", { updatedConfig, reportingState });
    return NextResponse.json({
      success: true,
      ...updatedConfig,
      feishuLastReportAt: reportingState.lastReportAt,
      feishuNextReportAt: reportingState.nextReportAt,
      feishuReportingEnabled: reportingState.reportingEnabled,
      feishuReportInFlight: reportingState.inFlight,
    });
  } catch (error) {
    console.error("更新配置失败", error);
    return NextResponse.json({ error: "更新配置失败" }, { status: 500 });
  }
}

