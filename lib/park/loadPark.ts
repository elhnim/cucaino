// Lazy loader for the park's 3D bundle (three.js + engine + world). Call prefetchPark() early
// (kid picker, PIN pad, module-eval of ParkApp) so the download overlaps with everything else.
type ParkModule = typeof import("./engine/ParkWorld");

let pending: Promise<ParkModule> | null = null;

export function loadPark(): Promise<ParkModule> {
  pending ??= import("./engine/ParkWorld");
  return pending;
}

export function prefetchPark() {
  if (typeof window === "undefined") return;
  loadPark().catch(() => {
    pending = null;
  });
}
