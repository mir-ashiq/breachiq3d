/* BreachIQ 3D — Tactical Scouting Console
   Cloud9 × JetBrains Sky's The Limit 2026 (Category 1 VALORANT Tactical Scouting)
   Engineered for zero-disk streaming, 3D spatial trajectory projection, and anti-strat coaching.
   Supports offline demo mode (demo-data.json) and live REST telemetry backend.
*/
"use strict";

const $ = (id) => document.getElementById(id);
const API = window.location.origin;
const DEMO = new URLSearchParams(location.search).has("demo")
  || location.hostname.endsWith("github.io");
let DEMO_DATA = null;

// Tactical spatial zone calibration
const ZONES = {
  a: [0.05, 0.05, 0.45, 0.45],
  b: [0.55, 0.05, 0.95, 0.45],
  c: [0.3, 0.55, 0.7, 0.95],
  mid: [0.45, 0.35, 0.6, 0.65]
};

// Tactical ability taxonomy & layer controls
const layers = { placeable: true, recon: true, smoke: true, stall: true, flash: false };
const CLASS_COLORS = {
  placeable: "#ffd166", // yellow
  recon: "#38bdf8",     // C9 light blue
  smoke: "#a78bfa",     // purple
  stall: "#f43f5e",     // rose/coral
  flash: "#fb923c",     // orange
  other: "#94a3b8"      // slate gray
};

let currentAtlas = null;
let currentLineups = [];
let interactivePoints = []; // cached for canvas hover inspection

/* ---------------- Onboarding Modal ---------------- */
function showOnboarding(force) {
  const seen = localStorage.getItem("breachiq-onboarded-v2");
  if (force || !seen) $("onboarding").classList.remove("hidden");
}

function hideOnboarding() {
  $("onboarding").classList.add("hidden");
  localStorage.setItem("breachiq-onboarded-v2", "1");
}

