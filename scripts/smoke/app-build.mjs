// Bundles the WHOLE park screen (components/park/ParkApp.tsx: HUD, map, panels + the 3D world)
// with mock data and every server action stubbed, so the real kid UI can be screenshotted
// without a login or database:
//   node scripts/smoke/app-build.mjs <outdir>   (then serve <outdir> with serve.mjs)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// esbuild isn't a project dependency: use ESBUILD (path to an installed esbuild package) or a local one
const { build } = await import(process.env.ESBUILD ? pathToFileURL(resolve(process.env.ESBUILD, "lib/main.js")).href : "esbuild");
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = resolve(process.argv[2] ?? resolve(root, ".smoke-app"));
if (!existsSync(out)) mkdirSync(out, { recursive: true });

const mockFile = resolve(here, "app-mocks.ts");
const mockSrc = existsSync(mockFile) ? readFileSync(mockFile, "utf8") : "";

/** "use server" modules -> the same export names, each an async function that returns null */
const stubActions = {
  name: "stub-actions",
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/actions\// }, (a) => ({ path: resolve(root, a.path.replace(/^@\//, "")), namespace: "stub" }));
    b.onResolve({ filter: /^next\/(navigation|dynamic|link|headers)$/ }, (a) => ({ path: a.path, namespace: "next-stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => {
      const file = [".ts", ".tsx"].map((x) => a.path + x).find(existsSync) ?? a.path;
      const src = readFileSync(file, "utf8");
      const names = [...src.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);
      // sample data from app-mocks.ts wins over the null stub (same export name)
      const mocked = new Set([...mockSrc.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]));
      const lines = names.map((n) => (mocked.has(n) ? `export { ${n} } from ${JSON.stringify(mockFile)};` : `export async function ${n}() { return null; }`));
      return { contents: lines.join("\n") || "export {};", loader: "js", resolveDir: root };
    });
    b.onLoad({ filter: /.*/, namespace: "next-stub" }, (a) => {
      if (a.path === "next/navigation") return { contents: "export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){} }); export const usePathname = () => '/park/smoke'; export const useSearchParams = () => new URLSearchParams(location.search); export const redirect = () => {}; export const notFound = () => {};", loader: "js", resolveDir: root };
      if (a.path === "next/dynamic")
        return {
          contents: "import * as React from 'react'; export default function dynamic(load) { const L = React.lazy(() => load().then((c) => ({ default: c.default ?? c }))); return (p) => React.createElement(React.Suspense, { fallback: null }, React.createElement(L, p)); }",
          loader: "js",
          resolveDir: root,
        };
      if (a.path === "next/link") return { contents: "import * as React from 'react'; export default (p) => React.createElement('a', p);", loader: "js", resolveDir: root };
      return { contents: "export const cookies = () => ({ get(){}, set(){} }); export const headers = () => new Map();", loader: "js", resolveDir: root };
    });
  },
};

await build({
  entryPoints: [resolve(here, "app-harness.tsx")],
  bundle: true,
  outfile: resolve(out, "app-smoke.js"),
  format: "iife",
  jsx: "automatic",
  plugins: [stubActions],
  loader: { ".png": "dataurl", ".webp": "dataurl", ".mp3": "empty", ".wav": "empty", ".css": "empty" },
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '"http://localhost"', "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"x"', "process.env": "{}" },
  logLevel: "warning",
});
writeFileSync(
  resolve(out, "app.html"),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@400..1000&display=swap" rel="stylesheet"><style>html,body{margin:0;height:100%;font-family:system-ui,sans-serif}:root{--font-park-display:'Lilita One';--font-nunito:'Nunito'}.hidden{display:none!important}</style></head><body><div id="app"></div><script src="app-smoke.js"></script></body></html>`,
);
console.log("built", out);
