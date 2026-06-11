"use client";

// Shared warm-up: prefetch every kid's main screens (RSC payload = real data)
// so navigation after the loading screen is instant. Used by the post-login
// loader and by the select-kid loading screen.

import type { useRouter } from "next/navigation";
import { preloadFamily } from "@/lib/actions/preload";

type AppRouter = ReturnType<typeof useRouter>;

export async function prefetchFamilyRoutes(router: AppRouter): Promise<void> {
  try {
    const { kidIds } = await preloadFamily();
    for (const id of kidIds) {
      router.prefetch(`/kid/${id}/home`);
      router.prefetch(`/kid/${id}/todo`);
      router.prefetch(`/kid/${id}/play`);
      router.prefetch(`/kid/${id}/rewards`);
    }
  } catch {
    // warm-up is best-effort — never block or break the loader
  }
}
