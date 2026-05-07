/**
 * TimelineView — renders a list of `SectionInput` items.
 *
 * The renderer dispatch happens here. Adding a new section type:
 *   1. Extend `SectionInput` in lib/registry/section-registry.ts
 *   2. Build a renderer in components/kid/sections/
 *   3. Add a case below
 *
 * No layout/page code needs to change.
 */

import type { TaskCompletion } from "@/lib/domain/types";
import type { SectionInput } from "@/lib/registry/section-registry";
import SchoolBagSection from "@/components/kid/sections/SchoolBagSection";
import TimeBlockSection from "@/components/kid/sections/TimeBlockSection";

export default function TimelineView({
  sections,
  completions,
  accent,
}: {
  sections: SectionInput[];
  completions: TaskCompletion[];
  accent: string;
}) {
  const completedTaskIds = new Set(completions.map((c) => c.taskId));

  return (
    <div className="p-4 md:p-5 space-y-5">
      {sections.map((section, index) => {
        switch (section.type) {
          case "school-bag":
            return (
              <SchoolBagSection
                key={`school-bag-${section.mode}-${index}`}
                section={section}
              />
            );
          case "time-block":
            return (
              <TimeBlockSection
                key={`tb-${section.key}`}
                section={section}
                accent={accent}
                completedTaskIds={completedTaskIds}
              />
            );
          case "quiz-prompt":
            // Renderer to be added when quiz-on-Today is wired
            return null;
        }
      })}
    </div>
  );
}
