"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePassword } from "@/lib/actions/auth";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    startTransition(async () => {
      const result = await updatePassword(password);
      if (result.ok) {
        router.push("/select-kid");
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <div className="text-xs font-bold text-gray-700 mb-1">New password (6+ characters)</div>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
        />
      </label>
      <label className="block">
        <div className="text-xs font-bold text-gray-700 mb-1">Confirm new password</div>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
        />
      </label>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-black py-3 rounded-xl shadow flex items-center justify-center gap-2"
      >
        {pending ? (
          <>
            <Spinner />
            Updating…
          </>
        ) : (
          "Set new password"
        )}
      </button>
    </form>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
