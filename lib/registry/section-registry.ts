/**
 * Timeline section registry — TimelineView renders a list of sections.
 *
 * Each section has a `type` and a per-type renderer component. To add a
 * new section type (e.g., "homework", "morning-meditation"):
 *   1. Define a new SectionInput discriminated union variant below.
 *   2. Create the renderer in components/kid/sections/.
 *   3. Add an entry in SECTION_RENDERERS.
 *
 * TimelineView itself doesn't change.
 */

import type { ComponentType } from "react";
import type { Task, SchoolItem } from "@/lib/domain/types";

/** All possible section inputs the kid Today timeline can render. */
export type SectionInput =
  | {
      type: "school-bag";
      title: string;
      caption: string;
      items: SchoolItem[];
      mode: "morning" | "evening";
    }
  | {
      type: "time-block";
      key: string; // unique key per render (e.g., "morning")
      title: string;
      blockEmoji: string;
      isCurrent: boolean;
      summary?: string; // e.g., "2 of 2 done"
      tasks: Task[];
    }
  | {
      type: "quiz-prompt";
      title: string;
      caption: string;
      bankIds: string[];
    };

/** Component signature for any section renderer. */
export type SectionRenderer<T extends SectionInput = SectionInput> =
  ComponentType<{ section: T }>;

/**
 * The registry maps a section's `type` to its renderer. Stored separately
 * from the section types so renderers can use server/client components,
 * imports stay tree-shakable, and the wiring lives in one place.
 *
 * Imports happen in app/(kid)/.../timeline.tsx so server components stay
 * server-only — see registerSectionRenderers().
 */
export type SectionRendererMap = {
  [K in SectionInput["type"]]?: SectionRenderer<
    Extract<SectionInput, { type: K }>
  >;
};
