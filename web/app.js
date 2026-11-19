/* BreachIQ 3D dashboard — no build step, no framework, works offline.
   Views: 1 atlas / 2 operator / 3 pacing; keyboard shortcuts in the
   onboarding tour. In API mode it polls every 30s. In demo mode
   (GitHub Pages or ?demo=1) it renders the REAL-aggregate snapshot built
   by scripts/build_findings.py from the official GRID corpus (license:
   aggregate results only, no raw data). Side and ability filters work
   in BOTH modes. */
"use strict";

const $ = (id) => document.getElementById(id);
const API = window.location.origin;
const DEMO = new URLSearchParams(location.search).has("demo")
  || location.hostname.endsWith("github.io");
let DEMO_DATA = null;

const ZONES = { a: [0.05, 0.05, 0.45, 0.45], b: [0.55, 0.05, 0.95, 0.45],
                c: [0.3, 0.55, 0.7, 0.95], mid: [0.45, 0.35, 0.6, 0.65] };
const layers = { placeable: true, recon: true, smoke: true, stall: true, flash: false };
const CLASS_COLORS = { placeable: "#ffd166", recon: "#8ecae6", smoke: "#a78bfa",
                       stall: "#f28482", flash: "#f95738", other: "#9aa5b1" };

/* ---------------- onboarding (60-second cold start) ---------------- */
function showOnboarding(force) {
  const seen = localStorage.getItem("breachiq-onboarded");
  if (force || !seen) $("onboarding").classList.remove("hidden");
}
function hideOnboarding() {
  $("onboarding").classList.add("hidden");
  localStorage.setItem("breachiq-onboarded", "1");
}

/* ---------------- fetch with error/empty states ---------------- */
async function get(path) {
  if (DEMO) return demoRoute(path);
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}
function demoRoute(path) {
  const url = new URL(path, "http://x");
  const map = url.searchParams.get("map") || "lotus";
  const side = url.searchParams.get("side") || "all";
  const ability = url.searchParams.get("ability") || "";
  if (path.startsWith("/api/meta")) return DEMO_DATA.meta;
  if (path.startsWith("/api/atlas")) {
    const m = DEMO_DATA.atlas[map];
    if (!m) throw new Error(`unknown map: ${map}`);
    const s = m.sides[side] || m.sides.all;
    const abilities = ability
      ? s.abilities.filter(a => a.ability === ability) : s.abilities;
    return { ...s, abilities, map_selected: map, rounds: m.rounds,
             coverage: s.abilities[0]?.evidence?.coverage || "" };
  }
  if (path.startsWith("/api/operator")) return DEMO_DATA.operator;
  if (path.startsWith("/api/pacing")) return DEMO_DATA.pacing;
  if (path.startsWith("/api/lineups")) return DEMO_DATA.lineups;
  throw new Error(`no demo route for ${path}`);
}
function setState(el, kind, msg) {
  el.innerHTML = `<div class="state ${kind === "error" ? "error" : ""}">${msg}</div>`;
}

/* ---------------- atlas + minimap ---------------- */
function heatColor(t) {
  const scale = getComputedStyle(document.documentElement);
  const tiers = ["--heat-1", "--heat-2", "--heat-3", "--heat-4"];
  return scale.getPropertyValue(tiers[Math.min(3, Math.floor(t * 4))]).trim();
}

function atlasQuery() {
  const map = $("f-map").value || "lotus";
  const side = $("f-side").value || "all";
  const ability = $("f-ability").value || "";
  return `/api/atlas?map=${encodeURIComponent(map)}&side=${encodeURIComponent(side)}`
       + (ability ? `&ability=${encodeURIComponent(ability)}` : "");
}

