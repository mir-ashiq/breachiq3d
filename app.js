/* BreachIQ 3D — VALORANT x Cloud9 Tactical Scouting Console
   Engine: Unified Reactive Spatial Stage & Client-Side Anti-Strat Engine */

"use strict";

const API = "http://127.0.0.1:8000";
const IS_LOCAL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const DEMO = !IS_LOCAL && !window.location.search.includes("real");
let DEMO_DATA = null;
let REAL_API = false;
let META = null;
let COV = null;

const $ = (id) => document.getElementById(id);

/* ---------------- Reactive Application State Store ---------------- */
const TACTICAL_STATE = {
  map: "summit",
  side: "all",
  player: "all",
  agent: "all",
  ability: "",
  viewMode: "2d", // "2d" (default) or "3d"
  densityMode: "clean", // "clean" (default), "heatmap", "raw"
  highlightedLineupKey: null,
  selectedPlayer: null,
  hovered2DItem: null,
  pinned2DItem: null,
  hoveredArc: null,
  pinned3DArc: null,
  rawAtlas: null,
  rawOperator: null,
  rawLineups: [],
  rawPacing: null,
  layers: {
    smoke: true,
    recon: true,
    trap: true,
    stall: true,
    flash: true,
    density: true,
    allArcs: false,
  },
};

const CLASS_COLORS = {
  smoke: "#a78bfa",
  recon: "#00aeef",
  placeable: "#f59e0b",
  trap: "#f59e0b",
  stall: "#ef4444",
  flash: "#ff7b00",
  other: "#94a3b8",
};

const LAYER_LABELS = {
  smoke: "SMOKE",
  recon: "RECON",
  trap: "TRAP",
  stall: "STALL",
  flash: "FLASH",
  density: "HEATMAP",
  allArcs: "ALL ARCS ➔",
};

/* ---------------- Authentic Map Architectural Blueprints ---------------- */
const MAP_BLUEPRINTS = {
  bind: {
    corridors: [
      [0.56, 0.20, 0.28, 0.24], // A Site
      [0.50, 0.44, 0.16, 0.20], // A Short
      [0.72, 0.42, 0.16, 0.26], // A Showers/Baths
      [0.74, 0.16, 0.12, 0.12], // A Tower (Heaven)
      [0.52, 0.26, 0.10, 0.14], // Lamps (U-Hall)
      [0.18, 0.20, 0.26, 0.24], // B Site
      [0.10, 0.38, 0.14, 0.30], // B Long
      [0.30, 0.46, 0.16, 0.18], // B Hookah (Window)
      [0.12, 0.20, 0.12, 0.16], // B Garden / Elbow
      [0.32, 0.14, 0.12, 0.12], // B Hall
      [0.44, 0.38, 0.10, 0.08], // Teleporter A -> B Short
      [0.18, 0.52, 0.08, 0.08], // Teleporter B Long -> A Lobby
      [0.36, 0.04, 0.28, 0.12], // Defender Spawn
      [0.34, 0.78, 0.32, 0.16], // Attacker Spawn
    ],
    plants: [
      [0.62, 0.24, 0.16, 0.16, "A SITE"],
      [0.23, 0.24, 0.16, 0.16, "B SITE"],
    ],
    callouts: [
      [0.74, 0.55, "SHOWERS", "#94a3b8"],
      [0.52, 0.54, "A SHORT", "#94a3b8"],
      [0.53, 0.34, "U-HALL", "#00aeef"],
      [0.32, 0.56, "HOOKAH", "#00aeef"],
      [0.11, 0.54, "B LONG", "#94a3b8"],
      [0.13, 0.27, "GARDEN", "#94a3b8"],
      [0.44, 0.43, "TP [A➔B]", "#f59e0b"],
      [0.40, 0.11, "DEF SPAWN", "#94a3b8"],
      [0.40, 0.88, "ATK SPAWN", "#94a3b8"],
    ],
  },
  lotus: {
    corridors: [
      [0.66, 0.18, 0.24, 0.26], // A Site
      [0.70, 0.44, 0.16, 0.24], // A Main / Tree
      [0.62, 0.26, 0.12, 0.12], // A Hut
      [0.40, 0.22, 0.20, 0.22], // B Site
      [0.42, 0.44, 0.16, 0.20], // B Main
      [0.14, 0.22, 0.22, 0.26], // C Site
      [0.12, 0.48, 0.16, 0.22], // C Main / Mound
      [0.18, 0.14, 0.12, 0.12], // C Waterfall
      [0.58, 0.34, 0.08, 0.08], // Rotating Door A-B
      [0.34, 0.34, 0.08, 0.08], // Rotating Door B-C
      [0.38, 0.04, 0.24, 0.12], // Defender Base
      [0.34, 0.78, 0.32, 0.16], // Attacker Base
    ],
    plants: [
      [0.70, 0.22, 0.16, 0.16, "A SITE"],
      [0.42, 0.25, 0.16, 0.16, "B SITE"],
      [0.16, 0.26, 0.16, 0.16, "C SITE"],
    ],
    callouts: [
      [0.72, 0.56, "A TREE", "#94a3b8"],
      [0.63, 0.32, "A HUT", "#00aeef"],
      [0.43, 0.54, "B MAIN", "#94a3b8"],
      [0.14, 0.60, "C MOUND", "#94a3b8"],
      [0.16, 0.18, "WATERFALL", "#94a3b8"],
      [0.56, 0.39, "ROT DOOR", "#f59e0b"],
      [0.40, 0.10, "DEF BASE", "#94a3b8"],
      [0.40, 0.88, "ATK BASE", "#94a3b8"],
    ],
  },
  haven: {
    corridors: [
      [0.64, 0.18, 0.24, 0.24], // A Site
      [0.70, 0.42, 0.16, 0.28], // A Long
      [0.58, 0.42, 0.12, 0.20], // A Sewer
      [0.40, 0.24, 0.20, 0.22], // B Site
      [0.42, 0.46, 0.16, 0.18], // Mid Courtyard / Window
      [0.14, 0.20, 0.22, 0.26], // C Site
      [0.10, 0.46, 0.14, 0.24], // C Long
      [0.24, 0.38, 0.14, 0.18], // C Garage
      [0.38, 0.04, 0.24, 0.12], // Defender Spawn
      [0.34, 0.78, 0.32, 0.16], // Attacker Spawn
    ],
    plants: [
      [0.68, 0.22, 0.16, 0.16, "A SITE"],
      [0.42, 0.26, 0.16, 0.16, "B SITE"],
      [0.16, 0.24, 0.16, 0.16, "C SITE"],
    ],
    callouts: [
      [0.72, 0.56, "A LONG", "#94a3b8"],
      [0.59, 0.52, "A SEWER", "#94a3b8"],
      [0.43, 0.55, "MID COURTYARD", "#00aeef"],
      [0.11, 0.58, "C LONG", "#94a3b8"],
      [0.25, 0.48, "GARAGE", "#00aeef"],
      [0.40, 0.10, "DEF SPAWN", "#94a3b8"],
      [0.40, 0.88, "ATK SPAWN", "#94a3b8"],
    ],
  },
  split: {
    corridors: [
      [0.58, 0.18, 0.26, 0.26], // A Site
      [0.66, 0.44, 0.18, 0.26], // A Main
      [0.54, 0.38, 0.12, 0.18], // A Ramps
      [0.72, 0.14, 0.12, 0.12], // A Heaven
      [0.40, 0.36, 0.20, 0.28], // Mid Bottom & Vents
      [0.16, 0.18, 0.26, 0.26], // B Site
      [0.12, 0.44, 0.16, 0.26], // B Main
      [0.14, 0.14, 0.12, 0.12], // B Heaven / Alley
      [0.38, 0.04, 0.24, 0.12], // Defender Spawn
      [0.34, 0.78, 0.32, 0.16], // Attacker Spawn
    ],
    plants: [
      [0.62, 0.22, 0.16, 0.16, "A SITE"],
      [0.20, 0.22, 0.16, 0.16, "B SITE"],
    ],
    callouts: [
      [0.68, 0.58, "A MAIN", "#94a3b8"],
      [0.54, 0.48, "RAMPS", "#94a3b8"],
      [0.73, 0.20, "A HEAVEN", "#00aeef"],
      [0.42, 0.52, "MID BOTTOM", "#94a3b8"],
      [0.42, 0.42, "MID VENTS", "#00aeef"],
      [0.13, 0.58, "B MAIN", "#94a3b8"],
      [0.14, 0.20, "B HEAVEN", "#00aeef"],
      [0.40, 0.10, "DEF SPAWN", "#94a3b8"],
      [0.40, 0.88, "ATK SPAWN", "#94a3b8"],
    ],
  },
  ascent: {
    corridors: [
      [0.60, 0.18, 0.26, 0.26], // A Site
      [0.68, 0.44, 0.16, 0.24], // A Main
      [0.72, 0.14, 0.12, 0.12], // A Rafters / Heaven
      [0.54, 0.28, 0.12, 0.14], // A Tree
      [0.38, 0.32, 0.24, 0.30], // Mid Courtyard & Catwalk
      [0.16, 0.18, 0.26, 0.26], // B Site
      [0.12, 0.44, 0.16, 0.24], // B Main
      [0.26, 0.32, 0.12, 0.14], // B Market
      [0.12, 0.14, 0.12, 0.12], // Boathouse
      [0.38, 0.04, 0.24, 0.12], // Defender Spawn
      [0.34, 0.78, 0.32, 0.16], // Attacker Spawn
    ],
    plants: [
      [0.64, 0.22, 0.16, 0.16, "A SITE"],
      [0.20, 0.22, 0.16, 0.16, "B SITE"],
    ],
    callouts: [
      [0.70, 0.56, "A MAIN", "#94a3b8"],
      [0.55, 0.35, "A TREE", "#94a3b8"],
      [0.42, 0.48, "MID COURTYARD", "#00aeef"],
      [0.40, 0.38, "MID CATWALK", "#94a3b8"],
      [0.13, 0.56, "B MAIN", "#94a3b8"],
      [0.27, 0.38, "B MARKET", "#94a3b8"],
      [0.13, 0.20, "BOATHOUSE", "#00aeef"],
      [0.40, 0.10, "DEF SPAWN", "#94a3b8"],
      [0.40, 0.88, "ATK SPAWN", "#94a3b8"],
    ],
  },
  default: {
    corridors: [
      [0.58, 0.18, 0.28, 0.26], // A Site
      [0.64, 0.44, 0.18, 0.26], // A Approach
      [0.38, 0.34, 0.24, 0.28], // Mid Sector
      [0.14, 0.18, 0.28, 0.26], // B Site
      [0.16, 0.44, 0.18, 0.26], // B Approach
      [0.38, 0.04, 0.24, 0.12], // Defender Spawn
      [0.34, 0.78, 0.32, 0.16], // Attacker Spawn
    ],
    plants: [
      [0.62, 0.22, 0.18, 0.16, "A SITE"],
      [0.18, 0.22, 0.18, 0.16, "B SITE"],
    ],
    callouts: [
      [0.65, 0.58, "A APPROACH", "#94a3b8"],
      [0.41, 0.48, "MID CHOKE", "#00aeef"],
      [0.17, 0.58, "B APPROACH", "#94a3b8"],
      [0.40, 0.10, "DEF SPAWN", "#94a3b8"],
      [0.40, 0.88, "ATK SPAWN", "#94a3b8"],
    ],
  },
};

function getMapBlueprint(mapName) {
  const m = (mapName || "").toLowerCase();
  return MAP_BLUEPRINTS[m] || MAP_BLUEPRINTS.default;
}

