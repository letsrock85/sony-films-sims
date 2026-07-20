import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "tmp_verify";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:8123/index.html?v=10";

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log("shot", name);
}

async function checkDetail(page, label) {
  const texts = await page.locator(".sgroup h2").allTextContents();
  const vals = await page.locator(".srow .v").allTextContents();
  const hasDetail = texts.some((t) => /detail/i.test(t));
  const hasColorDepth = texts.some((t) => /color depth/i.test(t));
  const hasPP = texts.some((t) => /picture profile/i.test(t));
  const swatches = await page.locator(".dswatch i").count();
  const sheetBox = await page.locator(".sheet").boundingBox();
  const detailBox = await page.locator(".detail").boundingBox();
  const overflow = await page.evaluate(() => {
    const sheet = document.querySelector(".sheet");
    if (!sheet) return null;
    return {
      scrollH: sheet.scrollHeight,
      clientH: sheet.clientHeight,
      overflowY: getComputedStyle(sheet).overflowY,
    };
  });
  console.log(`[${label}] headings:`, texts.join(" | "));
  console.log(`[${label}] hasPP=${hasPP} hasColorDepth=${hasColorDepth} hasDetail=${hasDetail} swatches=${swatches}`);
  console.log(`[${label}] values sample:`, vals.slice(0, 4).join(", "), "... total", vals.length);
  console.log(`[${label}] sheet overflow:`, overflow);
  console.log(`[${label}] boxes:`, { sheet: sheetBox, detail: detailBox });
  if (!hasDetail) throw new Error(`${label}: Detail section missing from DOM`);
  if (swatches < 4) throw new Error(`${label}: expected 4 swatches, got ${swatches}`);
  // Detail heading must be in viewport (not clipped by overflow:hidden parent)
  const detailHead = page.locator(".sgroup h2", { hasText: /detail/i }).first();
  const visible = await detailHead.isVisible();
  const inView = await detailHead.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0;
  });
  console.log(`[${label}] Detail heading visible=${visible} inViewport=${inView}`);
  if (!visible || !inView) throw new Error(`${label}: Detail heading not fully in viewport`);
}

const browser = await chromium.launch({ headless: true });

try {
  // Desktop
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${BASE}#/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".pick");
    const pickSw = await page.locator(".pswatch").count();
    console.log("[desktop films] pick cards with swatches:", pickSw);
    await shot(page, "desktop-films");

    await page.goto(`${BASE}#/r/vektro-100`, { waitUntil: "networkidle" });
    await page.waitForSelector(".sheet");
    await shot(page, "desktop-detail");
    await checkDetail(page, "desktop");

    await page.click("#dimg");
    await page.waitForSelector(".lightbox");
    await shot(page, "desktop-lightbox");
    await page.click(".lightbox");
    await page.waitForSelector(".lightbox", { state: "detached" });
    console.log("[desktop] lightbox open/close ok");
    await page.close();
  }

  // Mobile (iPhone-ish)
  {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await page.goto(`${BASE}#/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".pick");
    await shot(page, "mobile-films");

    await page.goto(`${BASE}#/r/vektro-100`, { waitUntil: "networkidle" });
    await page.waitForSelector(".sheet");
    await shot(page, "mobile-detail");
    await checkDetail(page, "mobile");

    // Crispening / Hi-Light must exist in DOM and preferably in view
    const crisp = page.locator(".srow", { hasText: /Crispening/i });
    const hi = page.locator(".srow", { hasText: /Hi-Light/i });
    console.log("[mobile] Crispening count", await crisp.count(), "Hi-Light count", await hi.count());
    if ((await crisp.count()) === 0 || (await hi.count()) === 0) {
      throw new Error("mobile: Detail rows missing");
    }
    const crispInView = await crisp.first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    });
    console.log("[mobile] Crispening inViewport=", crispInView);

    await page.tap("#dimg");
    await page.waitForSelector(".lightbox");
    await shot(page, "mobile-lightbox");
    const lbImg = await page.locator(".lightbox img").boundingBox();
    console.log("[mobile] lightbox img box", lbImg);
    await page.tap(".lightbox");
    await page.waitForSelector(".lightbox", { state: "detached" });
    console.log("[mobile] lightbox open/close ok");
    await page.close();
  }

  console.log("\nALL CHECKS PASSED");
} finally {
  await browser.close();
}
