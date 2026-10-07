"use client";

// "Where to?" — big category chips a 6-year-old can tap, a search box for kids who can type, and
// a result list with distance + how long it takes. Anything the kid hasn't found yet (a wonder, a
// settlement, a far island) shows as a mystery card with just a compass hint, never its real name.
import { useMemo, useState } from "react";
import { CATEGORY_CHIPS, distance, type MapCategory, type MapEntity } from "@/lib/park/map/entities";
import { formatEta, planTrip } from "@/lib/park/map/planner";
import { CATEGORY_COLOR } from "./icons";

function compassDir(dx: number, dz: number): string {
  const a = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  const dirs = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return dirs[Math.round(a / 45) % 8];
}

export function WhereToPanel({
  entities,
  pose,
  foundIds,
  canFly,
  onPick,
}: {
  entities: MapEntity[];
  pose: { x: number; z: number } | null;
  foundIds: string[];
  canFly: boolean;
  onPick: (e: MapEntity) => void;
}) {
  const [cat, setCat] = useState<MapCategory | null>(null);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    let list = entities;
    if (cat) list = list.filter((e) => e.category === cat);
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((e) => e.name.toLowerCase().includes(needle));
    const withDist = list.map((e) => ({ e, d: pose ? distance(pose, e) : 0 }));
    withDist.sort((a, b) => a.d - b.d);
    return withDist.slice(0, 40);
  }, [entities, cat, q, pose]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, height: "100%" }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Search for a place…"
        style={searchInput}
        aria-label="Search for a place"
      />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, touchAction: "pan-x", flexShrink: 0 }}>
        <button type="button" onClick={() => setCat(null)} style={{ ...chip, ...(cat === null ? chipOn : null) }}>
          ✨ Everywhere
        </button>
        {CATEGORY_CHIPS.map((c) => (
          <button key={c.category} type="button" onClick={() => setCat(c.category === cat ? null : c.category)} style={{ ...chip, ...(c.category === cat ? chipOn : null) }}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", flex: 1, minHeight: 0, touchAction: "pan-y", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
        {rows.length === 0 && <div style={{ opacity: 0.7, fontWeight: 700, padding: "8px 4px" }}>Nothing found — try a different search!</div>}
        {rows.map(({ e, d }) => {
          const hidden = e.discoverable && !foundIds.includes(e.id);
          if (hidden) {
            const dir = pose ? compassDir(e.x - pose.x, e.z - pose.z) : "somewhere";
            return (
              <div key={e.id} style={{ ...row, opacity: 0.75 }}>
                <span style={{ fontSize: 22 }}>❓</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900 }}>A {e.category === "wonder" ? "Natural Wonder" : e.category === "village" ? "village" : "mystery place"} to the {dir}…</div>
                  <div style={{ fontSize: 11.5, opacity: 0.75 }}>Walk close by to discover it!</div>
                </div>
              </div>
            );
          }
          const best = pose ? planTrip(pose, e, { canFly })[0] : null;
          return (
            <button key={e.id} type="button" onClick={() => onPick(e)} style={row}>
              <span style={{ fontSize: 22 }}>{e.emoji}</span>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontWeight: 900, color: "#f5f3ff" }}>{e.name}</div>
                <div style={{ fontSize: 11.5, opacity: 0.75, color: CATEGORY_COLOR[e.category] }}>
                  {Math.round(d)} m away{best ? ` · ${best.emoji} ${formatEta(best.etaMin)}` : ""}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const searchInput: React.CSSProperties = {
  minHeight: 44,
  borderRadius: 999,
  border: "1.5px solid rgba(160,200,255,0.35)",
  background: "rgba(10,9,30,0.6)",
  color: "#f5f3ff",
  padding: "0 16px",
  fontSize: 15,
  fontWeight: 700,
  outline: "none",
};
const chip: React.CSSProperties = {
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 999,
  border: "1.5px solid rgba(160,200,255,0.35)",
  background: "rgba(20,18,50,0.7)",
  color: "#f5f3ff",
  fontWeight: 900,
  fontSize: 13,
  whiteSpace: "nowrap",
  cursor: "pointer",
  flexShrink: 0,
};
const chipOn: React.CSSProperties = { border: "1.5px solid rgba(255,211,107,0.9)", background: "rgba(120,86,20,0.75)" };
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 50,
  padding: "6px 12px",
  borderRadius: 14,
  border: "1px solid rgba(160,200,255,0.2)",
  background: "rgba(255,255,255,0.05)",
  cursor: "pointer",
  textAlign: "left",
};
