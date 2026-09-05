/**
 * Qui dit oui.
 *
 * La garde produit un rapport ; elle ne decide pas a la place de l'humain. L'approbation est
 * une interface a une seule methode, pour que le point de branchement Ledger existe DES
 * MAINTENANT sans etre cable : le jour ou l'appareil approuve, on remplace l'implementation,
 * pas les appelants.
 *
 * Ce qui est cable ici :
 *   - confirmApprover : window.confirm, le defaut du navigateur ;
 *   - alwaysApprove / alwaysDeny : pour les tests et le mode "journal seul".
 *   - ledgerApprover : l'interface, plus le transport reel de ./ledger.ts (WebHID, EIP-712).
 *     Sans transport il REFUSE explicitement au lieu de laisser passer. Une garde qui echoue
 *     en "oui" ne garde rien.
 * Ce qui n'a jamais tourne :
 *   - le chemin Ledger contre un appareil physique ou contre Speculos. Il est teste contre un
 *     faux appareil, et rien d'autre : docs/LIMITS.md section 11.
 */
import type { GuardReport } from "./types.js";

export interface ApprovalDecision {
  approved: boolean;
  /** qui a decide */
  by: string;
  /** pourquoi, en clair */
  reason: string;
  /**
   * L'empreinte laissee par l'appareil, quand il y en a une. Pour Ledger c'est la signature
   * EIP-712 (r || s || v). Elle atteste d'une chose et d'une seule : cet appareil a affiche
   * ces champs et un humain a valide. Elle ne dit rien de la justesse du nombre affiche, ni
   * du sort de la transaction ensuite.
   */
  attestation?: string | null;
}

export interface Approver {
  readonly name: string;
  /** true si l'humain (ou l'appareil) laisse partir la transaction */
  approve(report: GuardReport): Promise<ApprovalDecision>;
}

/** Le texte montre a l'humain : le titre, puis une ligne citee par saut. */
export function renderPrompt(report: GuardReport): string {
  const lines: string[] = [report.headline, ""];
  for (const f of report.findings) {
    lines.push(`• ${f.sentence}`);
    lines.push(`  etiquette ${f.label}${f.reason ? ` (${f.reason})` : ""}`);
    if (f.replay) lines.push(`  rejouer : ${f.replay}`);
  }
  lines.push("");
  lines.push(
    `Table TARE : ${report.table.nMeasurements} mesures, ${report.table.nHooks} hooks, ` +
      `${report.table.nPools} pools, bloc ${report.table.blockNumber}, moteur ${report.table.engineVer ?? "?"}.`,
  );
  if (report.staleness.blocksBehind !== null) {
    lines.push(`La table a ${report.staleness.blocksBehind} blocs de retard sur la chaine.`);
  }
  for (const w of report.warnings) lines.push(`! ${w}`);
  return lines.join("\n");
}

/** Le defaut : une boite de dialogue. Hors navigateur, il refuse plutot que de supposer. */
export const confirmApprover: Approver = {
  name: "confirm",
  async approve(report) {
    const c = (globalThis as { confirm?: (m?: string) => boolean }).confirm;
    if (typeof c !== "function") {
      return {
        approved: false,
        by: "confirm",
        reason: "pas_de_confirm_disponible:refus_par_defaut",
        attestation: null,
      };
    }
    const ok = c(renderPrompt(report));
    return {
      approved: Boolean(ok),
      by: "confirm",
      reason: ok ? "humain_a_confirme" : "humain_a_refuse",
      attestation: null,
    };
  },
};

export const alwaysApprove: Approver = {
  name: "always-approve",
  async approve() {
    return { approved: true, by: "always-approve", reason: "mode_journal_seul", attestation: null };
  },
};

export const alwaysDeny: Approver = {
  name: "always-deny",
  async approve() {
    return { approved: false, by: "always-deny", reason: "refus_systematique", attestation: null };
  },
};

/**
 * Le point de branchement Ledger.
 *
 * Le transport reel vit dans ./ledger.ts (WebHID + @ledgerhq/hw-app-eth, message EIP-712) et
 * s'obtient par ledgerWebHidTransport(). Il n'a jamais tourne contre un appareil physique ni
 * contre Speculos : voir docs/LIMITS.md section 11. Ce fichier-ci ne connait que l'interface,
 * et tant que `transport` est absent la reponse est NON.
 *
 * Le rapport est passe EN PLUS du texte : un appareil a ecran veut des champs (le pool, le
 * hook, les bps, le bloc, la taille), pas un pave. Le parametre est optionnel pour que les
 * transports qui ne savent afficher que du texte restent valides.
 */
export interface LedgerTransport {
  /** montre le rapport sur l'appareil et rend l'attestation si l'utilisateur valide */
  showAndConfirm(text: string, report?: GuardReport): Promise<{ confirmed: boolean; attestation?: string }>;
}

export function ledgerApprover(transport?: LedgerTransport | null): Approver {
  return {
    name: "ledger",
    async approve(report) {
      if (!transport) {
        return {
          approved: false,
          by: "ledger",
          reason: "ledger_non_cable:transport_absent — la garde refuse au lieu de supposer",
          attestation: null,
        };
      }
      try {
        const r = await transport.showAndConfirm(renderPrompt(report), report);
        return {
          approved: Boolean(r.confirmed),
          by: "ledger",
          reason: r.confirmed ? "appareil_a_confirme" : "appareil_a_refuse",
          attestation: r.attestation ?? null,
        };
      } catch (e) {
        return {
          approved: false,
          by: "ledger",
          reason: `ledger_en_erreur:${e instanceof Error ? e.message : String(e)}`,
          attestation: null,
        };
      }
    },
  };
}

export interface GateOptions {
  /** les verdicts qui declenchent une demande d'approbation (defaut : warn et block) */
  askOn?: ("ok" | "warn" | "block")[];
}

/**
 * Le portillon : rapport + approbateur -> laisse passer, ou pas.
 * Un verdict 'ok' passe sans deranger personne ; le reste demande.
 */
export async function gate(
  report: GuardReport,
  approver: Approver,
  opts: GateOptions = {},
): Promise<ApprovalDecision> {
  const askOn = opts.askOn ?? ["warn", "block"];
  if (!askOn.includes(report.verdict)) {
    return { approved: true, by: "gate", reason: `verdict_${report.verdict}:pas_de_question`, attestation: null };
  }
  return approver.approve(report);
}
