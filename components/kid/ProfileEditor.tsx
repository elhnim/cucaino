"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PinPad from "@/components/kid/PinPad";
import { updateKidProfile, setKidPin, clearKidPin } from "@/lib/actions/kids";
import { ageOn, daysUntilNextBirthday, isBirthdayToday } from "@/lib/domain/birthday";
import type { Kid } from "@/lib/domain/types";
import type { Theme } from "@/lib/themes/presets";

const LEVELS = [
  { min: 0,    max: 99,       emoji: "🌱", name: "Seedling",  avatarSet: ["🦊","🐸","🐱","🐶","🐻","🐼"],   frame: "none"      },
  { min: 100,  max: 299,      emoji: "🗺️", name: "Explorer",  avatarSet: ["🧭","🏕️","🌋","🦅"],             frame: "blue_glow" },
  { min: 300,  max: 599,      emoji: "🏅", name: "Champion",  avatarSet: ["⚽","🏀","🎾","🏊"],             frame: "gold"      },
  { min: 600,  max: 999,      emoji: "🌟", name: "Legend",    avatarSet: ["🐉","🦄","🔮","🧙"],             frame: "fire"      },
  { min: 1000, max: Infinity, emoji: "🚀", name: "Superstar", avatarSet: ["🚀","🌙","⭐","🪐"],             frame: "rainbow"   },
];

type FrameId = "none" | "blue_glow" | "gold" | "fire" | "rainbow";

const FRAMES: { id: FrameId; label: string; style: React.CSSProperties; rainbow?: boolean }[] = [
  { id: "none",      label: "None",      style: { border: "3px solid #e5e7eb" } },
  { id: "blue_glow", label: "Blue Glow", style: { boxShadow: "0 0 0 3px #3b82f6, 0 0 12px #3b82f6" } },
  { id: "gold",      label: "Gold",      style: { boxShadow: "0 0 0 3px #d97706", border: "3px solid #d97706" } },
  { id: "fire",      label: "Fire",      style: { boxShadow: "0 0 0 3px #ef4444, 0 0 12px #ef4444" } },
  { id: "rainbow",   label: "Rainbow",   style: {}, rainbow: true },
];

type PinState =
  | { kind: "idle" }
  | { kind: "setting" }
  | { kind: "verifying-to-change" }
  | { kind: "verifying-to-clear" };

function getCurrentLevel(stars: number) {
  return LEVELS.findLast((l) => stars >= l.min) ?? LEVELS[0];
}

function getUnlockedLevels(stars: number) {
  return LEVELS.filter((l) => stars >= l.min);
}

