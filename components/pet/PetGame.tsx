"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  PET_ACCESSORIES,
  PET_FOODS,
  PET_SPECIES,
  PLAY_COST,
  PLAY_MIN_ENERGY,
  WASH_COST,
} from "@/lib/pet/config";
import {
  applyDecay,
  getSpecies,
  levelFromXp,
  moodFor,
  petEmoji,
  stageFromLevel,
  xpForLevel,
  type Pet,
} from "@/lib/pet/logic";
import {
  adoptPet,
  buyAccessory,
  cuddlePet,
  feedPet,
  playWithPet,
  toggleSleep,
  washPet,
  type PetActionResult,
} from "@/lib/actions/pet";

const CUDDLE_COOLDOWN_MS = 30_000;

// Accessory emojis float at fixed spots around the pet
const ACCESSORY_SPOTS: { top: string; left: string }[] = [
  { top: "8%", left: "18%" },
  { top: "4%", left: "70%" },
  { top: "55%", left: "8%" },
  { top: "60%", left: "82%" },
  { top: "28%", left: "88%" },
  { top: "30%", left: "4%" },
];

function StatBar({ emoji, label, value, accent }: { emoji: string; label: string; value: number; accent: string }) {
  const color = value > 60 ? "#22c55e" : value > 30 ? "#f59e0b" : "#ef4444";
  return (
    <div className="bg-white rounded-2xl px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-black text-gray-700">{emoji} {label}</span>
        <span className="text-[10px] font-bold" style={{ color }}>{Math.round(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, background: value > 60 ? accent : color }}
        />
      </div>
    </div>
  );
}

function AdoptScreen({
  kidId,
  accent,
  onAdopted,
}: {
  kidId: string;
  accent: string;
  onAdopted: (pet: Pet, stars: number) => void;
}) {
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const adopt = () => {
    if (!speciesId) { setError("Pick a pet first!"); return; }
    setError(null);
    startTransition(async () => {
      const res = await adoptPet(kidId, speciesId, name);
      if (res.ok) onAdopted(res.pet, res.pointsBalance);
      else setError(res.error);
    });
  };

  return (
    <div className="max-w-md mx-auto p-4 pt-6 text-center">
      <div className="text-5xl mb-2">🐾</div>
      <h1 className="text-2xl font-black text-gray-900 mb-1">Adopt a Star Pet!</h1>
      <p className="text-sm text-gray-500 mb-5">
        Your very own buddy. Feed it, play with it and watch it grow — care costs ⭐ stars you earn from tasks!
      </p>

      <div className="grid grid-cols-3 gap-2.5 mb-5">
        {PET_SPECIES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSpeciesId(s.id)}
            className={`bg-white rounded-2xl p-3 flex flex-col items-center gap-1 shadow-sm active:scale-95 transition-transform border-2 ${speciesId === s.id ? "" : "border-transparent"}`}
            style={speciesId === s.id ? { borderColor: accent } : undefined}
          >
            <span className={`text-4xl ${speciesId === s.id ? "avatar-bounce" : "avatar-idle"} inline-block`}>{s.babyEmoji}</span>
            <span className="text-xs font-black text-gray-800">{s.name}</span>
            <span className="text-[9px] text-gray-400 font-semibold leading-tight">{s.personality}</span>
          </button>
        ))}
      </div>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
        placeholder="Give your pet a name…"
        className="w-full bg-white rounded-2xl px-4 py-3.5 text-center font-black text-lg text-gray-900 shadow-sm outline-none mb-3 placeholder:text-gray-300 placeholder:font-bold"
      />

      {error && <p className="text-sm font-bold text-red-500 mb-3">{error}</p>}

      <button
        type="button"
        onClick={adopt}
        disabled={isPending}
        className="w-full py-4 rounded-2xl font-black text-base text-white active:scale-95 transition-transform disabled:opacity-50"
        style={{ background: accent }}
      >
        {isPending ? "Adopting…" : "Adopt my pet! 🎉"}
      </button>
    </div>
  );
}

