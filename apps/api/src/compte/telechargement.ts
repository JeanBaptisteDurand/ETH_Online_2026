/**
 * LES DEUX TELECHARGEMENTS QUE LE COMPTE ANNONCE.
 *
 * `GET /compte` publiait `/compte/extension.zip` et `/compte/mcp.tgz` — et aucune des deux
 * routes n'existait. Un service qui annonce une adresse et rend 404 dessus est pire qu'un
 * service qui n'annonce rien : l'utilisateur cherche l'erreur chez lui.
 *
 * LES DEUX PAQUETS SONT CONSTRUITS PAR LEUR PROPRE PAQUET, pas ici :
 *
 *   extension  packages/guard/scripts/paqueter-extension.mjs  ->  dist/tare-guard.zip
 *              (+ un .json a cote qui porte octets, sha256, version et l'etat de la table)
 *   mcp        `npm pack` dans apps/mcp                        ->  dist/tare-mcp-<v>.tgz
 *
 * Ce module les TROUVE, les verifie et les sert. Il ne les fabrique pas — sauf le tarball du
 * MCP, que `npm pack` produit en une commande deterministe et qu'il est donc raisonnable de
 * demander a la volee.
 *
 * ET IL NE MENT PAS SUR CE QU'IL N'A PAS. Un paquet absent rend une RAISON qui dit la
 * commande a lancer, jamais un 404 nu ni un fichier vide. C'est la meme regle que partout
 * ici : un artefact non construit est un etat nomme, pas un silence.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "../paths.js";

export interface Paquet {
  /** le chemin absolu du fichier a servir */
  chemin: string;
  nom: string;
  octets: number;
  sha256: string;
  /** le type MIME a annoncer */
  type: string;
  version: string | null;
  /** construit le, en ISO — c'est la mtime du fichier, pas une date inventee */
  construit_le: string;
  /** ce que le paquet contient de notable, quand on le sait */
  contenu: Record<string, unknown> | null;
}

export interface PaquetAbsent {
  raison: string;
  /** la commande exacte a lancer pour le produire */
  commande: string;
}

export type Resultat = Paquet | PaquetAbsent;

export const estAbsent = (r: Resultat): r is PaquetAbsent => "raison" in r;

function sha256(chemin: string): string {
  return createHash("sha256").update(readFileSync(chemin)).digest("hex");
}

/* ------------------------------------------------------------- l'extension */

const DIST_GUARD = resolve(REPO_ROOT, "packages", "guard", "dist");

/**
 * Le zip de l'extension, tel que le script d'empaquetage l'a laisse.
 *
 * On lit le `.json` a cote quand il existe, et on RECALCULE quand meme le sha256 du fichier :
 * un releve qui ne correspond plus au zip qu'il decrit est un releve qui mentirait, et il
 * vaut mieux le detecter ici que le publier.
 */
export function paquetExtension(): Resultat {
  const zip = resolve(DIST_GUARD, "tare-guard.zip");
  const commande = "cd packages/guard && npm run build:table && npm run build:paquet";
  if (!existsSync(zip))
    return {
      raison:
        "l'extension n'est pas empaquetee : packages/guard/dist/tare-guard.zip est absent. " +
        "Le paquet contient la table des mesures, qui se construit d'abord.",
      commande,
    };

  const st = statSync(zip);
  const somme = sha256(zip);
  const releveChemin = zip + ".json";
  let contenu: Record<string, unknown> | null = null;
  let version: string | null = null;
  if (existsSync(releveChemin)) {
    try {
      const r = JSON.parse(readFileSync(releveChemin, "utf8")) as {
        version?: string;
        sha256?: string;
        table?: Record<string, unknown>;
      };
      version = r.version ?? null;
      contenu = { table: r.table ?? null };
      if (r.sha256 && r.sha256 !== somme)
        return {
          raison:
            `le releve dist/tare-guard.zip.json annonce le sha256 ${r.sha256.slice(0, 16)}… mais le ` +
            `zip present fait ${somme.slice(0, 16)}… : l'un des deux est perime. On ne sert pas un ` +
            "paquet dont on ne sait pas ce qu'il contient",
          commande,
        };
    } catch {
      // Un releve illisible n'empeche pas de servir le zip : il n'ajoutait qu'une description.
      contenu = null;
    }
  }

  return {
    chemin: zip,
    nom: "tare-guard.zip",
    octets: st.size,
    sha256: somme,
    type: "application/zip",
    version,
    construit_le: st.mtime.toISOString(),
    contenu,
  };
}