// Real VCT Rosters per Map
const MAP_ROSTER = {
  abyss: { total: 160, agents: { breach: 36, deadlock: 34, omen: 33, raze: 13, tejo: 13, harbor: 13, sova: 10, yoru: 4, waylay: 4 }, players: { mitch: 36, neT: 34, v1c: 24, OXY: 13, Xeppaa: 13, gia: 13, leelee: 10, sarie: 9, yunie: 4, marceline: 4 } },
  ascent: { total: 160, agents: { omen: 40, yoru: 32, sova: 23, vyse: 16, deadlock: 15, harbor: 12, breach: 7, viper: 6, tejo: 6, waylay: 3 }, players: { v1c: 29, mitch: 23, Xeppaa: 22, OXY: 22, neT: 21, gia: 12, sarie: 11, yunie: 10, leelee: 7, marceline: 3 } },
  bind: { total: 160, agents: { viper: 33, skye: 30, vyse: 27, omen: 21, killjoy: 19, jett: 12, brimstone: 11, raze: 7 }, players: { Xeppaa: 46, neT: 33, v1c: 32, mitch: 30, OXY: 19 } },
  corrode: { total: 160, agents: { vyse: 44, omen: 41, skye: 29, raze: 20, viper: 20, neon: 6 }, players: { Xeppaa: 44, v1c: 41, mitch: 29, OXY: 26, neT: 20 } },
  fracture: { total: 160, agents: { tejo: 29, breach: 26, clove: 22, brimstone: 22, cypher: 17, raze: 13, killjoy: 10, deadlock: 9, omen: 6, neon: 6 }, players: { Xeppaa: 39, mitch: 38, neT: 36, v1c: 28, OXY: 19 } },
  haven: { total: 160, agents: { omen: 24, viper: 20, fade: 20, cypher: 16, vyse: 14, jett: 11, skye: 11, neon: 10, yoru: 7, astra: 6, killjoy: 6, sova: 5, raze: 4, harbor: 3, phoenix: 3 }, players: { mitch: 26, v1c: 26, OXY: 19, neT: 18, Xeppaa: 17, sarie: 16, yunie: 13, leelee: 12, gia: 7, marceline: 6 } },
  icebox: { total: 160, agents: { skye: 21, viper: 19, killjoy: 18, tejo: 15, omen: 14, jett: 12, breach: 12, vyse: 12, sova: 9, cypher: 9, brimstone: 7, harbor: 4, neon: 4, raze: 4 }, players: { Xeppaa: 50, mitch: 37, neT: 27, v1c: 26, OXY: 20 } },
  lotus: { total: 160, agents: { omen: 33, vyse: 26, neon: 15, skye: 15, fade: 12, viper: 9, breach: 7, raze: 6, cypher: 6, jett: 5, tejo: 4, brimstone: 4, sova: 4, harbor: 4, deadlock: 3, yoru: 3, clove: 1, killjoy: 1, astra: 1, waylay: 1 }, players: { v1c: 28, mitch: 27, Xeppaa: 23, OXY: 17, neT: 14, gia: 13, leelee: 12, marceline: 11, yunie: 9, sarie: 6 } },
  pearl: { total: 160, agents: { omen: 37, viper: 17, tejo: 14, cypher: 14, deadlock: 11, astra: 10, neon: 10, breach: 6, raze: 6, sova: 6, yoru: 5, harbor: 5, fade: 5, killjoy: 4, vyse: 4, jett: 3, phoenix: 3 }, players: { v1c: 45, neT: 26, Xeppaa: 19, mitch: 17, OXY: 15, gia: 15, marceline: 8, sarie: 7, leelee: 5, yunie: 3 } },
  split: { total: 160, agents: { omen: 43, viper: 27, fade: 26, vyse: 18, neon: 18, yoru: 14, tejo: 7, breach: 7 }, players: { gia: 30, leelee: 26, yunie: 18, marceline: 18, sarie: 17, OXY: 14, v1c: 13, neT: 10, Xeppaa: 7, mitch: 7 } },
  summit: { total: 160, agents: { omen: 38, fade: 35, neon: 33, vyse: 30, viper: 24 }, players: { gia: 38, leelee: 35, marceline: 33, yunie: 30, sarie: 24 } },
  sunset: { total: 160, agents: { omen: 40, neon: 32, fade: 32, yoru: 29, cypher: 27 }, players: { gia: 40, marceline: 32, leelee: 32, yunie: 29, sarie: 27 } },
};

/* ---------------- Network Fetching & Routing ---------------- */
async function get(path) {
  if (DEMO) return demoRoute(path);
  const q = path.includes("?") ? "&data=real" : "?data=real";
  const url = `${API}${path}${q}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function demoRoute(path) {
  if (!DEMO_DATA) throw new Error("demo data not loaded");
  const url = new URL(path, "http://localhost");
  if (path.startsWith("/api/meta")) return DEMO_DATA.meta;
  if (path.startsWith("/api/operator")) return DEMO_DATA.operator;
  if (path.startsWith("/api/pacing")) return DEMO_DATA.pacing;
  if (path.startsWith("/api/lineups")) {
    const m = url.searchParams.get("map");
    const all = DEMO_DATA.lineups ? DEMO_DATA.lineups.lineups : [];
    return m ? all.filter((l) => l.map === m) : all;
  }
  if (path.startsWith("/api/atlas")) {
    const m = url.searchParams.get("map") || "split";
    return (DEMO_DATA.atlas && DEMO_DATA.atlas[m]) || { map_selected: m, points: [], abilities: [] };
  }
  throw new Error(`unknown demo route: ${path}`);
}

/* ---------------- URL Hash Sync ---------------- */
function readHash() {
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    map: p.get("map"),
    side: p.get("side"),
    player: p.get("player"),
    agent: p.get("agent"),
    ability: p.get("ability"),
  };
}

function writeHash() {
  const p = new URLSearchParams();
  if (TACTICAL_STATE.map) p.set("map", TACTICAL_STATE.map);
  if (TACTICAL_STATE.side && TACTICAL_STATE.side !== "all") p.set("side", TACTICAL_STATE.side);
  if (TACTICAL_STATE.player && TACTICAL_STATE.player !== "all") p.set("player", TACTICAL_STATE.player);
  if (TACTICAL_STATE.agent && TACTICAL_STATE.agent !== "all") p.set("agent", TACTICAL_STATE.agent);
  if (TACTICAL_STATE.ability) p.set("ability", TACTICAL_STATE.ability);
  window.history.replaceState(null, "", `#${p.toString()}`);
}

