"use client";

import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/lib/actions/auth";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(email);
      if (result.ok) {
        setSent(true);
      } else {
        setError(result.error);
      }
    });
  };

  if (sent) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="text-5xl">📬</div>
        <h2 className="text-xl font-black text-indigo-900">Check your email</h2>
        <p className="text-sm text-indigo-700 leading-relaxed">
          We&apos;ve sent a reset link to <strong>{email}</strong>. Click the link to set a new password.
        </p>
        <p className="text-xs text-gray-500">Didn&apos;t get it? Check your spam folder.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <div className="text-xs font-bold text-gray-700 mb-1">Email address</div>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
            Sending…
          </>
        ) : (
          "Send reset link"
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
