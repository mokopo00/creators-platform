import { useId, useState } from 'react';

type Point = { label: string; value: number };

/**
 * Single-series daily bar chart (one axis, no legend: the title names the
 * series). Hover/focus shows the exact value; a data table is provided for
 * screen readers and as a non-visual alternative.
 */
export function BarChart({ title, unit, data }: { title: string; unit: string; data: Point[] }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 300;
  const H = 96;
  const gap = 2;
  const bw = Math.max(2, (W - gap * (data.length - 1)) / data.length);
  const total = data.reduce((s, d) => s + d.value, 0);
  const shown = active !== null ? data[active] : null;

  return (
    <figure className="glass flex flex-col gap-2 p-4" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-ink-soft" aria-live="polite">
          {shown
            ? `${shown.label}: ${shown.value.toLocaleString('ja-JP')}${unit}`
            : `合計 ${total.toLocaleString('ja-JP')}${unit}`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-24 w-full"
        role="img"
        aria-label={`${title}の推移`}
        onMouseLeave={() => setActive(null)}
      >
        <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="#c9cdd6" strokeWidth="1" />
        {data.map((d, i) => {
          const h = d.value === 0 ? 0 : Math.max(3, (d.value / max) * (H - 6));
          const x = i * (bw + gap);
          return (
            <g key={d.label}>
              {/* Hit target spans the full column height, wider than the mark. */}
              <rect
                x={x}
                y={0}
                width={bw + gap}
                height={H}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
              />
              {h > 0 && (
                <path
                  d={`M${x},${H} v${-(h - Math.min(4, bw / 2))} q0,-${Math.min(4, bw / 2)} ${Math.min(4, bw / 2)},-${Math.min(4, bw / 2)} h${bw - 2 * Math.min(4, bw / 2)} q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, bw / 2)} V${H} Z`}
                  fill="#4f55c8"
                  opacity={active === null || active === i ? 1 : 0.45}
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-ink-soft" aria-hidden="true">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-ink-soft">表で見る</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left text-ink-soft">
              <th className="font-medium">日付</th>
              <th className="text-right font-medium">{title}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td className="text-right tabular-nums">{d.value.toLocaleString('ja-JP')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
