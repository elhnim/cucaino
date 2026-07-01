// Shared multi-device room types. Game-agnostic: any game stores its own
// state under `RoomState.game` while the backend owns members + lifecycle.

export interface RoomMember {
  id: string; // unique per player/device for the life of the room
  name: string;
  avatar: string;
  kidId: string | null;
  isHost: boolean;
}

export interface RoomState<G = unknown> {
  members: RoomMember[];
  game: G;
}

export type RoomStatus = "lobby" | "playing" | "finished";

export interface GameRoom<G = unknown> {
  id: string;
  gameKey: string;
  roomCode: string;
  status: RoomStatus;
  state: RoomState<G>;
}

export type RoomResult<T> = { ok: true; data: T } | { ok: false; error: string };
