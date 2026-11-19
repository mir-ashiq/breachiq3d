/* BreachIQ 3D — VALORANT x Cloud9 Tactical Scouting Console
   Engine: 2D Radar Minimap + 3D Ballistic Orbit + Operator Fingerprint + Anti-Strat
   No build step, no framework, works online/offline. */
"use strict";

const $ = (id) => document.getElementById(id);
const API = window.location.origin;
const DEMO = new URLSearchParams(location.search).has("demo")
  || location.hostname.endsWith("github.io");

let DEMO_DATA = null;
let REAL_API = false;
let COV = null;
let META = null;
let lineupsCache = null;
let currentMinimapPoints = [];
let radarAngle = 0;
let lastAtlasData = null;
let lastLineupsData = null;
let lastBoundsData = null;

// Ability taxonomy & color coding
const CLASS_COLORS = {
  placeable: "#ffd166", // Killjoy / Chamber / Cypher traps (Tactical Gold)
  recon: "#00d2ff",     // Sova / Fade / Cypher darts (C9 Cyan)
  smoke: "#a78bfa",     // Brimstone / Omen / Viper smokes (Neon Violet)
  stall: "#ff4655",     // Sage wall / slow / mollies (Valorant Crimson)
  flash: "#ff7b00",     // Phoenix / Skye / Breach flashes (Orange)
  other: "#94a3b8"      // Miscellaneous utility
};

const layers = { smoke: true, recon: true, placeable: true, stall: true, flash: true, density: false };
const HOLD = { player: null };

function abilityClass(a) {
  if (!a) return "other";
  const s = a.toLowerCase();
  if (/smoke|wall|screen|dark-cover|cloudburst|toxic/.test(s)) return "smoke";
  if (/flash|stun|shock|concuss|near-sight|blind|guide/.test(s)) return "flash";
  if (/trap|alarm|turret|cage|sensor|spycam|tripwire|cypher-trapwire|chamber-trap|alarmbot/.test(s)) return "placeable";
  if (/recon|bolt|owl|drone|scan|reveal|haunt|prowler/.test(s)) return "recon";
  if (/molly|slow|stall|gravitic|nanoswarm|sage-wall|decay/.test(s)) return "stall";
  return "other";
}

/* ---------------- Onboarding Modal ---------------- */
function showOnboarding(force) {
  const seen = localStorage.getItem("breachiq-onboarded-v2");
  if (force || !seen) $("onboarding").classList.remove("hidden");
}
function hideOnboarding() {
  $("onboarding").classList.add("hidden");
  localStorage.setItem("breachiq-onboarded-v2", "1");
}

/* ---------------- Network Fetch with Fallbacks ---------------- */
async function get(path) {
  if (DEMO) return demoRoute(path);
  const sep = path.includes("?") ? "&" : "?";
  const fullPath = !path.includes("data=") ? `${path}${sep}data=real` : path;
  try {
    const res = await fetch(API + fullPath);
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (DEMO_DATA) return demoRoute(path);
    throw err;
  }
}

function demoRoute(path) {
  const url = new URL(path, "http://x");
  const map = (url.searchParams.get("map") || "split").toLowerCase();
  const side = url.searchParams.get("side") || "all";
  const ability = url.searchParams.get("ability") || "";
  const player = url.searchParams.get("player") || "";
  const agent = url.searchParams.get("agent") || "";

  if (path.startsWith("/api/meta")) return DEMO_DATA.meta;
  if (path.startsWith("/api/atlas")) {
    const m = DEMO_DATA.atlas[map] || DEMO_DATA.atlas.split;
    if (!m) throw new Error(`unknown map: ${map}`);
    const s = m.sides[side] || m.sides.all;
    let abilities = s.abilities || [];
    if (ability) abilities = abilities.filter(a => a.ability === ability);

    let points = s.points || [];
    if (ability) points = points.filter(p => p.ability === ability);
    if (player && player !== "all") points = points.filter(p => p.player === player);
    if (agent && agent !== "all") points = points.filter(p => p.agent === agent);

    return {
      ...s, abilities, points, map_selected: map,
      bounds_m: (DEMO_DATA.bounds_m && DEMO_DATA.bounds_m[map]) || { w: 110, h: 120 },
      coverage: s.abilities?.[0]?.evidence?.coverage || DEMO_DATA.coverage || ""
    };
  }
  if (path.startsWith("/api/operator")) return DEMO_DATA.operator;
  if (path.startsWith("/api/pacing")) return DEMO_DATA.pacing;
  if (path.startsWith("/api/lineups")) {
    const m = url.searchParams.get("map");
    const rows = (DEMO_DATA.lineups?.lineups || []).filter(l => !m || l.map === m);
    return { lineups: rows, data: "demo-data.json aggregates" };
  }
  throw new Error(`no demo route for ${path}`);
}

function setState(el, kind, msg) {
  if (!el) return;
  el.innerHTML = `<div class="state ${kind === "error" ? "error" : ""}">${msg}</div>`;
}

async function fetchLineups() {
  if (!lineupsCache) {
    const res = await get("/api/lineups");
    lineupsCache = res.lineups || [];
  }
  return lineupsCache;
}

/* ---------------- URL Hash State Synchronization ---------------- */
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

function atlasQuery() {
  const map = $("f-map").value || "split";
  const side = $("f-side").value || "all";
  const ability = $("f-ability").value || "";
  const player = $("f-player") ? $("f-player").value : "all";
  const agent = $("f-agent") ? $("f-agent").value : "all";
  let q = `/api/atlas?map=${encodeURIComponent(map)}&side=${encodeURIComponent(side)}&data=real`;
  if (ability) q += `&ability=${encodeURIComponent(ability)}`;
  if (player && player !== "all") q += `&player=${encodeURIComponent(player)}`;
  if (agent && agent !== "all") q += `&agent=${encodeURIComponent(agent)}`;
  return q;
}

/* ---------------- Map Blueprint Floorplan Renderer ----------------
   Renders calibrated VALORANT tactical radar geometry: coordinate grid,
   concentric range circles, cardinal directions, and tournament site brackets. */
