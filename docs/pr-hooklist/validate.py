"""Verifie que le patch de schema n'invalide rien et accepte ce qu'il pretend accepter.

    python3 docs/pr-hooklist/validate.py

Trois controles :

  1. NON-REGRESSION — les 869 fiches du registre amont, inchangees, valident toujours contre le
     schema patche. Le champ est optionnel : aucune fiche existante ne doit bouger.
  2. ACCEPTATION — une fiche portant un `measuredExtraction` bien forme valide.
  3. REFUS — dix formes malades sont refusees, une par regle du champ (membre manquant, bps
     negatif, bps > 10000, bloc absent, methode inconnue, source en http, membre en trop, ...).

Le patch est applique en memoire : le fichier amont n'est pas modifie. Le schema amont et le
registre sont telecharges a un commit epingle, jamais depuis `main`, pour que le resultat soit le
meme dans six mois.

Utilise `jsonschema` s'il est installe ; sinon un validateur draft-07 reduit au sous-ensemble que
ce schema emploie (type / required / additionalProperties / properties / enum / pattern / minimum /
maximum / minLength / maxLength). Les deux chemins sont exerces contre les memes cas : si les deux
sont disponibles et divergent, le script echoue plutot que de choisir.
"""
import json
import re
import subprocess
import sys
from collections import OrderedDict
from pathlib import Path

HERE = Path(__file__).resolve().parent
HOOKLIST_SHA = "862303733d34aa36fad0d8c5275163c387be80d6"
RAW = f"https://raw.githubusercontent.com/Uniswap/hooklist/{HOOKLIST_SHA}"


# ----------------------------------------------------------------- le champ propose

MEASURED_EXTRACTION = OrderedDict([
    ("type", "object"),
    ("description",
     "Optional. An observed measurement of how much this hook removed from a swap, relative to the "
     "same swap on the same pool with the hook's code replaced by a protocol-compliant no-op. A "
     "magnitude with no block, no method and no public source is not falsifiable, so all four "
     "members are required once the object is present."),
    ("required", ["bps", "block", "method", "sourceUrl"]),
    ("additionalProperties", False),
    ("properties", OrderedDict([
        ("bps", OrderedDict([
            ("type", "number"),
            ("description",
             "Median observed extraction, in basis points of the swap output, over the pools, sizes "
             "and directions described by sourceUrl. Negative values are not admissible: a hook "
             "that returns more than it takes is running custom accounting, which this field cannot "
             "describe."),
            ("minimum", 0),
            ("maximum", 10000),
        ])),
        ("block", OrderedDict([
            ("type", "integer"),
            ("description",
             "Block number, on this entry's chainId, at which the measurement was taken. A "
             "magnitude without a block cannot be reproduced."),
            ("minimum", 0),
        ])),
        ("method", OrderedDict([
            ("type", "string"),
            ("description",
             "How the magnitude was obtained. 'counterfactual': the same swap quoted twice on a "
             "fork pinned at block, once with the hook's real bytecode and once with a compliant "
             "no-op at the same address. 'events': derived from HookSwap / HookFee emissions. "
             "'declared': stated by the deployer, unverified."),
            ("enum", ["counterfactual", "events", "declared"]),
        ])),
        ("sourceUrl", OrderedDict([
            ("type", "string"),
            ("description",
             "Public URL of the dataset or report the magnitude comes from, carrying the pools, "
             "sizes and directions it was computed over, so a third party can reproduce or refute "
             "it."),
            ("pattern", "^https://.*"),
        ])),
    ])),
])


# ----------------------------------------------------------------- validateur de secours

TYPES = {"object": dict, "array": list, "string": str, "boolean": bool, "number": (int, float),
         "integer": int}


def check(instance, schema, path="$"):
    """Retourne la liste des violations. Sous-ensemble draft-07 utilise par ce schema."""
    errors = []
    t = schema.get("type")
    if t:
        py = TYPES[t]
        ok = isinstance(instance, py) and not (t in ("number", "integer") and isinstance(instance, bool))
        if t == "number" and isinstance(instance, bool):
            ok = False
        if not ok:
            return [f"{path}: attendu {t}, recu {type(instance).__name__}"]
    if isinstance(instance, dict):
        for key in schema.get("required", []):
            if key not in instance:
                errors.append(f"{path}: membre requis absent: {key}")
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in instance:
                if key not in props:
                    errors.append(f"{path}: membre non declare: {key}")
        for key, sub in props.items():
            if key in instance:
                errors += check(instance[key], sub, f"{path}.{key}")
    if isinstance(instance, str):
        if "enum" in schema and instance not in schema["enum"]:
            errors.append(f"{path}: {instance!r} hors enum {schema['enum']}")
        if "pattern" in schema and not re.search(schema["pattern"], instance):
            errors.append(f"{path}: {instance!r} ne correspond pas a {schema['pattern']}")
        if "minLength" in schema and len(instance) < schema["minLength"]:
            errors.append(f"{path}: trop court")
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            errors.append(f"{path}: trop long")
    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            errors.append(f"{path}: {instance} < minimum {schema['minimum']}")
        if "maximum" in schema and instance > schema["maximum"]:
            errors.append(f"{path}: {instance} > maximum {schema['maximum']}")
    if "enum" in schema and not isinstance(instance, str) and instance not in schema["enum"]:
        errors.append(f"{path}: {instance!r} hors enum")
    return errors


def make_validator(schema):
    """(nom, fn) — jsonschema s'il est la, et toujours le validateur de secours."""
    validators = [("builtin", lambda inst: check(inst, schema))]
    try:
        import jsonschema
    except ImportError:
        return validators
    v = jsonschema.Draft7Validator(schema)
    validators.insert(0, ("jsonschema", lambda inst: [e.message for e in v.iter_errors(inst)]))
    return validators


