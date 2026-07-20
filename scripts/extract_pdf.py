"""Extract Sony film simulation recipes from the Veres Deni Alex PDF.

Each recipe page (3..67) has a fixed layout:
  - sample photo collage (embedded image, ~1100x618)
  - recipe name marked with black-triangle characters
  - settings panel: labels at x~188, values at x~370
  - color depth panel: R/G/B/C/M/Y letters at x~637, values at x~670
  - detail panel: labels at x~841, values at x~1023
  - white balance block near the bottom (Kelvin / Color Filter or AWB)

Outputs data/recipes_pdf.json and per-recipe images in app/assets/recipes/.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "docs" / "Sony Film Simulation Recipes V.pdf"
OUT_JSON = ROOT / "data" / "recipes_pdf.json"
IMG_DIR = ROOT / "app" / "assets" / "recipes"

RECIPE_PAGES = range(2, 68)  # 0-based indexes for pages 3..68 (page 68 holds Gold Luxe)

# The settings panels sit at a fixed absolute position on every page,
# regardless of where the recipe title is.
PANEL_Y = (1260, 1580)

PP_LABELS = [
    ("Black level", "blackLevel"),
    ("Gamma", "gamma"),
    ("Black Gamma", "blackGamma"),
    ("Knee", "knee"),
    ("Color Mode", "colorMode"),
    ("Saturation", "saturation"),
    ("Color Phase", "colorPhase"),
]

DETAIL_LABELS = [
    ("Detail", "level"),
    ("Mode", "mode"),
    ("V/H Balance", "vhBalance"),
    ("B/W Balance", "bwBalance"),
    ("Limit", "limit"),
    ("Crispening", "crispening"),
    ("Crispning", "crispening"),
    ("H-Light detail", "hiLightDetail"),
]

BOILERPLATE = {
    "Sony Film Simulations", "Compared", "©Veres Deni Alex",
    "Color Depth", "Kelvin", "Color Filter", "Temperature",
}


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s


def dedupe_words(words):
    """Drop exact duplicate text objects (some pages have doubled layers)."""
    seen = set()
    out = []
    for w in words:
        key = (round(w[0]), round(w[1]), w[4])
        if key in seen:
            continue
        seen.add(key)
        out.append(w)
    return out


def rows_from_words(words, tol=7.0):
    """Group words into visual rows by y-coordinate."""
    rows = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        x0, y0, x1, y1, text = w[0], w[1], w[2], w[3], w[4]
        for row in rows:
            if abs(row["y"] - y0) <= tol:
                row["words"].append((x0, text))
                row["y"] = (row["y"] + y0) / 2
                break
        else:
            rows.append({"y": y0, "words": [(x0, text)]})
    for row in rows:
        row["words"].sort()
    return sorted(rows, key=lambda r: r["y"])


def row_text(row, xmin=None, xmax=None, exclude=()):
    parts = [t for x, t in row["words"]
             if (xmin is None or x >= xmin) and (xmax is None or x < xmax) and t not in exclude]
    return " ".join(parts).strip()


VALUE_EXCLUDE = ("Color", "Depth")  # panel header words that can bleed into the value column


def match_label_value(rows, labels, label_x, value_x, y_range, dy_max=18):
    """Pair labels in one column with values in another column by nearest row."""
    lx0, lx1 = label_x
    vx0, vx1 = value_x
    y0, y1 = y_range
    found = {}
    for key_text, key in labels:
        for row in rows:
            if not (y0 <= row["y"] <= y1):
                continue
            if row_text(row, lx0, lx1) != key_text:
                continue
            best = None
            for vrow in rows:
                if not (y0 <= vrow["y"] <= y1):
                    continue
                val = row_text(vrow, vx0, vx1, exclude=VALUE_EXCLUDE)
                if not val:
                    continue
                dy = abs(vrow["y"] - row["y"])
                if dy <= dy_max and (best is None or dy < best[0]):
                    best = (dy, val)
            if best and key not in found:
                found[key] = best[1]
    return found


STANDARD_DETAIL = {
    "level": "0", "mode": "Manual", "vhBalance": "+2",
    "bwBalance": "Type 3", "limit": "7", "crispening": "7", "hiLightDetail": "4",
}

NOTE_PATTERNS = (
    "gamma assist", "noise reduction", "iso", "grain", "playlist", "http",
    "custom wb", "teal card", "punchy contrast", "flat contrast",
)


def parse_page(page, page_number):
    words = dedupe_words(page.get_text("words"))
    rows = rows_from_words(words)

    # --- recipe name (marked with black triangles) ---
    name = None
    name_y = None
    for row in rows:
        text = row_text(row)
        if "\u25bc" in text:
            name = re.sub(r"\s+", " ", text.replace("\u25bc", " ")).strip()
            name_y = row["y"]
            break
    if not name:
        return None

    y_lo, y_hi = PANEL_Y

    pp = match_label_value(rows, PP_LABELS, (150, 350), (350, 600), (y_lo, y_hi))

    # --- color depth: letter followed by its value on the same row ---
    depth = {}
    for row in rows:
        if y_lo <= row["y"] <= y_hi:
            for i, (x, t) in enumerate(row["words"]):
                if t in ("R", "G", "B", "C", "M", "Y") and 560 <= x <= 700 and i + 1 < len(row["words"]):
                    nx, nt = row["words"][i + 1]
                    if nx - x < 110 and re.fullmatch(r"[+-]?\d+", nt):
                        depth[t] = nt

    detail = match_label_value(rows, DETAIL_LABELS, (820, 1015), (1015, 1160), (y_lo, y_hi))
    # A few pages have two overlapping text layers in the Detail panel;
    # every recipe in the pack uses the same standard Detail block anyway.
    doubled = any(" " in str(v) and k != "bwBalance" for k, v in detail.items()) or \
        detail.get("bwBalance") not in (None, "Type 3", "Type 1")
    if doubled or set(STANDARD_DETAIL) - set(detail):
        detail = dict(STANDARD_DETAIL)
    diffs = {k: v for k, v in detail.items() if STANDARD_DETAIL.get(k) != v}
    if diffs:
        print(f"  page {page_number}: detail differs from standard: {diffs}", file=sys.stderr)

    # --- white balance: summary line under the name + labeled bottom block ---
    wb_lines = []
    for row in rows:
        if name_y < row["y"] < name_y + 70:
            t = row_text(row)
            if t:
                wb_lines.append(t)
    bottom = []
    for row in rows:
        if row["y"] > y_hi:
            t = row_text(row)
            if t and "Veres" not in t and t not in BOILERPLATE:
                bottom.append(t)

    # --- notes: warnings and shooting tips anywhere on the page ---
    notes = []
    for row in rows:
        t = row_text(row)
        if not t or "\u25bc" in t:
            continue
        low = t.lower()
        if "!" in t and "assist" in low or any(p in low for p in NOTE_PATTERNS):
            if t not in wb_lines and t not in notes and t not in bottom:
                notes.append(t)

    return {
        "page": page_number,
        "name": name,
        "wbSummary": " ".join(wb_lines),
        "settings": {
            "blackLevel": pp.get("blackLevel"),
            "gamma": pp.get("gamma"),
            "blackGamma": pp.get("blackGamma"),
            "knee": pp.get("knee"),
            "colorMode": pp.get("colorMode"),
            "saturation": pp.get("saturation"),
            "colorPhase": pp.get("colorPhase"),
            "colorDepth": depth,
            "detail": detail or dict(STANDARD_DETAIL),
        },
        "whiteBalanceBlock": bottom,
        "notes": notes,
    }


def extract_sample_image(doc, page, slug):
    """Save the sample-photo collage (largest embedded image fully inside the page)."""
    best = None
    prect = page.rect
    for info in page.get_image_info(xrefs=True):
        bbox = fitz.Rect(info["bbox"])
        if bbox.width <= 0 or bbox.height <= 0:
            continue
        inside = prect.contains(bbox)
        area = bbox.get_area()
        if inside and area < prect.get_area() * 0.8:
            if best is None or area > best[1]:
                best = (info["xref"], area)
    if not best:
        return None
    pix = fitz.Pixmap(doc, best[0])
    if pix.n - pix.alpha > 3:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    out = IMG_DIR / f"{slug}.jpg"
    pix.save(out, jpg_quality=82)
    return f"assets/recipes/{out.name}"


def main():
    doc = fitz.open(PDF)
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)

    recipes = []
    for idx in RECIPE_PAGES:
        page = doc[idx]
        rec = parse_page(page, idx + 1)
        if rec is None:
            print(f"WARN page {idx + 1}: no recipe name found", file=sys.stderr)
            continue
        slug = slugify(rec["name"])
        rec["id"] = slug
        rec["image"] = extract_sample_image(doc, page, slug)
        cm = (rec["settings"]["colorMode"] or "").lower()
        rec["bw"] = "black" in cm
        recipes.append(rec)
        missing = [k for k, v in rec["settings"].items() if v in (None, "", {})]
        flag = f"  MISSING: {missing}" if missing else ""
        print(f"p{idx+1:02d} {rec['name']!r:40s} depth={len(rec['settings']['colorDepth'])} detail={len(rec['settings']['detail'])}{flag}")

    OUT_JSON.write_text(json.dumps({"source": PDF.name, "recipes": recipes}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n{len(recipes)} recipes -> {OUT_JSON}")


if __name__ == "__main__":
    main()
