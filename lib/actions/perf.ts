"use server";

import { createClient } from "@/lib/supabase/server";

export type PerfMetricInput = {
  metric_name: string;
  value: number;
  rating?: string;
  page?: string;
  kid_id?: string;
  app_version?: string;
  query_name?: string;
  device_type?: string;
};

export async function logPerfMetric(metric: PerfMetricInput): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("perf_metrics").insert(metric);
  } catch {
    // never throw — perf logging must not break the app
  }
}
