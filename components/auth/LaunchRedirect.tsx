"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mounted on the static /launch splash: immediately navigates to the kid
 * picker. The splash (rocket) stays on screen until the destination is ready,
 * so the app shows something instantly instead of a blank wait.
 */
export default function LaunchRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/select-kid");
  }, [router]);

  return null;
}
