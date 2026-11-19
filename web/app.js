/* BreachIQ 3D dashboard — no build step, no framework, works offline.
   Views: 1 atlas / 2 operator / 3 pacing / 4 3D trajectories. In API mode
   it polls every 30s (synthetic fixtures by default, REAL corpus
   aggregates when the server runs BREACHIQ_DATA=real). In demo mode
   (GitHub Pages or ?demo=1) it renders the committed REAL-aggregate
   snapshot built by scripts/build_findings.py (license: aggregate
   results only, no raw data). Filters work in EVERY mode. */
"use strict";

const $ = (id) => document.getElementById(id);
const API = window.location.origin;
const DEMO = new URLSearchParams(location.search).has("demo")
  || location.hostname.endsWith("github.io");
let DEMO_DATA = null;      // demo snapshot (github.io / ?demo)
let REAL_API = false;      // API serving real aggregates (BREACHIQ_DATA=real)
let COV = null;            // coverage/evidence context (demo or real API)
let META = null;
let activeLineupHover = null;
let currentMinimapPoints = [];

function setupMinimapTooltips() {
  const canvas = $("minimap");
  const tip = $("canvas-tooltip");
  if (!canvas || !tip) return;

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    // Check hit on cached lineups or points
    const hit = currentMinimapPoints.find(p => {
      const dx = p.x - mx, dy = p.y - my;
      return Math.sqrt(dx * dx + dy * dy) <= p.r + 4;
    });

    if (hit) {
      tip.innerHTML = `
        <b>${hit.label}</b>
        <span class="sub">${hit.sub || ""}</span>
        ${hit.extra ? `<div style="color:var(--accent-2);font-size:10px;margin-top:2px;">${hit.extra}</div>` : ""}
      `;
      tip.style.left = `${e.clientX - rect.left}px`;
      tip.style.top = `${e.clientY - rect.top}px`;
      tip.classList.remove("hidden");
    } else {
      tip.classList.add("hidden");
    }
  });

  canvas.addEventListener("mouseleave", () => {
    tip.classList.add("hidden");
  });
}

const ZONES = { a: [0.05, 0.05, 0.45, 0.45], b: [0.55, 0.05, 0.95, 0.45],
                c: [0.3, 0.55, 0.7, 0.95], mid: [0.45, 0.35, 0.6, 0.65] };
const ZONE_LABELS = { a: "A", b: "B", c: "C", mid: "MID" };
const layers = { placeable: true, recon: true, smoke: true, stall: true, flash: false };
const CLASS_COLORS = { placeable: "#ffd166", recon: "#8ecae6", smoke: "#a78bfa",
                       stall: "#f28482", flash: "#f95738", other: "#9aa5b1" };
const HOLD = { player: null };   // operator hold-angle overlay target

/* client-side ability class heuristic (coloring only; server taxonomy is
   authoritative in the tables) */
function abilityClass(a) {
  if (/smoke|wall|screen/.test(a)) return "smoke";
  if (/flash|stun|shock|concuss|near-sight/.test(a)) return "flash";
  if (/trap|alarm|turret|cage|sensor|spycam|tripwire/.test(a)) return "placeable";
  if (/recon|bolt|owl|drone|scan|reveal|shock/.test(a)) return "recon";
  if (/molly|slow|stall|gravitic|nanoswarm|wall/.test(a)) return "stall";
  return "other";
}

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
    return { ...s, abilities, map_selected: map,
             bounds_m: DEMO_DATA.bounds_m[map],
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
async function fetchLineups() {
  if (!lineupsCache) lineupsCache = (await get("/api/lineups")).lineups || [];
  return lineupsCache;
}

/* ---------------- URL state (shareable views) ---------------- */
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return {
    map: p.get("map"),
    side: p.get("side"),
    ability: p.get("ability"),
    player: p.get("player"),
    agent: p.get("agent")
  };
}
function writeHash() {
  const p = new URLSearchParams();
  if ($("f-map").value) p.set("map", $("f-map").value);
  if ($("f-side").value && $("f-side").value !== "all") p.set("side", $("f-side").value);
  if ($("f-player") && $("f-player").value && $("f-player").value !== "all") p.set("player", $("f-player").value);
  if ($("f-agent") && $("f-agent").value && $("f-agent").value !== "all") p.set("agent", $("f-agent").value);
  if ($("f-ability").value) p.set("ability", $("f-ability").value);
  history.replaceState(null, "", "#" + p.toString());
}

