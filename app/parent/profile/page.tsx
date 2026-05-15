import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getParentPinFromDb, getFamily } from "@/lib/data/stub";
import ParentProfileClient from "./ParentProfileClient";

export default async function ParentProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [parentPin, family] = await Promise.all([
    getParentPinFromDb(),
    getFamily(),
  ]);

  return (
    <ParentProfileClient
      email={user.email ?? ""}
      hasPin={!!parentPin}
      displayName={family?.parentDisplayName ?? ""}
      avatar={family?.parentAvatar ?? "🧙"}
      isFounder={family?.isFounder ?? false}
    />
  );
}
