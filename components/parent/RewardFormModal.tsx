"use client";

import { useState, useTransition } from "react";
import { createReward, updateReward, deleteReward } from "@/lib/actions/rewards";
import type { RewardFormData } from "@/lib/actions/rewards";
import type { Kid, Reward } from "@/lib/domain/types";

function defaultForm(reward?: Reward): RewardFormData {
  return {
    name: reward?.name ?? "",
    icon: reward?.icon ?? "🎁",
    description: reward?.description ?? null,
    costPoints: reward?.costPoints ?? 50,
    type: reward?.type ?? "individual",
    kidId: reward?.kidId ?? null,
    rewardType: reward?.rewardType ?? "treat",
    who: reward?.who ?? "individual",
    recurrence: reward?.recurrence ?? "recurring",
    redemptionLimit: reward?.redemptionLimit ?? null,
    redemptionPeriod: reward?.redemptionPeriod ?? "none",
    requiresApproval: reward?.requiresApproval ?? true,
    availableTo: reward?.availableTo ?? [],
  };
}

export default function RewardFormModal({
  kids,
  reward,
  onClose,
}: {
  kids: Kid[];
  reward?: Reward;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RewardFormData>(defaultForm(reward));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof RewardFormData>(k: K, v: RewardFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (form.costPoints < 1) { setError("Points must be at least 1."); return; }
    setError(null);
    startTransition(async () => {
      const result = reward
        ? await updateReward(reward.id, form)
        : await createReward(form);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  };

  const handleDelete = () => {
    if (!reward) return;
    startTransition(async () => {
      await deleteReward(reward.id);
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-lg font-black">
            {reward ? "Edit reward" : "New reward"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-bold rounded-xl px-3 py-2">
              {error}
            </div>
          ) : null}

          {/* Name + icon */}
          <div className="flex gap-2">
            <div className="w-16">
              <label className="text-xs font-bold text-gray-500">Icon</label>
              <input
                type="text"
                value={form.icon}
                onChange={(e) => set("icon", e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-center text-2xl focus:outline-none focus:border-indigo-400"
                maxLength={4}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500">Reward name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Ice cream"
                className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-gray-500">Description (optional)</label>
            <input
              type="text"
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value || null)}
              placeholder="e.g. One scoop of your choice"
              className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* Points */}
          <div>
            <label className="text-xs font-bold text-gray-500">Cost (points ⭐)</label>
            <input
              type="number"
              min={1}
              max={10000}
              value={form.costPoints}
              onChange={(e) => set("costPoints", Number(e.target.value))}
              className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* Type */}
          <div>
            <label className="text-xs font-bold text-gray-500">Type</label>
            <div className="flex gap-2 mt-1">
              {(["individual", "family"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    set("type", t);
                    if (t === "family") set("kidId", null);
                  }}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                    form.type === t
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                  }`}
                >
                  {t === "individual" ? "👤 Individual" : "👨‍👩‍👧‍👦 Family"}
                </button>
              ))}
            </div>
            {form.type === "individual" ? (
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => set("kidId", null)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                    form.kidId === null
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-gray-100 text-gray-500 border-gray-200"
                  }`}
                >
                  Any kid
                </button>
                {kids.map((kid) => (
                  <button
                    key={kid.id}
                    type="button"
                    onClick={() => set("kidId", kid.id)}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                      form.kidId === kid.id
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-gray-100 text-gray-500 border-gray-200"
                    }`}
                  >
                    {kid.avatar} {kid.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                Family rewards come from the shared family points pool.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 flex gap-2">
            {reward && !confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-red-600 border border-red-200 hover:bg-red-50"
              >
                Delete
              </button>
            ) : reward && confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Confirm delete"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? "Saving…" : reward ? "Save" : "Add reward"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
