/**
 * Configuration. Le .env de la racine est lu une fois, jamais journalise.
 *
 * Aucune valeur secrete ne sort par une route : /meta n'expose que des booleens
 * "present / absent" et les valeurs publiques (reseau, facilitateur, prix).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT, API_ROOT } from "./paths.js";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // l'environnement du processus gagne toujours sur le fichier
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(resolve(REPO_ROOT, ".env"));
loadEnvFile(resolve(API_ROOT, ".env"));

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}

export interface Config {
  port: number;
  chainId: number;
  /** RPC du fork anvil que le moteur interroge */
  rpcUrl: string;
  forkBlock: number;
  /** x402 */
  x402Enabled: boolean;
  x402Network: string;
  facilitatorUrl: string;
  hederaFeePayer: string;
  /** compte qui encaisse. A defaut, le feePayer lu dans .env (voir README). */
  payTo: string;
  /** prix d'UNE mesure, en USD. L'unite facturee est la mesure, pas la requete. */
  unitPriceUsd: number;
  /** nombre max de mesures qu'une requete peut demander */
  maxUnitsPerRequest: number;
  /** binaire python du moteur */
  python: string;
  /** ecriture du journal d'usage sur disque */
  usageLogPath: string;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const base: Config = {
    port: Number(str("PORT", "8787")),
    chainId: Number(str("CHAIN_ID", "8453")),
    rpcUrl: str("TARE_RPC_URL", str("ANVIL_RPC_URL", "http://127.0.0.1:8545")),
    forkBlock: Number(str("FORK_BLOCK", "50614000")),
    x402Enabled: str("X402_ENABLED", "1") !== "0",
    x402Network: str("HEDERA_NETWORK", "hedera:testnet"),
    facilitatorUrl: str("BLOCKY402_URL", "https://api.testnet.blocky402.com"),
    hederaFeePayer: str("HEDERA_FEE_PAYER", "0.0.7162784"),
    payTo: str("HEDERA_PAY_TO", str("HEDERA_FEE_PAYER", "0.0.7162784")),
    unitPriceUsd: Number(str("TARE_UNIT_PRICE_USD", "0.001")),
    maxUnitsPerRequest: Number(str("TARE_MAX_UNITS", "10")),
    python: str("PYTHON", "python3"),
    usageLogPath: str("TARE_USAGE_LOG", resolve(API_ROOT, "var", "usage.jsonl")),
  };
  return { ...base, ...overrides };
}

/** Normalise "hedera:testnet" quelle que soit la forme ecrite dans .env. */
export function normalizeNetwork(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v === "testnet" || v === "hedera-testnet") return "hedera:testnet";
  if (v === "mainnet" || v === "hedera-mainnet") return "hedera:mainnet";
  return v;
}
