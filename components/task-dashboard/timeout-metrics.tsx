import type { TimeoutInspectionRoundSummary, TimeoutMetricsPayload } from "./types";
import { formatDate, formatDuration, formatNumber } from "./utils";

interface TimeoutMetricsSectionProps {
  metrics: TimeoutMetricsPayload | null;
  selectedRoundTimeout: TimeoutInspectionRoundSummary | null;
  timeoutThresholdMinutes: number;
  timeoutLastInspected: string;
  roundNameById: Map<string, string>;
  onRoundSelect: (roundId: string | null) => void;
}

export function TimeoutMetricsSection({
  metrics,
  selectedRoundTimeout,
  timeoutThresholdMinutes,
  timeoutLastInspected,
  roundNameById,
  onRoundSelect,
}: TimeoutMetricsSectionProps) {
  if (!metrics) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">超时监控</h2>
        <p className="text-sm text-slate-500">暂无超时监控数据。</p>
      </section>
    );
  }

  const summaryMetrics = [
    { label: "超时时间阈值", value: `${timeoutThresholdMinutes} 分钟` },
    { label: "最近巡检时间", value: timeoutLastInspected },
    { label: "当前处理中", value: `${formatNumber(metrics.totalProcessing)} 个任务` },
    { label: "已判定超时", value: `${formatNumber(metrics.timedOutCount)} 个任务` },
    { label: "接近超时", value: `${formatNumber(metrics.nearTimeoutCount)} 个任务` },
    {
      label: "最久运行时长",
      value: metrics.longestDurationMs !== null ? formatDuration(metrics.longestDurationMs) : "-",
    },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">超时监控</h2>
          <p className="text-sm text-slate-500">
            系统每隔固定间隔检测“处理中”任务，超过阈值将自动标记为“失败”。
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaryMetrics.map((metric) => (
          <div key={metric.label} className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <span className="text-xs font-medium text-slate-500">{metric.label}</span>
            <span className="text-base font-semibold text-slate-900">{metric.value}</span>
          </div>
        ))}
      </div>

      {selectedRoundTimeout && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold">
                当前任务轮超时统计：{roundNameById.get(selectedRoundTimeout.roundId) ?? selectedRoundTimeout.roundId}
              </span>
              <span className="ml-2 text-xs text-emerald-700">
                巡检时间 {formatDate(selectedRoundTimeout.inspectedAt)}
              </span>
            </div>
            <button
              type="button"
              className="rounded border border-emerald-300 px-3 py-1 text-xs text-emerald-700 transition hover:bg-emerald-100"
              onClick={() => onRoundSelect(selectedRoundTimeout.roundId)}
            >
              查看该任务轮
            </button>
          </div>
          <div className="mt-3 grid gap-3 text-xs md:grid-cols-3">
            <span>处理中任务：{formatNumber(selectedRoundTimeout.totalProcessing)} 个</span>
            <span>已判定超时：{formatNumber(selectedRoundTimeout.timedOutCount)} 个</span>
            <span>接近超时：{formatNumber(selectedRoundTimeout.nearTimeoutCount)} 个</span>
          </div>
          <p className="mt-2 text-xs text-emerald-700">
            最长持续时间：{selectedRoundTimeout.longestDurationMs !== null ? formatDuration(selectedRoundTimeout.longestDurationMs) : "-"}
          </p>
        </div>
      )}
    </section>
  );
}

