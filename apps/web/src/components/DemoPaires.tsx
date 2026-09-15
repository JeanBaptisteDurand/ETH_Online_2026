/**
 * LE SELECTEUR DE PAIRE, ET LES PORTES QUI LA FONT — en lecture seule, sur le corpus embarque.
 *
 * Il repond a la question que la demonstration ne pose pas : « et pour une autre paire ? ».
 * Zero requete, zero service : les 125 072 mesures sont deja dans le paquet JS.
 *
 * CE QU'IL NE FAIT PAS, ET IL LE DIT. Il ne change pas la paire EXECUTEE. Le pont ne sait
 * preparer que l'echange ETH -> USDC sur le fork, et on ne touche pas au chemin executable a
 * quelques heures d'une demonstration. Choisir une autre paire laisse donc les boutons
 * DESARMES AVEC LA RAISON ECRITE — jamais grises en silence, ce qui laisserait croire a une
 * panne.
 *
 * CE QU'IL MONTRE. Une barre par porte, longueur PROPORTIONNELLE a ce qu'elle prend, la moins
 * chere en tete, dans la rampe du site (src/lib/ramp.ts) — pas une seconde palette. L'echelle
 * est ecrite a cote : une barre dont on ne connait pas le plein ne veut rien dire.
 *
 * UNE PORTE NON MESUREE SORT DU CLASSEMENT. Elle est rendue en dessous, avec « unknown » et
 * SANS barre. Une barre de longueur zero se lirait « elle ne prend rien », et une absence n'est
 * pas un zero — c'est la regle dure de tout ce depot.
 *
 * LES PAIRES PROPOSEES SONT CELLES DONT LES DEUX MONNAIES PORTENT UN SYMBOLE lu sur la chaine.
 * Les autres existent, elles sont comptees a l'ecran, et elles ne sont pas nommees : une paire
 * d'adresses nues dans un menu deroulant n'apprend rien, et leur inventer un nom serait la faute
 * meme que ce depot reproche au reste.
 */
import { useMemo, useState } from 'react'
import { groupDigits, shortAddr } from '../lib/format'
import { rampVar } from '../lib/ramp'
import { symbole } from './Carte'
import { bpsTexte } from './DemoDistribution'
import { montantLisible } from '../demo/jetons'
import { classer, pairesAMontrer, type PorteMesuree } from '../demo/paires'
import { ETIQUETTE } from '../demo/table'

/** Le nom d'un jeton quand il a ete lu, son adresse seule sinon. Jamais un nom invente. */
export function nomJeton(adresse: string): string {
  const s = symbole(adresse)
  return s ? `${s} · ${shortAddr(adresse, 6, 4)}` : shortAddr(adresse, 8, 6)
}

function Ligne({ p, pleine, rang }: { p: PorteMesuree; pleine: number; rang: number | null }) {
  // La barre ne represente QUE ce qui est mesure. `bps` a null n'en a pas : elle serait vide,
  // et une barre vide se lit « elle ne prend rien ».
  const part = p.bps === null || pleine <= 0 ? null : Math.max(0, Math.min(1, p.bps / pleine))
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-[9px] gap-y-[2px] px-[11px] py-[4px]"
      style={{ borderTop: '1px solid var(--line)', minWidth: 0 }}
    >
      <span className="t-label" style={{ color: 'var(--ink-2)', width: 20, flex: 'none' }}>
        {rang === null ? '—' : String(rang).padStart(2, '0')}
      </span>
      <span
        className="t-data-xs hex"
        style={{ color: 'var(--ink)', width: 108, flex: 'none' }}
        title={`pool ${p.poolId}`}
      >
        {shortAddr(p.poolId, 8, 4)}
      </span>
      <span
        className="t-data-xs hex"
        style={{ color: 'var(--ink-2)', width: 104, flex: 'none' }}
        title={`hook ${p.hook}`}
      >
        {shortAddr(p.hook, 8, 4)}
      </span>
      <span style={{ flex: '1 1 120px', minWidth: 60, height: 9, background: 'var(--bg-2)' }}>
        {part !== null && (
          <span
            style={{
              display: 'block',
              height: 9,
              width: `${part * 100}%`,
              minWidth: part > 0 ? 2 : 0,
              background: rampVar(p.bps),
            }}
          />
        )}
      </span>
      <span className="t-data-xs" style={{ color: 'var(--ink)', width: 96, flex: 'none', textAlign: 'right' }}>
        {p.bps === null ? (
          <span title={`not measured at ${p.taille}`} style={{ color: 'var(--ink-2)' }}>
            unknown
          </span>
        ) : (
          `${bpsTexte(p.bps)} bps`
        )}
      </span>
      <span className="t-data-xs" style={{ color: 'var(--ink-2)', width: 128, flex: 'none' }}>
        {/* Le corpus nomme ses etiquettes en francais ; cet ecran est en anglais. La table de
            correspondance est celle de ../demo/table.ts, pas une seconde. */}
        {ETIQUETTE[p.label]}
      </span>
      <span className="t-data-xs" style={{ color: 'var(--ink-2)', flex: 'none' }}>
        pool fee{' '}
        {p.lpBps === null ? (
          <span title="stored_lp_fee not read">unknown</span>
        ) : (
          `${bpsTexte(p.lpBps)} bps`
        )}
        {p.feeDynamique ? ' · dynamic' : ''} · {p.sens}
      </span>
    </div>
  )
}

