#!/usr/bin/env python3
"""
domain-audit.py — ingest a folder of CSVs, normalize domains, and report
per-file counts/dupes plus a pairwise overlap matrix.

Zero dependencies (stdlib csv only). Handles quoted commas/newlines correctly.

Usage:
    python3 scripts/domain-audit.py [DIR_OR_CSVS ...]

If no args, defaults to ~/Downloads. Any column named "domain" is used; if a
file has no "domain" column, the domain is extracted from an "email" column.
"""

from __future__ import annotations

import csv
import glob
import os
import sys
from collections import Counter

# csv fields can be huge (e.g. semicolon-joined company lists)
csv.field_size_limit(10_000_000)


def normalize_domain(raw: str) -> str | None:
    """Canonicalize a domain for comparison: lowercase, strip scheme, www.,
    path, port, query, and trailing dots. Returns None if nothing usable."""
    if not raw:
        return None
    d = raw.strip().lower()
    if not d:
        return None
    # strip scheme
    if "://" in d:
        d = d.split("://", 1)[1]
    # strip userinfo
    if "@" in d and "." in d.split("@", 1)[1]:
        d = d.split("@", 1)[1]
    # strip path / query / fragment
    for sep in ("/", "?", "#"):
        if sep in d:
            d = d.split(sep, 1)[0]
    # strip port
    if ":" in d:
        d = d.split(":", 1)[0]
    # strip leading www.
    while d.startswith("www."):
        d = d[4:]
    d = d.strip(".").strip()
    return d or None


def domain_from_email(email: str) -> str | None:
    if not email or "@" not in email:
        return None
    return normalize_domain(email.split("@", 1)[1])


def load_domains(path: str) -> tuple[list[str], dict]:
    """Return (normalized_domains_list, stats) for one CSV."""
    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        reader = csv.reader(fh)
        rows = list(reader)
    if not rows:
        return [], {"rows": 0, "source": "empty"}

    header = [h.strip().lower() for h in rows[0]]
    data = rows[1:]
    idx = {h: i for i, h in enumerate(header)}

    # accept common domain-column header variants (incl. HubSpot's export header)
    DOMAIN_HEADERS = ("domain", "company domain name", "company domain", "website", "website url")
    domain_header = next((h for h in DOMAIN_HEADERS if h in idx), None)

    if domain_header:
        col = idx[domain_header]
        source = domain_header
        raw = [r[col] if col < len(r) else "" for r in data]
        domains = [normalize_domain(x) for x in raw]
    elif "email" in idx:
        col = idx["email"]
        source = "email→domain"
        raw = [r[col] if col < len(r) else "" for r in data]
        domains = [domain_from_email(x) for x in raw]
    else:
        return [], {"rows": len(data), "source": "no domain/email column"}

    domains = [d for d in domains if d]
    return domains, {"rows": len(data), "source": source}


def fmt(n: int) -> str:
    return f"{n:,}"


def main(argv: list[str]) -> int:
    args = argv[1:] or [os.path.expanduser("~/Downloads")]

    # expand dirs → *.csv, keep explicit files
    paths: list[str] = []
    for a in args:
        if os.path.isdir(a):
            paths.extend(sorted(glob.glob(os.path.join(a, "*.csv"))))
        else:
            paths.append(a)
    # only files that actually carry domains
    files: dict[str, list[str]] = {}
    meta: dict[str, dict] = {}
    for p in paths:
        if not os.path.exists(p):
            print(f"  ! missing: {p}", file=sys.stderr)
            continue
        domains, stats = load_domains(p)
        if stats["source"] in ("no domain/email column", "empty"):
            continue
        name = os.path.basename(p)
        files[name] = domains
        meta[name] = stats

    if not files:
        print("No CSVs with a domain/email column found.")
        return 1

    # ---- per-file report ----
    print("=" * 78)
    print("PER-FILE  (domain column normalized: lowercase, no scheme/www/path)")
    print("=" * 78)
    print(f"{'file':<40}{'rows':>9}{'domains':>9}{'unique':>9}{'dupes':>8}")
    print("-" * 78)
    sets: dict[str, set] = {}
    for name, domains in files.items():
        c = Counter(domains)
        unique = len(c)
        dupes = sum(v - 1 for v in c.values() if v > 1)
        sets[name] = set(c)
        print(
            f"{name:<40}{fmt(meta[name]['rows']):>9}{fmt(len(domains)):>9}"
            f"{fmt(unique):>9}{fmt(dupes):>8}"
        )
        # show the worst repeat offenders if any
        worst = [(d, n) for d, n in c.most_common(3) if n > 1]
        if worst:
            tops = ", ".join(f"{d}×{n}" for d, n in worst)
            print(f"{'  ↳ top duplicate domains:':<40}{tops}")

    # ---- pairwise overlap matrix ----
    names = list(sets.keys())
    print()
    print("=" * 78)
    print("PAIRWISE OVERLAP  (count of shared unique domains)")
    print("=" * 78)
    # short labels to keep the grid readable
    labels = {n: f"[{i}]" for i, n in enumerate(names)}
    for i, n in enumerate(names):
        print(f"  [{i}] {n}  (unique={fmt(len(sets[n]))})")
    print()
    header_row = " " * 8 + "".join(f"{labels[n]:>10}" for n in names)
    print(header_row)
    for a in names:
        row = f"{labels[a]:<8}"
        for b in names:
            row += f"{fmt(len(sets[a] & sets[b])):>10}"
        print(row)

    # ---- net-new analysis (largest set = universe) ----
    universe = max(names, key=lambda n: len(sets[n]))
    print()
    print("=" * 78)
    print(f"NET-NEW vs largest set: {universe} ({fmt(len(sets[universe]))} domains)")
    print("=" * 78)
    for n in names:
        if n == universe:
            continue
        shared = sets[n] & sets[universe]
        only = sets[n] - sets[universe]
        print(
            f"  {n:<42} shared={fmt(len(shared)):>8}   "
            f"not-in-{labels[universe]}={fmt(len(only)):>6}"
        )
    # what's in the universe but in none of the others
    others = set().union(*(sets[n] for n in names if n != universe)) if len(names) > 1 else set()
    fresh = sets[universe] - others
    print(
        f"\n  In {universe} but in NO other file: {fmt(len(fresh))} "
        f"({len(fresh) * 100 // max(1, len(sets[universe]))}% of it)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
