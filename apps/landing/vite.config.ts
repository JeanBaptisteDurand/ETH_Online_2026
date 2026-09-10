import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { render } from "./build/html.mjs";

const HERE = __dirname;

/**
 * The page is the verdict, so the verdict cannot depend on JavaScript.
 * This plugin bakes every section into index.html at build time, out of facts.json —
 * which build/facts.mjs derived from the corpus, the engine's stub and its A3 gate.
 */
function bakeFacts(): Plugin {
  return {
    name: "tare-bake-facts",
    enforce: "pre",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const facts = JSON.parse(readFileSync(resolve(HERE, "src/generated/facts.json"), "utf8"));
        const { header, body, foot } = render(facts);
        return html
          .replace("<!--%HEADER%-->", header)
          .replace("<!--%BODY%-->", body)
          .replace("<!--%FOOT%-->", foot);
      },
    },
  };
}

/**
 * Inline the whole stylesheet into <head> and drop the <link>. The page ships one document
 * and zero render-blocking requests: the first screen paints from bytes that were already
 * in the response. Skipped in dev so HMR keeps working.
 */
function inlineCss(): Plugin {
  return {
    name: "tare-inline-css",
    apply: "build",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        let css = "";
        for (const [file, asset] of Object.entries(ctx.bundle ?? {})) {
          if (!file.endsWith(".css") || asset.type !== "asset") continue;
          css += String(asset.source);
          delete (ctx.bundle as Record<string, unknown>)[file];
        }
        return html
          .replace(/<link rel="stylesheet"[^>]*>/g, "")
          .replace("<!--%CSS%-->", css ? `<style>${css}</style>` : "");
      },
    },
  };
}

export default defineConfig({
  // Comme apps/web. Sur une page de PROJET GitHub Pages, le site est servi sous
  // /<depot>/ et non sous / : une base figee a "/" casse chaque chemin absolu — les
  // polices, l'icone, le module d'amorcage — et la page se charge nue.
  base: process.env.BASE_URL ?? "/",
  plugins: [bakeFacts(), inlineCss()],
  css: { devSourcemap: true },
  build: {
    target: "es2022",
    cssCodeSplit: false,
    assetsDir: "",
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        entryFileNames: "[name]-[hash].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
  server: { port: 5174, strictPort: false },
  preview: { port: 4173, strictPort: false },
});
