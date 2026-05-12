"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/actions/auth";

export default function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [kidNames, setKidNames] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const updateKid = (idx: number, value: string) => {
    setKidNames((prev) => prev.map((n, i) => (i === idx ? value : n)));
  };
  const addKid = () => setKidNames((prev) => [...prev, ""]);
  const removeKid = (idx: number) =>
    setKidNames((prev) => prev.filter((_, i) => i !== idx));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanNames = kidNames.map((n) => n.trim()).filter(Boolean);
    if (cleanNames.length === 0) {
      setError("Add at least one kid.");
      return;
    }
    startTransition(async () => {
      const result = await signUp({
        email,
        password,
        familyName: familyName.trim(),
        kidNames: cleanNames,
      });
      if (result.ok) {
        router.push("/select-kid");
      } else {
        setError(result.error);
      }
    });
  };

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
      <Field label="Password (6+ characters)">
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
        />
      </Field>
      <Field label="Family name (e.g., 'The Hoangs')">
        <input
          type="text"
          required
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          maxLength={40}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
        />
      </Field>

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-bold text-gray-700 mb-2">
          ADD YOUR KIDS (you can edit avatars and themes later)
        </p>
        <div className="space-y-2">
          {kidNames.map((name, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                type="text"
                value={name}
                onChange={(e) => updateKid(idx, e.target.value)}
                placeholder={
                  idx === 0
                    ? "e.g., Liam"
                    : idx === 1
                      ? "e.g., Mia"
                      : `Kid ${idx + 1} name`
                }
                maxLength={20}
                className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
              />
              {kidNames.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeKid(idx)}
                  aria-label={`Remove kid ${idx + 1}`}
                  className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 font-bold shrink-0"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addKid}
          className="mt-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"
        >
          + Add another kid
        </button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-black py-3 rounded-xl shadow"
      >
        {pending ? "Creating your family…" : "Create account"}
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
