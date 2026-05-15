import { Suspense } from "react";
import Link from "next/link";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-6 font-fun"
      style={{ background: "linear-gradient(160deg, #e0e7ff 0%, #f5f3ff 45%, #fce7f3 100%)" }}
    >
      <div className="text-2xl font-black text-indigo-900 mb-6 tracking-tight">Cucaino</div>
      <div
        className="bg-white rounded-3xl p-7 w-full max-w-sm"
        style={{ boxShadow: "0 8px 32px -4px rgba(99,102,241,0.15), 0 0 0 1px rgba(99,102,241,0.08)" }}
      >
        <h1 className="text-2xl font-black text-indigo-950 mb-1">Reset password</h1>
        <p className="text-sm text-indigo-500 font-medium mb-6">
          Enter your email and we&apos;ll send you a reset link.
        </p>
        <Suspense fallback={<div className="h-32" />}>
          <ForgotPasswordForm />
        </Suspense>
        <p className="text-sm text-center text-gray-500 mt-5">
          <Link href="/login" className="font-bold text-indigo-600 hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
