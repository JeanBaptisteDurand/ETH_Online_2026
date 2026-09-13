import { useState, type CSSProperties, type ReactNode } from 'react'

/** Etiquette qualitative : typographique, jamais coloree (charte §4.1.4). */
export function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="chip hex" title={title}>
      {children}
    </span>
  )
}

/**
 * La cellule a trois etages (js-framework-benchmark, charte §4.9) :
 *   valeur 13px --ink · precision 11px --ink-3 · provenance 10px --ink-3
 * Le fond porte l'ordre de grandeur, la barre gauche porte le signal, l'encre ne change jamais.
 */
export function Cell({
  value,
  second,
  third,
  style,
  align = 'right',
  title,
}: {
  value: ReactNode
  second?: ReactNode
  third?: ReactNode
  style?: CSSProperties
  align?: 'left' | 'right'
  title?: string
}) {
  return (
    <div
      className="px-[10px] py-[6px] h-full"
      style={{ textAlign: align, ...style }}
      title={title}
    >
      <div className="t-data" style={{ color: 'var(--ink)' }}>
        {value}
      </div>
      {second !== undefined && (
        <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
          {second}
        </div>
      )}
      {third !== undefined && (
        <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {third}
        </div>
      )}
    </div>
  )
}

/** Un bouton de copie qui dit ce qu'il a copie. Aucun nombre ne bouge, aucune couleur n'apparait. */
export function Copy({ text, label = 'copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      // 18 px de haut : sous le minimum de 24, et ce bouton-la porte l'action principale
      // du refus motive. Une seule declaration le corrige partout ou il sert.
      className="t-data-sm px-[8px] cursor-pointer inline-flex items-center"
      style={{
        minHeight: 24,
        border: '1px solid var(--line-strong)',
        background: 'var(--bg-2)',
        color: 'var(--ink-2)',
        transition: `color var(--t-feedback) linear`,
        touchAction: 'manipulation',
      }}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true)
            window.setTimeout(() => setDone(false), 1200)
          },
          () => setDone(false),
        )
      }}
    >
      {/* La confirmation est annoncee : sans ca, l'action que l'instrument met en avant
          reussit en silence pour un lecteur d'ecran. */}
      <span aria-live="polite">{done ? 'copied' : label}</span>
    </button>
  )
}

/** Une commande rejouable, telle quelle, sans reformulation. */
export function Replay({ cmd, note }: { cmd: string; note?: string }) {
  // `min-width: 0` et `max-width: 100%` sur le CADRE, pas sur le <pre>.
  //
  // Le <pre> porte `overflow-x-auto`, mais un conteneur ne peut defiler que si sa largeur est
  // CONTRAINTE. Dans une colonne flex, la largeur minimale par defaut est `auto` — c'est-a-dire
  // celle du contenu — donc un contenu large pousse toute la mise en page au lieu de defiler.
  // La commande de rejeu d'une mesure fait 260 caracteres : elle elargissait la page a 2 190 px
  // sur un ecran de 1 190, et TOUT le site defilait horizontalement.
  return (
    <div style={{ border: '1px solid var(--line)', background: 'var(--bg-2)', minWidth: 0, maxWidth: '100%' }}>
      <div
        className="t-label flex items-center justify-between px-[10px] py-[6px]"
        style={{ borderBottom: '1px solid var(--line)', color: 'var(--ink-2)' }}
      >
        <span>replay this value</span>
        <Copy text={cmd} />
      </div>
      {/* Une region qui defile doit etre atteignable au clavier : la commande de rejeu est
          justement celle que l'instrument demande de lire avant de le croire. */}
      <pre
        tabIndex={0}
        role="region"
        aria-label="replay command, horizontal scrolling"
        className="t-data-sm hex px-[10px] py-[8px] m-0 overflow-x-auto whitespace-pre"
        style={{ color: 'var(--ink-2)' }}
      >
        {cmd}
      </pre>
      {note && (
        <div
          className="t-data-xs px-[10px] pb-[8px]"
          style={{ color: 'var(--ink-2)' }}
        >
          {note}
        </div>
      )}
    </div>
  )
}

/**
 * UNE SECTION, et non une boite.
 *
 * Elle portait trois tells d'un coup : un ordinal en eyebrow sur ce qui n'est pas une
 * sequence, un titre en capitales espacees, et une chaine de metadonnees jointe par des
 * points medians. Les trois partent.
 *
 *   — l'ordinal devient l'ANCRE de la section (`#p-07`), ce qui le rend utile : l'index de
 *     panneaux s'y branche, et l'adresse d'un panneau se copie ;
 *   — le titre passe en Instrument Sans, casse phrase, taille `title` ;
 *   — les metadonnees deviennent des elements separes par un filet, jamais par un « · ».
 *
 * Et le cadre disparait : a densite 8, le groupement se fait par filet et par espace. Une
 * seule feuille du haut en bas, comme la rubrique 6 du design l'ecrit.
 */
