"use client";

import { useState, useTransition } from "react";
import PinPad from "@/components/kid/PinPad";
import { setParentPinDb } from "@/lib/actions/parent-settings";

const SESSION_KEY = "parent-unlocked";

export default function ParentPinGateClient({
  parentPin,
  children,
}: {
  parentPin: string | null;
  children: React.ReactNode;
}) {
  // Read sessionStorage synchronously in the lazy initializer so there's no
  // useEffect re-render flash on every parent nav transition.
  const [unlocked, setUnlocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SESSION_KEY) === "1";
  });
  const [currentPin, setCurrentPin] = useState(parentPin);
  const [isPending, startTransition] = useTransition();

  const unlock = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setUnlocked(true);
  };

  if (unlocked) return <>{children}</>;

  // No PIN set — force setup before entering
  if (!currentPin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-100 flex items-start justify-center overflow-y-auto p-4 py-8">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-6xl mb-3">🔐</div>
            <h1 className="text-2xl font-black text-indigo-900">Protect parent area</h1>
            <p className="text-sm text-gray-600 mt-2 max-w-xs mx-auto">
              Set a 4-digit PIN so only you can access tasks, rewards, and settings.
            </p>
          </div>
          <PinPad
            mode="set"
            accent="#4f46e5"
            prompt="Choose a 4-digit PIN"
            onSet={(newPin) => {
              startTransition(async () => {
                await setParentPinDb(newPin);
                setCurrentPin(newPin);
                unlock();
              });
            }}
          />
          {isPending ? (
            <p className="text-center text-sm text-indigo-600 font-bold mt-3">Saving…</p>
          ) : null}
        </div>
      </div>
    );
  }

  // PIN exists — verify
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-100 flex items-start justify-center overflow-y-auto p-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-6xl mb-3">🔒</div>
          <h1 className="text-2xl font-black text-indigo-900">Parent area</h1>
          <p className="text-sm text-gray-600 mt-1">Enter your PIN to continue</p>
        </div>
        <PinPad
          mode="verify"
          expected={currentPin}
          accent="#4f46e5"
          onSuccess={unlock}
        />
      </div>
    </div>
  );
}
