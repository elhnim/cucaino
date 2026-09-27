// Lazy loader for the 3D world bundle (three.js + engine + interiors).
//
// Call prefetchWorld() early (kid picker, PIN pad, module-eval of KidGameApp) so the download
// overlaps with everything else; loadWorld() then resolves instantly from the same promise.
type WorldModules = [typeof import("./engine"), typeof import("./interiors")];

let pending: Promise<WorldModules> | null = null;

export function loadWorld(): Promise<WorldModules> {
  pending ??= Promise.all([import("./engine"), import("./interiors")]);
  return pending;
}

/** Fire-and-forget warm-up. Safe to call many times; errors surface later from loadWorld(). */
export function prefetchWorld() {
  if (typeof window === "undefined") return;
  loadWorld().catch(() => {
    pending = null; // let a later real load retry
  });
}