function drawMapFloorplan(ctx, mapName, W, H, bounds) {
  const map = (mapName || "split").toLowerCase();
  const cx = W / 2, cy = H / 2;

  // 1. Dark tactical radar base
  ctx.fillStyle = "#050811";
  ctx.fillRect(0, 0, W, H);

  // Subtle radial vignette
  const radGrad = ctx.createRadialGradient(cx, cy, 40, cx, cy, W * 0.7);
  radGrad.addColorStop(0, "rgba(0, 210, 255, 0.04)");
  radGrad.addColorStop(0.7, "rgba(6, 11, 20, 0.4)");
  radGrad.addColorStop(1, "rgba(2, 4, 8, 0.9)");
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. 8x8 Tactical Military Coordinate Grid
  ctx.save();
  ctx.strokeStyle = "rgba(0, 210, 255, 0.05)";
  ctx.lineWidth = 1;
  const cols = 8;
  const cellW = W / cols, cellH = H / cols;

  for (let i = 1; i < cols; i++) {
    ctx.beginPath(); ctx.moveTo(i * cellW, 0); ctx.lineTo(i * cellW, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cellH); ctx.lineTo(W, i * cellH); ctx.stroke();
  }

  // Grid coordinates labels (01..08 at top, A..H at left)
  ctx.fillStyle = "rgba(100, 116, 139, 0.45)";
  ctx.font = "bold 9px 'JetBrains Mono', monospace";
  for (let i = 0; i < cols; i++) {
    ctx.fillText(`0${i + 1}`, (i + 0.5) * cellW - 6, 14);
    ctx.fillText(String.fromCharCode(65 + i), 6, (i + 0.5) * cellH + 3);
  }

  // 3. Concentric Calibrated Range Circles (25m, 50m, 75m, 100m)
  const mapW_m = (bounds && bounds.w) ? bounds.w : 100;
  const pxPerMeter = W / mapW_m;
  const distances = [25, 50, 75, 100];

  distances.forEach(d => {
    const r = d * pxPerMeter;
    if (r > 20 && r < W * 0.72) {
      ctx.strokeStyle = "rgba(0, 210, 255, 0.08)";
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(0, 210, 255, 0.35)";
      ctx.font = "bold 8px 'JetBrains Mono', monospace";
      ctx.fillText(`${d}M`, cx + r + 3, cy - 2);
    }
  });

  // 4. Center Crosshairs & Cardinal Direction Ticks
  ctx.strokeStyle = "rgba(0, 210, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 16); ctx.lineTo(cx, H - 16);
  ctx.moveTo(16, cy); ctx.lineTo(W - 16, cy);
  ctx.stroke();

  // Cardinal compass indicators
  ctx.fillStyle = "#00d2ff";
  ctx.font = "bold 11px 'Rajdhani', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("▲ N", cx, 24);
  ctx.fillStyle = "rgba(100, 116, 139, 0.7)";
  ctx.fillText("▼ S", cx, H - 12);
  ctx.textAlign = "left";
  ctx.fillText("▶ E", W - 26, cy + 4);
  ctx.fillText("◀ W", 10, cy + 4);
  ctx.textAlign = "left";

  // Center target reticle
  ctx.strokeStyle = "rgba(0, 210, 255, 0.3)";
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.stroke();

  // 5. Tactical Bombsite Brackets & Zones
  const isThreeSite = (map === "haven" || map === "lotus");

  const drawZoneBracket = (x, y, w, h, label, isSite = true) => {
    const rx = x * W, ry = y * H, rw = w * W, rh = h * H;
    const cLen = 10;
    const col = isSite ? "#ff4655" : "#00d2ff";
    const bgCol = isSite ? "rgba(255, 70, 85, 0.05)" : "rgba(0, 210, 255, 0.03)";

    // Tinted zone background
    ctx.fillStyle = bgCol;
    ctx.fillRect(rx, ry, rw, rh);

    // Subtle dashed perimeter
    ctx.strokeStyle = isSite ? "rgba(255, 70, 85, 0.2)" : "rgba(0, 210, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);

    // Glowing corner brackets
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    // Top-left
    ctx.beginPath(); ctx.moveTo(rx, ry + cLen); ctx.lineTo(rx, ry); ctx.lineTo(rx + cLen, ry); ctx.stroke();
    // Top-right
    ctx.beginPath(); ctx.moveTo(rx + rw - cLen, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + cLen); ctx.stroke();
    // Bottom-left
    ctx.beginPath(); ctx.moveTo(rx, ry + rh - cLen); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + cLen, ry + rh); ctx.stroke();
    // Bottom-right
    ctx.beginPath(); ctx.moveTo(rx + rw - cLen, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - cLen); ctx.stroke();

    // Zone Badge
    ctx.fillStyle = col;
    ctx.font = "bold 11px 'Rajdhani', sans-serif";
    ctx.fillText(label, rx + 8, ry + 16);
  };

  // Draw calibrated tournament zones
  drawZoneBracket(0.08, 0.10, 0.36, 0.34, "SITE // A", true);
  drawZoneBracket(0.56, 0.10, 0.36, 0.34, "SITE // B", true);

  if (isThreeSite) {
    drawZoneBracket(0.32, 0.58, 0.36, 0.30, "SITE // C", true);
    drawZoneBracket(0.38, 0.32, 0.24, 0.22, "MID // AREA", false);
  } else {
    drawZoneBracket(0.36, 0.36, 0.28, 0.26, "MID // CHOKE", false);
  }

  // Spawns
  drawZoneBracket(0.36, 0.84, 0.28, 0.12, "ATK // BASE", false);
  drawZoneBracket(0.36, 0.02, 0.28, 0.08, "DEF // BASE", false);

  ctx.restore();
}

/* ---------------- Rotating Radar Sweep Animation ---------------- */
function drawRadarSweep(ctx, W, H) {
  const cx = W / 2, cy = H / 2;
  const radius = Math.max(W, H) * 0.72;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, radarAngle - 0.4, radarAngle);
  ctx.closePath();

  const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  sweepGrad.addColorStop(0, "rgba(0, 210, 255, 0.18)");
  sweepGrad.addColorStop(1, "rgba(0, 210, 255, 0.0)");
  ctx.fillStyle = sweepGrad;
  ctx.fill();

  // Radar leading edge line
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(radarAngle) * radius, cy + Math.sin(radarAngle) * radius);
  ctx.strokeStyle = "rgba(0, 210, 255, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

