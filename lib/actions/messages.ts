"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listMessageSummariesForParent } from "@/lib/data/queries";
import type { MessageSummaryForParent } from "@/lib/domain/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function sendMessage(
  senderId: string,
  recipientId: string,
  body: string,
): Promise<ActionResult> {
  const sanitized = body.trim().replace(/[<>]/g, "").slice(0, 200);
  if (!sanitized) return { ok: false, error: "Message cannot be empty." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ sender_id: senderId, recipient_id: recipientId, body: sanitized });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markRead(
  kidId: string,
  friendId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversation_read_state")
    .upsert(
      { kid_id: kidId, other_kid_id: friendId, last_read_at: new Date().toISOString() },
      { onConflict: "kid_id,other_kid_id" }
    );

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/friends`);
  return { ok: true };
}

export async function listMessageSummariesForParentAction(kidId: string): Promise<MessageSummaryForParent[]> {
  return listMessageSummariesForParent(kidId);
}
