"use client"

import Link from "next/link"
import PetSprite from "@/components/pet/PetSprite"
import { moodFor, levelFromXp, stageFromLevel, type Pet } from "@/lib/pet/logic"
import { PET_SPECIES } from "@/lib/pet/config"

interface Props {
  pet: Pet
  kidId: string
  accent: string
}

export default function PetWidget({ pet, kidId, accent }: Props) {
  const mood = moodFor(pet)
  const level = levelFromXp(pet.xp)
  const stage = stageFromLevel(level)
  const species = PET_SPECIES.find((s) => s.id === pet.species)

  // Pick the most critical stat for the nudge
  const minStat = Math.min(pet.hunger, pet.happiness, pet.energy, pet.cleanliness)
  const statColor = minStat > 60 ? "#22c55e" : minStat > 30 ? "#f59e0b" : "#ef4444"

  // Mini stat bars
  const stats = [
    { label: "🍎", value: pet.hunger },
    { label: "😊", value: pet.happiness },
    { label: "⚡", value: pet.energy },
    { label: "🛁", value: pet.cleanliness },
  ]

  return (
    <Link
      href={`/play/pet?kid=${kidId}`}
      className="block rounded-3xl overflow-hidden shadow-md active:scale-[0.98] transition-transform"
      style={{
        background: pet.isSleeping
          ? "linear-gradient(135deg, #1e1b4b, #312e81)"
          : "linear-gradient(135deg, #bae6fd 0%, #d9f99d 60%, #86efac 100%)",
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Pet sprite */}
        <div className="relative shrink-0">
          <PetSprite
            species={pet.species}
            mood={mood.id}
            stage={stage}
            size={72}
            animClass="avatar-idle"
          />
          {/* Mood badge */}
          <span
            className="absolute -bottom-1 -right-1 text-base leading-none rounded-full bg-white shadow-sm px-1"
            style={{ fontSize: 16 }}
          >
            {mood.emoji}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`font-black text-sm ${pet.isSleeping ? "text-blue-100" : "text-gray-900"} truncate`}>
              {pet.name}
            </span>
            <span
              className="text-[9px] font-black px-1.5 py-0.5 rounded-full text-white shrink-0"
              style={{ background: accent }}
            >
              Lv {level}
            </span>
            {species && (
              <span className={`text-[9px] font-bold shrink-0 ${pet.isSleeping ? "text-blue-200" : "text-gray-400"}`}>
                {species.name}
              </span>
            )}
          </div>

          {/* Mood message */}
          <p className={`text-[10px] font-bold mb-1.5 truncate ${pet.isSleeping ? "text-blue-200" : "text-gray-600"}`}>
            {mood.message}
          </p>

          {/* Mini stat bars */}
          <div className="grid grid-cols-4 gap-1">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-[9px] text-center mb-0.5 opacity-70">{s.label}</div>
                <div className={`h-1.5 rounded-full ${pet.isSleeping ? "bg-white/20" : "bg-black/10"} overflow-hidden`}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${s.value}%`,
                      background: s.value > 60 ? accent : s.value > 30 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Arrow */}
        <span className={`text-xl font-black shrink-0 ${pet.isSleeping ? "text-blue-300" : "text-gray-400"}`}>›</span>
      </div>

      {/* Critical warning strip */}
      {minStat < 30 && !pet.isSleeping && (
        <div
          className="px-4 py-1.5 text-center text-[10px] font-black text-white"
          style={{ background: statColor }}
        >
          ⚠️ {mood.message} Tap to help!
        </div>
      )}
    </Link>
  )
}
