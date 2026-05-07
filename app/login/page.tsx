import { Suspense } from "react";
import Link from "next/link";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 p-6 flex flex-col items-center justify-center font-fun">
      <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-black text-indigo-900">
            Welcome back 👋
          </h1>
          <p className="text-sm text-indigo-700 mt-2">
            Sign in to your Cucaino family.
          </p>
        </div>
        <Suspense fallback={<div className="h-40" />}>
          <LoginForm />
        </Suspense>
        <p className="text-sm text-center text-gray-600 mt-4">
          New here?{" "}
          <Link href="/signup" className="font-bold text-indigo-600 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
