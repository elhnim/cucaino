"use client";
import { useState } from "react";
import CashTransactionModal from "@/components/parent/CashTransactionModal";
import type { Kid } from "@/lib/domain/types";

export default function CashTransactionButton({
  kids,
  defaultKidId,
}: {
  kids: Kid[];
  defaultKidId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-black bg-indigo-500 text-white shadow-sm active:scale-95 transition-transform"
      >
        💵 Log Cash
      </button>
      {open && (
        <CashTransactionModal
          kids={kids}
          defaultKidId={defaultKidId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
