"use client";

import { useCallback, useRef, useState } from "react";

const RADIUS = 58;
const THUMB = 64;

/**
 * Fixed bottom-right thumbstick. Reports normalized (x, y) in [-1, 1], where
 * y = +1 means the thumb was dragged *up* (screen-space up, i.e. "forward").
 */
export function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS) {
        dx = (dx / d) * RADIUS;
        dy = (dy / d) * RADIUS;
      }
      setThumb({ x: dx, y: dy });
      onChange(dx / RADIUS, -dy / RADIUS);
    },
    [onChange],
  );

  const end = useCallback(() => {
    setActive(false);
    setThumb({ x: 0, y: 0 });
    onChange(0, 0);
  }, [onChange]);

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setActive(true);
        handleMove(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => active && handleMove(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
      style={{
        position: "fixed",
        right: "max(20px, env(safe-area-inset-right))",
        bottom: "max(20px, env(safe-area-inset-bottom))",
        width: RADIUS * 2,
        height: RADIUS * 2,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.22)",
        border: "3px solid rgba(255,255,255,0.6)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
        touchAction: "none",
        zIndex: 20,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: THUMB,
          height: THUMB,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.95)",
          border: "3px solid #b5572a",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          transform: `translate(-50%, -50%) translate(${thumb.x}px, ${thumb.y}px)`,
          transition: active ? "none" : "transform 150ms ease-out",
        }}
      />
    </div>
  );
}
