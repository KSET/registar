import { useId, useState } from 'react';

// Validated categorical palette (dark mode), fixed hue order - see dataviz skill.
// Checked against this app's own surface color (#2b2b2b): all 8 pass lightness,
// chroma and CVD-separation; slot 6 (green) sits at 2.86:1 contrast (just under
// the 3:1 target), which is why every slice also carries a legend row and a
// hover/focus tooltip rather than relying on the fill color alone.
const PALETTE = [
  '#3987e5', // 1 blue
  '#d95926', // 2 orange
  '#199e70', // 3 aqua
  '#c98500', // 4 yellow
  '#d55181', // 5 magenta
  '#008300', // 6 green
  '#9085e9', // 7 violet
  '#e66767', // 8 red
];

const DEFAULT_MAX_SLICES = 7; // past this, fold the tail into "Ostalo"
const OTHER_COLOR = '#898781'; // muted - "Ostalo" is not a real category, never a hue slot

function foldToMax(data, maxSlices) {
  if (maxSlices === Infinity || data.length <= maxSlices + 1) return data;
  const head = data.slice(0, maxSlices);
  const tailTotal = data.slice(maxSlices).reduce((sum, d) => sum + d.value, 0);
  return [...head, { label: 'Ostalo', value: tailTotal }];
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

// `colorFor(label, index)` lets a chart pin specific categories to specific
// hues (e.g. membership-level card colours) instead of default slot order.
export default function PieChart({ title, data, colorFor, loading, maxSlices = DEFAULT_MAX_SLICES }) {
  const uid = useId();
  const [hovered, setHovered] = useState(null);

  const folded = foldToMax(data, maxSlices);
  const total = folded.reduce((sum, d) => sum + d.value, 0);

  const size = 200;
  const r = 90;
  const cx = size / 2;
  const cy = size / 2;

  let angle = 0;
  const slices = folded.map((d, i) => {
    const startAngle = angle;
    const fraction = total > 0 ? d.value / total : 0;
    angle += fraction * 360;
    const endAngle = angle;
    const color = d.label === 'Ostalo' ? OTHER_COLOR : colorFor ? colorFor(d.label, i) : PALETTE[i % PALETTE.length];
    return { ...d, startAngle, endAngle, fraction, color };
  });

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-content-primary mb-3">{title}</h3>

      {loading ? (
        <p className="text-sm text-content-muted">Učitavanje...</p>
      ) : total === 0 ? (
        <p className="text-sm text-content-muted">Nema podataka.</p>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative shrink-0">
            <svg viewBox={`0 0 ${size} ${size}`} width={160} height={160} role="img" aria-label={title}>
              {slices.length === 1 ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={slices[0].color}
                  opacity={hovered === null || hovered === 0 ? 1 : 0.55}
                  tabIndex={0}
                  onPointerEnter={() => setHovered(0)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(0)}
                  onBlur={() => setHovered(null)}
                  style={{ cursor: 'pointer', outline: 'none' }}
                />
              ) : (
                slices.map((s, i) => (
                  <path
                    key={`${uid}-${s.label}`}
                    d={describeArc(cx, cy, r, s.startAngle, s.endAngle)}
                    fill={s.color}
                    opacity={hovered === null || hovered === i ? 1 : 0.55}
                    tabIndex={0}
                    onPointerEnter={() => setHovered(i)}
                    onPointerLeave={() => setHovered(null)}
                    onFocus={() => setHovered(i)}
                    onBlur={() => setHovered(null)}
                    style={{ cursor: 'pointer', outline: 'none' }}
                  >
                    <title>{`${s.label}: ${s.value} (${Math.round(s.fraction * 100)}%)`}</title>
                  </path>
                ))
              )}
            </svg>

            {/* Hover readout - value leads, label follows */}
            <div className="mt-1 text-center h-9">
              {hovered !== null && (
                <>
                  <div className="text-base font-semibold text-content-primary leading-tight">
                    {slices[hovered].value}
                    <span className="text-content-muted font-normal text-xs ml-1">
                      ({Math.round(slices[hovered].fraction * 100)}%)
                    </span>
                  </div>
                  <div className="text-xs text-content-secondary truncate">{slices[hovered].label}</div>
                </>
              )}
            </div>
          </div>

          <ul className="flex-1 min-w-0 w-full space-y-1">
            {slices.map((s, i) => (
              <li
                key={`${uid}-legend-${s.label}`}
                className="flex items-center justify-between gap-2 text-xs rounded px-1.5 py-1 cursor-pointer"
                style={{ backgroundColor: hovered === i ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                onPointerEnter={() => setHovered(i)}
                onPointerLeave={() => setHovered(null)}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-content-secondary truncate">{s.label}</span>
                </span>
                <span className="text-content-primary font-medium shrink-0">{s.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
