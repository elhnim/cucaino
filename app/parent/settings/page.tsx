import ParentPinClient from "@/components/parent/ParentPinClient";
import { getParentPinFromDb } from "@/lib/data/stub";

export default async function ParentSettingsPage() {
  const currentPin = await getParentPinFromDb();
  return (
    <div className="p-4 space-y-4">
      <ParentPinClient currentPin={currentPin} />
    </div>
  );
}
