// LE TEST DE SORTIE — « tu mets 100 €, tu recuperes combien ? »
//
// Un champ, un nombre, une phrase. C'est le seul panneau qui repond a la question dans l'ordre
// ou elle se pose : on entre, puis on ressort.
//
// Tout est calcule ICI, dans le navigateur, depuis le jeu embarque. Aucune requete, aucun fork,
// aucun serveur — donc reponse immediate, et deux visiteurs simultanes ne peuvent pas se gener.
// C'est deliberе : la version qui EXECUTE vraiment l'aller-retour vit derriere POST /measure et
// coute du calcul.
//
// Ce que l'ecran doit rendre visible, et qui est plus important que le nombre :
//   - un INTERVALLE quand la revente varie selon la taille, jamais une valeur unique ;
//   - un REFUS quand un seul sens est mesure, avec sa raison — l'autre sens n'est pas gratuit ;
//   - la commande de rejeu, pour qui veut verifier plutot que croire.
import { useMemo, useState } from 'react'
import { dataset } from '../lib/dataset'
import {
  testDeSortie,
  phraseSortie,
  MONNAIES_DE_COTATION,
  type Ligne,
  type TestSortie,
} from '../lib/exit'
import { Panel, Copy } from './Prim'
import { rampVar } from '../lib/ramp'
import FA from '../data/facts.json'

const EXEMPLES = [
  { addr: '0xb2000000000000000000000518f4215d5615bfb8', note: 'il ne reste rien' },
  { addr: '0xb20000000000000000000090aa1082ce28905f01', note: 'ca depend de la taille' },
  { addr: '0x69df254076b8a0360ea1180b58aaf1749fe97786', note: 'un jeton Zora' },
]

const EST_ADRESSE = /^0x[0-9a-fA-F]{40}$/

function lignesDuJeton(token: string): Ligne[] {
  const t = token.toLowerCase()
  return (dataset.rows as unknown as Ligne[]).filter(
    (r) => r.currency0.toLowerCase() === t || r.currency1.toLowerCase() === t,
  )
}

function Barre({ test }: { test: TestSortie }) {
  const p = test.pire
  // La barre est a l'echelle : ce qui revient, et ce qui reste au pool. Quand la revente varie,
  // la zone incertaine est dessinee entre les deux bornes plutot que moyennee.
  const min = Math.max(0, Math.min(1, p.gardeMin))
  const max = Math.max(0, Math.min(1, p.gardeMax))

  // La couleur vient de la RAMPE DE MESURE, la seule famille chromatique de l'instrument :
  // une surface coloree porte une grandeur (src/lib/ramp.ts). Ici la grandeur est le cout
  // total de l'aller-retour, exprime en points de base — c'est-a-dire ce que le pool garde.
  // Une couleur choisie pour « bon / mauvais » n'aurait rien mesure du tout.
  const coutBps = (1 - min) * 10000
  const teinte = rampVar(coutBps)

  return (
    <div className="flex flex-col gap-[6px]">
      <div
        className="flex"
        style={{ height: 34, border: '1px solid var(--line-strong)', overflow: 'hidden' }}
      >
        <div style={{ width: `${min * 100}%`, background: 'var(--bg-3)' }} />
        {max > min && (
          <div
            style={{
              width: `${(max - min) * 100}%`,
              background: `repeating-linear-gradient(45deg, ${teinte}, ${teinte} 5px, var(--bg-3) 5px, var(--bg-3) 10px)`,
            }}
            title="zone incertaine : la revente varie selon la taille"
          />
        )}
        <div style={{ flex: 1, background: teinte }} />
      </div>
      <div className="flex justify-between t-data-xs" style={{ color: 'var(--ink-2)' }}>
        <span>ce qui te revient</span>
        {max > min && <span>zone incertaine</span>}
        <span>ce qui reste au pool, {coutBps.toFixed(0)} bps</span>
      </div>
    </div>
  )
}

