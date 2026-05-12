"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PrefetchDays({ activeDow }: { activeDow: number }) {
  const router = useRouter();

  useEffect(() => {
    for (let d = 1; d <= 7; d++) {
      if (d !== activeDow) {
        router.prefetch(`?day=${d}`);
      }
    }
  }, [activeDow, router]);

  return null;
}
