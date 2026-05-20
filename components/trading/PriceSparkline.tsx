"use client";

interface Props {
  prices: number[];
  width?: number;
  height?: number;
  color?: string;
}

export default function PriceSparkline({
  prices,
  width = 80,
  height = 32,
  color,
}: Props) {
  const padding = 4;
  const w = width - padding * 2;
  const h = height - padding * 2;

  // Determine color based on trend
  const autoColor =
    prices.length >= 2 && prices[prices.length - 1] >= prices[0]
      ? "#16a34a"
      : "#dc2626";
  const strokeColor = color ?? autoColor;

  // Flat line if 0 or 1 data points
  if (prices.length <= 1) {
    const midY = padding + h / 2;
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
      >
        <line
          x1={padding}
          y1={midY}
          x2={padding + w}
          y2={midY}
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const minVal = Math.min(...prices);
  const maxVal = Math.max(...prices);
  const range = maxVal - minVal || 1;

  // Map prices to SVG coordinates
  const points = prices.map((p, i) => {
    const x = padding + (i / (prices.length - 1)) * w;
    const y = padding + h - ((p - minVal) / range) * h;
    return [x, y] as [number, number];
  });

  const polylinePoints = points.map(([x, y]) => `${x},${y}`).join(" ");

  // Path for gradient fill area
  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const bottomY = padding + h;
  const fillPath =
    `M ${firstPt[0]},${firstPt[1]} ` +
    points.slice(1).map(([x, y]) => `L ${x},${y}`).join(" ") +
    ` L ${lastPt[0]},${bottomY} L ${firstPt[0]},${bottomY} Z`;

  const gradientId = `sparkline-grad-${strokeColor.replace("#", "")}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={strokeColor}
            stopOpacity="0.3"
          />
          <stop
            offset="100%"
            stopColor={strokeColor}
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradientId})`} />
      <polyline
        points={polylinePoints}
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
