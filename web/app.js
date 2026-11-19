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

const layers = { placeable: true, recon: true, smoke: true, stall: true, flash: true };
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
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

function demoRoute(path) {
  const url = new URL(path, "http://x");
  const map = url.searchParams.get("map") || "split";
  const side = url.searchParams.get("side") || "all";
  const ability = url.searchParams.get("ability") || "";
  if (path.startsWith("/api/meta")) return DEMO_DATA.meta;
  if (path.startsWith("/api/atlas")) {
    const m = DEMO_DATA.atlas[map] || DEMO_DATA.atlas.split;
    if (!m) throw new Error(`unknown map: ${map}`);
    const s = m.sides[side] || m.sides.all;
    const abilities = ability
      ? s.abilities.filter(a => a.ability === ability) : s.abilities;
    return {
      ...s, abilities, map_selected: map,
      bounds_m: DEMO_DATA.bounds_m[map] || { w: 110, h: 120 },
      coverage: s.abilities[0]?.evidence?.coverage || ""
    };
  }
  if (path.startsWith("/api/operator")) return DEMO_DATA.operator;
  if (path.startsWith("/api/pacing")) return DEMO_DATA.pacing;
  if (path.startsWith("/api/lineups")) return DEMO_DATA.lineups;
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
  let q = `/api/atlas?map=${encodeURIComponent(map)}&side=${encodeURIComponent(side)}`;
  if (ability) q += `&ability=${encodeURIComponent(ability)}`;
  if (player && player !== "all") q += `&player=${encodeURIComponent(player)}`;
  if (agent && agent !== "all") q += `&agent=${encodeURIComponent(agent)}`;
  return q;
}

/* ---------------- Map Blueprint Floorplan Renderer ----------------
   Renders accurate VALORANT map geometry: site perimeters, chokepoints,
   ramps, spawns, and tactical callout overlays. */