/* ---------------- atlas query + terrain ---------------- */
function atlasQuery() {
  const map = $("f-map").value || "lotus";
  const side = $("f-side").value || "all";
  const ability = $("f-ability").value || "";
  const player = $("f-player") ? $("f-player").value : "all";
  const agent = $("f-agent") ? $("f-agent").value : "all";
  let q = `/api/atlas?map=${encodeURIComponent(map)}&side=${encodeURIComponent(side)}`;
  if (ability) q += `&ability=${encodeURIComponent(ability)}`;
  if (player && player !== "all") q += `&player=${encodeURIComponent(player)}`;
  if (agent && agent !== "all") q += `&agent=${encodeURIComponent(agent)}`;
  return q;
}

function buildTerrain(atlas) {
  /* 40x40 density grid: from the aggregate histogram when present, else
     binned from the per-cast points (synthetic API mode). */
  const N = 40, grid = new Array(N * N).fill(0);
  let max = 0;
  const dens = (atlas.density && atlas.density.length)
    ? atlas.density
    : (atlas.points || []).map(p => [p.u, p.v, 1]);
  for (const [u, v, n] of dens) {
    const bx = Math.min(N - 1, Math.max(0, Math.floor(u * N)));
    const by = Math.min(N - 1, Math.max(0, Math.floor(v * N)));
    grid[by * N + bx] += n;
  }
  for (const g of grid) if (g > max) max = g;
  return { grid, max, n: N };
}

