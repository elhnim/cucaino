"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import FetchGame from "@/components/pet/FetchGame";
import {
  PET_ACCESSORIES,
  PET_FOODS,
  PET_SPECIES,
  PET_TRICKS,
  PLAY_COST,
  PLAY_MIN_ENERGY,
  TRICK_HAPPINESS,
  WASH_COST,
} from "@/lib/pet/config";
import {
  applyDecay,
  getSpecies,
  levelFromXp,
  moodFor,
  petEmoji,
  playReward,
  stageFromLevel,
  xpForLevel,
  type Pet,
} from "@/lib/pet/logic";
import {
  adoptPet,
  buyAccessory,
  claimDailyGift,
  cuddlePet,
  feedPet,
  learnTrick,
  performTrick,
  playWithPet,
  toggleSleep,
  washPet,
  type GiftReward,
  type PetActionResult,
} from "@/lib/actions/pet";

const CUDDLE_COOLDOWN_MS = 30_000;

// Accessory emojis settle at fixed spots so the room fills up over time
const ACCESSORY_SPOTS: { top: string; left: string }[] = [
  { top: "62%", left: "8%" },
  { top: "66%", left: "84%" },
  { top: "50%", left: "16%" },
  { top: "54%", left: "76%" },
  { top: "38%", left: "6%" },
  { top: "40%", left: "88%" },
  { top: "24%", left: "12%" },
  { top: "26%", left: "80%" },
  { top: "12%", left: "26%" },
  { top: "10%", left: "62%" },
  { top: "70%", left: "44%" },
  { top: "6%", left: "44%" },
];

const NIGHT_STARS: { top: string; left: string; delay: string; size: string }[] = [
  { top: "10%", left: "12%", delay: "0s", size: "text-xs" },
  { top: "18%", left: "30%", delay: "0.6s", size: "text-sm" },
  { top: "8%", left: "52%", delay: "1.1s", size: "text-xs" },
  { top: "22%", left: "68%", delay: "0.3s", size: "text-sm" },
  { top: "14%", left: "85%", delay: "1.5s", size: "text-xs" },
  { top: "30%", left: "45%", delay: "0.9s", size: "text-xs" },
];