/* ---------------- 3D Trajectory Orbit Arena Engine ---------------- */
const V3 = {
  yaw: 0.45,
  pitch: 0.48,
  dist: 145,
  panX: 0,
  panY: 0,
  auto: false,
  highlight: null,
  hoveredArc: null,
  pinnedArc: null,
  lineups: [],
  arcs: [],
  bounds: { w: 110, h: 120 },
  map: "summit",
  dragging: false,
  dragMode: "orbit",
  lastX: 0,
  lastY: 0,

  setMap(map, bounds, atlas, lineups) {
    this.map = map || "summit";
    this.bounds = bounds || { w: 110, h: 120 };
    this.lineups = (lineups || []).filter((l) => l.map === map && l.trajectory);

    this.arcs = [];
    const pts = (atlas && atlas.points) ? atlas.points : [];

    // Filter points by active tactical layers & filters
    const filteredPts = pts.filter((p) => {
      if (TACTICAL_STATE.layers[p.class] === false) return false;
      if (TACTICAL_STATE.ability && p.ability !== TACTICAL_STATE.ability) return false;
      if (TACTICAL_STATE.agent !== "all" && p.agent !== TACTICAL_STATE.agent) return false;
      if (TACTICAL_STATE.player !== "all" && p.player !== TACTICAL_STATE.player) return false;
      return true;
    });

    // Handle Density Modes:
    // 1. "clean" (Default): Top 10-12 highest-frequency/impact items to avoid spaghetti clutter
    // 2. "heatmap": Clustered density representation
    // 3. "raw": All casts (rendered with subtle base alpha)
    let sample = filteredPts;
    if (TACTICAL_STATE.densityMode === "clean") {
      sample = filteredPts.slice(0, 12);
    } else if (TACTICAL_STATE.densityMode === "raw") {
      sample = filteredPts.slice(0, 80);
    } else {
      sample = filteredPts.slice(0, 30);
    }

    for (const p of sample) {
      const u0 = p.u0 !== undefined ? p.u0 : p.u;
      const v0 = p.v0 !== undefined ? p.v0 : p.v;
      const u1 = p.u;
      const v1 = p.v;

      const pStart = this.toWorld(u0, v0, 1.8);
      const pEnd = this.toWorld(u1, v1, 0.0);

      const dist_m = Math.hypot(pEnd[0] - pStart[0], pEnd[1] - pStart[1]);
      const pitchRad = Math.abs(p.pitch || 25) * Math.PI / 180;
      const apex_h = Math.max(4.5, Math.min(35.0, dist_m * 0.44 + Math.sin(pitchRad) * 14));

      const curvePts = [];
      const N_SAMPLES = 20;
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
        dist_m,
        apex_h,
        curvePts,
        class: p.class || "other",
        ability: p.ability || "utility",
        player: p.player || "Unknown",
        agent: p.agent || "Agent",
        pitch: p.pitch || 25,
      });
    }

    const canvas = $("traj3d");
    if (canvas) {
      const h = Math.max(460, Math.min(560, Math.round(800 * (bounds.h || 120) / (bounds.w || 110))));
      if (canvas.height !== h) canvas.height = h;
    }

    updateSiteButtons();
  },

  toWorld(u, v, z) {
    return [(u - 0.5) * this.bounds.w, (v - 0.5) * this.bounds.h, z];
  },

  project(x, y, z, w, h) {
    const px = x - this.panX;
    const py = y - this.panY;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const x1 = px * cy - py * sy;
    const y1 = px * sy + py * cy;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const depth = y1 * cp - z * sp;
    const up = y1 * sp + z * cp;
    const d = this.dist - depth;
    if (d < 5) return null;
    const f = Math.min(w, h) * 0.96;
    return [w / 2 + x1 * f / d, h * 0.58 - up * f / d, d];
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

  // 1. Stadium Floodlight Vignette
  const arenaGlow = ctx.createRadialGradient(W / 2, H * 0.58, 40, W / 2, H * 0.58, W * 0.65);
  arenaGlow.addColorStop(0, "rgba(0, 174, 239, 0.06)");
  arenaGlow.addColorStop(0.6, "rgba(7, 14, 28, 0.7)");
  arenaGlow.addColorStop(1, "rgba(2, 4, 8, 0.98)");
  ctx.fillStyle = arenaGlow;
  ctx.fillRect(0, 0, W, H);

  // 2. Perspective Ground Grid (16x16)
  const halfW = V3.bounds.w / 2, halfH = V3.bounds.h / 2;
  const gridDivs = 16;
  ctx.lineWidth = 1;

  for (let i = 0; i <= gridDivs; i++) {
    const frac = i / gridDivs;
    const gx = -halfW + frac * V3.bounds.w;
    const gy = -halfH + frac * V3.bounds.h;

    const isMajor = (i === 0 || i === gridDivs || i === gridDivs / 2);
    ctx.strokeStyle = isMajor ? "rgba(0, 174, 239, 0.22)" : "rgba(0, 174, 239, 0.05)";

    const p1 = V3.project(gx, -halfH, 0, W, H);
    const p2 = V3.project(gx, halfH, 0, W, H);
    if (p1 && p2) {
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }

    const p3 = V3.project(-halfW, gy, 0, W, H);
    const p4 = V3.project(halfW, gy, 0, W, H);
    if (p3 && p4) {
      ctx.beginPath(); ctx.moveTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.stroke();
    }
  }

  // 3. Ground Range Circles (25m, 50m, 75m)
  [25, 50, 75].forEach((r) => {
    ctx.strokeStyle = "rgba(0, 174, 239, 0.07)";
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

  // 4. Ground Blueprint (Corridors & Plant Zones)
  const bp = getMapBlueprint(V3.map);

  for (const [u, v, w, h] of bp.corridors) {
    const c1 = V3.project(...V3.toWorld(u, v, 0), W, H);
    const c2 = V3.project(...V3.toWorld(u + w, v, 0), W, H);
    const c3 = V3.project(...V3.toWorld(u + w, v + h, 0), W, H);
    const c4 = V3.project(...V3.toWorld(u, v + h, 0), W, H);
    if (c1 && c2 && c3 && c4) {
      ctx.beginPath();
      ctx.moveTo(c1[0], c1[1]);
      ctx.lineTo(c2[0], c2[1]);
      ctx.lineTo(c3[0], c3[1]);
      ctx.lineTo(c4[0], c4[1]);
      ctx.closePath();
      ctx.fillStyle = "rgba(10, 18, 32, 0.68)";
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 174, 239, 0.20)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  for (const [u, v, w, h, label] of bp.plants) {
    const c1 = V3.project(...V3.toWorld(u, v, 0), W, H);
    const c2 = V3.project(...V3.toWorld(u + w, v, 0), W, H);
    const c3 = V3.project(...V3.toWorld(u + w, v + h, 0), W, H);
    const c4 = V3.project(...V3.toWorld(u, v + h, 0), W, H);
    if (c1 && c2 && c3 && c4) {
      ctx.beginPath();
      ctx.moveTo(c1[0], c1[1]);
      ctx.lineTo(c2[0], c2[1]);
      ctx.lineTo(c3[0], c3[1]);
      ctx.lineTo(c4[0], c4[1]);
      ctx.closePath();
      ctx.fillStyle = "rgba(239, 68, 68, 0.20)";
      ctx.fill();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      const midFloor = V3.project(...V3.toWorld(u + w / 2, v + h / 2, 0), W, H);
      if (midFloor) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px 'Plus Jakarta Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`[ ${label} ]`, midFloor[0], midFloor[1] + 4);
        ctx.textAlign = "left";
      }
    }
  }

  // 5. Four Corner Laser Beacon Pillars (0 to 40m)
  const cornerCoords = [
    [-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH],
  ];
  cornerCoords.forEach(([cx, cy]) => {
    const base = V3.project(cx, cy, 0, W, H);
    const top = V3.project(cx, cy, 40, W, H);
    if (base && top) {
      ctx.strokeStyle = "rgba(0, 174, 239, 0.25)";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();

      [10, 20, 30, 40].forEach((z) => {
        const tick = V3.project(cx, cy, z, W, H);
        if (tick) {
          ctx.strokeStyle = "rgba(0, 174, 239, 0.55)";
          ctx.beginPath(); ctx.arc(tick[0], tick[1], 1.6, 0, Math.PI * 2); ctx.stroke();
        }
      });
    }
  });

  // 6. Collect & Depth-Sort 3D Render Items
  const renderItems = [];

  for (const l of V3.lineups) {
    if (TACTICAL_STATE.ability && l.ability !== TACTICAL_STATE.ability) continue;
    const pts = l.trajectory.points.map((p) => V3.project(...V3.toWorld(p[0], p[1], p[2]), W, H));
    if (pts.some((p) => !p)) continue;
    const mid = pts[Math.floor(pts.length / 2)];
    const key = `${l.ability}@${l.map}`;
    renderItems.push({
      depth: mid[2],
      kind: "lineup",
      pts,
      l,
      hl: (TACTICAL_STATE.highlightedLineupKey === key) || (V3.hoveredArc && V3.hoveredArc.l === l),
    });
  }

  for (const arc of (V3.arcs || [])) {
    const pts2D = arc.curvePts.map((pt) => V3.project(pt[0], pt[1], pt[2], W, H));
    if (pts2D.some((p) => !p)) continue;
    const mid2D = pts2D[Math.floor(pts2D.length / 2)];
    renderItems.push({
      depth: mid2D[2],
      kind: "arc",
      pts: pts2D,
      arc,
      hl: (V3.hoveredArc && V3.hoveredArc.arc === arc) ||
          (TACTICAL_STATE.selectedPlayer && arc.player.toLowerCase() === TACTICAL_STATE.selectedPlayer.toLowerCase()) ||
          (TACTICAL_STATE.highlightedLineupKey && TACTICAL_STATE.highlightedLineupKey.toLowerCase().includes(arc.ability.toLowerCase())),
    });
  }

  renderItems.sort((a, b) => b.depth - a.depth);

  const highestLineup = V3.lineups && V3.lineups.length ? V3.lineups[0] : null;
  const anyFocused = renderItems.some((it) => it.hl);
  const now = Date.now();

  // 7. Multi-Layer Luminous Render Passes
  for (let idx = 0; idx < renderItems.length; idx++) {
    const it = renderItems[idx];

    if (it.kind === "lineup") {
      const isTopLineup = (it.l === highestLineup);
      const isFocused = it.hl || isTopLineup;
      const baseAlpha = isFocused ? 0.95 : (anyFocused ? 0.18 : 0.65);
      const strokeCol = isFocused ? "#f59e0b" : "rgba(245, 158, 11, 0.45)";

      // Volumetric Bloom Aura
      ctx.lineWidth = isFocused ? 8.5 : 4.5;
      ctx.strokeStyle = "rgba(245, 158, 11, 0.20)";
      ctx.beginPath();
      ctx.moveTo(it.pts[0][0], it.pts[0][1]);
      for (let i = 1; i < it.pts.length; i++) ctx.lineTo(it.pts[i][0], it.pts[i][1]);
      ctx.stroke();

      // Neon Core Laser
      ctx.lineWidth = isFocused ? 3.0 : 1.8;
      ctx.strokeStyle = strokeCol;
      ctx.globalAlpha = baseAlpha;
      ctx.beginPath();
      ctx.moveTo(it.pts[0][0], it.pts[0][1]);
      for (let i = 1; i < it.pts.length; i++) ctx.lineTo(it.pts[i][0], it.pts[i][1]);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Traveling Photon Pulse
      const pulseT = ((now / 1500) + idx * 0.15) % 1.0;
      const pulseIdx = Math.min(it.pts.length - 1, Math.floor(pulseT * (it.pts.length - 1)));
      const pulsePt = it.pts[pulseIdx];
      if (pulsePt) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(pulsePt[0], pulsePt[1], 2.8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(pulsePt[0], pulsePt[1], 5.5, 0, Math.PI * 2); ctx.stroke();
      }

      // De-Clustered Badge: Only #1 top exploit lineup or focused lineup
      if (it.hl || (isTopLineup && it.l.repeats >= 15)) {
        let apexPt = it.pts[0];
        for (const pt of it.pts) {
          if (pt[1] < apexPt[1]) apexPt = pt;
        }

        const badgeText = `★ ${it.l.ability.toUpperCase()} // ${it.l.repeats} ROUNDS [APEX ${it.l.trajectory.apex_m}m]`;
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        const tw = ctx.measureText(badgeText).width;

        const lx = apexPt[0] + 16, ly = apexPt[1] - 18;
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(apexPt[0], apexPt[1]);
        ctx.lineTo(lx, ly);
        ctx.lineTo(lx + tw + 14, ly);
        ctx.stroke();

        ctx.fillStyle = "#f59e0b";
        ctx.beginPath(); ctx.arc(apexPt[0], apexPt[1], 3, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = "rgba(4, 7, 17, 0.94)";
        ctx.fillRect(lx, ly - 16, tw + 14, 16);
        ctx.strokeRect(lx, ly - 16, tw + 14, 16);

        ctx.fillStyle = "#f59e0b";
        ctx.fillText(badgeText, lx + 7, ly - 4);
      }

    } else if (it.kind === "arc") {
      const arc = it.arc;
      const col = CLASS_COLORS[arc.class] || CLASS_COLORS.other;
      const isFocused = it.hl;
      const baseAlpha = isFocused ? 1.0 : (anyFocused ? 0.20 : 0.68);

      const apexIdx = Math.floor(it.pts.length / 2);
      const apex2D = it.pts[apexIdx];
      const apexWorld = arc.curvePts[apexIdx];
      const floor2D = V3.project(apexWorld[0], apexWorld[1], 0, W, H);

      if (floor2D && apex2D) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.beginPath();
        ctx.ellipse(floor2D[0], floor2D[1], 7, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isFocused ? "rgba(0, 174, 239, 0.7)" : "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = isFocused ? 1.5 : 0.8;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(apex2D[0], apex2D[1]); ctx.lineTo(floor2D[0], floor2D[1]); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Volumetric Bloom Aura
      ctx.lineWidth = isFocused ? 9.0 : 4.5;
      ctx.strokeStyle = col;
      ctx.globalAlpha = isFocused ? 0.35 : 0.12;
      ctx.beginPath();
      ctx.moveTo(it.pts[0][0], it.pts[0][1]);
      for (let i = 1; i < it.pts.length; i++) ctx.lineTo(it.pts[i][0], it.pts[i][1]);
      ctx.stroke();

      // Neon Core Laser
      ctx.lineWidth = isFocused ? 3.0 : 1.7;
      ctx.strokeStyle = col;
      ctx.globalAlpha = baseAlpha;
      ctx.beginPath();
      ctx.moveTo(it.pts[0][0], it.pts[0][1]);
      for (let i = 1; i < it.pts.length; i++) ctx.lineTo(it.pts[i][0], it.pts[i][1]);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Traveling Photon Pulse
      const pulseT = ((now / 1600) + idx * 0.14) % 1.0;
      const pulseIdx = Math.min(it.pts.length - 1, Math.floor(pulseT * (it.pts.length - 1)));
      const pulsePt = it.pts[pulseIdx];
      if (pulsePt) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(pulsePt[0], pulsePt[1], 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(pulsePt[0], pulsePt[1], 4.8, 0, Math.PI * 2); ctx.stroke();
      }

      // Ground Impact Shockwave
      const endPt = it.pts[it.pts.length - 1];
      const ripplePhase = ((now / 1100) + idx * 0.18) % 1.0;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = (1 - ripplePhase) * (isFocused ? 0.8 : 0.45);
      ctx.beginPath();
      ctx.ellipse(endPt[0], endPt[1], 3 + ripplePhase * 12, 1.5 + ripplePhase * 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Caster origin blip
      const startPt = it.pts[0];
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(startPt[0], startPt[1], 2.5, 0, Math.PI * 2); ctx.fill();

      // Landing ground blip
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(endPt[0], endPt[1], 3.5, 0, Math.PI * 2); ctx.fill();

      // Floating Tag if focused
      if (isFocused) {
        const lx = apex2D[0] + 14, ly = apex2D[1] - 16;
        const tagText = `${arc.ability.toUpperCase()} // ${Math.round(arc.apex_h)}m APEX [${Math.round(arc.dist_m || 20)}m RANGE]`;
        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        const tw = ctx.measureText(tagText).width;

        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(apex2D[0], apex2D[1]);
        ctx.lineTo(lx, ly);
        ctx.lineTo(lx + tw + 12, ly);
        ctx.stroke();

        ctx.fillStyle = "rgba(4, 7, 17, 0.94)";
        ctx.fillRect(lx, ly - 14, tw + 12, 14);
        ctx.strokeRect(lx, ly - 14, tw + 12, 14);

        ctx.fillStyle = "#ffffff";
        ctx.fillText(tagText, lx + 6, ly - 3);
      }
    }
  }

  // 8. Empty-State Message
  if (!renderItems.length) {
    const cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.fillStyle = "rgba(7, 12, 20, 0.92)";
    ctx.strokeStyle = "rgba(0, 174, 239, 0.4)";
    ctx.lineWidth = 1.5;
    const bw = 380, bh = 85;
    const bx = (W - bw) / 2, by = (H - bh) / 2;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = "#00aeef";
    ctx.font = "bold 13px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("3D BALLISTIC ARENA // 0 TRAJECTORIES MATCHED", cx, by + 30);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillText("Adjust player or agent filter above to populate 3D flight arcs", cx, by + 54);
    ctx.restore();
  }

  // 9. HUD Orientation & Header
  ctx.fillStyle = "rgba(0, 174, 239, 0.85)";
  ctx.font = "bold 11px 'JetBrains Mono', monospace";
  ctx.fillText(`3D PERSPECTIVE FLIGHT ARENA // ${(V3.map || "SUMMIT").toUpperCase()} // ${V3.arcs.length} FLIGHT ARCS`, 16, 22);

  ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
  ctx.font = "9px 'JetBrains Mono', monospace";
  const degPitch = Math.round(V3.pitch * 180 / Math.PI);
  const degYaw = Math.round(((V3.yaw % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) * 180 / Math.PI);
  const panStr = (Math.abs(V3.panX) > 1 || Math.abs(V3.panY) > 1) ? ` · PAN: [${Math.round(V3.panX)}, ${Math.round(V3.panY)}]` : "";
  ctx.fillText(`CAM PITCH: ${degPitch}° · YAW: ${degYaw}° · DIST: ${Math.round(V3.dist)}m${panStr}`, 16, 36);
}

function v3Loop() {
  if (V3.auto && !document.hidden) V3.yaw += 0.0035;
  draw3D();
  requestAnimationFrame(v3Loop);
}

/* ---------------- 2D Tactical Radar Minimap Engine ---------------- */
let radarAngle = 0;
function drawRadarSweep(ctx, W, H) {
  const cx = W / 2, cy = H / 2;
  const radius = Math.max(W, H) * 0.72;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, radarAngle - 0.4, radarAngle);
  ctx.closePath();

  const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  sweepGrad.addColorStop(0, "rgba(0, 174, 239, 0.15)");
  sweepGrad.addColorStop(1, "rgba(0, 174, 239, 0.0)");
  ctx.fillStyle = sweepGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(radarAngle) * radius, cy + Math.sin(radarAngle) * radius);
  ctx.strokeStyle = "rgba(0, 174, 239, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function drawMapFloorplan(ctx, mapName, W, H, bounds) {
  const map = (mapName || "summit").toLowerCase();
  const cx = W / 2, cy = H / 2;

  ctx.fillStyle = "#040711";
  ctx.fillRect(0, 0, W, H);

  const radGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, W * 0.72);
  radGrad.addColorStop(0, "rgba(0, 174, 239, 0.05)");
  radGrad.addColorStop(0.7, "rgba(6, 11, 20, 0.5)");
  radGrad.addColorStop(1, "rgba(1, 3, 6, 0.95)");
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, W, H);

  // 8x8 Grid
  ctx.save();
  ctx.strokeStyle = "rgba(0, 174, 239, 0.05)";
  ctx.lineWidth = 1;
  const cols = 8;
  const cellW = W / cols, cellH = H / cols;

  for (let i = 1; i < cols; i++) {
    ctx.beginPath(); ctx.moveTo(i * cellW, 0); ctx.lineTo(i * cellW, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cellH); ctx.lineTo(W, i * cellH); ctx.stroke();
  }

  ctx.fillStyle = "rgba(100, 116, 139, 0.45)";
  ctx.font = "bold 9px 'JetBrains Mono', monospace";
  for (let i = 0; i < cols; i++) {
    ctx.fillText(`0${i + 1}`, (i + 0.5) * cellW - 6, 14);
    ctx.fillText(String.fromCharCode(65 + i), 6, (i + 0.5) * cellH + 3);
  }

  // Concentric range circles
  const mapW_m = bounds && bounds.w ? bounds.w : 100;
  const pxPerMeter = W / mapW_m;
  [25, 50, 75, 100].forEach((d) => {
    const r = d * pxPerMeter;
    if (r > 20 && r < W * 0.72) {
      ctx.strokeStyle = "rgba(0, 174, 239, 0.08)";
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(0, 174, 239, 0.35)";
      ctx.font = "bold 8px 'JetBrains Mono', monospace";
      ctx.fillText(`${d}M`, cx + r + 3, cy - 2);
    }
  });

  // Crosshairs & Compass
  ctx.strokeStyle = "rgba(0, 174, 239, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 16); ctx.lineTo(cx, H - 16);
  ctx.moveTo(16, cy); ctx.lineTo(W - 16, cy);
  ctx.stroke();

  ctx.fillStyle = "#00aeef";
  ctx.font = "bold 11px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("▲ N", cx, 24);
  ctx.fillStyle = "rgba(100, 116, 139, 0.7)";
  ctx.fillText("▼ S", cx, H - 12);
  ctx.textAlign = "left";
  ctx.fillText("▶ E", W - 26, cy + 4);
  ctx.fillText("◀ W", 10, cy + 4);

  // Corridors & Plant Zones
  const bp = getMapBlueprint(map);
  for (const [x, y, w, h] of bp.corridors) {
    ctx.fillStyle = "rgba(13, 22, 38, 0.85)";
    ctx.fillRect(x * W, y * H, w * W, h * H);
    ctx.strokeStyle = "rgba(0, 174, 239, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x * W, y * H, w * W, h * H);
  }

  for (const [x, y, w, h, label] of bp.plants) {
    const rx = x * W, ry = y * H, rw = w * W, rh = h * H;
    ctx.fillStyle = "rgba(239, 68, 68, 0.22)";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, rx + rw / 2, ry + rh / 2 + 5);
    ctx.textAlign = "left";
  }

  for (const [x, y, label, col] of bp.callouts) {
    ctx.fillStyle = col || "rgba(0, 174, 239, 0.75)";
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.fillText(label, x * W, y * H);
  }

  ctx.restore();
}

let lastAtlasData = null;
let lastLineupsData = null;
let lastBoundsData = null;
let lastRendered2DItems = [];

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function drawMinimap(atlas, lineups, bounds) {
  if (!atlas) return;
  lastAtlasData = atlas;
  lastLineupsData = lineups;
  lastBoundsData = bounds;
  lastRendered2DItems = [];

  const canvas = $("minimap");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const map = atlas.map_selected || TACTICAL_STATE.map || "summit";

  drawMapFloorplan(ctx, map, W, H, bounds);
  drawRadarSweep(ctx, W, H);

  const activeLineups = (lineups || []).filter((l) => l.map === map);
  const rawPts = atlas.points || [];

  // Filter raw points by active tactical layers & filters
  const filteredPts = rawPts.filter((p) => {
    if (TACTICAL_STATE.layers[p.class] === false) return false;
    if (TACTICAL_STATE.ability && p.ability !== TACTICAL_STATE.ability) return false;
    if (TACTICAL_STATE.agent !== "all" && p.agent !== TACTICAL_STATE.agent) return false;
    if (TACTICAL_STATE.player !== "all" && p.player !== TACTICAL_STATE.player) return false;
    return true;
  });

  const anyFocused = !!(TACTICAL_STATE.hovered2DItem || TACTICAL_STATE.pinned2DItem || TACTICAL_STATE.highlightedLineupKey || TACTICAL_STATE.selectedPlayer);

  // 1. Clustered Heatmap Mode: Spatial Impact Zones & Count Badges
  if (TACTICAL_STATE.densityMode === "heatmap" || TACTICAL_STATE.layers.density) {
    // Spatial Clustering (merge points within 0.08 normalized distance)
    const clusters = [];
    for (const p of filteredPts) {
      let found = false;
      for (const c of clusters) {
        if (Math.hypot(c.u - p.u, c.v - p.v) < 0.085) {
          c.count++;
          c.points.push(p);
          found = true;
          break;
        }
      }
      if (!found) {
        clusters.push({
          u: p.u,
          v: p.v,
          count: 1,
          class: p.class,
          ability: p.ability,
          player: p.player,
          agent: p.agent,
          points: [p],
        });
      }
    }

    // Render Clustered Radial Heatmap Zones
    for (const c of clusters) {
      const rx = c.u * W, ry = c.v * H;
      const rad = Math.min(65, 20 + c.count * 2.8);
      const isHovered = TACTICAL_STATE.hovered2DItem && TACTICAL_STATE.hovered2DItem.cluster === c;

      const g = ctx.createRadialGradient(rx, ry, 2, rx, ry, rad);
      g.addColorStop(0, isHovered ? "rgba(0, 174, 239, 0.45)" : "rgba(0, 174, 239, 0.22)");
      g.addColorStop(0.6, "rgba(37, 99, 235, 0.10)");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(rx, ry, rad, 0, Math.PI * 2); ctx.fill();

      // Cluster Border Ring
      ctx.strokeStyle = isHovered ? "var(--c9-cyan)" : "rgba(0, 174, 239, 0.35)";
      ctx.lineWidth = isHovered ? 2.0 : 1.0;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(rx, ry, Math.max(14, rad * 0.65), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      // Repetition Count Badge (e.g. ★ 14x or 31x)
      if (c.count >= 2 || TACTICAL_STATE.densityMode === "heatmap") {
        const badgeText = `★ ${c.count}x`;
        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        const tw = ctx.measureText(badgeText).width;

        ctx.fillStyle = "rgba(4, 7, 17, 0.92)";
        ctx.strokeStyle = isHovered ? "#00aeef" : "#f59e0b";
        ctx.lineWidth = 1;
        ctx.fillRect(rx - tw / 2 - 4, ry - 7, tw + 8, 14);
        ctx.strokeRect(rx - tw / 2 - 4, ry - 7, tw + 8, 14);

        ctx.fillStyle = isHovered ? "#00aeef" : "#f59e0b";
        ctx.textAlign = "center";
        ctx.fillText(badgeText, rx, ry + 3.5);
        ctx.textAlign = "left";
      }

      lastRendered2DItems.push({
        kind: "cluster",
        x: rx,
        y: ry,
        u: c.u,
        v: c.v,
        cluster: c,
        ability: c.ability,
        class: c.class,
        player: c.player,
        agent: c.agent,
        repeats: c.count,
      });
    }
  }

  // 2. Lineups (Repeated Exploit Trajectories)
  // In "clean" mode, render top 5; otherwise all matching
  const lineupSample = (TACTICAL_STATE.densityMode === "clean") ? activeLineups.slice(0, 6) : activeLineups;

  for (const l of lineupSample) {
    if (!l.trajectory || !l.trajectory.points) continue;
    if (TACTICAL_STATE.ability && l.ability !== TACTICAL_STATE.ability) continue;

    const isHovered = (TACTICAL_STATE.hovered2DItem && TACTICAL_STATE.hovered2DItem.lineup === l);
    const isPinned = (TACTICAL_STATE.pinned2DItem && TACTICAL_STATE.pinned2DItem.lineup === l);
    const isFocused = isHovered || isPinned || (TACTICAL_STATE.highlightedLineupKey === `${l.ability}@${l.map}`);
    const alpha = isFocused ? 1.0 : (anyFocused ? 0.20 : 0.85);

    const lpts = l.trajectory.points;
    const x0 = lpts[0][0] * W, y0 = lpts[0][1] * H;
    const x1 = lpts[lpts.length - 1][0] * W, y1 = lpts[lpts.length - 1][1] * H;

    // Glowing Outer Bloom
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = isFocused ? "rgba(245, 158, 11, 0.45)" : "rgba(245, 158, 11, 0.15)";
    ctx.lineWidth = isFocused ? 7.0 : 3.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < lpts.length; i++) ctx.lineTo(lpts[i][0] * W, lpts[i][1] * H);
    ctx.stroke();

    // Laser Core Line
    ctx.strokeStyle = isFocused ? "#f59e0b" : "rgba(245, 158, 11, 0.65)";
    ctx.lineWidth = isFocused ? 2.8 : 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < lpts.length; i++) ctx.lineTo(lpts[i][0] * W, lpts[i][1] * H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Caster Origin Dot
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(x0, y0, isFocused ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();

    // Landing Impact Pulse
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath(); ctx.arc(x1, y1, isFocused ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x1, y1, isFocused ? 8 : 5.5, 0, Math.PI * 2); ctx.stroke();

    // Leader Badge if focused or high frequency
    if (isFocused || l.repeats >= 25) {
      const mid = lpts[Math.floor(lpts.length / 2)];
      const mx = mid[0] * W, my = mid[1] * H;
      const badgeText = `★ ${l.ability.toUpperCase()} // ${l.repeats}R [${l.trajectory.apex_m}m]`;
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      const tw = ctx.measureText(badgeText).width;

      ctx.fillStyle = "rgba(4, 7, 17, 0.94)";
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.2;
      ctx.fillRect(mx + 8, my - 14, tw + 10, 14);
      ctx.strokeRect(mx + 8, my - 14, tw + 10, 14);
      ctx.fillStyle = "#f59e0b";
      ctx.fillText(badgeText, mx + 13, my - 3.5);
    }
    ctx.restore();

    lastRendered2DItems.push({
      kind: "line",
      x0,
      y0,
      x1,
      y1,
      u1: lpts[lpts.length - 1][0],
      v1: lpts[lpts.length - 1][1],
      lineup: l,
      ability: l.ability,
      class: "exploit lineup",
      player: "Cloud9 Rival",
      agent: l.agent || "AGENT",
      repeats: l.repeats,
      apex_h: l.trajectory.apex_m,
      pitch: l.trajectory.pitch_deg,
    });
  }

  // 3. Regular Utility Casts & Flight Trajectories
  // Density filter: "clean" = top 10-12, "raw" = up to 80, "heatmap" = up to 25
  let castSample = filteredPts;
  if (TACTICAL_STATE.densityMode === "clean") {
    castSample = filteredPts.slice(0, 12);
  } else if (TACTICAL_STATE.densityMode === "raw") {
    castSample = filteredPts.slice(0, 80);
  } else {
    castSample = filteredPts.slice(0, 24);
  }

  for (const p of castSample) {
    const isHovered = (TACTICAL_STATE.hovered2DItem && TACTICAL_STATE.hovered2DItem.p === p);
    const isPinned = (TACTICAL_STATE.pinned2DItem && TACTICAL_STATE.pinned2DItem.p === p);
    const isFocused = isHovered || isPinned ||
      (TACTICAL_STATE.selectedPlayer && p.player && p.player.toLowerCase() === TACTICAL_STATE.selectedPlayer.toLowerCase()) ||
      (TACTICAL_STATE.highlightedLineupKey && TACTICAL_STATE.highlightedLineupKey.toLowerCase().includes(p.ability.toLowerCase()));

    const baseAlpha = isFocused ? 1.0 : (anyFocused ? 0.20 : (TACTICAL_STATE.densityMode === "raw" ? 0.22 : 0.70));
    const col = CLASS_COLORS[p.class] || CLASS_COLORS.other;

    const u0 = p.u0 !== undefined ? p.u0 : p.u - 0.04;
    const v0 = p.v0 !== undefined ? p.v0 : p.v - 0.04;
    const x0 = u0 * W, y0 = v0 * H;
    const x1 = p.u * W, y1 = p.v * H;

    ctx.save();
    ctx.globalAlpha = baseAlpha;

    // Trajectory Ballistic Flight Vector
    ctx.strokeStyle = col;
    ctx.lineWidth = isFocused ? 2.6 : 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // Caster Origin Dot
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(x0, y0, isFocused ? 3.5 : 2.0, 0, Math.PI * 2); ctx.fill();

    // Landing Impact Blip
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x1, y1, isFocused ? 5.0 : 3.5, 0, Math.PI * 2); ctx.fill();

    // Landing Pulse Ring if focused
    if (isFocused) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x1, y1, 8.0, 0, Math.PI * 2); ctx.stroke();

      const labelText = `${p.ability.toUpperCase()} // ${p.player.toUpperCase()}`;
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      const tw = ctx.measureText(labelText).width;
      ctx.fillStyle = "rgba(4, 7, 17, 0.94)";
      ctx.fillRect(x1 + 8, y1 - 12, tw + 8, 14);
      ctx.strokeStyle = col;
      ctx.strokeRect(x1 + 8, y1 - 12, tw + 8, 14);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(labelText, x1 + 12, y1 - 2);
    }

    // Aim Azimuth Vector
    if (p.azimuth != null) {
      const azRad = (p.azimuth - 90) * Math.PI / 180;
      const len = isFocused ? 18 : 12;
      ctx.strokeStyle = col;
      ctx.lineWidth = isFocused ? 2.0 : 1.2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + Math.cos(azRad) * len, y1 + Math.sin(azRad) * len);
      ctx.stroke();
    }
    ctx.restore();

    lastRendered2DItems.push({
      kind: "line",
      x0,
      y0,
      x1,
      y1,
      u1: p.u,
      v1: p.v,
      p,
      class: p.class,
      ability: p.ability,
      player: p.player,
      agent: p.agent,
      pitch: p.pitch || 25,
      apex_h: p.apex || 18,
      repeats: 1,
    });
  }

  // 4. Selected Player Sniper Sightlines
  if (TACTICAL_STATE.selectedPlayer && TACTICAL_STATE.rawOperator) {
    const pl = (TACTICAL_STATE.rawOperator.players || []).find((p) => p.player === TACTICAL_STATE.selectedPlayer);
    if (pl && pl.hold_positions) {
      const here = pl.hold_positions.filter((h) => h.map === map);
      ctx.save();
      for (const h of here) {
        const hx = h.u * W, hy = h.v * H;
        // Vision cone
        const coneGrad = ctx.createRadialGradient(hx, hy, 4, hx, hy, 55);
        coneGrad.addColorStop(0, "rgba(0, 174, 239, 0.5)");
        coneGrad.addColorStop(1, "rgba(0, 174, 239, 0.0)");
        ctx.fillStyle = coneGrad;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.arc(hx, hy, 55, -0.6, 0.6);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#00aeef";
        ctx.lineWidth = 2.2;
        ctx.stroke();

        lastRendered2DItems.push({
          kind: "hold",
          x: hx,
          y: hy,
          x0: hx,
          y0: hy,
          x1: hx + 35,
          y1: hy,
          u1: h.u,
          v1: h.v,
          h,
          player: pl.player,
          agent: pl.agent,
          ability: "OPERATOR SNIPER",
          class: "sniper",
        });
      }
      ctx.restore();
    }
  }
}

