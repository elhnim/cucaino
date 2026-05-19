"use client";

import { useState, useEffect, useCallback } from "react";

export interface WidgetPrefs {
  order: string[];
  hidden: string[];
}

function loadPrefs(storageKey: string, defaults: string[]): WidgetPrefs {
  if (typeof window === "undefined") return { order: defaults, hidden: [] };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { order: defaults, hidden: [] };
    const parsed = JSON.parse(raw) as Partial<WidgetPrefs>;
    // Merge: keep saved order but add any new defaults that aren't present yet
    const savedOrder = Array.isArray(parsed.order) ? parsed.order : [];
    const merged = [
      ...savedOrder.filter((id) => defaults.includes(id)),
      ...defaults.filter((id) => !savedOrder.includes(id)),
    ];
    return {
      order: merged,
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((id) => defaults.includes(id)) : [],
    };
  } catch {
    return { order: defaults, hidden: [] };
  }
}

export function useWidgetPrefs(storageKey: string, defaults: string[]) {
  const [prefs, setPrefs] = useState<WidgetPrefs>(() => ({ order: defaults, hidden: [] }));
  const [editing, setEditing] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    setPrefs(loadPrefs(storageKey, defaults));
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

  return { prefs, editing, setEditing, reorder, toggleHidden };
}
