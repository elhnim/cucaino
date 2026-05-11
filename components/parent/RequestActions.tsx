"use client";

import { useTransition } from "react";
import { approveRequest, denyRequest } from "@/lib/actions/rewards";

export default function RequestActions({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => { await denyRequest(requestId); })}
        className="flex-1 py-2 rounded-xl text-[13px] font-bold text-red-500 border-[1.5px] border-red-400 bg-white disabled:opacity-50"
      >
        ✕ Deny
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => { await approveRequest(requestId); })}
        className="flex-[2] py-2 rounded-xl text-[13px] font-bold text-white bg-green-500 disabled:opacity-50"
      >
        ✓ Approve
      </button>
    </div>
  );
}
