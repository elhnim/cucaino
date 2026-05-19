import { redirect } from "next/navigation";
import Link from "next/link";
import { acceptInvite } from "@/lib/actions/invite";
import { createClient } from "@/lib/supabase/server";

export default async function AcceptInvitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const result = await acceptInvite();

  if (!result.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">😕</div>
          <h1 className="text-lg font-black text-gray-900">Invite not found</h1>
          <p className="text-sm text-gray-500 leading-relaxed">{result.error}</p>
          <Link
            href="/login"
            className="inline-block mt-2 px-5 py-2.5 rounded-2xl bg-gray-100 text-sm font-bold text-gray-700"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  redirect("/parent");
}
