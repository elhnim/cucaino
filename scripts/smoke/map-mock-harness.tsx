// Standalone visual-QA harness for the new map: a MOCKED ParkWorld (just the handful of getters
// the map actually reads) plus the REAL registries, so the map's look can be screenshotted fast,
// without three.js or WebGL. Bundle with:
//   npx esbuild scripts/smoke/map-mock-harness.tsx --bundle --format=iife --jsx=automatic --define:process.env.NODE_ENV='"production"' --outfile=<dir>/map-mock.js
// Not wired into the real app; delete the bundle after use (see the map task's visual-check step).
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { MiniMap, type MapPin } from "../../components/park/map";
import type { ParkWorld } from "../../lib/park/engine/ParkWorld";
import type { RidePin } from "../../lib/park/world/rideables";

interface MockState {
  x: number;
  z: number;
  facing: number;
  yaw: number;
  isNight: boolean;
  onTrain: boolean;
  canFlyTo: boolean;
  flyingTo: string | null;
}

const RIDE_PINS: RidePin[] = [
  { id: "dragon-ember", kind: "dragon", x: 60, z: -40, emoji: "🐉", label: "Ember" },
  { id: "dragon-sky", kind: "dragon", x: 70, z: -30, emoji: "🐉", label: "Skybolt" },
  { id: "dragon-rose", kind: "dragon", x: 55, z: -55, emoji: "🐉", label: "Rosewing" },
  { id: "manta-reef", kind: "manta", x: -40, z: 120, emoji: "🦭", label: "Reef Manta", sea: true, how: "Swim out from the beach to find a manta!" },
  { id: "dock-main", kind: "dock", x: 30, z: 150, emoji: "⚓", label: "Candy Harbour" },
  { id: "unicorn-glade", kind: "unicorn", x: -90, z: -10, emoji: "🦄", label: "Glade Unicorn" },
];

const PINS: MapPin[] = [
  { id: "quest-board", x: 0, z: -17, emoji: "📋", label: "Quest Board", badge: 3, pulse: true },
  { id: "wizard:cloud", x: 10, z: -4, emoji: "🧙", label: "Clio", pulse: true, sky: true },
];

function makeMockWorld(s: MockState) {
  return {
    getPose: () => ({ x: s.x, z: s.z, facing: s.facing, yaw: s.yaw, pet: { x: s.x + 3, z: s.z - 2 } }),
    get ridePins() {
      return RIDE_PINS;
    },
    getClockT: () => 6,
    get onTrain() {
      return s.onTrain;
    },
    railStop: null,
    get flyingTo() {
      return s.flyingTo;
    },
    get canFlyTo() {
      return s.canFlyTo;
    },
    get isNight() {
      return s.isNight;
    },
    walkKidPath: () => {},
    flyTo: () => true,
  } as unknown as ParkWorld;
}

function Harness() {
  const [s, setS] = useState<MockState>({ x: 0, z: 0, facing: 0, yaw: 0, isNight: false, onTrain: false, canFlyTo: false, flyingTo: null });
  const ref = { current: makeMockWorld(s) };
  (window as unknown as { __setMock: (p: Partial<MockState>) => void }).__setMock = (p) => setS((cur) => ({ ...cur, ...p }));
  return <MiniMap world={ref} kidId="mock-kid" pins={PINS} onToast={(t) => console.log("[toast]", t)} onSkyPin={(p) => console.log("[skypin]", p.label)} />;
}

const host = document.createElement("div");
document.body.appendChild(host);
createRoot(host).render(<Harness />);