function drawMinimap(atlas, lineups) {
  const canvas = $("minimap"), ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0a0e14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const map = atlas.map_selected;
  // cast-density heat (real aggregate 2D histogram of cast positions)
  const dens = atlas.density || [];
  const maxD = Math.max(1, ...dens.map(d => d[2]));
  const cell = canvas.width / 40;
  for (const [u, v, n] of dens) {
    ctx.fillStyle = heatColor(n / maxD);
    ctx.globalAlpha = 0.25 + 0.55 * (n / maxD);
    ctx.fillRect(u * canvas.width - cell / 2, v * canvas.height - cell / 2,
                 cell, cell);
  }
  ctx.globalAlpha = 1;
  // zone blocks + hard counts (filtered by ability + layer toggles)
  const shown = atlas.abilities.filter(a => layers[a.class] !== false);
  const maxCount = Math.max(1, ...shown.flatMap(a => Object.values(a.zones)));
  for (const ability of shown) {
    for (const [zone, count] of Object.entries(ability.zones)) {
      const [x0, y0, x1, y1] = ZONES[zone] || ZONES.mid;
      const t = count / maxCount;
      ctx.strokeStyle = CLASS_COLORS[ability.class] || CLASS_COLORS.other;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 + 0.4 * t;
      ctx.strokeRect(x0 * canvas.width, y0 * canvas.height,
                     (x1 - x0) * canvas.width, (y1 - y0) * canvas.height);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e6edf3";
      ctx.font = "12px monospace";
      ctx.fillText(`${ability.ability} ${count}`,
                   x0 * canvas.width + 6, y0 * canvas.height + 16);
    }
  }
  // repeated lineups on this map: star + repeat count (respects ability filter)
  const abilityFilter = $("f-ability").value;
  for (const l of (lineups || []).filter(l => l.map === map)) {
    if (abilityFilter && l.ability !== abilityFilter) continue;
    if (l.u == null) continue;
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(l.u * canvas.width, l.v * canvas.height, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 14px monospace";
    ctx.fillText(`★${l.repeats}`, l.u * canvas.width + 13, l.v * canvas.height - 9);
  }
  ctx.strokeStyle = "#2a3547";
  for (const [x0, y0, x1, y1] of Object.values(ZONES)) {
    ctx.strokeRect(x0 * canvas.width, y0 * canvas.height,
                   (x1 - x0) * canvas.width, (y1 - y0) * canvas.height);
  }
}

function renderEvidence(atlas) {
  const top = atlas.abilities[0];
  const ev = top ? top.evidence : {};
  const cov = DEMO ? DEMO_DATA.coverage : null;
  const quality = cov
    ? `ok ${Math.round((cov.ok_rate || 0) * 100)}% of ${cov.casts} casts`
    : (Object.entries(ev.quality_mix || {})
        .map(([k, v]) => `${k}: ${v}`).join(", ") || "—");
  const rows = [
    `<span>hard count <b>${top ? top.hard_count : "—"}</b></span>`,
    `<span>rounds <b>${ev.rounds ?? atlas.rounds ?? "—"}</b></span>`,
    `<span>patches <b>${cov ? (cov.patches.slice(0, 4).join(", ") || "—") : (ev.patch || "—")}</b></span>`,
    `<span>data quality <b>${quality}</b></span>`,
  ];
  if (cov) {
    rows.push(`<span>coverage <b>${cov.series} series · ${cov.rounds} rounds ·
               ${cov.rolled_back_games} rolled-back games dropped</b></span>`);
  } else if (ev.coverage) {
    rows.push(`<span>coverage <b>${ev.coverage}</b></span>`);
  }
  $("evidence").innerHTML = rows.join("");
}

function rebuildAbilityOptions(atlas) {
  const sel = $("f-ability"), current = sel.value;
  const names = atlas.abilities.map(a => a.ability).slice(0, 15);
  sel.innerHTML = `<option value="">all</option>` +
    names.map(n => `<option value="${n}">${n}</option>`).join("");
  if (names.includes(current)) sel.value = current;
}

async function loadAtlas() {
  try {
    const [atlas, lineupsData] = await Promise.all([
      get(atlasQuery()),
      get(`/api/lineups${DEMO ? "" : ""}`).catch(() => ({ lineups: [] })),
    ]);
    if (!atlas.abilities.length && !(atlas.density || []).length) {
      setState($("evidence"), "empty", "no casts match these filters");
      return;
    }
    rebuildAbilityOptions(atlas);
    drawMinimap(atlas, lineupsData.lineups);
    renderEvidence(atlas);
    $("map-note").textContent =
      `${atlas.rounds ?? "—"} rounds · ${$("f-map").value} · ${$("f-side").value}`;
  } catch (err) {
    setState($("evidence"), "error", `failed to load atlas: ${err.message}`);
  }
}

/* ---------------- operator fingerprint ---------------- */
async function loadOperator() {
  const el = $("operator");
  try {
    const op = await get("/api/operator");
    const rows = op.players.filter(p => p.operator_buys > 0);
    if (!rows.length) {
      setState(el, "empty", "no operator purchases in this corpus");
      return;
    }
    el.innerHTML = rows.map(p => `
      <div class="row">
        <span>${p.player} <span style="color:var(--text-dim)">(${p.agent})</span></span>
        <span class="count buy">${p.buy_rate}</span>
        <span class="count">${p.hold_positions ? p.hold_positions.length + " hold angles" : ""}</span>
      </div>`).join("")
      + (DEMO && DEMO_DATA.operator.op_rounds != null ? `
      <div class="row" style="color:var(--text-dim)">
        <span>Op rounds: ${DEMO_DATA.operator.op_rounds} · holder drew first blood
        ${DEMO_DATA.operator.op_first_kills}, died first
        ${DEMO_DATA.operator.op_holder_died_first}</span>
      </div>` : "");
  } catch (err) {
    setState(el, "error", `failed to load operator data: ${err.message}`);
  }
}

/* ---------------- lineups ---------------- */
async function loadLineups() {
  const el = $("lineups");
  try {
    const data = await get("/api/lineups");
    const rows = data.lineups || [];
    if (!rows.length) {
      setState(el, "empty", "no lineup reached the 3-round repeat threshold");
      return;
    }
    el.innerHTML = rows.slice(0, 10).map(l => `
      <div class="row">
        <span>${l.ability} <span style="color:var(--text-dim)">· ${l.map}</span></span>
        <span class="count buy">★ ${l.repeats} rounds</span>
        <span class="count">aim ${l.aim_azimuth_deg}° · conf ${l.avg_confidence}</span>
      </div>`).join("");
  } catch (err) {
    setState(el, "error", `failed to load lineups: ${err.message}`);
  }
}

/* ---------------- pacing + outcomes ---------------- */
async function loadPacing() {
  const el = $("pacing");
  try {
    const data = await get("/api/pacing");
    const sites = Object.entries(data.sites);
    if (!sites.length) { setState(el, "empty", "no pacing data in range"); return; }
    let html = sites.slice(0, 13).map(([site, s]) => `
      <div class="row">
        <span>${site.toUpperCase()} · ${s.rounds} planted attack rounds</span>
        <span class="count">utility→plant median ${s.median_utility_to_plant_s}s</span>
      </div>`).join("");
    if (DEMO && DEMO_DATA.outcomes) {
      const o = DEMO_DATA.outcomes;
      const atk = o.sides.attacker, def = o.sides.defender;
      if (atk) html += `
        <div class="row">
          <span>attack: won <b>${atk.win_rate}</b>
          ${atk.attack_no_plant ? ` · no-plant ${atk.attack_no_plant}` : ""}</span>
          <span class="count">defense: won <b>${def ? def.win_rate : "—"}</b></span>
        </div>`;
      if (o.pistol_conversion) html += `
        <div class="row">
          <span>pistol conversion (round after a won pistol)</span>
          <span class="count buy">${o.pistol_conversion}</span>
        </div>`;
    }
    el.innerHTML = html;
  } catch (err) {
    setState(el, "error", `failed to load pacing: ${err.message}`);
  }
}

/* ---------------- counter-brief ---------------- */
async function loadCues() {
  const el = $("cues");
  try {
    const [atlas, op] = await Promise.all([get(atlasQuery()), get("/api/operator")]);
    const lineups = (DEMO ? DEMO_DATA.lineups.lineups : []);
    const top = atlas.abilities[0], topL = lineups[0], opP = op.players.find(p => p.operator_buys > 0);
    const cues = [
      top ? `Expect <b>${top.ability}</b> focus (${top.hard_count}); prepare denial utility for that line.` : "no utility data",
      topL ? `Pre-aim the <b>${topL.ability}</b> lineup on ${topL.map} — they repeat it <b>${topL.repeats} rounds</b>.` : "",
      opP ? `<b>${opP.player}</b> buys the Operator ${opP.buy_rate}; bait the first shot and trade.` : "",
    ].filter(Boolean);
    el.innerHTML = cues.map(c => `<div class="cue">${c}</div>`).join("")
      || `<div class="state">no counter-brief data</div>`;
  } catch (err) {
    setState(el, "error", `failed to load counter-brief: ${err.message}`);
  }
}

/* ---------------- layer toggles ---------------- */
function renderToggles() {
  $("layer-toggles").innerHTML = Object.keys(layers).map(k =>
    `<button class="toggle-btn ${layers[k] ? "on" : ""}" data-layer="${k}">${k}</button>`).join("");
  document.querySelectorAll(".toggle-btn").forEach(btn =>
    btn.addEventListener("click", () => {
      layers[btn.dataset.layer] = !layers[btn.dataset.layer];
      renderToggles();
      loadAtlas();
    }));
}

/* ---------------- boot, polling, shortcuts ---------------- */
async function loadAll() {
  await Promise.all([loadAtlas(), loadOperator(), loadLineups(), loadPacing(), loadCues()]);
}

function setBanner() {
  if (!DEMO) return;
  const cov = DEMO_DATA.coverage;
  $("demo-banner").innerHTML = cov
    ? `<b>Real findings, live.</b> Aggregates from the official GRID corpus —
       ${cov.series} Cloud9 series (VCT Americas + Game Changers 2025–26),
       ${cov.rounds.toLocaleString()} rounds, ${cov.casts.toLocaleString()} casts,
       ${(cov.ok_rate * 100).toFixed(1)}% quality ok ·
       reproducible via <code>make findings</code> · no raw data is
       redistributed (license) · full API runs locally —
       <a href="https://github.com/mir-ashiq/breachiq3d" target="_blank" rel="noopener">README</a>`
    : `static demo`;
  $("demo-banner").classList.remove("hidden");
  $("footer-data-note").textContent =
    "live demo shows REAL corpus aggregates; the local API serves SYNTHETIC fixtures";
}

async function boot() {
  if (DEMO) {
    $("btn-brief").disabled = true;
    try {
      const res = await fetch("demo-data.json");
      DEMO_DATA = await res.json();
    } catch (err) {
      setState($("evidence"), "error", `demo data failed to load: ${err.message}`);
      return;
    }
    setBanner();
  }
  try {
    const meta = await get("/api/meta");
    const maps = meta.maps || [];
    $("f-map").innerHTML = maps.map(m => `<option>${m}</option>`).join("");
    const preferred = maps.includes("lotus") ? "lotus" : maps[0];
    if (preferred) $("f-map").value = preferred;
  } catch (err) {
    setState($("evidence"), "error", `API unreachable: ${err.message}`);
  }
  renderToggles();
  $("f-map").addEventListener("change", () => { $("f-ability").value = ""; loadAtlas(); loadCues(); });
  $("f-side").addEventListener("change", () => { loadAtlas(); loadCues(); });
  $("f-ability").addEventListener("change", () => { loadAtlas(); loadCues(); });
  $("btn-refresh").addEventListener("click", loadAll);
  $("btn-brief").addEventListener("click", () => window.open(
    `${API}/api/brief.pdf?map=${encodeURIComponent($("f-map").value || "lotus")}`, "_blank"));
  $("btn-start").addEventListener("click", hideOnboarding);
  showOnboarding();
  await loadAll();
  if (!DEMO) setInterval(loadAll, 30000);  // poll only in API mode
}

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  const k = e.key.toLowerCase();
  if (k === "r") loadAll();
  else if (k === "?") showOnboarding(true);
  else if (k === "b" && !DEMO) window.open(`${API}/api/brief.pdf?map=${encodeURIComponent($("f-map").value || "lotus")}`, "_blank");
  else if (k === "1") document.getElementById("map-card").scrollIntoView({ behavior: "smooth" });
  else if (k === "2") document.getElementById("operator").scrollIntoView({ behavior: "smooth" });
  else if (k === "3") document.getElementById("pacing").scrollIntoView({ behavior: "smooth" });
});

boot();
