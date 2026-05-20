"use client";

import { useId } from "react";
import type { TradingAssetPrice } from "@/lib/domain/types";

interface Props {
  priceHistory: TradingAssetPrice[]; // newest first
}

export default function PriceHistoryChart({ priceHistory }: Props) {
  const gradId = useId();

  // Oldest → newest for rendering
  const data = [...priceHistory].reverse();
  if (data.length === 0) return null;

  const prices = data.map((d) => d.priceNuggets);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const W = 400;
  const H = 120;
  const padL = 52;
  const padR = 12;
  const padT = 10;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const toX = (i: number) => padL + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (p: number) => padT + chartH - ((p - minP) / range) * chartH;

  const points = data.map((d, i) => `${toX(i)},${toY(d.priceNuggets)}`).join(" ");
  const areaPoints = [
    `${toX(0)},${padT + chartH}`,
    ...data.map((d, i) => `${toX(i)},${toY(d.priceNuggets)}`),
    `${toX(data.length - 1)},${padT + chartH}`,
  ].join(" ");

  const isUp = prices[prices.length - 1] >= prices[0];
  const lineColor = isUp ? "#16a34a" : "#dc2626";
  const fillId = `pf-${gradId}`;

  // Y-axis labels: min, mid, max
  const yLabels = [
    { val: minP, y: toY(minP) },
    { val: Math.round((minP + maxP) / 2), y: toY((minP + maxP) / 2) },
    { val: maxP, y: toY(maxP) },
  ];

  // X-axis labels: show up to 5 evenly spaced dates
  const xLabelCount = Math.min(5, data.length);
  const xLabels = Array.from({ length: xLabelCount }, (_, idx) => {
    const denom = Math.max(xLabelCount - 1, 1);
    const dataIdx = Math.min(
      Math.round((idx / denom) * (data.length - 1)),
      data.length - 1,
    );
    const date = data[dataIdx]?.priceDate ?? "";
    const label = date ? date.slice(5) : "";
    return { x: toX(dataIdx), label };
  });

  return (
    <div className="w-full">
      <p className="text-xs font-bold text-gray-400 mb-1">30-day price history</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 120 }}
        aria-hidden
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {yLabels.map(({ y }, i) => (
          <line
            key={i}
            x1={padL}
            y1={y}
            x2={W - padR}
            y2={y}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        {/* Area fill */}
        <polygon points={areaPoints} fill={`url(#${fillId})`} />

        {/* Price line */}
        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Latest price dot */}
        {data.length > 0 && (
          <circle
            cx={toX(data.length - 1)}
            cy={toY(prices[prices.length - 1])}
            r="3.5"
            fill={lineColor}
          />
        )}

        {/* Y-axis labels */}
        {yLabels.map(({ val, y }, i) => (
          <text
            key={i}
            x={padL - 4}
            y={y + 4}
            textAnchor="end"
            fontSize="9"
            fill="#9ca3af"
            fontFamily="sans-serif"
          >
            {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(val)}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ x, label }, i) => (
          <text
            key={i}
            x={x}
            y={H - 6}
            textAnchor="middle"
            fontSize="9"
            fill="#9ca3af"
            fontFamily="sans-serif"
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}
