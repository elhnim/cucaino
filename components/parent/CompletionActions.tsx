"use client";
import { useTransition } from "react";
import { approveCompletion, denyCompletion } from "@/lib/actions/completions";

export default function CompletionActions({ completionId }: { completionId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => { await denyCompletion(completionId); })}
        className="flex-1 py-1.5 rounded-lg text-xs font-black text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50"
      >
        ✕ Deny
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => { await approveCompletion(completionId); })}
        className="flex-[2] py-1.5 rounded-lg text-xs font-black text-white disabled:opacity-50"
        style={{ background: "#16a34a" }}
      >
        ✓ Approve
      </button>
    </div>
  );
}
