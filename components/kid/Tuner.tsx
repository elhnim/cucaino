"use client";

import { useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";

type Instrument = "violin" | "ukulele";
type StringDef = { name: string; freq: number; label: string };

const STRINGS: Record<Instrument, StringDef[]> = {
  // Violin standard tuning
  violin: [
    { name: "G3", freq: 196.0, label: "G" },
    { name: "D4", freq: 293.66, label: "D" },
    { name: "A4", freq: 440.0, label: "A" },
    { name: "E5", freq: 659.26, label: "E" },
  ],
  // Ukulele standard (high-G) tuning
  ukulele: [
    { name: "G4", freq: 392.0, label: "G" },
    { name: "C4", freq: 261.63, label: "C" },
    { name: "E4", freq: 329.63, label: "E" },
    { name: "A4", freq: 440.0, label: "A" },
  ],
};

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

interface Reading {
  freq: number;
  noteName: string;
  octave: number;
  cents: number; // -50..+50 vs. nearest semitone
  closestString: StringDef | null;
  centsToTarget: number; // cents off the auto-selected string
  clarity: number;
}

export default function Tuner({ accent }: { accent: string }) {
  const [permission, setPermission] = useState<"idle" | "asking" | "granted" | "denied">("idle");
  const [error, setError] = useState<string | null>(null);
  const [instrument, setInstrument] = useState<Instrument>("violin");
  const [autoTarget, setAutoTarget] = useState(true);
  const [manualTarget, setManualTarget] = useState<StringDef | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const target = autoTarget
    ? reading?.closestString ?? STRINGS[instrument][2]
    : manualTarget ?? STRINGS[instrument][2];

  // Cleanup on unmount
  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When instrument changes, reset manual target
  useEffect(() => {
    setManualTarget(null);
  }, [instrument]);

  async function start() {
    setPermission("asking");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        } as MediaTrackConstraints,
      });
      streamRef.current = stream;
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const buf = new Float32Array(analyser.fftSize);
      const detector = PitchDetector.forFloat32Array(analyser.fftSize);
      detector.minVolumeDecibels = -40;

      setPermission("granted");

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const [pitch, clarity] = detector.findPitch(buf, ctx.sampleRate);

        if (clarity > 0.85 && pitch > 50 && pitch < 2000) {
          setReading(buildReading(pitch, clarity, instrument));
        } else {
          // Decay: keep last reading visible briefly
          setReading((prev) =>
            prev && prev.clarity > 0
              ? { ...prev, clarity: prev.clarity * 0.9 }
              : prev,
          );
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setPermission("denied");
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't access the microphone. Try again?",
      );
    }
  }

  function stop() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setPermission("idle");
    setReading(null);
  }

  // Pick the cents to display: vs. selected target string in auto mode,
  // otherwise vs. the nearest semitone (for any-note tuning)
  const displayCents = reading
    ? autoTarget
      ? reading.centsToTarget
      : centsBetween(reading.freq, target.freq)
    : 0;
  const inTune = reading && Math.abs(displayCents) <= 5 && reading.clarity > 0.8;

  return (
    <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-black flex items-center gap-2">
          🎵 Tuner
        </h2>
        {permission === "granted" ? (
          <button
            type="button"
            onClick={stop}
            className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-bold"
          >
            ⏹ Stop
          </button>
        ) : null}
      </div>

      {/* Instrument toggle */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {(["violin", "ukulele"] as Instrument[]).map((inst) => (
          <button
            key={inst}
            type="button"
            onClick={() => setInstrument(inst)}
            className={`px-4 py-3 rounded-xl border-2 font-bold transition-colors ${
              instrument === inst
                ? "text-white"
                : "border-gray-200 text-gray-700 hover:border-gray-300"
            }`}
            style={
              instrument === inst
                ? { background: accent, borderColor: accent }
                : undefined
            }
          >
            {inst === "violin" ? "🎻 Violin" : "🪕 Ukulele"}
          </button>
        ))}
      </div>

      {/* Target string */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-gray-500">TARGET STRING</div>
          <label className="text-xs flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={autoTarget}
              onChange={(e) => setAutoTarget(e.target.checked)}
              className="w-3 h-3"
              style={{ accentColor: accent }}
            />
            <span className="text-gray-600">auto-detect</span>
          </label>
        </div>
        <div className="flex justify-center gap-2">
          {STRINGS[instrument].map((s) => {
            const isActive = !autoTarget && manualTarget?.name === s.name;
            const isAutoActive = autoTarget && reading?.closestString?.name === s.name;
            const highlight = isActive || isAutoActive;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  setAutoTarget(false);
                  setManualTarget(s);
                }}
                className={`flex-1 rounded-xl py-3 font-black text-2xl border-2 transition-colors ${
                  highlight ? "text-white" : "border-gray-200 text-gray-700"
                }`}
                style={
                  highlight
                    ? { background: accent, borderColor: accent }
                    : undefined
                }
              >
                {s.label}
                <div className="text-xs font-normal opacity-70 mt-0.5">
                  {s.name}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Big display */}
      <div
        className={`relative rounded-3xl p-6 mb-4 transition-colors ${
          inTune ? "bg-green-100" : "bg-gray-50"
        }`}
      >
        {/* Note + freq */}
        <div className="text-center mb-4">
          {reading && reading.clarity > 0.5 ? (
            <>
              <div
                className="text-5xl md:text-6xl font-black"
                style={{ color: inTune ? "#16a34a" : accent }}
              >
                {reading.noteName}
                <span className="text-2xl md:text-3xl opacity-60">
                  {reading.octave}
                </span>
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {reading.freq.toFixed(1)} Hz
                {target ? ` · target ${target.freq.toFixed(1)} Hz` : ""}
              </div>
            </>
          ) : (
            <div className="text-2xl md:text-3xl font-bold text-gray-400 py-4">
              {permission === "granted" ? "Play a note…" : "Tap Start to begin"}
            </div>
          )}
        </div>

        {/* Cents needle */}
        {reading && reading.clarity > 0.5 ? (
          <div className="relative h-20">
            {/* Track */}
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-300 rounded-full -translate-y-1/2" />
            {/* Center marker */}
            <div className="absolute top-1/2 left-1/2 w-1 h-8 bg-gray-700 rounded-full -translate-x-1/2 -translate-y-1/2" />
            {/* Tick marks */}
            {[-40, -20, 20, 40].map((c) => (
              <div
                key={c}
                className="absolute top-1/2 w-0.5 h-3 bg-gray-400 -translate-y-1/2"
                style={{ left: `${50 + c}%` }}
              />
            ))}
            {/* Needle */}
            <div
              className="absolute top-0 bottom-0 w-1.5 rounded-full transition-all"
              style={{
                left: `calc(${50 + clamp(displayCents, -50, 50)}% - 3px)`,
                background: inTune ? "#16a34a" : accent,
                boxShadow: inTune
                  ? "0 0 16px rgba(22,163,74,0.6)"
                  : "0 0 8px rgba(0,0,0,0.2)",
              }}
            />
            {/* Labels */}
            <div className="absolute bottom-0 left-0 text-xs text-gray-500 font-mono">
              −50¢
            </div>
            <div className="absolute bottom-0 right-0 text-xs text-gray-500 font-mono">
              +50¢
            </div>
            <div
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-xs font-bold"
              style={{ color: inTune ? "#16a34a" : "#6b7280" }}
            >
              {inTune ? "✓ in tune" : `${displayCents > 0 ? "+" : ""}${displayCents.toFixed(0)}¢`}
            </div>
          </div>
        ) : (
          <div className="h-20 flex items-center justify-center text-sm text-gray-400">
            {permission === "granted"
              ? "Listening for a note…"
              : "Mic not active"}
          </div>
        )}
      </div>

      {/* Controls */}
      {permission !== "granted" ? (
        <button
          type="button"
          onClick={start}
          disabled={permission === "asking"}
          className="w-full text-white font-black text-lg py-4 rounded-2xl shadow-lg disabled:opacity-60"
          style={{ background: accent }}
        >
          {permission === "asking" ? "Asking for mic…" : "🎤 Start tuner"}
        </button>
      ) : null}

      {/* Hints + error */}
      {error ? (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      <p className="text-xs text-gray-500 mt-3 text-center">
        Tip: pluck or bow a single string in a quiet room. Below 50% clarity is hidden so we don&apos;t guess.
      </p>
    </div>
  );
}

// ----- Pitch math helpers -----

function buildReading(
  freq: number,
  clarity: number,
  instrument: Instrument,
): Reading {
  // Closest semitone
  const semitonesFromA4 = 12 * Math.log2(freq / 440);
  const midi = 69 + semitonesFromA4;
  const nearestMidi = Math.round(midi);
  const cents = (midi - nearestMidi) * 100;
  const noteName = NOTE_NAMES[((nearestMidi % 12) + 12) % 12];
  const octave = Math.floor(nearestMidi / 12) - 1;

  // Closest target string for this instrument
  let closest: StringDef | null = null;
  let closestCents = Infinity;
  for (const s of STRINGS[instrument]) {
    const c = Math.abs(centsBetween(freq, s.freq));
    if (c < closestCents) {
      closest = s;
      closestCents = c;
    }
  }

  return {
    freq,
    noteName,
    octave,
    cents,
    closestString: closest,
    centsToTarget: closest ? centsBetween(freq, closest.freq) : 0,
    clarity,
  };
}

function centsBetween(actual: number, target: number): number {
  return 1200 * Math.log2(actual / target);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