/* -------------------------------------------------------------------- le MCP */

const MCP = resolve(REPO_ROOT, "apps", "mcp");
const DIST_MCP = resolve(MCP, "dist-paquet");

/**
 * Le tarball du serveur MCP, produit par `npm pack`.
 *
 * `npm pack` respecte le champ `files` du package.json — donc il embarque `dist`, `SKILL.md`
 * et `README.md`, et rien d'autre. C'est ce qu'on veut : ni node_modules, ni les sources, ni
 * les 21 Mo de personne.
 *
 * Il exige que `dist/` existe, c'est-a-dire que `npm run build` ait tourne. S'il n'existe pas,
 * on le DIT au lieu de livrer un tarball de trois fichiers de metadonnees qui ne demarrerait
 * pas — c'est le genre de paquet qui fait perdre une heure a celui qui l'installe.
 */
export function paquetMcp(): Resultat {
  const commande = "cd apps/mcp && npm run build";
  const entree = resolve(MCP, "dist", "src", "index.js");
  if (!existsSync(entree))
    return {
      raison:
        `le serveur MCP n'est pas construit : ${entree.replace(REPO_ROOT + "/", "")} est absent. ` +
        "Un tarball fabrique maintenant ne contiendrait aucun code executable.",
      commande,
    };

  // On reconstruit le tarball si le code est plus recent que lui. `npm pack` est
  // deterministe a contenu egal, mais son nom porte la version : on prend le plus recent.
  let existant: { chemin: string; mtime: number } | null = null;
  if (existsSync(DIST_MCP)) {
    for (const f of readdirSync(DIST_MCP)) {
      if (!f.endsWith(".tgz")) continue;
      const c = resolve(DIST_MCP, f);
      const m = statSync(c).mtimeMs;
      if (!existant || m > existant.mtime) existant = { chemin: c, mtime: m };
    }
  }
  const mtimeCode = statSync(entree).mtimeMs;

  if (!existant || existant.mtime < mtimeCode) {
    try {
      // `npm pack --pack-destination` n'existe PAS le dossier : il echoue sur un ENOENT dont
      // le message parle du .tgz et pas du dossier, ce qui envoie chercher au mauvais endroit.
      mkdirSync(DIST_MCP, { recursive: true });
      execFileSync("npm", ["pack", "--pack-destination", DIST_MCP, "--silent"], {
        cwd: MCP,
        stdio: "pipe",
        timeout: 60_000,
      });
    } catch (e) {
      return {
        raison: `npm pack a echoue : ${(e as Error).message.slice(0, 160)}`,
        commande: `cd apps/mcp && npm pack --pack-destination ${DIST_MCP}`,
      };
    }
    existant = null;
    for (const f of readdirSync(DIST_MCP)) {
      if (!f.endsWith(".tgz")) continue;
      const c = resolve(DIST_MCP, f);
      const m = statSync(c).mtimeMs;
      if (!existant || m > existant.mtime) existant = { chemin: c, mtime: m };
    }
    if (!existant)
      return { raison: "npm pack n'a laisse aucun .tgz derriere lui", commande };
  }

  const st = statSync(existant.chemin);
  let version: string | null = null;
  let contenu: Record<string, unknown> | null = null;
  try {
    const pj = JSON.parse(readFileSync(resolve(MCP, "package.json"), "utf8")) as {
      version?: string;
      name?: string;
      bin?: Record<string, string>;
      files?: string[];
    };
    version = pj.version ?? null;
    contenu = { nom: pj.name ?? null, bin: pj.bin ?? null, fichiers: pj.files ?? null };
  } catch {
    /* le package.json illisible n'empeche pas de servir le tarball */
  }

  return {
    chemin: existant.chemin,
    nom: existant.chemin.split("/").pop() ?? "tare-mcp.tgz",
    octets: st.size,
    sha256: sha256(existant.chemin),
    type: "application/gzip",
    version,
    construit_le: st.mtime.toISOString(),
    contenu,
  };
}
