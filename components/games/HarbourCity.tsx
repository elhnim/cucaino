"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createTycoonHost } from "@/lib/games/harbour-city/host";
import { isEmbedded, closeWorldWindow } from "@/lib/embed";

/**
 * Full-screen Harbour City Tycoon. The game itself is a self-contained three.js page in
 * public/games/harbour-city; this component hands it a Supabase-backed host (multiplayer,
 * identity, exit) through `window.__tycoonHost` before the iframe loads.
 */
export default function HarbourCity({ kidId, kidName, familyId }: { kidId: string; kidName: string; familyId: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = createTycoonHost({
      supabase: createClient(),
      familyId,
      kidId,
      kidName,
      // Opened from the park's Rides & Games window: just close that window. Otherwise go
      // back to the play hub (which lives in the park now).
      onExit: () => (isEmbedded() ? closeWorldWindow() : router.push(`/park/${kidId}?enter=rides`)),
    });
    (window as unknown as { __tycoonHost?: unknown }).__tycoonHost = host;
    setReady(true);
    return () => {
      host.dispose();
      delete (window as unknown as { __tycoonHost?: unknown }).__tycoonHost;
    };
  }, [familyId, kidId, kidName, router]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#08141f", zIndex: 50 }}>
      {ready && (
        <iframe
          src="/games/harbour-city/index.html"
          title="Harbour City Tycoon"
          allow="fullscreen; autoplay"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      )}
    </div>
  );
}
