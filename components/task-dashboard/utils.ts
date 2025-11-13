import type { AggregatedPerformanceRecord, NodePerformanceRecordItem } from "./types";

export function formatDate(timestamp: number | null | undefined) {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function formatDuration(milliseconds: number | null) {
  if (milliseconds === null || milliseconds < 0) {
    return "-";
  }
  const totalSecondsPrecise = milliseconds / 1000;
  const hours = Math.floor(totalSecondsPrecise / 3600);
  const minutes = Math.floor((totalSecondsPrecise % 3600) / 60);
  const seconds = totalSecondsPrecise - hours * 3600 - minutes * 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} 小时`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} 分`);
  }
  if (seconds > 0 || parts.length === 0) {
    const secondText = seconds >= 10 ? Math.round(seconds).toString() : seconds.toFixed(2);
    parts.push(`${secondText} 秒`);
  }
  return parts.join(" ");
}

export function formatSeconds(seconds: number | null) {
  if (seconds === null || seconds < 0) {
    return "-";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds - hours * 3600 - minutes * 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} 小时`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} 分`);
  }
  if (remainingSeconds > 0 || parts.length === 0) {
    const secondText =
      remainingSeconds >= 10 ? Math.round(remainingSeconds).toString() : remainingSeconds.toFixed(2);
    parts.push(`${secondText} 秒`);
  }
  return parts.join(" ");
}

export function formatSpeed(value: number | null, unit: string) {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) {
    return "-";
  }
  const precision = value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${unit}`;
}

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return Number(value).toLocaleString();
}

export function groupRecordsForTrend(
  records: NodePerformanceRecordItem[],
  groupSize = 6,
): AggregatedPerformanceRecord[] {
  if (!records.length) {
    return [];
  }

  const effectiveGroupSize = Math.max(1, groupSize);
  const groups: AggregatedPerformanceRecord[] = [];

  for (let index = 0; index < records.length; index += effectiveGroupSize) {
    const slice = records.slice(index, index + effectiveGroupSize);
    if (slice.length === 0) continue;

    const totalItemNum = slice.reduce((sum, record) => sum + record.itemNum, 0);
    const totalRunningTime = slice.reduce((sum, record) => sum + record.runningTime, 0);
    const avgSpeed =
      totalRunningTime > 0
        ? totalItemNum / totalRunningTime
        : slice.reduce((sum, record) => sum + record.speed, 0) / slice.length;

    groups.push({
      startTimestamp: slice[0].timestamp,
      endTimestamp: slice[slice.length - 1].timestamp,
      avgSpeed: Number.isFinite(avgSpeed) ? avgSpeed : 0,
      totalItemNum,
      totalRunningTime,
      count: slice.length,
    });
  }

  return groups;
}

