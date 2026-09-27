"use client";

import { useEffect, useState } from "react";
import { CLOSE_WINDOW_MESSAGE } from "@/lib/embed";

/**
 * An in-world window: shows any app page (an arcade game, the full week, badges & wishlist…)
 * on top of the paused 3D world, so kids never actually leave the park. Navigation inside the
 * page stays inside the window; the big button (or the page asking via postMessage) closes it
 * and drops the kid right back where they were standing.
 */
export function WorldPageWindow({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === CLOSE_WINDOW_MESSAGE) onClose();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 55, background: "#fff", display: "flex", flexDirection: "column" }}>
      <div style={barStyle}>
        <button type="button" onClick={onClose} style={backStyle}>
          🎡 Back to the park
        </button>
        <span style={{ fontWeight: 900, color: "#5a3a18", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      </div>
      <div style={{ position: "relative", flex: 1 }}>
        {!loaded && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#a06a3c" }}>
            Opening…
          </div>
        )}
        <iframe
          src={src}
          title={title}
          onLoad={() => setLoaded(true)}
          allow="fullscreen; autoplay"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", opacity: loaded ? 1 : 0 }}
        />
      </div>
    </div>
  );
}

const barStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "max(10px, env(safe-area-inset-top)) 14px 10px",
  background: "linear-gradient(#bfe6ff, #eaf6ff)",
  boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
  flexShrink: 0,
};

const backStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "10px 16px",
  fontWeight: 800,
  color: "#6b4a1f",
  background: "#fff",
  boxShadow: "0 3px 10px rgba(0,0,0,0.15)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
