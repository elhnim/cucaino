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
      // Every log is an extra DB insert on the request path. Keep all slow queries (the ones
      // worth investigating) but only a 10% sample of normal ones.
      if (value >= 500 || Math.random() < 0.1) void logPerfMetric({
        metric_name: "query",
        query_name: name,
        value,
        app_version: process.env.NEXT_PUBLIC_APP_VERSION,
      }).catch(() => {});
    }
  };
}
