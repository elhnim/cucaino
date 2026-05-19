"use client";

import { useState, useTransition } from "react";
import { inviteParent, revokeInvite } from "@/lib/actions/invite";
import type { FamilyInvite } from "@/lib/domain/types";

export default function InviteParentSection({
  initialInvites,
}: {
  initialInvites: FamilyInvite[];
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [invites, setInvites] = useState(initialInvites);
  const [isPending, startTransition] = useTransition();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleInvite = () => {
    if (!email.trim()) return;
    setMessage(null);
    startTransition(async () => {
      const result = await inviteParent(email);
      if (result.ok) {
        setMessage({ ok: true, text: `Invite sent to ${email.trim().toLowerCase()}` });
        setEmail("");
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  };

  const handleRevoke = (inviteId: string) => {
    setRevokingId(inviteId);
    startTransition(async () => {
      const result = await revokeInvite(inviteId);
      if (result.ok) {
        setInvites((prev) =>
          prev.map((inv) => (inv.id === inviteId ? { ...inv, status: "revoked" as const } : inv)),
        );
      }
      setRevokingId(null);
    });
  };

  const pendingInvites = invites.filter((inv) => inv.status === "pending");

  return (
    <div className="space-y-3">
      {/* Email input row */}
      <div className="flex gap-2">
        <input
          type="email"
          placeholder="parent@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
        />
        <button
          type="button"
          onClick={handleInvite}
          disabled={isPending || !email.trim()}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white disabled:opacity-50 flex-shrink-0"
        >
          {isPending ? "Sending…" : "Send invite"}
        </button>
      </div>

      {/* Feedback message */}
      {message && (
        <div
          className={`text-xs font-semibold rounded-xl px-3 py-2 ${
            message.ok
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.ok ? "✓ " : "⚠ "}{message.text}
        </div>
      )}

      {/* Pending invites list */}
      {pendingInvites.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">
            Pending invites
          </div>
          {pendingInvites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-3 py-2"
            >
              <div>
                <div className="text-sm font-semibold text-gray-800">{inv.invitedEmail}</div>
                <div className="text-[11px] text-gray-400">
                  Expires {new Date(inv.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(inv.id)}
                disabled={isPending && revokingId === inv.id}
                className="text-xs font-bold text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
