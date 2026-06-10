"use client"

import { useEffect, useState } from "react"

interface Props {
  line: string | null
  accent: string
  /** auto-dismiss after this many ms (default 4000) */
  duration?: number
}

export default function PetSpeech({ line, accent, duration = 4000 }: Props) {
  const [visible, setVisible] = useState(false)
  const [text, setText] = useState("")

  useEffect(() => {
    if (!line) return
    setText(line)
    setVisible(true)
    const t = setTimeout(() => setVisible(false), duration)
    return () => clearTimeout(t)
  }, [line, duration])

  if (!visible || !text) return null

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-20 animate-pop pointer-events-none"
      style={{ bottom: "calc(100% + 4px)", minWidth: 160, maxWidth: 240 }}
    >
      <div
        className="relative rounded-2xl px-4 py-2.5 shadow-lg text-sm font-black text-white text-center leading-snug"
        style={{ background: accent }}
      >
        {text}
        {/* speech tail */}
        <svg
          className="absolute left-1/2 -translate-x-1/2 top-full"
          width="20" height="10" viewBox="0 0 20 10"
          aria-hidden
        >
          <polygon points="0,0 20,0 10,10" fill={accent}/>
        </svg>
      </div>
    </div>
  )
}