function heatColor(t) {
  const scale = getComputedStyle(document.documentElement);
  const tiers = ["--heat-1", "--heat-2", "--heat-3", "--heat-4"];
  return scale.getPropertyValue(tiers[Math.min(3, Math.floor(t * 4))]).trim();
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/* ---------------- minimap (tactical chart) ---------------- */
function drawMinimap(atlas, lineups, bounds) {
  const canvas = $("minimap"), ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a0e14";
  ctx.fillRect(0, 0, W, H);
  const map = atlas.map_selected;

  // faint 8x8 grid
  ctx.strokeStyle = "#141b26";
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath(); ctx.moveTo(W * i / 8, 0); ctx.lineTo(W * i / 8, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H * i / 8); ctx.lineTo(W, H * i / 8); ctx.stroke();
  }

  // soft cast-density heat (upscaled from the 40x40 histogram)
  const dens = atlas.density || [];
  if (dens.length) {
    const maxD = Math.max(1, ...dens.map(d => d[2]));
    const off = document.createElement("canvas");
    off.width = off.height = 40;
    const octx = off.getContext("2d");
    for (const [u, v, n] of dens) {
      octx.fillStyle = heatColor(n / maxD);
      octx.globalAlpha = 0.5 + 0.45 * (n / maxD);
      octx.fillRect(u * 40 - 1.4, v * 40 - 1.4, 2.8, 2.8);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = 0.95;
    ctx.drawImage(off, 0, 0, W, H);
    ctx.globalAlpha = 1;
  } else if ((atlas.points || []).length) {
    // synthetic API mode: per-cast landing ESTIMATES as dots
    for (const p of atlas.points) {
      ctx.fillStyle = CLASS_COLORS[p.class] || CLASS_COLORS.other;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(p.u * W, p.v * H, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // zone frames + letter badges (schematic; GRID provides no map geometry)
  const shown = atlas.abilities.filter(a => layers[a.class] !== false);
  const maxCount = Math.max(1, ...shown.flatMap(a => Object.values(a.zones)));
  for (const ability of shown) {
    for (const [zone, count] of Object.entries(ability.zones)) {
      const [x0, y0, x1, y1] = ZONES[zone] || ZONES.mid;
      const t = count / maxCount;
      ctx.strokeStyle = CLASS_COLORS[ability.class] || CLASS_COLORS.other;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.45 + 0.4 * t;
      rrect(ctx, x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H, 10);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e6edf3";
      ctx.font = "11px monospace";
      ctx.fillText(`${ability.ability} ${count}`,
                   x0 * W + 24, y0 * H + 16);
    }
  }
  for (const [zone, [x0, y0, x1, y1]] of Object.entries(ZONES)) {
    ctx.strokeStyle = "#2a3547";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    rrect(ctx, x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H, 10);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // letter badge chip
    const label = ZONE_LABELS[zone];
    ctx.font = "bold 11px monospace";
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = "#1c2533";
    rrect(ctx, x0 * W + 4, y0 * H + 4, tw, 16, 4);
    ctx.fill();
    ctx.fillStyle = "#9fb0c3";
    ctx.fillText(label, x0 * W + 9, y0 * H + 16);
  }

  // repeated lineups on this map: star + repeat count (draw position
  // clamped to the canvas; a few real casts sit just outside recorded
  // playable bounds and are kept true in the data)
  const abilityFilter = $("f-ability").value;
  currentMinimapPoints = [];
  for (const l of (lineups || []).filter(l => l.map === map)) {
    if (abilityFilter && l.ability !== abilityFilter) continue;
    if (l.u == null) continue;
    const su = Math.min(1, Math.max(0, l.u));
    const sv = Math.min(1, Math.max(0, l.v));
    const lx = su * W, ly = sv * H;
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(lx, ly, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 14px monospace";
    ctx.fillText(`★${l.repeats}`, lx + 13, ly - 9);

    currentMinimapPoints.push({
      x: lx, y: ly, r: 12,
      label: `Repeated Lineup: ${l.ability.toUpperCase()}`,
      sub: `Repeated across ${l.repeats} rounds · Aim: ${l.aim_azimuth_deg ?? "—"}°`,
      extra: `★ Exploit Target (Pre-aim)`
    });
  }

  // operator hold-angle overlay (real data: positions are map-tagged)
  let holdCount = 0;
  if (HOLD.player) {
    const op = (DEMO ? DEMO_DATA.operator : null);
    const player = op && op.players.find(p => p.player === HOLD.player);
    const positions = (player ? player.hold_positions : [])
      .filter(h => h.map === map);
    holdCount = positions.length;
    ctx.fillStyle = "#ff9ebb";
    ctx.font = "bold 11px monospace";
    positions.forEach((h, i) => {
      const x = h.u * W, y = h.v * H;
      ctx.beginPath();
      ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4);
      ctx.closePath(); ctx.fill();
      if (i === 0) ctx.fillText(`▲ ${HOLD.player}`, x + 8, y - 4);

      currentMinimapPoints.push({
        x: x, y: y, r: 8,
        label: `Operator Hold: ${HOLD.player}`,
        sub: `Sniper angle · Round hold start`,
        extra: `▲ Heavy weapon bias`
      });
    });
  }
  $("hold-note").textContent = HOLD.player
    ? ` · ▲ ${HOLD.player}: ${holdCount} hold angle${holdCount === 1 ? "" : "s"} on ${map}`
    : "";

  // compass + real meter scale bar (bounds calibrated from GRID map.bounds)
  ctx.fillStyle = "#9fb0c3";
  ctx.font = "bold 12px monospace";
  ctx.fillText("N ▲", W - 46, 22);
  ctx.strokeStyle = "#9fb0c3";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W - 39, 30); ctx.lineTo(W - 39, 44); ctx.stroke();
  if (bounds && bounds.w) {
    const mPerPx = bounds.w / W;
    const nice = [100, 50, 20, 10].find(n => n / mPerPx <= W * 0.32) || 10;
    const px = nice / mPerPx;
    const x0 = 14, y0 = H - 18;
    ctx.strokeStyle = "#e6edf3";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + px, y0);
    ctx.moveTo(x0, y0 - 5); ctx.lineTo(x0, y0 + 5);
    ctx.moveTo(x0 + px, y0 - 5); ctx.lineTo(x0 + px, y0 + 5);
    ctx.stroke();
    ctx.fillStyle = "#9fb0c3";
    ctx.font = "11px monospace";
    ctx.fillText(`${nice} m`, x0 + px / 2 - 14, y0 - 9);
  }
}

function renderEvidence(atlas) {
  const top = atlas.abilities[0];
  const ev = top ? top.evidence : {};
  const quality = COV
    ? `ok ${Math.round((COV.ok_rate || 0) * 1000) / 10}% of ${Number(COV.casts).toLocaleString()} casts`
    : (Object.entries(ev.quality_mix || {})
        .map(([k, v]) => `${k}: ${v}`).join(", ") || "—");
  const rows = [
    `<span>hard count <b>${top ? top.hard_count : "—"}</b></span>`,
    `<span>rounds <b>${ev.rounds ?? atlas.rounds ?? "—"}</b></span>`,
    `<span>patches <b>${COV ? (COV.patches.slice(0, 4).join(", ") || "—") : (ev.patch || "—")}</b></span>`,
    `<span>data quality <b>${quality}</b></span>`,
  ];
  if (COV) {
    rows.push(`<span>coverage <b>${COV.series} series · ${Number(COV.rounds).toLocaleString()} rounds ·
               ${COV.rolled_back_games} rolled-back games dropped</b></span>`);
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

function renderAtlasTable(atlas) {
  const rows = atlas.abilities.map(a => {
    const zones = Object.entries(a.zones).sort((x, y) => y[1] - x[1])
      .map(([z, c]) => `${z}×${c}`).join(", ") || "—";
    return `<tr><td>${a.ability}</td><td>${a.class}</td><td>${zones}</td><td>${a.hard_count}</td></tr>`;
  }).join("");
  $("atlas-table").innerHTML =
    `<summary>full ability table — ${atlas.abilities.length} abilities (current filters)</summary>
     <div class="tablewrap"><table>
       <thead><tr><th>ability</th><th>class</th><th>zones (casts)</th><th>hard count</th></tr></thead>
       <tbody>${rows}</tbody></table></div>`;
}

async function loadAtlas() {
  try {
    const [atlas, lineups] = await Promise.all([
      get(atlasQuery()), fetchLineups().catch(() => []),
    ]);
    if (!atlas.abilities.length && !(atlas.density || []).length && !(atlas.points || []).length) {
      setState($("evidence"), "empty", "no casts match these filters");
      return;
    }
    rebuildAbilityOptions(atlas);
    const bounds = atlas.bounds_m ||
      (DEMO ? DEMO_DATA.bounds_m[atlas.map_selected] : null) || { w: 110, h: 120 };
    drawMinimap(atlas, lineups, bounds);
    renderEvidence(atlas);
    renderAtlasTable(atlas);
    $("map-note").textContent =
      `${atlas.rounds ?? "—"} rounds · ${atlas.map_selected} · ${$("f-side").value}`;
    V3.setMap(atlas.map_selected, bounds, atlas, lineups);
    writeHash();
  } catch (err) {
    setState($("evidence"), "error", `failed to load atlas: ${err.message}`);
  }
}

/* ---------------- 3D trajectory viewer ---------------- */
const V3 = {
  yaw: 0.8, pitch: 0.42, dist: 185, auto: true, highlight: null,
  terrain: null, lineups: [], bounds: { w: 110, h: 120 }, map: "",
  visible: true, dragging: false, MAXH: 15,   // column height (m, exaggerated)

  setMap(map, bounds, atlas, lineups) {
    this.map = map;
    this.bounds = bounds;
    this.terrain = buildTerrain(atlas);
    this.lineups = (lineups || []).filter(l => l.map === map && l.trajectory);
    const canvas = $("traj3d");
    const h = Math.max(400, Math.min(660, Math.round(800 * bounds.h / bounds.w)));
    if (canvas.height !== h) canvas.height = h;
  },

  toWorld(u, v, z) {
    return [(u - 0.5) * this.bounds.w, (v - 0.5) * this.bounds.h, z];
  },
  project(x, y, z, w, h) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const x1 = x * cy - y * sy;
    const y1 = x * sy + y * cy;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const depth = y1 * cp - z * sp;
    const up = y1 * sp + z * cp;
    const d = this.dist - depth;
    if (d < 8) return null;
    const f = Math.min(w, h) * 0.92;
    return [w / 2 + x1 * f / d, h * 0.56 - up * f / d, d];
  },
};

function draw3D() {
  if (!V3.terrain) return;   // atlas not loaded yet (first frames)
  const canvas = $("traj3d"), ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a0e14";
  ctx.fillRect(0, 0, W, H);

  // ground border + grid
  ctx.lineWidth = 1;
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    for (const [a, b, horiz] of [[frac, 0, false], [0, frac, true]]) {
      const p1 = V3.project(...(horiz ? V3.toWorld(a, b, 0) : V3.toWorld(a, b, 0)));
      const p2 = V3.project(...(horiz ? V3.toWorld(a + 1 - frac || 1, b, 0)
                                      : V3.toWorld(a, b + 1 - frac || 1, 0)));
      if (!p1 || !p2) continue;
      ctx.strokeStyle = frac === 0 || frac === 1 ? "#2a3547" : "#141b26";
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
  }

  // density terrain: painter-sorted columns (height = sqrt density)
  const items = [];
  const N = V3.terrain.n, cell = 1 / N;
  for (let by = 0; by < N; by++) {
    for (let bx = 0; bx < N; bx++) {
      const n = V3.terrain.grid[by * N + bx];
      if (!n) continue;
      const t = n / V3.terrain.max;
      const hgt = V3.MAXH * Math.sqrt(t);
      const u0 = bx * cell, v0 = by * cell, u1 = u0 + cell, v1 = v0 + cell;
      const corners = [V3.toWorld(u0, v0, hgt), V3.toWorld(u1, v0, hgt),
                       V3.toWorld(u1, v1, hgt), V3.toWorld(u0, v1, hgt)]
        .map(p => V3.project(p[0], p[1], p[2], W, H));
      if (corners.some(c => !c)) continue;
      const center = V3.project(...V3.toWorld((u0 + u1) / 2, (v0 + v1) / 2, hgt), W, H);
      items.push({ depth: center[2], kind: "col", corners, t });
    }
  }

  // lineup trajectory arcs
  const abilityFilter = $("f-ability") ? $("f-ability").value : "";
  for (const l of V3.lineups) {
    if (abilityFilter && l.ability !== abilityFilter) continue;
    const pts = l.trajectory.points
      .map(p => { const pr = V3.project(...V3.toWorld(p[0], p[1], p[2]), W, H);
                  return pr; });
    if (pts.some(p => !p)) continue;
    const mid = pts[Math.floor(pts.length / 2)];
    items.push({ depth: mid[2], kind: "arc", pts, l,
                 hl: V3.highlight === `${l.ability}@${l.map}` });
  }
  items.sort((a, b) => b.depth - a.depth);

  for (const it of items) {
    if (it.kind === "col") {
      ctx.beginPath();
      ctx.moveTo(it.corners[0][0], it.corners[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(it.corners[i][0], it.corners[i][1]);
      ctx.closePath();
      ctx.fillStyle = heatColor(it.t);
      ctx.globalAlpha = 0.28 + 0.5 * it.t;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      const cls = abilityClass(it.l.ability);
      ctx.strokeStyle = it.hl ? "#ffffff" : (CLASS_COLORS[cls] || CLASS_COLORS.other);
      ctx.lineWidth = it.hl ? 4 : 2;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(it.pts[0][0], it.pts[0][1]);
      for (let i = 1; i < it.pts.length; i++) ctx.lineTo(it.pts[i][0], it.pts[i][1]);
      ctx.stroke();
      if (it.hl) {  // re-stroke colored over the white halo
        ctx.strokeStyle = CLASS_COLORS[cls] || CLASS_COLORS.other;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // cast marker + landing cross + repeat label
      const s = it.pts[0], e = it.pts[it.pts.length - 1];
      ctx.fillStyle = CLASS_COLORS[cls] || CLASS_COLORS.other;
      ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = CLASS_COLORS[cls] || CLASS_COLORS.other;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e[0] - 5, e[1] - 5); ctx.lineTo(e[0] + 5, e[1] + 5);
      ctx.moveTo(e[0] + 5, e[1] - 5); ctx.lineTo(e[0] - 5, e[1] + 5);
      ctx.stroke();
      ctx.font = "bold 12px monospace";
      ctx.fillText(`★${it.l.repeats}`, s[0] + 7, s[1] - 6);
      ctx.globalAlpha = 1;
    }
  }
}

function v3Loop() {
  if (V3.auto && V3.visible && !document.hidden) V3.yaw += 0.0035;
  draw3D();
  requestAnimationFrame(v3Loop);
}

function v3Controls() {
  const canvas = $("traj3d");
  canvas.addEventListener("pointerdown", (e) => {
    V3.dragging = true; V3.auto = false; v3AutoLabel();
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!V3.dragging) return;
    V3.yaw += e.movementX * 0.006;
    V3.pitch = Math.max(0.08, Math.min(1.30, V3.pitch + e.movementY * 0.004));
  });
  canvas.addEventListener("pointerup", () => { V3.dragging = false; });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    V3.dist = Math.max(70, Math.min(460, V3.dist * (1 + e.deltaY * 0.0012)));
  }, { passive: false });
  $("v3-auto").addEventListener("click", () => { V3.auto = !V3.auto; v3AutoLabel(); });
  $("v3-reset").addEventListener("click", () => {
    V3.yaw = 0.8; V3.pitch = 0.42; V3.dist = 185; V3.auto = false; v3AutoLabel();
  });
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    V3.auto = false;
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([en]) => { V3.visible = en.isIntersecting; },
                              { threshold: 0.05 }).observe(canvas);
  }
  v3AutoLabel();
}
function v3AutoLabel() {
  $("v3-auto").textContent = V3.auto ? "⏸ orbit" : "▶ orbit";
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
    const map = $("f-map").value;
    el.innerHTML = rows.map(p => {
      const here = (p.hold_positions || []).filter(h => h.map === map).length;
      const active = HOLD.player === p.player ? " active" : "";
      return `
      <div class="row clickable${active}" data-player="${p.player}" title="click to map hold angles">
        <span>${p.player} <span style="color:var(--text-dim)">(${p.agent})</span></span>
        <span class="count buy">${p.buy_rate}</span>
        <span class="count">${(p.hold_positions || []).length} hold angles
          ${here ? `· ${here} on ${map}` : ""}</span>
      </div>`;
    }).join("")
      + ((DEMO || REAL_API) && op.op_rounds != null ? `
      <div class="row" style="color:var(--text-dim)">
        <span>Op rounds: ${op.op_rounds} · holder drew first blood
        ${op.op_first_kills}, died first ${op.op_holder_died_first}</span>
      </div>` : "");
    el.querySelectorAll(".row.clickable").forEach(row =>
      row.addEventListener("click", () => {
        HOLD.player = HOLD.player === row.dataset.player ? null : row.dataset.player;
        loadOperator();
        loadAtlas();
      }));
  } catch (err) {
    setState(el, "error", `failed to load operator data: ${err.message}`);
  }
}

