"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthResult = { ok: true } | { ok: false; error: string };

export async function signIn({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true };
}

export async function signUp({
  email,
  password,
  familyName,
  kidNames,
}: {
  email: string;
  password: string;
  familyName: string;
  kidNames: string[];
}): Promise<AuthResult> {
  if (familyName.length < 2) {
    return { ok: false, error: "Pick a family name with at least 2 characters." };
  }
  if (password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }

  const cleanKidNames = kidNames.length > 0 ? kidNames : ["Kid 1"];

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Stash setup details on the user so we can seed the family on first
      // authenticated visit even if email confirmation delays the session.
      data: { family_name: familyName, kid_names: cleanKidNames },
    },
  });
  if (error || !data.user) {
    return { ok: false, error: friendlyAuthError(error?.message ?? "Sign up failed") };
  }

  if (!data.session) {
    // Email confirmation is on. Try silent sign-in (it'll succeed only if
    // confirmation isn't required). The family will be seeded on whatever
    // page they land on next via ensureFamilySeeded().
    await supabase.auth.signInWithPassword({ email, password });
    if (!(await currentUserId(supabase))) {
      return {
        ok: true, // signup itself succeeded
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - augmenting AuthResult shape for the rare email-confirm path
        info: "Account created — please check your email to confirm, then sign in.",
      };
    }
  }

  // We have a session — seed immediately
  const seedError = await seedNewFamily({
    userId: data.user.id,
    familyName,
    kidNames: cleanKidNames,
  });
  if (seedError) return { ok: false, error: seedError };

  return { ok: true };
}

/**
 * Idempotent family seeding. Call this on first authenticated visit to
 * recover users whose signup landed on the email-confirmation path. Safe to
 * call on every request — it short-circuits if a family already exists.
 */
export async function ensureFamilySeeded(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (existing) return;

  const meta = user.user_metadata as
    | { family_name?: string; kid_names?: string[] }
    | undefined;
  await seedNewFamily({
    userId: user.id,
    familyName: meta?.family_name ?? "My family",
    kidNames:
      meta?.kid_names && meta.kid_names.length > 0
        ? meta.kid_names
        : ["Kid 1"],
  });
}

async function currentUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function verifyParentPin(enteredPin: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("families")
    .select("parent_pin")
    .maybeSingle();
  if (!data?.parent_pin) return { ok: true }; // no PIN set → always passes
  return { ok: data.parent_pin === enteredPin };
}

// ----- Helpers -----

function friendlyAuthError(raw: string): string {
  if (/invalid login credentials/i.test(raw)) {
    return "Wrong email or password.";
  }
  if (/already registered/i.test(raw) || /user already/i.test(raw)) {
    return "There's already an account with that email — try signing in.";
  }
  return raw;
}

async function seedNewFamily({
  userId,
  familyName,
  kidNames,
}: {
  userId: string;
  familyName: string;
  kidNames: string[];
}): Promise<string | null> {
  const supabase = await createClient();

  // Family
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .insert({
      owner_user_id: userId,
      name: familyName,
      family_points_balance: 0,
    })
    .select("id")
    .single();
  if (famErr || !fam) {
    return famErr?.message ?? "Could not create family.";
  }
  const familyId: string = fam.id;

  // Kids — cycle through theme presets and a small avatar pool. Both can
  // be changed later from each kid's profile page.
  const themes = ["adventure", "magical", "galactic", "ocean", "dino", "garden"] as const;
  const avatars = ["🦊", "🐼", "🦁", "🐯", "🐻", "🐰", "🦄", "🐲", "🐧", "🐶"];
  const kidPayloads = kidNames.map((name, i) => ({
    family_id: familyId,
    name,
    avatar: avatars[i % avatars.length],
    theme_id: themes[i % themes.length],
  }));

  const { data: kids, error: kidsErr } = await supabase
    .from("kids")
    .insert(kidPayloads)
    .select("id, name");
  if (kidsErr || !kids) {
    return kidsErr?.message ?? "Could not add kids.";
  }

  // Starter tasks (shared)
  const sharedTasks = [
    {
      family_id: familyId,
      name: "Make bed",
      icon: "🛏️",
      category: "chore",
      time_block: "morning",
      start_time: "07:30",
      points: 5,
    },
    {
      family_id: familyId,
      name: "Brush teeth",
      icon: "🦷",
      category: "chore",
      time_block: "morning",
      start_time: "07:45",
      points: 3,
    },
    {
      family_id: familyId,
      name: "Read 15 minutes",
      icon: "📖",
      category: "personal",
      time_block: "evening",
      start_time: "19:30",
      duration_minutes: 15,
      points: 5,
    },
    {
      family_id: familyId,
      name: "Help with dinner",
      icon: "🍽️",
      category: "chore",
      time_block: "evening",
      start_time: "18:30",
      points: 8,
    },
  ];
  const { error: tasksErr } = await supabase.from("tasks").insert(sharedTasks);
  if (tasksErr) return tasksErr.message;

  // Starter rewards
  const starterRewards = [
    {
      family_id: familyId,
      name: "Ice cream",
      icon: "🍦",
      cost_points: 100,
      type: "individual",
    },
    {
      family_id: familyId,
      name: "Extra 30min screen time",
      icon: "📱",
      cost_points: 50,
      type: "individual",
    },
    {
      family_id: familyId,
      name: "Movie night",
      description: "Whole family movie + popcorn",
      icon: "🎬",
      cost_points: 400,
      type: "family",
    },
  ];
  const { error: rewErr } = await supabase.from("rewards").insert(starterRewards);
  if (rewErr) return rewErr.message;

  // Daily school essentials per kid (Mon-Fri)
  const weekdays = [1, 2, 3, 4, 5];
  const essentials = kids.flatMap((k) => [
    { family_id: familyId, kid_id: k.id, name: "Lunchbox", icon: "🥪", days_of_week: weekdays },
    { family_id: familyId, kid_id: k.id, name: "Water bottle", icon: "💧", days_of_week: weekdays },
    { family_id: familyId, kid_id: k.id, name: "Hat", icon: "🧢", days_of_week: weekdays },
  ]);
  if (essentials.length > 0) {
    const { error: schErr } = await supabase.from("school_items").insert(essentials);
    if (schErr) return schErr.message;
  }

  return null;
}
