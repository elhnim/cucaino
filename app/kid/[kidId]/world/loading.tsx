export default function WorldLoading() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(#8fd7ff, #eaf6ff)",
      }}
    >
      <div
        className="animate-pulse"
        style={{
          background: "rgba(255,255,255,0.85)",
          borderRadius: 999,
          padding: "10px 22px",
          fontWeight: 800,
          fontSize: 18,
          color: "#6b4a1f",
          boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
        }}
      >
        Loading the world…
      </div>
    </div>
  );
}
