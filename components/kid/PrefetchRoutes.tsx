"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PrefetchRoutes({ routes }: { routes: string[] }) {
  const router = useRouter();

  useEffect(() => {
    routes.forEach((r) => router.prefetch(r));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
