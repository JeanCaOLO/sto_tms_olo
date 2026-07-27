#!/usr/bin/env python3
"""Context extraction: given free-text requirement description, find which existing
files/modules/communities of the graphify graph it would likely touch.

This only finds EXISTING code that overlaps by vocabulary with the requirement text.
It cannot invent nodes for functionality that doesn't exist yet (e.g. a brand new
Shopify integration) - for that, it falls back to a plain-text grep of the repo so
at least string-literal hits (env var names, existing partial integrations) surface.

Usage:
  context_map.py --graph-root PATH --text "Sincronizar stock con Shopify" [--synonyms path.json] [--top 15]
    -> {"nodes": [...ranked...], "communities": [...ranked...], "grep_hits": [...]}
"""
import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

STOPWORDS = set("""
a al algo algunas algunos ante antes como con contra cual cuando de del desde donde
durante e el ella ellas ellos en entre era erais eramos eran eres es esa esas ese
esos esta estas este estos ha han hasta la las lo los mas mientras mi mis mucho
muchos muy nada ni no nos nosotros nuestra nuestras nuestro nuestros o os otra
otras otro otros para pero poco por porque que quien quienes se sin sobre su sus
te tu tus un una uno unos y ya yo
the a an of to in for on with and or is are was were be been being this that these
those it its as by at from into
""".split())

DEFAULT_SYNONYMS = {
    "stock": ["inventario", "inventory", "existencias"],
    "inventario": ["stock", "inventory"],
    "sincronizar": ["sync", "sincronizacion", "sincronización"],
    "sync": ["sincronizar", "sincronizacion"],
    "pago": ["payment", "pagos", "pasarela", "checkout"],
    "pasarela": ["gateway", "payment", "pago"],
    "orden": ["order", "pedido", "pedidos"],
    "pedido": ["orden", "order"],
    "envio": ["shipping", "envío", "guia", "guía"],
    "guia": ["envio", "shipping", "dispatch"],
    "conductor": ["driver", "transportista"],
    "vehiculo": ["vehicle", "vehículo"],
    "cliente": ["customer"],
    "usuario": ["user"],
    "ruta": ["route"],
    "devolucion": ["return", "devolución"],
    "liquidacion": ["settlement", "liquidación"],
    "contrato": ["contract"],
    "auth": ["autenticacion", "autenticación", "login", "sesion", "sesión"],
}


def _fail(msg):
    print(json.dumps({"error": msg}))
    sys.exit(1)


def tokenize(text):
    words = re.findall(r"[a-záéíóúñü]+", text.lower())
    return [w for w in words if w not in STOPWORDS and len(w) > 2]


def expand(tokens, synonyms):
    expanded = set(tokens)
    for t in tokens:
        for syn in synonyms.get(t, []):
            expanded.add(syn.lower())
    return expanded


def score_text(haystack, tokens):
    haystack = haystack.lower()
    return sum(1 for t in tokens if t in haystack)


def cmd_run(a):
    graph_path = Path(a.graph_root) / "graphify-out" / "graph.json"
    labels_path = Path(a.graph_root) / "graphify-out" / ".graphify_labels.json"
    if not graph_path.exists():
        _fail(f"No graphify-out/graph.json under {a.graph_root}. Run /graphify on this repo first.")

    graph = json.loads(graph_path.read_text(encoding="utf-8"))
    labels = {}
    if labels_path.exists():
        labels = json.loads(labels_path.read_text(encoding="utf-8"))

    synonyms = dict(DEFAULT_SYNONYMS)
    if a.synonyms:
        synonyms.update(json.loads(Path(a.synonyms).read_text(encoding="utf-8")))

    tokens = expand(tokenize(a.text), synonyms)
    if not tokens:
        _fail("No usable keywords extracted from --text.")

    node_scores = []
    community_hits = defaultdict(int)
    for n in graph.get("nodes", []):
        haystack = " ".join(str(n.get(k, "")) for k in ("label", "norm_label", "source_file"))
        s = score_text(haystack, tokens)
        if s > 0:
            node_scores.append({
                "id": n.get("id"),
                "label": n.get("label"),
                "source_file": n.get("source_file"),
                "source_location": n.get("source_location"),
                "community": n.get("community"),
                "community_label": labels.get(str(n.get("community")), None),
                "score": s,
            })
            if n.get("community") is not None:
                community_hits[n.get("community")] += s

    node_scores.sort(key=lambda x: -x["score"])

    communities_ranked = sorted(
        ({"community": c, "label": labels.get(str(c), f"Community {c}"), "score": s}
         for c, s in community_hits.items()),
        key=lambda x: -x["score"],
    )

    grep_hits = []
    if a.grep_root:
        pattern = "|".join(re.escape(t) for t in tokens if len(t) > 3)
        if pattern:
            try:
                out = subprocess.run(
                    ["git", "-C", a.grep_root, "grep", "-liE", pattern, "--", "src", "*.md"],
                    capture_output=True, text=True, timeout=15,
                )
                if out.returncode == 0:
                    grep_hits = [line for line in out.stdout.splitlines() if line.strip()]
            except (FileNotFoundError, subprocess.TimeoutExpired):
                pass

    result = {
        "tokens_used": sorted(tokens),
        "nodes": node_scores[: a.top],
        "communities": communities_ranked[: a.top],
        "grep_hits": grep_hits[:30],
    }
    print(json.dumps(result, ensure_ascii=False))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--graph-root", required=True)
    p.add_argument("--text", required=True)
    p.add_argument("--synonyms", help="path to a JSON file of extra word -> [synonyms]")
    p.add_argument("--top", type=int, default=15)
    p.add_argument("--grep-root", help="if set, also git-grep this root for token hits (fallback for new features)")
    p.set_defaults(fn=cmd_run)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
