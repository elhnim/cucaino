"use client";

import { useState, useEffect, useCallback } from "react";

export interface WidgetPrefs {
  order: string[];
  hidden: string[];
  widths: Record<string, "full" | "half">;
}

function loadPrefs(
  storageKey: string,
  defaults: string[],
  defaultWidths: Record<string, "full" | "half">,
): WidgetPrefs {
  if (typeof window === "undefined") return { order: defaults, hidden: [], widths: defaultWidths };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { order: defaults, hidden: [], widths: defaultWidths };
    const parsed = JSON.parse(raw) as Partial<WidgetPrefs>;
    const savedOrder = Array.isArray(parsed.order) ? parsed.order : [];
    const merged = [
      ...savedOrder.filter((id) => defaults.includes(id)),
      ...defaults.filter((id) => !savedOrder.includes(id)),
    ];
    return {
      order: merged,
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((id) => defaults.includes(id)) : [],
      widths: { ...defaultWidths, ...(typeof parsed.widths === "object" ? parsed.widths : {}) },
    };
  } catch {
    return { order: defaults, hidden: [], widths: defaultWidths };
  }
}

export function useWidgetPrefs(
  storageKey: string,
  defaults: string[],
  defaultWidths: Record<string, "full" | "half"> = {},
) {
  const [prefs, setPrefs] = useState<WidgetPrefs>(() => ({
    order: defaults,
    hidden: [],
    widths: defaultWidths,
  }));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs(storageKey, defaults, defaultWidths));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const save = useCallback((next: WidgetPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  }, [storageKey]);

  const reorder = useCallback((newOrder: string[]) => {
    save({ ...prefs, order: newOrder });
  }, [prefs, save]);

  const toggleHidden = useCallback((id: string) => {
    const hidden = prefs.hidden.includes(id)
      ? prefs.hidden.filter((h) => h !== id)
      : [...prefs.hidden, id];
    save({ ...prefs, hidden });
  }, [prefs, save]);

  const toggleWidth = useCallback((id: string) => {
    const current = prefs.widths[id] ?? defaultWidths[id] ?? "full";
    save({ ...prefs, widths: { ...prefs.widths, [id]: current === "full" ? "half" : "full" } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, save]);

  return { prefs, editing, setEditing, reorder, toggleHidden, toggleWidth };
}
