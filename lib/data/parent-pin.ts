"use client";

const KEY = "cucaino-parent-pin";

export function getParentPin(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setParentPin(pin: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, pin);
}

export function clearParentPin(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