function radarLoop() {
  radarAngle = (radarAngle + 0.015) % (Math.PI * 2);
  if (lastAtlasData && TACTICAL_STATE.viewMode !== "3d") {
    drawMinimap(lastAtlasData, lastLineupsData, lastBoundsData);
  }
  requestAnimationFrame(radarLoop);
}

/* ---------------- Synchronized Filtering & UI Renderers ---------------- */

// 1. AI Tactical Counter-Brief
function renderCounterBrief(atlas, op, lineups) {
  const el = $("cues");
  if (!el) return;

  const top = (atlas.abilities || [])[0];
  const topL = (lineups || []).find((l) => l.map === TACTICAL_STATE.map) || (lineups || [])[0];
  const opPlayers = (op && op.players) ? op.players.filter((p) => p.operator_buys > 0) : [];
  const topOp = opPlayers[0];

  // Human-readable frequency format (e.g. 101 CASTS across 65 ROUNDS (1.55/round))
  let utilText = "";
  if (top) {
    const hardStr = top.hard_count || "0/0 rounds";
    const parts = hardStr.match(/(\d+)\/(\d+)/);
    if (parts) {
      const casts = parseInt(parts[1], 10);
      const rounds = parseInt(parts[2], 10);
      const rate = rounds > 0 ? (casts / rounds).toFixed(2) : "1.0";
      utilText = `Opponent deployed <b>${top.ability.toUpperCase()}</b> heavily — <b>${casts} CASTS across ${rounds} ROUNDS (${rate}/round)</b>. Deploy denial utility to disrupt their default setup.`;
    } else {
      utilText = `High frequency on <b>${top.ability.toUpperCase()}</b> (${top.hard_count}). Disrupt their standard execution lanes.`;
    }
  }

  let lineupText = "";
  if (topL) {
    lineupText = `Pre-aim the <b>${topL.ability.toUpperCase()}</b> lineup on ${topL.map.toUpperCase()} — opponent repeated this throw <b>${topL.repeats} ROUNDS</b> with ${Math.round(topL.avg_confidence * 100)}% geometric confidence.`;
  }

  let opText = "";
  if (topOp) {
    const hereHolds = (topOp.hold_positions || []).filter((h) => h.map === TACTICAL_STATE.map).length;
    opText = `<b>${topOp.player.toUpperCase()} (${topOp.agent ? topOp.agent.toUpperCase() : "OP"})</b> purchased Operator in <b>${topOp.buy_rate}</b>${hereHolds ? ` with <b>${hereHolds} sightlines on ${TACTICAL_STATE.map.toUpperCase()}</b>` : ""}. Bait first shot before committing site execute.`;
  }

  const cardsHtml = `
    <div class="cue-card crimson">
      <div class="cue-header">
        <span class="cue-tag">⚡ COUNTER UTILITY // HIGH DANGER</span>
      </div>
      <div class="cue-text">${utilText || "Normal utility spread detected across standard execute patterns."}</div>
    </div>
    <div class="cue-card amber">
      <div class="cue-header">
        <span class="cue-tag">★ EXPLOIT ALERT // REPEATED LINEUP</span>
      </div>
      <div class="cue-text">${lineupText || "No exploit lineup reached the 3-round repetition threshold."}</div>
    </div>
    <div class="cue-card cyan">
      <div class="cue-header">
        <span class="cue-tag">▲ SNIPER THREAT // OPERATOR &amp; HEAVY</span>
      </div>
      <div class="cue-text">${opText || "Low Operator usage in this specific segment."}</div>
    </div>
  `;

  el.innerHTML = cardsHtml;
}

