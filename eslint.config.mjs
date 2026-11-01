import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
export default defineConfig([
  ...next,
  ...typescript,
  {
    rules: {
      // Existing polling components intentionally synchronize state in effects.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
  globalIgnores([".next*/**", "out/**", "next-env.d.ts", ".npm-cache/**"]),
]);
