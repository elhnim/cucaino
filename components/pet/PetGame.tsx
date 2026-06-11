"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import GameAudio from "@/components/audio/GameAudio";
import GameFullscreen from "@/components/games/GameFullscreen";
import { playSfx } from "@/lib/audio/sound-manager";
import FetchGame from "@/components/pet/FetchGame";
import PetSprite from "@/components/pet/PetSprite";
import PetSpeech from "@/components/pet/PetSpeech";
import {
  PET_ACCESSORIES,
  PET_FOODS,
  PET_PERSONALITIES,
  PET_SPECIES,
  PET_TRICKS,
  PLAY_COST,
  PLAY_MIN_ENERGY,
  SPEECH_UNLOCK_LEVEL,
  TRICK_HAPPINESS,
  WASH_COST,
} from "@/lib/pet/config";
import {
  applyDecay,
  getSpecies,
  getPetSpeech,
  levelFromXp,
  moodFor,
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
  sayGoodbyeToPet,
  setPersonalities,
  toggleSleep,
  washPet,
  type GiftReward,
  type PetActionResult,
} from "@/lib/actions/pet";

const CUDDLE_COOLDOWN_MS = 30_000;

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
  { top: "6%",  left: "44%" },
];

const NIGHT_STARS: { top: string; left: string; delay: string; size: string }[] = [
  { top: "10%", left: "12%", delay: "0s",   size: "text-xs" },
  { top: "18%", left: "30%", delay: "0.6s", size: "text-sm" },
  { top: "8%",  left: "52%", delay: "1.1s", size: "text-xs" },
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

// ── Personality picker for existing pets without personalities ────────────────

function PersonalityPickerScreen({
  pet,
  kidId,
  accent,
  onSaved,
}: {
  pet: Pet;
  kidId: string;
  accent: string;
  onSaved: (pet: Pet) => void;
}) {
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const species = getSpecies(pet.species);
  const stage = stageFromLevel(levelFromXp(pet.xp));

  const toggleTrait = (id: string) => {
    setSelectedTraits((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const save = () => {
    if (selectedTraits.length !== 3) { setError("Pick exactly 3 traits!"); return; }
    setError(null);
    startTransition(async () => {
      const res = await setPersonalities(kidId, selectedTraits);
      if (res.ok) onSaved(res.pet);
      else setError(res.error);
    });
  };

  return (
    <div className="max-w-md mx-auto p-4 pt-6">
      <div className="text-center mb-4">
        <PetSprite species={pet.species} mood="happy" stage={stage} size={100} animClass="avatar-party"/>
      </div>
      <h2 className="text-xl font-black text-gray-900 text-center mb-1">
        What&apos;s {pet.name}&apos;s personality?
      </h2>
      <p className="text-sm text-gray-500 text-center mb-4">
        Pick <strong>3 traits</strong> that describe your {species.name.toLowerCase()} best!
        {selectedTraits.length > 0 && (
          <span className="font-black" style={{ color: accent }}> ({selectedTraits.length}/3 chosen)</span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-2.5 mb-5">
        {PET_PERSONALITIES.map((trait) => {
          const selected = selectedTraits.includes(trait.id);
          const disabled = !selected && selectedTraits.length >= 3;
          return (
            <button
              key={trait.id}
              type="button"
              onClick={() => toggleTrait(trait.id)}
              disabled={disabled}
              className={`rounded-2xl p-3 flex items-center gap-2.5 active:scale-95 transition-all border-2 ${disabled ? "opacity-40" : ""}`}
              style={selected
                ? { borderColor: accent, background: `${accent}18` }
                : { background: "white", borderColor: "transparent" }}
            >
              <span className="text-2xl">{trait.emoji}</span>
              <div className="text-left flex-1">
                <div className="font-black text-sm text-gray-900">{trait.label}</div>
                <div className="text-[10px] font-bold text-gray-400">{trait.description}</div>
              </div>
              {selected && <span className="text-green-500 font-black">✓</span>}
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm font-bold text-red-500 text-center mb-3">{error}</p>}
      <button
        type="button"
        onClick={save}
        disabled={isPending || selectedTraits.length !== 3}
        className="w-full py-4 rounded-2xl font-black text-base text-white active:scale-95 transition-transform disabled:opacity-40"
        style={{ background: accent }}
      >
        {isPending ? "Saving…" : selectedTraits.length === 3 ? `Save ${pet.name}'s personality! 🎉` : `Choose ${3 - selectedTraits.length} more trait${selectedTraits.length === 2 ? "" : "s"}`}
      </button>
    </div>
  );
}

// ── Adopt screen (3-step: species → personalities → name) ────────────────────

function AdoptScreen({
  kidId,
  accent,
  onAdopted,
}: {
  kidId: string;
  accent: string;
  onAdopted: (pet: Pet, stars: number) => void;
}) {
  const [step, setStep] = useState<"species" | "personality" | "name">("species");
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggleTrait = (id: string) => {
    setSelectedTraits((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, id];
    });
  };

  const adopt = () => {
    if (!speciesId) { setError("Pick a pet first!"); return; }
    if (selectedTraits.length !== 3) { setError("Pick exactly 3 personality traits!"); return; }
    const trimmed = name.trim();
    if (trimmed.length < 1) { setError("Give your pet a name!"); return; }
    setError(null);
    startTransition(async () => {
      const res = await adoptPet(kidId, speciesId, trimmed, selectedTraits);
      if (res.ok) onAdopted(res.pet, res.pointsBalance);
      else setError(res.error);
    });
  };

  const selectedSpecies = PET_SPECIES.find((s) => s.id === speciesId);

  return (
    <div className="max-w-md mx-auto pb-8">
      {/* Step 1 — Pick species */}
      {step === "species" && (
        <div className="p-4 pt-6 text-center">
          <div className="text-5xl mb-2">🐾</div>
          <h1 className="text-2xl font-black text-gray-900 mb-1">Adopt a Star Pet!</h1>
          <p className="text-sm text-gray-500 mb-5">
            Your very own buddy — feed it, play with it, watch it grow!
          </p>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {PET_SPECIES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSpeciesId(s.id)}
                className={`bg-white rounded-2xl p-3 flex flex-col items-center gap-2 shadow-sm active:scale-95 transition-all border-2 ${speciesId === s.id ? "scale-105 shadow-md" : "border-transparent"}`}
                style={speciesId === s.id ? { borderColor: s.color, boxShadow: `0 0 0 3px ${s.color}40` } : undefined}
              >
                <PetSprite species={s.id} mood="happy" stage="baby" size={70} animClass={speciesId === s.id ? "avatar-bounce" : "avatar-idle"}/>
                <span className="text-xs font-black text-gray-800">{s.name}</span>
                <span className="text-[9px] text-gray-400 font-semibold leading-tight">{s.personality}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!speciesId}
            onClick={() => { if (speciesId) setStep("personality"); }}
            className="w-full py-4 rounded-2xl font-black text-base text-white active:scale-95 transition-transform disabled:opacity-40"
            style={{ background: speciesId ? (selectedSpecies?.color ?? accent) : "#ddd" }}
          >
            Choose {selectedSpecies?.name ?? "a pet"} →
          </button>
        </div>
      )}

      {/* Step 2 — Pick 3 personalities */}
      {step === "personality" && selectedSpecies && (
        <div className="p-4 pt-6 text-center">
          <div className="mb-3">
            <PetSprite species={speciesId!} mood="happy" stage="baby" size={90} animClass="avatar-party"/>
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-1">
            What is {name.trim() || "your pet"}&apos;s personality?
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Pick <strong>3 traits</strong> that describe them best!
            {selectedTraits.length > 0 && <span className="font-black" style={{ color: selectedSpecies.color }}> ({selectedTraits.length}/3)</span>}
          </p>
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            {PET_PERSONALITIES.map((trait) => {
              const selected = selectedTraits.includes(trait.id);
              const disabled = !selected && selectedTraits.length >= 3;
              return (
                <button
                  key={trait.id}
                  type="button"
                  onClick={() => toggleTrait(trait.id)}
                  disabled={disabled}
                  className={`rounded-2xl p-3 flex items-center gap-2.5 active:scale-95 transition-all border-2 ${selected ? "scale-[1.03] shadow-md" : "bg-white border-transparent"} ${disabled ? "opacity-40" : ""}`}
                  style={selected ? { borderColor: selectedSpecies.color, background: `${selectedSpecies.color}18` } : { background: "white" }}
                >
                  <span className="text-2xl">{trait.emoji}</span>
                  <div className="text-left flex-1">
                    <div className="font-black text-sm text-gray-900">{trait.label}</div>
                    <div className="text-[10px] font-bold text-gray-400">{trait.description}</div>
                  </div>
                  {selected && <span className="text-green-500 font-black text-base">✓</span>}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("species")}
              className="flex-1 py-3 border-2 border-gray-200 rounded-2xl font-black text-gray-600 active:scale-95 transition-transform"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={selectedTraits.length !== 3}
              onClick={() => { if (selectedTraits.length === 3) setStep("name"); }}
              className="flex-2 px-6 py-3 rounded-2xl font-black text-white active:scale-95 transition-transform disabled:opacity-40"
              style={{ flex: 2, background: selectedSpecies.color }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Name */}
      {step === "name" && selectedSpecies && (
        <div className="p-4 pt-6 text-center">
          <div className="mb-3">
            <PetSprite species={speciesId!} mood="ecstatic" stage="baby" size={90} animClass="avatar-party"/>
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-1">One last thing…</h2>
          <p className="text-sm text-gray-500 mb-2">What will you call your new friend?</p>

          {/* Selected traits preview */}
          <div className="flex flex-wrap justify-center gap-1.5 mb-4">
            {selectedTraits.map((id) => {
              const t = PET_PERSONALITIES.find((p) => p.id === id)!;
              return (
                <span key={id} className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full text-white" style={{ background: selectedSpecies.color }}>
                  {t.emoji} {t.label}
                </span>
              );
            })}
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="Give your pet a name…"
            className="w-full bg-white rounded-2xl px-4 py-3.5 text-center font-black text-lg text-gray-900 shadow-sm outline-none mb-3 placeholder:text-gray-300 placeholder:font-bold"
            autoFocus
          />

          {error && <p className="text-sm font-bold text-red-500 mb-3">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("personality")}
              className="flex-1 py-3 border-2 border-gray-200 rounded-2xl font-black text-gray-600 active:scale-95 transition-transform"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={adopt}
              disabled={isPending || name.trim().length < 1}
              className="font-black text-base text-white active:scale-95 transition-transform disabled:opacity-50 py-3 px-6 rounded-2xl"
              style={{ flex: 2, background: selectedSpecies.color }}
            >
              {isPending ? "Adopting…" : `Adopt ${name.trim() || "your pet"}! 🎉`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main game component ──────────────────────────────────────────────────────

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
  const [modal, setModal] = useState<"food" | "shop" | "tricks" | "fetch" | "goodbye" | null>(null);
  const [goodbyeArmed, setGoodbyeArmed] = useState(false);
  const [levelUp, setLevelUp] = useState<{ level: number; evolved: boolean } | null>(null);
  const [giftReveal, setGiftReveal] = useState<GiftReward | null>(null);
  const [hearts, setHearts] = useState<{ id: number; left: number }[]>([]);
  const [bursts, setBursts] = useState<{ id: number; emoji: string; left: number }[]>([]);
  const [petBouncing, setPetBouncing] = useState(false);
  const [trickAnim, setTrickAnim] = useState<string | null>(null);
  const [highFiveHand, setHighFiveHand] = useState(false);
  const [notes, setNotes] = useState<{ id: number; emoji: string; left: number; delay: number }[]>([]);
  const [speech, setSpeech] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const lastCuddleAt = useRef(0);
  const fxId = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setPet((p) => (p ? applyDecay(p) : p)), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (levelUp) playSfx("sparkle");
  }, [levelUp]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // Show idle greeting when first opening
  useEffect(() => {
    if (!pet) return;
    const level = levelFromXp(pet.xp);
    const stage = stageFromLevel(level);
    const line = getPetSpeech(pet.species, pet.personalities, "idle", level, stage);
    if (line) {
      const t = setTimeout(() => setSpeech(line), 1200);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  const say = useCallback((action: Parameters<typeof getPetSpeech>[2]) => {
    if (!pet) return;
    const level = levelFromXp(pet.xp);
    const stage = stageFromLevel(level);
    const line = getPetSpeech(pet.species, pet.personalities, action, level, stage);
    if (line) setSpeech(line);
  }, [pet]);

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
              setLevelUp({ level: newLevel, evolved: stageFromLevel(newLevel) !== stageFromLevel(prevLevel) });
            }
          }
          return res.pet;
        });
        setStars((prev) => {
          const spent = Math.max(0, prev - res.pointsBalance);
          if (spent > 0) window.dispatchEvent(new CustomEvent("stars-spent", { detail: { amount: spent } }));
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
    say("cuddle");
    const now = Date.now();
    if (now - lastCuddleAt.current > CUDDLE_COOLDOWN_MS) {
      lastCuddleAt.current = now;
      runAction(() => cuddlePet(kid.id));
    }
  }, [kid, pet, runAction, say]);

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
    return <AdoptScreen kidId={kid.id} accent={accent} onAdopted={(p, s) => { setPet(p); setStars(s); }}/>;
  }

  // Legacy pet — no personalities set yet, show one-time picker
  if (pet.personalities.length === 0) {
    return (
      <PersonalityPickerScreen
        pet={pet}
        kidId={kid.id}
        accent={accent}
        onSaved={(updated) => setPet(updated)}
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
  const clientToday = new Date().toLocaleDateString("en-CA");
  const giftAvailable = pet.lastGiftDate !== clientToday;
  const canSpeak = stage === "baby" || level >= SPEECH_UNLOCK_LEVEL;

  const claimGift = () => {
    setError(null);
    startTransition(async () => {
      const res = await claimDailyGift(kid.id);
      if (!res.ok) { setError(res.error); return; }
      setPet(res.pet);
      setStars(res.pointsBalance);
      setGiftReveal(res.reward);
      say("gift");
    });
  };

  // each trick gets its own choreography (CSS classes in globals.css) + matching effects
  const TRICK_FX: Record<string, { anim: string; ms: number; bursts: string[]; notes?: string[]; hand?: boolean }> = {
    spin:     { anim: "trick-spin",     ms: 1100, bursts: ["🌀", "💫", "🌀"] },
    dance:    { anim: "trick-dance",    ms: 1400, bursts: ["✨", "🪩", "✨"], notes: ["🎵", "🎶", "🎵"] },
    highfive: { anim: "trick-highfive", ms: 900,  bursts: ["💥", "⭐", "💥"], hand: true },
    backflip: { anim: "trick-backflip", ms: 1200, bursts: ["🤸", "⭐", "💨"] },
    sing:     { anim: "trick-sing",     ms: 1500, bursts: ["🎤", "💖", "🌟"], notes: ["🎵", "🎶", "🎼", "🎵"] },
    magic:    { anim: "trick-magic",    ms: 1400, bursts: ["✨", "🪄", "🌟"], notes: ["✨", "✨", "✨"] },
  };

  const doTrick = (trickId: string, emoji: string) => {
    runAction(
      () => performTrick(kid.id, trickId),
      () => {
        const fx = TRICK_FX[trickId];
        if (fx) {
          setTrickAnim(fx.anim);
          setTimeout(() => setTrickAnim(null), fx.ms + 50);
          const items = fx.bursts.map((e, i) => ({ id: ++fxId.current, emoji: e, left: 22 + i * 27 }));
          setBursts((b) => [...b, ...items]);
          setTimeout(() => setBursts((b) => b.filter((x) => !items.some((i) => i.id === x.id))), 1100);
          if (fx.notes) {
            const ns = fx.notes.map((e, i) => ({ id: ++fxId.current, emoji: e, left: 25 + i * 18, delay: i * 0.18 }));
            setNotes((n) => [...n, ...ns]);
            setTimeout(() => setNotes((n) => n.filter((x) => !ns.some((i) => i.id === x.id))), fx.ms + 600);
          }
          if (fx.hand) {
            setHighFiveHand(true);
            setTimeout(() => setHighFiveHand(false), 950);
          }
        } else {
          spawnBursts(emoji);
        }
        playSfx("sparkle");
        setNotice(`${emoji} Ta-daa! +${TRICK_HAPPINESS} happy`);
        say("trick");
      },
    );
  };

  const spriteAnimClass = trickAnim ?? (petBouncing ? "avatar-bounce" : "avatar-idle");

  return (
    <div className="max-w-md mx-auto p-4 pb-8">
      <GameAudio track="pet" />
      <GameFullscreen />
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-black text-gray-900 leading-tight">
            {pet.name}
            <span className="ml-2 text-[10px] font-black text-white px-2 py-0.5 rounded-full align-middle uppercase tracking-wide" style={{ background: accent }}>
              {stage} · Age {level}
            </span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 w-24 rounded-full bg-gray-200 overflow-hidden bar-shimmer">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${xpPct}%`, background: accent }}/>
            </div>
            <span className="text-[9px] font-bold text-gray-400">{xpIntoLevel}/{xpNeeded} XP</span>
          </div>
          {pet.careStreak > 0 && (
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-black text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
              🔥 {pet.careStreak}-day care streak
            </span>
          )}
          {/* Personality chips */}
          {pet.personalities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {pet.personalities.map((id) => {
                const t = PET_PERSONALITIES.find((p) => p.id === id);
                return t ? (
                  <span key={id} className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {t.emoji} {t.label}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="inline-flex items-center gap-1 bg-yellow-50 border-2 border-yellow-300 rounded-full px-3 py-1 text-sm font-black text-yellow-800">
            ⭐ {stars.toLocaleString()}
          </div>
          <Link href={`/kid/${kid.id}/todo`} className="block text-[10px] font-bold mt-1 underline" style={{ color: accent }}>
            Earn more →
          </Link>
          {canSpeak && (
            <span className="block text-[9px] font-bold text-purple-400 mt-0.5">💬 can talk!</span>
          )}
        </div>
      </div>

      {/* Toasts — fixed and above every modal (z-50) so "not enough stars"
          shows on top of the shop sheet, not behind it */}
      {error && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-2rem)] max-w-md bg-white border-2 border-red-200 rounded-2xl px-4 py-2.5 text-center animate-pop shadow-lg">
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
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-2rem)] max-w-md bg-white border-2 border-green-200 rounded-2xl px-4 py-2.5 text-center animate-pop shadow-lg">
          <p className="text-sm font-bold text-green-700">{notice}</p>
        </div>
      )}

      {/* Pet scene */}
      <button
        type="button"
        onClick={cuddle}
        className="relative w-full rounded-3xl overflow-hidden mb-3 cursor-pointer block shadow-lg"
        style={{
          height: 320,
          background: pet.isSleeping
            ? "linear-gradient(180deg, #0f172a 0%, #1e1b4b 45%, #312e81 75%, #3730a3 100%)"
            : "linear-gradient(180deg, #7dd3fc 0%, #bae6fd 32%, #e0f2fe 52%, #d9f99d 70%, #86efac 84%, #4ade80 100%)",
        }}
      >
        {pet.isSleeping ? (
          <>
            <span className="absolute top-4 right-5 text-4xl" style={{ filter: "drop-shadow(0 0 14px rgba(191,219,254,0.8))" }}>🌙</span>
            {NIGHT_STARS.map((s, i) => (
              <span key={i} className={`absolute twinkle text-white ${s.size}`} style={{ top: s.top, left: s.left, animationDelay: s.delay }}>✦</span>
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

        {/* Accessories scattered in the scene */}
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

        {dirty && !pet.isSleeping && (
          <>
            <span className="absolute bottom-6 left-8 text-2xl">💩</span>
            <span className="absolute bottom-10 right-10 text-xl">🫧</span>
          </>
        )}

        {giftAvailable && !pet.isSleeping && (
          <span
            role="button"
            aria-label="Open today's gift"
            onClick={(e) => { e.stopPropagation(); if (!isPending) claimGift(); }}
            className="absolute bottom-14 right-6 text-4xl gift-wiggle inline-block"
            style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.25))" }}
          >
            🎁
          </span>
        )}

        {/* Glow under pet */}
        <span
          className="pet-glow absolute left-1/2 bottom-12 rounded-full"
          style={{ width: 100, height: 16, marginLeft: -50, background: pet.isSleeping ? "radial-gradient(ellipse, rgba(165,180,252,0.5), transparent 70%)" : "radial-gradient(ellipse, rgba(255,255,255,0.8), transparent 70%)" }}
        />

        {/* Full-body pet sprite + speech bubble */}
        <div
          className="absolute left-1/2 bottom-14"
          style={{ transform: "translateX(-50%)" }}
          onAnimationEnd={() => setPetBouncing(false)}
        >
          <div className="relative">
            <PetSpeech line={speech} accent={accent}/>
            <PetSprite
              species={pet.species}
              mood={mood.id}
              stage={stage}
              size={130}
              animClass={spriteAnimClass}
            />
          </div>
        </div>

        {/* Sleeping z's */}
        {pet.isSleeping && (
          <>
            <span className="absolute left-[62%] bottom-36 text-2xl sleep-drift">💤</span>
            <span className="absolute left-[68%] bottom-40 text-lg sleep-drift" style={{ animationDelay: "1.2s" }}>💤</span>
          </>
        )}

        {/* Hearts on cuddle */}
        {hearts.map((h) => (
          <span key={h.id} className="heart-float text-2xl" style={{ left: `${h.left}%`, bottom: 150 }}>💖</span>
        ))}

        {/* Trick bursts */}
        {bursts.map((b) => (
          <span key={b.id} className="trick-burst text-3xl" style={{ left: `${b.left}%`, bottom: 140 }}>{b.emoji}</span>
        ))}

        {/* Music notes (sing/dance/magic) */}
        {notes.map((n) => (
          <span key={n.id} className="note-float text-2xl" style={{ left: `${n.left}%`, bottom: 170, animationDelay: `${n.delay}s` }}>{n.emoji}</span>
        ))}

        {/* The big hand swinging in for a high five */}
        {highFiveHand && (
          <span className="highfive-hand text-5xl" style={{ left: "55%", bottom: 170 }}>✋</span>
        )}

        {/* Mood bubble */}
        <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-[92%] rounded-2xl px-3 py-1.5 text-center backdrop-blur border ${pet.isSleeping ? "bg-white/15 border-white/20 text-white" : "bg-white/70 border-white/60 text-gray-700"}`}>
          <span className="text-xs font-bold">{mood.emoji} {mood.message}</span>
        </div>
      </button>

      {/* Stat bars */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatBar emoji="🍎" label="Food"   value={pet.hunger}      accent={accent}/>
        <StatBar emoji="😊" label="Happy"  value={pet.happiness}   accent={accent}/>
        <StatBar emoji="⚡" label="Energy" value={pet.energy}      accent={accent}/>
        <StatBar emoji="🛁" label="Clean"  value={pet.cleanliness} accent={accent}/>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <button type="button" onClick={() => { setModal("food"); say("idle"); }} disabled={isPending || pet.isSleeping}
          className="bg-white rounded-2xl py-3 flex flex-col items-center gap-0.5 shadow-sm active:scale-95 transition-transform disabled:opacity-40">
          <span className="text-2xl">🍎</span>
          <span className="text-[10px] font-black text-gray-700">Feed</span>
          <span className="text-[9px] font-bold text-yellow-600">1–3 ⭐</span>
        </button>
        <button type="button" onClick={() => setModal("fetch")} disabled={isPending || pet.isSleeping || pet.energy < PLAY_MIN_ENERGY}
          className="bg-white rounded-2xl py-3 flex flex-col items-center gap-0.5 shadow-sm active:scale-95 transition-transform disabled:opacity-40">
          <span className="text-2xl">🎾</span>
          <span className="text-[10px] font-black text-gray-700">Fetch</span>
          <span className="text-[9px] font-bold text-yellow-600">{PLAY_COST} ⭐</span>
        </button>
        <button type="button"
          onClick={() => runAction(() => washPet(kid.id), () => say("wash"))}
          disabled={isPending || pet.isSleeping}
          className="bg-white rounded-2xl py-3 flex flex-col items-center gap-0.5 shadow-sm active:scale-95 transition-transform disabled:opacity-40">
          <span className="text-2xl">🛁</span>
          <span className="text-[10px] font-black text-gray-700">Wash</span>
          <span className="text-[9px] font-bold text-yellow-600">{WASH_COST} ⭐</span>
        </button>
        <button type="button" onClick={() => runAction(() => toggleSleep(kid.id))} disabled={isPending}
          className="bg-white rounded-2xl py-3 flex flex-col items-center gap-0.5 shadow-sm active:scale-95 transition-transform disabled:opacity-40">
          <span className="text-2xl">{pet.isSleeping ? "⏰" : "😴"}</span>
          <span className="text-[10px] font-black text-gray-700">{pet.isSleeping ? "Wake" : "Sleep"}</span>
          <span className="text-[9px] font-bold text-green-600">Free</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <button type="button" onClick={() => setModal("tricks")}
          className="bg-white rounded-2xl py-3 font-black text-sm text-gray-800 shadow-sm active:scale-95 transition-transform">
          ✨ Tricks {pet.tricks.length > 0 ? `· ${pet.tricks.length}/${PET_TRICKS.length}` : ""}
        </button>
        <button type="button" onClick={() => setModal("shop")}
          className="bg-white rounded-2xl py-3 font-black text-sm text-gray-800 shadow-sm active:scale-95 transition-transform">
          🛍️ Shop · {pet.accessories.length}/{PET_ACCESSORIES.length}
        </button>
      </div>

      <p className="text-center text-[10px] font-semibold text-gray-400">
        Tap {pet.name} for a free cuddle 💖 · A new 🎁 appears every day · Care daily to grow your 🔥 streak
        {stage !== "baby" && !canSpeak && <> · <span className="text-purple-400">💬 {pet.name} will talk at age {SPEECH_UNLOCK_LEVEL}!</span></>}
      </p>

      {/* Say goodbye — deliberately low-emphasis */}
      <button
        type="button"
        onClick={() => { setGoodbyeArmed(false); setModal("goodbye"); }}
        className="block mx-auto mt-6 mb-2 text-xs font-bold text-gray-400 underline-offset-2 hover:underline"
      >
        👋 Say goodbye to {pet.name}…
      </button>

      {/* Food picker */}
      {modal === "food" && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setModal(null)}>
          <div className="absolute inset-0 bg-black/30"/>
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-gray-900 text-center mb-3">What should {pet.name} eat?</h2>
            <div className="space-y-2">
              {PET_FOODS.map((f) => (
                <button key={f.id} type="button" disabled={isPending}
                  onClick={() => runAction(() => feedPet(kid.id, f.id), () => say("feed"))}
                  className="w-full bg-gray-50 rounded-2xl p-3 flex items-center gap-3 active:scale-[0.98] transition-transform disabled:opacity-50">
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
          species={pet.species}
          stage={stage}
          petName={pet.name}
          accent={accent}
          cost={PLAY_COST}
          busy={isPending}
          onCancel={() => setModal(null)}
          onDone={(score) => {
            const reward = playReward(score);
            runAction(
              () => playWithPet(kid.id, score),
              () => {
                setNotice(`🎾 ${pet.name} loved that! +${reward.happiness} happy · +${reward.xp} XP`);
                say("play");
              },
            );
          }}
        />
      )}

      {/* Tricks */}
      {modal === "tricks" && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setModal(null)}>
          <div className="absolute inset-0 bg-black/30"/>
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-gray-900 text-center mb-1">✨ Tricks</h2>
            <p className="text-center text-[10px] font-bold text-gray-400 mb-3">Learn once with stars — perform forever for free!</p>
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
                        {learned ? "Learned!" : locked ? `Unlocks at age ${t.minLevel}` : `Age ${t.minLevel}+`}
                      </span>
                    </span>
                    {learned ? (
                      <button type="button" disabled={isPending} onClick={() => doTrick(t.id, t.emoji)}
                        className="text-sm font-black text-white rounded-full px-4 py-1.5 active:scale-95 transition-transform disabled:opacity-50"
                        style={{ background: accent }}>
                        Perform!
                      </button>
                    ) : locked ? (
                      <span className="text-sm font-black text-gray-400 px-3 py-1.5">🔒 Age {t.minLevel}</span>
                    ) : (
                      <button type="button" disabled={isPending}
                        onClick={() => runAction(() => learnTrick(kid.id, t.id), () => setNotice(`${t.emoji} ${pet.name} learned ${t.label}!`))}
                        className="text-sm font-black text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1.5 active:scale-95 transition-transform disabled:opacity-50">
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
          <div className="absolute inset-0 bg-black/30"/>
          <div className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8 max-h-[75dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-gray-900 text-center mb-1">🛍️ Pet shop</h2>
            <p className="text-center text-[10px] font-bold text-gray-400 mb-3">
              Toys live in {pet.name}&apos;s room forever — grow older to unlock more!
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PET_ACCESSORIES.map((a) => {
                const owned = pet.accessories.includes(a.id);
                const locked = level < a.minLevel;
                return (
                  <button key={a.id} type="button" disabled={isPending || owned || locked}
                    onClick={() => runAction(() => buyAccessory(kid.id, a.id), () => setNotice(`${a.emoji} ${a.label} added to ${pet.name}'s room!`))}
                    className={`rounded-2xl p-3 flex flex-col items-center gap-1 active:scale-95 transition-transform ${owned ? "bg-green-50 border-2 border-green-200" : "bg-gray-50"} ${locked ? "opacity-60" : ""}`}>
                    <span className={`text-3xl ${locked ? "grayscale" : ""}`}>{a.emoji}</span>
                    <span className="text-[10px] font-black text-gray-700">{a.label}</span>
                    {owned ? <span className="text-[9px] font-black text-green-600">Owned ✓</span>
                      : locked ? <span className="text-[9px] font-black text-gray-400">🔒 Age {a.minLevel}</span>
                      : <span className="text-[10px] font-black text-yellow-700">{a.starCost} ⭐</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Say goodbye confirmation */}
      {modal === "goodbye" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => { if (!isPending) { setGoodbyeArmed(false); setModal(null); } }}/>
          <div className="relative bg-white rounded-3xl p-6 max-w-sm w-full text-center">
            <PetSprite species={pet.species} mood="lonely" stage={stage} size={90} animClass="avatar-idle"/>
            <h2 className="text-xl font-black text-gray-900 mt-2 mb-1">Say goodbye to {pet.name}?</h2>
            <p className="text-sm text-gray-500 mb-5">
              {pet.name}&apos;s age, tricks and accessories will be gone forever.
              You can adopt a new pet after.
            </p>
            <button
              type="button"
              disabled={isPending}
              onClick={() => { setGoodbyeArmed(false); setModal(null); }}
              className="w-full py-4 rounded-2xl font-black text-base text-white active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: accent }}
            >
              Keep {pet.name} 💚
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (!goodbyeArmed) { setGoodbyeArmed(true); return; }
                setError(null);
                startTransition(async () => {
                  const res = await sayGoodbyeToPet(kid.id);
                  if (res.ok) {
                    // clear every trace of the old pet so the new one starts clean
                    setModal(null);
                    setSpeech(null);
                    setNotice(null);
                    setPet(null);
                  } else {
                    setError(res.error);
                  }
                });
              }}
              className="w-full mt-2 py-3 rounded-2xl font-bold text-sm text-red-500 bg-red-50 active:scale-95 transition-transform disabled:opacity-50"
            >
              {isPending ? "Saying goodbye…" : goodbyeArmed ? "Tap again — really say goodbye 💔" : "Say goodbye forever"}
            </button>
          </div>
        </div>
      )}

      {/* Gift reveal */}
      {giftReveal && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-7 text-center"
          style={{ background: "rgba(17, 24, 39, 0.85)" }} onClick={() => setGiftReveal(null)}>
          <span className="text-7xl animate-pop inline-block mb-4">
            {giftReveal.kind === "accessory" ? PET_ACCESSORIES.find((a) => a.id === giftReveal.accessoryId)?.emoji ?? "🎁"
              : giftReveal.kind === "xp" ? "✨" : giftReveal.kind === "happiness" ? "😊" : "⚡"}
          </span>
          <h2 className="text-2xl font-black text-white mb-1">
            {giftReveal.kind === "accessory" ? `A free ${PET_ACCESSORIES.find((a) => a.id === giftReveal.accessoryId)?.label ?? "toy"}!`
              : giftReveal.kind === "xp" ? `+${giftReveal.amount} XP!`
              : giftReveal.kind === "happiness" ? `+${giftReveal.amount} happiness!`
              : `+${giftReveal.amount} energy!`}
          </h2>
          <p className="text-sm font-bold text-white/70 mb-6">Come back tomorrow for another gift 🎁</p>
          <button type="button" className="px-8 py-3.5 rounded-2xl font-black text-base text-gray-900 bg-white active:scale-95 transition-transform"
            onClick={() => setGiftReveal(null)}>
            Yay! →
          </button>
        </div>
      )}

      {/* Level-up celebration */}
      {levelUp && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-7 text-center"
          style={{ background: "rgba(17, 24, 39, 0.85)" }} onClick={() => setLevelUp(null)}>
          <div className="mb-4">
            <PetSprite species={pet.species} mood="ecstatic" stage={stage} size={120} animClass="avatar-party"/>
          </div>
          <h2 className="text-3xl font-black text-white mb-1 animate-pop">
            {levelUp.evolved ? `${pet.name} evolved!` : `🎂 ${pet.name} grew up!`} 🎉
          </h2>
          <p className="text-sm font-bold text-white/70 mb-6">
            {levelUp.evolved
              ? `Your buddy grew into a ${stageFromLevel(levelUp.level)} ${species.name.toLowerCase()}!`
              : `${pet.name} is now age ${levelUp.level}. Keep caring!`}
          </p>
          {levelUp.level === SPEECH_UNLOCK_LEVEL && stage !== "baby" && (
            <p className="text-sm font-black text-yellow-300 mb-4 animate-pop">
              💬 {pet.name} can now have real conversations with you!
            </p>
          )}
          <button type="button" className="px-8 py-3.5 rounded-2xl font-black text-base text-gray-900 bg-white active:scale-95 transition-transform"
            onClick={() => setLevelUp(null)}>
            Awesome! →
          </button>
        </div>
      )}
    </div>
  );
}