/* ---------------- Network & Data Fetching ---------------- */
async function get(path) {
  if (DEMO) return demoRoute(path);
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

function demoRoute(path) {
  const url = new URL(path, "http://x");
  const map = url.searchParams.get("map");
  if (path.startsWith("/api/meta")) return DEMO_DATA.meta;
  if (path.startsWith("/api/atlas")) {
    if (!(map in DEMO_DATA.atlas)) throw new Error(`unknown map: ${map}`);
    return DEMO_DATA.atlas[map];
  }
  if (path.startsWith("/api/operator")) return DEMO_DATA.operator;
  if (path.startsWith("/api/pacing")) return DEMO_DATA.pacing;
  if (path.startsWith("/api/lineups")) return DEMO_DATA.lineups;
  throw new Error(`no demo route for ${path}`);
}

function setState(el, kind, msg) {
  el.innerHTML = `<div class="state ${kind === "error" ? "error" : ""}">${msg}</div>`;
}

/* ---------------- Minimap 2D & 3D Trajectory Renderer ---------------- */
function heatColor(t) {
  const scale = getComputedStyle(document.documentElement);
  const tiers = ["--heat-1", "--heat-2", "--heat-3", "--heat-4"];
  return scale.getPropertyValue(tiers[Math.min(3, Math.floor(t * 4))]).trim();
}

function drawTacticalGrid(ctx, w, h) {
  ctx.strokeStyle = "#131c2a";
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawMinimap(atlas, lineups) {
  const canvas = $("minimap");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  interactivePoints = [];

  ctx.clearRect(0, 0, w, h);

  // Background radar aesthetic
  const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 1.4);
  bgGrad.addColorStop(0, "#0c1421");
  bgGrad.addColorStop(1, "#05080e");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Tactical coordinate grid
  drawTacticalGrid(ctx, w, h);

  const showTrajectories = $("toggle-trajectories") ? $("toggle-trajectories").checked : true;
  const showZones = $("toggle-zones") ? $("toggle-zones").checked : true;
  const selectedAbility = $("f-ability") ? $("f-ability").value : "all";

  // 1. Zone Density Heatmap
  if (showZones && atlas.abilities && atlas.abilities.length) {
    const maxCount = Math.max(1, ...atlas.abilities.flatMap(a => Object.values(a.zones)));
    for (const ability of atlas.abilities) {
      if (!layers[ability.class]) continue;
      if (selectedAbility !== "all" && ability.ability !== selectedAbility) continue;

      for (const [zone, count] of Object.entries(ability.zones)) {
        const [x0, y0, x1, y1] = ZONES[zone] || ZONES.mid;
        const t = count / maxCount;
        ctx.fillStyle = heatColor(t);
        ctx.globalAlpha = 0.18 + 0.5 * t;
        ctx.fillRect(x0 * w, y0 * h, (x1 - x0) * w, (y1 - y0) * h);

        ctx.globalAlpha = 1;
        ctx.fillStyle = "#e6edf3";
        ctx.font = "bold 11px 'JetBrains Mono', monospace";
        ctx.fillText(`${zone.toUpperCase()} · ${count}`, x0 * w + 8, y0 * h + 20);
      }
    }
  }

  // Zone bounding outlines
  ctx.strokeStyle = "#1e2e46";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  for (const [zName, [x0, y0, x1, y1]] of Object.entries(ZONES)) {
    ctx.strokeRect(x0 * w, y0 * h, (x1 - x0) * w, (y1 - y0) * h);
  }
  ctx.setLineDash([]);

  // 2. Trajectories & Landing Estimates
  const points = atlas.points || [];
  for (const p of points) {
    if (layers[p.class] === false) continue;
    if (selectedAbility !== "all" && p.ability !== selectedAbility) continue;

    const endX = p.u * w;
    const endY = p.v * h;
    const hasOrigin = p.u0 !== undefined && p.v0 !== undefined;
    const startX = hasOrigin ? p.u0 * w : endX;
    const startY = hasOrigin ? p.v0 * h : endY;

    // Cache interactive point for hover/tooltip
    interactivePoints.push({
      x: endX,
      y: endY,
      radius: 8,
      data: p
    });

    // Draw 3D Trajectory arc from caster position to landing estimate
    if (showTrajectories && hasOrigin && (startX !== endX || startY !== endY)) {
      ctx.beginPath();
      ctx.moveTo(startX, startY);

      // Parabolic flight arc midpoint elevation based on pitch
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const pitchOffset = (p.pitch || 25) * 1.5;
      const ctrlX = midX;
      const ctrlY = midY - Math.abs(pitchOffset);

      ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
      ctx.strokeStyle = CLASS_COLORS[p.class] || CLASS_COLORS.other;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.45;
      ctx.stroke();

      // Caster origin point (small ring)
      ctx.beginPath();
      ctx.arc(startX, startY, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.8;
      ctx.fill();

      // Azimuth aim cone tick
      if (p.azimuth !== undefined && p.azimuth !== null) {
        const rad = (p.azimuth * Math.PI) / 180;
        const tickLen = 14;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + Math.cos(rad) * tickLen, startY - Math.sin(rad) * tickLen);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // Impact / Landing point (estimate)
    ctx.beginPath();
    ctx.arc(endX, endY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = CLASS_COLORS[p.class] || CLASS_COLORS.other;
    ctx.globalAlpha = 0.7 + 0.3 * (p.confidence ?? 1);
    ctx.fill();

    ctx.strokeStyle = "#0d131d";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 3. Repeated Lineups (Highlighted with gold star & target reticle)
  const mapSelected = atlas.map_selected;
  for (const l of (lineups || []).filter(item => item.map === mapSelected)) {
    if (!l.u && !l.v) continue;
    const lx = l.u * w;
    const ly = l.v * h;

    // Glowing reticle ring
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(lx, ly, 11, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair ticks
    ctx.beginPath();
    ctx.moveTo(lx - 15, ly); ctx.lineTo(lx - 12, ly);
    ctx.moveTo(lx + 12, ly); ctx.lineTo(lx + 15, ly);
    ctx.moveTo(lx, ly - 15); ctx.lineTo(lx, ly - 12);
    ctx.moveTo(lx, ly + 12); ctx.lineTo(lx, ly + 15);
    ctx.stroke();

    // Repeat count badge
    ctx.fillStyle = "#facc15";
    ctx.font = "bold 12px 'JetBrains Mono', monospace";
    ctx.fillText(`★${l.repeats}x`, lx + 14, ly - 8);

    interactivePoints.push({
      x: lx,
      y: ly,
      radius: 14,
      data: {
        ability: l.ability,
        isLineup: true,
        repeats: l.repeats,
        aim: l.aim_azimuth_deg,
        confidence: l.avg_confidence
      }
    });
  }
}

/* ---------------- Canvas Interactive Tooltip ---------------- */
function setupCanvasInteractions() {
  const canvas = $("minimap");
  const tooltip = $("canvas-tooltip");

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    // Find closest hovered point
    const hit = interactivePoints.find(p => {
      const dx = p.x - mouseX;
      const dy = p.y - mouseY;
      return Math.sqrt(dx * dx + dy * dy) <= p.radius + 6;
    });

    if (hit) {
      const d = hit.data;
      if (d.isLineup) {
        tooltip.innerHTML = `
          <div><b>REPEATED LINEUP: ${d.ability}</b></div>
          <div>Observed in <b>${d.repeats} rounds</b></div>
          <div>Aim Azimuth: <b>${d.aim}°</b> · Confidence: <b>${Math.round(d.confidence * 100)}%</b></div>
          <div style="color:var(--accent-2); font-size:10px; margin-top:4px;">★ High pre-aim & exploit priority</div>
        `;
      } else {
        tooltip.innerHTML = `
          <div><b>${d.ability}</b> <span style="color:var(--text-dim)">(${d.class || 'utility'})</span></div>
          <div>Caster: <b>${d.player || 'Unknown'}</b> · Rnd <b>#${d.round ?? 'N/A'}</b></div>
          ${d.azimuth !== null && d.azimuth !== undefined ? `<div>Aim Azimuth: <b>${d.azimuth}°</b> · Pitch: <b>${d.pitch}°</b></div>` : ''}
          <div>Data Quality: <b>${d.quality}</b> · Confidence: <b>${Math.round((d.confidence ?? 1) * 100)}%</b></div>
          <div style="color:var(--text-dim); font-size:9px;">[Raycast Impact Estimate]</div>
        `;
      }
      tooltip.style.left = `${e.clientX - rect.left + 12}px`;
      tooltip.style.top = `${e.clientY - rect.top + 12}px`;
      tooltip.classList.remove("hidden");
    } else {
      tooltip.classList.add("hidden");
    }
  });

  canvas.addEventListener("mouseleave", () => {
    tooltip.classList.add("hidden");
  });
}

/* ---------------- Evidence Bar Metric Renderer ---------------- */
function renderEvidence(atlas) {
  const top = atlas.abilities ? atlas.abilities[0] : null;
  const ev = top ? top.evidence : {};
  const quality = Object.entries(ev.quality_mix || {})
    .map(([k, v]) => `${k}:${v}`).join(", ") || "nominal";

  $("evidence").innerHTML = `
    <div class="ev-metric">
      <span class="ev-label">Top Utility Frequency</span>
      <span class="ev-val highlight">${top ? top.hard_count : "—"}</span>
    </div>
    <div class="ev-metric">
      <span class="ev-label">Sample Rounds</span>
      <span class="ev-val">${ev.rounds ?? "—"}</span>
    </div>
    <div class="ev-metric">
      <span class="ev-label">Scouted Matches</span>
      <span class="ev-val">${ev.matches ?? "—"}</span>
    </div>
    <div class="ev-metric">
      <span class="ev-label">Tournament Patch</span>
      <span class="ev-val">${ev.patch || "11.08"}</span>
    </div>
    <div class="ev-metric">
      <span class="ev-label">Frame Quality Mix</span>
      <span class="ev-val">${quality}</span>
    </div>
    <div class="ev-metric">
      <span class="ev-label">Telemetry Coverage</span>
      <span class="ev-val">${ev.coverage || "GRID Verified"}</span>
    </div>
  `;
}

/* ---------------- Atlas Data Loader ---------------- */
async function loadAtlas() {
  try {
    const map = $("f-map").value || "split";
    const [atlas, lineupsData] = await Promise.all([
      get(`/api/atlas?map=${encodeURIComponent(map)}`),
      get("/api/lineups").catch(() => ({ lineups: [] })),
    ]);

    atlas.map_selected = map;
    currentAtlas = atlas;
    currentLineups = lineupsData.lineups || [];

    // Populate ability filter options dynamically
    updateAbilityFilterOptions(atlas);

    if (!atlas.abilities.length && !(atlas.points || []).length) {
      setState($("evidence"), "empty", "No utility casts match current spatial filters");
      return;
    }

    drawMinimap(atlas, currentLineups);
    renderEvidence(atlas);
    $("map-note").textContent = `${atlas.rounds} rounds analyzed · Map: ${map.toUpperCase()}`;
  } catch (err) {
    setState($("evidence"), "error", `Failed to load spatial atlas: ${err.message}`);
  }
}

function updateAbilityFilterOptions(atlas) {
  const select = $("f-ability");
  const currentVal = select.value;
  const abilities = Array.from(new Set((atlas.abilities || []).map(a => a.ability)));
  
  select.innerHTML = `<option value="all">ALL ABILITIES</option>` +
    abilities.map(a => `<option value="${a}" ${a === currentVal ? "selected" : ""}>${a.toUpperCase()}</option>`).join("");
}

/* ---------------- Operator / Odin Fingerprint ---------------- */
async function loadOperator() {
  const el = $("operator");
  try {
    const op = await get("/api/operator");
    if (!op.players || !op.players.length) {
      setState(el, "empty", "No heavy weapon / operator telemetry in range");
      return;
    }
    const buyers = op.players.filter(p => p.operator_buys > 0);
    if (!buyers.length) {
      el.innerHTML = `<div class="state">Zero Operator purchases detected in this match corpus</div>`;
      return;
    }

    el.innerHTML = buyers.map(p => `
      <div class="row">
        <div class="row-primary">
          <span class="row-title">${p.player} <span style="color:var(--text-dim)">(${p.agent.toUpperCase()})</span></span>
          <span class="row-sub">Hold Windows: 0-20s: ${p.hold_timing["0-20s"]}x · 20-40s: ${p.hold_timing["20-40s"]}x</span>
        </div>
        <div class="row-stats">
          <span class="stat-pill buy">${p.buy_rate} Buy Rate</span>
        </div>
      </div>
    `).join("");
  } catch (err) {
    setState(el, "error", `Failed to load operator metrics: ${err.message}`);
  }
}

/* ---------------- Repeated Lineups ---------------- */
async function loadLineups() {
  const el = $("lineups");
  try {
    const data = await get("/api/lineups");
    const rows = data.lineups || [];
    if (!rows.length) {
      setState(el, "empty", "No lineup reached the strict 3-round repeat threshold");
      return;
    }

    el.innerHTML = rows.slice(0, 10).map(l => `
      <div class="row">
        <div class="row-primary">
          <span class="row-title">${l.ability.toUpperCase()} <span style="color:var(--text-dim)">· ${l.map.toUpperCase()}</span></span>
          <span class="row-sub">Aim Azimuth: <b>${l.aim_azimuth_deg}°</b> · Confidence: <b>${Math.round(l.avg_confidence * 100)}%</b></span>
        </div>
        <div class="row-stats">
          <span class="stat-pill buy">★ ${l.repeats} ROUNDS REPEATED</span>
        </div>
      </div>
    `).join("");
  } catch (err) {
    setState(el, "error", `Failed to load repeated lineups: ${err.message}`);
  }
}

/* ---------------- Site-Execute Pacing & Economy ---------------- */
async function loadPacing() {
  const el = $("pacing");
  try {
    const data = await get("/api/pacing");
    const sites = Object.entries(data.sites || {});
    if (!sites.length) {
      setState(el, "empty", "No site execute telemetry available");
      return;
    }

    el.innerHTML = sites.map(([site, s]) => {
      const ecoDeaths = Object.entries(s.eco_first_death_zones || {})
        .map(([z, n]) => `${z} (${n}x)`).join(", ") || "None recorded";

      return `
        <div class="row">
          <div class="row-primary">
            <span class="row-title">${site.toUpperCase()} SITE EXECUTE</span>
            <span class="row-sub">Analyzed across ${s.rounds} rounds · Eco First-Death Chokepoints: <b style="color:var(--text)">${ecoDeaths}</b></span>
          </div>
          <div class="row-stats">
            <span class="stat-pill accent">Median Plant: ${s.median_utility_to_plant_s}s</span>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    setState(el, "error", `Failed to load execute pacing: ${err.message}`);
  }
}

/* ---------------- Tactical Counter-Brief (Anti-Strat) ---------------- */
async function loadCues() {
  const el = $("cues");
  try {
    const [atlas, op] = await Promise.all([
      get(`/api/atlas?map=${encodeURIComponent($("f-map").value || "split")}`),
      get("/api/operator")
    ]);

    const cues = [];
    if (atlas.abilities && atlas.abilities[0]) {
      cues.push(`Heavy ${atlas.abilities[0].ability.toUpperCase()} utility concentration detected (${atlas.abilities[0].hard_count}). Deploy denial utility or delayed execute against that line.`);
    }
    if (op.players && op.players[0] && op.players[0].operator_buys > 0) {
      cues.push(`${op.players[0].player} (${op.players[0].agent.toUpperCase()}) holds primary Operator buy priority (${op.players[0].buy_rate}). Bait opening sniper angle with jump-peek; trade within 1.2s.`);
    }
    cues.push("Execute Self-Scout anti-strat review: ensure team defaults rotate away from highest utility clusters.");

    el.innerHTML = cues.map(c => `<div class="cue">${c}</div>`).join("");
  } catch (err) {
    setState(el, "error", `Failed to generate counter-brief: ${err.message}`);
  }
}

/* ---------------- Ability Taxonomy Layer Toggles ---------------- */
function renderToggles() {
  $("layer-toggles").innerHTML = Object.keys(layers).map(k => `
    <button class="toggle-btn ${layers[k] ? "on" : ""}" data-layer="${k}">
      ${k}
    </button>
  `).join("");

  document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const layer = btn.dataset.layer;
      layers[layer] = !layers[layer];
      renderToggles();
      if (currentAtlas) drawMinimap(currentAtlas, currentLineups);
    });
  });
}

/* ---------------- Core Boot & Event Listeners ---------------- */
async function loadAll() {
  await Promise.all([loadAtlas(), loadOperator(), loadLineups(), loadPacing(), loadCues()]);
}

async function boot() {
  if (DEMO) {
    $("demo-banner").classList.remove("hidden");
    $("live-indicator").innerHTML = `<span class="live-dot" style="background:var(--accent-2)"></span><span class="live-text">OFFLINE DEMO</span>`;
    $("btn-brief").disabled = true;
    try {
      const res = await fetch("demo-data.json");
      DEMO_DATA = await res.json();
    } catch (err) {
      setState($("evidence"), "error", `Demo data bundle failed to load: ${err.message}`);
      return;
    }
  } else {
    $("live-indicator").innerHTML = `<span class="live-dot"></span><span class="live-text">API STREAM LIVE</span>`;
  }

  // Populate map selection options
  try {
    const meta = await get("/api/meta");
    $("f-map").innerHTML = (meta.maps || ["split", "ascent", "bind", "haven"])
      .map(m => `<option value="${m}">${m.toUpperCase()}</option>`).join("");
  } catch (err) {
    setState($("evidence"), "error", `API unreachable: ${err.message}`);
  }

  renderToggles();
  setupCanvasInteractions();

  // Filter change handlers
  $("f-map").addEventListener("change", () => { loadAtlas(); loadCues(); });
  $("f-ability").addEventListener("change", () => {
    if (currentAtlas) drawMinimap(currentAtlas, currentLineups);
  });
  $("toggle-trajectories").addEventListener("change", () => {
    if (currentAtlas) drawMinimap(currentAtlas, currentLineups);
  });
  $("toggle-zones").addEventListener("change", () => {
    if (currentAtlas) drawMinimap(currentAtlas, currentLineups);
  });

  // Buttons
  $("btn-refresh").addEventListener("click", loadAll);
  $("btn-brief").addEventListener("click", () => {
    const map = $("f-map").value || "split";
    window.open(`${API}/api/brief.pdf?map=${encodeURIComponent(map)}`, "_blank");
  });
  $("btn-help").addEventListener("click", () => showOnboarding(true));
  $("btn-close-onboarding").addEventListener("click", hideOnboarding);
  $("btn-start").addEventListener("click", hideOnboarding);

  showOnboarding();
  await loadAll();

  // Auto-poll in live API mode every 30s
  if (!DEMO) setInterval(loadAll, 30000);
}

/* ---------------- Global Keyboard Shortcuts ---------------- */
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  const k = e.key.toLowerCase();
  if (k === "r") loadAll();
  else if (k === "?") showOnboarding(true);
  else if (k === "b" && !DEMO) {
    const map = $("f-map").value || "split";
    window.open(`${API}/api/brief.pdf?map=${encodeURIComponent(map)}`, "_blank");
  }
  else if (k === "1") document.getElementById("map-card").scrollIntoView({ behavior: "smooth" });
  else if (k === "2") document.getElementById("operator-card").scrollIntoView({ behavior: "smooth" });
  else if (k === "3") document.getElementById("pacing-card").scrollIntoView({ behavior: "smooth" });
});

boot();
