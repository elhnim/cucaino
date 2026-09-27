// Instant, zero-JS candy loading screen (server component). Used while the kid picker / launch
// splash / park stream in — replaces the old Blast-off rocket, which added fake progress and
// preloading work on top of the real wait.
export default function CandyLoading({ label = "Opening Cucaino…" }: { label?: string }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "linear-gradient(#b9a6ff, #ffc2e2 55%, #ffe8d2)",
        zIndex: 100,
      }}
    >
      <style>{"@keyframes candy-bob{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-16px) rotate(6deg)}}"}</style>
      <div style={{ fontSize: 76, animation: "candy-bob 0.9s ease-in-out infinite" }}>🍭</div>
      <div style={{ fontWeight: 900, fontSize: 22, color: "#7a2e62", fontFamily: "inherit" }}>{label}</div>
    </div>
  );
}
