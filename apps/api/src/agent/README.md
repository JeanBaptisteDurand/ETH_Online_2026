# L'identite d'agent — HCS-14

La piste de paiement de TARE vit deja sur un topic HCS : chaque lot de mesures y depose son
empreinte, son nombre d'unites et son hash de reglement. Il y manquait une chose — **qui** a
produit ces mesures. « Le compte `0.0.10367920` » repond a *qui a paye*, pas a *quel service*.

[HCS-14](https://hol.org/docs/standards/hcs-14/) donne cette reponse sous une forme qu'un
tiers peut **recalculer** au lieu de nous croire : un identifiant derive des champs de
l'agent, pas attribue par un annuaire.

## L'identifiant, et il est publie

```
uaid:aid:9gmr4c6opC3zeSWSZzv23pjXkfbTvEeRHKdXkgMJqX7FG9133ocwFuCXL6uwBWiTHY;registry=self;proto=mcp;nativeId=hedera:testnet:0.0.10367920;uid=0
```

| | |
|---|---|
| Annonce | message **#12** du topic **`0.0.10371106`** (Hedera testnet) |
| Transaction | `0.0.10367920@1788963789.956383767` |
| Horodatage de consensus | `1788963795.977788104` |
| Cout observe | **433 840 tinybar** (353 octets), soit ~0,0043 HBAR |
| Etat | `ANNOUNCED` — le mirror node rend le message **octet pour octet** |
| HashScan | <https://hashscan.io/testnet/topic/0.0.10371106> |

Le message publie porte l'identifiant **et les six champs qui l'ont produit**, pour que le
lecteur refasse le calcul :

```json
{"v":"tare.agent.v1",
 "uaid":"uaid:aid:9gmr4c6opC3zeSWSZzv23pjXkfbTvEeRHKdXkgMJqX7FG9133ocwFuCXL6uwBWiTHY;registry=self;proto=mcp;nativeId=hedera:testnet:0.0.10367920;uid=0",
 "canonical":{"name":"TARE","nativeId":"hedera:testnet:0.0.10367920","protocol":"mcp",
              "registry":"self","skills":[10,17,21,33,39],"version":"0.1.0"},
 "ts":"2026-09-09T14:23:15.547Z"}
```

C'est le **meme topic** que la piste de paiement, et c'est voulu : le `nativeId` de l'identite
est le compte qui figure en `payer` dans les lignes du journal. Les deux se recoupent sans
qu'on ait a les relier a la main.

## Les six champs, et la justification de chacun

| champ | valeur | pourquoi |
|---|---|---|
| `registry` | `self` | La norme : *« for self-sovereign agents lacking a specific registry, the registry field shall be set to `self` »*. TARE n'est inscrit dans **aucun** annuaire d'agents ; ecrire `hol` ou `hedera` revendiquerait une inscription qui n'existe pas |
| `name` | `TARE` | |
| `version` | `0.1.0` | celle de `apps/api/package.json` — un test l'y compare, pour qu'elle ne derive pas en silence |
| `protocol` | `mcp` | on expose un serveur MCP reel (`apps/mcp`, quatre outils, 33 tests). **Pas** `hcs-10` : on n'implemente pas ce protocole |
| `nativeId` | `hedera:testnet:0.0.10367920` | le compte qui paie les ancrages et a cree le topic |
| `skills` | `[10, 17, 21, 33, 39]` | voir ci-dessous |

Chaque code correspond a quelque chose qui **tourne** dans ce depot :

| | | |
|---|---|---|
| 10 | Transaction Analytics | le contrefactuel : 125 072 mesures de swaps sur Base |
| 17 | API Integration | `apps/api`, x402 sur Hedera, peage a la mesure |
| 21 | Tool Provider | `apps/mcp`, quatre outils exposes a un agent |
| 33 | Blockchain Integration | fork Base epingle, `anvil_setCode`, lectures on-chain |
| 39 | Trust Attestation | `contracts/` : 99 hooks et leur prelevement, lisibles on-chain |

Et **volontairement pas revendiques**, alors qu'ils etaient tentants :

| | | |
|---|---|---|
| 11 | Smart Contract Audit | on lit du source verifie, on n'audite pas |
| 34 | Consensus Participation | on **ecrit** sur HCS, on ne participe pas au consensus |
| 7 | Knowledge Retrieval | l'assistant recherche, mais il ne produit aucun nombre |

## Ce que la norme ne donne pas, et qu'il faut dire

1. **Aucun vecteur de test complet.** La specification publie deux exemples **avec leurs
   entrees mais sans leurs empreintes**. Il n'existe donc aucun resultat de reference contre
   lequel se comparer. Nos tests valident le base58 contre les vecteurs standard de Bitcoin
   **et** contre `bs58@4.0.1` (implementation independante, presente dans
   `packages/keyring/node_modules`), et la canonicalisation regle par regle contre le
   pseudo-code. Ce qu'ils ne peuvent pas valider, c'est que notre lecture est celle qu'un
   autre implementeur ferait. **C'est une limite reelle**, et elle est ecrite dans la reponse
   de `GET /agent`, pas seulement ici.
2. **Le texte se contredit.** Son exemple de « JSON canonique » montre les cles dans l'ordre
   `skills, name, nativeId, protocol, registry, version` — donc **pas trie**. Son pseudo-code
   fait `JSON.stringify(canonical, Object.keys(canonical).sort())`, qui **trie**. On suit le
   pseudo-code, parce que c'est lui qui est executable.
3. **La variante de base58 n'est pas nommee.** On prend l'alphabet de Bitcoin, le seul que
   « Base58 » designe sans qualificatif.

## Les pieges tenus par des tests

- **Trier les competences en nombres, pas en chaines.** `[0, 17, 9].sort()` rend `[0, 17, 9]`
  et non `[0, 9, 17]` : deux agents aux memes competences auraient deux identites.
- **Les zeros de tete du base58.** Passer par un `BigInt` les avalerait, et deux empreintes
  differentes se liraient pareil. L'implementation pose la division a la main.
- **Les parametres de routage n'entrent pas dans l'empreinte.** La norme est explicite :
  *« Communication details are NOT included in the hash »*. Changer `uid` change la chaine
  finale mais **pas** le hash.
- **Un champ requis vide leve** au lieu d'etre remplace par du vide.
- **On ne republie jamais une identite deja annoncee** — chaque message coute du HBAR, et une
  piste ou la meme annonce figure deux fois n'est plus une piste. Si la lecture du topic est
  incomplete, `publish` **s'arrete** plutot que de risquer un doublon permanent.

## Routes

```
GET /agent        l'identite, sa methode, et de quoi la recalculer sans nous
GET /agent/hcs    les annonces telles qu'elles sont LUES sur le topic
                  (404 NOT_ANNOUNCED si le topic n'en porte aucune,
                   503 NOT_READABLE si la pagination du mirror s'interrompt)
```

## Commandes

```bash
cd apps/api
npx vitest run test/agent.test.ts     # 28 tests
npx tsx src/agent/cli.ts show         # calcule l'identifiant, sans reseau
npx tsx src/agent/cli.ts read         # les annonces deja sur le topic
npx tsx src/agent/cli.ts publish      # publie, puis relit sur le mirror node
```
