"use client"

import type { PetStage, PetMood } from "@/lib/pet/logic"

type MoodId = PetMood["id"]

interface Props {
  species: string
  mood: MoodId
  stage: PetStage
  size?: number
  animClass?: string
}

// Per-species colour palettes
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

// ── Face sub-components ──────────────────────────────────────────────────────

function Eyes({ mood, p }: { mood: MoodId; p: typeof DEFAULT_PAL }) {
  const c = p.eyeCol
  // sleeping — curved lines
  if (mood === "sleeping") return (
    <g>
      <path d="M75 102 Q83 96 91 102" stroke={c} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
      <path d="M109 102 Q117 96 125 102" stroke={c} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
    </g>
  )
  // ecstatic — star-sparkle eyes
  if (mood === "ecstatic") return (
    <g>
      <text x="83" y="108" textAnchor="middle" fontSize="16" fill="#F5C518">★</text>
      <text x="117" y="108" textAnchor="middle" fontSize="16" fill="#F5C518">★</text>
      {/* sparkle dots */}
      <circle cx="70" cy="95" r="2.5" fill="#FFD700" opacity="0.8"/>
      <circle cx="130" cy="95" r="2.5" fill="#FFD700" opacity="0.8"/>
    </g>
  )
  // tired — half-closed eyes via clip
  if (mood === "tired") return (
    <g>
      <ellipse cx="83" cy="104" rx="11" ry="11" fill="white" stroke={c} strokeWidth="1.5"/>
      <ellipse cx="117" cy="104" rx="11" ry="11" fill="white" stroke={c} strokeWidth="1.5"/>
      {/* covering rect to make half-closed look */}
      <rect x="72" y="93" width="22" height="11" fill={p.body}/>
      <rect x="106" y="93" width="22" height="11" fill={p.body}/>
      <ellipse cx="83" cy="108" rx="7" ry="7" fill={c}/>
      <ellipse cx="117" cy="108" rx="7" ry="7" fill={c}/>
      <circle cx="85" cy="106" r="2" fill="white"/>
      <circle cx="119" cy="106" r="2" fill="white"/>
      {/* heavy eyelid line */}
      <path d="M72 104 Q83 99 94 104" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round"/>
      <path d="M106 104 Q117 99 128 104" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round"/>
    </g>
  )
  // hungry — normal but with concerned brows
  if (mood === "starving") return (
    <g>
      <ellipse cx="83" cy="102" rx="11" ry="12" fill="white"/>
      <ellipse cx="117" cy="102" rx="11" ry="12" fill="white"/>
      <ellipse cx="83" cy="104" rx="7.5" ry="8" fill={c}/>
      <ellipse cx="117" cy="104" rx="7.5" ry="8" fill={c}/>
      <circle cx="85.5" cy="101" r="2.5" fill="white"/>
      <circle cx="119.5" cy="101" r="2.5" fill="white"/>
      {/* worried inward brows */}
      <path d="M74 91 Q83 86 92 90" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round"/>
      <path d="M108 90 Q117 86 126 91" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round"/>
    </g>
  )
  // lonely — sad eyes
  if (mood === "lonely") return (
    <g>
      <ellipse cx="83" cy="104" rx="11" ry="11" fill="white"/>
      <ellipse cx="117" cy="104" rx="11" ry="11" fill="white"/>
      <ellipse cx="83" cy="106" rx="7" ry="7" fill={c}/>
      <ellipse cx="117" cy="106" rx="7" ry="7" fill={c}/>
      <circle cx="85" cy="104" r="2" fill="white"/>
      <circle cx="119" cy="104" r="2" fill="white"/>
      {/* droopy brows */}
      <path d="M74 92 Q83 89 92 93" stroke={c} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M108 93 Q117 89 126 92" stroke={c} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      {/* tear drops */}
      <ellipse cx="80" cy="117" rx="3" ry="4" fill="#90CAF9" opacity="0.8"/>
      <ellipse cx="120" cy="117" rx="3" ry="4" fill="#90CAF9" opacity="0.8"/>
    </g>
  )
  // dirty — squiggly, uncomfortable
  if (mood === "dirty") return (
    <g>
      <ellipse cx="83" cy="102" rx="11" ry="11" fill="white"/>
      <ellipse cx="117" cy="102" rx="11" ry="11" fill="white"/>
      <ellipse cx="83" cy="103" rx="7" ry="7" fill={c}/>
      <ellipse cx="117" cy="103" rx="7" ry="7" fill={c}/>
      <circle cx="85" cy="101" r="2" fill="white"/>
      <circle cx="119" cy="101" r="2" fill="white"/>
      {/* stink squiggles */}
      <path d="M74 89 Q77 86 80 89 Q83 92 86 89 Q89 86 92 89" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M108 89 Q111 86 114 89 Q117 92 120 89 Q123 86 126 89" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round"/>
    </g>
  )
  // happy (default)
  return (
    <g>
      <ellipse cx="83" cy="102" rx="12" ry="13" fill="white"/>
      <ellipse cx="117" cy="102" rx="12" ry="13" fill="white"/>
      <ellipse cx="83" cy="103" rx="8" ry="8.5" fill={c}/>
      <ellipse cx="117" cy="103" rx="8" ry="8.5" fill={c}/>
      <circle cx="86" cy="100" r="3" fill="white"/>
      <circle cx="120" cy="100" r="3" fill="white"/>
    </g>
  )
}

