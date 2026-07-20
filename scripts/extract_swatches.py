"""Extract the 4 recipe color swatches from each PDF page into app/data.json.

Each recipe page has 4 color patches below the sample photo at fixed
coordinates (page space 1300x2000): centers x = 295/530/766/1003, y = 998.
Recipes without a `page` (Creative Look pack from the blog) are skipped.
"""
import json
import fitz

PDF = "docs/Sony Film Simulation Recipes V.pdf"
DATA = "app/data.json"
XS = (295, 530, 766, 1003)
Y = 998
R = 10


def sample(page, x, y):
    pix = page.get_pixmap(clip=fitz.Rect(x - R, y - R, x + R, y + R))
    n = pix.width * pix.height
    rs = gs = bs = 0
    for yy in range(pix.height):
        for xx in range(pix.width):
            px = pix.pixel(xx, yy)
            rs += px[0]
            gs += px[1]
            bs += px[2]
    return "#%02x%02x%02x" % (rs // n, gs // n, bs // n)


def main():
    doc = fitz.open(PDF)
    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)

    done = 0
    for r in data["recipes"]:
        pno = r.get("page")
        if not pno:
            r.pop("swatches", None)
            continue
        page = doc[pno - 1]
        r["swatches"] = [sample(page, x, Y) for x in XS]
        done += 1

    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"swatches added to {done} recipes")


if __name__ == "__main__":
    main()
