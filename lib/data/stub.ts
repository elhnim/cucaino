/**
 * Compatibility shim — `lib/data/stub.ts` was the original seed-data module.
 *
 * Now that Supabase is wired, every consumer of these functions gets real
 * data from `lib/data/queries.ts`. The file lives on to avoid a sweeping
 * import rename across all pages.
 */

export * from "@/lib/data/queries";