export default function ProfileEditor({
  kid: serverKid,
  accent,
  themes,
  totalStarsEarned,
}: {
  kid: Kid;
  accent: string;
  themes: Theme[];
  totalStarsEarned: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(serverKid.name);
  const [avatar, setAvatar] = useState(serverKid.avatar);
  const [themeId, setThemeId] = useState(serverKid.themeId);
  const [dob, setDob] = useState<string>(serverKid.dateOfBirth ?? "");
  const [selectedFrame, setSelectedFrame] = useState<FrameId>(
    (serverKid.selectedFrame as FrameId) ?? "none"
  );
  const [pinState, setPinState] = useState<PinState>({ kind: "idle" });
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty =
    name !== serverKid.name ||
    avatar !== serverKid.avatar ||
    themeId !== serverKid.themeId ||
    (dob || null) !== (serverKid.dateOfBirth || null) ||
    selectedFrame !== ((serverKid.selectedFrame as FrameId) ?? "none");

  const save = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await updateKidProfile(serverKid.id, {
        name: name.trim(),
        avatar,
        themeId,
        dateOfBirth: dob || null,
      });
      // TODO: persist selectedFrame once updateKidProfile supports it
      if (result.ok) {
        setSaveMsg("Saved!");
        router.refresh();
        setTimeout(() => setSaveMsg(null), 3000);
      } else {
        setSaveMsg(`Error: ${result.error}`);
      }
    });
  };

  const age = useMemo(() => ageOn(dob || null), [dob]);
  const daysToBday = useMemo(() => daysUntilNextBirthday(dob || null), [dob]);
  const bdayToday = useMemo(() => isBirthdayToday(dob || null), [dob]);

  const hasPin = !!serverKid.pin;

  const currentLevel = getCurrentLevel(totalStarsEarned);
  const unlockedLevels = getUnlockedLevels(totalStarsEarned);
  const currentLevelIndex = LEVELS.indexOf(currentLevel);
  const isMaxLevel = currentLevel.name === "Superstar";
  const nextLevel = isMaxLevel ? null : LEVELS[currentLevelIndex + 1];
  const progressPct = isMaxLevel
    ? 100
    : Math.round(
        ((totalStarsEarned - currentLevel.min) / (nextLevel!.min - currentLevel.min)) * 100
      );

  const unlockedFrameIds = new Set(unlockedLevels.map((l) => l.frame as FrameId));

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-6">
      <style>{`
        @keyframes spin-hue {
          from { filter: hue-rotate(0deg); }
          to   { filter: hue-rotate(360deg); }
        }
        .rainbow-frame-ring {
          background: conic-gradient(red, orange, yellow, green, blue, violet, red);
          animation: spin-hue 2s linear infinite;
        }
      `}</style>

      <header className="flex items-baseline justify-between">
        <h2 className="text-2xl md:text-3xl font-black">⚙️ Profile</h2>
        {saveMsg ? (
          <span
            className={`text-xs font-bold px-2 py-1 rounded-full ${
              saveMsg.startsWith("Error")
                ? "bg-red-100 text-red-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {saveMsg}
          </span>
        ) : null}
      </header>

      {/* Level & Unlocks */}
      <Card title="Level & Unlocks" icon={currentLevel.emoji}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-4xl">{currentLevel.emoji}</span>
          <div>
            <div className="text-xl font-black">{currentLevel.name}</div>
            <div className="text-sm text-gray-500">⭐ {totalStarsEarned} total earned</div>
          </div>
        </div>
        {isMaxLevel ? (
          <div className="text-sm font-bold text-amber-600 mb-2">Maximum level!</div>
        ) : (
          <div className="mb-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{totalStarsEarned} stars</span>
              <span>{nextLevel!.min} to {nextLevel!.emoji} {nextLevel!.name}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-3 rounded-full transition-all"
                style={{ width: `${progressPct}%`, background: accent }}
              />
            </div>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1">Higher levels unlock new avatar sets and frames</p>
      </Card>

      {/* Name */}
      <Card title="Name" icon="📝">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-current text-lg"
          style={{ caretColor: accent }}
          maxLength={20}
        />
      </Card>

      {/* Avatar */}
      <Card title="Avatar" icon="🎭">
        <div className="space-y-4">
          {LEVELS.map((level) => {
            const unlocked = totalStarsEarned >= level.min;
            const setLabel =
              level.name === "Seedling"
                ? `${level.emoji} Starter`
                : `${level.emoji} ${level.name}${unlocked ? " unlocked!" : ""}`;
            return (
              <div key={level.name}>
                <div
                  className={`text-xs font-bold mb-1 flex items-center gap-1 ${
                    unlocked ? "text-gray-600" : "text-gray-400"
                  }`}
                >
                  {!unlocked && "🔒 "}
                  {setLabel}
                </div>
                <div className="flex flex-wrap gap-2">
                  {level.avatarSet.map((emoji) => {
                    const active = avatar === emoji && unlocked;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => { if (unlocked) setAvatar(emoji); }}
                        disabled={!unlocked}
                        className={`text-3xl rounded-xl py-2 px-2 transition-transform ${
                          unlocked ? "hover:scale-110" : "opacity-30 cursor-not-allowed"
                        } ${
                          active
                            ? "ring-2 ring-offset-2"
                            : unlocked
                            ? "bg-gray-100 hover:bg-gray-200"
                            : "bg-gray-100"
                        }`}
                        style={{
                          background: active ? `${accent}20` : undefined,
                          ...(active ? ({ "--tw-ring-color": accent } as React.CSSProperties) : {}),
                        }}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Avatar Frame */}
      <Card title="Avatar Frame" icon="🖼️">
        <div className="flex flex-wrap gap-4">
          {FRAMES.map((frame) => {
            const unlocked = unlockedFrameIds.has(frame.id);
            const active = selectedFrame === frame.id;
            return (
              <div key={frame.id} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => { if (unlocked) setSelectedFrame(frame.id); }}
                  disabled={!unlocked}
                  className={`relative rounded-full transition-transform ${
                    unlocked ? "hover:scale-110 cursor-pointer" : "opacity-40 cursor-not-allowed"
                  } ${active ? "ring-4 ring-offset-2" : ""}`}
                  style={{
                    width: 60,
                    height: 60,
                    ...(active ? ({ "--tw-ring-color": accent } as React.CSSProperties) : {}),
                  }}
                >
                  {frame.rainbow ? (
                    <div className="w-full h-full rounded-full flex items-center justify-center rainbow-frame-ring">
                      <div className="w-[50px] h-[50px] rounded-full bg-white flex items-center justify-center text-2xl">
                        {avatar}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center text-2xl"
                      style={frame.style}
                    >
                      {avatar}
                    </div>
                  )}
                  {!unlocked && (
                    <span className="absolute -top-1 -right-1 text-xs">🔒</span>
                  )}
                </button>
                <span className="text-xs text-gray-500 text-center">{frame.label}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Theme */}
      <Card title="Theme" icon="🎨">
        <p className="text-xs text-gray-500 mb-2">
          Themes change the colours and vibe of your view.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {themes.map((t) => {
            const active = themeId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setThemeId(t.id)}
                className={`rounded-xl p-3 border-2 text-left ${
                  active ? "" : "border-gray-200 hover:border-gray-300"
                }`}
                style={active ? { borderColor: t.accent } : undefined}
              >
                <div className={`h-8 rounded-lg bg-gradient-to-r ${t.headerGradient} mb-2`} />
                <div className="font-bold text-sm flex items-center gap-1">
                  {t.decoration} {t.name}
                </div>
                <div className="text-xs text-gray-500">{t.description}</div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Date of birth */}
      <Card title="Birthday" icon="🎂">
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-current"
        />
        {dob ? (
          <div className="mt-2 text-sm text-gray-600 space-y-1">
            <div>
              {bdayToday ? (
                <span className="font-bold text-pink-700">🎉 It&apos;s today! Happy Birthday {name}!</span>
              ) : age !== null ? (
                <>
                  Age: <strong>{age}</strong>
                  {daysToBday !== null ? ` · Next birthday in ${daysToBday} day${daysToBday === 1 ? "" : "s"}` : ""}
                </>
              ) : null}
            </div>
            <div className="text-xs text-gray-500">
              On your birthday you&apos;ll see a special banner and earn a Birthday badge.
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-500">Add a date to unlock birthday celebrations.</p>
        )}
      </Card>

      {/* PIN */}
      <Card title="PIN" icon="🔒">
        <p className="text-xs text-gray-500 mb-2">
          {hasPin
            ? "You have a PIN set. Anyone switching to your profile must enter it."
            : "Pick a 4-digit PIN to keep your profile private."}
        </p>
        {!hasPin ? (
          <button
            type="button"
            onClick={() => setPinState({ kind: "setting" })}
            className="w-full text-white font-bold py-2.5 rounded-xl"
            style={{ background: accent }}
          >
            Set a PIN
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPinState({ kind: "verifying-to-change" })}
              className="text-white font-bold py-2.5 rounded-xl"
              style={{ background: accent }}
            >
              Change PIN
            </button>
            <button
              type="button"
              onClick={() => setPinState({ kind: "verifying-to-clear" })}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl"
            >
              Remove PIN
            </button>
          </div>
        )}
      </Card>

      {/* Save bar */}
      <div className="sticky bottom-2 bg-white rounded-2xl shadow-lg p-3 flex gap-2 z-10">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || isPending}
          className="flex-1 text-white font-black py-2.5 rounded-xl disabled:opacity-50"
          style={{ background: accent }}
        >
          {isPending ? "Saving…" : dirty ? "Save changes" : "No changes"}
        </button>
        <Link
          href={`/kid/${serverKid.id}/home`}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-4 py-2.5 rounded-xl text-sm"
        >
          Done
        </Link>
      </div>

      {/* PIN modal */}
      {pinState.kind !== "idle" ? (
        <PinModal
          accent={accent}
          state={pinState}
          currentPin={serverKid.pin}
          kidId={serverKid.id}
          onClose={() => setPinState({ kind: "idle" })}
          onDone={() => {
            setPinState({ kind: "idle" });
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow p-4">
      <h3 className="text-sm font-bold text-gray-500 mb-3 flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        {title.toUpperCase()}
      </h3>
      {children}
    </section>
  );
}

function PinModal({
  accent,
  state,
  currentPin,
  kidId,
  onClose,
  onDone,
}: {
  accent: string;
  state: PinState;
  currentPin: string | null;
  kidId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<"verify" | "set">(
    state.kind === "setting" ? "set" : "verify",
  );
  const [isPending, startTransition] = useTransition();

  const handleSet = (pin: string) => {
    startTransition(async () => {
      await setKidPin(kidId, pin);
      onDone();
    });
  };

  const handleClear = () => {
    startTransition(async () => {
      await clearKidPin(kidId);
      onDone();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-sm">
        {isPending ? (
          <div className="bg-white rounded-3xl p-8 text-center font-bold text-gray-600">Saving…</div>
        ) : stage === "verify" ? (
          <PinPad
            mode="verify"
            expected={currentPin ?? ""}
            accent={accent}
            prompt="Enter your current PIN"
            onCancel={onClose}
            onSuccess={() => {
              if (state.kind === "verifying-to-clear") {
                handleClear();
              } else {
                setStage("set");
              }
            }}
          />
        ) : (
          <PinPad
            mode="set"
            accent={accent}
            onCancel={onClose}
            onSet={handleSet}
          />
        )}
      </div>
    </div>
  );
}
