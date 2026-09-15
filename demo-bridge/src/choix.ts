/**
 * LES TROIS CHOIX, DECIDES SUR L'APPAREIL.
 *
 * La garde a intercepte un swap ; c'est l'humain qui decide, et il decide sur le Ledger. Trois
 * reponses — garder sa route, prendre la porte moins chere, annuler — posees en deux questions
 * signees (voir `questionDe` dans message.ts) :
 *
 *   question 1 signee   -> `actuelle`   la transaction d'origine part au portefeuille
 *   question 1 refusee  -> question 2
 *   question 2 signee   -> `optimisee`  le remplacement part, en second appel
 *   question 2 refusee  -> `annuler`    rien ne part
 *
 * POURQUOI LA CONVERSATION NE BLOQUE PAS LA REQUETE. Deux questions lues par un humain peuvent
 * durer plusieurs minutes, et un proxy coupe une requete longue sans prevenir. `demarrerChoix`
 * rend donc la main tout de suite ; la page suit l'avancement par `lireChoix`, qui dit aussi
 * QUELLE question l'appareil affiche — c'est ce qui allume la bonne carte a l'ecran.
 *
 * UN SEUL VERROU POUR LES DEUX QUESTIONS. Personne ne s'intercale entre elles.
 */
import { randomUUID } from "node:crypto";
import type { NomActe } from "./corpus.js";
import {
  AppareilIndisponible,
  AppareilOccupe,
  estRefus,
  occupationAppareil,
  sousVerrou,
  type SignerSousVerrou,
} from "./ledger.js";
import {
  optionsDe,
  questionDe,
  questionsDe,
  type OptionAnnoncee,
  type OptionChoix,
  type OptionPosee,
} from "./message.js";

export interface EtapeChoix {
  rang: 1 | 2;
  option: OptionPosee;
  issue: "approuvee" | "rejetee";
  prompt_digest: string;
  /** combien d'ecrans distincts l'appareil a rendus pour cette question */
  ecrans: number;
  signature: string | null;
}

export interface ResultatChoix {
  choix: OptionChoix;
  raison: string;
  signature: string | null;
  prompt_digest: string | null;
}

export interface EtatChoix {
  id: string | null;
  acte: NomActe | null;
  en_cours: boolean;
  /** la question affichee sur l'appareil, la, maintenant */
  rang: 1 | 2 | null;
  option: OptionPosee | null;
  depuis_ms: number | null;
  digest_en_cours: string | null;
  options: OptionAnnoncee[];
  etapes: EtapeChoix[];
  resultat: ResultatChoix | null;
  erreur: { erreur: string; motif: string } | null;
}

interface Interne {
  id: string | null;
  acte: NomActe | null;
  en_cours: boolean;
  rang: 1 | 2 | null;
  option: OptionPosee | null;
  depuis: number | null;
  digest_en_cours: string | null;
  options: OptionAnnoncee[];
  etapes: EtapeChoix[];
  resultat: ResultatChoix | null;
  erreur: { erreur: string; motif: string } | null;
  abandon: boolean;
}

const vide = (): Interne => ({
  id: null,
  acte: null,
  en_cours: false,
  rang: null,
  option: null,
  depuis: null,
  digest_en_cours: null,
  options: [],
  etapes: [],
  resultat: null,
  erreur: null,
  abandon: false,
});

let etat: Interne = vide();

/** L'avancement public. La derniere conversation reste lisible jusqu'a la suivante. */
export function lireChoix(): EtatChoix {
  return {
    id: etat.id,
    acte: etat.acte,
    en_cours: etat.en_cours,
    rang: etat.rang,
    option: etat.option,
    depuis_ms: etat.depuis === null ? null : Date.now() - etat.depuis,
    digest_en_cours: etat.digest_en_cours,
    options: etat.options,
    etapes: etat.etapes,
    resultat: etat.resultat,
    erreur: etat.erreur,
  };
}

