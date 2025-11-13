// Shared batch size configuration
// In production, this should be stored in a database or persistent storage

interface BatchSizeConfig {
  defaultBatchSize: number;
  maxBatchSize: number;
}

// Initialize from environment variables
const config: BatchSizeConfig = {
  defaultBatchSize: Number.parseInt(process.env.TASK_BATCH_SIZE || "8", 10),
  maxBatchSize: Number.parseInt(process.env.TASK_BATCH_MAX || "1000", 10),
};

// Ensure valid values
if (Number.isNaN(config.defaultBatchSize) || config.defaultBatchSize < 1) {
  config.defaultBatchSize = 8;
}
if (Number.isNaN(config.maxBatchSize) || config.maxBatchSize < 1) {
  config.maxBatchSize = 1000;
}

export function getBatchSizeConfig(): BatchSizeConfig {
  return { ...config };
}

export function updateBatchSizeConfig(updates: Partial<BatchSizeConfig>): BatchSizeConfig {
  if (updates.maxBatchSize !== undefined) {
    const value = Math.floor(updates.maxBatchSize);
    if (value > 0) {
      config.maxBatchSize = value;
      // Ensure defaultBatchSize doesn't exceed maxBatchSize
      if (config.defaultBatchSize > config.maxBatchSize) {
        config.defaultBatchSize = config.maxBatchSize;
      }
    }
  }
  
  if (updates.defaultBatchSize !== undefined) {
    const value = Math.floor(updates.defaultBatchSize);
    if (value > 0 && value <= config.maxBatchSize) {
      config.defaultBatchSize = value;
    }
  }
  
  return { ...config };
}

