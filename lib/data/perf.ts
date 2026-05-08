import { logPerfMetric } from "@/lib/actions/perf";

export function timed<TArgs extends unknown[], TReturn>(
  name: string,
  fn: (...args: TArgs) => Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const start = performance.now();
    try {
      return await fn(...args);
    } finally {
      const value = performance.now() - start;
      logPerfMetric({
        metric_name: "query",
        query_name: name,
        value,
        app_version: process.env.NEXT_PUBLIC_APP_VERSION,
      }).catch(() => {});
    }
  };
}