/**
 * Ferme la question en cours : l'appareil y appuie sur Reject, et aucune autre n'est posee.
 * Rend `false` quand il n'y avait rien a abandonner.
 */
export function abandonnerChoix(): boolean {
  if (!etat.en_cours) return false;
  etat.abandon = true;
  return true;
}

/** Pour les tests : repart d'un etat vide. */
export function oublierChoix(): void {
  etat = vide();
}

const RAISON: Record<OptionChoix, string> = {
  actuelle: "signed on the device: keep your route — the original goes to the wallet, unchanged",
  optimisee: "signed on the device: take the cheaper gate — the replacement goes to the wallet as a second call",
  annuler: "rejected on the device: cancel — nothing is sent",
};

/**
 * Commence la conversation et rend la main TOUT DE SUITE.
 *
 * Leve `AppareilOccupe` quand l'appareil sert deja quelqu'un. Le controle et la prise de l'etat
 * sont synchrones : deux demandes simultanees ne peuvent pas demarrer deux conversations.
 */
export function demarrerChoix(
  acte: NomActe,
  opts: { auto?: OptionChoix; signerAvec?: typeof sousVerrou } = {},
): { id: string; options: OptionAnnoncee[] } {
  const occupe = occupationAppareil();
  if (etat.en_cours || occupe) {
    throw new AppareilOccupe(occupe?.quoi ?? "les trois choix", Date.now() - (occupe?.depuis_ms ?? 0));
  }
  const id = randomUUID();
  etat = { ...vide(), id, acte, en_cours: true, options: optionsDe(acte) };
  void converser(id, acte, opts.auto, opts.signerAvec ?? sousVerrou);
  return { id, options: etat.options };
}

async function converser(
  id: string,
  acte: NomActe,
  auto: OptionChoix | undefined,
  verrouiller: typeof sousVerrou,
): Promise<void> {
  const ici = () => etat.id === id;
  try {
    await verrouiller("les trois choix", async (signerIci: SignerSousVerrou) => {
      for (const option of questionsDe(acte)) {
        if (!ici()) return;
        if (etat.abandon) break;
        const q = questionDe(acte, option);
        etat.rang = q.rang;
        etat.option = option;
        etat.depuis = Date.now();
        etat.digest_en_cours = q.prompt_digest;

        const decision = auto === undefined ? undefined : auto === option ? "approuver" : "rejeter";
        const r = await signerIci(q.typed, { auto: decision, abandon: () => etat.abandon });
        if (!ici()) return;

        const approuvee = !estRefus(r);
        etat.etapes.push({
          rang: q.rang,
          option,
          issue: approuvee ? "approuvee" : "rejetee",
          prompt_digest: q.prompt_digest,
          ecrans: r.ecrans.length,
          signature: approuvee ? r.signature : null,
        });
        if (approuvee && !etat.abandon) {
          etat.resultat = { choix: option, raison: RAISON[option], signature: r.signature, prompt_digest: q.prompt_digest };
          return;
        }
        if (etat.abandon) break;
      }
      if (!ici()) return;
      if (etat.abandon) {
        etat.erreur = {
          erreur: "abandonne",
          motif: "The page took the decision back: the open question was rejected on the device. Nothing was sent.",
        };
        return;
      }
      etat.resultat = { choix: "annuler", raison: RAISON.annuler, signature: null, prompt_digest: null };
    });
  } catch (e) {
    if (!ici()) return;
    if (e instanceof AppareilOccupe) {
      etat.erreur = {
        erreur: "appareil_occupe",
        motif: "The device is already handling another request. Nothing was signed and nothing was sent.",
      };
    } else if (e instanceof AppareilIndisponible) {
      etat.erreur = { erreur: "appareil_indisponible", motif: e.message };
    } else {
      etat.erreur = { erreur: "appareil", motif: (e as Error).message.slice(0, 300) };
    }
  } finally {
    if (ici()) {
      etat.en_cours = false;
      etat.rang = null;
      etat.option = null;
      etat.depuis = null;
      etat.digest_en_cours = null;
    }
  }
}
