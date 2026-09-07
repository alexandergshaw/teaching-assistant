import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the "@/..." path alias (mirrors tsconfig "paths") so tests can import
// app modules the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // src/lib/signup-rules.ts deliberately starts with `import "server-only";`
      // as a build-time guard: without it, importing that module from a client
      // component would silently no-op SIGNUP_MODE=closed and the domain
      // allowlist, because non-NEXT_PUBLIC_ env vars are undefined in the
      // browser and this module's fallbacks are permissive. The "server-only"
      // package throws unconditionally outside an RSC build (it only swaps in
      // its empty stub under the "react-server" export condition, which plain
      // Node/Vitest never sets), so it must be aliased to that stub here for
      // tests to import the module at all. Next's own Jest preset does the
      // same thing (node_modules/next/dist/build/jest/jest.js maps
      // '^server-only$' to an empty mock) - this does not weaken the guard
      // for `next build`, which resolves the package normally.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url)
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Blocks real network calls - see vitest.setup.ts for the sabotage check
    // that passed for the wrong reason and prompted it.
    setupFiles: ["./vitest.setup.ts"],
    // Tests must be hermetic: blank out the Supabase config so database-backed
    // code paths always take their in-repo fallbacks under vitest.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
});