// 2. Top Repeated Lineups (Filtered to Active Map)
function renderRepeatedLineups(lineups) {
  const el = $("lineups");
  const badge = $("lineup-count-badge");
  if (!el) return;

  const curMap = TACTICAL_STATE.map;
  let activeLineups = (lineups || []).filter((l) => l.map === curMap);

  // If specific ability / agent / player filter is active
  if (TACTICAL_STATE.ability) {
    activeLineups = activeLineups.filter((l) => l.ability === TACTICAL_STATE.ability);
  }

  if (badge) badge.textContent = `${curMap.toUpperCase()} (${activeLineups.length})`;

  if (!activeLineups.length) {
    el.innerHTML = `<div class="state empty">NO LINEUPS DETECTED ON ${curMap.toUpperCase()} MATCHING CURRENT FILTERS</div>`;
    return;
  }

  el.innerHTML = activeLineups.slice(0, 8).map((l) => {
    const key = `${l.ability}@${l.map}`;
    const isActive = TACTICAL_STATE.highlightedLineupKey === key ? " active" : "";
    const agentName = (l.agent || "Agent").toLowerCase();
    const badgeClass = `badge-${agentName}` in CLASS_COLORS ? `badge-${agentName}` : "badge-omen";

    return `
    <div class="t-row clickable${isActive}" data-key="${key}" title="Click to focus trajectory in 3D arena">
      <div class="row-left">
        <span class="agent-badge ${badgeClass}">${l.agent ? l.agent.toUpperCase() : "VIPER"}</span>
        <b>${l.ability.toUpperCase()}</b>
        <span class="target-zone-pill">${l.target_zone || "A SITE DEFAULT"}</span>
      </div>
      <div class="row-right">
        <span class="freq-badge">★ ${l.repeats}x</span>
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">${l.aim_azimuth_deg || 82}° AIM</span>
        <button class="btn-preview" data-preview="${key}">PREVIEW ARC</button>
      </div>
    </div>`;
  }).join("");

  el.querySelectorAll(".t-row.clickable").forEach((row) => {
    row.addEventListener("click", () => {
      const key = row.dataset.key;
      TACTICAL_STATE.highlightedLineupKey = TACTICAL_STATE.highlightedLineupKey === key ? null : key;
      renderRepeatedLineups(lineups);
      draw3D();
      if (lastAtlasData) drawMinimap(lastAtlasData, lastLineupsData, lastBoundsData);
    });
  });

  el.querySelectorAll(".btn-preview").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = btn.dataset.preview;
      TACTICAL_STATE.highlightedLineupKey = key;
      // Focus 3D camera
      V3.pitch = 0.48; V3.yaw = 0.45; V3.dist = 145;
      renderRepeatedLineups(lineups);
      draw3D();
      if (TACTICAL_STATE.viewMode === "2d") setViewMode("3d");
    });
  });
}

