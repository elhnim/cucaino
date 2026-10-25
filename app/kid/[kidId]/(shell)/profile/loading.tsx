export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 pb-24">
        {/* Header */}
        <div className="h-8 w-28 bg-gray-200 rounded-full animate-pulse mt-1" />

        {/* 7 skeleton cards matching the actual card layout */}
        {[
          { titleW: "w-36", lines: [{ w: "w-full", h: "h-16" }, { w: "w-full", h: "h-3" }] },   // Level & Unlocks
          { titleW: "w-16", lines: [{ w: "w-full", h: "h-10" }] },                                // Name
          { titleW: "w-16", lines: [{ w: "w-full", h: "h-24" }] },                                // Avatar
          { titleW: "w-28", lines: [{ w: "w-3/4", h: "h-16" }] },                                 // Avatar Frame
          { titleW: "w-16", lines: [{ w: "w-full", h: "h-20" }] },                                // Theme
          { titleW: "w-20", lines: [{ w: "w-full", h: "h-10" }] },                                // Birthday
          { titleW: "w-10", lines: [{ w: "w-full", h: "h-10" }] },                                // PIN
        ].map((card, i) => (
          <div key={i} className="bg-white rounded-2xl shadow p-4 space-y-3 animate-pulse">
            {/* Card title row */}
            <div className={`h-4 ${card.titleW} bg-gray-200 rounded-full`} />
            {/* Card content lines */}
            {card.lines.map((line, j) => (
              <div key={j} className={`${line.h} ${line.w} bg-gray-100 rounded-xl`} />
            ))}
          </div>
        ))}

        {/* Save bar */}
        <div className="h-12 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}
