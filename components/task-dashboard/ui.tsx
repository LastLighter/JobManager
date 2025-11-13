interface MetricTileProps {
  label: string;
  value: string;
  subValue?: string;
}

export function CompletionMetricTile({ label, value, subValue }: MetricTileProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="text-2xl font-semibold text-slate-900">{value}</span>
      {subValue && <span className="text-xs text-slate-500">{subValue}</span>}
    </div>
  );
}

export function StatusTile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-4 text-center shadow-sm ${
        highlight
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xl font-semibold text-slate-900">{value.toLocaleString()}</span>
    </div>
  );
}

export function NodeSummaryTile({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-lg font-semibold text-slate-900">{value}</span>
      {subValue && <span className="text-xs text-slate-500">{subValue}</span>}
    </div>
  );
}

export function RoundStatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value.toLocaleString()}</span>
    </div>
  );
}

export function SummaryCard({ title, value, accent }: { title: string; value: number; accent: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`h-1 w-12 rounded-full ${accent}`}></div>
      <div className="text-3xl font-bold text-slate-900">{value.toLocaleString()}</div>
      <div className="text-sm font-medium text-slate-500">{title}</div>
    </div>
  );
}

