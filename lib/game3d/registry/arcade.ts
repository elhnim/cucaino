// Arcade cabinets in the Play Hall — plain data (no three.js) so the app shell can resolve
// cabinet routes without pulling the 3D bundle into its first download.
export interface CabinetDef {
  key: string;
  label: string;
  emoji: string;
  color: string;
  /** route this cabinet leads to, kidId is interpolated by the caller */
  route: (kidId: string) => string;
}

// Every standalone mini-game gets its own glowing arcade cabinet. To add a game to the
// arcade, append one entry here — the cabinet, its animated screen and its trigger zone
// are all generated from it.
export const CABINETS: CabinetDef[] = [
  { key: "game:trading", label: "Nugget Market", emoji: "📈", color: "#22c55e", route: (id) => `/play/trading?kid=${id}` },
  { key: "game:invest", label: "Invest", emoji: "📊", color: "#4f46e5", route: (id) => `/play/invest?kid=${id}` },
  { key: "game:arcade", label: "AI Arcade", emoji: "🕹️", color: "#06b6d4", route: (id) => `/play/arcade?kid=${id}` },
  { key: "game:dream-life", label: "Dream Life", emoji: "🌟", color: "#8b5cf6", route: (id) => `/play/dream-life?kid=${id}` },
  { key: "game:money-town", label: "Money Town", emoji: "💰", color: "#eab308", route: (id) => `/play/money-town?kid=${id}` },
  { key: "game:family-talking-point", label: "Family Chat", emoji: "💬", color: "#14b8a6", route: (id) => `/play/family-talking-point?kid=${id}` },
  { key: "game:village-pillage", label: "Village Pillage", emoji: "🏰", color: "#10b981", route: (id) => `/play/village-pillage?kid=${id}` },
  { key: "game:library", label: "Story Library", emoji: "📖", color: "#0ea5e9", route: (id) => `/play/library?kid=${id}` },
  { key: "game:learn", label: "Learn", emoji: "📚", color: "#f43f5e", route: (id) => `/play/learn?kid=${id}` },
];

/** Resolves a "game:*" onZone key from this room into the route KidGameApp should navigate to. */
export function resolveDoorwayRoute(key: string, kidId: string): string | null {
  const def = CABINETS.find((d) => d.key === key);
  return def ? def.route(kidId) : null;
}
