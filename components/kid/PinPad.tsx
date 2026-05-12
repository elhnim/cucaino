"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 4-digit PIN pad. Modes:
 *   - "verify": user must match `expected`. Calls onSuccess on match.
 *   - "set": user enters PIN once, confirms it second time. Calls onSet
 *     with the chosen PIN.
 */
export default function PinPad({
  mode,
  expected,
  onVerify,
  accent,
  prompt,
  onSuccess,
  onSet,
  onCancel,
}: {
  mode: "verify" | "set";
  expected?: string;
  onVerify?: (pin: string) => Promise<boolean>;
  accent: string;
  prompt?: string;
  onSuccess?: () => void;
  onSet?: (pin: string) => void;
  onCancel?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [stage, setStage] = useState<"first" | "confirm">("first");
  const [firstEntry, setFirstEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState(0);

  // Cooldown countdown ticker
  useEffect(() => {
    if (!cooldownUntil) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownSecs(remaining);
      if (remaining === 0) setCooldownUntil(null);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  // Keep callbacks in refs so prop identity changes don't re-trigger the
  // submit effect (which would call onSet/onSuccess in a loop).
  const onSuccessRef = useRef(onSuccess);
  const onSetRef = useRef(onSet);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onSetRef.current = onSet;
  }, [onSuccess, onSet]);

  // Once onSet/onSuccess fires we don't want to fire it again for the same
  // 4-digit entry; this latch prevents re-runs while React unwinds.
  const submittedRef = useRef(false);

  // Auto-submit when 4 digits entered — wait 150ms so the 4th dot renders first
  useEffect(() => {
    if (pin.length !== 4 || submittedRef.current) return;
    const timer = setTimeout(() => {
      if (submittedRef.current) return;
      if (mode === "verify") {
        const attemptPin = pin;
        const checkCorrect = (): Promise<boolean> => {
          if (onVerify) return onVerify(attemptPin);
          return Promise.resolve(attemptPin === expected);
        };
        void checkCorrect().then((correct) => {
          if (correct) {
            submittedRef.current = true;
            setError(null);
            setFailCount(0);
            setPin("");
            onSuccessRef.current?.();
          } else {
            const newCount = failCount + 1;
            setFailCount(newCount);
            if (newCount >= 10) {
              setError("Too many attempts — please reload the page");
              setPin("");
              return;
            }
            if (newCount >= 3) {
              const lockSecs = 30;
              setCooldownUntil(Date.now() + lockSecs * 1000);
              setError(`Too many wrong tries — wait ${lockSecs}s`);
            } else {
              setError(`Wrong PIN — ${3 - newCount} attempt${3 - newCount === 1 ? "" : "s"} left`);
            }
            setShake(true);
            setTimeout(() => {
              setPin("");
              setShake(false);
            }, 600);
          }
        });
        return;
      }
      if (mode === "set") {
        if (stage === "first") {
          setFirstEntry(pin);
          setPin("");
          setStage("confirm");
          setError(null);
        } else {
          if (pin === firstEntry) {
            submittedRef.current = true;
            const finalPin = pin;
            setPin("");
            setFirstEntry("");
            setStage("first");
            onSetRef.current?.(finalPin);
          } else {
            setError("PINs didn't match — start again");
            setShake(true);
            setTimeout(() => {
              setPin("");
              setFirstEntry("");
              setStage("first");
              setShake(false);
            }, 700);
          }
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [pin, mode, expected, stage, firstEntry]);

  const isLocked = cooldownUntil !== null || failCount >= 10;

  const tap = (digit: string) => {
    if (pin.length >= 4 || isLocked) return;
    setPin((p) => p + digit);
    setError(null);
  };
  const back = () => setPin((p) => p.slice(0, -1));
  const clear = () => setPin("");

  const headline =
    mode === "set" && stage === "confirm"
      ? "Type it again to confirm"
      : prompt ?? (mode === "verify" ? "Enter your PIN" : "Pick a 4-digit PIN");

  return (
    <div className="bg-white rounded-3xl shadow-xl p-6 max-w-sm w-full">
      <div className="text-center mb-4">
        <div className="text-base md:text-lg font-bold text-gray-700">
          {headline}
        </div>
        {error ? (
          <div className="text-sm text-red-600 font-bold mt-1">{error}</div>
        ) : null}
        {cooldownUntil && cooldownSecs > 0 ? (
          <div className="text-2xl font-black text-red-500 mt-2">{cooldownSecs}s</div>
        ) : null}
      </div>

      {/* PIN dots */}
      <div
        className={`flex justify-center gap-3 mb-6 ${shake ? "animate-pulse" : ""}`}
        style={{ transition: "transform 0.2s" }}
      >
        {[0, 1, 2, 3].map((i) => {
          const filled = i < pin.length;
          return (
            <div
              key={i}
              className="w-4 h-4 rounded-full border-2"
              style={{
                background: filled ? accent : "white",
                borderColor: filled ? accent : "#d1d5db",
              }}
            />
          );
        })}
      </div>

      {/* Number pad */}
      <div className={`grid grid-cols-3 gap-2 ${isLocked ? "opacity-40 pointer-events-none" : ""}`}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <PadButton key={n} onClick={() => tap(String(n))}>
            {n}
          </PadButton>
        ))}
        <PadButton onClick={clear} small>
          clear
        </PadButton>
        <PadButton onClick={() => tap("0")}>0</PadButton>
        <PadButton onClick={back} small>
          ⌫
        </PadButton>
      </div>

      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 font-bold py-2"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}

function PadButton({
  children,
  onClick,
  small,
}: {
  children: React.ReactNode;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ touchAction: "manipulation" }}
      className={`bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-2xl py-4 transition-colors select-none ${
        small ? "text-xs font-bold text-gray-600" : "text-2xl font-black"
      }`}
    >
      {children}
    </button>
  );
}
