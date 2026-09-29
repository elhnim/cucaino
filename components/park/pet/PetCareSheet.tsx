"use client";

// Pet Meadow screens. Every care action uses the real Star Pets server actions (same rules,
// costs, decay and XP as before) and triggers a 3D reaction in the park through `fx`:
// the pet walks to the station, eats / splashes / sleeps / dances and says something.
import { useState } from "react";
import { adoptPet, buyAccessory, claimDailyGift, feedPet, learnTrick, performTrick, toggleSleep, washPet, cuddlePet } from "@/lib/actions/pet";
import { PET_ACCESSORIES, PET_FOODS, PET_PERSONALITIES, PET_SPECIES, PET_TRICKS, PLAY_COST, WASH_COST } from "@/lib/pet/config";
import { getPetSpeech, levelFromXp, moodFor, stageFromLevel, xpForLevel, type Pet, type SpeechAction } from "@/lib/pet/logic";
import { playSfx } from "@/lib/audio/sound-manager";
import { CandySheet, CandyButton } from "../ui/CandySheet";
import { C, FONT, alpha, cardStyle, display } from "../ui/theme";
import { ProgressBar } from "../ui/ProgressBar";
import { Badge } from "../ui/Badge";
import { IconChip } from "../ui/IconChip";
import { ChibiPortrait } from "../ui/ChibiPortrait";
import { parkAnimalForPet } from "@/lib/park/registry/animals";

export type PetMode = "home" | "feed" | "wash" | "sleep" | "tricks" | "fetch";

export interface PetFx {
  /** walk the pet to the station for this mode, then play its animation */
  react: (mode: PetMode, anim: string) => Promise<void>;
  say: (text: string) => void;
  status: (pet: Pet) => void;
  sleep: (on: boolean) => void;
  celebrate: () => void;
}

const TITLES: Record<PetMode, [string, string]> = {
  home: ["🏡 Pet House", "#ff8a3d"],
  feed: ["🍎 Snack Bar", "#2fcf8f"],
  wash: ["🛁 Bubble Bath", "#36b8ff"],
  sleep: ["🛏️ Cosy Bed", "#a96bff"],
  tricks: ["🌟 Trick Stage", "#ff5fa8"],
  fetch: ["🎾 Fetch Field", "#f5b400"],
};

