import Link from "next/link";
import { listKids } from "@/lib/data/stub";
import { listAllSchoolItems } from "@/lib/data/queries";
import SchoolItemsEditor from "@/components/parent/SchoolItemsEditor";

export default async function ParentSchoolItemsPage() {
  const [kids, items] = await Promise.all([listKids(), listAllSchoolItems()]);
  return (
    <>
      <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800">
        <span className="font-bold">School items are moving to Tasks</span> — create an{" "}
        <Link href="/parent/tasks/new" className="underline font-semibold">Activity task</Link>{" "}
        with a packing list instead. Existing items are still saved here.
      </div>
      <SchoolItemsEditor kids={kids} initialItems={items} />
    </>
  );
}
