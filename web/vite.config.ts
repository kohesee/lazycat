import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "cbw-sdk": fileURLToPath(new URL("./src/cbw-sdk-stub.ts", import.meta.url)),
    },
  },
});
