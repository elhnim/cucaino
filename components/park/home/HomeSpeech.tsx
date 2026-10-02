"use client";

// The pet's speech bubble in My Home, drawn by the page over the 3D view (big, crisp text at the
// screen's own resolution, even on a phone with the park's chunky-pixel look) and kept over the
// pet's head as it moves: the scene says where (HomeController.speech()).
import { useEffect, useRef, useState } from "react";
import type { HomeController } from "@/lib/park/home/scene";

export function HomeSpeech({ ride }: { ride: Pick<HomeController, "speech" | "setSpeechHud"> }) {
  const [text, setText] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ride.setSpeechHud(true);
    let raf = 0;
    let shown: string | null = null;
    const tick = () => {
      const s = ride.speech();
      const t = s?.text ?? null;
      if (t !== shown) {
        shown = t;
        setText(t);
      }
      const el = box.current;
      if (s && el) {
        const x = ((s.x + 1) / 2) * window.innerWidth;
        const y = ((1 - s.y) / 2) * window.innerHeight;
        // (kept on screen)
        const half = Math.min(el.offsetWidth / 2, window.innerWidth / 2 - 8);
        el.style.left = `${Math.max(8 + half, Math.min(window.innerWidth - 8 - half, x))}px`;
        el.style.top = `${Math.max(el.offsetHeight + 8, y)}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ride.setSpeechHud(false);
    };
  }, [ride]);
  if (!text) return null;
  return (
    <div
      ref={box}
      aria-live="polite"
      style={{
        position: "fixed",
        transform: "translate(-50%, -100%)",
        zIndex: 30,
        pointerEvents: "none",
        maxWidth: "min(78vw, 360px)",
        background: "#fffaf3",
        color: "#3a2340",
        border: "3px solid #ffb3d1",
        borderRadius: 20,
        padding: "10px 16px",
        font: "800 clamp(17px, 4.6vw, 22px)/1.25 system-ui, -apple-system, 'Segoe UI', sans-serif",
        textAlign: "center",
        boxShadow: "0 6px 18px rgba(60,30,50,0.25)",
      }}
    >
      {text}
      <span
        style={{
          position: "absolute",
          left: "50%",
          bottom: -13,
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "11px solid transparent",
          borderRight: "11px solid transparent",
          borderTop: "13px solid #ffb3d1",
        }}
      />
    </div>
  );
}