export function PetCareSheet({
  kidId,
  pet,
  mode,
  points,
  onPet,
  onStartFetch,
  onClose,
  fx,
}: {
  kidId: string;
  pet: Pet | null;
  mode: PetMode;
  points: number;
  onPet: (pet: Pet, points: number) => void;
  onStartFetch: () => void;
  onClose: () => void;
  fx: PetFx;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [title, color] = TITLES[pet ? mode : "home"];

  if (!pet) return <AdoptSheet kidId={kidId} onPet={onPet} onClose={onClose} />;

  const level = levelFromXp(pet.xp);
  const stage = stageFromLevel(level);
  const mood = moodFor(pet);
  const species = PET_SPECIES.find((s) => s.id === pet.species);
  const speak = (action: SpeechAction, fallback: string) => {
    const line = getPetSpeech(pet.species, pet.personalities, action, level, stage) ?? fallback;
    fx.say(line);
  };

  const run = async (
    fn: () => Promise<{ ok: true; pet: Pet; pointsBalance: number } | { ok: false; error: string }>,
    react: { anim: string; action: SpeechAction; fallback: string; sfx?: Parameters<typeof playSfx>[0] },
  ) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      playSfx("wrong");
      return;
    }
    onPet(res.pet, res.pointsBalance);
    fx.status(res.pet);
    playSfx(react.sfx ?? "sparkle");
    await fx.react(mode, react.anim);
    speak(react.action, react.fallback);
    if (levelFromXp(res.pet.xp) > level) {
      fx.celebrate();
      setMsg(`🎉 ${pet.name} grew to level ${levelFromXp(res.pet.xp)}!`);
      playSfx("win");
    }
  };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <IconChip color={color} size={64} round style={{ fontSize: 38, overflow: "hidden" }}>
        {/* the same chibi that walks around the park (emoji only if WebGL is unavailable) */}
        <ChibiPortrait
          id={parkAnimalForPet(pet.species)}
          framing="head"
          pose={pet.isSleeping ? "sleep" : mood.id === "ecstatic" ? "cheer" : mood.id === "happy" ? "idle" : "sad"}
          width={60}
          fallback={stage === "teen" || stage === "adult" ? species?.adultEmoji : species?.babyEmoji}
        />
      </IconChip>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={display(20)}>{pet.name}</span>
          <Badge color={C.cyan}>Lv {level}</Badge>
        </div>
        <div style={{ fontWeight: 800, fontSize: 13, color: C.dim }}>{mood.emoji} {mood.message}</div>
        <XpBar xp={pet.xp} level={level} />
      </div>
      <Badge color={C.gold}>⭐ {points}</Badge>
    </div>
  );

  let body: React.ReactNode = null;
  if (mode === "feed") {
    body = (
      <Grid>
        {PET_FOODS.map((f) => (
          <Tile key={f.id} emoji={f.emoji} name={f.label} cost={f.starCost} note={`+${f.hunger} food${f.happiness ? ` · +${f.happiness} fun` : ""}`} disabled={busy || pet.isSleeping}
            onClick={() => run(() => feedPet(kidId, f.id), { anim: "eat", action: "feed", fallback: "Nom nom! 😋", sfx: "coin" })} />
        ))}
      </Grid>
    );
  } else if (mode === "wash") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <Stat label="🫧 Clean" value={pet.cleanliness} color="#7be0b0" />
        <CandyButton color="#36b8ff" disabled={busy || pet.isSleeping || pet.cleanliness >= 95} onClick={() => run(() => washPet(kidId), { anim: "dance", action: "wash", fallback: "So sparkly! ✨" })}>
          🛁 Bubble bath · ⭐ {WASH_COST}
        </CandyButton>
        <CandyButton color="#ff7fbd" disabled={busy || pet.isSleeping} onClick={() => run(() => cuddlePet(kidId), { anim: "gesture-positive", action: "cuddle", fallback: "I love you! 💖" })}>
          🤗 Cuddle · free
        </CandyButton>
      </div>
    );
  } else if (mode === "sleep") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <Stat label="⚡ Energy" value={pet.energy} color="#4cc9ff" />
        <CandyButton
          color="#a96bff"
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            const res = await toggleSleep(kidId);
            setBusy(false);
            if (!res.ok) return setMsg(res.error);
            onPet(res.pet, res.pointsBalance);
            fx.status(res.pet);
            fx.sleep(res.pet.isSleeping);
            playSfx(res.pet.isSleeping ? "sleep" : "wake");
            if (!res.pet.isSleeping) speak("idle", "Good morning! ☀️");
          }}
        >
          {pet.isSleeping ? "☀️ Wake up" : "🌙 Time for a nap"}
        </CandyButton>
        <p style={{ fontWeight: 800, color: C.dim, textAlign: "center", margin: 0 }}>Sleeping pets get their energy back — perfect for bedtime!</p>
      </div>
    );
  } else if (mode === "tricks") {
    body = (
      <Grid>
        {PET_TRICKS.map((t) => {
          const known = pet.tricks.includes(t.id);
          const locked = level < t.minLevel;
          return (
            <Tile
              key={t.id}
              emoji={locked ? "🔒" : t.emoji}
              name={t.label}
              cost={known ? undefined : t.starCost}
              note={known ? "Tap to perform!" : locked ? `Level ${t.minLevel}` : "Learn it"}
              disabled={busy || locked || pet.isSleeping}
              onClick={() =>
                known
                  ? run(() => performTrick(kidId, t.id), { anim: "dance", action: "trick", fallback: `Ta-da! ${t.emoji}`, sfx: "win" })
                  : run(() => learnTrick(kidId, t.id), { anim: "gesture-positive", action: "trick", fallback: `I learned ${t.label}! ${t.emoji}` })
              }
            />
          );
        })}
      </Grid>
    );
  } else if (mode === "fetch") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}>
        <Stat label="⚡ Energy" value={pet.energy} color="#4cc9ff" />
        <p style={{ fontWeight: 800, color: C.dim, margin: 0 }}>Tap anywhere on the field to throw the ball. How many can {pet.name} catch in 15 seconds?</p>
        <CandyButton color="#f5b400" disabled={pet.isSleeping || pet.energy < 10} onClick={onStartFetch}>
          🎾 Play fetch · ⭐ {PLAY_COST}
        </CandyButton>
        {pet.energy < 10 && <p style={{ fontWeight: 800, color: "#ff9aa8", margin: 0 }}>Too tired — let {pet.name} nap first 💤</p>}
      </div>
    );
  } else {
    // Pet House: all stats, daily gift and the accessory shop
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Stat label="🍎 Food" value={pet.hunger} color="#ff6b8a" />
          <Stat label="😊 Fun" value={pet.happiness} color="#ffc83d" />
          <Stat label="⚡ Energy" value={pet.energy} color="#4cc9ff" />
          <Stat label="🫧 Clean" value={pet.cleanliness} color="#7be0b0" />
        </div>
        <div style={{ fontWeight: 800, color: C.dim }}>🔥 Care streak: {pet.careStreak} day{pet.careStreak === 1 ? "" : "s"} · the Snack Bar, Bubble Bath, Cosy Bed, Fetch Field and Trick Stage are all here in the meadow!</div>
        <CandyButton
          color="#ff8a3d"
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            const res = await claimDailyGift(kidId);
            setBusy(false);
            if (!res.ok) return setMsg(res.error);
            onPet(res.pet, res.pointsBalance);
            fx.status(res.pet);
            fx.celebrate();
            playSfx("win");
            const r = res.reward;
            setMsg(
              r.kind === "accessory"
                ? `🎁 A new ${PET_ACCESSORIES.find((a) => a.id === r.accessoryId)?.label ?? "toy"}!`
                : r.kind === "xp"
                  ? `🎁 +${r.amount} XP!`
                  : r.kind === "happiness"
                    ? `🎁 +${r.amount} fun!`
                    : `🎁 +${r.amount} energy!`,
            );
            speak("gift", "A present! 🎁");
          }}
        >
          🎁 {pet.name}&apos;s daily gift
        </CandyButton>
        <div style={{ fontFamily: FONT.display, fontWeight: 400, color: C.gold, fontSize: 14, textTransform: "uppercase", letterSpacing: 1.2 }}>🛍️ Toys & outfits</div>
        <Grid>
          {PET_ACCESSORIES.map((a) => {
            const owned = pet.accessories.includes(a.id);
            const locked = level < a.minLevel;
            return (
              <Tile
                key={a.id}
                emoji={locked ? "🔒" : a.emoji}
                name={a.label}
                cost={owned ? undefined : a.starCost}
                note={owned ? "Owned ✓" : locked ? `Level ${a.minLevel}` : undefined}
                disabled={busy || owned || locked}
                onClick={() => run(() => buyAccessory(kidId, a.id), { anim: "dance", action: "gift", fallback: `I love my ${a.label}! ${a.emoji}`, sfx: "coin" })}
              />
            );
          })}
        </Grid>
      </div>
    );
  }

  return (
    <CandySheet title={title} color={color} onClose={onClose}>
      {header}
      {msg && <div style={msgStyle}>{msg}</div>}
      {pet.isSleeping && mode !== "sleep" && <div style={msgStyle}>💤 {pet.name} is asleep — visit the Cosy Bed to wake them.</div>}
      {body}
    </CandySheet>
  );
}

