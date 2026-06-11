"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/actions/auth";
import PostLoginLoader from "./PostLoginLoader";

export default function LoginForm() {
  const search = useSearchParams();
  const next = search.get("next") ?? "/select-kid";
  const urlError = search.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(urlError);
  const [loadingShow, setLoadingShow] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signIn({ email, password });
      if (result.ok) {
        setLoadingShow(true); // the Blast-off loader preloads + navigates
      } else {
        setError(result.error);
      }
    });
  };

  if (loadingShow) return <PostLoginLoader next={next} />;

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Email">
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
        />
      </Field>
      <Field label="Password">
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
        />
      </Field>

      <div className="text-right -mt-1">
        <Link
          href="/forgot-password"
          className="text-xs font-bold text-indigo-500 hover:text-indigo-700"
        >
          Forgot password?
        </Link>
      </div>

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
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-bold text-gray-700 mb-1">{label}</div>
      {children}
    </label>
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
