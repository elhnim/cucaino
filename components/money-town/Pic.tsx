"use client"

import { useState } from "react"
import { JOBS, DEGREE_JOBS, ASSETS } from "@/lib/money-town/constants"
import type { ReelSegment } from "@/lib/money-town/types"

export type PicKind = 'job' | 'asset' | 'reel'

/** Reel/wheel segment symbols — the lever's 4 spin outcomes */
const REEL_EMOJI: Record<ReelSegment, string> = {
  'event':     '📋',
  'chance':    '🌟',
  'mini-game': '🎮',
  'big-event': '💥',
}

/** Reel segment id -> painted art file name (sym-<name>.webp) */
const REEL_FILE: Record<ReelSegment, string> = {
  'event':     'event',
  'chance':    'chance',
  'mini-game': 'minigame',
  'big-event': 'big',
}

interface Props {
  kind: PicKind
  /** job id, asset defId, or reel segment — looked up in the matching registry */
  id: string
  className?: string
}

/** The ONE place a job/asset/wheel symbol becomes a picture. Painted art
    (public/park-assets/games/money-town/) when it loads, falling back to the
    emoji if the file is missing or fails — every screen that shows a job,
    asset or reel symbol updates at once when the lookup tables here change. */
export default function Pic({ kind, id, className }: Props) {
  const [failed, setFailed] = useState(false)

  let emoji = '❓'
  let name = id
  if (kind === 'job') {
    const job = [...JOBS, ...DEGREE_JOBS].find(j => j.id === id)
    emoji = job?.emoji ?? emoji
    name = job?.name ?? id
  } else if (kind === 'asset') {
    const asset = ASSETS.find(a => a.id === id)
    emoji = asset?.emoji ?? emoji
    name = asset?.name ?? id
  } else if (kind === 'reel') {
    emoji = REEL_EMOJI[id as ReelSegment] ?? emoji
    name = id
  }

  if (failed) return <span className={className}>{emoji}</span>

  const file = kind === 'job' ? `job-${id}` : kind === 'asset' ? `asset-${id}` : `sym-${REEL_FILE[id as ReelSegment] ?? id}`

  return (
    <img
      src={`/park-assets/games/money-town/${file}.webp`}
      alt={name}
      draggable={false}
      loading="lazy"
      className={className}
      style={{ width: '1em', height: '1em', objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle' }}
      onError={() => setFailed(true)}
    />
  )
}
