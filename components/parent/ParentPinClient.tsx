"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PinPad from "@/components/kid/PinPad";
import { setParentPinDb, clearParentPinDb } from "@/lib/actions/parent-settings";

type View = "idle" | "verify-old" | "set-new" | "remove-verify";

export default function ParentPinClient({
  currentPin,
}: {
  currentPin: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("idle");
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasPin = !!currentPin;

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleSet = (pin: string) => {
    startTransition(async () => {
      await setParentPinDb(pin);
      setView("idle");
      showSuccess("Parent PIN saved.");
      router.refresh();
    });
  };

  const handleClear = () => {
    startTransition(async () => {
      await clearParentPinDb();
      setView("idle");
      showSuccess("PIN removed.");
      router.refresh();
    });
  };

  return (
    <section className="bg-white rounded-2xl shadow p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🔒</span>
        <div>
          <div className="font-bold text-gray-800">Parent area PIN</div>
          <div className="text-xs text-gray-500">
            {hasPin
              ? "A PIN is set. Kids can't access the parent area without it."
              : "No PIN set — anyone on the tablet can access the parent area."}
          </div>
        </div>
      </div>

      {success ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm font-bold text-green-700">
          ✅ {success}
        </div>
      ) : null}

      {view === "idle" ? (
        <div className="flex flex-col gap-2">
          {hasPin ? (
            <>
              <button
                type="button"
                onClick={() => setView("verify-old")}
                disabled={isPending}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                Change PIN
              </button>
              <button
                type="button"
                onClick={() => setView("remove-verify")}
                disabled={isPending}
                className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2.5 rounded-xl text-sm border border-red-200 disabled:opacity-50"
              >
                Remove PIN
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setView("set-new")}
              disabled={isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50"
            >
              Set PIN
            </button>
          )}
        </div>
      ) : view === "set-new" ? (
        <div>
          <p className="text-sm text-gray-600 mb-3">
            Choose a 4-digit PIN to protect the parent area on the tablet.
          </p>
          <PinPad
            mode="set"
            accent="#4f46e5"
            prompt="Choose your parent PIN"
            onSet={handleSet}
            onCancel={() => setView("idle")}
          />
        </div>
      ) : view === "verify-old" ? (
        <div>
          <p className="text-sm text-gray-600 mb-3">Enter your current PIN to continue.</p>
          <PinPad
            mode="verify"
            expected={currentPin ?? ""}
            accent="#4f46e5"
            prompt="Enter current PIN"
            onSuccess={() => setView("set-new")}
            onCancel={() => setView("idle")}
          />
        </div>
      ) : view === "remove-verify" ? (
        <div>
          <p className="text-sm text-gray-600 mb-3">Enter your current PIN to remove it.</p>
          <PinPad
            mode="verify"
            expected={currentPin ?? ""}
            accent="#ef4444"
            prompt="Confirm PIN to remove"
            onSuccess={handleClear}
            onCancel={() => setView("idle")}
          />
        </div>
      ) : null}
    </section>
  );
}
