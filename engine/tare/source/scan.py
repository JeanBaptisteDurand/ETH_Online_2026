"""A textual pass over fetched Solidity. Every finding carries a file and a line number.

This is deliberately *not* a Solidity parser. It is a grep with a schema, and its output is
evidence to be checked, not a verdict: `sed -n '325p' docs/hooks-source/<addr>/sources/<file>`
must show the line the report quotes. The classification in classify.py is built on top of these
findings plus an on-chain read; nothing here decides anything on its own.

Four questions, four scanners:
  take sites    where in the swap path value can leave the swapper (LOT P: "ou est-il pris ?")
  announcement  named constants, public getters, events                ("est-il annonce ?")
  authority     who can change what, and through what gate             ("est-il modifiable ?")
  permissions   the getHookPermissions() block, which the address encodes anyway
"""
import os
import re

from .fetch import is_vendor

SOL_EXT = ".sol"

# ---- take sites -------------------------------------------------------------------------------
# Each pattern is (kind, regex, what it means in one line).
TAKE_PATTERNS = [
    ("beforeSwap_delta", re.compile(r"\btoBeforeSwapDelta\s*\("),
     "beforeSwap returns a BeforeSwapDelta: value is moved before the pool's own swap math runs"),
    ("afterSwap_delta", re.compile(r"\breturn\s*\(\s*(?:BaseHook|IHooks)\.afterSwap\.selector\s*,\s*(?!(?:int128\()?0\s*\))"),
     "afterSwap returns a non-zero unspecified delta: value is taken out of the swap's output"),
    ("dynamic_lp_fee", re.compile(r"\bupdateDynamicLPFee\s*\("),
     "the hook sets the pool's LP fee for this swap (dynamic fee)"),
    ("override_fee_flag", re.compile(r"OVERRIDE_FEE_FLAG"),
     "beforeSwap returns a fee with the override flag: the pool charges the hook's number"),
    ("pm_take", re.compile(r"poolManager\s*\.\s*take\s*\("),
     "poolManager.take(): the hook pulls tokens out of the PoolManager"),
    ("pm_mint", re.compile(r"poolManager\s*\.\s*mint\s*\("),
     "poolManager.mint(): the hook credits itself an ERC-6909 claim"),
    ("pm_donate", re.compile(r"poolManager\s*\.\s*donate\s*\("),
     "poolManager.donate()"),
]

# ---- announcement -----------------------------------------------------------------------------
FEE_WORD = re.compile(r"fee|bps|pct|percent|rate|numerator|denominator", re.IGNORECASE)
CONST_DECL = re.compile(
    r"^\s*(?:uint\d*|int\d*)\s+(?:public\s+|internal\s+|private\s+)?constant\s+"
    r"(?P<name>\w+)\s*=\s*(?P<value>[^;]+);")
FILE_CONST_DECL = re.compile(
    r"^\s*(?:uint\d*|int\d*)\s+constant\s+(?P<name>\w+)\s*=\s*(?P<value>[^;]+);")
PUBLIC_MAPPING = re.compile(r"^\s*mapping\s*\(.*\)\s+public\s+(?P<name>\w+)\s*;")
PUBLIC_VAR = re.compile(r"^\s*(?:uint\d*|int\d*|address|bool)\s+public\s+(?:immutable\s+)?(?P<name>\w+)\s*[;=]")
VIEW_FN = re.compile(r"^\s*function\s+(?P<name>\w+)\s*\([^)]*\)\s*(?:external|public)[^{;]*\bview\b")
EVENT_DECL = re.compile(r"^\s*event\s+(?P<name>\w+)\s*\(")

# ---- authority --------------------------------------------------------------------------------
AUTHORITY_PATTERNS = [
    ("modifier_onlyOwner", re.compile(r"\bonlyOwner\b")),
    ("modifier_onlyAdmin", re.compile(r"\bonly(?:Owner)?Admin\w*\b")),
    ("modifier_onlyInitializer", re.compile(r"\bonlyInitializer\b")),
    ("modifier_onlyFactory", re.compile(r"\bonlyFactory\b")),
    ("modifier_onlyGovernance", re.compile(r"\bonly(?:Governance|Gov|Timelock|DAO)\w*\b")),
    ("inherits_ownable", re.compile(r"\bis\b[^{]*\bOwnable\w*")),
    ("inherits_accesscontrol", re.compile(r"\bis\b[^{]*\bAccessControl\w*")),
    ("sender_check", re.compile(r"(?:require|if)\s*\(\s*(?:!\s*\()?\s*msg\.sender\s*[!=]=")),
    ("timelock", re.compile(r"\btimelock\b", re.IGNORECASE)),
    ("upgrade", re.compile(r"\b(?:_authorizeUpgrade|upgradeTo|UUPSUpgradeable|setImplementation)\b")),
]

