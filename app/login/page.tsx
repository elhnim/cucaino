import { Suspense } from "react";
import Link from "next/link";
import LoginForm from "@/components/auth/LoginForm";
import { AmbientBackdrop } from "@/components/game/AmbientBackdrop";

export default function LoginPage() {
  return (
    <main
      className="relative min-h-screen flex flex-col items-center justify-center p-6 font-fun"
      style={{ background: "linear-gradient(160deg, rgba(224,231,255,0.55) 0%, rgba(245,243,255,0.4) 45%, rgba(252,231,243,0.55) 100%)" }}
    >
      <AmbientBackdrop accent="#6366f1" />
      <div className="relative z-10 text-2xl font-black text-indigo-900 mb-6 tracking-tight" style={{ textShadow: "0 1px 12px rgba(255,255,255,0.8)" }}>
        Cucaino
      </div>
      <div
        className="relative z-10 bg-white/95 backdrop-blur rounded-3xl p-7 w-full max-w-sm"
        style={{ boxShadow: "0 8px 32px -4px rgba(99,102,241,0.25), 0 0 0 1px rgba(99,102,241,0.08)" }}
      >
        <h1 className="text-2xl font-black text-indigo-950 mb-1">Hello! 👋</h1>
        <p className="text-sm text-indigo-500 font-medium mb-6">Sign in to your family account</p>
        <Suspense fallback={<div className="h-40" />}>
          <LoginForm />
        </Suspense>
        <p className="text-sm text-center text-gray-500 mt-5">
          New here?{" "}
          <Link href="/signup" className="font-bold text-indigo-600 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
