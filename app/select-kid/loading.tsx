import BlastOffScreen from "@/components/auth/BlastOffScreen";

// Streams instantly while the kid-picker renders on the server — so opening
// the app shows the Blast-off rocket, not a grey skeleton.
export default function Loading() {
  return <BlastOffScreen prefetch />;
}
