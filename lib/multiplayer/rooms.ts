"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import type { GameRoom, RoomMember, RoomResult, RoomState, RoomStatus } from "./types";

// 4-letter codes, no easily-confused characters (no I/O/0/1).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
function makeCode(): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRoom(row: any): GameRoom {
  return {
    id: row.id,
    gameKey: row.game_key,
    roomCode: row.room_code,
    status: row.status,
    state: row.state ?? { members: [], game: {} },
  };
}

async function familyIdForKid(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kidId: string | null,
): Promise<string | null> {
  if (!kidId) return null;
  const { data } = await supabase
    .from("kids")
    .select("family_id")
    .eq("id", kidId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any)?.family_id ?? null;
}

function pickAvatar(pool: string[] | undefined, used: string[]): string {
  if (!pool || pool.length === 0) return "🙂";
  return pool.find((a) => !used.includes(a)) ?? pool[used.length % pool.length];
}

/** Create a new room with the caller as host. Returns the room + the host's member id. */
export async function createRoom(args: {
  gameKey: string;
  kidId: string | null;
  hostName: string;
  avatarPool?: string[];
  initialGameState?: unknown;
}): Promise<RoomResult<{ roomId: string; roomCode: string; memberId: string }>> {
  const supabase = await createClient();
  const familyId = await familyIdForKid(supabase, args.kidId);
  if (!familyId) return { ok: false, error: "Couldn't find your family — open this from a kid profile." };

  const memberId = randomUUID();
  const roomCode = makeCode();
  const host: RoomMember = {
    id: memberId,
    name: args.hostName.trim() || "Player",
    avatar: pickAvatar(args.avatarPool, []),
    kidId: args.kidId ?? null,
    isHost: true,
  };
  const state: RoomState = { members: [host], game: args.initialGameState ?? {} };

  const { data, error } = await supabase
    .from("game_rooms")
    .insert({ family_id: familyId, game_key: args.gameKey, room_code: roomCode, status: "lobby", state })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create room" };
  return { ok: true, data: { roomId: data.id, roomCode, memberId } };
}

/** Join an open (lobby) room by code. Returns the room + the new member id. */
export async function joinRoom(args: {
  gameKey: string;
  code: string;
  name: string;
  kidId: string | null;
  avatarPool?: string[];
  maxMembers?: number;
}): Promise<RoomResult<{ roomId: string; memberId: string }>> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("game_rooms")
    .select("id, status, state")
    .eq("game_key", args.gameKey)
    .eq("room_code", args.code.trim().toUpperCase())
    .eq("status", "lobby")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return { ok: false, error: error.message };
  const room = rows?.[0];
  if (!room) return { ok: false, error: "No open room with that code." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = (room as any).state as RoomState;
  const members = state.members ?? [];
  if (args.maxMembers && members.length >= args.maxMembers) return { ok: false, error: "That room is full." };

  const memberId = randomUUID();
  const member: RoomMember = {
    id: memberId,
    name: args.name.trim() || "Player",
    avatar: pickAvatar(args.avatarPool, members.map((m) => m.avatar)),
    kidId: args.kidId ?? null,
    isHost: false,
  };
  const { error: updErr } = await supabase
    .from("game_rooms")
    .update({ state: { ...state, members: [...members, member] }, updated_at: new Date().toISOString() })
    .eq("id", room.id);
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true, data: { roomId: room.id, memberId } };
}

export async function getRoom(roomId: string): Promise<RoomResult<GameRoom>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("game_rooms")
    .select("id, game_key, room_code, status, state")
    .eq("id", roomId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "Room not found" };
  return { ok: true, data: rowToRoom(data) };
}

/** Replace the room state and/or status (use for host-driven transitions). */
export async function patchRoom(
  roomId: string,
  patch: { state?: RoomState; status?: RoomStatus },
): Promise<RoomResult<null>> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = { updated_at: new Date().toISOString() };
  if (patch.state !== undefined) update.state = patch.state;
  if (patch.status !== undefined) update.status = patch.status;
  const { error } = await supabase.from("game_rooms").update(update).eq("id", roomId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

/** Atomically set a single path under `state` (safe for concurrent writers). */
export async function setRoomStatePath(
  roomId: string,
  path: string[],
  value: unknown,
): Promise<RoomResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_room_state_path", {
    p_room_id: roomId,
    p_path: path,
    p_value: value,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

/**
 * Submit a hidden choice for a simultaneous-reveal game. The payload is stored
 * server-side and only exposed (into state.game.reveal) once every member has
 * submitted — opponents can't read it before then.
 */
export async function submitRoomSecret(
  roomId: string,
  memberId: string,
  payload: unknown,
): Promise<RoomResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_room_secret", {
    p_room_id: roomId,
    p_member_id: memberId,
    p_payload: payload,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

/** Remove a member (used when leaving the lobby). Best-effort. */
export async function leaveRoom(roomId: string, memberId: string): Promise<RoomResult<null>> {
  const supabase = await createClient();
  const { data } = await supabase.from("game_rooms").select("state").eq("id", roomId).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = (data as any)?.state as RoomState | undefined;
  if (!state) return { ok: true, data: null };
  const members = (state.members ?? []).filter((m) => m.id !== memberId);
  await supabase
    .from("game_rooms")
    .update({ state: { ...state, members }, updated_at: new Date().toISOString() })
    .eq("id", roomId);
  return { ok: true, data: null };
}