function AdoptSheet({ kidId, onPet, onClose }: { kidId: string; onPet: (p: Pet, pts: number) => void; onClose: () => void }) {
  const [species, setSpecies] = useState<string | null>(null);
  const [traits, setTraits] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (id: string) => setTraits((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length < 3 ? [...t, id] : t));
  return (
    <CandySheet title="🥚 Adopt a pet!" subtitle="Your very own friend for the park" color="#ff8a3d" onClose={onClose}>
      <div style={{ ...display(16, C.gold), marginBottom: 8 }}>1. Pick your pet</div>
      <Grid>
        {PET_SPECIES.map((s) => (
          <button key={s.id} type="button" onClick={() => setSpecies(s.id)} className="gp-press" style={{ ...tile, ...(species === s.id ? { borderColor: C.gold, boxShadow: `0 0 16px ${alpha(C.gold, 0.55)}` } : null) }}>
            <div style={{ fontSize: 36, height: 72, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <ChibiPortrait id={parkAnimalForPet(s.id)} pose={species === s.id ? "cheer" : "idle"} width={64} height={72} fallback={s.babyEmoji} style={{ filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.35))" }} />
            </div>
            <div style={{ fontWeight: 900, fontSize: 13, color: C.text }}>{s.name}</div>
          </button>
        ))}
      </Grid>
      <div style={{ ...display(16, C.gold), margin: "16px 0 8px" }}>2. Pick 3 personalities ({traits.length}/3)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {PET_PERSONALITIES.map((p) => (
          <button key={p.id} type="button" onClick={() => toggle(p.id)} className="gp-press" style={{ ...chip, background: traits.includes(p.id) ? alpha(C.gold, 0.2) : "rgba(255,255,255,0.05)", borderColor: traits.includes(p.id) ? C.gold : "rgba(160,190,255,0.25)", color: traits.includes(p.id) ? C.goldHi : C.text }}>
            {p.emoji} {p.label}
          </button>
        ))}
      </div>
      <div style={{ ...display(16, C.gold), margin: "16px 0 8px" }}>3. Give them a name</div>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="e.g. Sprinkles" style={input} />
      {err && <div style={{ ...msgStyle, marginTop: 10 }}>{err}</div>}
      <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
        <CandyButton
          color="#ff8a3d"
          disabled={busy || !species || traits.length !== 3 || !name.trim()}
          onClick={async () => {
            if (!species) return;
            setBusy(true);
            const res = await adoptPet(kidId, species, name, traits);
            setBusy(false);
            if (!res.ok) return setErr(res.error);
            playSfx("win");
            onPet(res.pet, res.pointsBalance);
          }}
        >
          🎉 Adopt!
        </CandyButton>
      </div>
    </CandySheet>
  );
}

function XpBar({ xp, level }: { xp: number; level: number }) {
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  const k = to > from ? (xp - from) / (to - from) : 1;
  return (
    <ProgressBar value={Math.max(0.04, Math.min(1, k))} color={C.cyan} to="#d8fbff" height={7} style={{ marginTop: 6, maxWidth: 220 }} />
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ width: "100%" }}>
      <div style={{ fontWeight: 900, fontSize: 13, color: C.text, marginBottom: 4 }}>
        {label} <span style={{ color: value < 30 ? "#ff9aa8" : C.dim }}>· {Math.round(value)}</span>
      </div>
      <ProgressBar value={Math.max(0.03, Math.min(100, value) / 100)} color={value < 30 ? C.danger : color} to={value < 30 ? "#ffb3bd" : undefined} height={11} />
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 10 }}>{children}</div>;
}

