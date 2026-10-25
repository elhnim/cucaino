import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: { testTimeout: 60_000, include: ["lib/dream-life/**/*.test.ts", "lib/game3d/**/*.test.ts", "lib/park/**/*.test.ts", "lib/retro/**/*.test.ts", "lib/arcade/**/*.test.ts", "lib/stories/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname) } },
})