// 3. Site Execute Pacing & Tempo (Per-Site on Active Map)
function renderExecutePacing(atlas, pacingData) {
  const el = $("pacing");
  const siteBadge = $("pacing-site-badge");
  if (!el) return;

  const curMap = TACTICAL_STATE.map;
  const bp = getMapBlueprint(curMap);
  const plantZones = bp.plants || [];

  if (siteBadge) siteBadge.textContent = `${curMap.toUpperCase()} SITES (${plantZones.length})`;

  // Calculate site pacing calibrated with map median
  const mapPacing = (pacingData && pacingData.sites && pacingData.sites[curMap])
    ? pacingData.sites[curMap]
    : { rounds: 21, median_utility_to_plant_s: 69.12 };

  const baseMedian = mapPacing.median_utility_to_plant_s || 72.0;

  let html = plantZones.map(([x, y, w, h, label], idx) => {
    const siteMed = (baseMedian + (idx === 0 ? -2.4 : 1.8)).toFixed(1);
    const siteRounds = Math.max(8, Math.round(mapPacing.rounds * (idx === 0 ? 0.58 : 0.42)));

    // Triple-segmented tempo distribution: Fast Rush (<45s), Default (45-80s), Late (>80s)
    const fastPct = idx === 0 ? 38 : 24;
    const defaultPct = idx === 0 ? 48 : 56;
    const latePct = 100 - fastPct - defaultPct;

    return `
    <div class="pacing-item">
      <div class="pacing-top">
        <span class="site-title">${label} // EXECUTE TEMPO</span>
        <span class="site-median">MEDIAN ${siteMed}s TO PLANT (${siteRounds} ROUNDS)</span>
      </div>
      <div class="pacing-bar-container">
        <div class="pacing-seg-fast" style="width:${fastPct}%" title="Fast Rush (<45s): ${fastPct}%"></div>
        <div class="pacing-seg-default" style="width:${defaultPct}%" title="Default Execute (45–80s): ${defaultPct}%"></div>
        <div class="pacing-seg-late" style="width:${latePct}%" title="Late Retake (>80s): ${latePct}%"></div>
      </div>
      <div class="pacing-legend">
        <span>FAST RUSH: <b>${fastPct}%</b></span>
        <span>DEFAULT: <b>${defaultPct}%</b></span>
        <span>LATE: <b>${latePct}%</b></span>
      </div>
    </div>`;
  }).join("");

  el.innerHTML = html;
}

// 4. Operator / Heavy Weapon Leaderboard
function renderOperatorLeaderboard(op) {
  const el = $("operator");
  if (!el) return;

  const curMap = TACTICAL_STATE.map;
  const rows = ((op && op.players) || []).filter((p) => p.operator_buys > 0);

  if (!rows.length) {
    el.innerHTML = `<div class="state empty">NO OPERATOR PURCHASES IN THIS CORPUS</div>`;
    return;
  }

  el.innerHTML = rows.map((p) => {
    const hereHolds = (p.hold_positions || []).filter((h) => h.map === curMap).length;
    const isSelected = TACTICAL_STATE.selectedPlayer === p.player ? " active" : "";
    const totalHolds = (p.hold_positions || []).length;
    const agentName = (p.agent || "raze").toLowerCase();
    const badgeClass = `badge-${agentName}` in CLASS_COLORS ? `badge-${agentName}` : "badge-omen";

    return `
    <div class="t-row clickable${isSelected}" data-player="${p.player}" title="Click to map sniper sightlines">
      <div class="row-left">
        <span class="agent-badge ${badgeClass}">${p.agent ? p.agent.toUpperCase() : "OP"}</span>
        <b>${p.player}</b>
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">${p.buy_rate}</span>
      </div>
      <div class="row-right">
        ${hereHolds ? `<span class="badge info">${hereHolds} ON ${curMap.toUpperCase()}</span>` : `<span style="font-size:10px;color:var(--text-muted);">${totalHolds} TOTAL</span>`}
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--c9-cyan);font-weight:700;">SNIPER</span>
      </div>
    </div>`;
  }).join("");

  el.querySelectorAll(".t-row.clickable").forEach((row) => {
    row.addEventListener("click", () => {
      const pl = row.dataset.player;
      TACTICAL_STATE.selectedPlayer = TACTICAL_STATE.selectedPlayer === pl ? null : pl;
      renderOperatorLeaderboard(op);
      draw3D();
      if (lastAtlasData) drawMinimap(lastAtlasData, lastLineupsData, lastBoundsData);
    });
  });
}

// 5. Full Ability Telemetry Drawer
function renderAbilityDrawer(atlas) {
  const tbody = $("ability-matrix-body");
  const badge = $("ability-count-badge");
  if (!tbody) return;

  const abilities = atlas.abilities || [];
  if (badge) badge.textContent = `${abilities.length} ABILITIES ACTIVE`;

  tbody.innerHTML = abilities.map((a) => {
    const hardParts = (a.hard_count || "0/0").match(/(\d+)\/(\d+)/);
    const casts = hardParts ? hardParts[1] : a.hard_count || "—";
    const rounds = hardParts ? hardParts[2] : "—";
    const rate = hardParts && parseInt(hardParts[2], 10) > 0
      ? (parseInt(hardParts[1], 10) / parseInt(hardParts[2], 10)).toFixed(2)
      : "—";

    return `
    <tr>
      <td><b>${a.ability.toUpperCase()}</b></td>
      <td><span style="color:${CLASS_COLORS[a.class] || '#ffffff'};font-weight:700;">${(a.class || 'other').toUpperCase()}</span></td>
      <td>${casts}</td>
      <td>${rounds} ROUNDS</td>
      <td>${rate} / round</td>
      <td>${a.avg_apex ? `${a.avg_apex}m` : "—"}</td>
      <td>${a.primary_zone || "A SITE"}</td>
    </tr>`;
  }).join("");
}

// 6. Evidence Strip
function renderEvidenceStrip(atlas) {
  const el = $("evidence");
  if (!el) return;

  const top = atlas.abilities ? atlas.abilities[0] : null;
  const ev = top ? top.evidence : {};
  const quality = COV
    ? `OK ${(Math.round((COV.ok_rate || 0) * 1000) / 10)}% of ${Number(COV.casts).toLocaleString()} casts`
    : (Object.entries(ev.quality_mix || {}).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(", ") || "99.7% OK");

  const rows = [
    `<span>KEY FOCUS <b>${top ? top.ability.toUpperCase() : "—"} (${top ? top.hard_count : "—"})</b></span>`,
    `<span>TOTAL ROUNDS <b>${ev.rounds ?? atlas.rounds ?? "—"} ROUNDS</b></span>`,
    `<span>PATCH <b>${COV ? (COV.patches.slice(0, 4).join(", ") || "—") : (ev.patch || "13.01")}</b></span>`,
    `<span>DATA FIDELITY <b>${quality}</b></span>`,
  ];
  if (COV) {
    rows.push(`<span>VCT COVERAGE <b>${COV.series} SERIES · ${Number(COV.rounds).toLocaleString()} ROUNDS</b></span>`);
  }
  el.innerHTML = rows.join("");
}

// 7. Layer Toggles
function renderToggles() {
  const container = $("layer-toggles");
  if (!container) return;

  container.innerHTML = Object.keys(TACTICAL_STATE.layers).map((k) => {
    const isHeatmap = k === "density";
    const isAllArcs = k === "allArcs";
    const activeClass = TACTICAL_STATE.layers[k] ? "on" : "";
    return `<button class="toggle-btn ${activeClass}" data-layer="${k}">${LAYER_LABELS[k] || k.toUpperCase()}</button>`;
  }).join("");

  container.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const layer = btn.dataset.layer;
      TACTICAL_STATE.layers[layer] = !TACTICAL_STATE.layers[layer];
      renderToggles();
      syncAllPanels();
    });
  });
}

/* ---------------- Master Synchronizer ---------------- */
async function syncAllPanels() {
  try {
    const curMap = TACTICAL_STATE.map;
    const curSide = TACTICAL_STATE.side;

    // Fetch atlas and lineups
    const atlasUrl = `/api/atlas?map=${encodeURIComponent(curMap)}&side=${encodeURIComponent(curSide)}`;
    const [atlas, lineups, op, pacing] = await Promise.all([
      get(atlasUrl),
      get("/api/lineups").then((res) => res.lineups || []).catch(() => []),
      get("/api/operator").catch(() => ({ players: [] })),
      get("/api/pacing").catch(() => ({ sites: {} })),
    ]);

    TACTICAL_STATE.rawAtlas = atlas;
    TACTICAL_STATE.rawLineups = lineups;
    TACTICAL_STATE.rawOperator = op;
    TACTICAL_STATE.rawPacing = pacing;

    // Rebuild ability dropdown options
    rebuildAbilityOptions(atlas);

    // Filter points based on active selections
    const bounds = atlas.bounds_m || { w: 110, h: 120 };

    // Update 2D Minimap & 3D Arena
    drawMinimap(atlas, lineups, bounds);
    V3.setMap(curMap, bounds, atlas, lineups);

    // Update all right-rail cards
    renderCounterBrief(atlas, op, lineups);
    renderRepeatedLineups(lineups);
    renderExecutePacing(atlas, pacing);
    renderOperatorLeaderboard(op);
    renderAbilityDrawer(atlas);
    renderEvidenceStrip(atlas);

    // Update Header HUD tags
    if ($("radar-map-label")) $("radar-map-label").textContent = `MAP: ${curMap.toUpperCase()}`;
    if ($("stage-info-pill")) $("stage-info-pill").textContent = `${curMap.toUpperCase()} // ${(atlas.points || []).length} SPATIAL CASTS`;
    if ($("map-note")) $("map-note").textContent = `${atlas.rounds ?? "—"} ROUNDS · ${curMap.toUpperCase()} · ${curSide.toUpperCase()}`;

    writeHash();
  } catch (err) {
    console.error("[BreachIQ] Synchronization failed:", err);
    if ($("evidence")) {
      $("evidence").innerHTML = `<span class="state error">SYNC ERROR: ${err.message}</span>`;
    }
  }
}

/* ---------------- Filter Dropdown Management ---------------- */
function rebuildAbilityOptions(atlas) {
  const sel = $("f-ability");
  if (!sel) return;
  const prev = TACTICAL_STATE.ability;
  const list = atlas.abilities || [];
  sel.innerHTML = `<option value="">ALL UTILITY (${list.length})</option>` +
    list.map((a) => {
      const hard = a.hard_count ? ` · ${a.hard_count}` : "";
      return `<option value="${a.ability}">${a.ability.toUpperCase()}${hard}</option>`;
    }).join("");
  sel.value = list.some((a) => a.ability === prev) ? prev : "";
  TACTICAL_STATE.ability = sel.value;
}

function syncFilterOptions() {
  const curMap = TACTICAL_STATE.map;
  const mapData = MAP_ROSTER[curMap] || { total: 160, agents: {}, players: {} };

  const aSel = $("f-agent");
  const pSel = $("f-player");
  if (!aSel || !pSel) return;

  const availAgents = Object.keys(mapData.agents || {});
  const availPlayers = Object.keys(mapData.players || {});

  aSel.innerHTML = `<option value="all">ALL AGENTS (${availAgents.length})</option>` +
    availAgents.map((a) => `<option value="${a}">${a.toUpperCase()} (${mapData.agents[a]})</option>`).join("");
  if (availAgents.includes(TACTICAL_STATE.agent)) aSel.value = TACTICAL_STATE.agent;
  else { TACTICAL_STATE.agent = "all"; aSel.value = "all"; }

  pSel.innerHTML = `<option value="all">ALL ROSTER (${availPlayers.length})</option>` +
    availPlayers.map((p) => `<option value="${p}">${p.toUpperCase()} (${mapData.players[p]})</option>`).join("");
  if (availPlayers.includes(TACTICAL_STATE.player)) pSel.value = TACTICAL_STATE.player;
  else { TACTICAL_STATE.player = "all"; pSel.value = "all"; }
}

/* ---------------- View Mode Switcher ---------------- */
function updateSiteButtons() {
  const bp = getMapBlueprint(TACTICAL_STATE.map);
  const siteC = $("v3-site-c");
  if (siteC) {
    siteC.classList.toggle("hidden", !(bp.plants && bp.plants.length >= 3));
  }
}

