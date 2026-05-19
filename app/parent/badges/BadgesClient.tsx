"use client";

import { useState } from "react";
import BadgeFormModal from "@/components/parent/BadgeFormModal";
import type { CustomBadge, Task, Kid } from "@/lib/domain/types";

export default function BadgesClient({
  badges,
  tasks,
  kids,
}: {
  badges: CustomBadge[];
  tasks: Task[];
  kids: Kid[];
}) {
  const [editing, setEditing] = useState<CustomBadge | "new" | null>(null);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">🏅 Custom Badges</h2>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white"
        >
          + New badge
        </button>
      </div>

      {badges.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">
          <div className="text-5xl mb-4">🏅</div>
          <p className="font-bold text-gray-500 mb-1">No custom badges yet</p>
          <p>Create a badge to encourage kids to build specific habits.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {badges.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setEditing(b)}
              className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left hover:shadow-md transition-shadow"
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-2xl flex-shrink-0">
                {b.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-gray-900">{b.name}</div>
                <div className="text-xs text-gray-500 truncate">
                  {b.taskIcon} {b.taskName} · {b.trackType === "streak" ? "🔥 Streak" : "📊 Count"}
                  {" "} · 🥉{b.bronzeThreshold} 🥈{b.silverThreshold} 🥇{b.goldThreshold}
                </div>
                {b.kidIds && b.kidIds.length > 0 && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {kids.filter((k) => b.kidIds!.includes(k.id)).map((k) => k.name).join(", ")}
                  </div>
                )}
              </div>
              <span className="text-gray-300 text-lg">›</span>
            </button>
          ))}
        </div>
      )}

      {editing !== null && (
        <BadgeFormModal
          badge={editing === "new" ? undefined : editing}
          tasks={tasks}
          kids={kids}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
