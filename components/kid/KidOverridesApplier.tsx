"use client";

import { useEffect, useState } from "react";
import { getKidOverride } from "@/lib/data/kid-overrides";
import type { Kid } from "@/lib/domain/types";
import { getTheme } from "@/lib/themes/presets";
import BirthdayBanner from "@/components/kid/BirthdayBanner";

/**
 * Hydrates after server render to apply localStorage profile overrides
 * (name, avatar, theme, DOB) and inject the BirthdayBanner if applicable.
 *
 * Strategy: re-read the override on mount and on storage events, then
 * patch the visible header DOM elements via data-attributes. We also
 * show the BirthdayBanner here as it depends on DOB which can be edited.
 *
 * When Supabase is wired, this component is removed — pages render with
 * the database values directly.
 */
export default function KidOverridesApplier({ kid }: { kid: Kid }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener("storage", onChange);
    window.addEventListener("kid-override-changed", onChange as EventListener);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("kid-override-changed", onChange as EventListener);
    };
  }, []);

  useEffect(() => {
    const ov = getKidOverride(kid.id);
    // Patch header avatar/name in the DOM
    document
      .querySelectorAll<HTMLElement>(`[data-kid-name="${kid.id}"]`)
      .forEach((el) => {
        if (ov.name) el.textContent = ov.name;
      });
    document
      .querySelectorAll<HTMLElement>(`[data-kid-avatar="${kid.id}"]`)
      .forEach((el) => {
        if (ov.avatar) el.textContent = ov.avatar;
      });
    // Theme override is harder to patch from JS (Tailwind classes baked in
    // at SSR). For now, theme switches require a full reload.
  }, [kid.id, tick]);

  const ov = getKidOverride(kid.id);
  const effectiveDob = ov.dateOfBirth !== undefined ? ov.dateOfBirth : kid.dateOfBirth;
  const effectiveName = ov.name ?? kid.name;
  const theme = getTheme(ov.themeId ?? kid.themeId);

  return <BirthdayBanner name={effectiveName} dateOfBirth={effectiveDob} accent={theme.accent} />;
}