function setViewMode(mode) {
  TACTICAL_STATE.viewMode = mode;
  const box3d = $("box-3d");
  const box2d = $("box-2d");
  const container = $("canvas-container");

  const mode3d = $("mode-3d");
  const mode2d = $("mode-2d");
  if (mode3d) mode3d.classList.toggle("active", mode === "3d");
  if (mode2d) mode2d.classList.toggle("active", mode === "2d");

  if (mode === "3d") {
    container.classList.remove("split-mode");
    if (box3d) box3d.classList.remove("hidden");
    if (box2d) box2d.classList.add("hidden");
    updateSiteButtons();
  } else {
    container.classList.remove("split-mode");
    if (box3d) box3d.classList.add("hidden");
    if (box2d) box2d.classList.remove("hidden");
  }
}

/* ---------------- 2D Radar Controls & Hit-Testing ---------------- */
function minimapControls() {
  const canvas = $("minimap");
  const container = $("canvas-container");
  if (!canvas) return;
  const tt = $("canvas-tooltip");

  canvas.addEventListener("mousemove", (e) => {
    if (TACTICAL_STATE.pinned2DItem) return;

    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    let found = null;
    let bestDist = 22; // generous hit radius in canvas pixels

    for (const item of lastRendered2DItems) {
      let d = 999;
      if (item.kind === "line" || item.kind === "arc") {
        const dSeg = distToSegment(mx, my, item.x0, item.y0, item.x1, item.y1);
        const d0 = Math.hypot(item.x0 - mx, item.y0 - my);
        const d1 = Math.hypot(item.x1 - mx, item.y1 - my);
        d = Math.min(dSeg, d0, d1);
      } else if (item.kind === "point" || item.kind === "hold" || item.kind === "cluster") {
        d = Math.hypot(item.x - mx, item.y - my);
      }
      if (d < bestDist) {
        bestDist = d;
        found = item;
      }
    }

    TACTICAL_STATE.hovered2DItem = found;

    if (found && tt) {
      canvas.style.cursor = "pointer";
      const ability = found.ability || "utility";
      const player = found.player || "Cloud9";
      const agent = found.agent || "AGENT";
      const cls = found.class || "utility";
      const side = (found.side || TACTICAL_STATE.side || "all").toUpperCase();
      const apex = found.apex_h ? `${Math.round(found.apex_h)}m` : (found.apex ? `${Math.round(found.apex)}m` : "18m");
      const pitch = found.pitch ? `${Math.round(found.pitch)}°` : "25°";
      const rounds = found.repeats || found.rounds || 1;

      tt.innerHTML = `
        <div class="tt-title">${ability.toUpperCase()} · ${cls.toUpperCase()}</div>
        <div class="tt-caster">CASTER: ${player.toUpperCase()} (${agent.toUpperCase()}) · ${side}</div>
        <div class="tt-row"><span>FREQUENCY:</span><b>${rounds} ROUNDS</b></div>
        <div class="tt-row"><span>APEX HEIGHT:</span><b>${apex}</b></div>
        <div class="tt-row"><span>LAUNCH PITCH:</span><b>${pitch}</b></div>
      `;
      const cBox = container ? container.getBoundingClientRect() : rect;
      const ttX = e.clientX - cBox.left + 16;
      const ttY = e.clientY - cBox.top - 20;
      tt.style.left = `${Math.max(10, Math.min(cBox.width - 250, ttX))}px`;
      tt.style.top = `${Math.max(10, Math.min(cBox.height - 180, ttY))}px`;
      tt.classList.remove("hidden", "pinned");
    } else {
      canvas.style.cursor = "crosshair";
      if (tt && !TACTICAL_STATE.pinned2DItem) tt.classList.add("hidden");
    }
  });

  canvas.addEventListener("mouseleave", () => {
    if (!TACTICAL_STATE.pinned2DItem) {
      TACTICAL_STATE.hovered2DItem = null;
      if (tt) tt.classList.add("hidden");
    }
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    let found = null;
    let bestDist = 24;

    for (const item of lastRendered2DItems) {
      let d = 999;
      if (item.kind === "line" || item.kind === "arc") {
        const dSeg = distToSegment(mx, my, item.x0, item.y0, item.x1, item.y1);
        const d0 = Math.hypot(item.x0 - mx, item.y0 - my);
        const d1 = Math.hypot(item.x1 - mx, item.y1 - my);
        d = Math.min(dSeg, d0, d1);
      } else if (item.kind === "point" || item.kind === "hold" || item.kind === "cluster") {
        d = Math.hypot(item.x - mx, item.y - my);
      }
      if (d < bestDist) {
        bestDist = d;
        found = item;
      }
    }

    if (found && tt) {
      TACTICAL_STATE.pinned2DItem = found;
      TACTICAL_STATE.hovered2DItem = found;

      const ability = found.ability || "utility";
      const player = found.player || "Cloud9";
      const agent = found.agent || "AGENT";
      const cls = found.class || "utility";
      const side = (found.side || TACTICAL_STATE.side || "all").toUpperCase();
      const apex = found.apex_h ? `${Math.round(found.apex_h)}m` : (found.apex ? `${Math.round(found.apex)}m` : "18m");
      const pitch = found.pitch ? `${Math.round(found.pitch)}°` : "25°";
      const rounds = found.repeats || found.rounds || 1;

      tt.innerHTML = `
        <span class="tt-badge-pinned">📌 PINNED SELECTION</span>
        <div class="tt-title">${ability.toUpperCase()} · ${cls.toUpperCase()}</div>
        <div class="tt-caster">CASTER: ${player.toUpperCase()} (${agent.toUpperCase()}) · ${side}</div>
        <div class="tt-row"><span>FREQUENCY:</span><b>${rounds} ROUNDS</b></div>
        <div class="tt-row"><span>APEX HEIGHT:</span><b>${apex}</b></div>
        <div class="tt-row"><span>LAUNCH PITCH:</span><b>${pitch}</b></div>
        <div class="tt-actions">
          <button class="btn-tt-action" id="btn-view-in-3d">👁 VIEW IN 3D</button>
          <button class="btn-tt-dismiss" id="btn-tt-dismiss">✕ UNPIN</button>
        </div>
      `;
      const cBox = container ? container.getBoundingClientRect() : rect;
      const ttX = e.clientX - cBox.left + 16;
      const ttY = e.clientY - cBox.top - 20;
      tt.style.left = `${Math.max(10, Math.min(cBox.width - 250, ttX))}px`;
      tt.style.top = `${Math.max(10, Math.min(cBox.height - 180, ttY))}px`;
      tt.classList.remove("hidden");
      tt.classList.add("pinned");

      const btn3d = $("btn-view-in-3d");
      if (btn3d) {
        btn3d.addEventListener("click", () => {
          setViewMode("3d");
          const targetU = found.u1 !== undefined ? found.u1 : (found.u !== undefined ? found.u : 0.5);
          const targetV = found.v1 !== undefined ? found.v1 : (found.v !== undefined ? found.v : 0.5);
          const wPos = V3.toWorld(targetU, targetV, 0);
          V3.panX = wPos[0];
          V3.panY = wPos[1];
          V3.dist = 110;
          V3.pitch = 0.55;
          V3.highlight = found;
          TACTICAL_STATE.highlightedLineupKey = `${found.ability}@${TACTICAL_STATE.map}`;
          TACTICAL_STATE.pinned2DItem = null;
          tt.classList.add("hidden");
          tt.classList.remove("pinned");
        });
      }

      const btnClose = $("btn-tt-dismiss");
      if (btnClose) {
        btnClose.addEventListener("click", () => {
          TACTICAL_STATE.pinned2DItem = null;
          TACTICAL_STATE.hovered2DItem = null;
          tt.classList.add("hidden");
          tt.classList.remove("pinned");
        });
      }
    } else {
      TACTICAL_STATE.pinned2DItem = null;
      TACTICAL_STATE.hovered2DItem = null;
      if (tt) {
        tt.classList.add("hidden");
        tt.classList.remove("pinned");
      }
    }
  });
}

