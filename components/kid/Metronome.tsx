"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drift-free metronome using Web Audio scheduling.
 *
 * The audio uses oscillators scheduled ahead of time (lookAhead=25ms,
 * scheduleAhead=100ms) so timing is sample-accurate, not setTimeout-jittery.
 * Visual pulses are aligned to audio time via setTimeout.
 */
export default function Metronome({
  initialBpm = 80,
  initialBeatsPerMeasure = 4,
  accent = "#f59e0b",
}: {
  initialBpm?: number;
  initialBeatsPerMeasure?: number;
  accent?: string;
}) {
  const [bpm, setBpm] = useState(initialBpm);
  const [beats, setBeats] = useState(initialBeatsPerMeasure);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(60);
  const [currentBeat, setCurrentBeat] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);
  const beatRef = useRef(0);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beats);
  const volRef = useRef(volume);

  // Keep refs in sync with state so the scheduler reads fresh values
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    beatsRef.current = beats;
  }, [beats]);
  useEffect(() => {
    volRef.current = volume;
  }, [volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tapTimes = useRef<number[]>([]);
  const tapTempo = () => {
    const now = performance.now();
    tapTimes.current.push(now);
    tapTimes.current = tapTimes.current.filter((t) => now - t < 3000);
    if (tapTimes.current.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < tapTimes.current.length; i++) {
        intervals.push(tapTimes.current[i] - tapTimes.current[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const detected = Math.round(60000 / avg);
      setBpm(Math.max(40, Math.min(240, detected)));
    }
  };

  const start = async () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    beatRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.05;
    schedulerRef.current = window.setInterval(scheduler, 25);
    setPlaying(true);
  };

  const stop = () => {
    if (schedulerRef.current !== null) {
      window.clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    setPlaying(false);
    setCurrentBeat(0);
  };

  const scheduler = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
      schedule(beatRef.current, nextNoteTimeRef.current);
      const secondsPerBeat = 60.0 / bpmRef.current;
      nextNoteTimeRef.current += secondsPerBeat;
      beatRef.current = (beatRef.current + 1) % beatsRef.current;
    }
  };

  const schedule = (beat: number, time: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const isAccent = beat === 0;
    osc.frequency.value = isAccent ? 1500 : 900;
    const peak = (volRef.current / 100) * (isAccent ? 0.6 : 0.3);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);

    const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
    setTimeout(() => setCurrentBeat(beat), delayMs);
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl p-5">
      <div className="text-center text-sm font-bold text-gray-500 mb-3">
        🎵 METRONOME
      </div>

      {/* Beat dots */}
      <div className="flex justify-center gap-3 my-4 h-12 items-center">
        {Array.from({ length: beats }).map((_, i) => {
          const isAccent = i === 0;
          const isLit = playing && currentBeat === i;
          return (
            <div
              key={i}
              className="rounded-full transition-all"
              style={{
                width: isLit ? "32px" : "20px",
                height: isLit ? "32px" : "20px",
                background: isLit
                  ? isAccent
                    ? accent
                    : `${accent}80`
                  : isAccent
                    ? "#e5e7eb"
                    : "#f3f4f6",
                border: isAccent
                  ? `2px solid ${isLit ? "transparent" : accent}`
                  : "2px solid transparent",
                opacity: isLit ? 1 : 0.6,
              }}
            />
          );
        })}
      </div>

      {/* BPM */}
      <div className="text-center mb-3">
        <div className="text-xs text-gray-500 font-bold">TEMPO</div>
        <div className="flex items-center justify-center gap-2 mt-1">
          <button
            type="button"
            onClick={() => setBpm((b) => Math.max(40, b - 5))}
            className="bg-gray-100 hover:bg-gray-200 w-10 h-10 rounded-full font-bold text-xl"
          >
            −
          </button>
          <div className="font-black text-3xl tabular-nums w-28 text-center">
            ♩=<span>{bpm}</span>
          </div>
          <button
            type="button"
            onClick={() => setBpm((b) => Math.min(240, b + 5))}
            className="bg-gray-100 hover:bg-gray-200 w-10 h-10 rounded-full font-bold text-xl"
          >
            +
          </button>
        </div>
        <input
          type="range"
          min={40}
          max={240}
          value={bpm}
          onChange={(e) => setBpm(parseInt(e.target.value))}
          className="w-full mt-2"
          style={{ accentColor: accent }}
        />
      </div>

      {/* Time signature */}
      <div className="text-center mb-3">
        <div className="text-xs text-gray-500 font-bold mb-1">TIME SIGNATURE</div>
        <div className="flex justify-center gap-2">
          {[
            { n: 2, label: "2/4" },
            { n: 3, label: "3/4" },
            { n: 4, label: "4/4" },
            { n: 6, label: "6/8" },
          ].map((ts) => {
            const active = beats === ts.n;
            return (
              <button
                key={ts.label}
                type="button"
                onClick={() => setBeats(ts.n)}
                className={`px-3 py-2 rounded-lg font-bold ${
                  active ? "text-white" : "bg-gray-100 text-gray-700"
                }`}
                style={active ? { background: accent } : undefined}
              >
                {ts.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tap + volume */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={tapTempo}
          className="flex-1 bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold py-2 rounded-lg text-sm"
        >
          👆 Tap tempo
        </button>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-sm">🔊</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(parseInt(e.target.value))}
            className="flex-1"
            style={{ accentColor: accent }}
          />
        </div>
      </div>

      {/* Start/stop */}
      <button
        type="button"
        onClick={playing ? stop : start}
        className={`w-full text-white font-black py-3 rounded-xl text-lg ${
          playing ? "bg-red-500 hover:bg-red-600" : ""
        }`}
        style={!playing ? { background: accent } : undefined}
      >
        {playing ? "⏸ Stop metronome" : "▶ Start metronome"}
      </button>
      <p className="text-xs text-gray-500 text-center mt-2">
        First time: tap to enable sound (browsers require a tap to play audio).
      </p>
    </div>
  );
}
