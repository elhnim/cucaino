"use client";

import { useId, useMemo, useState } from "react";
import type { RealAssetPrice } from "@/lib/domain/types";

/**
 * Polished 30-day price chart for the Invest asset sheet. Smooth gradient area,
 * trend-coloured line, min/max + date axis labels, and a draggable scrubber that
 * reads out the price on any day. Falls back to a friendly note under 2 points.
 */
export default function InvestPriceChart({ history }: { history: RealAssetPrice[] }) {
  const gid = useId().replace(/:/g, "");
  // history is stored newest-first; render oldest → newest.
  const data = useMemo(() => [...history].reverse(), [history]);
  const [hover, setHover] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <div className="grid h-full place-items-center text-xs font-bold text-slate-400">
        Price history starts soon
      </div>
    );
  }

  const prices = data.map((d) => d.priceCents);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const W = 320;
  const H = 132;
  const padL = 42;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const toX = (i: number) => padL + (i / (data.length - 1)) * chartW;
  const toY = (p: number) => padT + chartH - ((p - minP) / range) * chartH;

  const pts = data.map((d, i) => [toX(i), toY(d.priceCents)] as const);

  // Smooth the line with a Catmull-Rom → cubic-bezier conversion.
  const linePath = smoothPath(pts);
  const areaPath = `${linePath} L ${pts[pts.length - 1][0]},${padT + chartH} L ${pts[0][0]},${padT + chartH} Z`;

  const up = prices[prices.length - 1] >= prices[0];
  const stroke = up ? "#16a34a" : "#dc2626";
  const fillId = `ipc-fill-${gid}`;
  const glowId = `ipc-glow-${gid}`;

  const money = (cents: number) =>
    cents >= 100_000 ? `$${(cents / 100_000).toFixed(1)}k` : `$${(cents / 100).toFixed(cents >= 10_000 ? 0 : 2)}`;

  const active = hover ?? data.length - 1;
  const [ax, ay] = pts[active];
  const activeDate = data[active]?.priceDate ?? "";

  // Evenly spaced horizontal gridlines at min, mid, max.
  const gridY = [minP, (minP + maxP) / 2, maxP];

  const shortDate = (iso: string) =>
    iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((x - padL) / chartW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full touch-none select-none"
      onPointerDown={onMove}
      onPointerMove={(e) => e.buttons === 1 && onMove(e)}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label="30-day price history"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={stroke} floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Gridlines + y-axis price labels */}
      {gridY.map((p, i) => (
        <g key={i}>
          <line x1={padL} y1={toY(p)} x2={W - padR} y2={toY(p)} stroke="#eef2f7" strokeWidth="1" />
          <text x={padL - 6} y={toY(p) + 3} textAnchor="end" fontSize="8.5" fontWeight="700" fill="#94a3b8">
            {money(p)}
          </text>
        </g>
      ))}

      {/* Area + line */}
      <path d={areaPath} fill={`url(#${fillId})`} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />

      {/* Scrubber */}
      <line x1={ax} y1={padT} x2={ax} y2={padT + chartH} stroke={stroke} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
      <circle cx={ax} cy={ay} r="4.5" fill="#fff" stroke={stroke} strokeWidth="2.5" filter={`url(#${glowId})`} />

      {/* Floating price + date readout above the active point */}
      <g transform={`translate(${Math.max(padL + 22, Math.min(ax, W - padR - 22))}, ${Math.max(padT + 8, ay - 10)})`}>
        <text textAnchor="middle" fontSize="11" fontWeight="800" fill="#0f172a">
          {money(data[active].priceCents)}
        </text>
      </g>

      {/* X-axis: first + active(or last) dates */}
      <text x={padL} y={H - 6} textAnchor="start" fontSize="8.5" fontWeight="700" fill="#94a3b8">
        {shortDate(data[0].priceDate)}
      </text>
      <text x={W - padR} y={H - 6} textAnchor="end" fontSize="8.5" fontWeight="700" fill="#94a3b8">
        {hover !== null ? shortDate(activeDate) : shortDate(data[data.length - 1].priceDate)}
      </text>
    </svg>
  );
}

/** Catmull-Rom spline through points, emitted as an SVG cubic-bezier path. */
function smoothPath(pts: ReadonlyArray<readonly [number, number]>): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}
