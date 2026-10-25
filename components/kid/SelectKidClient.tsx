"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import PinPad from "@/components/kid/PinPad";
import { setKidPin, verifyKidPin } from "@/lib/actions/kids";
import { signOut, verifyParentPin } from "@/lib/actions/auth";
import { AmbientBackdrop } from "@/components/game/AmbientBackdrop";
import type { PickerCharacter } from "@/lib/park/world/pickerScene";
import { loadParkAnimalChoice } from "@/lib/park/registry/animals";
import { prefetchPark } from "@/lib/park/loadPark";
import { getFamilyProgress } from "@/lib/actions/park-quests";
import type { Kid } from "@/lib/domain/types";
import type { Theme } from "@/lib/themes/presets";

type Modal =
  | { kind: "verify"; kid: Kid }
  | { kind: "force-set"; kid: Kid }
  | { kind: "parent-verify" }
  | null;

export default function SelectKidClient({
  kids,
  themes,
  hasParentPin,
  familyName,
  parentDisplayName,
  parentAvatar,
  kidProgress = [],
}: {
  kids: Kid[];
  themes: Theme[];
  hasParentPin: boolean;
  familyName: string | null;
  parentDisplayName?: string | null;
  parentAvatar?: string;
  kidProgress?: { kidId: string; done: number; total: number }[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const [isPending, startTransition] = useTransition();

  const themeById = new Map(themes.map((t) => [t.id, t]));
  const [progress, setProgress] = useState(kidProgress);
  useEffect(() => {
    if (kids.length === 0) return;
    getFamilyProgress(kids.map((k) => k.id)).then(setProgress).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const progressById = new Map(progress.map((p) => [p.kidId, p]));

  const tap = (kid: Kid) => {
    // start rendering their world on the server while they type the PIN
    router.prefetch(`/park/${kid.id}`);
    if (kid.pin) {
      setModal({ kind: "verify", kid });
    } else {
      setModal({ kind: "force-set", kid });
    }
  };

  // Each kid stands in the 3D meadow as the animal they picked in the world (saved per
  // device), so the picker already feels like part of the game. Built after mount because
  // the choice lives in localStorage.
  const [characters, setCharacters] = useState<PickerCharacter[]>([]);
  useEffect(() => {
    setCharacters(
      kids.map((kid) => ({
        id: kid.id,
        label: `${kid.name}${kid.pin ? " 🔒" : ""}`,
        animal: loadParkAnimalChoice(kid.id, kid.avatar).id,
        accent: themeById.get(kid.themeId)?.accent ?? "#6366f1",
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kids]);

  // While the kid is choosing / typing their PIN, quietly download the 3D world (three.js is
  // already cached from this meadow) so the park opens almost instantly afterwards.
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(() => prefetchPark());
    else window.setTimeout(prefetchPark, 1200);
  }, []);

  const goToParent = () => {
    if (hasParentPin) {
      setModal({ kind: "parent-verify" });
    } else {
      router.push("/parent");
    }
  };

  return (
    <main className="relative min-h-screen font-fun flex flex-col pointer-events-none">
      <AmbientBackdrop
        accent="#6366f1"
        characters={characters}
        onPick={(id) => {
          const kid = kids.find((k) => k.id === id);
          if (kid) tap(kid);
        }}
      />
      {/* Brand bar */}
      <header className="relative z-10 px-6 md:px-10 pt-5 pb-2 flex items-center max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✨</span>
          <span className="font-black text-xl text-indigo-900 tracking-tight" style={{ textShadow: "0 1px 12px rgba(255,255,255,0.8)" }}>Cucaino</span>
        </div>
      </header>

      <div className="relative z-10 px-6 md:px-10 max-w-4xl mx-auto w-full text-center" style={{ textShadow: "0 1px 14px rgba(255,255,255,0.9)" }}>
        {familyName ? (
          <p className="text-base md:text-lg text-indigo-700 font-semibold mt-1">
            Welcome to the <span style={{ color: "#d97706" }}>{familyName}</span> family! 🏠
          </p>
        ) : null}
        <h1 className="text-3xl md:text-5xl font-black text-indigo-900 mt-2">Knock knock... who&apos;s there? 🚪</h1>
        <p className="text-sm md:text-base font-bold text-indigo-600 mt-1">Tap your animal to jump in!</p>
      </div>

      <div className="flex-1" />

      {/* Compact name buttons: same action as tapping a critter, and a fallback if 3D can't run */}
      <div className="relative z-10 px-4 pb-4 max-w-4xl mx-auto w-full">
        <div className="flex flex-wrap justify-center gap-2 mb-3">
          {kids.map((kid) => {
            const theme = themeById.get(kid.themeId);
            if (!theme) return null;
            const p = progressById.get(kid.id);
            return (
              <button
                key={kid.id}
                type="button"
                onClick={() => tap(kid)}
                className="pointer-events-auto bg-white/90 backdrop-blur rounded-full pl-2 pr-4 py-1.5 shadow-lg flex items-center gap-2 active:scale-95 transition-transform"
                style={{ border: `2px solid ${theme.accent}` }}
              >
                <span className="text-2xl">{kid.avatar}</span>
                <span className="font-black" style={{ color: theme.accent }}>{kid.name}</span>
                <span className="text-[11px] font-bold text-yellow-800 bg-yellow-100 rounded-full px-1.5">⭐ {kid.pointsBalance}</span>
                {kid.currentStreak > 0 ? (
                  <span className="text-[11px] font-bold text-orange-800 bg-orange-100 rounded-full px-1.5">🔥 {kid.currentStreak}d</span>
                ) : null}
                {p && p.total > 0 ? (
                  <span className="text-[11px] font-bold text-gray-500">{p.done}/{p.total}{p.done >= p.total ? " ✅" : ""}</span>
                ) : null}
              </button>
            );
          })}
          <button
            type="button"
            onClick={goToParent}
            className="pointer-events-auto bg-white/90 backdrop-blur rounded-full pl-2 pr-4 py-1.5 shadow-lg flex items-center gap-2 active:scale-95 transition-transform"
            style={{ border: "2px solid #6366f1" }}
          >
            <span className="text-2xl">{parentAvatar ?? "🧙"}</span>
            <span className="font-black text-indigo-700">{parentDisplayName ?? "Parent"}</span>
            {hasParentPin ? <span className="text-[11px] font-bold text-gray-500">🔒</span> : null}
          </button>
        </div>
        <div className="flex justify-center">
          <form action={signOut} className="pointer-events-auto">
            <button
              type="submit"
              className="flex items-center gap-1.5 text-sm font-bold text-indigo-400 hover:text-indigo-600 bg-white/70 hover:bg-white px-4 py-2 rounded-xl shadow-sm transition-colors"
            >
              <span>↩</span> Sign out
            </button>
          </form>
        </div>
      </div>

      {modal ? (
        <div className="pointer-events-auto fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm">
            {modal.kind === "verify" ? (
              <PinPad
                mode="verify"
                onVerify={(pin) => verifyKidPin(modal.kid.id, pin)}
                accent={themeById.get(modal.kid.themeId)?.accent ?? "#6366f1"}
                prompt={`Enter ${modal.kid.name}'s PIN`}
                onCancel={() => setModal(null)}
                onSuccess={() => { setModal(null); router.push(`/park/${modal.kid.id}`); }}
              />
            ) : modal.kind === "parent-verify" ? (
              <PinPad
                mode="verify"
                onVerify={async (pin) => {
                  const { ok } = await verifyParentPin(pin);
                  return ok;
                }}
                accent="#4f46e5"
                prompt="Enter parent PIN"
                onCancel={() => setModal(null)}
                onSuccess={() => {
                  sessionStorage.setItem("parent-unlocked", "1");
                  router.push("/parent");
                }}
              />
            ) : (
              <div className="bg-white rounded-3xl shadow-xl p-5">
                <div className="text-center mb-2">
                  <div className="text-5xl mb-2">{modal.kid.avatar}</div>
                  <h2 className="text-xl font-black">Welcome, {modal.kid.name}!</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Pick a 4-digit PIN to keep your profile yours.
                  </p>
                </div>
                <PinPad
                  mode="set"
                  accent={themeById.get(modal.kid.themeId)?.accent ?? "#6366f1"}
                  prompt="Pick your PIN"
                  onSet={(pin) => {
                    startTransition(async () => {
                      await setKidPin(modal.kid.id, pin);
                      router.push(`/park/${modal.kid.id}`);
                    });
                  }}
                />
                {isPending ? (
                  <p className="text-center text-sm text-gray-500 mt-2">Saving…</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => router.push(`/park/${modal.kid.id}`)}
                  className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600 font-bold py-2"
                >
                  Skip for now
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
