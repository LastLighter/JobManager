import type { RunStats, SummaryCounts } from "./types";
import { formatDate, formatDuration, formatNumber, formatSeconds, formatSpeed } from "./utils";
import { CompletionMetricTile, StatusTile } from "./ui";

export function CompletionSummary({
  runStats,
  counts,
  roundName,
  onViewDashboard,
  onClearSelectedRound,
  onClearAllRounds,
  canClearSelectedRound,
  isClearing,
  infoMessage,
  errorMessage,
}: {
  runStats: RunStats;
  counts: SummaryCounts;
  roundName?: string | null;
  onViewDashboard: () => void;
  onClearSelectedRound: () => void;
  onClearAllRounds: () => void;
  canClearSelectedRound: boolean;
  isClearing: boolean;
  infoMessage: string | null;
  errorMessage: string | null;
}) {
  const totalDurationText = formatDuration(runStats.durationMs);
  const startTimeText = formatDate(runStats.startTime);
  const endTimeText = formatDate(runStats.endTime);
  const totalRunningTimeText = formatSeconds(runStats.totalRunningTime);
  const displayRoundName = roundName ?? "当前任务轮";

  const averageTaskSpeedPerMinute =
    runStats.averageTaskSpeed !== null ? runStats.averageTaskSpeed * 60 : null;
  const averageItemSpeedPerMinute =
    runStats.averageItemSpeed !== null ? runStats.averageItemSpeed * 60 : null;

  const averageTaskSpeedText = formatSpeed(averageTaskSpeedPerMinute, "任务/分钟");
  const averageTaskSpeedSub =
    averageTaskSpeedText !== "-" && runStats.averageTaskSpeed !== null
      ? `约 ${formatSpeed(runStats.averageTaskSpeed, "任务/秒")}`
      : undefined;

  const averageItemSpeedText = formatSpeed(averageItemSpeedPerMinute, "项/分钟");
  const averageItemSpeedSub =
    averageItemSpeedText !== "-" && runStats.averageItemSpeed !== null
      ? `约 ${formatSpeed(runStats.averageItemSpeed, "项/秒")}`
      : undefined;
  const averageTimePerItemText = formatSeconds(runStats.averageTimePerItem);
  const averageTimePer100ItemsText = formatSeconds(runStats.averageTimePer100Items);

  const hasItemStats = runStats.totalItemNum > 0 || runStats.totalRunningTime > 0;

  const metricTiles: Array<{ label: string; value: string; subValue?: string }> = [
    {
      label: "总任务数",
      value: formatNumber(runStats.totalTasks),
      subValue: `完成 ${formatNumber(runStats.completedTasks)} 个任务`,
    },
    {
      label: "处理总时长",
      value: totalDurationText,
      subValue:
        startTimeText !== "-" && endTimeText !== "-" ? `${startTimeText} → ${endTimeText}` : undefined,
    },
    {
      label: "平均任务速度",
      value: averageTaskSpeedText,
      subValue: averageTaskSpeedSub,
    },
  ];

  if (hasItemStats) {
    metricTiles.push(
      {
        label: "总处理项数",
        value: formatNumber(runStats.totalItemNum),
        subValue:
          runStats.totalRunningTime > 0 ? `节点累计 ${totalRunningTimeText}` : undefined,
      },
      {
        label: "平均项速度",
        value: averageItemSpeedText,
        subValue: averageItemSpeedSub,
      },
      {
        label: "平均每项耗时",
        value: averageTimePerItemText,
      },
      {
        label: "每100项耗时",
        value: averageTimePer100ItemsText,
      },
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6">
        <header className="flex flex-col gap-2 text-center md:text-left">
          <h1 className="text-3xl font-semibold text-slate-900">
            任务轮「{displayRoundName}」已全部完成 🎉
          </h1>
          <p className="text-sm text-slate-600">
            以下为本轮任务的整体执行统计，方便评估节点效率与处理表现。
          </p>
        </header>

        {infoMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {infoMessage}
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          {metricTiles.map((tile) => (
            <CompletionMetricTile key={tile.label} label={tile.label} value={tile.value} subValue={tile.subValue} />
          ))}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">时间统计</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <CompletionMetricTile label="开始时间" value={startTimeText} />
            <CompletionMetricTile label="结束时间" value={endTimeText} />
            <CompletionMetricTile label="总耗时" value={totalDurationText} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">状态概览</h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatusTile label="未处理" value={counts.pending} />
            <StatusTile label="处理中" value={counts.processing} />
            <StatusTile label="失败" value={counts.failed} />
            <StatusTile label="已完成" value={counts.completed} highlight />
          </div>
        </section>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700"
            onClick={onViewDashboard}
          >
            返回任务仪表盘
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-300 bg-white px-6 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onClearSelectedRound}
            disabled={isClearing || !canClearSelectedRound}
          >
            {isClearing ? "清除中..." : "清除当前任务轮"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-300 bg-white px-6 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onClearAllRounds}
            disabled={isClearing}
          >
            {isClearing ? "清除中..." : "清除全部任务轮"}
          </button>
        </div>

        <p className="text-center text-xs text-slate-500">
          如需开始新一轮任务，可返回仪表盘导入新的任务列表或上传文件。
        </p>
      </div>
    </div>
  );
}

