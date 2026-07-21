import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "tmp_verify";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:8123/index.html?v=12";

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

async function checkMobileReadability(page, { requireStory = true, requirePalette = true } = {}) {
  const result = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight;
    };
    const wb = [...document.querySelectorAll(".srow")]
      .find((el) => el.querySelector(".k")?.textContent.trim() === "White Balance");
    const body = document.querySelector(".dbody");
    const sheet = document.querySelector(".sheet");
    const story = document.querySelector(".filmline");
    const tip = document.querySelector(".tip");
    const source = document.querySelector(".more");
    const palette = document.querySelector(".palette-label");
    const fieldNote = document.querySelector(".fieldnote");
    const groups = [...document.querySelectorAll(".sgroup")];
    const rows = [...document.querySelectorAll(".sgroup h2, .srow, .depth")];
    const wbGroup = wb?.closest(".sgroup");
    const sheetRect = sheet?.getBoundingClientRect();
    const lastGroupBottom = Math.max(...groups.map((el) => el.getBoundingClientRect().bottom));
    return {
      minLabelPx: Math.min(...[...document.querySelectorAll(".srow .k")]
        .map((el) => parseFloat(getComputedStyle(el).fontSize))),
      minValuePx: Math.min(...[...document.querySelectorAll(".srow .v")]
        .map((el) => parseFloat(getComputedStyle(el).fontSize))),
      minHeadingPx: Math.min(...[...document.querySelectorAll(".sgroup h2")]
        .map((el) => parseFloat(getComputedStyle(el).fontSize))),
      minDepthPx: Math.min(...[...document.querySelectorAll(".depth span")]
        .map((el) => parseFloat(getComputedStyle(el).fontSize))),
      wbSingleLine: wb
        ? [...wb.children].every((el) =>
            el.scrollWidth <= el.clientWidth + 1 &&
            el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) * 1.2)
        : false,
      wbFullWidth: !!wbGroup && !!sheetRect &&
        wbGroup.getBoundingClientRect().width >= sheetRect.width * 0.9,
      bodyScrolls: body ? body.scrollHeight > body.clientHeight + 1 : true,
      sheetScrolls: sheet ? sheet.scrollHeight > sheet.clientHeight + 1 : true,
      pageScrolls: document.documentElement.scrollHeight > innerHeight + 1,
      allSettingsVisible: rows.every(visible),
      settingsCellsOverflow: [...document.querySelectorAll(".sgroup .srow")].some((el) =>
        el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1),
      emptyBorderedSpace: sheetRect ? sheetRect.bottom - lastGroupBottom : Infinity,
      storyVisible: !!story && visible(story),
      tipVisible: !!tip && visible(tip),
      sourceVisible: !!source && visible(source),
      paletteLabel: palette?.textContent.trim() || "",
      paletteAria: document.querySelector(".dswatch")?.getAttribute("aria-label") || "",
      fieldNoteVisible: !!fieldNote && visible(fieldNote),
      paletteFollowsStory: !!palette && !!story &&
        palette.getBoundingClientRect().top > story.getBoundingClientRect().bottom,
      detailUsesViewport: sheetRect ? innerHeight - sheetRect.bottom <= 20 : false,
      oneSectionColumn: sheet ? getComputedStyle(sheet).gridTemplateColumns.split(" ").length === 1 : false,
    };
  });
  console.log("[mobile] readability:", result);
  if (result.minLabelPx < 12 || result.minValuePx < 12 ||
      result.minHeadingPx < 12 || result.minDepthPx < 12) {
    throw new Error("mobile: settings text is too small");
  }
  if (!result.wbSingleLine || !result.wbFullWidth) throw new Error("mobile: White Balance is wrapped or squeezed");
  if (result.bodyScrolls || result.sheetScrolls || result.pageScrolls ||
      !result.allSettingsVisible || result.settingsCellsOverflow) {
    throw new Error("mobile: detail content is clipped or scrolling");
  }
  if (result.emptyBorderedSpace > 20) throw new Error("mobile: settings panel has oversized empty bordered space");
  if (requireStory && (!result.storyVisible || !result.tipVisible || !result.sourceVisible)) {
    throw new Error("mobile: recipe story, advice, or source link was hidden");
  }
  if (requireStory && !result.fieldNoteVisible) throw new Error("mobile: field recommendation is missing");
  if (!result.detailUsesViewport) throw new Error("mobile: available vertical space is wasted");
  if (!result.oneSectionColumn) throw new Error("mobile: settings sections compete in parallel columns");
  if (requirePalette &&
      (!/source palette/i.test(result.paletteLabel) || !/source palette:/i.test(result.paletteAria))) {
    throw new Error("mobile: palette strip lacks a visible or accessible label");
  }
  if (requirePalette && !result.paletteFollowsStory) {
    throw new Error("mobile: palette appears as an unexplained strip directly under the photo");
  }
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

    await page.goto(`${BASE}#/r/zero-mute`, { waitUntil: "networkidle" });
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

    await page.goto(`${BASE}#/r/zero-mute`, { waitUntil: "networkidle" });
    await page.waitForSelector(".sheet");
    await shot(page, "mobile-detail");
    await checkDetail(page, "mobile");
    await checkMobileReadability(page);

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
    if (!crispInView) throw new Error("mobile: Crispening is outside the viewport");

    await page.tap("#dimg");
    await page.waitForSelector(".lightbox");
    await shot(page, "mobile-lightbox");
    const lbImg = await page.locator(".lightbox img").boundingBox();
    console.log("[mobile] lightbox img box", lbImg);
    await page.tap(".lightbox");
    await page.waitForSelector(".lightbox", { state: "detached" });
    console.log("[mobile] lightbox open/close ok");

    // Portra carries two story paragraphs and must still preserve the full flow.
    await page.goto(`${BASE}#/r/kodak-portra-400`, { waitUntil: "networkidle" });
    await page.waitForSelector(".pp-sheet");
    await checkMobileReadability(page);
    await shot(page, "mobile-detail-portra");

    // Creative Look uses a different, single-column settings model.
    await page.goto(`${BASE}#/r/cl-kodak-portra-400`, { waitUntil: "networkidle" });
    await page.waitForSelector(".cl-sheet");
    await checkMobileReadability(page, { requirePalette: false });
    const clColumns = await page.locator(".cl-sheet").evaluate((el) =>
      getComputedStyle(el).gridTemplateColumns.split(" ").length);
    if (clColumns !== 1) throw new Error(`mobile CL: expected one readable column, got ${clColumns}`);
    await shot(page, "mobile-detail-cl");

    // User's real screenshot is a taller 500x1024 mobile viewport.
    await page.setViewportSize({ width: 500, height: 1024 });
    await page.goto(`${BASE}#/r/zero-mute`, { waitUntil: "networkidle" });
    await page.waitForSelector(".pp-sheet");
    await checkMobileReadability(page);
    await shot(page, "mobile-tall-detail");

    await page.goto(`${BASE}#/r/cl-kodak-portra-400`, { waitUntil: "networkidle" });
    await page.waitForSelector(".cl-sheet");
    await checkMobileReadability(page, { requirePalette: false });

    // Recipes without an exact post still link to the author's archive.
    await page.goto(`${BASE}#/r/astia`, { waitUntil: "networkidle" });
    await page.waitForSelector(".more a");
    const archiveHref = await page.locator(".more a").getAttribute("href");
    if (!/veresdenialex\.com/.test(archiveHref || "")) throw new Error("missing author archive fallback");
    await page.close();
  }

  console.log("\nALL CHECKS PASSED");
} finally {
  await browser.close();
}