function drawMapFloorplan(ctx, mapName, W, H) {
  const map = (mapName || "split").toLowerCase();

  // Dark tactical blueprint base
  ctx.fillStyle = "#070c14";
  ctx.fillRect(0, 0, W, H);

  // High-tech circular radar grid rings
  const cx = W / 2, cy = H / 2;
  ctx.strokeStyle = "rgba(0, 210, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let r = 80; r < Math.max(W, H) * 0.7; r += 100) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Crosshair coordinate axes
  ctx.strokeStyle = "rgba(0, 210, 255, 0.08)";
  ctx.beginPath();
  ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
  ctx.moveTo(0, cy); ctx.lineTo(W, cy);
  ctx.stroke();

  // Fine 16x16 tactical grid
  ctx.strokeStyle = "rgba(28, 43, 62, 0.4)";
  for (let i = 1; i < 16; i++) {
    ctx.beginPath(); ctx.moveTo(W * i / 16, 0); ctx.lineTo(W * i / 16, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H * i / 16); ctx.lineTo(W, H * i / 16); ctx.stroke();
  }

  ctx.save();

  // Draw architectural corridors and site outlines based on map layout
  const drawCorridor = (coords) => {
    ctx.fillStyle = "#0c1522";
    ctx.strokeStyle = "#1e334d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(coords[0][0] * W, coords[0][1] * H);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i][0] * W, coords[i][1] * H);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  const drawSiteBox = (x, y, w, h, label, isSite = true) => {
    const rx = x * W, ry = y * H, rw = w * W, rh = h * H;
    // Glow border
    ctx.strokeStyle = isSite ? "rgba(255, 70, 85, 0.5)" : "rgba(0, 210, 255, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = isSite ? "rgba(255, 70, 85, 0.08)" : "rgba(0, 210, 255, 0.05)";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);

    // Site plant boundary corners
    const cLen = 8;
    ctx.strokeStyle = isSite ? "#ff4655" : "#00d2ff";
    ctx.lineWidth = 2.5;
    // Top-left
    ctx.beginPath(); ctx.moveTo(rx, ry + cLen); ctx.lineTo(rx, ry); ctx.lineTo(rx + cLen, ry); ctx.stroke();
    // Top-right
    ctx.beginPath(); ctx.moveTo(rx + rw - cLen, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + cLen); ctx.stroke();
    // Bottom-left
    ctx.beginPath(); ctx.moveTo(rx, ry + rh - cLen); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + cLen, ry + rh); ctx.stroke();
    // Bottom-right
    ctx.beginPath(); ctx.moveTo(rx + rw - cLen, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - cLen); ctx.stroke();

    // Site Tag Badge
    ctx.fillStyle = isSite ? "#ff4655" : "#00d2ff";
    ctx.font = "bold 13px 'Rajdhani', sans-serif";
    ctx.fillText(label, rx + 10, ry + 20);
  };

  const drawCallout = (text, x, y) => {
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.fillText(text, x * W, y * H);
  };

  if (map === "split") {
    // A Site & A Main corridor
    drawCorridor([[0.62, 0.15], [0.88, 0.15], [0.88, 0.42], [0.72, 0.42], [0.62, 0.30]]);
    // B Site & B Garage corridor
    drawCorridor([[0.12, 0.16], [0.38, 0.16], [0.38, 0.45], [0.24, 0.45], [0.12, 0.32]]);
    // Mid Vents, Ropes, Mail & Sewer
    drawCorridor([[0.40, 0.28], [0.60, 0.28], [0.60, 0.65], [0.40, 0.65]]);
    // Attacker Spawn path
    drawCorridor([[0.30, 0.72], [0.70, 0.72], [0.65, 0.94], [0.35, 0.94]]);
    // Defender Spawn path
    drawCorridor([[0.38, 0.04], [0.62, 0.04], [0.62, 0.18], [0.38, 0.18]]);

    // Site Boxes
    drawSiteBox(0.66, 0.18, 0.18, 0.18, "SITE // A");
    drawSiteBox(0.16, 0.20, 0.18, 0.18, "SITE // B");
    drawSiteBox(0.42, 0.80, 0.16, 0.10, "ATK SPAWN", false);
    drawSiteBox(0.42, 0.06, 0.16, 0.08, "DEF SPAWN", false);

    // Callout labels
    drawCallout("A TOWER [HEAVEN]", 0.68, 0.14);
    drawCallout("A MAIN", 0.76, 0.46);
    drawCallout("A RAMPS", 0.64, 0.40);
    drawCallout("B TOWER [HEAVEN]", 0.20, 0.14);
    drawCallout("B GARAGE", 0.15, 0.48);
    drawCallout("MID VENTS", 0.43, 0.35);
    drawCallout("MID MAIL", 0.43, 0.50);
    drawCallout("SEWER", 0.52, 0.68);
  } else if (map === "ascent") {
    // A Site & Garden
    drawCorridor([[0.62, 0.12], [0.88, 0.12], [0.88, 0.40], [0.62, 0.40]]);
    // B Site & Market
    drawCorridor([[0.12, 0.15], [0.38, 0.15], [0.38, 0.44], [0.12, 0.44]]);
    // Mid Courtyard
    drawCorridor([[0.38, 0.30], [0.62, 0.30], [0.62, 0.65], [0.38, 0.65]]);
    // Spawns
    drawCorridor([[0.32, 0.74], [0.68, 0.74], [0.60, 0.94], [0.40, 0.94]]);
    drawCorridor([[0.40, 0.04], [0.60, 0.04], [0.60, 0.16], [0.40, 0.16]]);

    drawSiteBox(0.66, 0.16, 0.18, 0.18, "SITE // A");
    drawSiteBox(0.16, 0.18, 0.18, 0.18, "SITE // B");
    drawSiteBox(0.42, 0.82, 0.16, 0.08, "ATK SPAWN", false);
    drawSiteBox(0.42, 0.06, 0.16, 0.07, "DEF SPAWN", false);

    drawCallout("A HEAVEN", 0.68, 0.14);
    drawCallout("A MAIN", 0.78, 0.44);
    drawCallout("B BOAT HOUSE", 0.14, 0.14);
    drawCallout("MID COURTYARD", 0.42, 0.48);
    drawCallout("MARKET", 0.28, 0.32);
  } else if (map === "bind") {
    // A Site & Showers
    drawCorridor([[0.58, 0.14], [0.86, 0.14], [0.86, 0.45], [0.58, 0.45]]);
    // B Site & Hookah
    drawCorridor([[0.14, 0.16], [0.42, 0.16], [0.42, 0.48], [0.14, 0.48]]);
    // Center teleporters
    drawCorridor([[0.35, 0.42], [0.65, 0.42], [0.65, 0.68], [0.35, 0.68]]);
    drawSiteBox(0.64, 0.18, 0.18, 0.18, "SITE // A");
    drawSiteBox(0.18, 0.20, 0.18, 0.18, "SITE // B");
    drawCallout("U-HALL / LAMPS", 0.62, 0.16);
    drawCallout("HOOKAH", 0.24, 0.44);
    drawCallout("B LONG", 0.12, 0.54);
    drawCallout("A SHORT", 0.58, 0.52);
  } else {
    // Generic tactical 3-lane floorplan for Haven / Lotus / other
    drawCorridor([[0.68, 0.15], [0.90, 0.15], [0.90, 0.45], [0.68, 0.45]]);
    drawCorridor([[0.40, 0.18], [0.60, 0.18], [0.60, 0.45], [0.40, 0.45]]);
    drawCorridor([[0.10, 0.15], [0.32, 0.15], [0.32, 0.45], [0.10, 0.45]]);
    drawCorridor([[0.20, 0.55], [0.80, 0.55], [0.80, 0.75], [0.20, 0.75]]);
    drawSiteBox(0.72, 0.18, 0.15, 0.18, "SITE // A");
    drawSiteBox(0.42, 0.20, 0.15, 0.18, "SITE // B");
    drawSiteBox(0.14, 0.18, 0.15, 0.18, "SITE // C");
    drawCallout("MID CONNECTOR", 0.42, 0.60);
  }

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
  drawMapFloorplan(ctx, map, W, H);

  // 2. Draw Radar Sweep Beam
  drawRadarSweep(ctx, W, H);

  // 3. Cast-Density Heatmap (Upscaled from density histogram)
  const dens = atlas.density || [];
  if (dens.length) {
    const maxD = Math.max(1, ...dens.map(d => d[2]));
    const off = document.createElement("canvas");
    off.width = off.height = 40;
    const octx = off.getContext("2d");
    for (const [u, v, n] of dens) {
      octx.fillStyle = heatColor(n / maxD);
      octx.globalAlpha = 0.45 + 0.5 * (n / maxD);
      octx.fillRect(u * 40 - 1.5, v * 40 - 1.5, 3, 3);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = 0.85;
    ctx.drawImage(off, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // 4. Ballistic Trajectory Arcs & Landing Blips
  currentMinimapPoints = [];
  const points = atlas.points || [];
  if (points.length) {
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

      // Landing impact blip with outer pulse ring
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(endX, endY, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#080c14";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Outer faint sonar ring
      ctx.beginPath();
      ctx.arc(endX, endY, 8, 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;

      currentMinimapPoints.push({
        x: endX, y: endY, r: 10,
        label: `${p.ability.toUpperCase()} [${p.class || "utility"}]`,
        sub: `Caster: ${p.player || "Unknown"} · Round: #${p.round ?? "N/A"} · Quality: ${p.quality}`,
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

/* ---------------- 3D Trajectory Orbit Viewer ---------------- */
function buildTerrain(atlas) {
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

const V3 = {
  yaw: 0.8, pitch: 0.42, dist: 185, auto: true, highlight: null,
  terrain: null, lineups: [], bounds: { w: 110, h: 120 }, map: "",
  visible: true, dragging: false, MAXH: 15,

  setMap(map, bounds, atlas, lineups) {
    this.map = map;
    this.bounds = bounds;
    this.terrain = buildTerrain(atlas);
    this.lineups = (lineups || []).filter(l => l.map === map && l.trajectory);
    const canvas = $("traj3d");
    const h = Math.max(400, Math.min(620, Math.round(800 * bounds.h / bounds.w)));
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
  if (!V3.terrain) return;
  const canvas = $("traj3d");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#070c14";
  ctx.fillRect(0, 0, W, H);

  // Ground border & 3D perspective grid
  ctx.lineWidth = 1;
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    for (const [a, b, horiz] of [[frac, 0, false], [0, frac, true]]) {
      const p1 = V3.project(...(horiz ? V3.toWorld(a, b, 0) : V3.toWorld(a, b, 0)));
      const p2 = V3.project(...(horiz ? V3.toWorld(a + 1 - frac || 1, b, 0)
                                      : V3.toWorld(a, b + 1 - frac || 1, 0)));
      if (!p1 || !p2) continue;
      ctx.strokeStyle = frac === 0 || frac === 1 ? "#2a3e59" : "rgba(0, 210, 255, 0.1)";
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
  }

  // Density terrain columns
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

  // Lineup trajectory arcs in 3D
  const abilityFilter = $("f-ability") ? $("f-ability").value : "";
  for (const l of V3.lineups) {
    if (abilityFilter && l.ability !== abilityFilter) continue;
    const pts = l.trajectory.points
      .map(p => V3.project(...V3.toWorld(p[0], p[1], p[2]), W, H));
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
      ctx.globalAlpha = 0.35 + 0.55 * it.t;
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

      const s = it.pts[0], e = it.pts[it.pts.length - 1];
      ctx.fillStyle = CLASS_COLORS[cls] || CLASS_COLORS.other;
      ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#ffd166";
      ctx.font = "bold 13px 'Rajdhani', sans-serif";
      ctx.fillText(`★${it.l.repeats} [APEX ${it.l.trajectory.apex_m}m]`, s[0] + 8, s[1] - 6);
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
    if (!atlas.abilities?.length && !(atlas.density || []).length && !(atlas.points || []).length) {
      setState($("evidence"), "empty", "NO CASTS MATCH SELECTED TACTICAL FILTERS");
      return;
    }
    rebuildAbilityOptions(atlas);
    const bounds = atlas.bounds_m ||
      (DEMO ? DEMO_DATA.bounds_m[atlas.map_selected] : null) || { w: 110, h: 120 };
    drawMinimap(atlas, lineups, bounds);
    renderEvidence(atlas);
    renderAtlasTable(atlas);
    $("map-note").textContent =
      `${atlas.rounds ?? "—"} ROUNDS · ${atlas.map_selected.toUpperCase()} · ${$("f-side").value.toUpperCase()}`;
    V3.setMap(atlas.map_selected, bounds, atlas, lineups);
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

/* ---------------- Boot Initialization ---------------- */
async function boot() {
  if (DEMO) {
    $("btn-brief").disabled = true;
    try {
      const res = await fetch("demo-data.json");
      DEMO_DATA = await res.json();
      COV = DEMO_DATA.coverage;
    } catch (err) {
      setState($("evidence"), "error", `Demo data failed to load: ${err.message}`);
      return;
    }
    setBanner(COV);
  }

  try {
    META = await get("/api/meta");
    const maps = META.maps || ["split", "ascent", "bind", "haven"];
    $("f-map").innerHTML = maps.map(m => `<option value="${m}">${m.toUpperCase()}</option>`).join("");

    if (!DEMO && META.source === "real-aggregates") {
      REAL_API = true;
      COV = META.coverage || COV;
      setBanner(COV);
    }

    try {
      const op = DEMO ? DEMO_DATA.operator : await get("/api/operator");
      if (op && op.players && op.players.length) {
        const players = Array.from(new Set(op.players.map(p => p.player))).sort();
        const agents = Array.from(new Set(op.players.map(p => p.agent))).sort();
        if ($("f-player")) {
          $("f-player").innerHTML = `<option value="all">ALL ROSTER</option>` +
            players.map(p => `<option value="${p}">${p.toUpperCase()}</option>`).join("");
        }
        if ($("f-agent")) {
          $("f-agent").innerHTML = `<option value="all">ALL AGENTS</option>` +
            agents.map(a => `<option value="${a}">${a.toUpperCase()}</option>`).join("");
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
      const preferred = maps.includes("split") ? "split" : maps[0];
      if (preferred) $("f-map").value = preferred;
    }
  } catch (err) {
    setState($("evidence"), "error", `API unreachable: ${err.message}`);
  }

  renderToggles();
  setupMinimapTooltips();
  v3Controls();
  requestAnimationFrame(v3Loop);
  requestAnimationFrame(radarLoop);

  $("f-map").addEventListener("change", () => { $("f-ability").value = ""; loadAtlas(); loadOperator(); loadCues(); });
  $("f-side").addEventListener("change", () => { loadAtlas(); loadCues(); });
  $("f-ability").addEventListener("change", () => { loadAtlas(); loadCues(); });
  if ($("f-player")) $("f-player").addEventListener("change", () => { loadAtlas(); loadOperator(); loadCues(); });
  if ($("f-agent")) $("f-agent").addEventListener("change", () => { loadAtlas(); loadOperator(); loadCues(); });
  $("btn-refresh").addEventListener("click", loadAll);
  $("btn-brief").addEventListener("click", () => window.open(
    `${API}/api/brief.pdf?map=${encodeURIComponent($("f-map").value || "split")}`, "_blank"));
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
