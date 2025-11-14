import { useEffect, useMemo } from "react";

import { DetailedSpeedChart } from "./charts";
import type { AggregatedPerformanceRecord, NodeStatsItem } from "./types";
import { CompletionMetricTile } from "./ui";
import { formatDate, formatNumber, formatSeconds, formatSpeed, groupRecordsForTrend } from "./utils";

export function NodeDetailModal({ node, onClose }: { node: NodeStatsItem; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const aggregatedRecords = useMemo(
    () => groupRecordsForTrend(node.recentRecords, 6),
    [node.recentRecords],
  );

  const lastUpdatedText = formatDate(node.lastUpdated);
  const averageSpeedPerMinute =
    Number.isFinite(node.avgSpeed) && node.avgSpeed >= 0 ? node.avgSpeed * 60 : null;

  const metrics = [
    {
      label: "请求次数",
      value: formatNumber(node.requestCount),
    },
    {
      label: "已分配任务",
      value: formatNumber(node.assignedTaskCount),
    },
    {
      label: "进行中任务",
      value: formatNumber(node.activeTaskCount),
    },
    {
      label: "最近记录次数",
      value: formatNumber(node.recentRecords.length),
      subValue:
        aggregatedRecords.length !== node.recentRecords.length
          ? `聚合后 ${formatNumber(aggregatedRecords.length)} 组`
          : undefined,
    },
    {
      label: "总处理项数",
      value: formatNumber(node.totalItemNum),
    },
    {
      label: "累计运行时长",
      value: formatSeconds(node.totalRunningTime),
    },
    {
      label: "每100项平均耗时",
      value: formatSeconds(node.avgTimePer100Items),
    },
    {
      label: "平均速度",
      value: formatSpeed(averageSpeedPerMinute, "项/分钟"),
      subValue:
        averageSpeedPerMinute !== null ? `约 ${formatSpeed(node.avgSpeed, "项/秒")}` : undefined,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose}></div>
      <div className="relative z-10 flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-8 py-6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-900">节点详情</h2>
            <p className="text-sm text-slate-500">
              节点 <span className="font-mono text-xs text-slate-700">{node.nodeId}</span>，最后更新时间 {lastUpdatedText}
            </p>
            <p className="text-xs text-slate-400">
              趋势图基于每 6 条记录取平均值，以减少瞬时波动。
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            onClick={onClose}
          >
            关闭
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <CompletionMetricTile
                key={metric.label}
                label={metric.label}
                value={metric.value}
                subValue={metric.subValue}
              />
            ))}
          </section>
          <section className="mb-8 rounded-xl border border-slate-200 bg-slate-50 p-6">
            <h3 className="mb-4 text-base font-semibold text-slate-900">速度趋势</h3>
            <DetailedSpeedChart data={aggregatedRecords} />
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-slate-900">聚合记录明细</h3>
            {aggregatedRecords.length === 0 ? (
              <p className="text-sm text-slate-500">暂无聚合数据。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto border-collapse text-sm text-slate-700">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">序号</th>
                      <th className="px-4 py-2 text-left">时间范围</th>
                      <th className="px-4 py-2 text-left">平均速度 (项/分钟)</th>
                      <th className="px-4 py-2 text-left">平均速度 (项/秒)</th>
                      <th className="px-4 py-2 text-left">包含记录数</th>
                      <th className="px-4 py-2 text-left">处理项数</th>
                      <th className="px-4 py-2 text-left">运行时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {aggregatedRecords.map((record, index) => (
                      <tr key={`${record.startTimestamp}-${record.endTimestamp}`}>
                        <td className="px-4 py-2">{index + 1}</td>
                        <td className="px-4 py-2">{formatRange(record)}</td>
                        <td className="px-4 py-2">{formatSpeed(record.avgSpeed * 60, "项/分钟")}</td>
                        <td className="px-4 py-2">{formatSpeed(record.avgSpeed, "项/秒")}</td>
                        <td className="px-4 py-2">{record.count}</td>
                        <td className="px-4 py-2">{formatNumber(record.totalItemNum)}</td>
                        <td className="px-4 py-2">{formatSeconds(record.totalRunningTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function formatRange(record: AggregatedPerformanceRecord) {
  const start = new Date(record.startTimestamp);
  const end = new Date(record.endTimestamp);
  const sameDay = start.toDateString() === end.toDateString();
  const startLabel = sameDay ? start.toLocaleTimeString() : start.toLocaleString();
  const endLabel = sameDay ? end.toLocaleTimeString() : end.toLocaleString();
  return `${startLabel} ~ ${endLabel}`;
}

