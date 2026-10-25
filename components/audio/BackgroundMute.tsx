"use client";

import { installBackgroundMute } from "@/lib/audio/backgroundMute";

// Installed when this module first loads in the browser (before any game or the park has made a
// sound): silences the whole app while it's hidden, switched away from or closed.
if (typeof window !== "undefined") installBackgroundMute(window as unknown as Parameters<typeof installBackgroundMute>[0]);

export default function BackgroundMute() {
  return null;
}
