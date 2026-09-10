/**
 * POST /alternative — « et si je passais par une autre porte ? »
 *
 * C'est la route qui rend la substitution ATTEIGNABLE. Le calcul existait depuis
 * `packages/guard/src/alternative.ts`, mais aucun client HTTP ne pouvait le demander : la
 * comparaison etait un test qui passait, pas un service qui repondait.
 *
 * LA REPONSE A DEUX ETAGES, et le second coute de l'argent :
 *
 *   1. LA COMPARAISON. Entierement locale, sur la table des 125 072 mesures du bloc
 *      50 614 000. Zero appel reseau. Elle rend l'un des six etats nommes, et dans 99,8 % des
 *      cas la reponse est « il n'y a qu'une porte » — ce qui est une reponse, pas un echec.
 *
 *   2. LA TRANSACTION. Construite UNIQUEMENT si l'etage 1 a trouve une porte mesuree moins
 *      chere. Elle exige trois lectures on-chain (une cotation vivante, l'allowance du jeton
 *      vers Permit2, l'autorisation du routeur chez Permit2), et donc trois `eth_call`
 *      factures.
 *
 * POURQUOI CET ORDRE COMPTE EN ARGENT REEL : la porte unique est le cas ecrasant. Faire les
 * lectures d'abord, puis decouvrir qu'il n'y a rien a proposer, paierait trois appels RPC pour
 * 99,8 % des requetes et n'en servirait aucun. La route ne touche au reseau qu'apres avoir
 * verifie qu'il y a quelque chose a proposer, et `appels_rpc` est rendu dans la reponse pour
 * qu'on puisse le compter.
 *
 * CE QU'ELLE NE FAIT JAMAIS : envoyer. Elle rend `{to, data, value}` ou un etat nomme qui dit
 * ce qui manque. La derniere main sur la transaction est celle de l'utilisateur — c'est la
 * regle dure n.3 de la porte de remplacement, et elle vaut aussi de ce cote du HTTP.
 */
import { Hono } from "hono";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "./paths.js";
import { loadConfig } from "./config.js";

// apps/api ne declare pas @tare/guard en dependance : meme choix explicite que chaine/run.ts.
type Guard = typeof import("../../../packages/guard/src/index.js");
const CHEMIN_GUARD = "../../../packages/guard/src/index.js";
const CHEMIN_TABLE = "packages/guard/data/table.json";

const Corps = z
  .object({
    /** un calldata complet : la porte visee en est lue */
    calldata: z.string().regex(/^0x[0-9a-fA-F]*$/).optional(),
    /** ou la porte, donnee explicitement */
    pool_id: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
    direction: z.enum(["0->1", "1->0"]).optional(),
    amount_in: z.string().regex(/^[0-9]+$/).optional(),
    /** l'adresse qui signera : sans elle, aucune lecture Permit2 n'est possible */
    proprietaire: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
    tolerance_bps: z.number().int().min(0).max(9999).optional(),
    /** un permit deja signe, a presenter avant le swap */
    permit: z
      .object({
        permit: z.object({
          details: z.object({
            token: z.string(),
            amount: z.string(),
            expiration: z.string(),
            nonce: z.string(),
          }),
          spender: z.string(),
          sigDeadline: z.string(),
        }),
        signature: z.string(),
      })
      .optional(),
    /** false : on ne fait AUCUN appel reseau, on rend la comparaison seule */
    construire: z.boolean().default(true),
  })
  .refine((b) => b.calldata !== undefined || (b.pool_id !== undefined && b.direction !== undefined), {
    message: "donne soit `calldata`, soit `pool_id` + `direction`",
  });

export interface AlternativeRouterDeps {
  /** injectable pour les tests : le noeud interroge */
  rpc?: string;
  fetchImpl?: typeof fetch;
  /** injectable pour les tests : l'heure, en secondes Unix */
  maintenant?: () => bigint;
}