function StatBar({ emoji, label, value, accent }: { emoji: string; label: string; value: number; accent: string }) {
  const color = value > 60 ? "#22c55e" : value > 30 ? "#f59e0b" : "#ef4444";
  return (
    <div className="bg-white/90 backdrop-blur rounded-2xl px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-black text-gray-700">{emoji} {label}</span>
        <span className="text-[10px] font-bold" style={{ color }}>{Math.round(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, background: value > 60 ? `linear-gradient(90deg, ${accent}99, ${accent})` : color }}
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
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<"food" | "shop" | "tricks" | "fetch" | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; evolved: boolean } | null>(null);
  const [giftReveal, setGiftReveal] = useState<GiftReward | null>(null);
  const [hearts, setHearts] = useState<{ id: number; left: number }[]>([]);
  const [bursts, setBursts] = useState<{ id: number; emoji: string; left: number }[]>([]);
  const [petBouncing, setPetBouncing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const lastCuddleAt = useRef(0);
  const fxId = useRef(0);

  // Live decay so stats visibly tick down while the page is open
  useEffect(() => {
    const id = setInterval(() => setPet((p) => (p ? applyDecay(p) : p)), 60_000);
    return () => clearInterval(id);
  }, []);

  // Toasts auto-clear
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const spawnBursts = useCallback((emoji: string) => {
    const items = [22, 50, 76].map((left) => ({ id: ++fxId.current, emoji, left }));
    setBursts((b) => [...b, ...items]);
    setTimeout(() => setBursts((b) => b.filter((x) => !items.some((i) => i.id === x.id))), 1100);
    setPetBouncing(true);
  }, []);

  const runAction = useCallback(
    (fn: () => Promise<PetActionResult>, onSuccess?: (pet: Pet) => void) => {
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
          }
          return res.pet;
        });
        setStars((prev) => {
          const spent = Math.max(0, prev - res.pointsBalance);
          if (spent > 0) {
            window.dispatchEvent(new CustomEvent("stars-spent", { detail: { amount: spent } }));
          }
          return res.pointsBalance;
        });
        setModal(null);
        onSuccess?.(res.pet);
      });
    },
    [],
  );

  const cuddle = useCallback(() => {
    if (!kid || !pet || pet.isSleeping) return;
    setPetBouncing(true);
    const left = 30 + Math.random() * 40;
    const id = ++fxId.current;
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
  const face = petEmoji(pet);
  const xpIntoLevel = pet.xp - xpForLevel(level);
  const xpNeeded = xpForLevel(level + 1) - xpForLevel(level);
  const xpPct = Math.min(100, Math.round((xpIntoLevel / Math.max(1, xpNeeded)) * 100));
  const dirty = pet.cleanliness < 40;
  const notEnough = error === "not_enough_stars";
  const clientToday = new Date().toLocaleDateString("en-CA");
  const giftAvailable = pet.lastGiftDate !== clientToday;

  const claimGift = () => {
    setError(null);
    startTransition(async () => {
      const res = await claimDailyGift(kid.id);
      if (!res.ok) { setError(res.error); return; }
      setPet(res.pet);
      setStars(res.pointsBalance);
      setGiftReveal(res.reward);
    });
  };

  const doTrick = (trickId: string, emoji: string) => {
    runAction(
      () => performTrick(kid.id, trickId),
      () => {
        spawnBursts(emoji);
        setNotice(`${emoji} Ta-daa! +${TRICK_HAPPINESS} happy`);
      },
    );
  };

  return (
    <div className="max-w-md mx-auto p-4 pb-8">
      {/* Name + level + streak + stars */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-black text-gray-900 leading-tight">
            {pet.name}
            <span className="ml-2 text-[10px] font-black text-white px-2 py-0.5 rounded-full align-middle uppercase tracking-wide" style={{ background: accent }}>
              {stage} · Lv {level}
            </span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 w-24 rounded-full bg-gray-200 overflow-hidden bar-shimmer">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${xpPct}%`, background: accent }} />
            </div>
            <span className="text-[9px] font-bold text-gray-400">{xpIntoLevel}/{xpNeeded} XP</span>
          </div>
          {pet.careStreak > 0 && (
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-black text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
              🔥 {pet.careStreak}-day care streak
            </span>
          )}
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

      {/* Toasts */}
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
      {notice && !error && (
        <div className="bg-white border-2 border-green-200 rounded-2xl px-4 py-2.5 mb-3 text-center animate-pop">
          <p className="text-sm font-bold text-green-700">{notice}</p>
        </div>
      )}

      {/* Pet scene */}
      <button
        type="button"
        onClick={cuddle}
        className="relative w-full rounded-3xl overflow-hidden mb-3 cursor-pointer block shadow-lg"
        style={{
          height: 300,
          background: pet.isSleeping
            ? "linear-gradient(180deg, #0f172a 0%, #1e1b4b 45%, #312e81 75%, #3730a3 100%)"
            : "linear-gradient(180deg, #7dd3fc 0%, #bae6fd 32%, #e0f2fe 52%, #d9f99d 70%, #86efac 84%, #4ade80 100%)",
        }}
      >
        {pet.isSleeping ? (
          <>
            <span className="absolute top-4 right-5 text-4xl" style={{ filter: "drop-shadow(0 0 14px rgba(191,219,254,0.8))" }}>🌙</span>
            {NIGHT_STARS.map((s, i) => (
              <span key={i} className={`absolute twinkle text-white ${s.size}`} style={{ top: s.top, left: s.left, animationDelay: s.delay }}>
                ✦
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="absolute top-3 right-5 text-4xl" style={{ filter: "drop-shadow(0 0 18px rgba(253,224,71,0.9))" }}>☀️</span>
            <span className="cloud-drift text-4xl opacity-80" style={{ top: "10%", animationDuration: "38s", animationDelay: "-12s" }}>☁️</span>
            <span className="cloud-drift text-2xl opacity-60" style={{ top: "24%", animationDuration: "26s", animationDelay: "-4s" }}>☁️</span>
            <span className="absolute text-xl avatar-idle" style={{ top: "30%", left: "14%" }}>🦋</span>
            <span className="absolute bottom-3 left-4 text-xl">🌼</span>
            <span className="absolute bottom-2 right-5 text-xl">🌸</span>
            <span className="absolute bottom-5 right-16 text-sm">🌷</span>
          </>
        )}

        {/* owned accessories scattered in the room */}
        {pet.accessories.map((accId) => {
          const idx = PET_ACCESSORIES.findIndex((a) => a.id === accId);
          const acc = PET_ACCESSORIES[idx];
          const spot = ACCESSORY_SPOTS[(idx + ACCESSORY_SPOTS.length) % ACCESSORY_SPOTS.length];
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
            <span className="absolute bottom-6 left-8 text-2xl">💩</span>
            <span className="absolute bottom-10 right-10 text-xl">🫧</span>
          </>
        )}

        {/* daily gift */}
        {giftAvailable && !pet.isSleeping && (
          <span
            role="button"
            aria-label="Open today's gift"
            onClick={(e) => { e.stopPropagation(); if (!isPending) claimGift(); }}
            className="absolute bottom-12 right-6 text-4xl gift-wiggle inline-block"
            style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.25))" }}
          >
            🎁
          </span>
        )}

        {/* glow + pet */}
        <span
          className="pet-glow absolute left-1/2 bottom-9 rounded-full"
          style={{ width: 110, height: 16, background: pet.isSleeping ? "radial-gradient(ellipse, rgba(165,180,252,0.5), transparent 70%)" : "radial-gradient(ellipse, rgba(255,255,255,0.8), transparent 70%)" }}
        />
        <span
          onAnimationEnd={() => setPetBouncing(false)}
          className={`absolute left-1/2 -translate-x-1/2 bottom-12 text-8xl inline-block select-none ${petBouncing ? "avatar-bounce" : "avatar-idle"} ${pet.isSleeping ? "grayscale-[30%]" : ""}`}
          style={{ filter: "drop-shadow(0 10px 10px rgba(0,0,0,0.2))" }}
        >
          {face}
        </span>

        {/* sleeping z's */}
        {pet.isSleeping && (
          <>
            <span className="absolute left-[58%] bottom-36 text-2xl sleep-drift">💤</span>
            <span className="absolute left-[64%] bottom-40 text-lg sleep-drift" style={{ animationDelay: "1.2s" }}>💤</span>
          </>
        )}

        {/* floating hearts on cuddle */}
        {hearts.map((h) => (
          <span key={h.id} className="heart-float text-2xl" style={{ left: `${h.left}%`, bottom: 150 }}>
            💖
          </span>
        ))}

        {/* trick bursts */}
        {bursts.map((b) => (
          <span key={b.id} className="trick-burst text-3xl" style={{ left: `${b.left}%`, bottom: 140 }}>
            {b.emoji}
          </span>
        ))}

        {/* mood bubble */}
        <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-[92%] rounded-2xl px-3 py-1.5 text-center backdrop-blur border ${pet.isSleeping ? "bg-white/15 border-white/20 text-white" : "bg-white/70 border-white/60 text-gray-700"}`}>
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
      <div className="grid grid-cols-4 gap-2 mb-2">
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
          onClick={() => setModal("fetch")}
          disabled={isPending || pet.isSleeping || pet.energy < PLAY_MIN_ENERGY}
          className="bg-white rounded-2xl py-3 flex flex-col items-center gap-0.5 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
        >
          <span className="text-2xl">🎾</span>
          <span className="text-[10px] font-black text-gray-700">Fetch</span>
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

      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          type="button"
          onClick={() => setModal("tricks")}
          className="bg-white rounded-2xl py-3 font-black text-sm text-gray-800 shadow-sm active:scale-95 transition-transform"
        >
          ✨ Tricks {pet.tricks.length > 0 ? `· ${pet.tricks.length}/${PET_TRICKS.length}` : ""}
        </button>
        <button
          type="button"
          onClick={() => setModal("shop")}
          className="bg-white rounded-2xl py-3 font-black text-sm text-gray-800 shadow-sm active:scale-95 transition-transform"
        >
          🛍️ Shop · {pet.accessories.length}/{PET_ACCESSORIES.length}
        </button>
      </div>

      <p className="text-center text-[10px] font-semibold text-gray-400">
        Tap {pet.name} for a free cuddle 💖 · A new 🎁 appears every day · Care daily to grow your 🔥 streak
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

      {/* Fetch mini-game */}
      {modal === "fetch" && (
        <FetchGame
          petFace={face}
          petName={pet.name}
          accent={accent}
          cost={PLAY_COST}
          busy={isPending}
          onCancel={() => setModal(null)}
          onDone={(score) => {
            const reward = playReward(score);
            runAction(
              () => playWithPet(kid.id, score),
              () => setNotice(`🎾 ${pet.name} loved that! +${reward.happiness} happy · +${reward.xp} XP`),
            );
          }}
        />
      )}

      {/* Tricks */}
      {modal === "tricks" && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setModal(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-gray-900 text-center mb-1">✨ Tricks</h2>
            <p className="text-center text-[10px] font-bold text-gray-400 mb-3">
              Learn once with stars — perform forever for free!
            </p>
            <div className="space-y-2">
              {PET_TRICKS.map((t) => {
                const learned = pet.tricks.includes(t.id);
                const locked = level < t.minLevel;
                return (
                  <div key={t.id} className={`rounded-2xl p-3 flex items-center gap-3 ${learned ? "bg-green-50" : "bg-gray-50"} ${locked ? "opacity-60" : ""}`}>
                    <span className="text-3xl">{t.emoji}</span>
                    <span className="flex-1 text-left">
                      <span className="block font-black text-sm text-gray-800">{t.label}</span>
                      <span className="block text-[10px] font-bold text-gray-400">
                        {learned ? "Learned!" : locked ? `Unlocks at level ${t.minLevel}` : `Level ${t.minLevel}+`}
                      </span>
                    </span>
                    {learned ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => doTrick(t.id, t.emoji)}
                        className="text-sm font-black text-white rounded-full px-4 py-1.5 active:scale-95 transition-transform disabled:opacity-50"
                        style={{ background: accent }}
                      >
                        Perform!
                      </button>
                    ) : locked ? (
                      <span className="text-sm font-black text-gray-400 px-3 py-1.5">🔒 Lv {t.minLevel}</span>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(() => learnTrick(kid.id, t.id), () => setNotice(`${t.emoji} ${pet.name} learned ${t.label}!`))}
                        className="text-sm font-black text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1.5 active:scale-95 transition-transform disabled:opacity-50"
                      >
                        Learn · {t.starCost} ⭐
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Accessory shop */}
      {modal === "shop" && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setModal(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8 max-h-[75dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-gray-900 text-center mb-1">🛍️ Pet shop</h2>
            <p className="text-center text-[10px] font-bold text-gray-400 mb-3">
              Toys live in {pet.name}&apos;s room forever — level up to unlock more!
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PET_ACCESSORIES.map((a) => {
                const owned = pet.accessories.includes(a.id);
                const locked = level < a.minLevel;
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={isPending || owned || locked}
                    onClick={() => runAction(() => buyAccessory(kid.id, a.id), () => setNotice(`${a.emoji} ${a.label} added to ${pet.name}'s room!`))}
                    className={`rounded-2xl p-3 flex flex-col items-center gap-1 active:scale-95 transition-transform ${owned ? "bg-green-50 border-2 border-green-200" : "bg-gray-50"} ${locked ? "opacity-60" : ""}`}
                  >
                    <span className={`text-3xl ${locked ? "grayscale" : ""}`}>{a.emoji}</span>
                    <span className="text-[10px] font-black text-gray-700">{a.label}</span>
                    {owned ? (
                      <span className="text-[9px] font-black text-green-600">Owned ✓</span>
                    ) : locked ? (
                      <span className="text-[9px] font-black text-gray-400">🔒 Lv {a.minLevel}</span>
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

      {/* Gift reveal */}
      {giftReveal && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-7 text-center"
          style={{ background: "rgba(17, 24, 39, 0.85)" }}
          onClick={() => setGiftReveal(null)}
        >
          <span className="text-7xl animate-pop inline-block mb-4">
            {giftReveal.kind === "accessory"
              ? PET_ACCESSORIES.find((a) => a.id === giftReveal.accessoryId)?.emoji ?? "🎁"
              : giftReveal.kind === "xp" ? "✨" : giftReveal.kind === "happiness" ? "😊" : "⚡"}
          </span>
          <h2 className="text-2xl font-black text-white mb-1">
            {giftReveal.kind === "accessory"
              ? `A free ${PET_ACCESSORIES.find((a) => a.id === giftReveal.accessoryId)?.label ?? "toy"}!`
              : giftReveal.kind === "xp" ? `+${giftReveal.amount} XP!`
              : giftReveal.kind === "happiness" ? `+${giftReveal.amount} happiness!`
              : `+${giftReveal.amount} energy!`}
          </h2>
          <p className="text-sm font-bold text-white/70 mb-6">Come back tomorrow for another gift 🎁</p>
          <button
            type="button"
            className="px-8 py-3.5 rounded-2xl font-black text-base text-gray-900 bg-white active:scale-95 transition-transform"
            onClick={() => setGiftReveal(null)}
          >
            Yay! →
          </button>
        </div>
      )}

      {/* Level-up celebration */}
      {levelUp && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-7 text-center"
          style={{ background: "rgba(17, 24, 39, 0.85)" }}
          onClick={() => setLevelUp(null)}
        >
          <span className="text-8xl avatar-party inline-block mb-4">{face}</span>
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
