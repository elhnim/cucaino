"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { World3D as World3DClass } from "@/lib/game3d/engine";
import { LANDMARKS, type InitialGameData, type LandmarkKey } from "@/lib/game3d/types";
import { getTheme } from "@/lib/themes/presets";
import { getSpecies, type Pet } from "@/lib/pet/logic";
import { Joystick } from "./Joystick";
import { PetPanel } from "./panels/PetPanel";

/**
 * Mounts the full-viewport three.js canvas and the HUD/panel overlays on top of it.
 * three.js is imported dynamically inside the effect so nothing WebGL-only ever
 * runs during SSR.
 */
export default function KidGameApp({ data }: { data: InitialGameData }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World3DClass | null>(null);
  const router = useRouter();
  const kidId = data.kid.id;

  const [pet, setPet] = useState(data.pet);
  const [points, setPoints] = useState(data.kid.pointsBalance);
  const [sparkles, setSparkles] = useState(0);
  const [arrival, setArrival] = useState<LandmarkKey | null>(null);
  const [showPetPanel, setShowPetPanel] = useState(false);
  const [flash, setFlash] = useState(false);

  const handleArrive = useCallback(
    (key: LandmarkKey) => {
      const def = LANDMARKS.find((l) => l.key === key);
      if (!def) return;
      setArrival(key);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 260);
      worldRef.current?.setInputEnabled(false);
      window.setTimeout(() => {
        setArrival(null);
        if (def.route) {
          router.push(`/kid/${kidId}/${def.route}`);
        } else {
          setShowPetPanel(true);
          worldRef.current?.setInputEnabled(true);
        }
      }, 420);
    },
    [kidId, router],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let world: World3DClass | undefined;

    import("@/lib/game3d/engine").then(({ World3D }) => {
      if (disposed || !hostRef.current) return;
      const theme = getTheme(data.kid.themeId);
      world = new World3D(hostRef.current, {
        playerAccent: theme.accent,
        petSpeciesColor: data.pet ? getSpecies(data.pet.species).color : undefined,
        onArrive: handleArrive,
        onSparkle: setSparkles,
      });
      worldRef.current = world;
    });

    return () => {
      disposed = true;
      world?.dispose();
      worldRef.current = null;
    };
    // boot once; live updates flow through React state + the world's setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#bfe6ff" }}>
      <style>{"@keyframes cucaino-flash { from { opacity: 1; } to { opacity: 0; } }"}</style>
      <div ref={hostRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />

      <div style={hudTopStyle}>
        <button style={backBtnStyle} onClick={() => router.push(`/kid/${kidId}/home`)}>
          ← Home
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          <Chip emoji="🪙" value={points} />
          <Chip emoji="⭐" value={data.tasksToday.done} suffix={`/${data.tasksToday.total}`} />
          {sparkles > 0 && <Chip emoji="✨" value={sparkles} />}
        </div>
      </div>

      <div style={{ ...toastStyle, opacity: arrival ? 1 : 0 }}>
        {arrival && `${LANDMARKS.find((l) => l.key === arrival)?.emoji} ${LANDMARKS.find((l) => l.key === arrival)?.label}!`}
      </div>

      {flash && <div style={flashStyle} />}

      <Joystick onChange={(x, y) => worldRef.current?.setMoveVector(x, y)} />

      {showPetPanel && (
        <PetPanel
          kidId={kidId}
          pet={pet}
          onPetChange={(p: Pet) => setPet(p)}
          onPointsChange={setPoints}
          onClose={() => setShowPetPanel(false)}
          onReaction={() => worldRef.current?.celebratePet()}
        />
      )}
    </div>
  );
}

function Chip({ emoji, value, suffix }: { emoji: string; value: number; suffix?: string }) {
  return (
    <div style={chipStyle}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <span style={{ fontWeight: 800, color: "#6b4a1f" }}>
        {value}
        {suffix ?? ""}
      </span>
    </div>
  );
}

const hudTopStyle: React.CSSProperties = {
  position: "fixed",
  left: "max(16px, env(safe-area-inset-left))",
  right: "max(16px, env(safe-area-inset-right))",
  top: "max(16px, env(safe-area-inset-top))",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  zIndex: 20,
  pointerEvents: "none",
};

const backBtnStyle: React.CSSProperties = {
  pointerEvents: "auto",
  border: "none",
  borderRadius: 999,
  padding: "10px 18px",
  fontWeight: 700,
  color: "#6b4a1f",
  background: "rgba(255,255,255,0.85)",
  boxShadow: "0 3px 10px rgba(0,0,0,0.15)",
  cursor: "pointer",
};

const chipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "rgba(255,255,255,0.85)",
  borderRadius: 999,
  padding: "8px 14px",
  boxShadow: "0 3px 10px rgba(0,0,0,0.15)",
};

const toastStyle: React.CSSProperties = {
  position: "fixed",
  top: "14%",
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(255,255,255,0.95)",
  color: "#5a3a18",
  fontWeight: 800,
  fontSize: 22,
  padding: "10px 22px",
  borderRadius: 999,
  boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
  transition: "opacity 200ms ease",
  zIndex: 30,
  pointerEvents: "none",
};

const flashStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#fff",
  animation: "cucaino-flash 260ms ease-out",
  zIndex: 50,
  pointerEvents: "none",
};
