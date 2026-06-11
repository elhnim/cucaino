import BlastOffScreen from "@/components/auth/BlastOffScreen";
import LaunchRedirect from "@/components/auth/LaunchRedirect";

// Statically prerendered (CDN-served, service-worker cacheable) so the rocket
// appears INSTANTLY when the app opens — before any server work happens.
// LaunchRedirect then moves to /select-kid; the rocket stays visible while
// that page renders (its loading state is the same rocket, so no flash).
export const dynamic = "force-static";

export default function LaunchPage() {
  return (
    <>
      <BlastOffScreen prefetch />
      <LaunchRedirect />
    </>
  );
}
