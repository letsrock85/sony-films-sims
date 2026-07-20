"""Merge all data sources into app/data.json.

Sources (all optional except recipes_pdf.json):
  data/recipes_pdf.json   - Picture Profile recipes parsed from the PDF
  data/chart.json         - Saturation/Tonality chart coordinates
  data/blog_notes_a.json  - editorial context from the author's blog (part A)
  data/blog_notes_b.json  - editorial context (part B)
  data/curation.json      - hand-curated film lines / tags (fills gaps, wins over blog)
  data/creative_looks.json- Creative Look recipes + install steps
  data/guides.json        - field guides
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "app" / "data.json"

# Maps normalized alternate names -> normalized PDF recipe names
ALIASES = {
    "kodakgold200": "kodakgold",
    "kodakgoldv1": "kodakgold",
    "fujifortia50": "fortia50",
    "phoenixharman": "phenixharman",
    "magicspice": "magicspice",
    "acrosxye": "acrosxy",
    "acrosxg": "acrosxg",
    "acrosxr": "acrosxr",
    "ektachrome": "ektachrome",
    "cinestill800": "cinestill800tnightimerecipe",
    "cinestill800t": "cinestill800tnightimerecipe",
    "cinestill50d": "bluevelvetcinestill50d",
    "bluevelvet": "bluevelvetcinestill50d",
    "sonyclassicnegative": "sonyclassicnegative",
    "classicnegative": "sonyclassicnegative",
    "asteroidcity": "asteroidcitykodakvisiont200",
    "asteroidcitykodakvision200t": "asteroidcitykodakvisiont200",
    "kodakvision200t": "asteroidcitykodakvisiont200",
    "kodaktrix1600": "kodaktrix1600pushed",
    "kodaktrix1600pushed": "kodaktrix1600pushed",
    "trix1600": "kodaktrix1600pushed",
    "kodaktrix400": "kodaktrix400",
    "trix400": "kodaktrix400",
    "neomax": "neomax",
    "vespera": "vesperanightime",
    "vesperanighttime": "vesperanightime",
    "veniliqum": "veniliqumnight",
    "veniliqumnighttime": "veniliqumnight",
    "goldluxe": "goldluxenighttime",
    "kodakportra800": "portra800",
    "tmax100": "tmax100",
    "kodaktmax100": "tmax100",
    "fuji400h": "fuji400h",
    "fujipro400h": "fuji400h",
    "sonyproviarx": "proviarx",
    "fujiproviarx": "proviarx",
    "cinestillx": "cinestillx",
    "cinestillxbwxx": "cinestillx",
    "cinestillbwxx": "cinestillx",
    "kodakektar100": "ektar100",
    "kodakektachrome": "ektachrome",
    "kodachrome64": "kodachrome64v1",
    "kodachromev1": "kodachrome64v1",
    "kodachromev2": "kodachrome64v2",
    "50skodachrome": "kodachrome64v2",
    "kodakultramax400": "kodakultramax400",
    "ultramax400": "kodakultramax400",
    "fujinostalgicneg": "nostalgicneg",
    "sonynostalgicneg": "nostalgicneg",
    "kodakcolorplus": "kodakcolorplus200",
    "ilfordhp5plus": "ilfordhp5",
    "provia": "fujiprovia",
    "velvia": "velviapro",
    "phoenixharman200": "phenixharman",
    "ilforddelta3200": "delta3200",
    "agfactprecisa100": "agfaprecisa",
    "agfaprecisa100": "agfaprecisa",
    "kodachromev2gold": "kodachrome64v2",
    "cinestillbwxxcinestillx": "cinestillx",
    "nostalgicnegsony": "nostalgicneg",
    "sonynostalgicnegative": "nostalgicneg",
}


# Creative Look recipes emulate the same films as these PP recipes,
# so their sample photos are honest visual references.
CL_IMAGE = {
    "cl-kodak-gold": "kodak-gold",
    "cl-kodachrome-50s": "kodachrome-64-v2",
    "cl-fujifilm-fortia-50": "fortia-50",
    "cl-kodak-vision3-200t": "asteroid-city-kodak-vision-t200",
    "cl-phoenix-harman": "phenix-harman",
    "cl-kodak-portra-400": "kodak-portra-400",
    "cl-cinestill-800t": "cinestill-800t-nightime-recipe",
    "cl-provia": "fuji-provia",
    "cl-velvia": "velvia-pro",
    "cl-astia": "astia",
    "cl-classic-chrome": "classic-chrome",
    "cl-classic-negative": "sony-classic-negative",
    "cl-nostalgic-neg": "nostalgic-neg",
    "cl-eterna": "fuji-eterna",
}


def clean_text(value):
    """Typography pass: no em/en dashes in visible copy."""
    if isinstance(value, str):
        return value.replace(" \u2014 ", " - ").replace("\u2014", "-").replace("\u2013", "-")
    if isinstance(value, list):
        return [clean_text(v) for v in value]
    if isinstance(value, dict):
        return {k: clean_text(v) for k, v in value.items()}
    return value


def norm(name: str) -> str:
    n = re.sub(r"[^a-z0-9]+", "", name.lower())
    return ALIASES.get(n, n)


def load(name):
    p = DATA / name
    if not p.exists():
        print(f"  (skip {name}: not found)")
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def main():
    pdf = load("recipes_pdf.json")
    chart = load("chart.json") or {"color": [], "bw": []}
    notes = {}
    for src in ("blog_notes_a.json", "blog_notes_b.json", "curation.json"):
        d = load(src)
        if not d:
            continue
        for entry in d.get("recipes", []):
            key = norm(entry["name"])
            base = notes.setdefault(key, {})
            for field in ("film", "tip", "sourceUrl"):
                if entry.get(field) and (src == "curation.json" or not base.get(field)):
                    base[field] = entry[field]
            for field in ("bestFor", "light", "mood"):
                vals = entry.get(field) or []
                merged = list(dict.fromkeys((base.get(field) or []) + vals))
                base[field] = merged
    cl = load("creative_looks.json") or {"recipes": [], "howToInstall": []}
    guides = load("guides.json") or {"guides": []}

    chart_index = {}
    for kind in ("color", "bw"):
        for e in chart[kind]:
            chart_index[norm(e["name"])] = {"x": e["x"], "y": e["y"], "chart": kind}

    def derived_tags(rec, meta, chart_pos):
        """Baseline tags from chart position, name and colour mode; blog tags win."""
        mood = list(meta.get("mood", []))
        light = list(meta.get("light", []))
        best = list(meta.get("bestFor", []))
        low = rec["name"].lower()
        if chart_pos:
            if chart_pos["x"] >= 0.72 and "vivid" not in mood:
                mood.append("vivid")
            if chart_pos["x"] <= 0.35 and "muted" not in mood:
                mood.append("muted")
            if chart_pos["y"] <= 0.25 and "punchy" not in mood:
                mood.append("punchy")
            if chart_pos["y"] >= 0.65 and "soft" not in mood:
                mood.append("soft")
        if ("night" in low or "vespera" in low) and "night" not in light:
            light.append("night")
        return {"bestFor": best, "light": light, "mood": mood}

    recipes = []
    unmatched_notes = set(notes)
    for rec in pdf["recipes"]:
        key = norm(rec["name"])
        meta = notes.get(key, {})
        unmatched_notes.discard(key)
        recipes.append({
            "id": rec["id"],
            "name": rec["name"].replace("Tri -X", "Tri-X"),
            "kind": "pp",
            "bw": rec["bw"],
            "film": meta.get("film"),
            "image": rec["image"],
            "wb": rec["wbSummary"],
            "wbBlock": rec["whiteBalanceBlock"],
            "settings": rec["settings"],
            "notes": rec["notes"],
            "tags": derived_tags(rec, meta, chart_index.get(key)),
            "tip": meta.get("tip"),
            "chart": chart_index.get(key),
            "sourceUrl": meta.get("sourceUrl"),
            "page": rec["page"],
        })

    for c in cl.get("recipes", []):
        cname = re.sub(r"\s*\(creative look\)\s*", "", c["name"], flags=re.I)
        cid = "cl-" + re.sub(r"[^a-z0-9]+", "-", cname.lower()).strip("-")
        if (ROOT / "app" / "assets" / "recipes" / f"{cid}.jpg").exists():
            image = f"assets/recipes/{cid}.jpg"
        elif cid in CL_IMAGE:
            image = f"assets/recipes/{CL_IMAGE[cid]}.jpg"
        else:
            image = None
        recipes.append({
            "id": cid,
            "name": cname,
            "kind": "cl",
            "bw": False,
            "film": c.get("film"),
            "image": image,
            "wb": (c.get("settings") or {}).get("whiteBalance"),
            "settings": c.get("settings"),
            "notes": [],
            "tags": {
                "bestFor": c.get("bestFor", []),
                "light": c.get("light", []),
                "mood": c.get("mood", []),
            },
            "tip": c.get("tip"),
            "chart": None,
            "sourceUrl": c.get("sourceUrl"),
        })

    out = {
        "generated": True,
        "credit": {
            "author": "Veres Deni Alex",
            "site": "https://www.veresdenialex.com",
            "source": "Sony Film Simulation Recipes V.pdf + veresdenialex.com",
        },
        "recipes": recipes,
        "guides": guides.get("guides", []),
        "cheatsheet": guides.get("cheatsheet", []),
        "clInstall": cl.get("howToInstall", []),
    }
    out = clean_text(out)
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

    tagged = sum(1 for r in recipes if r["tags"]["bestFor"] or r["tags"]["light"])
    filmed = sum(1 for r in recipes if r["film"])
    charted = sum(1 for r in recipes if r["chart"])
    print(f"recipes: {len(recipes)} (pp {sum(1 for r in recipes if r['kind']=='pp')}, cl {sum(1 for r in recipes if r['kind']=='cl')})")
    print(f"with film line: {filmed}, with tags: {tagged}, with chart pos: {charted}")
    print(f"guides: {len(out['guides'])}")
    if unmatched_notes:
        print("UNMATCHED blog notes:", sorted(unmatched_notes))
    missing_chart = [r["name"] for r in recipes if r["kind"] == "pp" and not r["chart"]]
    if missing_chart:
        print("PP recipes without chart pos:", missing_chart)


if __name__ == "__main__":
    main()