/* ---------------- Minimap Renderer ---------------- */
function drawMinimap(atlas, lineups, bounds) {
  if (!atlas) return;
  lastAtlasData = atlas;
  lastLineupsData = lineups;
  lastBoundsData = bounds;

  const canvas = $("minimap");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const map = atlas.map_selected || "split";

  // 1. Draw Architectural Floorplan
  drawMapFloorplan(ctx, map, W, H, bounds);

  // 2. Draw Radar Sweep Beam
  drawRadarSweep(ctx, W, H);

  // 3. Ambient Tactical Thermal Luminescence (Smooth Esports Gradient)
  const dens = atlas.density || [];
  if (layers.density && dens.length && (atlas.points || []).length > 0) {
    const maxD = Math.max(1, ...dens.map(d => d[2]));
    ctx.save();
    for (const [u, v, n] of dens) {
      const rx = u * W, ry = v * H;
      const intensity = Math.min(1, n / maxD);
      const rad = 24 + intensity * 24;
      const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, rad);
      g.addColorStop(0, "rgba(0, 210, 255, 0.22)");
      g.addColorStop(0.5, "rgba(37, 99, 235, 0.10)");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(rx, ry, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 4. Ballistic Trajectory Arcs & Distinct Utility Signatures
  currentMinimapPoints = [];
  const points = atlas.points || [];
  if (!points.length) {
    const cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.fillStyle = "rgba(7, 12, 20, 0.88)";
    ctx.strokeStyle = "rgba(0, 210, 255, 0.4)";
    ctx.lineWidth = 1.5;
    const bw = 380, bh = 95;
    const bx = (W - bw) / 2, by = (H - bh) / 2;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);

    // Glowing corner accents
    const cL = 8;
    ctx.strokeStyle = "#00d2ff";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(bx, by + cL); ctx.lineTo(bx, by); ctx.lineTo(bx + cL, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + bw - cL, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cL); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, by + bh - cL); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + cL, by + bh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + bw - cL, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - cL); ctx.stroke();

    ctx.fillStyle = "#ff4655";
    ctx.font = "bold 13px 'Rajdhani', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("RADAR TELEMETRY // 0 CASTS MATCH ACTIVE FILTERS", cx, by + 30);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px 'JetBrains Mono', monospace";
    const curP = $("f-player") ? $("f-player").value.toUpperCase() : "ALL";
    const curA = $("f-agent") ? $("f-agent").value.toUpperCase() : "ALL";
    ctx.fillText(`FILTER: ${map.toUpperCase()} · ${$("f-side").value.toUpperCase()} · ${curP} · ${curA}`, cx, by + 54);
    ctx.fillStyle = "#00d2ff";
    ctx.fillText("Select 'ALL ROSTER' or 'ALL AGENTS' to expand radar data", cx, by + 74);
    ctx.restore();
  } else {
    for (const p of points) {
      if (layers[p.class] === false) continue;
      const endX = p.u * W, endY = p.v * H;
      const hasOrigin = p.u0 !== undefined && p.v0 !== undefined;
      const startX = hasOrigin ? p.u0 * W : endX;
      const startY = hasOrigin ? p.v0 * H : endY;
      const col = CLASS_COLORS[p.class] || CLASS_COLORS.other;

      // Draw quadratic ballistic trajectory flight curve
      if (hasOrigin && (Math.abs(startX - endX) > 2 || Math.abs(startY - endY) > 2)) {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        const pitchArc = (p.pitch || 25) * 1.0;
        ctx.quadraticCurveTo(midX, midY - Math.abs(pitchArc), endX, endY);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = 0.65;
        ctx.stroke();

        // Origin caster dot
        ctx.beginPath();
        ctx.arc(startX, startY, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.9;
        ctx.fill();

        // Directional azimuth aim tick
        if (p.azimuth != null) {
          const rad = (p.azimuth * Math.PI) / 180;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(startX + Math.cos(rad) * 12, startY - Math.sin(rad) * 12);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      ctx.save();
      ctx.globalAlpha = 1;

      // -------------------------------------------------------------
      // DISTINCT UTILITY-CLASS GEOMETRY & AOE VISUALIZATION
      // -------------------------------------------------------------
      if (p.class === "smoke") {
        // SMOKE: 5-meter vision denial dome with dashed border
        const sRad = 22;
        const sGrad = ctx.createRadialGradient(endX, endY, 2, endX, endY, sRad);
        sGrad.addColorStop(0, "rgba(167, 139, 250, 0.45)");
        sGrad.addColorStop(0.7, "rgba(167, 139, 250, 0.18)");
        sGrad.addColorStop(1, "rgba(167, 139, 250, 0.0)");
        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.arc(endX, endY, sRad, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(endX, endY, sRad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Core Smoke Blip
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(endX, endY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 2;
        ctx.stroke();

      } else if (p.class === "recon") {
        // RECON: Dual Concentric Sonar Pulse Rings
        const pingRad = 14 + (Math.sin(radarAngle * 3.5) + 1) * 5;
        ctx.strokeStyle = "rgba(0, 210, 255, 0.6)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(endX, endY, pingRad, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(0, 210, 255, 0.25)";
        ctx.beginPath();
        ctx.arc(endX, endY, pingRad + 10, 0, Math.PI * 2);
        ctx.stroke();

        // Cyan Diamond Crosshair Reticle
        ctx.fillStyle = "#00d2ff";
        ctx.beginPath();
        ctx.moveTo(endX, endY - 6);
        ctx.lineTo(endX + 6, endY);
        ctx.lineTo(endX, endY + 6);
        ctx.lineTo(endX - 6, endY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(endX, endY, 2, 0, Math.PI * 2);
        ctx.fill();

      } else if (p.class === "placeable") {
        // PLACEABLE: Trapwire / Turret Diamond Hazard Box
        const sz = 7;
        ctx.fillStyle = "rgba(255, 209, 102, 0.28)";
        ctx.fillRect(endX - sz, endY - sz, sz * 2, sz * 2);
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 1.8;
        ctx.strokeRect(endX - sz, endY - sz, sz * 2, sz * 2);

        // Core trap pip
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.arc(endX, endY, 2.5, 0, Math.PI * 2);
        ctx.fill();

      } else if (p.class === "stall") {
        // STALL: Area-of-Denial Molotov / Wall Zone
        ctx.fillStyle = "rgba(255, 70, 85, 0.25)";
        ctx.beginPath();
        ctx.arc(endX, endY, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ff4655";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Crimson Hazard Triangle
        ctx.fillStyle = "#ff4655";
        ctx.beginPath();
        ctx.moveTo(endX, endY - 6);
        ctx.lineTo(endX + 6, endY + 4);
        ctx.lineTo(endX - 6, endY + 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(endX, endY, 1.8, 0, Math.PI * 2);
        ctx.fill();

      } else if (p.class === "flash") {
        // FLASH: 8-Ray Radiating Starburst
        ctx.strokeStyle = "rgba(255, 123, 0, 0.8)";
        ctx.lineWidth = 1.5;
        for (let a = 0; a < 8; a++) {
          const ang = a * Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(endX + Math.cos(ang) * 3, endY + Math.sin(ang) * 3);
          ctx.lineTo(endX + Math.cos(ang) * 11, endY + Math.sin(ang) * 11);
          ctx.stroke();
        }
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(endX, endY, 3.5, 0, Math.PI * 2);
        ctx.fill();

      } else {
        // Standard tactical dot
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(endX, endY, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      currentMinimapPoints.push({
        x: endX, y: endY, r: 12,
        label: `${p.ability.toUpperCase()} [${(p.class || "utility").toUpperCase()}]`,
        sub: `Caster: ${p.player || "Unknown"} (${(p.agent || "Agent").toUpperCase()}) · Round: #${p.round ?? "N/A"}`,
        extra: p.azimuth != null ? `Aim Azimuth: ${p.azimuth}° · Pitch: ${p.pitch}°` : null
      });
    }
  }

  // 5. Repeated Lineups Overlay (Exploit Target Stars ★)
  const abilityFilter = $("f-ability").value;
  for (const l of (lineups || []).filter(l => l.map === map)) {
    if (abilityFilter && l.ability !== abilityFilter) continue;
    if (l.u == null) continue;
    const su = Math.min(1, Math.max(0, l.u));
    const sv = Math.min(1, Math.max(0, l.v));
    const lx = su * W, ly = sv * H;

    // Glowing golden target star
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(lx, ly, 12, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 15px 'Rajdhani', sans-serif";
    ctx.fillText(`★${l.repeats}`, lx + 15, ly - 6);

    currentMinimapPoints.push({
      x: lx, y: ly, r: 14,
      label: `EXPLOIT TARGET: ${l.ability.toUpperCase()}`,
      sub: `Repeated across ${l.repeats} rounds · Aim: ${l.aim_azimuth_deg ?? "—"}°`,
      extra: `★ Priority Pre-Aim Setup Target`
    });
  }

  // 6. Operator Sniper Hold Sightlines
  let holdCount = 0;
  if (HOLD.player) {
    const op = (DEMO ? DEMO_DATA.operator : null);
    const player = op && op.players.find(p => p.player === HOLD.player);
    const positions = (player ? player.hold_positions : [])
      .filter(h => h.map === map);
    holdCount = positions.length;

    positions.forEach((h, i) => {
      const x = h.u * W, y = h.v * H;
      // Vision cone
      ctx.fillStyle = "rgba(255, 70, 85, 0.25)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, 45, -0.6, 0.6);
      ctx.closePath();
      ctx.fill();

      // Sniper marker
      ctx.fillStyle = "#ff4655";
      ctx.beginPath();
      ctx.moveTo(x, y - 8); ctx.lineTo(x + 7, y + 6); ctx.lineTo(x - 7, y + 6);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px 'Rajdhani', sans-serif";
      ctx.fillText(`▲ ${HOLD.player} [OP]`, x + 10, y - 4);

      currentMinimapPoints.push({
        x: x, y: y, r: 12,
        label: `OPERATOR SIGHTLINE: ${HOLD.player}`,
        sub: `High-frequency sniper hold angle · Pre-aim / flash required`,
        extra: `▲ Severe Sniper Threat`
      });
    });
  }

  $("hold-note").textContent = HOLD.player
    ? ` · ▲ ${HOLD.player}: ${holdCount} hold angle${holdCount === 1 ? "" : "s"} on ${map}`
    : "";

  // 7. Tactical Scale Bar
  if (bounds && bounds.w) {
    const mPerPx = bounds.w / W;
    const nice = [100, 50, 20, 10].find(n => n / mPerPx <= W * 0.32) || 10;
    const px = nice / mPerPx;
    const x0 = 16, y0 = H - 18;
    ctx.strokeStyle = "#00d2ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + px, y0);
    ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0 + 4);
    ctx.moveTo(x0 + px, y0 - 4); ctx.lineTo(x0 + px, y0 + 4);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.fillText(`${nice} METERS`, x0 + px / 2 - 24, y0 - 8);
  }

  // Update HUD Label
  if ($("radar-map-label")) {
    $("radar-map-label").textContent = `MAP: ${map.toUpperCase()} // 800×800 SPATIAL`;
  }
}

function heatColor(t) {
  const scale = getComputedStyle(document.documentElement);
  const tiers = ["--heat-1", "--heat-2", "--heat-3", "--heat-4"];
  return scale.getPropertyValue(tiers[Math.min(3, Math.floor(t * 4))]).trim();
}

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

    const hit = currentMinimapPoints.find(p => {
      const dx = p.x - mx, dy = p.y - my;
      return Math.sqrt(dx * dx + dy * dy) <= p.r + 4;
    });

    if (hit) {
      tip.innerHTML = `
        <b>${hit.label}</b>
        <span class="sub">${hit.sub || ""}</span>
        ${hit.extra ? `<div style="color:var(--tactical-gold);font-size:10px;margin-top:4px;font-weight:700;">${hit.extra}</div>` : ""}
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

/* ---------------- Radar Animation Loop ---------------- */
function radarLoop() {
  radarAngle += 0.015;
  if (radarAngle > Math.PI * 2) radarAngle -= Math.PI * 2;
  if (lastAtlasData) {
    drawMinimap(lastAtlasData, lastLineupsData, lastBoundsData);
  }
  requestAnimationFrame(radarLoop);
}

/* ---------------- 3D Trajectory Orbit Viewer (Holographic Arena) ---------------- */
const V3 = {
  yaw: 0.85, pitch: 0.44, dist: 180, auto: true, highlight: null,
  lineups: [], arcs: [], bounds: { w: 110, h: 120 }, map: "",
  visible: true, dragging: false,

  setMap(map, bounds, atlas, lineups) {
    this.map = map || "split";
    this.bounds = bounds || { w: 110, h: 120 };
    this.lineups = (lineups || []).filter(l => l.map === map && l.trajectory);

    // Ingest all active casts and build 3D parabolic flight curves
    this.arcs = [];
    const pts = (atlas && atlas.points) ? atlas.points : [];
    const abilityFilter = $("f-ability") ? $("f-ability").value : "";

    // Sample up to 60 prominent casts to maintain 60 FPS
    const sample = pts.filter(p => !abilityFilter || p.ability === abilityFilter).slice(0, 60);

    for (const p of sample) {
      if (layers[p.class] === false) continue;
      const u0 = (p.u0 !== undefined) ? p.u0 : p.u;
      const v0 = (p.v0 !== undefined) ? p.v0 : p.v;
      const u1 = p.u;
      const v1 = p.v;

      const pStart = this.toWorld(u0, v0, 1.8); // Caster eye level (1.8m)
      const pEnd = this.toWorld(u1, v1, 0.0);   // Ground impact (0m)

      const dist_m = Math.hypot(pEnd[0] - pStart[0], pEnd[1] - pStart[1]);
      const pitchRad = Math.abs(p.pitch || 25) * Math.PI / 180;
      const apex_h = Math.max(3.5, Math.min(32.0, dist_m * 0.36 + Math.sin(pitchRad) * 14));

      // Generate 16 sample coordinates along parabolic flight path
      const curvePts = [];
      const N_SAMPLES = 16;
      for (let s = 0; s <= N_SAMPLES; s++) {
        const t = s / N_SAMPLES;
        const x = pStart[0] + (pEnd[0] - pStart[0]) * t;
        const y = pStart[1] + (pEnd[1] - pStart[1]) * t;
        const z = pStart[2] * (1 - t) + pEnd[2] * t + 4 * apex_h * t * (1 - t);
        curvePts.push([x, y, z]);
      }

      this.arcs.push({
        p,
        pStart,
        pEnd,
        apex_h,
        curvePts,
        class: p.class || "other",
        ability: p.ability || "utility",
        player: p.player || "Unknown"
      });
    }

    const canvas = $("traj3d");
    const h = Math.max(420, Math.min(560, Math.round(800 * (bounds.h || 120) / (bounds.w || 110))));
    if (canvas && canvas.height !== h) canvas.height = h;
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
    const f = Math.min(w, h) * 0.95;
    return [w / 2 + x1 * f / d, h * 0.56 - up * f / d, d];
  },
};

function draw3D() {
  const canvas = $("traj3d");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#040711";
  ctx.fillRect(0, 0, W, H);

  // Subtle radial vignette in 3D arena
  const arenaGlow = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.65);
  arenaGlow.addColorStop(0, "rgba(0, 210, 255, 0.04)");
  arenaGlow.addColorStop(1, "rgba(2, 4, 8, 0.9)");
  ctx.fillStyle = arenaGlow;
  ctx.fillRect(0, 0, W, H);

  // 1. Isometric 16x16 Perspective Ground Grid
  const halfW = V3.bounds.w / 2, halfH = V3.bounds.h / 2;
  const gridDivs = 16;
  ctx.lineWidth = 1;

  for (let i = 0; i <= gridDivs; i++) {
    const frac = i / gridDivs;
    const gx = -halfW + frac * V3.bounds.w;
    const gy = -halfH + frac * V3.bounds.h;

    // Major axis lines vs minor grid
    const isMajor = (i === 0 || i === gridDivs || i === gridDivs / 2);
    ctx.strokeStyle = isMajor ? "rgba(0, 210, 255, 0.22)" : "rgba(0, 210, 255, 0.05)";

    // Lines along Y
    const p1 = V3.project(gx, -halfH, 0, W, H);
    const p2 = V3.project(gx, halfH, 0, W, H);
    if (p1 && p2) {
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }

    // Lines along X
    const p3 = V3.project(-halfW, gy, 0, W, H);
    const p4 = V3.project(halfW, gy, 0, W, H);
    if (p3 && p4) {
      ctx.beginPath(); ctx.moveTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.stroke();
    }
  }

  // 2. Projected Ground Range Circles (25m, 50m, 75m)
  [25, 50, 75].forEach(r => {
    ctx.strokeStyle = "rgba(0, 210, 255, 0.07)";
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    let first = true;
    for (let a = 0; a <= Math.PI * 2; a += 0.2) {
      const p = V3.project(Math.cos(a) * r, Math.sin(a) * r, 0, W, H);
      if (!p) continue;
      if (first) { ctx.moveTo(p[0], p[1]); first = false; }
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // 3. Four Corner Laser Beacon Pillars (0 to 35m height)
  const cornerCoords = [
    [-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]
  ];
  cornerCoords.forEach(([cx, cy]) => {
    const base = V3.project(cx, cy, 0, W, H);
    const top = V3.project(cx, cy, 35, W, H);
    if (base && top) {
      ctx.strokeStyle = "rgba(0, 210, 255, 0.25)";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();

      // Elevation tick marks on pillars (10m, 20m, 30m)
      [10, 20, 30].forEach(z => {
        const tick = V3.project(cx, cy, z, W, H);
        if (tick) {
          ctx.strokeStyle = "rgba(0, 210, 255, 0.5)";
          ctx.beginPath(); ctx.arc(tick[0], tick[1], 1.5, 0, Math.PI * 2); ctx.stroke();
        }
      });
    }
  });

  // 4. Collect and Depth-Sort 3D Render Elements
  const renderItems = [];

  // Repeated lineups
  const abilityFilter = $("f-ability") ? $("f-ability").value : "";
  for (const l of V3.lineups) {
    if (abilityFilter && l.ability !== abilityFilter) continue;
    const pts = l.trajectory.points
      .map(p => V3.project(...V3.toWorld(p[0], p[1], p[2]), W, H));
    if (pts.some(p => !p)) continue;
    const mid = pts[Math.floor(pts.length / 2)];
    renderItems.push({
      depth: mid[2], kind: "lineup", pts, l,
      hl: V3.highlight === `${l.ability}@${l.map}`
    });
  }

  // Active per-cast 3D arcs
  for (const arc of (V3.arcs || [])) {
    const pts2D = arc.curvePts.map(pt => V3.project(pt[0], pt[1], pt[2], W, H));
    if (pts2D.some(p => !p)) continue;
    const mid2D = pts2D[Math.floor(pts2D.length / 2)];
    renderItems.push({
      depth: mid2D[2], kind: "arc", pts: pts2D, arc
    });
  }

  // Back-to-front depth sorting
  renderItems.sort((a, b) => b.depth - a.depth);

  // 5. Draw 3D Ballistic Trajectory Arcs
  for (const it of renderItems) {
    if (it.kind === "lineup") {
      // Golden exploit lineup curve
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = it.hl ? 4 : 2.5;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(it.pts[0][0], it.pts[0][1]);
      for (let i = 1; i < it.pts.length; i++) ctx.lineTo(it.pts[i][0], it.pts[i][1]);
      ctx.stroke();

      const s = it.pts[0];
      ctx.fillStyle = "#ffd166";
      ctx.font = "bold 12px 'Rajdhani', sans-serif";
      ctx.fillText(`★ ${it.l.repeats} [APEX ${it.l.trajectory.apex_m}m]`, s[0] + 8, s[1] - 6);
      ctx.globalAlpha = 1;

    } else if (it.kind === "arc") {
      const arc = it.arc;
      const col = CLASS_COLORS[arc.class] || CLASS_COLORS.other;

      // Laser vertical drop-line from apex down to floor
      const apexIdx = Math.floor(it.pts.length / 2);
      const apex2D = it.pts[apexIdx];
      const apexWorld = arc.curvePts[apexIdx];
      const floor2D = V3.project(apexWorld[0], apexWorld[1], 0, W, H);

      if (floor2D && apex2D) {
        // Floor shadow ellipse
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.beginPath();
        ctx.ellipse(floor2D[0], floor2D[1], 7, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Vertical drop-line
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(apex2D[0], apex2D[1]); ctx.lineTo(floor2D[0], floor2D[1]); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Outer glow curve
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(it.pts[0][0], it.pts[0][1]);
      for (let i = 1; i < it.pts.length; i++) ctx.lineTo(it.pts[i][0], it.pts[i][1]);
      ctx.stroke();

      // Sharp inner trajectory arc
      ctx.lineWidth = 1.8;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(it.pts[0][0], it.pts[0][1]);
      for (let i = 1; i < it.pts.length; i++) ctx.lineTo(it.pts[i][0], it.pts[i][1]);
      ctx.stroke();

      // Caster origin blip (eye level)
      const startPt = it.pts[0];
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(startPt[0], startPt[1], 2.5, 0, Math.PI * 2); ctx.fill();

      // Landing ground blip
      const endPt = it.pts[it.pts.length - 1];
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(endPt[0], endPt[1], 3.5, 0, Math.PI * 2); ctx.fill();

      // Floating holographic tag at apex
      if (arc.apex_h >= 6) {
        ctx.fillStyle = "rgba(4, 7, 17, 0.85)";
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        const tagText = `${arc.ability.toUpperCase()} // ${Math.round(arc.apex_h)}m`;
        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        const tw = ctx.measureText(tagText).width;
        ctx.fillRect(apex2D[0] - tw / 2 - 4, apex2D[1] - 14, tw + 8, 13);
        ctx.strokeRect(apex2D[0] - tw / 2 - 4, apex2D[1] - 14, tw + 8, 13);

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(tagText, apex2D[0], apex2D[1] - 4);
        ctx.textAlign = "left";
      }

      ctx.globalAlpha = 1;
    }
  }

  // 6. Empty-state HUD plate if no trajectories match active filters
  if (!renderItems.length) {
    const cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.fillStyle = "rgba(7, 12, 20, 0.88)";
    ctx.strokeStyle = "rgba(0, 210, 255, 0.4)";
    ctx.lineWidth = 1.5;
    const bw = 380, bh = 85;
    const bx = (W - bw) / 2, by = (H - bh) / 2;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = "#00d2ff";
    ctx.font = "bold 13px 'Rajdhani', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("3D BALLISTIC ARENA // 0 TRAJECTORIES DETECTED", cx, by + 30);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillText("Adjust player or agent filter above to populate 3D flight arcs", cx, by + 54);
    ctx.restore();
  }

  // 7. Tactical HUD Canvas Header
  ctx.fillStyle = "rgba(0, 210, 255, 0.7)";
  ctx.font = "bold 10px 'JetBrains Mono', monospace";
  ctx.fillText(`3D PERSPECTIVE FLIGHT ARENA // ${(V3.map || "SPLIT").toUpperCase()} // ${V3.arcs.length} FLIGHT ARCS`, 16, 22);
}

function v3Loop() {
  if (V3.auto && V3.visible && !document.hidden) V3.yaw += 0.0035;
  draw3D();
  requestAnimationFrame(v3Loop);
}

function v3Controls() {
  const canvas = $("traj3d");
  if (!canvas) return;
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
  v3AutoLabel();
}

function v3AutoLabel() {
  $("v3-auto").textContent = V3.auto ? "⏸ ORBIT" : "▶ ORBIT";
}

/* ---------------- Evidence & Intelligence Panels ---------------- */
function renderEvidence(atlas) {
  const top = atlas.abilities ? atlas.abilities[0] : null;
  const ev = top ? top.evidence : {};
  const quality = COV
    ? `OK ${(Math.round((COV.ok_rate || 0) * 1000) / 10)}% of ${Number(COV.casts).toLocaleString()} casts`
    : (Object.entries(ev.quality_mix || {})
        .map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(", ") || "—");

  const rows = [
    `<span>KEY FOCUS <b>${top ? top.ability.toUpperCase() : "—"} (${top ? top.hard_count : "—"})</b></span>`,
    `<span>TOTAL ROUNDS <b>${ev.rounds ?? atlas.rounds ?? "—"} ROUNDS</b></span>`,
    `<span>PATCH <b>${COV ? (COV.patches.slice(0, 4).join(", ") || "—") : (ev.patch || "11.08")}</b></span>`,
    `<span>DATA FIDELITY <b>${quality}</b></span>`,
  ];
  if (COV) {
    rows.push(`<span>VCT COVERAGE <b>${COV.series} SERIES · ${Number(COV.rounds).toLocaleString()} ROUNDS</b></span>`);
  } else if (ev.coverage) {
    rows.push(`<span>COVERAGE <b>${ev.coverage}</b></span>`);
  }
  $("evidence").innerHTML = rows.join("");
}

function rebuildAbilityOptions(atlas) {
  const sel = $("f-ability");
  if (!sel) return;
  const current = sel.value;
  const names = (atlas.abilities || []).map(a => a.ability).slice(0, 20);
  sel.innerHTML = `<option value="">ALL UTILITY</option>` +
    names.map(n => `<option value="${n}">${n.toUpperCase()}</option>`).join("");
  if (names.includes(current)) sel.value = current;
}

function renderAtlasTable(atlas) {
  const rows = (atlas.abilities || []).map(a => {
    const zones = Object.entries(a.zones).sort((x, y) => y[1] - x[1])
      .map(([z, c]) => `${z.toUpperCase()}×${c}`).join(", ") || "—";
    return `<tr><td><b>${a.ability.toUpperCase()}</b></td><td><span class="badge">${a.class}</span></td><td>${zones}</td><td>${a.hard_count}</td></tr>`;
  }).join("");
  $("atlas-table").innerHTML =
    `<summary>// EXPAND FULL ABILITY TELEMETRY TABLE (${(atlas.abilities || []).length} ABILITIES)</summary>
     <div class="tablewrap"><table>
       <thead><tr><th>ABILITY</th><th>CLASS</th><th>ZONES (CASTS)</th><th>FREQUENCY</th></tr></thead>
       <tbody>${rows}</tbody></table></div>`;
}

async function loadAtlas() {
  try {
    const [atlas, lineups] = await Promise.all([
      get(atlasQuery()), fetchLineups().catch(() => []),
    ]);
    rebuildAbilityOptions(atlas);
    const bounds = atlas.bounds_m ||
      (DEMO_DATA && DEMO_DATA.bounds_m ? DEMO_DATA.bounds_m[atlas.map_selected] : null) || { w: 110, h: 120 };
    drawMinimap(atlas, lineups, bounds);
    renderEvidence(atlas);
    renderAtlasTable(atlas);
    $("map-note").textContent =
      `${atlas.rounds ?? "—"} ROUNDS · ${(atlas.map_selected || $("f-map").value).toUpperCase()} · ${$("f-side").value.toUpperCase()}`;
    V3.setMap(atlas.map_selected || $("f-map").value, bounds, atlas, lineups);
    writeHash();
  } catch (err) {
    setState($("evidence"), "error", `FAILED TO LOAD ATLAS: ${err.message}`);
  }
}

async function loadOperator() {
  const el = $("operator");
  try {
    const op = await get("/api/operator");
    const rows = (op.players || []).filter(p => p.operator_buys > 0);
    if (!rows.length) {
      setState(el, "empty", "NO OPERATOR PURCHASES IN THIS CORPUS");
      return;
    }
    const map = $("f-map").value;
    el.innerHTML = rows.map(p => {
      const here = (p.hold_positions || []).filter(h => h.map === map).length;
      const active = HOLD.player === p.player ? " active" : "";
      return `
      <div class="row clickable${active}" data-player="${p.player}" title="Click to map sniper sightlines">
        <span><b>${p.player}</b> <span style="color:var(--text-dim)">(${p.agent ? p.agent.toUpperCase() : "AGENT"})</span></span>
        <span class="count buy">${p.buy_rate}</span>
        <span class="count">${(p.hold_positions || []).length} SIGHTLINES ${here ? `[${here} ON ${map.toUpperCase()}]` : ""}</span>
      </div>`;
    }).join("")
      + ((DEMO || REAL_API) && op.op_rounds != null ? `
      <div class="row" style="color:var(--text-dim);font-size:11px;">
        <span>OP ROUNDS: ${op.op_rounds} · FIRST BLOOD: ${op.op_first_kills} · FIRST DEATH: ${op.op_holder_died_first}</span>
      </div>` : "");

    el.querySelectorAll(".row.clickable").forEach(row =>
      row.addEventListener("click", () => {
        HOLD.player = HOLD.player === row.dataset.player ? null : row.dataset.player;
        loadOperator();
        loadAtlas();
      }));
  } catch (err) {
    setState(el, "error", `FAILED TO LOAD OPERATOR DATA: ${err.message}`);
  }
}

async function loadLineups() {
  const el = $("lineups");
  try {
    const rows = await fetchLineups();
    if (!rows.length) {
      setState(el, "empty", "NO LINEUP REACHED 3-ROUND REPEAT THRESHOLD");
      return;
    }
    el.innerHTML = rows.slice(0, 10).map(l => `
      <div class="row clickable" data-key="${l.ability}@${l.map}" title="Click to focus 3D trajectory orbit">
        <span><b>${l.ability.toUpperCase()}</b> <span style="color:var(--text-dim)">// ${l.map.toUpperCase()}</span></span>
        <span class="count buy">★ ${l.repeats} ROUNDS</span>
        <span class="count">AIM ${l.aim_azimuth_deg}° · CONF ${Math.round(l.avg_confidence * 100)}%</span>
      </div>`).join("");
    el.querySelectorAll(".row.clickable").forEach(row =>
      row.addEventListener("click", () => {
        V3.highlight = V3.highlight === row.dataset.key ? null : row.dataset.key;
        document.getElementById("v3-card").scrollIntoView({ behavior: "smooth" });
      }));
  } catch (err) {
    setState(el, "error", `FAILED TO LOAD REPEATED LINEUPS: ${err.message}`);
  }
}

async function loadPacing() {
  const el = $("pacing");
  try {
    const data = await get("/api/pacing");
    const sites = Object.entries(data.sites || {});
    if (!sites.length) { setState(el, "empty", "NO PACING TELEMETRY IN RANGE"); return; }
    const maxMed = Math.max(1, ...sites.map(([, s]) => s.median_utility_to_plant_s));
    let html = sites.slice(0, 10).map(([site, s]) => {
      const m = s.median_utility_to_plant_s;
      return `
      <div class="row">
        <span><b>SITE ${site.toUpperCase()}</b> · ${s.rounds} EXECUTE ROUNDS</span>
        <span class="count">MEDIAN ${m}s TO PLANT</span>
        <div class="pbar"><div class="pbar-fill" style="width:${(m / maxMed * 100).toFixed(1)}%"></div></div>
      </div>`;
    }).join("");

    let outcomes = null;
    if (DEMO && DEMO_DATA.outcomes) outcomes = DEMO_DATA.outcomes;
    if (outcomes) {
      const atk = outcomes.sides.attacker, def = outcomes.sides.defender;
      if (atk) html += `
        <div class="row">
          <span>ATTACK WIN RATE: <b>${atk.win_rate}</b></span>
          <span class="count">DEFENSE: <b>${def ? def.win_rate : "—"}</b></span>
        </div>`;
      if (outcomes.pistol_conversion) html += `
        <div class="row">
          <span>PISTOL ROUND CONVERSION</span>
          <span class="count buy">${outcomes.pistol_conversion}</span>
        </div>`;
    }
    el.innerHTML = html;
  } catch (err) {
    setState(el, "error", `FAILED TO LOAD PACING: ${err.message}`);
  }
}

async function loadCues() {
  const el = $("cues");
  try {
    const [atlas, op, lineups] = await Promise.all([
      get(atlasQuery()), get("/api/operator"), fetchLineups().catch(() => []),
    ]);
    const top = (atlas.abilities || [])[0], topL = (lineups || [])[0],
          opP = (op.players || []).find(p => p.operator_buys > 0);
    const cues = [
      top ? `EXPECT <b>${top.ability.toUpperCase()}</b> FOCUS (${top.hard_count}); DEPLOY DENIAL UTILITY TO HALT DEFAULT EXECUTE.` : "",
      topL ? `PRE-AIM THE <b>${topL.ability.toUpperCase()}</b> LINEUP ON ${topL.map.toUpperCase()} — ENEMY REPEATED IT <b>${topL.repeats} ROUNDS</b>.` : "",
      opP ? `<b>${opP.player.toUpperCase()}</b> CARRIES OPERATOR ${opP.buy_rate}; BAIT FIRST SHOT BEFORE COMMITTING RETAKE.` : "",
    ].filter(Boolean);
    el.innerHTML = cues.map(c => `<div class="cue">${c}</div>`).join("")
      || `<div class="state">NO COUNTER-BRIEF DATA</div>`;
  } catch (err) {
    setState(el, "error", `FAILED TO LOAD COUNTER-BRIEF: ${err.message}`);
  }
}

const LAYER_LABELS = {
  smoke: "SMOKE ☁",
  recon: "RECON ◎",
  placeable: "TRAP ◈",
  stall: "STALL ▲",
  flash: "FLASH ✦",
  density: "HEATMAP ♨"
};

function renderToggles() {
  $("layer-toggles").innerHTML = Object.keys(layers).map(k =>
    `<button class="toggle-btn ${layers[k] ? "on" : ""}" data-layer="${k}">${LAYER_LABELS[k] || k.toUpperCase()}</button>`).join("");
  document.querySelectorAll(".toggle-btn").forEach(btn =>
    btn.addEventListener("click", () => {
      layers[btn.dataset.layer] = !layers[btn.dataset.layer];
      renderToggles();
      loadAtlas();
    }));
}

async function loadAll() {
  lineupsCache = null;
  await Promise.all([loadAtlas(), loadOperator(), loadLineups(), loadPacing(), loadCues()]);
}

function setBanner(cov) {
  const el = $("demo-banner");
  if (!el) return;
  el.innerHTML = cov
    ? `<b>VCT REAL FINDINGS // LIVE</b> Official GRID Corpus Telemetry —
       ${cov.series} Cloud9 Series (VCT Americas + Game Changers),
       ${Number(cov.rounds).toLocaleString()} Rounds, ${Number(cov.casts).toLocaleString()} Utility Casts ·
       Data Quality: ${(cov.ok_rate * 100).toFixed(1)}% OK ·
       <a href="https://github.com/mir-ashiq/breachiq3d" target="_blank" rel="noopener">SOURCE REPO &amp; AUDIT</a>`
    : `STATIC DEMO MODE`;
  el.classList.remove("hidden");
  $("footer-data-note").textContent = "DATA: REAL VCT AMERICAS CORPUS AGGREGATES (GRID TELEMETRY)";
}

let ROSTER_MAP = { playerToAgents: {}, agentToPlayers: {}, allPlayers: [], allAgents: [] };

function setupRosterFilters(op) {
  if (!op) return;
  const p2a = {};
  const a2p = {};

  if (op.players && op.players.length) {
    for (const p of op.players) {
      if (!p.player) continue;
      p2a[p.player] = p2a[p.player] || new Set();
      if (p.agent) {
        const ag = p.agent.toLowerCase();
        p2a[p.player].add(ag);
        a2p[ag] = a2p[ag] || new Set();
        a2p[ag].add(p.player);
      }
    }
  }

  if (op.rotation) {
    for (const [agent, pls] of Object.entries(op.rotation)) {
      const a = agent.toLowerCase();
      a2p[a] = a2p[a] || new Set();
      for (const pl of pls) {
        a2p[a].add(pl);
        p2a[pl] = p2a[pl] || new Set();
        p2a[pl].add(a);
      }
    }
  }

  ROSTER_MAP.playerToAgents = Object.fromEntries(
    Object.entries(p2a).map(([k, v]) => [k, Array.from(v).sort()])
  );
  ROSTER_MAP.agentToPlayers = Object.fromEntries(
    Object.entries(a2p).map(([k, v]) => [k, Array.from(v).sort()])
  );
  ROSTER_MAP.allPlayers = Object.keys(ROSTER_MAP.playerToAgents).sort();
  ROSTER_MAP.allAgents = Object.keys(ROSTER_MAP.agentToPlayers).sort();

  syncFilterOptions();
}

function syncFilterOptions() {
  const pSel = $("f-player");
  const aSel = $("f-agent");
  if (!pSel || !aSel) return;

  const curPlayer = pSel.value || "all";
  const curAgent = aSel.value || "all";

  let availPlayers = ROSTER_MAP.allPlayers;
  if (curAgent && curAgent !== "all" && ROSTER_MAP.agentToPlayers[curAgent]) {
    availPlayers = ROSTER_MAP.agentToPlayers[curAgent];
  }

  let availAgents = ROSTER_MAP.allAgents;
  if (curPlayer && curPlayer !== "all" && ROSTER_MAP.playerToAgents[curPlayer]) {
    availAgents = ROSTER_MAP.playerToAgents[curPlayer];
  }

  pSel.innerHTML = `<option value="all">ALL ROSTER (${ROSTER_MAP.allPlayers.length})</option>` +
    availPlayers.map(p => `<option value="${p}">${p.toUpperCase()}</option>`).join("");
  if (availPlayers.includes(curPlayer)) pSel.value = curPlayer;
  else pSel.value = "all";

  aSel.innerHTML = `<option value="all">ALL AGENTS (${ROSTER_MAP.allAgents.length})</option>` +
    availAgents.map(a => `<option value="${a}">${a.toUpperCase()}</option>`).join("");
  if (availAgents.includes(curAgent)) aSel.value = curAgent;
  else aSel.value = "all";
}

/* ---------------- Boot Initialization ---------------- */
async function boot() {
  // Pre-load demo-data.json for instant offline fallback
  try {
    const res = await fetch("demo-data.json");
    if (res.ok) {
      DEMO_DATA = await res.json();
      if (!COV) COV = DEMO_DATA.coverage;
    }
  } catch (_) {}

  if (DEMO) {
    $("btn-brief").disabled = true;
    if (COV) setBanner(COV);
  }

  try {
    META = await get("/api/meta");
    const maps = META.maps || ["split", "ascent", "bind", "haven"];
    $("f-map").innerHTML = maps.map(m => `<option value="${m}">${m.toUpperCase()}</option>`).join("");

    if (META.source === "real-aggregates" || META.SYNTHETIC === false) {
      REAL_API = true;
      COV = META.coverage || COV;
      setBanner(COV);
    }

    try {
      const op = DEMO ? DEMO_DATA.operator : await get("/api/operator");
      if (op) {
        setupRosterFilters(op);
      }
    } catch (_) {}

    const h = readHash();
    if (h.map && maps.includes(h.map)) $("f-map").value = h.map;
    if (h.side) $("f-side").value = h.side;
    if (h.ability) $("f-ability").value = h.ability;
    if (h.player && $("f-player")) $("f-player").value = h.player;
    if (h.agent && $("f-agent")) $("f-agent").value = h.agent;
    if (!h.map) {
      const preferred = maps.includes("split") ? "split" : maps[0];
      if (preferred) $("f-map").value = preferred;
    }
  } catch (err) {
    setState($("evidence"), "error", `Telemetry feed initializing: ${err.message}`);
  }

  renderToggles();
  setupMinimapTooltips();
  v3Controls();
  requestAnimationFrame(v3Loop);
  requestAnimationFrame(radarLoop);

  $("f-map").addEventListener("change", () => { $("f-ability").value = ""; loadAtlas(); loadOperator(); loadCues(); });
  $("f-side").addEventListener("change", () => { loadAtlas(); loadCues(); });
  $("f-ability").addEventListener("change", () => { loadAtlas(); loadCues(); });
  if ($("f-player")) {
    $("f-player").addEventListener("change", () => {
      syncFilterOptions();
      loadAtlas();
      loadOperator();
      loadCues();
    });
  }
  if ($("f-agent")) {
    $("f-agent").addEventListener("change", () => {
      syncFilterOptions();
      loadAtlas();
      loadOperator();
      loadCues();
    });
  }
  $("btn-refresh").addEventListener("click", loadAll);
  $("btn-brief").addEventListener("click", () => window.open(
    `${API}/api/brief.pdf?map=${encodeURIComponent($("f-map").value || "split")}&data=real`, "_blank"));
  $("btn-tour").addEventListener("click", () => showOnboarding(true));
  $("btn-modal-close").addEventListener("click", hideOnboarding);
  $("btn-start").addEventListener("click", hideOnboarding);

  await loadAll();
  if (!DEMO && !REAL_API) setInterval(loadAll, 30000);
}

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  const k = e.key.toLowerCase();
  if (k === "r") loadAll();
  else if (k === "?") showOnboarding(true);
  else if (k === "b" && !DEMO) window.open(`${API}/api/brief.pdf?map=${encodeURIComponent($("f-map").value || "split")}`, "_blank");
  else if (k === "1") document.getElementById("map-card")?.scrollIntoView({ behavior: "smooth" });
  else if (k === "2") document.getElementById("operator")?.scrollIntoView({ behavior: "smooth" });
  else if (k === "3") document.getElementById("pacing")?.scrollIntoView({ behavior: "smooth" });
  else if (k === "4") document.getElementById("v3-card")?.scrollIntoView({ behavior: "smooth" });
});

boot();
