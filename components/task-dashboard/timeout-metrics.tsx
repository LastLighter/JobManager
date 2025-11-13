import type {
  TimeoutInspectionRoundSummary,
  TimeoutInspectionTaskInfo,
  TimeoutMetricsPayload,
} from "./types";
import { STATUS_OPTIONS, statusBadgeStyles } from "./constants";
import { formatDate, formatDuration, formatNumber } from "./utils";

interface TimeoutMetricsSectionProps {
  metrics: TimeoutMetricsPayload | null;
  selectedRoundTimeout: TimeoutInspectionRoundSummary | null;
  timeoutThresholdMinutes: number;
  timeoutLastInspected: string;
  hasTimedOutTasks: boolean;
  hasProcessingTasks: boolean;
  copyToClipboard: (value: string) => void;
  roundNameById: Map<string, string>;
  onRoundSelect: (roundId: string | null) => void;
}

export function TimeoutMetricsSection({
  metrics,
  selectedRoundTimeout,
  timeoutThresholdMinutes,
  timeoutLastInspected,
  hasTimedOutTasks,
  hasProcessingTasks,
  copyToClipboard,
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

      <div className="grid gap-6 lg:grid-cols-2">
        <TimeoutTaskList
          title="超时任务排行"
          emptyText="暂无超时任务。"
          tasks={metrics.topTimedOut}
          hasData={hasTimedOutTasks}
          copyToClipboard={copyToClipboard}
          roundNameById={roundNameById}
          onRoundSelect={onRoundSelect}
        />
        <TimeoutTaskList
          title="长时间处理中任务"
          emptyText="暂无长时间处理中任务。"
          tasks={metrics.topProcessing}
          hasData={hasProcessingTasks}
          copyToClipboard={copyToClipboard}
          roundNameById={roundNameById}
          onRoundSelect={onRoundSelect}
        />
      </div>

      {metrics.roundSummaries.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">任务轮巡检记录</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto border-collapse text-left text-sm text-slate-700">
              <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">任务轮</th>
                  <th className="px-4 py-2">巡检时间</th>
                  <th className="px-4 py-2">处理中任务</th>
                  <th className="px-4 py-2">已超时</th>
                  <th className="px-4 py-2">接近超时</th>
                  <th className="px-4 py-2">最长持续时间</th>
                  <th className="px-4 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.roundSummaries.map((summary) => (
                  <tr key={summary.roundId}>
                    <td className="px-4 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-800">
                          {roundNameById.get(summary.roundId) ?? summary.roundId}
                        </span>
                        <span className="text-xs text-slate-400">{summary.roundId}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs">{formatDate(summary.inspectedAt)}</td>
                    <td className="px-4 py-2">{formatNumber(summary.totalProcessing)}</td>
                    <td className="px-4 py-2 text-rose-600">{formatNumber(summary.timedOutCount)}</td>
                    <td className="px-4 py-2 text-amber-600">{formatNumber(summary.nearTimeoutCount)}</td>
                    <td className="px-4 py-2">
                      {summary.longestDurationMs !== null ? formatDuration(summary.longestDurationMs) : "-"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-100"
                        onClick={() => onRoundSelect(summary.roundId)}
                      >
                        查看任务轮
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function TimeoutTaskList({
  title,
  tasks,
  emptyText,
  hasData,
  copyToClipboard,
  roundNameById,
  onRoundSelect,
}: {
  title: string;
  tasks: TimeoutInspectionTaskInfo[];
  emptyText: string;
  hasData: boolean;
  copyToClipboard: (value: string) => void;
  roundNameById: Map<string, string>;
  onRoundSelect: (roundId: string | null) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className="text-xs text-slate-400">显示最近 10 条记录</span>
      </div>
      {!hasData ? (
        <p className="text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <div key={`${task.roundId}-${task.taskId}`} className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-slate-700">任务 {task.taskId}</span>
                  <span className="text-slate-400">所属任务轮：{roundNameById.get(task.roundId) ?? task.roundId}</span>
                </div>
                <button
                  type="button"
                  className="rounded px-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                  onClick={() => copyToClipboard(task.taskId)}
                  title="复制任务ID"
                >
                  📋
                </button>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeStyles[task.status]}`}>
                  {STATUS_OPTIONS.find((item) => item.value === task.status)?.label ?? task.status}
                </span>
                <span>开始时间：{formatDate(task.startedAt)}</span>
                <span>持续时间：{formatDuration(task.durationMs)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-slate-500" title={task.path}>
                  {task.path}
                </span>
                <button
                  type="button"
                  className="rounded px-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                  onClick={() => copyToClipboard(task.path)}
                  title="复制路径"
                >
                  📋
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-slate-500">
                <span>执行节点：</span>
                {task.nodeId ? (
                  <>
                    <span className="font-mono text-slate-700">{task.nodeId}</span>
                    <button
                      type="button"
                      className="rounded px-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                      onClick={() => copyToClipboard(task.nodeId!)}
                      title="复制节点ID"
                    >
                      📋
                    </button>
                  </>
                ) : (
                  <span className="font-mono text-slate-700">-</span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-400">
                  最近检查：{formatDate(task.startedAt + task.durationMs)}
                </span>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 transition hover:bg-slate-100"
                  onClick={() => onRoundSelect(task.roundId)}
                >
                  查看任务轮
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