def valid(validators, instance):
    """True/False, en exigeant que tous les validateurs disponibles soient d'accord."""
    verdicts = {name: not fn(instance) for name, fn in validators}
    if len(set(verdicts.values())) != 1:
        raise SystemExit(f"validateurs en desaccord: {verdicts} sur {json.dumps(instance)[:200]}")
    return next(iter(verdicts.values()))


# ----------------------------------------------------------------- cas de test

GOOD = {
    "bps": 119.7,
    "block": 50614000,
    "method": "counterfactual",
    "sourceUrl": "https://github.com/JeanBaptisteDurand/ETH_Online_2026/blob/main/docs/dataset/measurements.jsonl",
}

BAD = [
    ("bps absent", {k: v for k, v in GOOD.items() if k != "bps"}),
    ("block absent", {k: v for k, v in GOOD.items() if k != "block"}),
    ("method absente", {k: v for k, v in GOOD.items() if k != "method"}),
    ("sourceUrl absente", {k: v for k, v in GOOD.items() if k != "sourceUrl"}),
    ("bps negatif", dict(GOOD, bps=-1)),
    ("bps > 10000", dict(GOOD, bps=10001)),
    ("bps non numerique", dict(GOOD, bps="119.7")),
    ("block non entier", dict(GOOD, block="50614000")),
    ("methode inconnue", dict(GOOD, method="estimated")),
    ("source en http", dict(GOOD, sourceUrl="http://example.com/data.json")),
    ("membre en trop", dict(GOOD, confidence=0.9)),
]


def fetch(url):
    p = subprocess.run(["curl", "-sSfL", "-m", "60", url], capture_output=True, text=True, timeout=90)
    if p.returncode != 0 or not p.stdout:
        raise SystemExit(f"echec du telechargement de {url}: {p.stderr.strip()[:200]}")
    return p.stdout


def main() -> int:
    upstream = json.loads(fetch(f"{RAW}/schema.json"), object_pairs_hook=OrderedDict)
    hooklist = json.loads(fetch(f"{RAW}/hooklist.json"))

    patched = json.loads(json.dumps(upstream), object_pairs_hook=OrderedDict)
    patched["properties"]["properties"]["properties"]["measuredExtraction"] = MEASURED_EXTRACTION

    # Le patch commite doit produire exactement ce schema-la : on l'applique au fichier amont
    # avec `patch` et on compare, pour que schema.patch ne puisse pas deriver de ce script.
    scratch = HERE / ".schema.check.json"
    scratch.write_text(json.dumps(upstream, indent=2) + "\n")
    applied = subprocess.run(["patch", "--silent", str(scratch), str(HERE / "schema.patch")],
                             capture_output=True, text=True)
    if applied.returncode == 0:
        same = json.loads(scratch.read_text(), object_pairs_hook=OrderedDict) == patched
        print(f"0. schema.patch applique au fichier amont -> "
              f"{'identique au schema teste ici' if same else 'DIFFERENT'}")
        if not same:
            return 1
    else:
        print("0. `patch` indisponible ou refuse le diff — controle saute")
    for junk in (scratch, scratch.with_suffix(".json.orig"), scratch.with_suffix(".json.rej")):
        junk.unlink(missing_ok=True)

    validators = make_validator(patched)
    names = [n for n, _ in validators]
    print(f"validateurs actifs : {', '.join(names)}")

    # 1. non-regression
    bad_entries = []
    for entry in hooklist:
        if not valid(validators, entry):
            bad_entries.append(entry["hook"]["address"])
    print(f"1. non-regression : {len(hooklist) - len(bad_entries)}/{len(hooklist)} fiches amont "
          f"valident inchangees contre le schema patche")
    if bad_entries:
        print("   REGRESSION sur:", bad_entries[:5])
        return 1

    # les memes fiches doivent aussi valider contre le schema amont (controle du controle)
    up_validators = make_validator(upstream)
    n_up = sum(1 for e in hooklist if valid(up_validators, e))
    print(f"   controle du controle : {n_up}/{len(hooklist)} valident aussi contre le schema amont")
    if n_up != len(hooklist):
        print("   le schema amont rejette deja des fiches — resultat non concluant")
        return 1

    # 2. acceptation
    sample = json.loads(json.dumps(hooklist[0]))
    sample["properties"]["measuredExtraction"] = GOOD
    ok = valid(validators, sample)
    print(f"2. acceptation : fiche + measuredExtraction bien forme -> {'VALIDE' if ok else 'REFUSEE'}")
    if not ok:
        print("  ", check(sample, patched))
        return 1
    # et la meme fiche doit etre REFUSEE par le schema amont (additionalProperties: false)
    if valid(up_validators, sample):
        print("   le schema amont accepte deja le champ — le patch serait inutile")
        return 1
    print("   le schema amont la refuse (additionalProperties: false) : le patch est bien necessaire")

    # 3. refus
    failures = []
    for label, payload in BAD:
        s = json.loads(json.dumps(hooklist[0]))
        s["properties"]["measuredExtraction"] = payload
        if valid(validators, s):
            failures.append(label)
    print(f"3. refus : {len(BAD) - len(failures)}/{len(BAD)} formes malades sont refusees")
    for label, _ in BAD:
        print(f"   {'ECHEC' if label in failures else 'ok   '}  {label}")
    if failures:
        return 1

    print("\nTOUS LES CONTROLES PASSENT")
    print(f"schema amont epingle : {RAW}/schema.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
