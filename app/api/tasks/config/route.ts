import { NextRequest, NextResponse } from "next/server";

import { getBatchSizeConfig, updateBatchSizeConfig } from "@/lib/batchSizeConfig";

export async function GET() {
  const config = getBatchSizeConfig();
  return NextResponse.json(config);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const currentConfig = getBatchSizeConfig();
    
    // Validate defaultBatchSize
    if (body.defaultBatchSize !== undefined) {
      const value = Number(body.defaultBatchSize);
      if (!Number.isFinite(value) || value < 1 || value > currentConfig.maxBatchSize) {
        return NextResponse.json(
          { error: `默认批次大小必须在 1 到 ${currentConfig.maxBatchSize} 之间` },
          { status: 400 }
        );
      }
    }
    
    // Validate maxBatchSize
    if (body.maxBatchSize !== undefined) {
      const value = Number(body.maxBatchSize);
      if (!Number.isFinite(value) || value < 1) {
        return NextResponse.json(
          { error: "最大批次大小必须大于 0" },
          { status: 400 }
        );
      }
    }
    
    const updatedConfig = updateBatchSizeConfig(body);
    
    return NextResponse.json({
      success: true,
      ...updatedConfig,
    });
  } catch (error) {
    console.error("更新配置失败", error);
    return NextResponse.json({ error: "更新配置失败" }, { status: 500 });
  }
}