export default function PetGame({
  kid,
  initialPet,
  accent,
}: {
  kid: { id: string; name: string; pointsBalance: number } | null;
  initialPet: Pet | null;
  accent: string;
}) {
  const [pet, setPet] = useState<Pet | null>(initialPet);
  const [stars, setStars] = useState(kid?.pointsBalance ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"food" | "shop" | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; evolved: boolean } | null>(null);
  const [hearts, setHearts] = useState<{ id: number; left: number }[]>([]);
  const [petBouncing, setPetBouncing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const lastCuddleAt = useRef(0);
  const heartId = useRef(0);

  // Live decay so stats visibly tick down while the page is open
  useEffect(() => {
    const id = setInterval(() => setPet((p) => (p ? applyDecay(p) : p)), 60_000);
    return () => clearInterval(id);
  }, []);

  // Errors auto-clear
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const runAction = useCallback(
    (fn: () => Promise<PetActionResult>) => {
      setError(null);
      startTransition(async () => {
        const res = await fn();
        if (!res.ok) {
          if (res.error !== "sleeping") setError(res.error);
          return;
        }
        setPet((prev) => {
          if (prev) {
            const prevLevel = levelFromXp(prev.xp);
            const newLevel = levelFromXp(res.pet.xp);
            if (newLevel > prevLevel) {
              setLevelUp({
                level: newLevel,
                evolved: stageFromLevel(newLevel) !== stageFromLevel(prevLevel),
              });
            }
            const spent = Math.max(0, stars - res.pointsBalance);
            if (spent > 0) {
              window.dispatchEvent(new CustomEvent("stars-spent", { detail: { amount: spent } }));
            }
          }
          return res.pet;
        });
        setStars(res.pointsBalance);
        setModal(null);
      });
    },
    [stars],
  );

  const cuddle = useCallback(() => {
    if (!kid || !pet || pet.isSleeping) return;
    setPetBouncing(true);
    const left = 30 + Math.random() * 40;
    const id = ++heartId.current;
    setHearts((h) => [...h, { id, left }]);
    setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 1200);
    // Server cuddle is throttled — taps in between are just for fun
    const now = Date.now();
    if (now - lastCuddleAt.current > CUDDLE_COOLDOWN_MS) {
      lastCuddleAt.current = now;
      runAction(() => cuddlePet(kid.id));
    }
  }, [kid, pet, runAction]);

  if (!kid) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <div className="text-5xl mb-3">🐾</div>
        <p className="font-bold text-gray-600 mb-4">Pick your profile first to meet your Star Pet!</p>
        <Link href="/select-kid" className="inline-block px-6 py-3 rounded-2xl font-black text-white" style={{ background: accent }}>
          Choose profile
        </Link>
      </div>
    );
  }

  if (!pet) {
    return (
      <AdoptScreen
        kidId={kid.id}
        accent={accent}
        onAdopted={(p, s) => { setPet(p); setStars(s); }}
      />
    );
  }

  const species = getSpecies(pet.species);
  const level = levelFromXp(pet.xp);
  const stage = stageFromLevel(level);
  const mood = moodFor(pet);
  const xpIntoLevel = pet.xp - xpForLevel(level);
  const xpNeeded = xpForLevel(level + 1) - xpForLevel(level);
  const xpPct = Math.min(100, Math.round((xpIntoLevel / Math.max(1, xpNeeded)) * 100));
  const dirty = pet.cleanliness < 40;
  const notEnough = error === "not_enough_stars";

  return (
    <div className="max-w-md mx-auto p-4 pb-8">
      {/* Name + level + stars */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-black text-gray-900 leading-tight">
            {pet.name}
            <span className="ml-2 text-[10px] font-black text-white px-2 py-0.5 rounded-full align-middle uppercase tracking-wide" style={{ background: accent }}>
              {stage} · Lv {level}
            </span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 w-28 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${xpPct}%`, background: accent }} />
            </div>
            <span className="text-[9px] font-bold text-gray-400">{xpIntoLevel}/{xpNeeded} XP</span>
          </div>
        </div>
        <div className="text-right">
          <div className="inline-flex items-center gap-1 bg-yellow-50 border-2 border-yellow-300 rounded-full px-3 py-1 text-sm font-black text-yellow-800">
            ⭐ {stars.toLocaleString()}
          </div>
          <Link href={`/kid/${kid.id}/todo`} className="block text-[10px] font-bold mt-1 underline" style={{ color: accent }}>
            Earn more →
          </Link>
        </div>
      </div>

      {/* Error / nudge toast */}
      {error && (
        <div className="bg-white border-2 border-red-200 rounded-2xl px-4 py-2.5 mb-3 text-center animate-pop">
          {notEnough ? (
            <p className="text-sm font-bold text-gray-700">
              Not enough stars!{" "}
              <Link href={`/kid/${kid.id}/todo`} className="underline" style={{ color: accent }}>
                Do your tasks to earn more ⭐
              </Link>
            </p>
          ) : (
            <p className="text-sm font-bold text-red-500">{error}</p>
          )}
        </div>
      )}

      {/* Pet scene */}
      <button
        type="button"
        onClick={cuddle}
        className="relative w-full rounded-3xl overflow-hidden mb-3 cursor-pointer block"
        style={{
          height: 260,
          background: pet.isSleeping
            ? "linear-gradient(180deg, #1e1b4b 0%, #312e81 70%, #4338ca 100%)"
            : "linear-gradient(180deg, #bae6fd 0%, #e0f2fe 55%, #bbf7d0 75%, #86efac 100%)",
        }}
      >
        {/* sun / moon */}
        <span className="absolute top-4 right-5 text-3xl">{pet.isSleeping ? "🌙" : "☀️"}</span>

        {/* owned accessories scattered in the scene */}
        {pet.accessories.map((accId, i) => {
          const acc = PET_ACCESSORIES.find((a) => a.id === accId);
          const spot = ACCESSORY_SPOTS[i % ACCESSORY_SPOTS.length];
          if (!acc) return null;
          return (
            <span key={accId} className="absolute text-2xl avatar-idle" style={{ top: spot.top, left: spot.left }}>
              {acc.emoji}
            </span>
          );
        })}

        {/* mess when dirty */}
        {dirty && !pet.isSleeping && (
          <>
            <span className="absolute bottom-4 left-6 text-2xl">💩</span>
            <span className="absolute bottom-8 right-8 text-xl">🫧</span>
          </>
        )}

        {/* the pet */}
        <span
          onAnimationEnd={() => setPetBouncing(false)}
          className={`absolute left-1/2 -translate-x-1/2 bottom-10 text-8xl inline-block select-none ${petBouncing ? "avatar-bounce" : "avatar-idle"} ${pet.isSleeping ? "grayscale-[30%]" : ""}`}
        >
          {petEmoji(pet)}
        </span>

        {/* sleeping z's */}
        {pet.isSleeping && (
          <>
            <span className="absolute left-[58%] bottom-32 text-2xl sleep-drift">💤</span>
            <span className="absolute left-[64%] bottom-36 text-lg sleep-drift" style={{ animationDelay: "1.2s" }}>💤</span>
          </>
        )}

        {/* floating hearts on cuddle */}
        {hearts.map((h) => (
          <span key={h.id} className="heart-float text-2xl" style={{ left: `${h.left}%`, bottom: 130 }}>
            💖
          </span>
        ))}

        {/* mood bubble */}
        <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-[90%] rounded-2xl px-3 py-1.5 text-center ${pet.isSleeping ? "bg-white/20 text-white" : "bg-white/80 text-gray-700"}`}>
          <span className="text-xs font-bold">{mood.emoji} {mood.message}</span>
        </div>
      </button>

      {/* Stat bars */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatBar emoji="🍎" label="Food" value={pet.hunger} accent={accent} />
        <StatBar emoji="😊" label="Happy" value={pet.happiness} accent={accent} />
        <StatBar emoji="⚡" label="Energy" value={pet.energy} accent={accent} />
        <StatBar emoji="🛁" label="Clean" value={pet.cleanliness} accent={accent} />
      </div>

      {/* Actions */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <button
          type="button"
          onClick={() => setModal("food")}
          disabled={isPending || pet.isSleeping}
          className="bg-white rounded-2xl py-3 flex flex-col items-center gap-0.5 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
        >
          <span className="text-2xl">🍎</span>
          <span className="text-[10px] font-black text-gray-700">Feed</span>
          <span className="text-[9px] font-bold text-yellow-600">1–3 ⭐</span>
        </button>
        <button
          type="button"
          onClick={() => runAction(() => playWithPet(kid.id))}
          disabled={isPending || pet.isSleeping || pet.energy < PLAY_MIN_ENERGY}
          className="bg-white rounded-2xl py-3 flex flex-col items-center gap-0.5 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
        >
          <span className="text-2xl">🎾</span>
          <span className="text-[10px] font-black text-gray-700">Play</span>
          <span className="text-[9px] font-bold text-yellow-600">{PLAY_COST} ⭐</span>
        </button>
        <button
          type="button"
          onClick={() => runAction(() => washPet(kid.id))}
          disabled={isPending || pet.isSleeping}
          className="bg-white rounded-2xl py-3 flex flex-col items-center gap-0.5 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
        >
          <span className="text-2xl">🛁</span>
          <span className="text-[10px] font-black text-gray-700">Wash</span>
          <span className="text-[9px] font-bold text-yellow-600">{WASH_COST} ⭐</span>
        </button>
        <button
          type="button"
          onClick={() => runAction(() => toggleSleep(kid.id))}
          disabled={isPending}
          className="bg-white rounded-2xl py-3 flex flex-col items-center gap-0.5 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
        >
          <span className="text-2xl">{pet.isSleeping ? "⏰" : "😴"}</span>
          <span className="text-[10px] font-black text-gray-700">{pet.isSleeping ? "Wake" : "Sleep"}</span>
          <span className="text-[9px] font-bold text-green-600">Free</span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => setModal("shop")}
        className="w-full bg-white rounded-2xl py-3 font-black text-sm text-gray-800 shadow-sm active:scale-95 transition-transform mb-2"
      >
        🛍️ Pet shop · toys & style
      </button>

      <p className="text-center text-[10px] font-semibold text-gray-400">
        Tap {pet.name} for a free cuddle 💖 · Stats change in real time, even while you&apos;re away
      </p>

      {/* Food picker */}
      {modal === "food" && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setModal(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-gray-900 text-center mb-3">What should {pet.name} eat?</h2>
            <div className="space-y-2">
              {PET_FOODS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => runAction(() => feedPet(kid.id, f.id))}
                  className="w-full bg-gray-50 rounded-2xl p-3 flex items-center gap-3 active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  <span className="text-3xl">{f.emoji}</span>
                  <span className="flex-1 text-left">
                    <span className="block font-black text-sm text-gray-800">{f.label}</span>
                    <span className="block text-[10px] font-bold text-gray-400">
                      +{f.hunger} food{f.happiness > 0 ? ` · +${f.happiness} happy` : ""}
                    </span>
                  </span>
                  <span className="text-sm font-black text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1">
                    {f.starCost} ⭐
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Accessory shop */}
      {modal === "shop" && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setModal(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-gray-900 text-center mb-1">🛍️ Pet shop</h2>
            <p className="text-center text-[10px] font-bold text-gray-400 mb-3">Toys live in {pet.name}&apos;s room forever!</p>
            <div className="grid grid-cols-3 gap-2">
              {PET_ACCESSORIES.map((a) => {
                const owned = pet.accessories.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={isPending || owned}
                    onClick={() => runAction(() => buyAccessory(kid.id, a.id))}
                    className={`rounded-2xl p-3 flex flex-col items-center gap-1 active:scale-95 transition-transform ${owned ? "bg-green-50 border-2 border-green-200" : "bg-gray-50"}`}
                  >
                    <span className="text-3xl">{a.emoji}</span>
                    <span className="text-[10px] font-black text-gray-700">{a.label}</span>
                    {owned ? (
                      <span className="text-[9px] font-black text-green-600">Owned ✓</span>
                    ) : (
                      <span className="text-[10px] font-black text-yellow-700">{a.starCost} ⭐</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Level-up celebration */}
      {levelUp && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-7 text-center"
          style={{ background: "rgba(17, 24, 39, 0.85)" }}
          onClick={() => setLevelUp(null)}
        >
          <span className="text-8xl avatar-party inline-block mb-4">{petEmoji(pet)}</span>
          <h2 className="text-3xl font-black text-white mb-1 animate-pop">
            {levelUp.evolved ? `${pet.name} evolved!` : "Level up!"} 🎉
          </h2>
          <p className="text-sm font-bold text-white/70 mb-6">
            {levelUp.evolved
              ? `Your buddy grew into a ${stageFromLevel(levelUp.level)} ${species.name.toLowerCase()}!`
              : `${pet.name} reached level ${levelUp.level}. Keep caring!`}
          </p>
          <button
            type="button"
            className="px-8 py-3.5 rounded-2xl font-black text-base text-gray-900 bg-white active:scale-95 transition-transform"
            onClick={() => setLevelUp(null)}
          >
            Awesome! →
          </button>
        </div>
      )}
    </div>
  );
}
