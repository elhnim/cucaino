import Link from "next/link";
import SignupForm from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 p-6 flex flex-col items-center justify-center font-fun">
      <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-black text-indigo-900">
            Welcome to Cucaino ✨
          </h1>
          <p className="text-sm text-indigo-700 mt-2">
            Create your family account in 30 seconds.
          </p>
        </div>
        <SignupForm />
        <p className="text-sm text-center text-gray-600 mt-4">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-indigo-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
