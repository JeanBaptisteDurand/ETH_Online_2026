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
 * Ce qui ne l'est pas :
 *   - ledgerApprover : l'interface est ecrite, le transport ne l'est pas. Il REFUSE
 *     explicitement au lieu de laisser passer. Une garde qui echoue en "oui" ne garde rien.
 */
import type { GuardReport } from "./types.js";

export interface ApprovalDecision {
  approved: boolean;
  /** qui a decide */
  by: string;
  /** pourquoi, en clair */
  reason: string;
  /** empreinte laissee par l'appareil, quand il y en a une (Ledger : l'ecran signe) */
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
 * Le point de branchement Ledger, ecrit et NON CABLE.
 *
 * Ce qui manquera le jour du branchement, et rien d'autre : un transport
 * (@ledgerhq/hw-transport-webhid) et un ecran clair qui affiche la phrase de `renderPrompt`
 * avec les bps, le bloc et la taille. Tant que `transport` est absent, la reponse est NON.
 */
export interface LedgerTransport {
  /** montre le texte sur l'appareil et rend l'attestation si l'utilisateur valide */
  showAndConfirm(text: string): Promise<{ confirmed: boolean; attestation?: string }>;
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
        const r = await transport.showAndConfirm(renderPrompt(report));
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