CALLBACK_DECL = re.compile(
    r"^\s*function\s+(?P<name>_?(?:before|after)(?:Swap|Initialize|AddLiquidity|RemoveLiquidity|Donate))\s*\(")


def own_source_files(hook_dir: str):
    """Yield (relpath, absolute path) for the hook's own .sol files, dependencies excluded."""
    src_root = os.path.join(hook_dir, "sources")
    if not os.path.isdir(src_root):
        return
    for dirpath, _dirnames, filenames in os.walk(src_root):
        for name in sorted(filenames):
            if not name.endswith(SOL_EXT):
                continue
            abs_path = os.path.join(dirpath, name)
            rel = os.path.relpath(abs_path, src_root).replace(os.sep, "/")
            if is_vendor(rel):
                continue
            yield rel, abs_path


def _read_lines(path: str):
    with open(path, "r", errors="replace") as fh:
        return fh.read().splitlines()


def _ev(rel, idx, line, **extra):
    ev = {"file": rel, "line": idx + 1, "text": line.strip()[:220]}
    ev.update(extra)
    return ev


def scan_file(rel: str, lines: list) -> dict:
    """All four scans over one file's lines."""
    takes, announced, authority, callbacks, permissions = [], [], [], [], []
    in_permissions = False
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("/*"):
            comment_only = True
        else:
            comment_only = False

        if not comment_only:
            for kind, pattern, meaning in TAKE_PATTERNS:
                if pattern.search(line):
                    takes.append(_ev(rel, i, line, kind=kind, meaning=meaning))

            m = CONST_DECL.match(line) or FILE_CONST_DECL.match(line)
            if m and FEE_WORD.search(m.group("name")):
                announced.append(_ev(rel, i, line, kind="constant",
                                     name=m.group("name"), value=m.group("value").strip()))
            m = PUBLIC_MAPPING.match(line)
            if m and FEE_WORD.search(m.group("name") + line):
                announced.append(_ev(rel, i, line, kind="public_mapping", name=m.group("name")))
            m = PUBLIC_VAR.match(line)
            if m and FEE_WORD.search(m.group("name")):
                announced.append(_ev(rel, i, line, kind="public_var", name=m.group("name")))
            m = VIEW_FN.match(line)
            if m and FEE_WORD.search(m.group("name")):
                announced.append(_ev(rel, i, line, kind="view_function", name=m.group("name")))
            m = EVENT_DECL.match(line)
            if m and FEE_WORD.search(m.group("name") + line):
                announced.append(_ev(rel, i, line, kind="event", name=m.group("name")))

            for kind, pattern in AUTHORITY_PATTERNS:
                if pattern.search(line):
                    authority.append(_ev(rel, i, line, kind=kind))

            m = CALLBACK_DECL.match(line)
            if m:
                callbacks.append(_ev(rel, i, line, name=m.group("name")))

        if "getHookPermissions" in line:
            in_permissions = True
        if in_permissions:
            m = re.match(r"^\s*(?P<flag>\w+)\s*:\s*(?P<val>true|false)\s*,?\s*$", line)
            if m:
                permissions.append({"file": rel, "line": i + 1,
                                    "flag": m.group("flag"), "value": m.group("val") == "true"})
            if "});" in line:
                in_permissions = False
    return {"takes": takes, "announced": announced, "authority": authority,
            "callbacks": callbacks, "permissions": permissions}


def scan_hook(hook_dir: str) -> dict:
    """Scan every own-source file of one fetched hook. Returns merged findings + a file inventory."""
    merged = {"takes": [], "announced": [], "authority": [], "callbacks": [], "permissions": [],
              "files": []}
    for rel, abs_path in own_source_files(hook_dir):
        lines = _read_lines(abs_path)
        merged["files"].append({"file": rel, "lines": len(lines)})
        found = scan_file(rel, lines)
        for key in ("takes", "announced", "authority", "callbacks", "permissions"):
            merged[key].extend(found[key])
    merged["take_kinds"] = sorted({t["kind"] for t in merged["takes"]})
    merged["authority_kinds"] = sorted({a["kind"] for a in merged["authority"]})
    return merged


def swap_path_takes(findings: dict) -> list:
    """Take sites that can run during a swap (excludes donate-only and liquidity-only paths)."""
    swap_kinds = {"beforeSwap_delta", "afterSwap_delta", "dynamic_lp_fee",
                  "override_fee_flag", "pm_take", "pm_mint"}
    return [t for t in findings["takes"] if t["kind"] in swap_kinds]
