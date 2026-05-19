"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function inviteParent(email: string): Promise<ActionResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Only the family owner may invite
  const { data: fam } = await supabase
    .from("families")
    .select("id, owner_user_id")
    .maybeSingle();
  if (!fam) return { ok: false, error: "Family not found." };
  if (fam.owner_user_id !== user.id) {
    return { ok: false, error: "Only the family owner can invite members." };
  }

  // Reject duplicate pending invite
  const { data: existing } = await supabase
    .from("family_invites")
    .select("id")
    .eq("invited_email", trimmed)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "A pending invite already exists for that email." };
  }

  // Insert invite row
  const { error: insertErr } = await supabase.from("family_invites").insert({
    family_id: fam.id,
    invited_email: trimmed,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  // Send magic-link email via admin API
  const admin = createAdminClient();
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(trimmed, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/accept-invite`,
  });
  if (inviteErr) return { ok: false, error: inviteErr.message };

  revalidatePath("/parent/settings");
  return { ok: true };
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const supabase = await createClient();

  // Scope to caller's family (defence-in-depth on top of RLS)
  const { data: fam } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (!fam) return { ok: false, error: "Family not found." };

  const { error } = await supabase
    .from("family_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parent/settings");
  return { ok: true };
}

export async function acceptInvite(): Promise<
  { ok: true; familyName: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const email = user.email.toLowerCase();

  // Find a valid pending invite for this email
  const { data: invite } = await admin
    .from("family_invites")
    .select("id, family_id")
    .eq("invited_email", email)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invite) {
    return {
      ok: false,
      error: "This invite has expired or is no longer valid. Ask the family owner to send a new one.",
    };
  }

  // Mark accepted
  const { error: acceptErr } = await admin
    .from("family_invites")
    .update({ status: "accepted" })
    .eq("id", invite.id);
  if (acceptErr) {
    return { ok: false, error: "Could not accept the invite. Please try again." };
  }

  // Append user to co_parent_user_ids (read-then-write)
  const { data: family, error: famReadErr } = await admin
    .from("families")
    .select("co_parent_user_ids, name")
    .eq("id", invite.family_id)
    .single();

  if (famReadErr || !family) {
    return { ok: false, error: "Could not load family data. Please try again." };
  }

  const existing: string[] = family.co_parent_user_ids ?? [];
  if (!existing.includes(user.id)) {
    const { error: famUpdateErr } = await admin
      .from("families")
      .update({ co_parent_user_ids: [...existing, user.id] })
      .eq("id", invite.family_id);
    if (famUpdateErr) {
      return { ok: false, error: "Could not join the family. Please try again." };
    }
  }

  return { ok: true, familyName: family.name ?? "your family" };
}
