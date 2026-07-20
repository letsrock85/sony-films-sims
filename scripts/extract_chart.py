"""Extract film positions from the chart page (page 1) of the PDF.

Color chart: X = Saturation (low..high), Y = Tonality (hard..soft).
Panchromatic chart: X = Chroma Depth (low..high), Y = Tonality (hard..soft).
Coordinates are normalized to 0..1 (x: 0=low, 1=high; y: 0=hard, 1=soft).
"""

import json
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "docs" / "Sony Film Simulation Recipes V.pdf"
OUT = ROOT / "data" / "chart.json"

# Chart names as printed on the chart page (used to split names that
# share one visual row and got merged by clustering).
VOCAB = [
    "Phoenix Harman", "Veniliqum", "Vektro 100", "Velvia Pro", "Fuji Fortia 50",
    "RedScale Ultra", "Magic Spice", "Leicachrome", "Ayon 200", "Ektachrome",
    "Oktar", "Rose Spectra", "Gold Luxe", "Classic Chrome", "Kodak Ultra Max 400",
    "Amarelo 30D", "Phenomena", "Sony Provia RX", "Agfa Precisa", "Kodachrome v1",
    "Kodak Portra 160", "CineChrome", "Fuji Provia", "Acidnom", "Kodak Portra 400",
    "Kodak Gold 200", "Fuji400H", "GAF 500", "Kodak Color Plus 200", "Nostalgic Neg",
    "Cinestill 50D", "Senova Light", "DreamNeg", "Astia", "EvPro+", "Ektar 100",
    "Crimson", "Sony Classic Negative", "Classic Cinema", "Kodachrome v2",
    "Estra 500", "Pro Color", "Zetra 100", "Zero Mute", "Sony Eterna",
    "Cinestill 800", "Fuji Eterna", "Kodak Portra 800", "Asteroid City",
    "X-Tarr", "Cinestill X", "Arista Edu 100", "T-Max 100", "MidRed Infra",
    "Kodak Tri-X 1600", "Acros X-G", "Acros X-R", "Acros X", "Acros X-Ye",
    "Kosmo Pan", "Chroma Fade", "Delta 3200", "Neo Max", "Ilford HP5",
    "Kodak Tri-X 400",
]

# Non-name words: headers, titles, axis labels. Axis words also appear inside
# names (Chroma Fade), so headers/titles are skipped by y-position and axis
# labels by exact position.
AXIS_POSITIONS = {
    ("Saturation", 309, 722), ("Saturation", 861, 721),
    ("Low", 338, 742), ("High", 888, 741),
    ("Chroma", 277, 1529), ("Depth", 344, 1529),
    ("Chroma", 864, 1529), ("Depth", 931, 1529),
    ("Low", 319, 1549), ("High", 904, 1549),
    ("Tonality", 575, 495), ("Hard", 644, 495),
    ("Tonality", 577, 974), ("Soft", 646, 974),
    ("Tonality", 575, 1303), ("Hard", 644, 1303),
    ("Tonality", 577, 1782), ("Soft", 646, 1782),
}
HEADER_Y_MAX = 480
HEADER_BANDS = ((1180, 1260),)  # "SONY PANCHROMATIC FILM CHART" title
FOOTER_Y_MIN = 1900

COLOR_CHART = {"y": (495.0, 975.0), "x": (338.0, 888.0)}
BW_CHART = {"y": (1303.0, 1782.0), "x": (319.0, 904.0)}


def is_noise(x, y, text):
    if y < HEADER_Y_MAX or y > FOOTER_Y_MIN:
        return True
    if any(a <= y <= b for a, b in HEADER_BANDS):
        return True
    return any(t == text and abs(x - ax) < 4 and abs(y - ay) < 4
               for t, ax, ay in AXIS_POSITIONS)


def cluster_rows(words):
    """Group name words into visual rows, then into x-adjacent runs."""
    rows = {}
    for x0, y0, x1, y1, text in words:
        if is_noise(x0, y0, text):
            continue
        key = round(y0 / 6)
        rows.setdefault(key, []).append((x0, x1, y0, text))
    runs = []
    for key in sorted(rows):
        row = sorted(rows[key])
        current = [row[0]]
        for item in row[1:]:
            if item[0] - current[-1][1] < 30:
                current.append(item)
            else:
                runs.append(current)
                current = [item]
        runs.append(current)
    return runs


def segment_run(run):
    """Split a run of words into known names (greedy longest match)."""
    out = []
    i = 0
    while i < len(run):
        match = None
        for j in range(len(run), i, -1):
            candidate = " ".join(w[3] for w in run[i:j])
            if candidate in VOCAB:
                match = (candidate, run[i:j], j)
                break
        if match:
            name, group, next_i = match
            x_center = (group[0][0] + group[-1][1]) / 2
            y_center = sum(g[2] for g in group) / len(group)
            out.append((name, x_center, y_center))
            i = next_i
        else:
            print(f"  WARN unmatched word: {run[i][3]!r} at ({run[i][0]:.0f},{run[i][2]:.0f})")
            i += 1
    return out


def main():
    doc = fitz.open(PDF)
    words = [(w[0], w[1], w[2], w[3], w[4]) for w in doc[0].get_text("words")]
    entries = []
    for run in cluster_rows(words):
        entries.extend(segment_run(run))

    result = {"color": [], "bw": []}
    for name, x, y in entries:
        for chart_key, chart in (("color", COLOR_CHART), ("bw", BW_CHART)):
            y0, y1 = chart["y"]
            x0, x1 = chart["x"]
            if y0 - 20 <= y <= y1 + 20:
                nx = min(1.0, max(0.0, round((x - x0) / (x1 - x0), 3)))
                ny = min(1.0, max(0.0, round((y - y0) / (y1 - y0), 3)))
                result[chart_key].append({"name": name, "x": nx, "y": ny})
                break

    OUT.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"color: {len(result['color'])}  bw: {len(result['bw'])} -> {OUT}")


if __name__ == "__main__":
    main()
