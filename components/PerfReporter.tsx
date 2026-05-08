"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { logPerfMetric } from "@/lib/actions/perf";

function getDeviceType(): string {
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1280) return "tablet";
  return "desktop";
}

function extractKidId(pathname: string): string | undefined {
  const match = pathname.match(/\/kid\/([^/]+)/);
  return match?.[1];
}

export default function PerfReporter() {
  const pathname = usePathname();

  useEffect(() => {
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION;
    const deviceType = getDeviceType();
    const kidId = extractKidId(pathname);

    const report = (name: string, value: number, rating?: string) => {
      logPerfMetric({
        metric_name: name,
        value,
        rating,
        page: pathname,
        kid_id: kidId,
        app_version: appVersion,
        device_type: deviceType,
      }).catch(() => {});
    };

    onLCP((m) => report("LCP", m.value, m.rating));
    onCLS((m) => report("CLS", m.value, m.rating));
    onTTFB((m) => report("TTFB", m.value, m.rating));
    onINP((m) => report("INP", m.value, m.rating));
    onFCP((m) => report("FCP", m.value, m.rating));
  }, [pathname]);

  return null;
}
