"use client";

// Shared warm-up: prefetch every kid's main screens (RSC payload = real data)
// so navigation after the loading screen is instant. Used by the post-login
// loader and by the select-kid loading screen.

import type { useRouter } from "next/navigation";
import { preloadFamily } from "@/lib/actions/preload";

type AppRouter = ReturnType<typeof useRouter>;

export async function prefetchFamilyRoutes(router: AppRouter): Promise<void> {
  // Deliberately light. This used to prefetch 4 routes for EVERY kid (12+ full dynamic
  // server renders, each running ~10 cross-region DB queries) at the exact moment the kid
  // picker itself was rendering — they all competed for the same DB/function and made the
  // rocket screen crawl. Now: one tiny query to wake the DB, plus the picker route only.
  // Each kid's world is prefetched when they tap their profile (SelectKidClient).
  void router;
  try {
    await preloadFamily();
  } catch {
    // warm-up is best-effort — never block or break the loader
  }
}
