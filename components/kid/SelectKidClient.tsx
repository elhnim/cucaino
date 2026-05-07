"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import PinPad from "@/components/kid/PinPad";
import { setKidPin } from "@/lib/actions/kids";
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
  parentPin,
}: {
  kids: Kid[];
  themes: Theme[];
  parentPin: string | null;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const [isPending, startTransition] = useTransition();

  const themeById = new Map(themes.map((t) => [t.id, t]));

  const tap = (kid: Kid) => {
    if (kid.pin) {
      setModal({ kind: "verify", kid });
    } else {
      router.push(`/kid/${kid.id}/today`);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 font-fun flex flex-col">
      {/* Brand bar */}
      <header className="px-6 md:px-10 pt-5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✨</span>
          <span className="font-black text-xl text-indigo-900 tracking-tight">Cucaino</span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (parentPin) {
              setModal({ kind: "parent-verify" });
            } else {
              router.push("/parent");
            }
          }}
          className="bg-white/80 hover:bg-white text-indigo-700 text-sm font-bold px-4 py-2 rounded-full shadow flex items-center gap-1.5"
        >
          🔒 Parent area
        </button>
      </header>

      <div className="flex-1 flex flex-col px-6 md:px-10 pb-8">
        {/* Greeting */}
        <div className="text-center mt-4 md:mt-8 mb-6 md:mb-10">
          <h1 className="text-3xl md:text-5xl font-black text-indigo-900">
            Who&apos;s playing today? <span aria-hidden>👋</span>
          </h1>
          <p className="text-base md:text-lg text-indigo-700 mt-2">
            Tap your face to start your day
          </p>
        </div>

        {/* Kid cards */}
        <div className="flex flex-wrap justify-center gap-4 md:gap-8 mb-8 md:mb-10">
          {kids.map((kid) => {
            const theme = themeById.get(kid.themeId);
            if (!theme) return null;
            return (
              <button
                key={kid.id}
                type="button"
                onClick={() => tap(kid)}
                className="group bg-white rounded-3xl p-5 md:p-7 w-48 md:w-60 shadow-xl hover:scale-105 active:scale-100 transition-transform relative"
              >
                <div
                  className="w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center text-5xl md:text-6xl mx-auto mb-3 group-hover:rotate-12 transition-transform"
                  style={{ background: theme.accentSoft }}
                >
                  {kid.avatar}
                </div>
                <div className="text-2xl md:text-3xl font-black text-center" style={{ color: theme.accent }}>
                  {kid.name}
                </div>
                <div className="flex justify-center gap-1.5 mt-2 text-xs md:text-sm">
                  <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-bold">
                    ⭐ {kid.pointsBalance}
                  </span>
                  <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-bold">
                    🔥 {kid.currentStreak}d
                  </span>
                </div>
                <p className="text-center text-[11px] text-gray-500 mt-2">
                  {theme.decoration} {theme.name}
                </p>
                {kid.pin ? (
                  <span className="absolute top-3 right-3 bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    🔒 PIN
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Or — */}
        <div className="flex items-center gap-3 mb-5 md:mb-6 max-w-2xl w-full mx-auto">
          <div className="flex-1 h-0.5 bg-indigo-200" />
          <span className="text-xs md:text-sm font-bold text-indigo-500 uppercase tracking-widest">
            or play together
          </span>
          <div className="flex-1 h-0.5 bg-indigo-200" />
        </div>

        {/* Play together hero */}
        <Link
          href="/play"
          className="block max-w-2xl w-full mx-auto rounded-3xl shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all p-5 md:p-7 bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-500 text-white relative overflow-hidden"
        >
          <span className="absolute -top-6 -right-6 text-9xl opacity-20 select-none">🎮</span>
          <div className="relative z-10 flex items-center gap-4">
            <div className="text-5xl md:text-6xl shrink-0">🎮</div>
            <div className="flex-1">
              <div className="text-2xl md:text-3xl font-black">Play together</div>
              <div className="text-sm md:text-base opacity-90">
                Quiz battles, take-turns games — sibling vs sibling on this tablet
              </div>
            </div>
            <div className="text-3xl shrink-0">→</div>
          </div>
        </Link>
      </div>

      {modal ? (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm">
            {modal.kind === "verify" ? (
              <PinPad
                mode="verify"
                expected={modal.kid.pin ?? ""}
                accent={themeById.get(modal.kid.themeId)?.accent ?? "#6366f1"}
                prompt={`Enter ${modal.kid.name}'s PIN`}
                onCancel={() => setModal(null)}
                onSuccess={() => router.push(`/kid/${modal.kid.id}/today`)}
              />
            ) : modal.kind === "parent-verify" ? (
              <PinPad
                mode="verify"
                expected={parentPin ?? ""}
                accent="#4f46e5"
                prompt="Enter parent PIN"
                onCancel={() => setModal(null)}
                onSuccess={() => router.push("/parent")}
              />
            ) : (
              // force-set: kid has no PIN, prompt them to create one
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
                      router.push(`/kid/${modal.kid.id}/today`);
                    });
                  }}
                />
                {isPending ? (
                  <p className="text-center text-sm text-gray-500 mt-2">Saving…</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

