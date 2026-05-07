import { listKids } from "@/lib/data/stub";
import { listAllSchoolItems } from "@/lib/data/queries";
import SchoolItemsEditor from "@/components/parent/SchoolItemsEditor";

export default async function ParentSchoolItemsPage() {
  const [kids, items] = await Promise.all([listKids(), listAllSchoolItems()]);
  return <SchoolItemsEditor kids={kids} initialItems={items} />;
}
