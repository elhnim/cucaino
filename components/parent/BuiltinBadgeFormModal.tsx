"use client";

import { useState, useTransition } from "react";
import { updateBuiltinBadgeOverride } from "@/lib/actions/badges";
import type { BuiltinBadgeOverrideData } from "@/lib/actions/badges";
import type { BadgeConfigOverride } from "@/lib/domain/types";
import { BADGE_META, BADGE_THRESHOLDS } from "@/lib/domain/badge-config";
import type { BadgeCategory } from "@/lib/domain/types";

export default function BuiltinBadgeFormModal({
  category,
  override,
  onClose,
}: {
  category: BadgeCategory;
  override: BadgeConfigOverride | null;
  onClose: () => void;
}) {
  const meta = BADGE_META[category];
  const defaults = BADGE_THRESHOLDS[category];

  const [form, setForm] = useState<BuiltinBadgeOverrideData>({
    bronzeThreshold: override?.bronzeThreshold ?? defaults.bronze,
    silverThreshold: override?.silverThreshold ?? defaults.silver,
    goldThreshold: override?.goldThreshold ?? defaults.gold,
    bronzeName: override?.bronzeName ?? meta.tierNames.bronze,
    silverName: override?.silverName ?? meta.tierNames.silver,
    goldName: override?.goldName ?? meta.tierNames.gold,
    bronzeBonusStars: override?.bronzeBonusStars ?? 0,
    silverBonusStars: override?.silverBonusStars ?? 0,
    goldBonusStars: override?.goldBonusStars ?? 0,
    bronzeBonusCashCents: override?.bronzeBonusCashCents ?? 0,
    silverBonusCashCents: override?.silverBonusCashCents ?? 0,
    goldBonusCashCents: override?.goldBonusCashCents ?? 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof BuiltinBadgeOverrideData>(k: K, v: BuiltinBadgeOverrideData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (form.bronzeThreshold >= form.silverThreshold || form.silverThreshold >= form.goldThreshold) {
      setError("Thresholds must be Bronze < Silver < Gold."); return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateBuiltinBadgeOverride(category, form);
      if (result.ok) onClose();
      else setError(result.error);
    });
  };

  const resetToDefaults = () => {
    setForm({
      bronzeThreshold: defaults.bronze,
      silverThreshold: defaults.silver,
      goldThreshold: defaults.gold,
      bronzeName: meta.tierNames.bronze,
      silverName: meta.tierNames.silver,
      goldName: meta.tierNames.gold,
      bronzeBonusStars: 0,
      silverBonusStars: 0,
      goldBonusStars: 0,
      bronzeBonusCashCents: 0,
      silverBonusCashCents: 0,
      goldBonusCashCents: 0,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md shadow-2xl max-h-[90dvh] flex flex-col">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{meta.icon}</span>
            <h2 className="text-lg font-black">{meta.label}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-bold rounded-xl px-3 py-2">{error}</div>
          )}

          {/* Thresholds */}
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-2">Tier thresholds (completions)</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "bronzeThreshold" as const, label: "🥉 Bronze", color: "#cd7c3f", default: defaults.bronze },
                { key: "silverThreshold" as const, label: "🥈 Silver", color: "#9ca3af", default: defaults.silver },
                { key: "goldThreshold" as const,   label: "🥇 Gold",   color: "#f59e0b", default: defaults.gold },
              ].map(({ key, label, color, default: def }) => (
                <div key={key}>
                  <label className="text-[10px] font-bold mb-1 block" style={{ color }}>{label}</label>
                  <input
                    type="number"
                    min={1}
                    value={form[key]}
                    onChange={(e) => set(key, Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full border border-gray-200 rounded-xl p-2 text-sm text-center font-bold focus:outline-none focus:border-indigo-400"
                  />
                  <div className="text-[9px] text-gray-400 text-center mt-0.5">default: {def}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tier names */}
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-2">Tier names</label>
            <div className="space-y-2">
              {[
                { key: "bronzeName" as const, label: "🥉 Bronze", color: "#cd7c3f", default: meta.tierNames.bronze },
                { key: "silverName" as const, label: "🥈 Silver", color: "#9ca3af", default: meta.tierNames.silver },
                { key: "goldName"   as const, label: "🥇 Gold",   color: "#f59e0b", default: meta.tierNames.gold },
              ].map(({ key, label, color, default: def }) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-[10px] font-bold w-14 flex-shrink-0" style={{ color }}>{label}</label>
                  <input
                    type="text"
                    placeholder={def}
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Tier bonuses */}
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-2">Tier bonuses (optional)</label>
            <div className="space-y-2">
              {[
                { label: "🥉 Bronze", color: "#cd7c3f", starsKey: "bronzeBonusStars" as const, cashKey: "bronzeBonusCashCents" as const },
                { label: "🥈 Silver", color: "#9ca3af", starsKey: "silverBonusStars" as const, cashKey: "silverBonusCashCents" as const },
                { label: "🥇 Gold",   color: "#f59e0b", starsKey: "goldBonusStars" as const,   cashKey: "goldBonusCashCents" as const },
              ].map(({ label, color, starsKey, cashKey }) => (
                <div key={starsKey} className="flex items-center gap-2">
                  <label className="text-[10px] font-bold w-14 flex-shrink-0" style={{ color }}>{label}</label>
                  <div className="flex-1 flex gap-2">
                    <div className="flex-1">
                      <label className="text-[9px] text-gray-400 block mb-0.5">⭐ Stars</label>
                      <input
                        type="number"
                        min={0}
                        value={form[starsKey]}
                        onChange={(e) => set(starsKey, Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full border border-gray-200 rounded-xl p-2 text-sm text-center font-bold focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] text-gray-400 block mb-0.5">💵 Cash ($)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={form[cashKey] / 100}
                        onChange={(e) => set(cashKey, Math.round((parseFloat(e.target.value) || 0) * 100))}
                        className="w-full border border-gray-200 rounded-xl p-2 text-sm text-center font-bold focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 p-5 pt-0 space-y-2">
          <button type="button" onClick={resetToDefaults}
            className="w-full py-2 rounded-xl text-sm font-bold text-gray-500 bg-gray-50 border border-gray-200">
            Reset to defaults
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-600">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white disabled:opacity-50">
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
