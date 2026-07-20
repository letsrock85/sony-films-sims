/* Filmbook v8 — one screen, no sidebar, no page scroll.
   Ask light → subject → mood (1 click each). Show 6 best matches. */
(() => {
"use strict";

const view = document.getElementById("view");
const tabs = document.getElementById("tabs");
let DB = null;

const store = {
  get(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};

const favs = () => new Set(store.get("favs", []));
const toggleFav = (id) => {
  const f = favs();
  f.has(id) ? f.delete(id) : f.add(id);
  store.set("favs", [...f]);
  return f.has(id);
};

const filters = store.get("filters", { light: "", subject: "", mood: "", kind: "", q: "" });
for (const k of ["light", "subject", "mood", "kind", "q"]) {
  if (filters[k] == null) filters[k] = "";
}
const saveFilters = () => store.set("filters", filters);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const paint = (html) => { view.innerHTML = html; };

/* short labels so one row fits laptop + phone */
const LIGHTS = [
  ["sunny", "Sunny", "Hard midday sun"],
  ["golden-hour", "Golden", "Low warm sun"],
  ["overcast", "Overcast", "Soft even grey"],
  ["shade", "Shade", "Cool diffused"],
  ["indoor", "Indoor", "Window or lamps"],
  ["night", "Night", "Lamps and neon"],
];
const SUBJECTS = [
  ["people", "People", "Skin tones first", ["portrait"]],
  ["city", "Street", "City and documentary", ["street", "documentary", "architecture", "urban"]],
  ["nature", "Nature", "Greens, water, sky", ["landscape", "nature"]],
  ["everyday", "Travel", "Forgiving all-day", ["travel", "everyday"]],
];
const MOODS = [
  ["golden", "Warm", "Sun-kissed color", ["warm"]],
  ["clean", "Cool", "Neutral, modern", ["cool", "clean"]],
  ["bold", "Bold", "Strong saturation", ["vivid", "punchy"]],
  ["quiet", "Soft", "Quiet color", ["muted", "soft"]],
  ["vintage", "Vintage", "Old-album feel", ["nostalgic"]],
  ["cinematic", "Cinema", "Deeper shadows", ["cinematic", "moody"]],
  ["dreamy", "Dreamy", "Airy and hazy", ["dreamy"]],
];
const GROUPS = { light: LIGHTS, subject: SUBJECTS, mood: MOODS };
const TOP_N = 6;

/* Curated field picks so Top 6 is useful, not alphabetical noise */
const PICKS = {
  light: {
    sunny: ["ektar-100", "velvia-pro", "kodak-gold", "amarelo-30d", "fortia-50", "kodak-portra-400"],
    "golden-hour": ["kodak-gold", "rose-spectra", "magicspice", "kodak-portra-160", "nostalgic-neg", "cl-kodak-gold"],
    overcast: ["fuji-400h", "classic-chrome", "zero-mute", "senova-light", "astia", "kodak-portra-400"],
    shade: ["fuji-400h", "astia", "classic-chrome", "kodak-portra-400", "provia-rx", "senova-light"],
    indoor: ["portra-800", "kodak-portra-400", "astia", "fuji-400h", "evpro", "cl-kodak-portra-400"],
    night: ["cinestill-800t-nightime-recipe", "vespera-nightime", "veniliqum-night", "gold-luxe-nighttime", "cl-cinestill-800t", "delta-3200"],
  },
  subject: {
    people: ["kodak-portra-400", "fuji-400h", "astia", "kodak-portra-160", "cl-kodak-portra-400", "senova-light"],
    city: ["classic-chrome", "vektro-100", "sony-classic-negative", "cl-classic-chrome", "kodak-tri-x-400", "ilford-hp5"],
    nature: ["velvia-pro", "ektar-100", "oktar", "fortia-50", "fuji-provia", "cl-velvia"],
    everyday: ["kodak-gold", "kodak-portra-400", "magicspice", "kodak-ultra-max-400", "cl-kodak-gold", "evpro"],
  },
  mood: {
    golden: ["kodak-gold", "magicspice", "amarelo-30d", "rose-spectra", "cl-kodak-gold", "ayon-200"],
    clean: ["fuji-400h", "ektachrome", "vektro-100", "fuji-provia", "cl-provia", "t-max-100"],
    bold: ["ektar-100", "velvia-pro", "fortia-50", "pro-color", "cl-velvia", "cl-fujifilm-fortia-50"],
    quiet: ["zero-mute", "classic-chrome", "fuji-eterna", "cl-eterna", "cl-classic-chrome", "sony-eterna"],
    vintage: ["nostalgic-neg", "sony-classic-negative", "cl-nostalgic-neg", "gaf-500", "cl-classic-negative", "kodak-color-plus-200"],
    cinematic: ["sony-eterna", "fuji-eterna", "classic-cinema", "cinechrome", "cl-eterna", "blue-velvet-cinestill-50d"],
    dreamy: ["senova-light", "dreamneg", "estra-500", "asteroid-city-kodak-vision-t200", "cl-astia", "phenomena"],
  },
};

function matchOne(r, group, value) {
  if (!value) return true;
  if (group === "light") {
    return value === "night"
      ? r.tags.light.includes("night")
      : r.tags.light.includes(value) || r.tags.light.includes("any");
  }
  const def = GROUPS[group].find(([v]) => v === value);
  const tags = def && def[3] ? def[3] : [];
  const hay = group === "subject" ? r.tags.bestFor : r.tags.mood;
  return tags.some((t) => hay.includes(t));
}

function matches(r) {
  return matchOne(r, "light", filters.light)
    && matchOne(r, "subject", filters.subject)
    && matchOne(r, "mood", filters.mood);
}

function pickBoost(r) {
  let s = 0;
  for (const [group, value] of [["light", filters.light], ["subject", filters.subject], ["mood", filters.mood]]) {
    if (!value) continue;
    const list = (PICKS[group] && PICKS[group][value]) || [];
    const i = list.indexOf(r.id);
    if (i >= 0) s += 100 - i * 8;
  }
  return s;
}

function score(r) {
  let s = pickBoost(r);
  if (filters.light) {
    if (r.tags.light.includes(filters.light)) s += 12;
    else if (r.tags.light.includes("any")) s += 2;
    if (filters.light !== "night" && r.tags.light.includes("night") && !r.tags.light.includes(filters.light)) {
      s -= 20;
    }
  }
  if (filters.subject) {
    if (matchOne(r, "subject", filters.subject)) s += 10;
    else s -= 10;
  }
  if (filters.mood) {
    if (matchOne(r, "mood", filters.mood)) s += 10;
    else s -= 10;
  }
  if (filters.subject === "people" && !r.bw) s += 2;
  if (r.kind === "pp") s += 0.5;
  return s;
}

function bestSix() {
  const byId = new Map(DB.recipes.map((r) => [r.id, r]));
  if (!filters.light && !filters.subject && !filters.mood) {
    const starters = ["kodak-portra-400", "fuji-400h", "kodak-gold", "classic-chrome",
      "velvia-pro", "cinestill-800t-nightime-recipe"];
    return starters.map((id) => byId.get(id)).filter(Boolean).slice(0, TOP_N);
  }
  return DB.recipes
    .filter(matches)
    .map((r) => ({ r, s: score(r) }))
    .sort((a, b) => b.s - a.s || a.r.name.localeCompare(b.r.name))
    .slice(0, TOP_N)
    .map((x) => x.r);
}

function statusLine() {
  const parts = [];
  const L = LIGHTS.find(([v]) => v === filters.light);
  const S = SUBJECTS.find(([v]) => v === filters.subject);
  const M = MOODS.find(([v]) => v === filters.mood);
  if (L) parts.push(L[2]);
  if (S) parts.push(S[2]);
  if (M) parts.push(M[2]);
  if (!parts.length) return "Tap light, subject, mood. Six best films appear below.";
  return parts.join(" · ");
}

function chipRow(group, title, defs) {
  return `<div class="row" data-g="${group}">
    <span class="rlab">${esc(title)}</span>
    <div class="chips" role="group" aria-label="${esc(title)}">
      ${defs.map(([v, l]) =>
        `<button type="button" class="chip${filters[group] === v ? " on" : ""}"
          data-g="${group}" data-v="${v}">${esc(l)}</button>`
      ).join("")}
    </div>
  </div>`;
}

const swatchStrip = (r, cls) => (r.swatches && r.swatches.length
  ? `<span class="${cls}" aria-hidden="true">${r.swatches.map((c) =>
      `<i style="background:${esc(c)}"></i>`).join("")}</span>`
  : "");

function pickCard(r, i) {
  const kind = r.kind === "cl" ? "CL" : (r.bw ? "B&W" : "PP");
  const vibe = r.film || "";
  return `<a class="pick" href="#/r/${esc(r.id)}" style="--i:${i}">
    <img src="${esc(r.image || "")}" alt="" loading="eager">
    ${swatchStrip(r, "pswatch")}
    <span class="pmeta">
      <span class="pname">${esc(r.name)} <em>${esc(kind)}</em></span>
      <span class="pvibe">${esc(vibe)}</span>
    </span>
  </a>`;
}

function bindChips(root) {
  root.querySelectorAll(".chip").forEach((b) => {
    b.addEventListener("click", () => {
      const g = b.dataset.g;
      const v = b.dataset.v;
      filters[g] = filters[g] === v ? "" : v;
      saveFilters();
      pagePick();
    });
  });
  const reset = root.querySelector("#reset");
  if (reset) {
    reset.addEventListener("click", () => {
      Object.assign(filters, { light: "", subject: "", mood: "", kind: "", q: "" });
      saveFilters();
      pagePick();
    });
  }
}

function pagePick() {
  const top = bestSix();
  const active = !!(filters.light || filters.subject || filters.mood);
  const total = DB.recipes.filter(matches).length;

  paint(`
  <section class="pickpage">
    <div class="ask">
      ${chipRow("light", "Light", LIGHTS)}
      ${chipRow("subject", "Subject", SUBJECTS)}
      ${chipRow("mood", "Mood", MOODS)}
    </div>
    <div class="status">
      <p class="hint" id="hint">${esc(statusLine())}</p>
      <div class="statright">
        <span class="count">${active ? `Top ${top.length}` : "Start here"}</span>
        <button type="button" class="reset" id="reset" ${active ? "" : "hidden"}>Clear</button>
      </div>
    </div>
    <div class="picks" id="picks">
      ${top.map(pickCard).join("") || `<p class="empty">Nothing fits. Clear one chip.</p>`}
    </div>
  </section>`);

  bindChips(view);
}

/* ---------- detail ---------- */

function ppGroups(r) {
  const s = r.settings;
  const wb = (r.wbBlock || []).filter((t) => !/^Kelvin/.test(t));
  const wbNote = wb.slice(1).join(" ");
  return [
    { title: "White balance", rows: [
      ...(r.wb ? [["White Balance", r.wb]] : []),
      ...(wbNote ? [["Note", wbNote]] : []),
    ]},
    { title: "Picture profile", rows: [
      ["Black Level", s.blackLevel], ["Gamma", s.gamma], ["Black Gamma", s.blackGamma],
      ["Knee", s.knee], ["Color Mode", s.colorMode], ["Saturation", s.saturation],
      ["Color Phase", s.colorPhase],
    ]},
    { title: "Color depth", depth: s.colorDepth },
    { title: "Detail", rows: [
      ["Detail Level", s.detail.level], ["Mode", s.detail.mode],
      ["V/H Balance", s.detail.vhBalance], ["B/W Balance", s.detail.bwBalance],
      ["Limit", s.detail.limit], ["Crispening", s.detail.crispening],
      ["Hi-Light Detail", s.detail.hiLightDetail],
    ]},
  ];
}

function clGroups(r) {
  const s = r.settings || {};
  return [
    { title: "Creative look", rows: [
      ["Base Look", s.look], ["Contrast", s.contrast], ["Highlights", s.highlights],
      ["Shadows", s.shadows], ["Fade", s.fade], ["Saturation", s.saturation],
      ["Sharpness", s.sharpness], ["Sharpness Range", s.sharpnessRange], ["Clarity", s.clarity],
    ]},
    { title: "Camera", rows: [
      ["White Balance", s.whiteBalance], ["DRO", s.dro],
    ]},
  ];
}

function pageDetail(id) {
  const r = DB.recipes.find((x) => x.id === id);
  if (!r) { location.hash = "#/"; return; }

  const groups = (r.kind === "cl" ? clGroups(r) : ppGroups(r))
    .map((g) => ({ ...g, rows: (g.rows || []).filter(([, v]) => v != null && v !== "") }))
    .filter((g) => (g.rows && g.rows.length) || g.depth);

  const warns = (r.notes || []).filter((n) => n.includes("!"));
  const tips = (r.notes || []).filter((n) => !n.includes("!") && !n.includes("http"));
  const links = (r.notes || []).filter((n) => n.includes("http"));
  const isFav = favs().has(r.id);
  const used = [...new Set([...r.tags.bestFor, ...r.tags.light])]
    .filter((t) => t !== "any").slice(0, 4).join(", ");

  paint(`
  <article class="detail">
    <div class="dtop">
      <a class="back" href="#/">&larr; Back</a>
      <button class="favbtn${isFav ? " on" : ""}" id="fav" type="button">${isFav ? "Saved" : "Save"}</button>
    </div>
    <div class="dbody">
      <div class="dmeta">
        ${r.image ? `<button type="button" class="dimgbtn" id="dimg" aria-label="Expand sample photo">
          <img src="${esc(r.image)}" alt="${esc(r.name)}">
        </button>` : ""}
        ${swatchStrip(r, "dswatch")}
        <h1>${esc(r.name)}</h1>
        <p class="sub">${r.kind === "cl" ? "Creative Look" : "Picture Profile"}${r.bw ? " · B&W" : ""}${used ? " · " + esc(used) : ""}</p>
        ${r.film ? `<p class="filmline">${esc(r.film)}</p>` : ""}
        ${warns.map((w) => `<p class="warn">${esc(w)}</p>`).join("")}
        ${r.tip ? `<p class="tip">${esc(r.tip)}</p>` : ""}
        ${tips.slice(0, 2).map((t) => `<p class="tip">${esc(t)}</p>`).join("")}
        ${r.sourceUrl || links.length ? `
        <p class="more">
          ${r.sourceUrl ? `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">Author's post</a>` : ""}
          ${links.map((l) => {
            const url = (l.match(/https?:\S+/) || [""])[0];
            return url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">Video</a>` : "";
          }).join("")}
        </p>` : ""}
      </div>
      <div class="sheet">
        ${groups.map((g) => `
        <div class="sgroup">
          <h2>${esc(g.title)}</h2>
          ${(g.rows || []).map(([k, v]) => k === "Note"
            ? `<div class="srow note"><span class="nv">${esc(v)}</span></div>`
            : `<div class="srow"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`
          ).join("")}
          ${g.depth ? `
          <div class="depth">
            ${["R", "G", "B", "C", "M", "Y"].map((ch) =>
              `<div><span>${ch}</span><b>${esc(g.depth[ch] ?? "0")}</b></div>`).join("")}
          </div>` : ""}
        </div>`).join("")}
      </div>
    </div>
  </article>`);

  view.querySelector("#fav").addEventListener("click", (e) => {
    const on = toggleFav(r.id);
    e.target.classList.toggle("on", on);
    e.target.textContent = on ? "Saved" : "Save";
  });

  /* tap photo to see it uncropped; tap anywhere (or Esc) to put it away */
  const dimg = view.querySelector("#dimg");
  if (dimg) {
    dimg.addEventListener("click", (e) => {
      e.stopPropagation();
      openLightbox(r.image, r.name);
    });
  }
}

function openLightbox(src, name) {
  if (document.querySelector(".lightbox")) return;
  const box = document.createElement("div");
  box.className = "lightbox";
  box.innerHTML = `<img src="${esc(src)}" alt="${esc(name)}">`;
  const close = () => {
    box.remove();
    removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  box.addEventListener("click", close);
  addEventListener("keydown", onKey);
  document.body.appendChild(box);
}

/* ---------- map / guides / saved ---------- */

const ZONES = [
  [["Muted & dramatic", "quiet color, deep shadows"],
   ["Classic & punchy", "true color, strong contrast"],
   ["Loud & vivid", "maximum color, drama"]],
  [["Calm & quiet", "understated all-day"],
   ["True to life", "balanced color & contrast"],
   ["Rich color", "bold color, easy contrast"]],
  [["Faded & flat", "washed, nostalgic"],
   ["Gentle film fade", "soft contrast, honest color"],
   ["Colorful but soft", "bold color, dreamy"]],
];

function terciles(values) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return [0, 0];
  return [s[Math.floor(s.length / 3)], s[Math.floor((2 * s.length) / 3)]];
}
const bucket3 = (v, [t1, t2]) => (v < t1 ? 0 : v < t2 ? 1 : 2);

function zoneCell(title, hint, list) {
  if (!list.length) return "";
  return `<div class="zone">
    <h3>${esc(title)}</h3>
    <p class="zh">${esc(hint)}</p>
    ${list.map((r) => `<a href="#/r/${esc(r.id)}">${esc(r.name)}</a>`).join("")}
  </div>`;
}

function pageChart() {
  const color = DB.recipes.filter((r) => r.chart && r.chart.chart === "color");
  const bw = DB.recipes.filter((r) => r.chart && r.chart.chart === "bw");
  const tx = terciles(color.map((r) => r.chart.x));
  const ty = terciles(color.map((r) => r.chart.y));
  const cells = Array.from({ length: 3 }, () => [[], [], []]);
  color.forEach((r) => cells[bucket3(r.chart.y, ty)][bucket3(r.chart.x, tx)].push(r));
  const tby = terciles(bw.map((r) => r.chart.y));
  const bwRows = [
    ["Hard & dramatic", "deep blacks", []],
    ["Balanced", "classic monochrome", []],
    ["Soft & faded", "gentle greys", []],
  ];
  bw.forEach((r) => bwRows[bucket3(r.chart.y, tby)][2].push(r));

  paint(`<section class="prose">
    <h1>Character map</h1>
    <p class="lede">Films by color and contrast. Tap a name.</p>
    <h2>Color</h2>
    <div class="zones">
      ${cells.map((row, ri) => row.map((list, ci) =>
        zoneCell(ZONES[ri][ci][0], ZONES[ri][ci][1], list)).join("")).join("")}
    </div>
    <h2>Black &amp; white</h2>
    <div class="zones">
      ${bwRows.map(([t, h, list]) => zoneCell(t, h, list)).join("")}
    </div>
  </section>`);
}

function pageGuides() {
  const install = DB.clInstall || [];
  const cheats = DB.cheatsheet || [];
  paint(`<section class="prose">
    <h1>Field guides</h1>
    <p class="lede">Quick answers first.</p>
    ${cheats.length ? `
    <h2>30-second cheatsheet</h2>
    ${cheats.map((c) => `
      <div class="crow"><span class="cq">${esc(c.q)}</span><span class="ca">${esc(c.a)}</span></div>`).join("")}` : ""}
    <h2>Longer reads</h2>
    ${DB.guides.map((g) => `
      <details class="gitem">
        <summary>${esc(g.title)}</summary>
        <div class="gbody">
          <p>${esc(g.essence)}</p>
          ${g.steps?.length ? `<ol>${g.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
          ${g.sourceUrl ? `<p class="gsrc"><a href="${esc(g.sourceUrl)}" target="_blank" rel="noopener">Full article</a></p>` : ""}
        </div>
      </details>`).join("")}
    ${install.length ? `
      <details class="gitem">
        <summary>How to set a Creative Look</summary>
        <div class="gbody"><ol>${install.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>
      </details>` : ""}
  </section>`);
}

function pageFav() {
  const list = DB.recipes.filter((r) => favs().has(r.id)).slice(0, TOP_N);
  const n = favs().size;
  paint(`
  <section class="pickpage">
    <div class="status alone">
      <p class="hint">${n ? "Your saved films on this device." : "Open a film and tap Save."}</p>
      <span class="count">${n} saved</span>
    </div>
    <div class="picks">
      ${list.map(pickCard).join("") || `<p class="empty">Nothing saved yet.</p>`}
    </div>
  </section>`);
}

function route() {
  if (!DB) return;
  const hash = location.hash || "#/";
  tabs.querySelectorAll("a").forEach((a) =>
    a.classList.toggle("on", a.dataset.tab === (
      hash.startsWith("#/chart") ? "chart" :
      hash.startsWith("#/guides") ? "guides" :
      hash.startsWith("#/fav") ? "fav" : "recipes"
    )));

  const m = hash.match(/^#\/r\/(.+)$/);
  if (m) { pageDetail(decodeURIComponent(m[1])); return; }
  if (hash.startsWith("#/chart")) { pageChart(); return; }
  if (hash.startsWith("#/guides")) { pageGuides(); return; }
  if (hash.startsWith("#/fav")) { pageFav(); return; }
  pagePick();
}

addEventListener("hashchange", route);

fetch("data.json")
  .then((r) => r.json())
  .then((d) => { DB = d; route(); })
  .catch(() => { paint(`<p class="empty">Could not load recipe data.</p>`); });

})();
