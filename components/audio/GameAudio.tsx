"use client";

import { useEffect, useState } from "react";
import {
  getMuted,
  playMusic,
  setMuted,
  stopMusic,
  type MusicTrack,
} from "@/lib/audio/sound-manager";

const DEFAULT_CLASS =
  "fixed top-3 right-3 z-30 w-10 h-10 rounded-full bg-white/80 backdrop-blur " +
  "shadow flex items-center justify-center text-lg active:scale-95 transition-transform";

/**
 * Drop into a game once: starts the game's looping track on mount and stops it
 * on unmount (deferred 200ms so a remount with the same track — e.g. arcade hub
 * → arcade game — continues seamlessly). Renders the 🔊/🔇 toggle button.
 * Pass className to reposition where the default top-right slot collides with
 * existing chrome.
 */
export default function GameAudio({
  track,
  className,
}: {
  track: MusicTrack;
  className?: string;
}) {
  // Mute preference is read after mount to avoid a hydration mismatch.
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    setIsMuted(getMuted());
  }, []);

  useEffect(() => {
    playMusic(track);
    return () => stopMusic({ deferMs: 200 });
  }, [track]);

  const toggle = () => {
    const next = !isMuted;
    setMuted(next); // a tap is itself the unlock gesture
    setIsMuted(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isMuted ? "Turn sound on" : "Turn sound off"}
      className={className ?? DEFAULT_CLASS}
    >
      {isMuted ? "🔇" : "🔊"}
    </button>
  );
}
