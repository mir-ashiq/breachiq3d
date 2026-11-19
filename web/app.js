/* BreachIQ 3D dashboard — no build step, no framework, works offline.
   Views: 1 atlas / 2 operator / 3 pacing; keyboard shortcut map in the
   onboarding tour. Polls every 30s so data never looks stale. */
"use strict";

const $ = (id) => document.getElementById(id);
const API = window.location.origin;
const ZONES = { a: [0.05, 0.05, 0.45, 0.45], b: [0.55, 0.05, 0.95, 0.45],
                c: [0.3, 0.55, 0.7, 0.95], mid: [0.45, 0.35, 0.6, 0.65] };
const layers = { placeable: true, recon: true, smoke: true, stall: true, flash: false };

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
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
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

function drawMinimap(atlas) {
  const canvas = $("minimap"), ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0a0e14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // zone blocks + hard counts
  const maxCount = Math.max(1, ...atlas.abilities.flatMap(a => Object.values(a.zones)));
  for (const ability of atlas.abilities) {
    if (!layers[ability.class]) continue;  // layer toggles: progressive disclosure
    for (const [zone, count] of Object.entries(ability.zones)) {
      const [x0, y0, x1, y1] = ZONES[zone] || ZONES.mid;
      const t = count / maxCount;
      ctx.fillStyle = heatColor(t);
      ctx.globalAlpha = 0.28 + 0.6 * t;
      ctx.fillRect(x0 * canvas.width, y0 * canvas.height,
                   (x1 - x0) * canvas.width, (y1 - y0) * canvas.height);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e6edf3";
      ctx.font = "12px monospace";
      ctx.fillText(`${ability.ability} ${count}`, x0 * canvas.width + 6, y0 * canvas.height + 16);
    }
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
  const quality = Object.entries(ev.quality_mix || {})
    .map(([k, v]) => `${k}: ${v}`).join(", ") || "—";
  $("evidence").innerHTML = [
    `<span>hard count <b>${top ? top.hard_count : "—"}</b></span>`,
    `<span>rounds <b>${ev.rounds ?? "—"}</b></span>`,
    `<span>matches <b>${ev.matches ?? "—"}</b></span>`,
    `<span>patch <b>${ev.patch || "—"}</b></span>`,
    `<span>data quality <b>${quality}</b></span>`,
    `<span>coverage <b>${ev.coverage || "—"}</b></span>`,
  ].join("");
}

async function loadAtlas() {
  const el = $("map-card");
  try {
    const map = $("f-map").value || "split";
    const atlas = await get(`/api/atlas?map=${encodeURIComponent(map)}`);
    if (!atlas.abilities.length) {
      setState($("evidence"), "empty", "no casts match these filters");
      return;
    }
    drawMinimap(atlas);
    renderEvidence(atlas);
    $("map-note").textContent = `${atlas.rounds} rounds · ${map}`;
  } catch (err) {
    setState($("evidence"), "error", `failed to load atlas: ${err.message}`);
  }
}

/* ---------------- operator fingerprint ---------------- */
async function loadOperator() {
  const el = $("operator");
  try {
    const op = await get("/api/operator");
    if (!op.players.length) { setState(el, "empty", "no operator data in range"); return; }
    el.innerHTML = op.players.map(p => `
      <div class="row">
        <span>${p.player} <span style="color:var(--text-dim)">(${p.agent})</span></span>
        <span class="count buy">${p.buy_rate}</span>
        <span class="count">0-20s: ${p.hold_timing["0-20s"]} · 20-40s: ${p.hold_timing["20-40s"]}</span>
      </div>`).join("");
  } catch (err) {
    setState(el, "error", `failed to load operator data: ${err.message}`);
  }
}

/* ---------------- pacing ---------------- */
async function loadPacing() {
  const el = $("pacing");
  try {
    const data = await get("/api/pacing");
    const sites = Object.entries(data.sites);
    if (!sites.length) { setState(el, "empty", "no pacing data in range"); return; }
    el.innerHTML = sites.map(([site, s]) => `
      <div class="row">
        <span>${site.toUpperCase()} site · ${s.rounds} rounds</span>
        <span class="count">utility→plant median ${s.median_utility_to_plant_s}s</span>
        <span class="count buy">eco collapses: ${
          Object.entries(s.eco_first_death_zones).map(([z, n]) => `${z} ×${n}`).join(", ") || "—"}</span>
      </div>`).join("");
  } catch (err) {
    setState(el, "error", `failed to load pacing: ${err.message}`);
  }
}

/* ---------------- counter-brief ---------------- */
async function loadCues() {
  const el = $("cues");
  try {
    const [atlas, op] = await Promise.all([
      get(`/api/atlas?map=${encodeURIComponent($("f-map").value || "split")}`),
      get("/api/operator")]);
    const cues = [
      atlas.abilities[0] ? `Expect ${atlas.abilities[0].ability} focus (${atlas.abilities[0].hard_count}); prepare denial utility for that line.` : "no utility data",
      op.players[0] ? `${op.players[0].player} buys Operator ${op.players[0].buy_rate}; bait the first shot and trade.` : "no operator data",
      "Run Self-Scout before the match: your own top zone is what their staff prepares against.",
    ];
    el.innerHTML = cues.map(c => `<div class="cue">${c}</div>`).join("");
  } catch (err) {
    setState(el, "error", `failed to load counter-brief: ${err.message}`);
  }
}

/* ---------------- layer toggles ---------------- */
function renderToggles() {
  $("layer-toggles").innerHTML = Object.keys(layers).map(k =>
    `<button class="toggle-btn ${layers[k] ? "on" : ""}" data-layer="${k}">${k}</button>`).join("");
  document.querySelectorAll(".toggle-btn").forEach(btn =>
    btn.addEventListener("click", () => { layers[btn.dataset.layer] = !layers[btn.dataset.layer]; renderToggles(); loadAtlas(); }));
}

/* ---------------- boot, polling, shortcuts ---------------- */
async function loadAll() { await Promise.all([loadAtlas(), loadOperator(), loadPacing(), loadCues()]); }

async function boot() {
  // maps come from meta (SYNTHETIC demo corpus)
  try {
    const meta = await get("/api/meta");
    $("f-map").innerHTML = meta.maps.map(m => `<option>${m}</option>`).join("");
  } catch (err) {
    setState($("evidence"), "error", `API unreachable: ${err.message}`);
  }
  renderToggles();
  $("f-map").addEventListener("change", () => { loadAtlas(); loadCues(); });
  $("btn-refresh").addEventListener("click", loadAll);
  $("btn-brief").addEventListener("click", () => window.open(
    `${API}/api/brief.pdf?map=${encodeURIComponent($("f-map").value || "split")}`, "_blank"));
  $("btn-start").addEventListener("click", hideOnboarding);
  showOnboarding();
  await loadAll();
  // poll: data stays fresh without manual refresh
  setInterval(loadAll, 30000);
}

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  const k = e.key.toLowerCase();
  if (k === "r") loadAll();
  else if (k === "?") showOnboarding(true);
  else if (k === "b") window.open(`${API}/api/brief.pdf?map=${encodeURIComponent($("f-map").value || "split")}`, "_blank");
  else if (k === "1") document.getElementById("map-card").scrollIntoView({ behavior: "smooth" });
  else if (k === "2") document.getElementById("operator").scrollIntoView({ behavior: "smooth" });
  else if (k === "3") document.getElementById("pacing").scrollIntoView({ behavior: "smooth" });
});

boot();
