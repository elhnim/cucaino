"use client";

import { useTransition } from "react";
import { updateTimezone } from "@/lib/actions/parent-settings";

const TIMEZONES = [
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
  { value: "Australia/Melbourne", label: "Australia/Melbourne (AEST)" },
  { value: "Australia/Brisbane", label: "Australia/Brisbane (AEST)" },
  { value: "Australia/Perth", label: "Australia/Perth (AWST)" },
  { value: "America/New_York", label: "America/New York (EST)" },
  { value: "America/Los_Angeles", label: "America/Los Angeles (PST)" },
  { value: "America/Chicago", label: "America/Chicago (CST)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "UTC", label: "UTC" },
];

export default function TimezoneSelector({ current }: { current: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={current}
      disabled={isPending}
      onChange={(e) => {
        const tz = e.target.value;
        startTransition(async () => { await updateTimezone(tz); });
      }}
      className="block w-full text-[12px] text-gray-400 border-none bg-transparent p-0 mt-0.5 focus:outline-none disabled:opacity-50"
    >
      {TIMEZONES.map((tz) => (
        <option key={tz.value} value={tz.value}>{tz.label}</option>
      ))}
    </select>
  );
}
