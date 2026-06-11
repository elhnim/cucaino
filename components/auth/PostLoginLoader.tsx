"use client";

// Post-login "Blast-off" loader: entertains kids while genuinely preloading
// the family's screens (RSC prefetch = data + code warm-up).
// Min ~3s of fun so it never flashes; capped at ~7s so it never drags.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prefetchFamilyRoutes } from "@/lib/preload-routes";
import BlastOffScreen from "./BlastOffScreen";

const MIN_SHOW_MS = 3_000;
const MAX_SHOW_MS = 7_000;

export default function PostLoginLoader({ next }: { next: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const launched = useRef(false);

  // the actual preload + navigation
  useEffect(() => {
    if (launched.current) return;
    launched.current = true;

    const work = (async () => {
      router.prefetch(next);
      router.prefetch("/select-kid");
      await prefetchFamilyRoutes(router);
      // give prefetches a moment to land in the router cache
      await new Promise((r) => setTimeout(r, 800));
    })();

    const minTime = new Promise((r) => setTimeout(r, MIN_SHOW_MS));
    const cap = new Promise((r) => setTimeout(r, MAX_SHOW_MS));

    Promise.race([Promise.allSettled([work, minTime]), cap]).then(() => {
      setReady(true);
      setTimeout(() => router.push(next), 650);
    });
  }, [next, router]);

  return <BlastOffScreen ready={ready} />;
}
