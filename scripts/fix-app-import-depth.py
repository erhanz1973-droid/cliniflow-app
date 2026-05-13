#!/usr/bin/env python3
"""Normalize relative imports after moving app/**/* → app/(app)/**/*."""

from pathlib import Path
import re
import sys

WORKSPACE = Path(__file__).resolve().parents[1]
APP_ZONE = WORKSPACE / "app" / "(app)"

_REST = (
    r"(?:"
    r"lib(?:/[^'\"]*)?"
    r"|components(?:/[^'\"]*)?"
    r"|\(auth\)(?:/[^'\"]*)?"
    r")"
)

IMPORT_FROM = re.compile(rf"from\s+(['\"])(?:\.\./)+({_REST})\1")
IMPORT_PAREN = re.compile(rf"import\s*\(\s*(['\"])(?:\.\./)+({_REST})\1")


def rewrite(text: str, depth: int) -> str:
    pref = "../" * depth

    def repl_from(m: re.Match) -> str:
        q, body = m.group(1), m.group(2)
        return f"from {q}{pref}{body}{q}"

    text = IMPORT_FROM.sub(repl_from, text)

    def repl_par(m: re.Match) -> str:
        q, body = m.group(1), m.group(2)
        return f"import({q}{pref}{body}{q}"

    text = IMPORT_PAREN.sub(repl_par, text)
    return text


def main() -> int:
    n = 0
    if not APP_ZONE.is_dir():
        print("missing", APP_ZONE, file=sys.stderr)
        return 1
    for path in APP_ZONE.rglob("*"):
        if path.suffix not in {".tsx", ".ts", ".jsx", ".js"}:
            continue
        depth = len(path.parent.relative_to(WORKSPACE).parts)
        old = path.read_text(encoding="utf-8")
        new = rewrite(old, depth)
        if old != new:
            path.write_text(new, encoding="utf-8")
            n += 1
    print(f"normalized imports in {n} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
