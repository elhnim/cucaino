// Instant, zero-JS loading screen (server component) in the park's magical-adventure look: a
// slowly turning rune ring over a night-sky glow. Used while the kid picker / launch splash /
// park stream in — no fake progress, no preloading work on top of the real wait.
const DISPLAY = "var(--font-park-display), 'Lilita One', 'Luckiest Guy', system-ui, sans-serif";

export default function CandyLoading({ label = "Opening Cucaino…", emoji = "✨" }: { label?: string; emoji?: string }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        background: "radial-gradient(120% 80% at 50% 30%, #3a2f8f 0%, #1a1650 40%, #090818 80%)",
        zIndex: 100,
      }}
    >
      <style>
        {"@keyframes ml-spin{to{transform:rotate(360deg)}}@keyframes ml-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@media (prefers-reduced-motion: reduce){.ml-anim{animation:none!important}}"}
      </style>
      <div style={{ position: "relative", width: 132, height: 132, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          className="ml-anim"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "conic-gradient(from 0deg, transparent, #5ef2ff, transparent 35%, #ffd36b 55%, transparent 70%, #b06bff, transparent)",
            WebkitMask: "radial-gradient(circle, transparent 58%, #000 60%, #000 66%, transparent 68%)",
            mask: "radial-gradient(circle, transparent 58%, #000 60%, #000 66%, transparent 68%)",
            animation: "ml-spin 2.4s linear infinite",
            filter: "drop-shadow(0 0 10px rgba(94,242,255,0.6))",
          }}
        />
        <div style={{ position: "absolute", inset: 22, borderRadius: "50%", background: "radial-gradient(circle, rgba(94,242,255,0.28), transparent 70%)" }} />
        <div className="ml-anim" style={{ fontSize: 58, lineHeight: 1, animation: "ml-float 1.8s ease-in-out infinite", filter: "drop-shadow(0 0 14px rgba(255,211,107,0.7))" }}>
          {emoji}
        </div>
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: 24, letterSpacing: 0.6, color: "#f5f3ff", textShadow: "0 0 18px rgba(94,242,255,0.45), 0 2px 0 rgba(0,0,0,0.4)" }}>{label}</div>
    </div>
  );
}
