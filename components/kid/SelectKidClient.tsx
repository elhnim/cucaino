"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import PinPad from "@/components/kid/PinPad";
import { setKidPin } from "@/lib/actions/kids";
import { signOut, verifyParentPin } from "@/lib/actions/auth";
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
  const progressById = new Map(kidProgress.map((p) => [p.kidId, p]));

  const tap = (kid: Kid) => {
    if (kid.pin) {
      setModal({ kind: "verify", kid });
    } else {
      setModal({ kind: "force-set", kid });
    }
  };

  const goToParent = () => {
    if (hasParentPin) {
      setModal({ kind: "parent-verify" });
    } else {
      router.push("/parent");
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 font-fun flex flex-col">
      {/* Brand bar */}
      <header className="px-6 md:px-10 pt-5 pb-2 flex items-center max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✨</span>
          <span className="font-black text-xl text-indigo-900 tracking-tight">Cucaino</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col px-6 md:px-10 pb-8 max-w-4xl mx-auto w-full">
        {/* Family name sub-heading */}
        {familyName ? (
          <p className="text-base md:text-lg text-indigo-700 font-semibold mt-2 mb-1">
            Welcome to the <span style={{ color: "#d97706" }}>{familyName}</span> family! 🏠
          </p>
        ) : null}

        {/* Heading */}
        <div className="mt-4 md:mt-6 mb-6 md:mb-8">
          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-black text-indigo-900">
              Knock knock... 🚪
            </h1>
            <p className="text-3xl md:text-4xl font-black text-indigo-700">
              Who&apos;s there?
            </p>
          </div>
        </div>

        {/* Kid cards grid + parent card */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-8">
          {kids.map((kid) => {
            const theme = themeById.get(kid.themeId);
            if (!theme) return null;
            return (
              <button
                key={kid.id}
                type="button"
                onClick={() => tap(kid)}
                className="group bg-white rounded-3xl p-3 md:p-4 shadow-xl hover:scale-105 active:scale-100 transition-transform relative"
                style={{ aspectRatio: "1" }}
              >
                <div className="flex flex-col items-center justify-center h-full gap-1.5">
                  <div
                    className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center text-4xl md:text-5xl group-hover:rotate-12 transition-transform"
                    style={{ background: theme.accentSoft }}
                  >
                    {kid.avatar}
                  </div>
                  <div className="text-lg md:text-xl font-black text-center" style={{ color: theme.accent }}>
                    {kid.name}
                  </div>
                  <div className="flex justify-center gap-1 text-[10px] md:text-xs">
                    <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-bold">
                      ⭐ {kid.pointsBalance}
                    </span>
                    <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-bold">
                      🔥 {kid.currentStreak}d
                    </span>
                  </div>
                  {(() => {
                    const p = progressById.get(kid.id);
                    if (!p || p.total === 0) return null;
                    const pct = Math.round((p.done / p.total) * 100);
                    return (
                      <div className="w-full px-2 space-y-0.5">
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: pct === 100 ? "#22c55e" : theme.accent }}
                          />
                        </div>
                        <div className="text-center text-[9px] text-gray-400 font-semibold">
                          {p.done}/{p.total} tasks{pct === 100 ? " ✅" : ""}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {kid.pin ? (
                  <span className="absolute top-2 right-2 bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    🔒 PIN
                  </span>
                ) : null}
              </button>
            );
          })}

          {/* Parent card */}
          <button
            type="button"
            onClick={goToParent}
            className="bg-white rounded-3xl p-3 md:p-4 shadow-xl hover:scale-105 active:scale-100 transition-transform relative"
            style={{ aspectRatio: "1" }}
          >
            {hasParentPin ? (
              <span className="absolute top-2 right-2 bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                🔒 PIN
              </span>
            ) : null}
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <div
                className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center text-4xl md:text-5xl"
                style={{ background: "#eef2ff", border: "2px solid #6366f1" }}
              >
                {parentAvatar ?? "🧙"}
              </div>
              <div className="text-lg md:text-xl font-black text-center text-indigo-700">
                {parentDisplayName ?? "Parent"}
              </div>
              <div
                className="text-[10px] md:text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: "#eef2ff", color: "#6366f1" }}
              >
                PARENT
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <form action={signOut}>
          <button
            type="submit"
            className="text-xs font-bold text-gray-400 hover:text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>

      {modal ? (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 py-8 z-50">
          <div className="w-full max-w-sm">
            {modal.kind === "verify" ? (
              <PinPad
                mode="verify"
                expected={modal.kid.pin ?? ""}
                accent={themeById.get(modal.kid.themeId)?.accent ?? "#6366f1"}
                prompt={`Enter ${modal.kid.name}'s PIN`}
                onCancel={() => setModal(null)}
                onSuccess={() => { setModal(null); router.push(`/kid/${modal.kid.id}/home`); }}
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
                      router.push(`/kid/${modal.kid.id}/home`);
                    });
                  }}
                />
                {isPending ? (
                  <p className="text-center text-sm text-gray-500 mt-2">Saving…</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => router.push(`/kid/${modal.kid.id}/home`)}
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
