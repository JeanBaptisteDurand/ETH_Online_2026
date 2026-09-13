/**
 * LE CONTENEUR DE DÉFILEMENT, LA PLANCHE 16:9 ET LE BANDEAU PRÉSENTATEUR.
 *
 * Deux sources, recousues :
 *   - `finale/SnapScroll.tsx` donne le conteneur `scroll-snap`, `BeatSection` (chaque temps
 *     porte `data-finale-beat="N"` pour que le présentateur puisse y aller), et le
 *     `PresenterOverlay` — chrono en haut à droite, compteur + tirets de progression + rappel
 *     des raccourcis en haut à gauche ;
 *   - `pages/Deck.tsx` donne la PLANCHE : un cadre 16:9 letterboxé, aussi grand que l'écran le
 *     permet, avec son en-tête (marque + marqueur) et son pied (légende + NN / 09).
 *
 * DEUX CORRECTIONS SUR LA SOURCE.
 *   1. Le conteneur qui défile est un ÉLÉMENT, pas la fenêtre. Tout est donc attaché au
 *      conteneur (voir `presenter.ts`), et le bandeau lit son compteur de là.
 *   2. Aucun arrondi, aucune ombre portée, et rien d'autre que nos jetons. Le violet de la
 *      source devient `--m-6`, son cyan devient `--focus`.
 *
 * LE DIMENSIONNEMENT. Le cadre est un CONTENEUR DE REQUÊTE (`container-type: size`) et tout ce
 * qu'il porte se mesure en `cqi` — pour cent de sa largeur. Une planche se comporte donc comme
 * une vraie diapositive : elle grandit et rétrécit d'un bloc, les proportions ne bougent jamais.
 * Le `max(Xcqi, Ypx)` est le plancher : sous 900 px la planche rend sa hauteur au contenu et les
 * `cqi` deviendraient illisibles.
 */
import type { ReactNode, RefObject } from 'react'
import { fmtChrono } from './presenter'
import type { PresenterState } from './presenter'
import { BEATS } from './tokens'

interface SnapScrollProps {
  presenter?: PresenterState
  active: boolean
  children: ReactNode
  scrollRef: RefObject<HTMLDivElement | null>
}

export function SnapScroll({ presenter, active, children, scrollRef }: SnapScrollProps) {
  return (
    <div ref={scrollRef} data-finale-scroll className="dk-scroll">
      <DeckStyles />
      {active && presenter && <PresenterOverlay presenter={presenter} />}
      {children}
    </div>
  )
}

interface BeatSectionProps {
  index: number
  id: string
  marqueur: string
  caption?: string
  total: number
  children: ReactNode
}