export function PanneauPaires({
  choisie,
  setChoisie,
  clePaireExecutee,
}: {
  choisie: string
  setChoisie: (cle: string) => void
  /** la paire que les deux actes jouent reellement sur le fork */
  clePaireExecutee: string
}) {
  const { montrees, restantes, total } = useMemo(
    () => pairesAMontrer((a) => symbole(a) !== null, [clePaireExecutee]),
    [clePaireExecutee],
  )
  const [taille, setTaille] = useState<string | undefined>(undefined)

  const paire = montrees.find((p) => p.cle === choisie) ?? montrees[0]
  const c = useMemo(
    () => (paire ? classer(paire.entree, paire.sortie, taille) : null),
    [paire, taille],
  )
  const pleine = c && c.classees.length > 0 ? c.classees[c.classees.length - 1]!.bps! : 0
  const executee = choisie === clePaireExecutee

  return (
    <details className="demo-paires" style={{ border: '1px solid var(--line)', background: 'var(--bg-1)' }}>
      <summary
        className="t-label px-[11px] py-[2px] cursor-pointer list-none flex flex-wrap items-baseline gap-[10px]"
        style={{ color: 'var(--ink-2)' }}
      >
        <span style={{ color: 'var(--ink)' }}>every pair the corpus measures</span>
        <span>
          {groupDigits(String(montrees.length))} named of {groupDigits(String(total))} · read-only
        </span>
      </summary>

      <div className="px-[11px] py-[7px] flex flex-wrap items-center gap-[9px]" style={{ borderTop: '1px solid var(--line)' }}>
        <label className="t-label" style={{ color: 'var(--ink-2)' }} htmlFor="demo-paire">
          pair
        </label>
        <select
          id="demo-paire"
          value={paire?.cle ?? ''}
          onChange={(e) => {
            setChoisie(e.target.value)
            setTaille(undefined)
          }}
          className="t-data-xs"
          style={{
            padding: '4px 7px',
            maxWidth: '100%',
            border: '1px solid var(--line-strong)',
            background: 'var(--bg-2)',
            color: 'var(--ink)',
            fontFamily: 'var(--mono)',
          }}
        >
          {montrees.map((p) => (
            <option key={p.cle} value={p.cle}>
              {nomJeton(p.entree)} → {nomJeton(p.sortie)} · {p.nPoolsMesures} measured gate(s)
            </option>
          ))}
        </select>
        <span className="t-data-xs" style={{ color: 'var(--ink-2)', minWidth: 0, lineHeight: 1.4 }}>
          the corpus answers for every pair; the two acts below execute the{' '}
          {nomJeton(clePaireExecutee.split('>')[0]!)} → {nomJeton(clePaireExecutee.split('>')[1]!)} one on
          the fork. {groupDigits(String(restantes))} more pairs are measured and not listed: their
          currencies have no symbol read on chain, and inventing one is the fault this project
          refuses.
        </span>
      </div>

      {c && c.tailles.length > 1 && (
        <div className="px-[11px] py-[6px] flex flex-wrap items-center gap-[6px]" style={{ borderTop: '1px solid var(--line)' }}>
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            size
          </span>
          {c.tailles.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTaille(t)}
              className="t-data-xs"
              style={{
                padding: '2px 7px',
                border: `1px solid ${t === c.taille ? 'var(--m-4)' : 'var(--line)'}`,
                background: 'transparent',
                color: 'var(--ink-2)',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
              }}
              title={`${groupDigits(t)} unit(s) of the currency spent`}
            >
              {montantLisible(t, paire!.entree) ?? groupDigits(t)}
            </button>
          ))}
          <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            a ranking only holds at ONE size: the take moves with the amount
          </span>
        </div>
      )}

      {c === null || (c.classees.length === 0 && c.horsClassement.length === 0) ? (
        <div className="t-data-xs px-[11px] py-[7px]" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
          this pair carries no measured gate in the corpus
        </div>
      ) : (
        <>
          <div
            className="t-data-xs px-[11px] py-[5px] flex flex-wrap gap-x-[12px]"
            style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}
          >
            <span>
              {groupDigits(String(c.classees.length))} measured gate(s) at{' '}
              {montantLisible(c.taille ?? '0', paire!.entree) ?? groupDigits(c.taille ?? '')}{' '}
              {symbole(paire!.entree) ?? 'unit(s)'}
            </span>
            <span>
              bar length is proportional to the take · full width ={' '}
              {pleine > 0 ? `${bpsTexte(pleine)} bps` : 'nothing measured'}
            </span>
            {c.ecartBps !== null && <span>spread {bpsTexte(c.ecartBps)} bps</span>}
            {!executee && <span style={{ color: 'var(--m-5)' }}>read-only: the acts stay on the executed pair</span>}
          </div>
          {c.classees.map((p, i) => (
            <Ligne key={`${p.poolId}${p.sens}`} p={p} pleine={pleine} rang={i + 1} />
          ))}
          {c.horsClassement.length > 0 && (
            <>
              <div
                className="t-data-xs px-[11px] py-[5px]"
                style={{ borderTop: '1px solid var(--line-strong)', color: 'var(--ink-2)' }}
              >
                out of the ranking — {groupDigits(String(c.horsClassement.length))} gate(s) exist at this
                size without a number. Not cheaper: unknown.
              </div>
              {c.horsClassement.map((p) => (
                <Ligne key={`${p.poolId}${p.sens}x`} p={p} pleine={pleine} rang={null} />
              ))}
            </>
          )}
        </>
      )}
    </details>
  )
}