function Tile({ emoji, name, cost, note, disabled, onClick }: { emoji: string; name: string; cost?: number; note?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="gp-press" style={{ ...tile, opacity: disabled ? 0.5 : 1 }}>
      <div style={{ fontSize: 36, lineHeight: 1, filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.4))" }}>{emoji}</div>
      <div style={{ fontWeight: 900, fontSize: 13, color: C.text, marginTop: 4 }}>{name}</div>
      {cost !== undefined && <div style={{ fontWeight: 900, fontSize: 12, color: C.gold }}>⭐ {cost}</div>}
      {note && <div style={{ fontWeight: 800, fontSize: 11, color: C.dim }}>{note}</div>}
    </button>
  );
}

const tile: React.CSSProperties = {
  border: "1.5px solid rgba(160,190,255,0.22)",
  borderRadius: 16,
  padding: "12px 6px",
  minHeight: 96,
  background: "radial-gradient(circle at 50% 25%, rgba(90,86,170,0.5), rgba(24,22,60,0.85) 75%)",
  boxShadow: "0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
  cursor: "pointer",
  textAlign: "center",
  color: C.text,
};
const chip: React.CSSProperties = { border: "1.5px solid", borderRadius: 999, minHeight: 44, padding: "0 14px", fontWeight: 900, cursor: "pointer" };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 48, borderRadius: 14, border: `1.5px solid ${alpha(C.cyan, 0.45)}`, padding: "10px 14px", fontWeight: 800, fontSize: 16, color: C.text, background: "rgba(0,0,0,0.3)", outline: "none" };
const msgStyle: React.CSSProperties = { ...cardStyle(C.cyan, "rgba(18,40,70,0.8)"), padding: "8px 12px", fontWeight: 900, color: C.text, marginBottom: 10, textAlign: "center" };