export function ExitPanel() {
  const [saisie, setSaisie] = useState('')
  const [montant, setMontant] = useState(100)

  type Resultat =
    | { etat: 'erreur'; message: string }
    | { etat: 'refus'; raison: string }
    | { etat: 'ok'; test: TestSortie }

  const resultat = useMemo<Resultat | null>(() => {
    const t = saisie.trim().toLowerCase()
    if (!t) return null
    if (!EST_ADRESSE.test(t))
      return { etat: 'erreur', message: 'Colle une adresse de contrat : 0x suivi de 40 caracteres.' }
    if (t in MONNAIES_DE_COTATION)
      return {
        etat: 'erreur',
        message: `${MONNAIES_DE_COTATION[t]} est la monnaie en face de l'echange, pas le jeton a tester.`,
      }
    const lignes = lignesDuJeton(t)
    if (lignes.length === 0)
      return {
        etat: 'erreur',
        message:
          "Ce jeton n'est pas dans le jeu de mesures. Ce n'est pas un jeton sans prelevement : il est NON MESURE.",
      }
    const test = testDeSortie(t, lignes)
    return test.ok ? { etat: 'ok', test } : { etat: 'refus', raison: test.raison }
  }, [saisie])

  return (
    <Panel
      index="00"
      title="Le test de sortie"
      meta={['calcul dans le navigateur', 'aucune requête', 'bloc 50 614 000']}
    >
      <div className="flex flex-col gap-[14px] p-[16px]">
        <div className="flex flex-wrap items-center gap-[10px]">
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="0x4200… l'adresse d'un jeton Base"
            aria-label="adresse du jeton"
            name="jeton-sortie"
            autoComplete="off"
            translate="no"
            spellCheck={false}
            className="t-data-sm"
            style={{
              flex: '1 1 380px',
              padding: '10px 12px',
              border: '1px solid var(--line-strong)',
              background: 'var(--bg-0)',
              color: 'var(--ink)',
            }}
          />
          <label className="t-data-xs flex items-center gap-[6px]" style={{ color: 'var(--ink-2)' }}>
            tu mets
            <input
              type="number"
              min={1}
              value={montant}
              onChange={(e) => setMontant(Math.max(1, Number(e.target.value) || 1))}
              aria-label="montant en euros"
              className="t-data-sm"
              style={{
                width: 84,
                padding: '10px 8px',
                border: '1px solid var(--line-strong)',
                background: 'var(--bg-0)',
                color: 'var(--ink)',
              }}
            />
            €
          </label>
        </div>

        <div className="flex flex-wrap gap-[8px]">
          {EXEMPLES.map((e) => (
            <button
              key={e.addr}
              onClick={() => setSaisie(e.addr)}
              className="t-data-xs"
              style={{
                padding: '5px 9px',
                border: '1px solid var(--line)',
                background: 'var(--bg-2)',
                color: 'var(--ink-2)',
                cursor: 'pointer',
              }}
            >
              {e.addr.slice(0, 10)}…{' '}
              <span style={{ color: 'var(--ink-2)' }}>{e.note}</span>
            </button>
          ))}
        </div>

        {resultat?.etat === 'erreur' && (
          <p className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            {resultat.message}
          </p>
        )}

        {resultat?.etat === 'refus' && (
          <div className="flex flex-col gap-[6px]">
            <p className="t-data-sm" style={{ color: 'var(--ink)' }}>
              Pas de reponse pour ce jeton.
            </p>
            <p className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              {resultat.raison}
            </p>
          </div>
        )}

        {resultat?.etat === 'ok' && (
          <div className="flex flex-col gap-[12px]">
            <p style={{ fontSize: 28, lineHeight: 1.15, color: 'var(--ink)', margin: 0 }}>
              Tu mets {montant} €, {phraseSortie(resultat.test, montant)}.
            </p>
            <Barre test={resultat.test} />
            <div className="flex flex-wrap gap-[16px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
              <span>
                achat {resultat.test.pire.achat.totalBps.toFixed(2)} bps
              </span>
              <span>
                revente {resultat.test.pire.reventePire.totalBps.toFixed(2)} bps au pire
                {!resultat.test.pire.exact &&
                  `, ${resultat.test.pire.reventeMeilleure.totalBps.toFixed(2)} au mieux`}
              </span>
              <span>pool {resultat.test.poolId.slice(0, 12)}…</span>
              <span>hook {resultat.test.hook.slice(0, 12)}…</span>
              <Copy text={resultat.test.hook} label="copier le hook" />
            </div>
            {FA.sens_unique && (
              <p className="t-data-xs" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
                Les <strong>deux premiers</strong> exemples ci-dessus sont des pools a sens unique : on y
                entre pour presque rien et on n'en ressort pas. Sur les{' '}
                <strong>{FA.sens_unique.pools_deux_sens.toLocaleString('fr-FR')}</strong> pools
                mesures dans les deux sens, il y en a{' '}
                <strong>{FA.sens_unique.pools}</strong>, sur {FA.sens_unique.hooks} hooks. C'est
                peu — et le dire ainsi vaut mieux que de laisser croire a une regle. Le seuil qui
                fait cette liste ({FA.sens_unique.seuil_lourd_bps} bps a la sortie,{' '}
                {FA.sens_unique.seuil_plat_bps} a l'entree) est un choix de publication, pas une
                frontiere naturelle : le deplacer change la liste.
              </p>
            )}
            <p className="t-data-xs" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '70ch' }}>
              Ce n'est pas un aller-retour execute : on compose les deux prelevements mesures, et
              l'impact de prix du premier echange sur le second est ignore. La taille a laquelle tu
              revendrais est inconnue, donc le cout de revente est borne — c'est pourquoi la reponse
              est parfois un intervalle. Tout est mesure au bloc 50 614 000.
            </p>
          </div>
        )}
      </div>
    </Panel>
  )
}
