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
        className="text-[12px] font-bold ml-4"
        style={{ color: "#4f46e5" }}
      >
        💵 Cash
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
