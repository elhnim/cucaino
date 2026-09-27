// Streams instantly while the park's data loads — same candy look as the in-app loader.
export default function ParkLoading() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "linear-gradient(#b9a6ff, #ffc2e2 55%, #ffe3cc)",
      }}
    >
      <div style={{ fontSize: 72 }} className="animate-bounce">
        🍭
      </div>
      <div style={{ fontWeight: 900, fontSize: 22, color: "#7a2e62" }}>Opening Cucaino Park…</div>
    </div>
  );
}
