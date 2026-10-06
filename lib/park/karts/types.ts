export interface KartPose { t: number; x: number; z: number; yaw: number; speed: number; lap: number; progress: number /* 0..1 along the lap */ }
export interface KartRacer { kidId: string; name: string; animal: string /* ParkAnimal id, for the driver */; colour: string }
export interface GhostLap { kidId: string; name: string; animal: string; colour: string; trackId: string; lapMs: number; samples: KartPose[] /* ~10 Hz, t from 0 */ }
export type KartNetMsg =
  | { type: "hello"; racer: KartRacer; atTrack: boolean }
  | { type: "invite"; raceId: string; host: string; racers: KartRacer[] }
  | { type: "accept"; raceId: string; kidId: string }
  | { type: "start"; raceId: string; startAt: number /* epoch ms, ~4 s ahead, for a shared countdown */; grid: string[] /* kidIds in grid order */; laps: number }
  | { type: "pose"; raceId: string; kidId: string; pose: KartPose }
  | { type: "finish"; raceId: string; kidId: string; totalMs: number; bestLapMs: number }
  /** the fun layer (lib/park/karts/items.ts): a banana dropped / eaten, or a kart's star / bubble / spin to show */
  | { type: "item"; raceId: string; kidId: string; ev: "banana" | "eat" | "fx"; id?: string; x?: number; z?: number; fx?: "star" | "shield" | "spin" | "pop" }
  | { type: "leave"; raceId?: string; kidId: string };
export interface KartNet {
  /** family kids currently in the park and whether they're at the track (updates live) */
  onPeers(cb: (peers: (KartRacer & { atTrack: boolean })[]) => void): () => void;
  onMessage(cb: (m: KartNetMsg) => void): () => void;
  send(m: KartNetMsg): void;
  setAtTrack(at: boolean): void;
  dispose(): void;
}
export interface KartStore {
  saveLap(lap: GhostLap): Promise<void>;          // keeps only each kid's best lap per track
  ghosts(trackId: string): Promise<GhostLap[]>;   // the family's best laps (one per kid)
  leaderboard(trackId: string): Promise<{ kidId: string; name: string; animal: string; lapMs: number; friend?: boolean }[]>;
}
