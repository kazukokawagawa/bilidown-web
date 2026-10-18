import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "release/**",
    "electron/**",
    "next-env.d.ts",
    // scripts/prepare-ffmpeg-wasm.mjs 从 node_modules 复制的第三方 ESM 产物（构建时生成，不参与源码 lint）
    "public/ffmpeg/**",
  ]),
]);

export default eslintConfig;
