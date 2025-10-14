import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "examples/**/node_modules/**"
    ],
  },
  { 
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], 
    plugins: { js }, 
    
    extends: ["js/recommended"], 
    languageOptions: { 
      globals: { 
        ...globals.node 
      }, 
    } 
  },
  tseslint.configs.recommended,
]);
