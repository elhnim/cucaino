import ParentPinClient from "@/components/parent/ParentPinClient";
import { getParentPinFromDb } from "@/lib/data/stub";

const commit = process.env.COMMIT_REF?.slice(0, 7) ?? process.env.NEXT_PUBLIC_COMMIT_REF?.slice(0, 7) ?? "dev";

export default async function ParentSettingsPage() {
  const currentPin = await getParentPinFromDb();
  return (
    <div className="p-4 space-y-4">
      <ParentPinClient currentPin={currentPin} />
      <p className="text-center text-xs text-gray-400 pt-2">
        Cucaino · build <span className="font-mono">{commit}</span>
      </p>
    </div>
  );
}
