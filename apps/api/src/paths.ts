import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** apps/api */
export const API_ROOT = resolve(here, "..");
/** racine du depot */
export const REPO_ROOT = resolve(API_ROOT, "..", "..");
export const DOCS_DIR = resolve(REPO_ROOT, "docs");
export const ENGINE_DIR = resolve(REPO_ROOT, "engine");
export const VAR_DIR = resolve(API_ROOT, "var");
