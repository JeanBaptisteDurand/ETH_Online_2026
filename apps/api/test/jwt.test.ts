/**
 * LE JETON DE SESSION — CE QU'IL DOIT REFUSER.
 *
 * Un vérificateur de JWT se juge sur ses refus, pas sur ses acceptations. Les quatre pièges
 * testés ici sont ceux qui ont réellement fait tomber des produits :
 *
 *   1. `alg: "none"` — la faille a vingt ans et elle marche encore partout où l'en-tête est
 *      cru sur parole. Ici l'en-tête n'est lu que pour être refusé, jamais pour choisir un
 *      algorithme ;
 *   2. une charge modifiée — changer `sub` pour l'identifiant d'un autre compte doit casser
 *      la signature, sinon le jeton est un formulaire à remplir ;
 *   3. l'expiration — un jeton qui survit à son `exp` n'est plus une session, c'est une clé ;
 *   4. la forme — deux segments, quatre segments, du vide : tout ce qui n'est pas un JWT est
 *      refusé avant d'être interprété.
 *
 * Et un cinquième, qui est le point du fichier `jwt.ts` : **la révocation**. Elle ne vit pas
 * ici — elle vit dans `store.ts`, par le `jti`. Ce test vérifie seulement que le `jti` est
 * bien transporté et lisible, parce que sans lui la révocation n'aurait rien à quoi s'accrocher.
 */
import { describe, expect, it } from "vitest";
import { signer, verifier, direRefus, type Charge } from "../src/compte/jwt.js";

const maintenant = () => Math.floor(Date.now() / 1000);

const charge = (o: Partial<Charge> = {}): Charge => ({
  sub: "00000000-0000-0000-0000-000000000001",
  adresse: "0xabc0000000000000000000000000000000000001",
  jti: "un-identifiant-de-session",
  iat: maintenant(),
  exp: maintenant() + 3600,
  ...o,
});

/** Réencode une charge sans toucher à la signature — la fabrique du jeton falsifié. */
const remplacerCharge = (jeton: string, nouvelle: Charge): string => {
  const [entete, , sig] = jeton.split(".");
  const c = Buffer.from(JSON.stringify(nouvelle), "utf8").toString("base64url");
  return `${entete}.${c}.${sig}`;
};

describe("le jeton de session", () => {
  it("se relit tel qu'il a ete signe, jti compris", () => {
    const c = charge();
    const v = verifier(signer(c));
    expect("refus" in v).toBe(false);
    expect(v).toMatchObject({ sub: c.sub, adresse: c.adresse, jti: c.jti });
  });

  it("se lit SANS cle : un client sait a quelle adresse il est connecte", () => {
    // C'est la difference avec un jeton opaque, et la raison d'etre du JWT ici.
    const jeton = signer(charge({ adresse: "0xdead000000000000000000000000000000000001" }));
    const lu = JSON.parse(Buffer.from(jeton.split(".")[1]!, "base64url").toString("utf8"));
    expect(lu.adresse).toBe("0xdead000000000000000000000000000000000001");
  });

  it("refuse alg:none, meme avec une charge parfaitement valide", () => {
    const c = charge();
    const entete = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }), "utf8").toString("base64url");
    const corps = Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
    const v = verifier(`${entete}.${corps}.`);
    expect(v).toEqual({ refus: "algorithme" });
  });

  it("refuse une charge modifiee : on ne devient pas un autre compte", () => {
    const jeton = signer(charge());
    const falsifie = remplacerCharge(jeton, charge({ sub: "00000000-0000-0000-0000-000000000002" }));
    expect(verifier(falsifie)).toEqual({ refus: "signature" });
  });

  it("refuse un jeton expire, a la seconde", () => {
    const c = charge({ iat: maintenant() - 7200, exp: maintenant() - 1 });
    expect(verifier(signer(c))).toEqual({ refus: "expire" });
  });

  it("accepte encore un jeton qui expire dans une seconde", () => {
    // La borne doit etre franche : `exp` au futur passe, `exp` au passe echoue. Un decalage
    // d'un signe deconnecte tout le monde, ou ne deconnecte personne.
    const c = charge({ exp: maintenant() + 1 });
    expect("refus" in verifier(signer(c))).toBe(false);
  });

  it("refuse tout ce qui n'a pas la forme d'un JWT", () => {
    for (const mauvais of ["", "abc", "a.b", "a.b.c.d", "....."]) {
      const v = verifier(mauvais);
      expect("refus" in v, `« ${mauvais} » aurait du etre refuse`).toBe(true);
    }
  });

  it("refuse une signature de la bonne longueur mais fausse", () => {
    // Une comparaison naive qui s'arrete au premier octet different fuit du temps ; la
    // comparaison est en temps constant, et ce test garde au moins le refus.
    const jeton = signer(charge());
    const [e, c, s] = jeton.split(".") as [string, string, string];
    const octets = Buffer.from(s, "base64url");
    octets[0] = octets[0]! ^ 0xff;
    expect(verifier(`${e}.${c}.${octets.toString("base64url")}`)).toEqual({ refus: "signature" });
  });

  it("chaque refus dit sa raison — un 401 muet fait deviner, et on devine mal", () => {
    for (const r of ["forme", "algorithme", "signature", "expire", "charge"] as const) {
      expect(direRefus(r).length).toBeGreaterThan(20);
    }
  });

  it("deux sessions du meme compte ont des jti differents", () => {
    // Sans ca, revoquer une session les revoquerait toutes — ou aucune.
    const a = verifier(signer(charge({ jti: "session-a" })));
    const b = verifier(signer(charge({ jti: "session-b" })));
    expect((a as Charge).jti).not.toBe((b as Charge).jti);
  });
});
