import { useMemo } from "react";

import type { AggregatedPerformanceRecord, NodePerformanceRecordItem } from "./types";
import { formatSpeed, groupRecordsForTrend } from "./utils";

export function DetailedSpeedChart({ data }: { data: AggregatedPerformanceRecord[] }) {
  if (!data.length) {
    return <p className="text-sm text-slate-500">暂无速度记录。</p>;
  }

  const width = Math.max(720, data.length * 80);
  const height = 240;
  const padding = { top: 24, right: 24, bottom: 48, left: 64 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const speeds = data.map((record) => record.avgSpeed);
  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);
  const speedRange = maxSpeed - minSpeed;
  const normalizedRange = speedRange === 0 ? 1 : speedRange;

  const points = data.map((record, index) => {
    const x =
      data.length === 1
        ? padding.left + plotWidth / 2
        : padding.left + (index / (data.length - 1)) * plotWidth;
    const normalized = (record.avgSpeed - minSpeed) / normalizedRange;
    const y = padding.top + (1 - normalized) * plotHeight;
    return { x, y, record, index };
  });

  const yTickCount = speedRange === 0 ? 0 : 4;
  const yTickValues =
    speedRange === 0
      ? [minSpeed]
      : Array.from({ length: yTickCount + 1 }, (_, idx) => minSpeed + (speedRange * idx) / yTickCount);

  const labelStep = Math.max(1, Math.floor(data.length / 6));
  const latestPoint = points[points.length - 1];

  const ariaLabel = `节点最近 ${data.length} 个平均速度点，每 6 条记录计算一次平均速度，最新平均速度为 ${latestPoint.record.avgSpeed.toFixed(4)} 项/秒`;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-60 min-w-[640px] text-sky-500"
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
          stroke="#cbd5f5"
          strokeWidth={1}
        />
        {yTickValues.map((value, idx) => {
          const normalized = speedRange === 0 ? 0.5 : (value - minSpeed) / normalizedRange;
          const y = padding.top + (1 - normalized) * plotHeight;
          const precision = value >= 10 ? 1 : 2;
          return (
            <g key={`y-tick-${idx}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 12}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400 text-xs"
              >
                {`${value.toFixed(precision)} 项/秒`}
              </text>
            </g>
          );
        })}

        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
        />

        {points.map((point) => (
          <circle key={`pt-${point.index}`} cx={point.x} cy={point.y} r={3.5} fill="currentColor" />
        ))}

        <text x={latestPoint.x + 8} y={latestPoint.y - 8} className="fill-slate-600 text-xs">
          {`最新 ${formatSpeed(latestPoint.record.avgSpeed, "项/秒")}`}
        </text>

        {points.map((point) => {
          if (point.index % labelStep !== 0 && point.index !== points.length - 1) {
            return null;
          }
          const timeLabel = new Date(point.record.endTimestamp).toLocaleTimeString();
          return (
            <text
              key={`x-label-${point.index}`}
              x={point.x}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              className="fill-slate-400 text-xs"
            >
              {timeLabel}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export function SpeedSparkline({ records }: { records: NodePerformanceRecordItem[] }) {
  const aggregatedRecords = useMemo(() => groupRecordsForTrend(records, 6), [records]);

  if (!aggregatedRecords.length) {
    return <span className="text-xs text-slate-400">-</span>;
  }

  const width = 140;
  const height = 40;
  const paddingX = 8;
  const paddingY = 6;

  const speeds = aggregatedRecords.map((record) => record.avgSpeed);
  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);
  const range = maxSpeed - minSpeed || 1;

  const points = aggregatedRecords.map((record, index) => {
    const x =
      aggregatedRecords.length === 1
        ? width / 2
        : paddingX + (index / (aggregatedRecords.length - 1)) * (width - paddingX * 2);
    const normalized = (record.avgSpeed - minSpeed) / range;
    const y = height - (paddingY + normalized * (height - paddingY * 2));
    return { x, y };
  });

  const latestSpeed = speeds[speeds.length - 1];
  const svgLabel = `节点最近 ${records.length} 次速度记录，每 6 条取平均后展示 ${aggregatedRecords.length} 个点，最新平均速度 ${latestSpeed.toFixed(4)} 项/秒`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-32 text-sky-500"
      role="img"
      aria-label={svgLabel}
    >
      <title>{svgLabel}</title>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.map((point) => `${point.x},${point.y}`).join(" ")}
      />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill="currentColor" />
    </svg>
  );
}