function Mouth({ mood }: { mood: MoodId }) {
  // Mouths sit lower on the chin (the face has plenty of room below the nose)
  // and are deliberately small — big high mouths read as creepy.
  if (mood === "sleeping") return (
    <path d="M93 128 Q100 130 107 128" stroke="#AAAAAA" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
  )
  if (mood === "ecstatic") return (
    <g>
      <path d="M88 126 Q100 136 112 126" stroke="#E06080" strokeWidth="3" fill="#FFB3C8" strokeLinecap="round" strokeLinejoin="round"/>
      <ellipse cx="76" cy="124" rx="6.5" ry="5" fill="#FFB8D0" opacity="0.75"/>
      <ellipse cx="124" cy="124" rx="6.5" ry="5" fill="#FFB8D0" opacity="0.75"/>
    </g>
  )
  if (mood === "starving") return (
    <g>
      <path d="M90 127 Q100 134 110 127" stroke="#E08090" strokeWidth="2.5" fill="#FFD0D8" strokeLinecap="round"/>
      {/* tongue peeking out */}
      <ellipse cx="100" cy="132" rx="5" ry="3.5" fill="#FF8090"/>
    </g>
  )
  if (mood === "tired") return (
    <path d="M93 128 Q100 126 107 128" stroke="#BBBBBB" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
  )
  if (mood === "lonely") return (
    <path d="M91 131 Q100 126 109 131" stroke="#AAAAAA" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
  )
  if (mood === "dirty") return (
    <path d="M91 129 Q100 125 109 129" stroke="#AAAAAA" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
  )
  // happy default
  return (
    <g>
      <path d="M89 126 Q100 134 111 126" stroke="#E06080" strokeWidth="2.5" fill="#FFB3C8" strokeLinecap="round"/>
      <ellipse cx="78" cy="124" rx="5.5" ry="4.5" fill="#FFB8D0" opacity="0.65"/>
      <ellipse cx="122" cy="124" rx="5.5" ry="4.5" fill="#FFB8D0" opacity="0.65"/>
    </g>
  )
}

function Nose({ p }: { p: typeof DEFAULT_PAL }) {
  return <ellipse cx="100" cy="113" rx="4" ry="3" fill={p.accent} opacity="0.8"/>
}

// ── Species-specific shapes ──────────────────────────────────────────────────

function DragonExtras({ p, evolved }: { p: typeof DEFAULT_PAL; evolved: boolean }) {
  return (
    <>
      {/* Tail (behind body, drawn first via parent order) */}
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

function DragonHeadExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Horns */}
      <polygon points="82,54 76,28 88,28" fill={p.accent}/>
      <polygon points="118,54 112,28 124,28" fill={p.accent}/>
      {/* Horn highlight */}
      <line x1="80" y1="52" x2="78" y2="36" stroke="white" strokeWidth="2" opacity="0.5" strokeLinecap="round"/>
      <line x1="120" y1="52" x2="118" y2="36" stroke="white" strokeWidth="2" opacity="0.5" strokeLinecap="round"/>
      {/* Nostril dots */}
      <circle cx="96" cy="117" r="2" fill={p.outline} opacity="0.4"/>
      <circle cx="104" cy="117" r="2" fill={p.outline} opacity="0.4"/>
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

function KittenHeadExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Ears — triangles with pink inner */}
      <polygon points="72,62 64,32 90,48" fill={p.body}/>
      <polygon points="128,62 136,32 110,48" fill={p.body}/>
      <polygon points="74,59 68,38 88,50" fill="#F9C0C0"/>
      <polygon points="126,59 132,38 112,50" fill="#F9C0C0"/>
      {/* Whiskers are drawn in the main component AFTER the head so they
          stick out visibly from the cheeks (here they'd be painted over). */}
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

function PuppyHeadExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Proper floppy ears — hang OUTSIDE the head silhouette, drooping beside the face */}
      <ellipse cx="50" cy="92" rx="13" ry="30" fill={p.accent} transform="rotate(18 50 92)"/>
      <ellipse cx="150" cy="92" rx="13" ry="30" fill={p.accent} transform="rotate(-18 150 92)"/>
      {/* Ear inner highlight */}
      <ellipse cx="48" cy="96" rx="6" ry="20" fill={p.body} opacity="0.35" transform="rotate(18 48 96)"/>
      <ellipse cx="152" cy="96" rx="6" ry="20" fill={p.body} opacity="0.35" transform="rotate(-18 152 96)"/>
      {/* Eye spot */}
      <ellipse cx="118" cy="96" rx="16" ry="14" fill={p.accent} opacity="0.55"/>
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

function BunnyHeadExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Long tall ears */}
      <ellipse cx="82" cy="40" rx="16" ry="38" fill={p.body}/>
      <ellipse cx="118" cy="40" rx="16" ry="38" fill={p.body}/>
      {/* Pink inner ear */}
      <ellipse cx="82" cy="40" rx="9" ry="28" fill="#F9C8D0"/>
      <ellipse cx="118" cy="40" rx="9" ry="28" fill="#F9C8D0"/>
    </>
  )
}

function PandaExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return null // panda's body spots are on the body itself
}

function PandaHeadExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Round ears — soft charcoal circles */}
      <circle cx="74" cy="58" r="22" fill={p.accent}/>
      <circle cx="126" cy="58" r="22" fill={p.accent}/>
      {/* Ear inner highlight */}
      <circle cx="74" cy="58" r="13" fill="#4D4D4D"/>
      <circle cx="126" cy="58" r="13" fill="#4D4D4D"/>
      {/* NOTE: eye patches are drawn in the main component AFTER the head
          circle — drawn here they'd be hidden behind it. */}
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

function LionHeadExtras({ p }: { p: typeof DEFAULT_PAL }) {
  // Scalloped mane — a ring of circles the head overlaps
  const petals = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2
    return { x: 100 + Math.cos(a) * 50, y: 100 + Math.sin(a) * 50 }
  })
  return (
    <>
      {petals.map((pt, i) => (
        <circle key={i} cx={pt.x.toFixed(1)} cy={pt.y.toFixed(1)} r="17" fill={p.accent}/>
      ))}
      {/* Little ears poking above the mane */}
      <circle cx="68" cy="50" r="12" fill={p.body}/>
      <circle cx="132" cy="50" r="12" fill={p.body}/>
      <circle cx="68" cy="50" r="6.5" fill="#F9C0C0"/>
      <circle cx="132" cy="50" r="6.5" fill="#F9C0C0"/>
    </>
  )
}

function ElephantHeadExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Big floppy ears behind the head */}
      <ellipse cx="50" cy="94" rx="27" ry="33" fill={p.body}/>
      <ellipse cx="150" cy="94" rx="27" ry="33" fill={p.body}/>
      <ellipse cx="48" cy="96" rx="18" ry="24" fill={p.belly} opacity="0.85"/>
      <ellipse cx="152" cy="96" rx="18" ry="24" fill={p.belly} opacity="0.85"/>
    </>
  )
}

function HippoHeadExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Tiny round ears */}
      <circle cx="76" cy="52" r="11" fill={p.body}/>
      <circle cx="124" cy="52" r="11" fill={p.body}/>
      <circle cx="76" cy="52" r="5.5" fill="#E8B8C8"/>
      <circle cx="124" cy="52" r="5.5" fill="#E8B8C8"/>
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

function MonkeyHeadExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Big round ears on the sides */}
      <circle cx="52" cy="92" r="15" fill={p.body}/>
      <circle cx="148" cy="92" r="15" fill={p.body}/>
      <circle cx="52" cy="92" r="8" fill={p.belly}/>
      <circle cx="148" cy="92" r="8" fill={p.belly}/>
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