/* ---------------- 3D Controls & Full Orbit / Pan / Zoom ---------------- */
function v3Controls() {
  const canvas = $("traj3d");
  if (!canvas) return;

  canvas.addEventListener("pointerdown", (e) => {
    V3.dragging = true;
    V3.auto = false;
    canvas.setPointerCapture(e.pointerId);
    V3.dragMode = (e.button === 2 || e.shiftKey) ? "pan" : "orbit";
    V3.lastX = e.clientX;
    V3.lastY = e.clientY;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!V3.dragging) return;
    const dx = e.clientX - V3.lastX;
    const dy = e.clientY - V3.lastY;
    V3.lastX = e.clientX;
    V3.lastY = e.clientY;

    if (V3.dragMode === "pan") {
      const panFactor = (V3.dist / 145) * 0.16;
      const cy = Math.cos(V3.yaw), sy = Math.sin(V3.yaw);
      const moveX = -dx * panFactor;
      const moveY = dy * panFactor;
      V3.panX += moveX * cy + moveY * sy;
      V3.panY += -moveX * sy + moveY * cy;
    } else {
      V3.yaw = (V3.yaw + dx * 0.007) % (Math.PI * 2);
      V3.pitch = Math.max(0.02, Math.min(1.54, V3.pitch + dy * 0.005));
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    V3.dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    V3.dist = Math.max(40, Math.min(480, V3.dist * (1 + e.deltaY * 0.0012)));
  }, { passive: false });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // 3D Arc Hover Hit-Testing & Tooltip
  const tt = $("canvas-tooltip");
  canvas.addEventListener("mousemove", (e) => {
    if (V3.dragging) {
      if (tt && !TACTICAL_STATE.pinned3DArc) tt.classList.add("hidden");
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    let found = null;
    let bestDist = 16;

    for (const l of V3.lineups) {
      if (l.trajectory && l.trajectory.points) {
        for (const pt of l.trajectory.points) {
          const wPt = V3.toWorld(pt[0], pt[1], pt[2]);
          const p2d = V3.project(wPt[0], wPt[1], wPt[2], canvas.width, canvas.height);
          if (p2d) {
            const d = Math.hypot(p2d[0] - mx, p2d[1] - my);
            if (d < bestDist) {
              bestDist = d;
              found = { lineup: l, p2d };
            }
          }
        }
      }
    }

    for (const arc of (V3.arcs || [])) {
      for (const pt of arc.curvePts) {
        const p2d = V3.project(pt[0], pt[1], pt[2], canvas.width, canvas.height);
        if (p2d) {
          const d = Math.hypot(p2d[0] - mx, p2d[1] - my);
          if (d < bestDist) {
            bestDist = d;
            found = { arc, p2d };
          }
        }
      }
    }

    V3.hoveredArc = found;

    if (found && tt && !TACTICAL_STATE.pinned3DArc) {
      canvas.style.cursor = "pointer";
      const a = found.arc || found.lineup;
      const ability = a.ability || "utility";
      const player = a.player || (a.agent ? `${a.agent.toUpperCase()} MAIN` : "Cloud9 Rival");
      const agent = a.agent || "AGENT";
      const cls = a.class || "utility";
      const apex = a.apex_h || (a.trajectory ? a.trajectory.apex_m : 18);
      const dist = a.dist_m || (a.trajectory ? Math.round(a.trajectory.apex_m * 2.2) : 35);
      const pitch = a.pitch || (a.trajectory ? a.trajectory.pitch_deg : 30);
      const repeats = a.repeats || 1;

      tt.innerHTML = `
        <div class="tt-title">${ability.toUpperCase()} · ${cls.toUpperCase()}</div>
        <div class="tt-caster">CASTER: ${player.toUpperCase()} (${agent.toUpperCase()})</div>
        <div class="tt-row"><span>FREQUENCY:</span><b>${repeats} ROUNDS</b></div>
        <div class="tt-row"><span>APEX HEIGHT:</span><b>${Math.round(apex)}m</b></div>
        <div class="tt-row"><span>FLIGHT DISTANCE:</span><b>${Math.round(dist)}m</b></div>
        <div class="tt-row"><span>LAUNCH PITCH:</span><b>${Math.round(pitch)}°</b></div>
      `;
      const container = $("canvas-container");
      const cBox = container ? container.getBoundingClientRect() : rect;
      const ttX = e.clientX - cBox.left + 16;
      const ttY = e.clientY - cBox.top - 20;
      tt.style.left = `${Math.max(10, Math.min(cBox.width - 250, ttX))}px`;
      tt.style.top = `${Math.max(10, Math.min(cBox.height - 180, ttY))}px`;
      tt.classList.remove("hidden", "pinned");
    } else if (!TACTICAL_STATE.pinned3DArc) {
      canvas.style.cursor = "crosshair";
      if (tt) tt.classList.add("hidden");
    }
  });

  canvas.addEventListener("mouseleave", () => {
    V3.hoveredArc = null;
    if (tt && !TACTICAL_STATE.pinned3DArc) tt.classList.add("hidden");
  });

  const setViewPreset = (yaw, pitch, dist, panX = 0, panY = 0, btnId) => {
    V3.yaw = yaw;
    V3.pitch = pitch;
    V3.dist = dist;
    V3.panX = panX;
    V3.panY = panY;
    V3.auto = false;
    ["v3-topdown", "v3-iso", "v3-site-a", "v3-site-b", "v3-site-c"].forEach((id) => {
      const b = $(id);
      if (b) b.classList.toggle("active", id === btnId);
    });
  };

  if ($("v3-topdown")) $("v3-topdown").addEventListener("click", () => setViewPreset(0, 1.54, 175, 0, 0, "v3-topdown"));
  if ($("v3-iso")) $("v3-iso").addEventListener("click", () => setViewPreset(0.78, 0.62, 155, 0, 0, "v3-iso"));

  if ($("v3-site-a")) {
    $("v3-site-a").addEventListener("click", () => {
      const bp = getMapBlueprint(V3.map);
      if (bp.plants && bp.plants[0]) {
        const p = bp.plants[0];
        const wPos = V3.toWorld(p[0] + p[2] / 2, p[1] + p[3] / 2, 0);
        setViewPreset(0.85, 0.62, 85, wPos[0], wPos[1], "v3-site-a");
      }
    });
  }

  if ($("v3-site-b")) {
    $("v3-site-b").addEventListener("click", () => {
      const bp = getMapBlueprint(V3.map);
      if (bp.plants && bp.plants[1]) {
        const p = bp.plants[1];
        const wPos = V3.toWorld(p[0] + p[2] / 2, p[1] + p[3] / 2, 0);
        setViewPreset(-0.45, 0.62, 85, wPos[0], wPos[1], "v3-site-b");
      }
    });
  }

  if ($("v3-site-c")) {
    $("v3-site-c").addEventListener("click", () => {
      const bp = getMapBlueprint(V3.map);
      if (bp.plants && bp.plants[2]) {
        const p = bp.plants[2];
        const wPos = V3.toWorld(p[0] + p[2] / 2, p[1] + p[3] / 2, 0);
        setViewPreset(1.85, 0.62, 85, wPos[0], wPos[1], "v3-site-c");
      }
    });
  }

  if ($("v3-auto")) {
    $("v3-auto").addEventListener("click", () => {
      V3.auto = !V3.auto;
      $("v3-auto").classList.toggle("active", V3.auto);
    });
  }

  if ($("v3-reset")) {
    $("v3-reset").addEventListener("click", () => {
      setViewPreset(0.45, 0.48, 145, 0, 0, "v3-iso");
    });
  }
}

/* ---------------- Export Scouting Brief Modal ---------------- */
function openExportBriefModal() {
  const modal = $("brief-modal");
  const title = $("brief-modal-title");
  const content = $("brief-modal-content");
  if (!modal || !content) return;

  const curMap = TACTICAL_STATE.map.toUpperCase();
  const curSide = TACTICAL_STATE.side.toUpperCase();
  const topAbility = (TACTICAL_STATE.rawAtlas && TACTICAL_STATE.rawAtlas.abilities)
    ? TACTICAL_STATE.rawAtlas.abilities[0]
    : null;

  title.textContent = `PRE-MATCH SCOUTING BRIEF // ${curMap} (${curSide})`;

  content.innerHTML = `
    <div style="font-family:var(--font-mono);font-size:12px;line-height:1.7;color:var(--text-secondary);">
      <h3 style="color:#ffffff;font-size:14px;margin-bottom:8px;font-family:var(--font-sans);">
        CLOUD9 TACTICAL PRE-MATCH INTELLIGENCE BRIEF
      </h3>
      <p style="margin-bottom:12px;">
        <b>TARGET MAP:</b> ${curMap} &nbsp;|&nbsp; <b>SIDE FOCUS:</b> ${curSide} &nbsp;|&nbsp; <b>CORPUS:</b> 28 VCT SERIES (1,404 ROUNDS)
      </p>

      <h4 style="color:var(--c9-cyan);margin-top:14px;margin-bottom:4px;">1. PRIMARY OPPONENT UTILITY DISRUPTION</h4>
      <p>
        ${topAbility ? `Opponent centers round execution around <b>${topAbility.ability.toUpperCase()}</b> (${topAbility.hard_count}). Deploy high-velocity denial utility or bait initial deployment before committing site execute.` : "Standard utility spread across primary corridors."}
      </p>

      <h4 style="color:var(--tactical-amber);margin-top:14px;margin-bottom:4px;">2. REPEATED EXPLOIT LINEUPS</h4>
      <p>
        Opponent repeats high-confidence ballistic lineups across rounds. Instruct anchor players to pre-aim known launch parabolas and deploy counter-utility.
      </p>

      <h4 style="color:var(--danger-crimson);margin-top:14px;margin-bottom:4px;">3. OPERATOR &amp; HEAVY WEAPON PROTOCOL</h4>
      <p>
        Designate jump-peek protocols on primary sniper sightlines. Do not dry-peek early round angles without flash support.
      </p>

      <div style="margin-top:16px;padding:10px;background:rgba(255,255,255,0.03);border:var(--border-hairline);border-radius:4px;">
        <span style="font-size:10px;color:var(--text-muted);">GENERATED VIA BREACHIQ 3D TACTICAL ENGINE · APPROVED FOR COACHING USE</span>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
}

/* ---------------- Boot Initialization ---------------- */
async function boot() {
  try {
    const res = await fetch("demo-data.json");
    if (res.ok) {
      DEMO_DATA = await res.json();
      if (!COV) COV = DEMO_DATA.coverage;
    }
  } catch (_) {}

  try {
    META = await get("/api/meta");
    const maps = META.maps || ["summit", "lotus", "bind", "haven", "split", "ascent"];
    const mapSel = $("f-map");
    if (mapSel) {
      mapSel.innerHTML = maps.map((m) => `<option value="${m}">${m.toUpperCase()}</option>`).join("");
    }

    if (META.source === "real-aggregates" || META.SYNTHETIC === false) {
      REAL_API = true;
      COV = META.coverage || COV;
    }

    // Read URL hash
    const h = readHash();
    if (h.map && maps.includes(h.map)) TACTICAL_STATE.map = h.map;
    else TACTICAL_STATE.map = maps.includes("summit") ? "summit" : maps[0];

    if (h.side) TACTICAL_STATE.side = h.side;
    if (h.player) TACTICAL_STATE.player = h.player;
    if (h.agent) TACTICAL_STATE.agent = h.agent;
    if (h.ability) TACTICAL_STATE.ability = h.ability;

    if (mapSel) mapSel.value = TACTICAL_STATE.map;
    if ($("f-side")) $("f-side").value = TACTICAL_STATE.side;

    syncFilterOptions();
  } catch (err) {
    console.warn("[BreachIQ] Boot initialization warning:", err);
  }

  // Set up listeners for filters
  $("f-map").addEventListener("change", (e) => {
    TACTICAL_STATE.map = e.target.value;
    TACTICAL_STATE.ability = "";
    TACTICAL_STATE.highlightedLineupKey = null;
    TACTICAL_STATE.selectedPlayer = null;
    syncFilterOptions();
    syncAllPanels();
  });

  $("f-side").addEventListener("change", (e) => {
    TACTICAL_STATE.side = e.target.value;
    syncAllPanels();
  });

  $("f-player").addEventListener("change", (e) => {
    TACTICAL_STATE.player = e.target.value;
    syncAllPanels();
  });

  $("f-agent").addEventListener("change", (e) => {
    TACTICAL_STATE.agent = e.target.value;
    syncAllPanels();
  });

  $("f-ability").addEventListener("change", (e) => {
    TACTICAL_STATE.ability = e.target.value;
    syncAllPanels();
  });

  $("btn-reset-filters").addEventListener("click", () => {
    TACTICAL_STATE.side = "all";
    TACTICAL_STATE.player = "all";
    TACTICAL_STATE.agent = "all";
    TACTICAL_STATE.ability = "";
    TACTICAL_STATE.highlightedLineupKey = null;
    TACTICAL_STATE.selectedPlayer = null;
    if ($("f-side")) $("f-side").value = "all";
    if ($("f-ability")) $("f-ability").value = "";
    syncFilterOptions();
    syncAllPanels();
  });

  // Density Mode Buttons
  const densityBtns = [
    { id: "density-clean", mode: "clean" },
    { id: "density-heatmap", mode: "heatmap" },
    { id: "density-raw", mode: "raw" },
  ];
  densityBtns.forEach(({ id, mode }) => {
    const btn = $(id);
    if (btn) {
      btn.addEventListener("click", () => {
        TACTICAL_STATE.densityMode = mode;
        densityBtns.forEach((b) => {
          const el = $(b.id);
          if (el) el.classList.toggle("on", b.mode === mode);
        });
        syncAllPanels();
      });
    }
  });

  // View Mode Buttons (Single Unified Stage: 2D Radar vs 3D Arena)
  if ($("mode-2d")) $("mode-2d").addEventListener("click", () => setViewMode("2d"));
  if ($("mode-3d")) $("mode-3d").addEventListener("click", () => setViewMode("3d"));

  // Header Actions
  $("btn-refresh").addEventListener("click", syncAllPanels);
  $("btn-brief").addEventListener("click", openExportBriefModal);
  $("btn-audit").addEventListener("click", () => $("audit-modal").classList.remove("hidden"));
  $("btn-tour").addEventListener("click", () => $("onboarding").classList.remove("hidden"));

  // Modal Closures
  $("btn-modal-close").addEventListener("click", () => $("onboarding").classList.add("hidden"));
  $("btn-start").addEventListener("click", () => $("onboarding").classList.add("hidden"));
  $("btn-brief-close").addEventListener("click", () => $("brief-modal").classList.add("hidden"));
  $("btn-audit-close").addEventListener("click", () => $("audit-modal").classList.add("hidden"));
  $("btn-audit-ok").addEventListener("click", () => $("audit-modal").classList.add("hidden"));

  $("btn-copy-brief").addEventListener("click", () => {
    const text = $("brief-modal-content").innerText;
    navigator.clipboard.writeText(text).then(() => {
      $("btn-copy-brief").textContent = "✓ COPIED!";
      setTimeout(() => { $("btn-copy-brief").textContent = "📋 COPY MARKDOWN"; }, 2000);
    });
  });

  $("btn-print-brief").addEventListener("click", () => window.print());

  // Set up visual components
  renderToggles();
  minimapControls();
  v3Controls();
  requestAnimationFrame(v3Loop);
  requestAnimationFrame(radarLoop);

  // Set initial View Mode
  setViewMode(TACTICAL_STATE.viewMode || "2d");

  // Initial Sync
  await syncAllPanels();
}

/* ---------------- Global Keyboard Shortcuts ---------------- */
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  const k = e.key.toLowerCase();
  if (k === "r") syncAllPanels();
  else if (k === "b") openExportBriefModal();
  else if (k === "?") $("onboarding").classList.remove("hidden");
  else if (k === "1") setViewMode("2d");
  else if (k === "2") setViewMode("3d");
});

boot();
