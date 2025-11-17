// Shared batch size configuration
// In production, this should be stored in a database or persistent storage

interface TaskManagerConfig {
  defaultBatchSize: number;
  maxBatchSize: number;
  feishuWebhookUrl: string | null;
}

const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_MAX_BATCH_SIZE = 1000;

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }
  return fallback;
}

function sanitizeWebhookUrl(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const initialWebhookEnv =
  [process.env.FEISHU_WEBHOOK_URL, process.env.LARK_WEBHOOK_URL]
    .map((raw) => (typeof raw === "string" ? raw.trim() : ""))
    .find((item) => item.length > 0) ?? null;

const config: TaskManagerConfig = {
  defaultBatchSize: parsePositiveInt(process.env.TASK_BATCH_SIZE, DEFAULT_BATCH_SIZE),
  maxBatchSize: parsePositiveInt(process.env.TASK_BATCH_MAX, DEFAULT_MAX_BATCH_SIZE),
  feishuWebhookUrl: sanitizeWebhookUrl(initialWebhookEnv),
};

if (config.defaultBatchSize > config.maxBatchSize) {
  config.defaultBatchSize = config.maxBatchSize;
}

export function getBatchSizeConfig(): TaskManagerConfig {
  return { ...config };
}

export function updateBatchSizeConfig(updates: Partial<TaskManagerConfig>): TaskManagerConfig {
  if (updates.maxBatchSize !== undefined) {
    const value = parsePositiveInt(updates.maxBatchSize, config.maxBatchSize);
    if (value > 0) {
      config.maxBatchSize = value;
      if (config.defaultBatchSize > config.maxBatchSize) {
        config.defaultBatchSize = config.maxBatchSize;
      }
    }
  }

  if (updates.defaultBatchSize !== undefined) {
    const value = parsePositiveInt(updates.defaultBatchSize, config.defaultBatchSize);
    if (value > 0) {
      config.defaultBatchSize = Math.min(value, config.maxBatchSize);
    }
  }

  if (updates.feishuWebhookUrl !== undefined) {
    config.feishuWebhookUrl = sanitizeWebhookUrl(updates.feishuWebhookUrl);
  }

  return { ...config };
}

export function getFeishuWebhookUrl(): string | null {
  return config.feishuWebhookUrl;
}