export function Panel({
  index,
  title,
  right,
  meta,
  children,
}: {
  index: string
  title: string
  right?: ReactNode
  /** des faits separes, chacun autonome — jamais une phrase a points medians */
  meta?: ReactNode[]
  children: ReactNode
}) {
  const id = `p-${index}`
  return (
    <section id={id} aria-labelledby={`${id}-t`} style={{ borderTop: '1px solid var(--line)' }}>
      {/* L'EN-TETE DE SECTION, au systeme : Archivo, 24 px, et de l'air au-dessus. Le titre
          etait en 20 px sur un filet fort, ce qui donnait a une section le poids d'un
          paragraphe. Voir design/DESIGN.md → Typography. */}
      <header className="flex flex-wrap items-baseline gap-x-[20px] gap-y-[6px] pt-[32px] pb-[14px] px-[16px]">
        <h2
          id={`${id}-t`}
          className="t-headline m-0"
          style={{ fontSize: '1.5rem', color: 'var(--ink)', textWrap: 'balance' }}
        >
          {title}
        </h2>
        <div className="ml-auto flex flex-wrap items-baseline gap-x-[14px] gap-y-[4px]">
          {meta?.map((m, i) => (
            <span
              key={i}
              // Le filet separe deux faits SUR LA MEME LIGNE. Replie, il pendait tout seul a
              // gauche d'un fait passe a la ligne : sous 700 px, l'espace suffit.
              className={i === 0 ? 't-data-sm' : 't-data-sm meta-filet'}
              style={{ color: 'var(--ink-2)' }}
            >
              {m}
            </span>
          ))}
          {right}
        </div>
      </header>
      {children}
    </section>
  )
}

/**
 * LA FORME COMMUNE D'UN REFUS — cinq surfaces l'ecrivaient chacune a sa maniere.
 *
 * Un refus motive est une fonctionnalite : il dit CE QUI MANQUE, POURQUOI, et LA COMMANDE qui
 * le ferait tourner en local. Il ne dit jamais zero, et il ne se deguise pas en panne quand
 * il n'en est pas une.
 */
export function Absence({
  quoi,
  raison,
  cmd,
  panne = false,
  etat,
}: {
  /** le nom de ce qui manque, tel qu'il s'appelle dans le depot */
  quoi: string
  raison: ReactNode
  /** la commande qui le ferait tourner ici, s'il y en a une */
  cmd?: string
  /** vrai quand c'est vraiment une panne, faux quand la piece n'existe simplement pas ici */
  panne?: boolean
  /** l'etat en deux mots, quand « absent » ou « ne repond pas » ne convient pas */
  etat?: ReactNode
}) {
  return (
    <div
      className="px-[16px] py-[12px] flex flex-col gap-[7px]"
      style={{ borderTop: '1px solid var(--line)' }}
      role={panne ? 'status' : undefined}
      aria-live={panne ? 'polite' : undefined}
    >
      <div className="flex flex-wrap items-baseline gap-[10px]">
        <span className="t-data hex" style={{ color: 'var(--ink)' }}>
          {quoi}
        </span>
        <span className="t-data-sm" style={{ color: panne ? 'var(--ink)' : 'var(--ink-2)' }}>
          {etat ?? (panne ? 'not responding' : 'absent from this build')}
        </span>
      </div>
      <p
        className="m-0 t-data-sm"
        style={{ color: 'var(--ink-2)', maxWidth: '76ch', lineHeight: 1.55, overflowWrap: 'anywhere' }}
      >
        {raison}
      </p>
      {cmd && (
        <div className="flex flex-wrap items-center gap-[8px]">
          <code className="t-data-sm hex" style={{ color: 'var(--ink-2)', overflowWrap: 'anywhere', minWidth: 0 }}>
            {cmd}
          </code>
          <Copy text={cmd} label="copy the command" />
        </div>
      )}
    </div>
  )
}

/**
 * Un lien sortant. Toute la page n'en portait qu'UN SEUL — ce qui, sur un instrument dont
 * l'argument est « verifie plutot que de me croire », etait une contradiction : rien n'etait
 * verifiable sans quitter le site a la main.
 */
export function Lien({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="t-data-xs underline"
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{ color: 'var(--focus)' }}
    >
      {children}
    </a>
  )
}

/**
 * Une valeur qu'on n'a pas pu lire. Elle s'affiche, elle ne se tait pas : un blanc se lirait
 * « rien », et rien se lit « zero ». C'est la meme regle que les etiquettes du corpus.
 */
export function NonLu({ quoi }: { quoi: string }) {
  return (
    <span className="t-data-xs" style={{ color: 'var(--ink-2)' }} title={`source missing: ${quoi}`}>
      not read
    </span>
  )
}
