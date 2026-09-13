/**
 * LE DECK — neuf temps, plein écran, pilotables au clavier.
 *
 * CE FICHIER NE FAIT QUE MONTER. Toute la mécanique vit dans `components/deck/` :
 * `SnapScroll` (le conteneur qui défile, la planche 16:9, le bandeau présentateur),
 * `presenter.ts` (le chrono, les raccourcis, `scrollIntoView` sur les sections) et `atoms.tsx`
 * (les briques : titre, chiffre, carte, vitre, frappe). Les neuf sections vivent dans
 * `deck/sections/`. Ce découpage vient de la source qu'on a portée — un fichier de 1 700
 * lignes qui mélangeait tout se relit mal à trois heures du rendu.
 *
 * LES CHIFFRES SONT LUS ICI, UNE FOIS, ET PASSÉS AUX SECTIONS. Aucune section ne va chercher
 * une donnée elle-même : ça garantit qu'un même fait ne peut pas s'afficher différemment sur
 * deux planches, et ça rend visible, en un seul endroit, tout ce que le deck affirme.
 *
 * L'ORDRE SUIT `docs/VOD.md`. Le deck est ce qu'on filme : si l'ordre des planches et l'ordre
 * du script divergent, la vidéo devient impossible à tourner d'une traite.
 */
import { useMemo, useRef } from 'react'
import { SnapScroll, BeatSection } from './deck/SnapScroll'
import { usePresenter } from './deck/presenter'
import { BEATS } from './deck/tokens'
import { dataset } from '../lib/dataset'
import facts from '../data/facts.json'

import { HeroSection } from './deck/sections/HeroSection'
import { MethodeSection } from './deck/sections/MethodeSection'
import { PreuveSection } from './deck/sections/PreuveSection'
import { AtlasSection } from './deck/sections/AtlasSection'
import { McpChatSection } from './deck/sections/McpChatSection'
import { ExtensionSection } from './deck/sections/ExtensionSection'
import { SpeculosSection } from './deck/sections/SpeculosSection'
import { HonneteteSection } from './deck/sections/HonneteteSection'
import { CloseSection } from './deck/sections/CloseSection'

/** `?presenter=1` : le chrono et les raccourcis n'existent pas sur l'URL publique. */
const enPresentation = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('presenter')

export function DeckPage({ surOutil }: { surOutil?: (n: number) => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const presentateur = enPresentation()
  const presenter = usePresenter(BEATS.length, true, scrollRef)

  const t = dataset.totals
  const P = dataset.provenance

  /** La ligne la plus prélevante du corpus — c'est elle que le MCP interroge à l'écran. */
  const pire = useMemo(() => {
    const r = dataset.rows
      .filter((x) => x.label === 'MESURE' && x.bps !== null && x.out_with && x.out_without)
      .sort((a, b) => (b.bps ?? 0) - (a.bps ?? 0))[0]
    if (!r) return null
    return {
      hook: r.hook,
      bps: r.bps as number,
      label: r.label,
      amount_in: r.amount_in,
      zero_for_one: r.zero_for_one,
      block_number: r.block_number,
      out_with: r.out_with as string,
      out_without: r.out_without as string,
      currency0: r.currency0,
      currency1: r.currency1,
      key_fee: r.key_fee,
      tick_spacing: r.tick_spacing,
    }
  }, [])

  const ex = facts.execution as {
    bps_executes: number
    bps_publies: number
    avec_hook: { execute: string; cote: string; egal: boolean }
    avec_talon: { execute: string; cote: string; egal: boolean }
  } | null
  // `etapes` est typee comme la section l'attend : chaque etape porte son numero, ce qu'elle
  // fait, son etat et sa duree. Un `[]` nu disait « tableau vide », ce qui est faux.
  const ch = facts.chaine as unknown as {
    n_ok: number
    n_total: number
    duree_ms: number
    etapes: { n: number; quoi: string; etat: string; a_ms: number }[]
  } | null
  const led = facts.ledger as { ecrans?: number; type_712?: string } | null
  const garde = facts.garde as { transactions_reelles?: number } | null
  const att = facts.attestations as { ecrits?: number; calcules?: number } | null
  const reg = facts.registre as { epingle?: { absents?: number } } | null

  const aller = (n: number) => presenter.setBeat(n)

  const sections: ReadonlyArray<React.ReactNode> = [
    <HeroSection
      presenter={presentateur}
      declarants={9}
      hooksRecenses={1559}
      champsRegistre={P.registry.field_census.leaf_fields}
      champsQuantitatifs={P.registry.field_census.quantitative_fields.length}
      absents={reg?.epingle?.absents ?? t.hooksAbsentFromRegistry}
      hooksMesures={t.hooks}
      mesures={t.rows}
      bloc={P.measurements.blocks[0] ?? 0}
      chaine={P.measurements.chain_ids[0] ?? 8453}
      onVoirLaMethode={() => aller(1)}
    />,
    <MethodeSection
      actif
      mesures={t.rows}
      pools={t.pools}
      hooks={t.hooks}
      stubHash={P.measurements.stub_hash}
    />,
    ex && ch ? (
      <PreuveSection
        actif
        bpsExecutes={ex.bps_executes}
        bpsPublies={ex.bps_publies}
        avecHook={ex.avec_hook}
        avecTalon={ex.avec_talon}
        chaine={ch}
      />
    ) : null,
    <AtlasSection mesures={t.rows} pools={t.pools} hooks={t.hooks} octetsCorpus={8_315_202} />,
    pire ? <McpChatSection pire={pire} mesures={t.rows} hooks={t.hooks} /> : null,
    <ExtensionSection actif transactionsReelles={garde?.transactions_reelles ?? null} />,
    <SpeculosSection actif ecransRendus={led?.ecrans ?? null} type712={led?.type_712 ?? null} />,
    <HonneteteSection
      mesure={t.measured}
      nonCotable={t.labelCounts['NON_COTABLE'] ?? 0}
      nonMesurable={t.labelCounts['NON_MESURABLE'] ?? 0}
      interpole={t.labelCounts['INTERPOLE'] ?? 0}
      attestationsEcrites={att?.ecrits ?? null}
      attestationsCalculees={att?.calcules ?? null}
    />,
    <CloseSection surOutil={surOutil} />,
  ]

  return (
    <SnapScroll presenter={presentateur ? presenter : undefined} active scrollRef={scrollRef}>
      {BEATS.map((b, i) => (
        <BeatSection
          key={b.id}
          index={i}
          id={b.id}
          marqueur={`${String(i + 1).padStart(2, '0')} · ${b.label}`}
          caption={b.hint}
          total={BEATS.length}
        >
          {sections[i]}
        </BeatSection>
      ))}
    </SnapScroll>
  )
}