function UnicornHeadExtras({ p }: { p: typeof DEFAULT_PAL }) {
  return (
    <>
      {/* Small ears */}
      <polygon points="80,55 74,32 90,44" fill={p.body}/>
      <polygon points="120,55 126,32 110,44" fill={p.body}/>
      <polygon points="81,52 76,36 88,46" fill="#FFC0E8"/>
      <polygon points="119,52 124,36 112,46" fill="#FFC0E8"/>
      {/* Horn — spiral/striped */}
      <polygon points="100,20 90,58 110,58" fill="url(#hornGrad)"/>
      <defs>
        <linearGradient id="hornGrad" x1="100" y1="20" x2="100" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFD700"/>
          <stop offset="50%" stopColor="#FF90C0"/>
          <stop offset="100%" stopColor={p.accent}/>
        </linearGradient>
      </defs>
      {/* Horn stripes */}
      <line x1="96" y1="56" x2="92" y2="36" stroke="white" strokeWidth="2" opacity="0.5" strokeLinecap="round"/>
      {/* Mane on head */}
      <path d="M58 72 Q48 90 52 115 Q62 120 68 105 Q64 90 68 72 Z" fill="#FF9ECD" opacity="0.8"/>
      <path d="M60 76 Q50 95 56 116" stroke="#FFAAD8" strokeWidth="6" fill="none" strokeLinecap="round"/>
      {/* Sparkles */}
      <text x="138" y="74" fontSize="12" fill="#FFD700" opacity="0.9">✦</text>
      <text x="150" y="90" fontSize="9" fill="#C8B0FF" opacity="0.8">✦</text>
      <text x="42" y="80" fontSize="8" fill="#FFD700" opacity="0.7">✦</text>
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

      {/* === Ears (drawn before head so head overlaps base of ear) === */}
      {species === "dragon"  && <DragonHeadExtras  p={p}/>}
      {species === "kitten"  && <KittenHeadExtras  p={p}/>}
      {species === "puppy"   && <PuppyHeadExtras   p={p}/>}
      {species === "bunny"   && <BunnyHeadExtras   p={p}/>}
      {species === "panda"   && <PandaHeadExtras   p={p}/>}
      {species === "unicorn" && <UnicornHeadExtras p={p}/>}
      {species === "lion"    && <LionHeadExtras    p={p}/>}
      {species === "elephant" && <ElephantHeadExtras p={p}/>}
      {species === "hippo"   && <HippoHeadExtras   p={p}/>}
      {species === "monkey"  && <MonkeyHeadExtras  p={p}/>}

      {/* Head */}
      <circle cx="100" cy="100" r="52" fill={p.body}/>
      {/* Panda eye patches — tilted charcoal ovals behind the eyes */}
      {isBlack && (
        <>
          <ellipse cx="83" cy="101" rx="16" ry="18" fill={p.accent} transform="rotate(-12 83 101)"/>
          <ellipse cx="117" cy="101" rx="16" ry="18" fill={p.accent} transform="rotate(12 117 101)"/>
        </>
      )}
      {/* Kitten whiskers + forehead tabby stripes — on top of the head circle */}
      {species === "kitten" && (
        <>
          <g stroke={p.outline} strokeWidth="2" opacity="0.7" strokeLinecap="round" fill="none">
            <line x1="34" y1="102" x2="80" y2="108"/>
            <line x1="30" y1="114" x2="80" y2="114"/>
            <line x1="34" y1="126" x2="80" y2="120"/>
            <line x1="120" y1="108" x2="166" y2="102"/>
            <line x1="120" y1="114" x2="170" y2="114"/>
            <line x1="120" y1="120" x2="166" y2="126"/>
          </g>
          <g stroke={p.accent} strokeWidth="3" opacity="0.8" strokeLinecap="round" fill="none">
            <path d="M92 54 Q93 62 92 68"/>
            <path d="M100 52 Q101 61 100 68"/>
            <path d="M108 54 Q107 62 108 68"/>
          </g>
        </>
      )}

      {/* Monkey face patch — lighter tan around the eyes and muzzle */}
      {species === "monkey" && (
        <>
          <circle cx="84" cy="100" r="19" fill={p.belly}/>
          <circle cx="116" cy="100" r="19" fill={p.belly}/>
          <ellipse cx="100" cy="118" rx="22" ry="17" fill={p.belly}/>
        </>
      )}

      {/* Hippo muzzle — wide snout with nostrils, sits under the eyes */}
      {species === "hippo" && (
        <>
          <ellipse cx="100" cy="118" rx="27" ry="17" fill={p.belly}/>
          <ellipse cx="91" cy="113" rx="3.5" ry="4.5" fill={p.accent} opacity="0.65"/>
          <ellipse cx="109" cy="113" rx="3.5" ry="4.5" fill={p.accent} opacity="0.65"/>
        </>
      )}

      {/* Face — eyes + nose + mouth (hippo's nostrils / elephant's trunk replace the nose) */}
      {species !== "hippo" && species !== "elephant" && <Nose p={p}/>}
      {/* Elephant trunk — short, hangs from the face centre */}
      {species === "elephant" && (
        <g>
          <path d="M100 106 Q102 113 100 121" stroke={p.body} strokeWidth="14" fill="none" strokeLinecap="round"/>
          <path d="M96 110 Q98 113 96 117" stroke={p.outline} strokeWidth="1.5" fill="none" opacity="0.3" strokeLinecap="round"/>
          <ellipse cx="100" cy="121" rx="6.5" ry="4" fill={p.accent} opacity="0.75"/>
        </g>
      )}
      <Eyes mood={mood} p={p}/>
      <Mouth mood={mood}/>

      {/* Head shine */}
      <ellipse cx="84" cy="70" rx="16" ry="10" fill="white" opacity="0.18" transform="rotate(-30 84 70)"/>
    </svg>
  )
}
