"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hashPin, verifyPin, isPinHashed } from "@/lib/utils/pin";

export type AuthResult =
  | { ok: true; info?: string }
  | { ok: false; error: string };

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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cucaino.com";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Stash setup details on the user so we can seed the family on first
      // authenticated visit even if email confirmation delays the session.
      data: { family_name: familyName, kid_names: cleanKidNames },
      emailRedirectTo: `${siteUrl}/auth/callback`,
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
        ok: true,
        info: "Account created! Please check your email to confirm, then sign in.",
      };
    }
  }

  // We have a session — seed immediately
  const seedError = await seedNewFamily({
    supabase,
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
    supabase,
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

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.cucaino.com";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  if (password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

export async function verifyParentPin(enteredPin: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("families")
    .select("id, parent_pin")
    .maybeSingle();
  if (!data?.parent_pin) return { ok: true }; // no PIN set → always passes

  const matches = await verifyPin(enteredPin, data.parent_pin);
  if (!matches) return { ok: false };

  // Migrate plain-text PIN to hashed on first successful verify
  if (!isPinHashed(data.parent_pin)) {
    const hashed = await hashPin(enteredPin);
    await supabase.from("families").update({ parent_pin: hashed }).eq("id", data.id);
  }

  return { ok: true };
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
  supabase,
  userId,
  familyName,
  kidNames,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  familyName: string;
  kidNames: string[];
}): Promise<string | null> {

  // Determine founder status — first 20 families get free-forever access
  const { count: founderCount } = await supabase
    .from("families")
    .select("*", { count: "exact", head: true })
    .eq("is_founder", true);
  const isFounder = (founderCount ?? 0) < 20;

  // Family
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .insert({
      owner_user_id: userId,
      name: familyName,
      family_points_balance: 0,
      is_founder: isFounder,
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

  // Starter tasks (shared — no kid assigned, visible to all kids)
  const sharedTasks = [
    // Before school
    { family_id: familyId, name: "Make bed", icon: "🛏️", category: "personal", time_block: "before_school", start_time: "07:30", points: 2, rule: "strict" },
    { family_id: familyId, name: "Morning Routine", icon: "🦷", category: "personal", time_block: "before_school", points: 5, rule: "strict" },
    // After school
    { family_id: familyId, name: "Unpack School Bag", icon: "🎒", category: "personal", time_block: "after_school", points: 2, rule: "strict" },
    { family_id: familyId, name: "Homework", icon: "📚", category: "personal", time_block: "after_school", duration_minutes: 20, points: 5, rule: "strict" },
    // Evening
    { family_id: familyId, name: "Read 15 minutes", icon: "📖", category: "personal", time_block: "evening", start_time: "19:30", duration_minutes: 15, points: 5, rule: "strict" },
    { family_id: familyId, name: "Pack School Bag", icon: "🎒", category: "personal", time_block: "evening", points: 2, rule: "strict" },
    { family_id: familyId, name: "Put dirty clothes in the laundry", icon: "👕", category: "chore", time_block: "evening", points: 2, rule: "strict" },
    // Flexible chores
    { family_id: familyId, name: "Set the table", icon: "🍽️", category: "chore", time_block: "anytime", points: 4, rule: "flexible" },
    { family_id: familyId, name: "Clear the table", icon: "🫧", category: "chore", time_block: "anytime", points: 4, rule: "flexible" },
    { family_id: familyId, name: "Tidy my room", icon: "🧹", category: "chore", time_block: "anytime", duration_minutes: 10, points: 7, rule: "flexible" },
    { family_id: familyId, name: "Put away folded clothes", icon: "🧺", category: "chore", time_block: "anytime", points: 3, rule: "flexible" },
    { family_id: familyId, name: "Help cook dinner", icon: "🍳", category: "chore", time_block: "anytime", duration_minutes: 20, points: 10, rule: "flexible" },
    { family_id: familyId, name: "Load the dishwasher", icon: "🍽️", category: "chore", time_block: "anytime", points: 7, rule: "flexible" },
    { family_id: familyId, name: "Unload the dishwasher", icon: "✨", category: "chore", time_block: "anytime", points: 7, rule: "flexible" },
    { family_id: familyId, name: "Vacuum the carpet", icon: "🌀", category: "chore", time_block: "anytime", duration_minutes: 10, points: 8, rule: "flexible" },
    { family_id: familyId, name: "Sweep the floor", icon: "🧹", category: "chore", time_block: "anytime", duration_minutes: 10, points: 6, rule: "flexible" },
    { family_id: familyId, name: "Wipe the counters", icon: "🧽", category: "chore", time_block: "anytime", points: 4, rule: "flexible" },
    { family_id: familyId, name: "Clean bathroom sink", icon: "🚿", category: "chore", time_block: "anytime", points: 6, rule: "flexible" },
    { family_id: familyId, name: "Take out the trash", icon: "🗑️", category: "chore", time_block: "anytime", points: 5, rule: "flexible" },
    { family_id: familyId, name: "Sort recycling", icon: "♻️", category: "chore", time_block: "anytime", points: 4, rule: "flexible" },
    { family_id: familyId, name: "Water the plants", icon: "🌱", category: "chore", time_block: "anytime", points: 4, rule: "flexible" },
    { family_id: familyId, name: "Feed the pet", icon: "🐾", category: "chore", time_block: "anytime", points: 3, rule: "flexible" },
  ];
  const { error: tasksErr } = await supabase.from("tasks").insert(sharedTasks);
  if (tasksErr) return tasksErr.message;

  // Starter rewards
  const starterRewards = [
    { family_id: familyId, name: "Pick the music in the car", icon: "🎵", description: "DJ for the whole car ride", cost_points: 5, type: "individual", requires_approval: false },
    { family_id: familyId, name: "Choose the game tonight", icon: "🎲", description: "Pick the board game or card game for family night", cost_points: 15, type: "individual", requires_approval: false },
    { family_id: familyId, name: "15 min extra screen time", icon: "📱", description: "Bonus screen time on any device", cost_points: 20, type: "individual", requires_approval: true },
    { family_id: familyId, name: "Choose dinner tonight", icon: "🍕", description: "You pick what the family eats for dinner", cost_points: 30, type: "individual", requires_approval: false },
    { family_id: familyId, name: "Special breakfast", icon: "🥞", description: "Pick your dream breakfast — pancakes? waffles?", cost_points: 30, type: "individual", requires_approval: false },
    { family_id: familyId, name: "Takeaway night pick", icon: "🥡", description: "You choose the takeaway restaurant", cost_points: 40, type: "individual", requires_approval: true },
    { family_id: familyId, name: "Breakfast in bed", icon: "☕", description: "Wake up to your breakfast delivered!", cost_points: 40, type: "individual", requires_approval: true },
    { family_id: familyId, name: "New book", icon: "📚", description: "Pick any book you'd like to read", cost_points: 50, type: "individual", requires_approval: true },
    { family_id: familyId, name: "1 hour extra screen time", icon: "📺", description: "A whole extra hour on your favourite screen", cost_points: 80, type: "individual", requires_approval: true },
    { family_id: familyId, name: "Small toy or craft kit", icon: "🧩", description: "Choose a small toy or activity kit", cost_points: 110, type: "individual", requires_approval: true },
    { family_id: familyId, name: "New app or game download", icon: "🎮", description: "Pick one new app or mobile game", cost_points: 120, type: "individual", requires_approval: true },
    { family_id: familyId, name: "Play date", icon: "👫", cost_points: 150, type: "individual", requires_approval: true },
    { family_id: familyId, name: "Ice cream outing", icon: "🍦", description: "A trip to your favourite ice cream spot", cost_points: 150, type: "individual", requires_approval: true },
    { family_id: familyId, name: "Park or playground trip", icon: "🌳", description: "A special trip to your favourite outdoor spot", cost_points: 150, type: "family", requires_approval: true },
    { family_id: familyId, name: "Sleepover", icon: "🛌", description: "Have a friend sleep over at your place", cost_points: 200, type: "individual", requires_approval: true },
    { family_id: familyId, name: "Dinner outside", icon: "🍽️", description: "Request for a dining out night", cost_points: 250, type: "individual", requires_approval: true },
    { family_id: familyId, name: "Movie night", icon: "🎬", description: "Whole family movie + popcorn", cost_points: 300, type: "individual", requires_approval: true },
    { family_id: familyId, name: "Bowling trip", icon: "🎳", description: "Head to the bowling alley for a game", cost_points: 300, type: "individual", requires_approval: true },
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