const USAGE = {
  route: "POST /alternative",
  quoi: "compare cette porte aux autres portes MESUREES du meme jeton, a la meme taille, et — seulement s'il y en a une moins chere — construit la transaction de remplacement",
  corps: {
    calldata: "0x… le calldata du swap a examiner (ou pool_id + direction + amount_in)",
    pool_id: "0x… (64 hex) l'identifiant du pool vise",
    direction: "'0->1' ou '1->0'",
    amount_in: "la taille, en unites du jeton d'entree",
    proprietaire: "0x… l'adresse qui signera. Sans elle, l'etat Permit2 n'est pas lu et la reponse s'arrete a la comparaison",
    tolerance_bps: "la marge de prix du plancher de sortie (50 par defaut, soit 0,5 %)",
    permit: "un permit deja signe, pour que la transaction ne demande qu'un envoi",
    construire: "false pour n'obtenir que la comparaison, sans aucun appel reseau",
  },
  ce_qu_elle_ne_fait_pas: "elle n'envoie rien et ne signe rien : elle rend une transaction a signer, ou dit ce qui manque",
};

export function createAlternativeRouter(deps: AlternativeRouterDeps = {}): Hono {
  const app = new Hono();
  let guard: Guard | null = null;
  let table: ReturnType<Guard["assertTable"]> | null = null;

  async function charger(): Promise<{ g: Guard; t: NonNullable<typeof table> }> {
    if (!guard) guard = (await import(CHEMIN_GUARD)) as Guard;
    if (!table)
      table = guard.assertTable(
        JSON.parse(readFileSync(resolve(REPO_ROOT, CHEMIN_TABLE), "utf8")),
      );
    return { g: guard, t: table };
  }

  app.get("/alternative", (c) => c.json({ usage: USAGE }));

  app.post("/alternative", async (c) => {
    let brut: unknown;
    try {
      brut = await c.req.json();
    } catch {
      return c.json({ error: "corps JSON illisible", usage: USAGE }, 400);
    }
    const parse = Corps.safeParse(brut);
    if (!parse.success)
      return c.json(
        { error: "corps invalide", details: parse.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), usage: USAGE },
        400,
      );
    const b = parse.data;

    const { g, t } = await charger();

    /* ---------------------------------------- la porte visee */

    let poolId = b.pool_id ?? null;
    let direction = b.direction ?? null;
    let amountIn = b.amount_in ?? null;
    let lu: { verdict: string; complete: boolean; headline: string } | null = null;

    if (b.calldata) {
      const rapport = g.tareGuard({ data: b.calldata });
      const f = rapport.findings[0];
      // Un calldata a plusieurs jambes ne se compare pas : au deuxieme saut, la taille depend
      // de l'execution du premier, donc aucune comparaison a taille egale n'est possible.
      if (rapport.findings.length > 1)
        return c.json(
          {
            error: "chemin multi-saut",
            raison:
              `ce calldata porte ${rapport.findings.length} jambes. A partir du deuxieme saut, la ` +
              "taille depend de l'execution du premier : comparer deux portes a taille egale est " +
              "impossible, et fabriquer une economie serait pire que de ne rien proposer",
            headline: rapport.headline,
          },
          422,
        );
      if (!f)
        return c.json(
          {
            error: "aucune jambe de swap lue",
            raison: rapport.headline,
            calldata_lu_en_entier: rapport.complete,
            warnings: rapport.warnings,
          },
          422,
        );
      poolId = f.leg.poolId;
      direction = f.leg.direction;
      amountIn = f.leg.amountIn;
      lu = { verdict: rapport.verdict, complete: rapport.complete, headline: rapport.headline };
    }

    if (!poolId || !direction)
      return c.json({ error: "porte non determinee", usage: USAGE }, 400);

    /* ------------------------------- etage 1 : la comparaison, sans un octet de reseau */

    const alt = g.chercherAlternative(t, poolId, direction, amountIn);
    if (!alt)
      return c.json({ error: "comparaison impossible", pool_id: poolId, direction }, 422);

    const base = {
      lu,
      alternative: alt,
      table: {
        block_number: t.block_number,
        chain_id: t.chain_id,
        n_measurements: t.n_measurements,
        source: t.source,
      },
      appels_rpc: 0,
      lectures: [] as { quoi: string; rejeu: string; raison: string | null }[],
    };

    if (alt.etat !== "MEILLEURE_PORTE" || !alt.proposee || alt.proposee.amountIn === null) {
      // Le cas ecrasant. On n'a touche a aucun noeud, et la reponse le dit.
      const envoi = g.transactionDeRemplacement(alt, { cotation: null, maintenant: 0n });
      return c.json({ ...base, envoi: { ...envoi, raison: envoi.raison } });
    }

    if (!b.construire)
      return c.json({
        ...base,
        envoi: {
          etat: "NON_DEMANDE",
          raison:
            "une porte mesuree moins chere existe, mais `construire` vaut false : aucune lecture " +
            "on-chain n'a ete faite, donc aucune transaction n'est rendue",
        },
      });

    /* ------------------- etage 2 : les lectures. Elles coutent, et on les compte. */

    const cfg = loadConfig();
    const rpc = deps.rpc ?? process.env["TARE_SUBSTITUTION_RPC"] ?? cfg.rpcUrl;
    const noeud = { rpc, fetchImpl: deps.fetchImpl, timeoutMs: 8000 };
    const maintenant = deps.maintenant ? deps.maintenant() : BigInt(Math.floor(Date.now() / 1000));
    const p = alt.proposee;
    const montant = BigInt(alt.proposee.amountIn);
    const lectures: { quoi: string; rejeu: string; raison: string | null }[] = [];
    let appels = 0;

    // (a) la cotation vivante : le plancher de sortie ne peut venir que de la.
    const cot = await g.coter(noeud, {
      poolKey: p.poolKey,
      zeroForOne: p.zeroForOne,
      amountIn: montant,
    });
    appels += 1;
    lectures.push({ quoi: "cotation de la porte proposee", rejeu: cot.rejeu, raison: cot.raison });

    // (b) et (c) l'etat Permit2, seulement si le swap depense un ERC-20 et qu'aucun permit
    // signe n'a ete fourni. En ETH natif il n'y a rien a autoriser : deux appels economises.
    const monnaieEntree = (p.zeroForOne ? p.poolKey.currency0 : p.poolKey.currency1).toLowerCase();
    const native = monnaieEntree === "0x0000000000000000000000000000000000000000";
    let etatPermit2:
      | { allowanceVersPermit2: bigint | null; autorisationDuRouteur: { montant: bigint; expiration: bigint; nonce: bigint } | null }
      | undefined;

    if (!native && !b.permit) {
      if (!b.proprietaire) {
        return c.json({
          ...base,
          appels_rpc: appels,
          lectures,
          envoi: {
            etat: "ETAT_PERMIT2_INCONNU",
            raison:
              `ce swap depense un ERC-20 (${monnaieEntree}) : l'etat Permit2 depend de QUI signe, et ` +
              "`proprietaire` n'a pas ete donne. Rappelle la route avec l'adresse du signataire, ou " +
              "fournis un permit deja signe",
            monnaieEntree,
            native: false,
          },
        });
      }
      const [all, aut] = await Promise.all([
        g.lireAllowanceVersPermit2(noeud, {
          token: monnaieEntree,
          proprietaire: b.proprietaire,
          permit2: g.PERMIT2,
        }),
        g.lireAutorisationDuRouteur(noeud, {
          permit2: g.PERMIT2,
          proprietaire: b.proprietaire,
          token: monnaieEntree,
          spender: g.UNIVERSAL_ROUTER_BASE,
        }),
      ]);
      appels += 2;
      lectures.push({ quoi: "allowance du jeton vers Permit2", rejeu: all.rejeu, raison: all.raison });
      lectures.push({ quoi: "autorisation du routeur chez Permit2", rejeu: aut.rejeu, raison: aut.raison });
      etatPermit2 = { allowanceVersPermit2: all.montant, autorisationDuRouteur: aut.autorisation };
    }

    const permit = b.permit
      ? {
          permit: {
            details: {
              token: b.permit.permit.details.token,
              amount: BigInt(b.permit.permit.details.amount),
              expiration: BigInt(b.permit.permit.details.expiration),
              nonce: BigInt(b.permit.permit.details.nonce),
            },
            spender: b.permit.permit.spender,
            sigDeadline: BigInt(b.permit.permit.sigDeadline),
          },
          signature: b.permit.signature,
        }
      : undefined;

    const envoi = g.transactionDeRemplacement(alt, {
      cotation: cot.amountOut,
      maintenant,
      toleranceBps: b.tolerance_bps,
      permit,
      etatPermit2,
      proprietaire: b.proprietaire,
    });

    return c.json({
      ...base,
      appels_rpc: appels,
      lectures,
      envoi,
      // Le rappel qui doit rester a l'ecran : ceci n'est pas envoye.
      note: "cette transaction n'a pas ete envoyee et ne le sera pas par cette route. Signe-la, ou non.",
    });
  });

  return app;
}
