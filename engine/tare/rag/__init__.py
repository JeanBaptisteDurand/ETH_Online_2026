"""Le RAG vectoriel de TARE.

Le graphe (engine/tare/graph/) repond aux questions structurelles : qui partage
ce bytecode, quel deployeur, quels pools re-mesurer. Il ne repond pas a "que dit
la methode quand le pool refuse de coter ?". C'est la moitie que ce module
ajoute — et il l'ajoute en s'appuyant sur le graphe, pas a cote de lui.

La technique centrale est reprise de cobol-explorer
(ingestion/index/chunk.py) : `chunk_corpus()` ne vectorise JAMAIS le texte brut.
Chaque document est PREFIXE d'un en-tete derive du graphe — pools attaches,
jumeaux au meme bytecode, deployeur, profil bps avec ses etiquettes — puis le
contenu. Le vecteur porte donc la structure autant que la prose, et une question
comme "les hooks du meme deployeur que celui a 689 bps" trouve une fiche que le
texte seul n'aurait pas fait remonter, parce que la fiche ne contient pas le
nombre 689.

Quatre regles tenues ici, les memes que partout dans TARE :

  1. Aucun nombre n'est fabrique. Les bps d'un en-tete viennent des noeuds
     Measurement du graphe, avec leur etiquette ; ils ne sont pas recalcules.
  2. Les etiquettes MEASURED / INTERPOLATED / NOT_MEASURABLE / NOT_QUOTABLE
     sont recopiees, jamais promues, et l'en-tete les compte separement pour
     qu'un "0 bps" ne se confonde pas avec "on n'a pas su coter".
  3. Une reponse tronquee n'est pas une reponse. Un lot d'embeddings qui revient
     incomplet leve `EmbedError` ; il n'est jamais complete par des zeros, et un
     index partiel n'est jamais charge en base comme s'il etait complet.
  4. Chaque passage rendu porte son fichier ET ses lignes, et se rejoue en une
     commande (`sed -n '67,100p' docs/METHOD.md`).

Le corpus est DECLARE, dans corpus.py, source par source, avec un drapeau
`required`. C'est deliberement rigide : un index vide n'est un bug qu'on
decouvre a la demo que si personne n'a ecrit ce qu'il devait contenir.
"""
from __future__ import annotations

__all__ = ["__version__"]

__version__ = "tare-rag/0.1.0"