export function BeatSection({ index, id, marqueur, caption, total, children }: BeatSectionProps) {
  return (
    <section
      data-finale-beat={index}
      data-beat-id={id}
      id={`deck-${id}`}
      className="dk-beat"
      aria-label={marqueur}
    >
      <div className="dk-planche">
        <header className="dk-tete">
          <span className="dk-label">TARE · ETHOnline 2026</span>
          <span className="dk-label" style={{ marginLeft: 'auto', color: 'var(--m-5)' }}>
            {marqueur}
          </span>
        </header>

        <div className="dk-corps">{children}</div>

        <footer className="dk-pied">
          <span className="dk-label" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {caption ?? 'mesuré sur Base, bloc 50 614 000 — chaque nombre se rejoue en une commande'}
          </span>
          <span className="dk-label" style={{ marginLeft: 'auto' }}>
            {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
        </footer>
      </div>
    </section>
  )
}

function PresenterOverlay({ presenter }: { presenter: PresenterState }) {
  const total = BEATS.length
  const remaining = fmtChrono(presenter.remainingMs)
  const elapsedSec = Math.floor(presenter.elapsedMs / 1000)
  const overrun = presenter.remainingMs <= 0
  return (
    <>
      {/* Chrono, en haut à droite */}
      <div className="dk-hud dk-hud-d" style={{ color: overrun ? 'var(--m-4)' : 'var(--m-5)' }}>
        <span
          className="dk-pastille"
          style={{
            background: presenter.running ? 'var(--m-4)' : 'var(--ink-3)',
            animation: presenter.running ? undefined : 'none',
          }}
        />
        <span>{remaining}</span>
        <span style={{ color: 'var(--ink-3)', fontSize: 10 }}>/ 5:00</span>
        <span style={{ color: 'var(--ink-3)', fontSize: 10 }}>{elapsedSec}s écoulées</span>
      </div>

      {/* Compteur + feuille de route, en haut à gauche */}
      <div className="dk-hud dk-hud-g">
        <span style={{ color: 'var(--m-5)' }}>
          {(presenter.beat + 1).toString().padStart(2, '0')} / {total.toString().padStart(2, '0')}
        </span>
        <span style={{ color: 'var(--ink)' }}>{BEATS[presenter.beat]?.label ?? ''}</span>
        <span className="dk-tirets">
          {BEATS.map((b, i) => (
            <i
              key={b.id}
              data-etat={i < presenter.beat ? 'passe' : i === presenter.beat ? 'courant' : 'a-venir'}
            />
          ))}
        </span>
        <span style={{ color: 'var(--ink-3)', fontSize: 10, whiteSpace: 'nowrap' }}>
          espace · ← → · f · r
        </span>
      </div>
    </>
  )
}

/**
 * TOUTE LA FEUILLE DE STYLE DU DECK, dans le composant.
 *
 * Elle n'est PAS dans `index.css` : le deck est la seule surface du site qui se mesure en `cqi`
 * et qui vit dans un cadre de proportion fixe. La sortir d'ici obligerait à maintenir un jeu de
 * règles que rien d'autre n'utilise, et la source qu'on porte est elle-même 100 % style en ligne.
 */
function DeckStyles() {
  return (
    <style>{`
.dk-scroll{position:relative;height:calc(100dvh - 56px);overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;scroll-behavior:smooth;overscroll-behavior-y:contain;background:var(--bg)}
@media (prefers-reduced-motion: reduce){.dk-scroll{scroll-behavior:auto}}

.dk-beat{height:calc(100dvh - 56px);scroll-snap-align:start;display:flex;align-items:center;justify-content:center;padding:min(2vh,20px);box-sizing:border-box}
.dk-planche{width:min(98vw,calc((100dvh - 96px) * 16 / 9));max-width:100%;aspect-ratio:16 / 9;container-type:size;container-name:planche;display:flex;flex-direction:column;border:1px solid var(--line-strong);background:var(--bg-1);overflow:hidden;position:relative;box-sizing:border-box}
@media (max-width:900px){
  .dk-beat{height:auto;min-height:calc(100dvh - 56px);padding:12px;align-items:stretch}
  .dk-planche{width:100%;aspect-ratio:auto;min-height:calc(100dvh - 80px);container-type:inline-size}
}

.dk-tete,.dk-pied{display:flex;align-items:center;gap:1.2cqi;padding:1.7cqi 2.6cqi;flex:0 0 auto}
.dk-pied{padding-top:0}
.dk-corps{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;padding:0.4cqi 2.6cqi 1.2cqi;overflow:hidden}
@media (max-width:900px){
  .dk-tete,.dk-pied{padding:14px 16px;gap:10px}
  .dk-pied{padding-top:0}
  .dk-corps{padding:4px 16px 16px;overflow:visible;gap:10px}
}

/* --------------------------------------------------------------------- la typographie */
.dk-label{font-family:var(--mono);font-size:max(1.02cqi,10px);letter-spacing:0.16em;text-transform:uppercase;color:var(--ink-2);line-height:1.4}
.dk-eyebrow{display:flex;align-items:center;gap:1.1cqi;font-family:var(--mono);font-size:max(1.05cqi,10px);letter-spacing:0.2em;text-transform:uppercase;margin:0 0 1.2cqi;line-height:1.4}
.dk-filet{width:2.2cqi;min-width:16px;height:1px;flex:0 0 auto}
.dk-titre{font-family:var(--titre);font-weight:700;font-size:max(3.9cqi,23px);line-height:1.06;letter-spacing:-0.025em;color:var(--ink);margin:0;max-width:26ch;text-wrap:balance}
.dk-titre-petit{font-size:max(2.7cqi,20px);max-width:44ch}
.dk-sous{font-family:var(--prose);font-size:max(1.4cqi,13px);line-height:1.45;color:var(--ink-2);margin:1.1cqi 0 0;max-width:64ch}
.dk-prose{font-family:var(--prose);font-size:max(1.34cqi,12.5px);line-height:1.45;color:var(--ink-2);margin:0}
.dk-prose strong{color:var(--ink);font-weight:600}
.dk-mono{font-family:var(--mono);font-size:max(1.18cqi,11px);color:var(--ink-2);font-variant-numeric:tabular-nums}
.dk-corps code{font-family:var(--mono);font-size:0.94em;color:var(--ink)}
@media (max-width:900px){.dk-eyebrow{margin-bottom:10px}.dk-sous{margin-top:8px}}

/* --------------------------------------------------------------------- les grilles */
.dk-grille{display:grid;gap:1.3cqi;margin-top:1.5cqi;min-height:0}
.dk-grille>*{min-width:0;min-height:0}
.dk-g2{grid-template-columns:repeat(2,minmax(0,1fr))}
.dk-g3{grid-template-columns:repeat(3,minmax(0,1fr))}
.dk-g4{grid-template-columns:repeat(4,minmax(0,1fr))}
/* la grille du chat, telle quelle dans la source */
.dk-g12{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)}
.dk-g11{grid-template-columns:minmax(0,1.1fr) minmax(0,0.9fr)}
.dk-g085{grid-template-columns:minmax(0,0.85fr) minmax(0,1fr)}
.dk-fill{flex:1 1 auto;min-height:0}
@media (max-width:900px){
  .dk-grille{gap:10px;margin-top:12px}
  .dk-g2,.dk-g3,.dk-g4,.dk-g12,.dk-g11,.dk-g085{grid-template-columns:minmax(0,1fr)}
}

/* --------------------------------------------------------------------- un chiffre */
.dk-stat{border:1px solid var(--line);background:var(--surface-1);padding:1.3cqi 1.5cqi;display:flex;flex-direction:column;gap:0.5cqi;justify-content:center;min-width:0}
.dk-stat b{font-family:var(--mono);font-weight:500;font-size:max(3.2cqi,22px);line-height:1.02;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.dk-stat span{font-family:var(--prose);font-size:max(1.22cqi,12px);line-height:1.35;color:var(--ink)}
.dk-stat i{font-family:var(--mono);font-style:normal;font-size:max(0.98cqi,10px);line-height:1.4;color:var(--ink-2);overflow-wrap:anywhere}
@media (max-width:900px){.dk-stat{padding:12px 14px;gap:5px}}

/* --------------------------------------------------------------------- une carte */
.dk-carte{border:1px solid var(--line);background:var(--surface-1);padding:1.3cqi 1.5cqi;display:flex;flex-direction:column;gap:1cqi;min-width:0;min-height:0}
.dk-carte-titre{font-family:var(--mono);font-size:max(1.0cqi,10px);letter-spacing:0.18em;text-transform:uppercase;color:var(--ink-2);flex:0 0 auto}
@media (max-width:900px){.dk-carte{padding:12px 14px;gap:10px}}

/* --------------------------------------------------------------------- la vitre */
.dk-vitre{display:flex;flex-direction:column;border:1px solid var(--line);background:var(--bg);min-height:0;min-width:0;overflow:hidden}
.dk-vitre-barre{display:flex;align-items:center;gap:0.9cqi;padding:0.7cqi 1.1cqi;border-bottom:1px solid var(--line);background:var(--bg-2);flex:0 0 auto}
.dk-vitre iframe{flex:1 1 auto;width:100%;min-height:0;border:0;background:var(--bg);display:block}
@media (max-width:900px){
  .dk-vitre-barre{padding:8px 10px;gap:8px}
  .dk-vitre iframe{height:62vw;min-height:260px;flex:0 0 auto}
}

/* --------------------------------------------------------------------- les signaux */
.dk-pastille{display:inline-block;width:max(0.62cqi,6px);height:max(0.62cqi,6px);background:var(--m-5);flex:0 0 auto;animation:dk-pulse 1.4s infinite}
.dk-caret{display:inline-block;width:max(0.42cqi,4px);height:0.95em;margin-left:2px;background:var(--m-5);vertical-align:-0.12em;animation:dk-clign 1s steps(1) infinite}
@keyframes dk-pulse{0%,100%{opacity:1}50%{opacity:0.25}}
@keyframes dk-clign{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes dk-entre{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.dk-pastille,.dk-caret,.dk-bulle{animation:none !important}}

/* --------------------------------------------------------------------- le chat MCP */
.dk-chat{display:flex;flex-direction:column;border:1px solid var(--line-strong);background:var(--surface-1);min-height:0;height:100%;overflow:hidden}
.dk-chat-tete{display:flex;align-items:center;gap:0.8cqi;padding:0.8cqi 1.2cqi;border-bottom:1px solid var(--line);background:var(--bg-2);flex:0 0 auto}
.dk-chat-zone{flex:1 1 auto;min-height:0;overflow-y:auto;padding:1.1cqi 1.3cqi;display:flex;flex-direction:column;gap:1cqi;font-family:var(--mono);font-size:max(1.0cqi,10.5px);line-height:1.55}
.dk-bulle{padding:0.8cqi 1.1cqi;border:1px solid var(--line);background:var(--bg-2);white-space:pre-wrap;overflow-wrap:anywhere;max-width:92%;min-width:0;display:flex;flex-direction:column;gap:0.5cqi;color:var(--ink-2);animation:dk-entre 240ms ease-out both}
.dk-bulle[data-role='user']{align-self:flex-end;border-color:var(--line-strong);background:var(--bg-3);color:var(--ink)}
.dk-bulle[data-role='tool']{align-self:flex-start;border-color:var(--focus)}
.dk-bulle[data-role='agent']{align-self:flex-start}
@media (max-width:900px){
  .dk-chat{height:auto}
  .dk-chat-tete{padding:8px 10px;gap:8px}
  .dk-chat-zone{padding:10px 12px;gap:10px;max-height:52vh}
  .dk-bulle{padding:8px 10px;gap:5px;max-width:100%}
}

/* --------------------------------------------------------------------- les boutons */
.dk-prompt{text-align:left;padding:1cqi 1.2cqi;border:1px solid var(--line-strong);background:var(--bg-2);color:var(--ink);font-family:var(--prose);font-size:max(1.26cqi,12.5px);font-weight:500;cursor:pointer;display:flex;align-items:center;gap:0.8cqi;min-width:0;transition:background var(--t-feedback) linear,border-color var(--t-feedback) linear}
.dk-prompt>span{min-width:0;overflow-wrap:anywhere}
.dk-prompt:hover:not(:disabled){background:var(--bg-3);border-color:var(--m-5)}
.dk-prompt:disabled{opacity:0.5;cursor:not-allowed}
.dk-ghost{font-family:var(--mono);font-size:max(0.98cqi,10px);letter-spacing:0.14em;text-transform:uppercase;color:var(--ink-2);background:transparent;border:1px solid var(--line);padding:0.4cqi 0.8cqi;cursor:pointer;white-space:nowrap}
.dk-ghost:hover{color:var(--ink);border-color:var(--line-strong)}
.dk-ghost[aria-pressed='true']{color:var(--ink);border-color:var(--m-5)}
@media (max-width:900px){
  .dk-prompt{padding:10px 12px;gap:8px}
  .dk-ghost{padding:6px 8px}
}

/* --------------------------------------------------------------------- les listes d'étapes */
.dk-etape{display:flex;align-items:baseline;gap:0.9cqi;padding:0.55cqi 0;border-top:1px solid var(--line);transition:opacity 320ms var(--e-enter)}
.dk-etape:first-of-type{border-top:0}
.dk-etape>.dk-num{font-family:var(--mono);font-size:max(1.02cqi,10px);color:var(--ink-2);min-width:max(1.8cqi,16px);flex:0 0 auto}
@media (max-width:900px){.dk-etape{gap:8px;padding:6px 0}}

/* --------------------------------------------------------------------- une cellule d'agrégat */
.dk-agg{border:1px solid var(--line);background:var(--surface-1);padding:1.3cqi 1.5cqi;display:flex;flex-direction:column;gap:0.4cqi;justify-content:center;min-width:0}
.dk-agg b{font-family:var(--mono);font-weight:500;font-size:max(2.9cqi,22px);line-height:1;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.dk-agg i{font-family:var(--prose);font-style:normal;font-size:max(1.16cqi,11.5px);line-height:1.4;color:var(--ink-2)}
@media (max-width:900px){.dk-agg{padding:12px 14px;gap:5px}}

/* --------------------------------------------------------------------- un champ LABEL / valeur */
.dk-champ{display:grid;grid-template-columns:minmax(0,14cqi) minmax(0,1fr);gap:1cqi;align-items:baseline;min-width:0}
@media (max-width:900px){.dk-champ{grid-template-columns:minmax(0,1fr);gap:2px}}

/* --------------------------------------------------------------------- les écrans Ledger */
.dk-ecran{border:1px solid var(--line);background:var(--bg-2);padding:0.9cqi 1.1cqi;display:flex;flex-direction:column;gap:0.35cqi;min-width:0;transition:opacity 320ms var(--e-enter),transform 320ms var(--e-enter),border-color 320ms linear}
.dk-ecran b{font-family:var(--mono);font-weight:500;font-size:max(1.22cqi,11.5px);color:var(--ink);overflow-wrap:anywhere;line-height:1.3}
@media (max-width:900px){.dk-ecran{padding:8px 10px}}

/* --------------------------------------------------------------------- une puce d'outil */
.dk-puce{font-family:var(--mono);font-size:max(1.0cqi,10.5px);border:1px solid var(--line);background:var(--bg-2);padding:0.4cqi 0.7cqi;cursor:pointer;white-space:nowrap}
.dk-puce:hover{border-color:var(--line-strong)}
@media (max-width:900px){.dk-puce{padding:5px 8px}}

/* --------------------------------------------------------------------- le bandeau présentateur */
.dk-hud{position:fixed;z-index:40;display:flex;align-items:center;gap:10px;padding:7px 11px;border:1px solid var(--line-strong);background:var(--bg-1);font-family:var(--mono);font-size:11px;font-variant-numeric:tabular-nums;max-width:calc(100vw - 32px);overflow:hidden}
.dk-hud-g{top:64px;left:16px}
.dk-hud-d{top:64px;right:16px}
.dk-tirets{display:flex;gap:4px;align-items:center;flex:0 0 auto}
.dk-tirets i{display:block;width:6px;height:3px;background:var(--line-strong);transition:width 240ms cubic-bezier(0.2,0.8,0.2,1)}
.dk-tirets i[data-etat='passe']{background:var(--focus)}
.dk-tirets i[data-etat='courant']{background:var(--m-5);width:18px}
`}</style>
  )
}
