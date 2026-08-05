"use client";

/**
 * Shared small-chart building blocks for the gold/black dashboard theme.
 * Deliberately single-hue (gold, light->dark) throughout - a 2-color
 * categorical pair in this exact gold against the dark surface fails the
 * dataviz skill's CVD/chroma checks (validated via validate_palette.js),
 * so these stay sequential/magnitude encodings (rings, single-series
 * bars) rather than color-coded categories. Identity is carried by
 * direct text labels, never by hue alone.
 */

export function CircularProgress({
  value,
  max,
  size = 96,
  strokeWidth = 8,
  label,
  sublabel,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  sublabel?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const offset = circumference * (1 - pct);
  const gradId = `ring-grad-${Math.round(value * 1000)}-${size}`;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9C7A3D" />
            <stop offset="100%" stopColor="#E5C158" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#2a2a28" strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          fill="none"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-black text-[#E2C48A] leading-none">{label}</span>
        {sublabel && <span className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">{sublabel}</span>}
      </div>
    </div>
  );
}

export function MiniBarChart({
  items,
  formatValue = (v: number) => `$${v.toFixed(0)}`,
  maxItems = 8,
}: {
  items: { label: string; value: number }[];
  formatValue?: (v: number) => string;
  maxItems?: number;
}) {
  const top = items.slice(0, maxItems);
  const max = Math.max(...top.map((i) => i.value), 1);

  return (
    <div className="space-y-2.5">
      {top.map((item, i) => {
        const pct = Math.max(2, (item.value / max) * 100);
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-slate-300 w-28 truncate flex-shrink-0">{item.label}</span>
            <div className="flex-1 h-2 rounded-full bg-[#2a2a28] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#9C7A3D] to-[#E5C158]"
                style={{ width: `${pct}%`, transition: "width 0.6s ease" }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-[#C9A86A] w-16 text-right flex-shrink-0">{formatValue(item.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Sparkline({
  data,
  width = 280,
  height = 48,
}: {
  data: { label: string; value: number }[];
  width?: number;
  height?: number;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = width / Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = height - (d.value / max) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const path = `M${points.join(" L")}`;
  const areaPath = `M0,${height} L${points.join(" L")} L${width},${height} Z`;
  const gradId = `spark-grad-${width}-${height}-${data.length}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E5C158" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#E5C158" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
      <path d={path} fill="none" stroke="#C9A86A" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
