/**
 * « Y A-T-IL QUELQUE CHOSE A JOINDRE ? » — une seule fonction, pour une seule raison.
 *
 * Sans `VITE_TARE_API` (ou `VITE_ASSISTANT_URL`) au build, le paquet publie porte
 * `http://127.0.0.1:8787` en dur. Sur un poste de developpeur c'est le bon comportement. Sur
 * une URL publique, c'est un encart qui affiche « 127.0.0.1 injoignable » a un visiteur — et
 * ca ne se lit pas comme « il n'y a pas d'API publiee », ca se lit comme « ce site est
 * casse ».
 *
 * Les deux etats ne meritent pas le meme texte, et le visiteur ne peut pas trancher
 * lui-meme. Cette fonction est le seul endroit qui les distingue : elle etait ecrite DEUX
 * fois, dans GraphApi.ts et dans chat/client.ts, ce qui est exactement ce qui divergera un
 * jour — l'une corrigee, l'autre non, et personne pour s'en apercevoir.
 *
 * Elle est PURE : ni `location`, ni `import.meta.env`, rien de global. Les appelants lisent
 * l'environnement, elle decide.
 */

/** Les hotes ou un service sur 127.0.0.1 a une chance de repondre. */
export function estHoteLocal(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    // `file://` et les environnements sans DOM rendent une chaine vide : on suppose local,
    // parce qu'un test ou un aperçu hors ligne doit pouvoir joindre son propre serveur.
    hostname === '' ||
    hostname.endsWith('.local')
  )
}

/** Vrai quand cette adresse pointe sur la machine qui affiche la page. */
export function estAdresseLocale(base: string): boolean {
  const m = /^https?:\/\/([^/:]+)/.exec(base)
  return m ? estHoteLocal(m[1]!) : false
}

/**
 * Vrai quand il n'y a rien a joindre : l'adresse est un repli local ET la page est publique.
 *
 * `donneeAuBuild` distingue « personne n'a configure d'API » de « une API est configuree et
 * elle se trouve etre locale » — le second cas est un choix de l'exploitant, pas un oubli, et
 * on le laisse essayer.
 */
export function rienAJoindre(args: {
  base: string
  donneeAuBuild: boolean
  hostname: string
}): boolean {
  if (args.donneeAuBuild) return false
  if (estHoteLocal(args.hostname)) return false
  return estAdresseLocale(args.base)
}
