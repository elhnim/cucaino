"use server";

import { listKids } from "@/lib/data/stub";

/**
 * Lightweight post-login preload: returns the kid ids/names so the client
 * loader can prefetch each kid's routes (RSC payloads = real data warm-up).
 * Also acts as the first DB touch that wakes a sleeping Supabase project.
 */
export async function preloadFamily(): Promise<{ kidIds: string[] }> {
  try {
    const kids = await listKids();
    return { kidIds: kids.map((k) => k.id) };
  } catch {
    return { kidIds: [] };
  }
}
