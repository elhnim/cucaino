# Extending the app

The codebase is built around three small registries so that adding a new
page, theme, task category, or timeline section is a one-file change in
most cases.

## Add a new kid-side page

1. Create `app/kid/[kidId]/<your-page>/page.tsx`.
2. Use the `KidShell` wrapper:

```tsx
import KidShell from "@/components/kid/KidShell";
import { getKid } from "@/lib/data/stub";
import { notFound } from "next/navigation";

export default async function YourPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();
  return (
    <KidShell kid={kid} active="today">
      {/* ...your content... */}
    </KidShell>
  );
}
```

3. If the page should appear in the bottom nav, add an entry to
   `NAV_ITEMS` in `components/kid/KidShell.tsx`.

## Add a new parent page

Same pattern, with `ParentShell`:

```tsx
import ParentShell from "@/components/parent/ParentShell";

export default function YourParentPage() {
  return (
    <ParentShell active="overview" title="Page title">
      {/* ...content... */}
    </ParentShell>
  );
}
```

If it needs a nav slot, add it to `NAV` in
`components/parent/ParentShell.tsx`.

## Add a new theme

Edit `lib/themes/presets.ts`:

```ts
yourTheme: {
  id: "yourTheme",
  name: "Your Theme",
  description: "Short description",
  headerGradient: "from-... to-...",   // tailwind classes
  pageGradient: "from-... to-...",
  accent: "#hex",
  accentSoft: "#hex",
  headingText: "text-...",
  decoration: "🎨",
  flavor: "vibe",
},
```

Also extend the `ThemeId` union in `lib/domain/types.ts`.

## Add a new task category

Edit `lib/registry/category-registry.ts`. Each entry sets icon, badge
class, border class. UI components read from this registry so no
component code needs changing.

If you also want a new TS literal in the union, add it to `TaskCategory`
in `lib/domain/types.ts`.

## Add a new timeline section type

The `TimelineView` is registry-driven. To add a section:

1. Extend `SectionInput` in `lib/registry/section-registry.ts` with a new
   discriminated variant:

   ```ts
   | { type: "homework"; title: string; subjects: string[] }
   ```

2. Build the renderer at `components/kid/sections/HomeworkSection.tsx`.
3. Add a `case` in the switch inside `components/kid/TimelineView.tsx`.
4. Build the section's data in `lib/domain/schedule.ts` (or a new helper)
   and push it into the `sections` array returned by `buildTodaySections`.

The page (`app/kid/[kidId]/today/page.tsx`) doesn't change.

## Add a new quiz bank or built-in questions

Stub data lives in `lib/data/stub.ts`. Once Supabase is wired, this is
replaced by SQL — but the function signatures stay the same.

For a built-in bank: add a `QuizBank` entry with `isBuiltin: true` and
`familyId: null`, then add questions via the `q()` builder.

For a parent-custom bank: in production, this comes from the
`/parent/quizzes` editor. The route page is a placeholder right now.

## The data boundary

Every page imports from `@/lib/data/stub`. When Supabase is wired:

- Replace bodies of `lib/data/stub.ts` exports with Supabase queries
- Keep the same function signatures and return shapes
- No page or component changes required

This is the single seam between presentation and persistence.
