"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listFriends } from "@/lib/data/queries";
import type { FriendKid } from "@/lib/domain/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function sendFriendRequest(
  fromKidId: string,
  toUsername: string,
): Promise<ActionResult> {
  if (!toUsername.trim()) return { ok: false, error: "Enter a username." };
  const supabase = await createClient();

  // Look up target kid by username (case-insensitive)
  const { data: toKid } = await supabase
    .from("kids")
    .select("id")
    .ilike("username", toUsername.trim())
    .maybeSingle();

  if (!toKid) return { ok: false, error: "User not found." };
  if (toKid.id === fromKidId) return { ok: false, error: "You can't add yourself." };

  // Check for existing relationship in either direction
  const { data: fwd } = await supabase
    .from("kid_friendships")
    .select("status")
    .eq("kid_id", fromKidId)
    .eq("friend_id", toKid.id)
    .maybeSingle();

  const { data: rev } = await supabase
    .from("kid_friendships")
    .select("status")
    .eq("kid_id", toKid.id)
    .eq("friend_id", fromKidId)
    .maybeSingle();

  if (fwd?.status === "accepted" || rev?.status === "accepted") return { ok: false, error: "Already friends." };
  if (fwd?.status === "pending" || rev?.status === "pending") return { ok: false, error: "Request already pending." };

  const { error } = await supabase
    .from("kid_friendships")
    .insert({ kid_id: fromKidId, friend_id: toKid.id, status: "pending" });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${fromKidId}/friends`);
  revalidatePath(`/kid/${toKid.id}/friends`);
  return { ok: true };
}

export async function acceptFriendRequest(
  kidId: string,
  requesterId: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: updated, error: updateErr } = await supabase
    .from("kid_friendships")
    .update({ status: "accepted" })
    .eq("kid_id", requesterId)
    .eq("friend_id", kidId)
    .eq("status", "pending")
    .select("id");

  if (updateErr) return { ok: false, error: updateErr.message };
  if (!updated || updated.length === 0) return { ok: false, error: "No pending request found." };

  const { error: insertErr } = await supabase
    .from("kid_friendships")
    .insert({ kid_id: kidId, friend_id: requesterId, status: "accepted" });

  if (insertErr) return { ok: false, error: insertErr.message };

  revalidatePath(`/kid/${kidId}/friends`);
  revalidatePath(`/kid/${requesterId}/friends`);
  return { ok: true };
}

export async function declineFriendRequest(
  kidId: string,
  requesterId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("kid_friendships")
    .delete()
    .eq("kid_id", requesterId)
    .eq("friend_id", kidId)
    .eq("status", "pending");

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/friends`);
  return { ok: true };
}

export async function removeFriend(
  kidId: string,
  friendId: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  // Delete both directions
  const { error: err1 } = await supabase
    .from("kid_friendships")
    .delete()
    .eq("kid_id", kidId)
    .eq("friend_id", friendId);

  if (err1) return { ok: false, error: err1.message };

  const { error: err2 } = await supabase
    .from("kid_friendships")
    .delete()
    .eq("kid_id", friendId)
    .eq("friend_id", kidId);

  if (err2) return { ok: false, error: err2.message };
  revalidatePath(`/kid/${kidId}/friends`);
  revalidatePath(`/kid/${friendId}/friends`);
  revalidatePath(`/parent/kids/${kidId}/edit`);
  revalidatePath(`/parent/kids/${friendId}/edit`);
  return { ok: true };
}

// Server action wrapper for client components (parent dashboard)
export async function listFriendsAction(kidId: string): Promise<FriendKid[]> {
  return listFriends(kidId);
}
