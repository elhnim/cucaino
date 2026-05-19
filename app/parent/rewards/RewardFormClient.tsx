"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Reward, Kid, RewardType, RewardWho, RewardRecurrence, RewardPeriodLimit } from "@/lib/domain/types";
import { createReward, updateReward, deleteReward } from "@/lib/actions/rewards";

const COMMON_ICONS = ["🎮", "🍦", "🎬", "🍕", "🧸", "🎡", "🎯", "🏊", "🎂", "🍫", "📱", "🎠", "🛒", "✈️", "🎪"];

import { REWARD_TYPES } from "@/lib/registry/reward-type-registry";

const PERIOD_LIMITS: { value: RewardPeriodLimit; label: string }[] = [
  { value: "none",  label: "No limit" },
  { value: "day",   label: "Per day" },
  { value: "week",  label: "Per week" },
  { value: "month", label: "Per month" },
];

export default function RewardFormClient({
  reward,
  kids,
}: {
  reward?: Reward;
  kids: Kid[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const [name, setName] = useState(reward?.name ?? "");
  const [icon, setIcon] = useState(reward?.icon ?? "🎁");
  const [customIcon, setCustomIcon] = useState(reward ? !COMMON_ICONS.includes(reward.icon) : false);
  const [description, setDescription] = useState(reward?.description ?? "");
  const [costPoints, setCostPoints] = useState(reward?.costPoints ?? 10);
  const [rewardType, setRewardType] = useState<RewardType>(reward?.rewardType ?? "treat");
  const [who, setWho] = useState<RewardWho>(reward?.who ?? "individual");
  const [recurrence, setRecurrence] = useState<RewardRecurrence>(reward?.recurrence ?? "recurring");
  const [redemptionPeriod, setRedemptionPeriod] = useState<RewardPeriodLimit>(reward?.redemptionPeriod ?? "none");
  const [redemptionLimit, setRedemptionLimit] = useState(reward?.redemptionLimit ?? 1);
  const [requiresApproval, setRequiresApproval] = useState(reward?.requiresApproval ?? true);
  const [availableTo, setAvailableTo] = useState<string[]>(reward?.availableTo ?? []);

  const toggleKid = (kidId: string) =>
    setAvailableTo((prev) =>
      prev.includes(kidId) ? prev.filter((id) => id !== kidId) : [...prev, kidId]
    );

  const buildData = () => ({
    name: name.trim(),
    icon,
    description: description.trim() || null,
    costPoints,
    type: "individual" as const,
    kidId: null,
    rewardType,
    who,
    recurrence,
    redemptionLimit: redemptionPeriod === "none" ? null : redemptionLimit,
    redemptionPeriod,
    requiresApproval,
    availableTo,
    costCashCents: reward?.costCashCents ?? 0,
  });

  const handleSave = () => {
    if (!name.trim()) { setError("Reward name is required"); return; }
    setError(null);
    startTransition(async () => {
      const data = buildData();
      const result = reward
        ? await updateReward(reward.id, data)
        : await createReward(data);
      if (!result.ok) { setError(result.error); return; }
      router.push("/parent/rewards");
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteReward(reward!.id);
      router.push("/parent/rewards");
    });
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-8">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
        <h1 className="text-xl font-black text-gray-900 flex-1">{reward ? "Edit reward" : "New reward"}</h1>
        {reward && (
          <button type="button" onClick={() => setShowDelete(true)} className="text-red-400 hover:text-red-600 text-sm font-semibold">
            Delete
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl">
          ⚠️ {error}
        </div>
      )}

      {/* Icon */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="text-sm font-bold text-gray-700">Icon</div>
        <div className="flex flex-wrap gap-2">
          {COMMON_ICONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { setIcon(e); setCustomIcon(false); }}
              className={`w-11 h-11 rounded-xl text-2xl flex items-center justify-center ${
                icon === e && !customIcon ? "ring-2 ring-indigo-500 bg-indigo-50 scale-110" : "bg-gray-100"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          placeholder="Or type any emoji…"
          value={customIcon ? icon : ""}
          onChange={(e) => { setIcon(e.target.value); setCustomIcon(true); }}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
        />
      </div>

      {/* Name + description */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1">Reward name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Extra screen time"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold"
          />
        </div>
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1">Description <span className="font-normal text-gray-400">(optional)</span></label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Shown to the kid in the shop…"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none"
          />
        </div>
      </div>

      {/* Type */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-sm font-bold text-gray-700">Type</div>
        <div className="grid grid-cols-2 gap-2">
          {REWARD_TYPES.map((rt) => (
            <button
              key={rt.id}
              type="button"
              onClick={() => setRewardType(rt.id)}
              className={`py-2 rounded-xl text-sm font-bold transition-colors ${
                rewardType === rt.id ? `${rt.buttonClass} text-white` : "bg-gray-100 text-gray-600"
              }`}
            >
              {rt.emoji} {rt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stars */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <label className="text-sm font-bold text-gray-700 block">Star cost</label>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setCostPoints((v) => Math.max(1, v - 5))} className="w-10 h-10 rounded-full bg-gray-100 text-lg font-bold">−</button>
          <span className="text-2xl font-black w-16 text-center">⭐ {costPoints}</span>
          <button type="button" onClick={() => setCostPoints((v) => v + 5)} className="w-10 h-10 rounded-full bg-gray-100 text-lg font-bold">+</button>
        </div>
      </div>

      {/* Available to */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-sm font-bold text-gray-700">Available to</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAvailableTo([])}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${availableTo.length === 0 ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            All kids
          </button>
          {kids.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => toggleKid(k.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${availableTo.includes(k.id) ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {k.avatar} {k.name}
            </button>
          ))}
        </div>
      </div>

      {/* Who + recurrence */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-4">
        <div>
          <div className="text-sm font-bold text-gray-700 mb-2">Who redeems</div>
          <div className="flex gap-3">
            {([["individual", "👤 Individual"], ["team", "👨‍👩‍👧 Team"]] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setWho(v)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border ${who === v ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-bold text-gray-700 mb-2">Recurrence</div>
          <div className="flex gap-3">
            {([["recurring", "🔄 Recurring"], ["one_off", "✨ One-off"]] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setRecurrence(v)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border ${recurrence === v ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {recurrence === "recurring" && (
          <div>
            <div className="text-sm font-bold text-gray-700 mb-2">Redemption limit</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {PERIOD_LIMITS.map((pl) => (
                <button
                  key={pl.value}
                  type="button"
                  onClick={() => setRedemptionPeriod(pl.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold ${redemptionPeriod === pl.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}
                >
                  {pl.label}
                </button>
              ))}
            </div>
            {redemptionPeriod !== "none" && (
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setRedemptionLimit((v) => Math.max(1, v - 1))} className="w-9 h-9 rounded-full bg-gray-100 text-lg font-bold">−</button>
                <span className="text-xl font-black w-8 text-center">{redemptionLimit}</span>
                <button type="button" onClick={() => setRedemptionLimit((v) => v + 1)} className="w-9 h-9 rounded-full bg-gray-100 text-lg font-bold">+</button>
                <span className="text-xs text-gray-400">time{redemptionLimit !== 1 ? "s" : ""} {redemptionPeriod === "day" ? "per day" : redemptionPeriod === "week" ? "per week" : "per month"}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Approval */}
      <div className="bg-white rounded-2xl shadow p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-gray-700">Requires approval</div>
            <div className="text-xs text-gray-400">Kid requests, you approve before they get it</div>
          </div>
          <button
            type="button"
            onClick={() => setRequiresApproval((v) => !v)}
            className={`w-12 h-6 rounded-full transition-colors ${requiresApproval ? "bg-indigo-600" : "bg-gray-200"}`}
          >
            <span className={`block w-5 h-5 rounded-full bg-white shadow mx-0.5 transition-transform ${requiresApproval ? "translate-x-6" : ""}`} />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl disabled:opacity-50"
      >
        {isPending ? "Saving…" : reward ? "Save changes" : "Create reward"}
      </button>

      {showDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="font-bold text-gray-900">Delete "{reward?.name}"?</div>
            <p className="text-sm text-gray-500">This hides the reward from all kids. It won't affect past requests.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowDelete(false)} className="flex-1 border border-gray-200 text-gray-600 font-bold py-2.5 rounded-xl text-sm">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isPending} className="flex-1 bg-red-500 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