/* ---------------- lineups ---------------- */
async function loadLineups() {
  const el = $("lineups");
  try {
    const rows = await fetchLineups();
    if (!rows.length) {
      setState(el, "empty", "no lineup reached the 3-round repeat threshold");
      return;
    }
    el.innerHTML = rows.slice(0, 10).map(l => `
      <div class="row clickable" data-key="${l.ability}@${l.map}" title="click to highlight in 3D view">
        <span>${l.ability} <span style="color:var(--text-dim)">· ${l.map}</span></span>
        <span class="count buy">★ ${l.repeats} rounds</span>
        <span class="count">aim ${l.aim_azimuth_deg}° · conf ${l.avg_confidence}</span>
      </div>`).join("");
    el.querySelectorAll(".row.clickable").forEach(row =>
      row.addEventListener("click", () => {
        V3.highlight = V3.highlight === row.dataset.key ? null : row.dataset.key;
        document.getElementById("v3-card").scrollIntoView({ behavior: "smooth" });
      }));
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
    const maxMed = Math.max(1, ...sites.map(([, s]) => s.median_utility_to_plant_s));
    let html = sites.slice(0, 13).map(([site, s]) => {
      const m = s.median_utility_to_plant_s;
      return `
      <div class="row">
        <span>${site.toUpperCase()} · ${s.rounds} planted attack rounds</span>
        <span class="count">median ${m}s</span>
        <div class="pbar"><div class="pbar-fill" style="width:${(m / maxMed * 100).toFixed(1)}%"></div></div>
      </div>`;
    }).join("");
    let outcomes = null;
    if (DEMO && DEMO_DATA.outcomes) outcomes = DEMO_DATA.outcomes;
    if (outcomes) {
      const atk = outcomes.sides.attacker, def = outcomes.sides.defender;
      if (atk) html += `
        <div class="row">
          <span>attack: won <b>${atk.win_rate}</b>
          ${atk.attack_no_plant ? ` · no-plant ${atk.attack_no_plant}` : ""}</span>
          <span class="count">defense: won <b>${def ? def.win_rate : "—"}</b></span>
        </div>`;
      if (outcomes.pistol_conversion) html += `
        <div class="row">
          <span>pistol conversion (round after a won pistol)</span>
          <span class="count buy">${outcomes.pistol_conversion}</span>
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
    const [atlas, op, lineups] = await Promise.all([
      get(atlasQuery()), get("/api/operator"), fetchLineups().catch(() => []),
    ]);
    const top = atlas.abilities[0], topL = lineups[0],
          opP = op.players.find(p => p.operator_buys > 0);
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
  lineupsCache = null;
  await Promise.all([loadAtlas(), loadOperator(), loadLineups(), loadPacing(), loadCues()]);
}

function setBanner(cov) {
  $("demo-banner").innerHTML = cov
    ? `<b>Real findings, live.</b> Aggregates from the official GRID corpus —
       ${cov.series} Cloud9 series (VCT Americas + Game Changers 2025–26),
       ${Number(cov.rounds).toLocaleString()} rounds, ${Number(cov.casts).toLocaleString()} casts,
       ${(cov.ok_rate * 100).toFixed(1)}% quality ok ·
       reproducible via <code>make findings</code> · no raw data is
       redistributed (license) · full API runs locally —
       <a href="https://github.com/mir-ashiq/breachiq3d" target="_blank" rel="noopener">README</a>`
    : `static demo`;
  $("demo-banner").classList.remove("hidden");
  $("footer-data-note").textContent =
    "this view shows REAL corpus aggregates; the default local API serves SYNTHETIC fixtures";
}

async function boot() {
  if (DEMO) {
    $("btn-brief").disabled = true;
    try {
      const res = await fetch("demo-data.json");
      DEMO_DATA = await res.json();
      COV = DEMO_DATA.coverage;
    } catch (err) {
      setState($("evidence"), "error", `demo data failed to load: ${err.message}`);
      return;
    }
    setBanner(COV);
  }
  try {
    META = await get("/api/meta");
    const maps = META.maps || [];
    $("f-map").innerHTML = maps.map(m => `<option>${m}</option>`).join("");
    if (!DEMO && META.source === "real-aggregates") {
      REAL_API = true;
      COV = META.coverage || COV;
      setBanner(COV);
    }
    // populate player & agent filters from operator roster if available
    try {
      const op = DEMO ? DEMO_DATA.operator : await get("/api/operator");
      if (op && op.players && op.players.length) {
        const players = Array.from(new Set(op.players.map(p => p.player))).sort();
        const agents = Array.from(new Set(op.players.map(p => p.agent))).sort();
        if ($("f-player")) {
          $("f-player").innerHTML = `<option value="all">all players</option>` +
            players.map(p => `<option value="${p}">${p}</option>`).join("");
        }
        if ($("f-agent")) {
          $("f-agent").innerHTML = `<option value="all">all agents</option>` +
            agents.map(a => `<option value="${a}">${a}</option>`).join("");
        }
      }
    } catch (_) {}

    const h = readHash();
    if (h.map && maps.includes(h.map)) $("f-map").value = h.map;
    if (h.side) $("f-side").value = h.side;
    if (h.ability) $("f-ability").value = h.ability;
    if (h.player && $("f-player")) $("f-player").value = h.player;
    if (h.agent && $("f-agent")) $("f-agent").value = h.agent;
    if (!h.map) {
      const preferred = maps.includes("lotus") ? "lotus" : maps[0];
      if (preferred) $("f-map").value = preferred;
    }
  } catch (err) {
    setState($("evidence"), "error", `API unreachable: ${err.message}`);
  }
  renderToggles();
  setupMinimapTooltips();
  v3Controls();
  requestAnimationFrame(v3Loop);
  $("f-map").addEventListener("change", () => { $("f-ability").value = ""; loadAtlas(); loadOperator(); loadCues(); });
  $("f-side").addEventListener("change", () => { loadAtlas(); loadCues(); });
  $("f-ability").addEventListener("change", () => { loadAtlas(); loadCues(); });
  if ($("f-player")) $("f-player").addEventListener("change", () => { loadAtlas(); loadOperator(); loadCues(); });
  if ($("f-agent")) $("f-agent").addEventListener("change", () => { loadAtlas(); loadOperator(); loadCues(); });
  $("btn-refresh").addEventListener("click", loadAll);
  $("btn-brief").addEventListener("click", () => window.open(
    `${API}/api/brief.pdf?map=${encodeURIComponent($("f-map").value || "lotus")}`, "_blank"));
  $("btn-start").addEventListener("click", hideOnboarding);
  showOnboarding();
  await loadAll();
  if (!DEMO && !REAL_API) setInterval(loadAll, 30000);  // poll in API mode
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
  else if (k === "4") document.getElementById("v3-card").scrollIntoView({ behavior: "smooth" });
});

boot();
