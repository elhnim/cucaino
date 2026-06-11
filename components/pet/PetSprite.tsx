"use client"

import type { PetStage, PetMood } from "@/lib/pet/logic"

type MoodId = PetMood["id"]

// Face-style emoji make the best heads (full-body emoji like 🐕/🐈 read oddly
// on a drawn body). Elephant/hippo have no face emoji — theirs still read well.
const HEAD_EMOJI: Record<string, string> = {
  dragon: "🐲",
  kitten: "🐱",
  puppy: "🐶",
  bunny: "🐰",
  panda: "🐼",
  unicorn: "🦄",
  elephant: "🐘",
  lion: "🦁",
  hippo: "🦛",
  monkey: "🐵",
}

interface Props {
  species: string
  mood: MoodId
  stage: PetStage
  size?: number
  animClass?: string
}

// Per-species colour palettes (bodies match each emoji head)
const PAL: Record<string, { body: string; belly: string; accent: string; outline: string; eyeCol: string }> = {
  dragon:  { body: "#6ECC76", belly: "#B8E8BC", accent: "#3CAA44", outline: "#1E6622", eyeCol: "#1A3A1C" },
  kitten:  { body: "#F2A862", belly: "#FDE4C0", accent: "#E07030", outline: "#9A4418", eyeCol: "#2E120A" },
  puppy:   { body: "#C87040", belly: "#EAB87A", accent: "#9A4E20", outline: "#5A2A08", eyeCol: "#1C0800" },
  bunny:   { body: "#F5EFE7", belly: "#FDE8EC", accent: "#E8B8C4", outline: "#C07888", eyeCol: "#5A2A38" },
  panda:   { body: "#F8F8F8", belly: "#F0F0F0", accent: "#2E2E2E", outline: "#222",    eyeCol: "#1C1C1C" },
  unicorn: { body: "#CAB6FF", belly: "#E6DDFF", accent: "#8860E0", outline: "#5038B0", eyeCol: "#2A1660" },
  elephant:{ body: "#A8B8C8", belly: "#CDD9E4", accent: "#7E93A8", outline: "#4E6378", eyeCol: "#22303C" },
  lion:    { body: "#F0B954", belly: "#FAE0A8", accent: "#C97B2D", outline: "#8A5215", eyeCol: "#3A2208" },
  hippo:   { body: "#B49BC8", belly: "#D9CBE6", accent: "#8E6FA8", outline: "#5E4378", eyeCol: "#2E1F40" },
  monkey:  { body: "#A9745B", belly: "#EBD0AE", accent: "#7A4E38", outline: "#4E2E1E", eyeCol: "#2A1408" },
}
const DEFAULT_PAL = PAL.puppy

// ── Species-specific body shapes (tails, wings, manes — behind the body) ─────

function DragonExtras({ p, evolved }: { p: typeof DEFAULT_PAL; evolved: boolean }) {
  return (
    <>
      {/* Wings */}
      <path d="M56 148 Q30 120 22 148 Q38 158 56 158" fill={p.accent} opacity="0.85"/>
      <path d="M144 148 Q170 120 178 148 Q162 158 144 158" fill={p.accent} opacity="0.85"/>
      {/* Wing veins */}
      <path d="M56 152 Q42 136 28 148" stroke={p.outline} strokeWidth="1.5" fill="none" opacity="0.5"/>
      <path d="M144 152 Q158 136 172 148" stroke={p.outline} strokeWidth="1.5" fill="none" opacity="0.5"/>
      {evolved && (
        <>
          <path d="M56 142 Q22 106 18 138 Q34 150 56 148" fill={p.body} opacity="0.5"/>
          <path d="M144 142 Q178 106 182 138 Q166 150 144 148" fill={p.body} opacity="0.5"/>
        </>
      )}
    </>
  )
}

function KittenExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Tail — long curve behind body */}
      <path d="M145 185 Q185 160 188 190 Q188 215 160 210" stroke={p.body} strokeWidth="18" fill="none" strokeLinecap="round"/>
      <path d="M145 185 Q185 160 188 190 Q188 215 160 210" stroke={p.belly} strokeWidth="9" fill="none" strokeLinecap="round" opacity="0.6"/>
    </>
  )
}

function PuppyExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Short wagging tail */}
      <path d="M142 178 Q166 158 170 172 Q174 184 158 186" stroke={p.body} strokeWidth="16" fill="none" strokeLinecap="round"/>
    </>
  )
}

function BunnyExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Little round tail */}
      <circle cx="150" cy="192" r="14" fill={p.belly}/>
      <circle cx="150" cy="192" r="10" fill="white" opacity="0.7"/>
    </>
  )
}

function LionExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Tail with a tuft */}
      <path d="M145 185 Q180 170 182 195" stroke={p.body} strokeWidth="12" fill="none" strokeLinecap="round"/>
      <circle cx="183" cy="198" r="9" fill={p.accent}/>
    </>
  )
}

function MonkeyExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Curly tail */}
      <path d="M148 190 Q186 178 184 152 Q182 134 166 140 Q156 146 164 154" stroke={p.body} strokeWidth="11" fill="none" strokeLinecap="round"/>
    </>
  )
}

function UnicornExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Flowing mane behind body — multicolor */}
      <path d="M55 100 Q30 140 40 190 Q60 210 80 195 Q60 175 55 145 Q50 115 65 95 Z" fill="#FF9ECD" opacity="0.7"/>
      <path d="M52 105 Q28 145 38 185" stroke="#FFC0E0" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.8"/>
    </>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function PetSprite({ species, mood, stage, size = 180, animClass = "avatar-idle" }: Props) {
  const p = PAL[species] ?? DEFAULT_PAL
  const evolved = stage === "teen" || stage === "adult"
  const isBlack = species === "panda"
  const armColor = species === "panda" ? p.accent : p.body
  const legColor = species === "panda" ? p.accent : p.body
  const pawColor = species === "panda" ? "#5A5A5A" : p.belly

  // The head is the real emoji character — instantly cute, no drawn face
  const headEmoji = HEAD_EMOJI[species] ?? "🐶"

  return (
    <svg
      viewBox="0 0 200 240"
      width={size}
      height={size * 1.2}
      className={`inline-block select-none ${animClass}`}
      style={{ overflow: "visible" }}
      aria-hidden
    >
      {/* Drop shadow */}
      <ellipse cx="100" cy="235" rx="52" ry="9" fill="rgba(0,0,0,0.13)"/>

      {/* === Body-level species extras (wings, tail — behind body) === */}
      {species === "dragon"  && <DragonExtras p={p} evolved={evolved}/>}
      {species === "kitten"  && <KittenExtras p={p}/>}
      {species === "puppy"   && <PuppyExtras p={p}/>}
      {species === "bunny"   && <BunnyExtras p={p}/>}
      {species === "unicorn" && <UnicornExtras p={p}/>}
      {species === "lion"    && <LionExtras p={p}/>}
      {species === "monkey"  && <MonkeyExtras p={p}/>}

      {/* Torso */}
      <ellipse cx="100" cy="170" rx="50" ry="52" fill={p.body}/>
      {/* Belly spot */}
      <ellipse cx="100" cy="175" rx="32" ry="36" fill={p.belly}/>
      {/* Panda arm patches */}
      {isBlack && (
        <>
          <ellipse cx="56" cy="165" rx="22" ry="18" fill={p.accent} opacity="0.9"/>
          <ellipse cx="144" cy="165" rx="22" ry="18" fill={p.accent} opacity="0.9"/>
        </>
      )}

      {/* Arms */}
      <ellipse cx="54" cy="163" rx="20" ry="17" fill={armColor}/>
      <ellipse cx="146" cy="163" rx="20" ry="17" fill={armColor}/>
      {/* Paws */}
      <ellipse cx="40" cy="174" rx="13" ry="10" fill={pawColor}/>
      <ellipse cx="160" cy="174" rx="13" ry="10" fill={pawColor}/>
      {/* Paw toe lines */}
      <line x1="34" y1="176" x2="36" y2="180" stroke={p.outline} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
      <line x1="40" y1="178" x2="40" y2="182" stroke={p.outline} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
      <line x1="46" y1="176" x2="44" y2="180" stroke={p.outline} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
      <line x1="154" y1="176" x2="156" y2="180" stroke={p.outline} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
      <line x1="160" y1="178" x2="160" y2="182" stroke={p.outline} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
      <line x1="166" y1="176" x2="164" y2="180" stroke={p.outline} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>

      {/* Legs */}
      <ellipse cx="78" cy="212" rx="22" ry="17" fill={legColor}/>
      <ellipse cx="122" cy="212" rx="22" ry="17" fill={legColor}/>
      {/* Feet */}
      <ellipse cx="76" cy="224" rx="20" ry="10" fill={pawColor}/>
      <ellipse cx="124" cy="224" rx="20" ry="10" fill={pawColor}/>
      {/* Toe lines */}
      <line x1="62" y1="226" x2="64" y2="229" stroke={p.outline} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
      <line x1="76" y1="228" x2="76" y2="231" stroke={p.outline} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
      <line x1="90" y1="226" x2="88" y2="229" stroke={p.outline} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
      <line x1="110" y1="226" x2="112" y2="229" stroke={p.outline} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
      <line x1="124" y1="228" x2="124" y2="231" stroke={p.outline} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>
      <line x1="138" y1="226" x2="136" y2="229" stroke={p.outline} strokeWidth="1.5" opacity="0.3" strokeLinecap="round"/>

      {/* === Emoji head === */}
      <text x="100" y="136" textAnchor="middle" fontSize="94" style={{ userSelect: "none" }}>{headEmoji}</text>

      {/* Tiny mood overlays the emoji can't express */}
      {mood === "lonely" && <text x="64" y="126" fontSize="16">💧</text>}
      {mood === "ecstatic" && (
        <>
          <text x="52" y="78" fontSize="18">✨</text>
          <text x="132" y="66" fontSize="15">✨</text>
        </>
      )}
      {mood === "dirty" && <text x="130" y="80" fontSize="16">🫧</text>}
      {mood === "starving" && <text x="132" y="72" fontSize="16">🍽️</text>}
      {mood === "tired" && <text x="130" y="74" fontSize="16">🥱</text>}
      {mood === "sleeping" && <text x="130" y="72" fontSize="16">💤</text>}
    </svg>
  )
}
