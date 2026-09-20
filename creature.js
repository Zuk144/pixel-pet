// ---------------------------------------------------------------------------
// Procedural creature renderer + DNA.
// Owns nothing about game state - it only invents a pet's DNA (once, at
// birth) and knows how to draw + animate it. The DNA is layered so a single
// species still produces huge variety:
//
//   species -> body shape -> appendages -> palette -> marking -> eyes
//              -> personality (how it moves) -> quirk (click reaction)
//
// Everything is flat-color pixel rectangles on a mirrored grid, so it stays
// lightweight and reads as retro pixel art. Adding a new species is just
// another entry in SPECIES below.
// ---------------------------------------------------------------------------

const CREATURE_GRID_SIZE = 9; // 9x9, odd so there's a true center column
const CREATURE_CANVAS_SIZE = 126; // px, divides evenly into 9 14px cells - kept smaller than the
// screen it sits in on purpose, so the pet reads as a small creature roaming a room rather than
// a close-up filling the frame.
const CREATURE_CELL = CREATURE_CANVAS_SIZE / CREATURE_GRID_SIZE;

// Curated color triples {primary, secondary, accent} so every roll looks
// intentional. secondary = belly/underside, accent = markings + appendage tips.
const PALETTE_SETS = {
  bright: [
    { primary: "#7fd858", secondary: "#a8e87f", accent: "#2f6b3a" },
    { primary: "#58d8b1", secondary: "#8fe8cf", accent: "#1f6b52" },
    { primary: "#d8c258", secondary: "#e8d98f", accent: "#7a5b1f" },
    { primary: "#58c9d8", secondary: "#8fdfe8", accent: "#1f5a6b" },
    { primary: "#d88a58", secondary: "#e8b48f", accent: "#7a401f" },
    { primary: "#a8d858", secondary: "#c9e88f", accent: "#556b1f" },
    { primary: "#d85888", secondary: "#e88fb0", accent: "#7a1f45" },
    { primary: "#8f7fd8", secondary: "#b8a8e8", accent: "#3f2f7a" },
    { primary: "#58a8d8", secondary: "#8fc9e8", accent: "#1f4a7a" },
  ],
  earthy: [
    { primary: "#c98a4b", secondary: "#e0b483", accent: "#6b3f1f" },
    { primary: "#9aa84b", secondary: "#c2cf7f", accent: "#4a5320" },
    { primary: "#c25a3d", secondary: "#e08f7a", accent: "#6b241f" },
    { primary: "#8a7a5a", secondary: "#b8a888", accent: "#453a25" },
    { primary: "#a85a3d", secondary: "#cf8f70", accent: "#5a2415" },
    { primary: "#6b8a4b", secondary: "#9ab87f", accent: "#33471f" },
    { primary: "#b8a04b", secondary: "#d8c88f", accent: "#5e4f1a" },
    { primary: "#7a5a4b", secondary: "#a88a7a", accent: "#3d2820" },
    { primary: "#c9a86b", secondary: "#e0cf9a", accent: "#6b5225" },
  ],
  pastel: [
    { primary: "#e58fb1", secondary: "#f5c2d5", accent: "#a03d61" },
    { primary: "#b58fe5", secondary: "#d5c2f5", accent: "#5e3da0" },
    { primary: "#8fb1e5", secondary: "#c2d5f5", accent: "#3d5ea0" },
    { primary: "#8fe5c9", secondary: "#c2f5e5", accent: "#3da080" },
    { primary: "#e5c98f", secondary: "#f5e5c2", accent: "#a07f3d" },
    { primary: "#e58f8f", secondary: "#f5c2c2", accent: "#a03d3d" },
    { primary: "#c9e58f", secondary: "#e5f5c2", accent: "#7fa03d" },
    { primary: "#e58fd5", secondary: "#f5c2ea", accent: "#a03d8f" },
    { primary: "#9fd5e5", secondary: "#cceaf5", accent: "#3d80a0" },
  ],
  ocean: [
    { primary: "#4a90d9", secondary: "#8fbde8", accent: "#1f3d75" },
    { primary: "#5ab6c9", secondary: "#8fd5e0", accent: "#1f5266" },
    { primary: "#7a6bd9", secondary: "#b1a8e8", accent: "#342475" },
    { primary: "#3dc2a8", secondary: "#82ddcb", accent: "#155e4f" },
    { primary: "#5a7ad9", secondary: "#9aaee8", accent: "#22326b" },
    { primary: "#3d9fc2", secondary: "#82c6dd", accent: "#154a5e" },
    { primary: "#9a5ad9", secondary: "#c2a0e8", accent: "#4a1f75" },
    { primary: "#4ad9c9", secondary: "#8fe8df", accent: "#1f756b" },
    { primary: "#6b8ad9", secondary: "#a3b8e8", accent: "#2b3d75" },
  ],
};

// Rare "shiny" coats - any species can roll one. Deliberately outside the
// species palette groups so a shiny reads as unmistakably special at a
// glance, not just "a slightly different green". drawCreature adds a
// twinkle on top when genome.shiny is set.
const SHINY_CHANCE = 0.05;
const SHINY_PALETTES = [
  { name: "Cosmic", palette: { primary: "#3b2a6b", secondary: "#6a55a8", accent: "#ffe9a8" } },
  { name: "Golden", palette: { primary: "#e8b43e", secondary: "#ffdc86", accent: "#7a5310" } },
  { name: "Albino", palette: { primary: "#f6f0e8", secondary: "#ffffff", accent: "#e0a8b8" } },
  { name: "Obsidian", palette: { primary: "#2b2b38", secondary: "#4a4a5e", accent: "#5ad9e8" } },
  { name: "Opal", palette: { primary: "#cfe8e0", secondary: "#f0fbf7", accent: "#b58fe5" } },
];

// Each species biases the DNA roll. Body-shape knobs feed generateBody().
const SPECIES = {
  blob: {
    label: "Blob",
    body: { centerRow: 4, spread: 2.6, falloff: 1.3, density: 1.0, clearBottom: 0 },
    appendages: ["none", "stubs"],
    markings: ["none", "spots", "band", "belly"],
    eyes: ["big", "round"],
    palettes: "bright",
    quirk: "jiggle",
    movement: { bobAmp: 4, speed: 1.0, range: 40, pause: 3500 },
    // Payout personality: earns steadily, often, in small amounts.
    payout: { minInterval: 6 * 60, maxInterval: 10 * 60, minAmount: 2, maxAmount: 4 },
    payoutFlavor: "Earns steadily, often, in small amounts.",
  },
  lizard: {
    label: "Lizard",
    body: { centerRow: 4, spread: 2.9, falloff: 2.1, density: 0.95, clearBottom: 0 },
    appendages: ["spikes", "stubs"],
    markings: ["stripe", "spots", "band"],
    eyes: ["oval", "sleepy"],
    palettes: "earthy",
    quirk: "dart",
    movement: { bobAmp: 2, speed: 1.8, range: 58, pause: 1800 },
    // Payout personality: occasional solid chunks.
    payout: { minInterval: 15 * 60, maxInterval: 22 * 60, minAmount: 5, maxAmount: 9 },
    payoutFlavor: "Earns in occasional solid chunks.",
  },
  fluff: {
    label: "Fluff",
    body: { centerRow: 4, spread: 2.4, falloff: 1.0, density: 1.05, clearBottom: 0 },
    appendages: ["ears", "antennae"],
    markings: ["none", "belly", "spots"],
    eyes: ["big", "sparkle"],
    palettes: "pastel",
    quirk: "hop",
    movement: { bobAmp: 6, speed: 0.7, range: 26, pause: 4200 },
    // Payout personality: a constant tiny trickle - fun to watch tick up.
    payout: { minInterval: 3 * 60, maxInterval: 5 * 60, minAmount: 1, maxAmount: 2 },
    payoutFlavor: "A constant tiny trickle of credits.",
  },
  squid: {
    label: "Squid",
    body: { centerRow: 3, spread: 2.1, falloff: 1.5, density: 1.0, clearBottom: 2 },
    appendages: ["tentacles"],
    markings: ["spots", "band", "tattoo"],
    eyes: ["round", "oval"],
    palettes: "ocean",
    quirk: "wiggle",
    // Payout personality: rare, but a real jackpot when it lands.
    payout: { minInterval: 25 * 60, maxInterval: 35 * 60, minAmount: 9, maxAmount: 15 },
    payoutFlavor: "Rare payouts, but a real jackpot.",
    movement: { bobAmp: 5, speed: 0.9, range: 44, pause: 3000 },
  },
};

const SPECIES_KEYS = Object.keys(SPECIES);

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function jitter(value, pct) {
  return value * (1 + (Math.random() * 2 - 1) * pct);
}

function payoutConfig(genome) {
  return (SPECIES[genome && genome.species] || SPECIES.blob).payout;
}

function payoutFlavor(genome) {
  return (SPECIES[genome && genome.species] || SPECIES.blob).payoutFlavor;
}

// ---- Stats (innate, rolled at birth) --------------------------------------
// A tiny D&D-style block. Every stat is "higher is better" so it stays
// deadly-simple to read, while each one quietly reshapes how the pet plays
// (see the stat->effect helpers in main.js). Species have tendencies; each
// pet then rolls its own values around them, so pets feel individual and the
// occasional standout roll is exciting - the tabletop dice-roll joy.
const STAT_KEYS = ["vit", "might", "grit", "endurance", "charm"];
const STAT_LABELS = {
  vit: "Vitality",
  might: "Might",
  grit: "Grit",
  endurance: "Endurance",
  charm: "Charm",
};
const STAT_BLURBS = {
  vit: "Shrugs off sickness. Sets HP for adventures.",
  might: "Raw power on quests and adventures.",
  grit: "Handles heat and cold with ease.",
  endurance: "Stays full longer between meals.",
  charm: "Earns extra Credits just by being lovable.",
};

// Species tendencies (before each pet's individual roll). ~10 is average.
const SPECIES_STATS = {
  blob: { vit: 10, might: 10, grit: 10, endurance: 10, charm: 10 },
  lizard: { vit: 9, might: 12, grit: 14, endurance: 10, charm: 7 },
  fluff: { vit: 9, might: 6, grit: 8, endurance: 13, charm: 14 },
  squid: { vit: 14, might: 13, grit: 6, endurance: 9, charm: 10 },
};

function rollStats(species) {
  const base = SPECIES_STATS[species] || SPECIES_STATS.blob;
  const stats = {};
  for (const key of STAT_KEYS) {
    const rolled = base[key] + Math.floor(Math.random() * 5) - 2; // +/-2 around the species base
    stats[key] = Math.max(3, Math.min(18, rolled));
  }
  return stats;
}

// Temperature comfort window, 0-100 internal scale (matches state.temp).
// center = their ideal midpoint; width = how wide "totally fine" is around
// it before discomfort starts. Grit (main.js) widens/narrows this further
// per-pet on top of the species tendency - a high-Grit pet of a "picky"
// species can still be pleasantly hardy.
const SPECIES_COMFORT = {
  blob: { center: 50, width: 34 }, // easygoing, comfortable almost anywhere
  lizard: { center: 64, width: 24 }, // likes it warm
  fluff: { center: 46, width: 16 }, // cozy, and a little picky
  squid: { center: 38, width: 22 }, // prefers it cool
};

function speciesComfort(species) {
  return SPECIES_COMFORT[species] || SPECIES_COMFORT.blob;
}

function defaultStats() {
  return { vit: 10, might: 10, grit: 10, endurance: 10, charm: 10 };
}

// ---- DNA generation -------------------------------------------------------

// Builds a mirrored body silhouette biased by species body knobs. Returns a
// 9x9 boolean grid. The center column mid-rows are forced on so there's
// always a solid core to hang eyes/markings on.
function generateBody(body) {
  const rows = CREATURE_GRID_SIZE;
  const halfCols = Math.ceil(CREATURE_GRID_SIZE / 2);

  const half = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    const rowWeight = Math.exp(-((r - body.centerRow) ** 2) / (2 * body.spread ** 2));
    const inClearZone = r >= rows - body.clearBottom;
    for (let c = 0; c < halfCols; c++) {
      const centerness = c / (halfCols - 1); // 0 outer edge, 1 center column
      const colWeight = Math.pow(centerness, body.falloff);
      const chance = body.density * rowWeight * (0.35 + 0.65 * colWeight);
      row.push(!inClearZone && Math.random() < chance);
    }
    half.push(row);
  }

  // Guarantee a solid core column so it never generates a broken blob.
  const coreTop = Math.max(0, body.centerRow - 1);
  const coreBottom = Math.min(rows - 1 - body.clearBottom, body.centerRow + 1);
  for (let r = coreTop; r <= coreBottom; r++) {
    half[r][halfCols - 1] = true;
    if (halfCols - 2 >= 0) half[r][halfCols - 2] = true;
  }

  return half.map((row) => row.concat(row.slice(0, halfCols - 1).reverse()));
}

function generateGenome() {
  const species = pick(SPECIES_KEYS);
  const spec = SPECIES[species];

  const cells = generateBody(spec.body);
  // Rare shiny coat overrides the species palette entirely (see SHINY_PALETTES).
  const shinyRoll = Math.random() < SHINY_CHANCE ? pick(SHINY_PALETTES) : null;
  const palette = shinyRoll ? shinyRoll.palette : pick(PALETTE_SETS[spec.palettes]);

  return {
    species,
    cells,
    palette,
    shiny: shinyRoll ? shinyRoll.name : null,
    appendage: pick(spec.appendages),
    marking: pick(spec.markings),
    eyeStyle: pick(spec.eyes),
    quirk: spec.quirk,
    baseStats: rollStats(species),
    movement: {
      bobAmp: jitter(spec.movement.bobAmp, 0.2),
      speed: jitter(spec.movement.speed, 0.2),
      range: jitter(spec.movement.range, 0.2),
      pause: jitter(spec.movement.pause, 0.25),
    },
  };
}

// Old saves (and history entries) predate layered DNA. Normalize them so the
// renderer has one shape to work with and nothing crashes on legacy pets.
function normalizeGenome(genome) {
  if (genome.palette) {
    // Layered DNA but predates stats - backfill so stat lookups are safe.
    if (!genome.baseStats) genome.baseStats = rollStats(genome.species);
    return genome;
  }
  return {
    species: "blob",
    cells: genome.cells,
    palette: { primary: genome.bodyColor, secondary: genome.bodyColor, accent: genome.accentColor },
    appendage: "none",
    marking: "spots",
    eyeStyle: "round",
    quirk: "jiggle",
    baseStats: defaultStats(),
    movement: SPECIES.blob.movement,
    _legacyAccentCells: genome.accentCells || [],
  };
}

// ---- Color helper ---------------------------------------------------------

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = num >> 16;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  if (percent >= 0) {
    r += (255 - r) * (percent / 100);
    g += (255 - g) * (percent / 100);
    b += (255 - b) * (percent / 100);
  } else {
    r *= 1 + percent / 100;
    g *= 1 + percent / 100;
    b *= 1 + percent / 100;
  }
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

// ---- Body-bounds helper ---------------------------------------------------
// Appendages and markings position themselves relative to the actual filled
// body, not the whole grid, so they look attached regardless of body shape.

function bodyBounds(cells) {
  let minRow = 99, maxRow = -1, minCol = 99, maxCol = -1;
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (!cells[r][c]) continue;
      minRow = Math.min(minRow, r);
      maxRow = Math.max(maxRow, r);
      minCol = Math.min(minCol, c);
      maxCol = Math.max(maxCol, c);
    }
  }
  return { minRow, maxRow, minCol, maxCol, centerCol: (CREATURE_GRID_SIZE - 1) / 2 };
}

function cell(ctx, originX, originY, col, row, color) {
  ctx.fillStyle = color;
  ctx.fillRect(originX + col * CREATURE_CELL, originY + row * CREATURE_CELL, CREATURE_CELL, CREATURE_CELL);
}

// ---- Layer: appendages (drawn behind the body) ----------------------------

function drawAppendage(ctx, originX, originY, genome, bounds) {
  const { primary, accent } = genome.palette;
  const { minRow, maxRow, minCol, maxCol, centerCol } = bounds;

  switch (genome.appendage) {
    case "stubs": {
      const row = Math.min(CREATURE_GRID_SIZE - 1, maxRow + 1);
      cell(ctx, originX, originY, minCol + 1, row, primary);
      cell(ctx, originX, originY, maxCol - 1, row, primary);
      break;
    }
    case "spikes": {
      const row = Math.max(0, minRow - 1);
      for (let c = minCol + 1; c <= maxCol - 1; c += 2) cell(ctx, originX, originY, c, row, accent);
      break;
    }
    case "ears": {
      const row = Math.max(0, minRow - 1);
      cell(ctx, originX, originY, minCol, row, primary);
      cell(ctx, originX, originY, maxCol, row, primary);
      break;
    }
    case "antennae": {
      const row = Math.max(0, minRow - 1);
      const top = Math.max(0, minRow - 2);
      cell(ctx, originX, originY, centerCol - 1, row, accent);
      cell(ctx, originX, originY, centerCol + 1, row, accent);
      cell(ctx, originX, originY, centerCol - 1, top, primary);
      cell(ctx, originX, originY, centerCol + 1, top, primary);
      break;
    }
    case "tentacles": {
      const row1 = Math.min(CREATURE_GRID_SIZE - 1, maxRow + 1);
      const row2 = Math.min(CREATURE_GRID_SIZE - 1, maxRow + 2);
      for (let c = minCol + 1; c <= maxCol - 1; c += 2) {
        cell(ctx, originX, originY, c, row1, primary);
        cell(ctx, originX, originY, c, row2, accent);
      }
      break;
    }
  }
}

// ---- Layer: belly + markings (drawn on top of the body) -------------------

function drawMarking(ctx, originX, originY, genome, bounds) {
  const { secondary, accent } = genome.palette;
  const { minRow, maxRow, minCol, maxCol, centerCol } = bounds;
  const filled = (r, c) => genome.cells[r] && genome.cells[r][c];

  // Belly: a secondary-colored underside patch, only where body exists.
  if (genome.marking === "belly") {
    for (let r = maxRow - 1; r <= maxRow; r++) {
      for (let c = centerCol - 1; c <= centerCol + 1; c++) {
        if (filled(r, c)) cell(ctx, originX, originY, c, r, secondary);
      }
    }
    return;
  }
  if (genome.marking === "band") {
    const r = Math.round((minRow + maxRow) / 2) + 1;
    for (let c = minCol; c <= maxCol; c++) if (filled(r, c)) cell(ctx, originX, originY, c, r, accent);
    return;
  }
  if (genome.marking === "stripe") {
    for (let r = minRow; r <= maxRow; r++) if (filled(r, centerCol)) cell(ctx, originX, originY, centerCol, r, accent);
    return;
  }
  if (genome.marking === "spots") {
    const spots = [
      [minRow + 1, minCol + 1],
      [maxRow - 1, maxCol - 1],
      [Math.round((minRow + maxRow) / 2), minCol + 1],
    ];
    for (const [r, c] of spots) if (filled(r, c)) cell(ctx, originX, originY, c, r, accent);
    return;
  }
  if (genome.marking === "tattoo") {
    // A tiny fixed 2-cell glyph just under the eyes, centered.
    const r = Math.min(maxRow, 5);
    if (filled(r, centerCol)) cell(ctx, originX, originY, centerCol, r, accent);
    return;
  }
  if (genome._legacyAccentCells) {
    for (const [r, c] of genome._legacyAccentCells) cell(ctx, originX, originY, c, r, accent);
  }
}

// ---- Layer: eyes ----------------------------------------------------------

function drawEyes(ctx, originX, originY, bounds, eyeStyle, expression) {
  const eyeRow = Math.max(bounds.minRow + 1, 3);
  const spread = bounds.maxCol - bounds.minCol >= 4 ? 2 : 1;
  const eyeCols = [bounds.centerCol - spread, bounds.centerCol + spread];
  const size = CREATURE_CELL;

  ctx.fillStyle = "#1b1f1a";
  ctx.strokeStyle = "#1b1f1a";
  ctx.lineWidth = 2;

  for (const col of eyeCols) {
    const x = originX + col * size;
    const y = originY + eyeRow * size;

    if (expression === "closed" || eyeStyle === "sleepy" && expression === "normal") {
      ctx.beginPath();
      ctx.moveTo(x + size * 0.15, y + size * 0.5);
      ctx.lineTo(x + size * 0.85, y + size * 0.5);
      ctx.stroke();
      continue;
    }
    if (expression === "sick") {
      ctx.beginPath();
      ctx.moveTo(x + size * 0.15, y + size * 0.15);
      ctx.lineTo(x + size * 0.85, y + size * 0.85);
      ctx.moveTo(x + size * 0.85, y + size * 0.15);
      ctx.lineTo(x + size * 0.15, y + size * 0.85);
      ctx.stroke();
      continue;
    }
    if (expression === "upset") {
      ctx.fillRect(x + size * 0.2, y + size * 0.4, size * 0.6, size * 0.3);
      continue;
    }

    // Normal, styled by eyeStyle.
    if (eyeStyle === "big") {
      ctx.fillRect(x + size * 0.1, y + size * 0.05, size * 0.8, size * 0.8);
    } else if (eyeStyle === "oval") {
      ctx.fillRect(x + size * 0.15, y + size * 0.3, size * 0.7, size * 0.4);
    } else if (eyeStyle === "sparkle") {
      ctx.fillRect(x + size * 0.15, y + size * 0.1, size * 0.7, size * 0.7);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + size * 0.2, y + size * 0.15, size * 0.22, size * 0.22);
      ctx.fillStyle = "#1b1f1a";
    } else {
      // round
      ctx.fillRect(x + size * 0.2, y + size * 0.15, size * 0.6, size * 0.6);
    }
  }
}

// ---- Click-reaction transforms --------------------------------------------
// reaction = { quirk, progress (0..1) } | null. Returns extra transform to
// layer on top of the idle bob/squish so each species reacts differently.

function reactionTransform(reaction) {
  const t = { dx: 0, dy: 0, rotation: 0, squish: 0, flipScale: 1 };
  if (!reaction) return t;
  const p = reaction.progress;
  const arc = Math.sin(p * Math.PI); // 0 -> 1 -> 0

  switch (reaction.quirk) {
    case "hop":
      t.dy = -arc * 34;
      t.squish = arc * 0.2;
      break;
    case "jiggle":
      t.rotation = Math.sin(p * Math.PI * 6) * 0.18 * (1 - p);
      t.squish = arc * 0.15;
      break;
    case "dart":
      t.dx = Math.sin(p * Math.PI * 2) * 46;
      break;
    case "wiggle":
      t.rotation = Math.sin(p * Math.PI * 4) * 0.12;
      t.dx = Math.sin(p * Math.PI * 4) * 14;
      break;
    case "spin":
      t.flipScale = 1;
      t.rotation = p * Math.PI * 2;
      break;
  }
  return t;
}

// ---- Draw -----------------------------------------------------------------
// animState: { bobOffset, flipX, squish (0-1), blink, expression,
//              adultForm ('radiant'|'rough'|null), reaction }

function drawCreature(ctx, rawGenome, animState) {
  const genome = normalizeGenome(rawGenome);
  const size = CREATURE_CANVAS_SIZE;
  ctx.clearRect(0, 0, size, size);

  const bounds = bodyBounds(genome.cells);
  const rows = genome.cells.length;
  const cols = genome.cells[0].length;
  const gridH = rows * CREATURE_CELL;
  const originX = (size - cols * CREATURE_CELL) / 2;

  const react = reactionTransform(animState.reaction);

  const baseOriginY = (size - gridH) / 2;
  const dy = animState.bobOffset + react.dy;
  const dx = react.dx;

  const squish = Math.min(0.6, animState.squish + react.squish);
  const squashY = 1 - squish * 0.18;
  const stretchX = 1 + squish * 0.12;

  const pivotX = size / 2;
  const pivotY = size - 4;

  ctx.save();
  ctx.translate(pivotX + dx, pivotY + dy);
  ctx.rotate(react.rotation);
  ctx.scale((animState.flipX ? -1 : 1) * react.flipScale * stretchX, squashY);
  ctx.translate(-pivotX, -pivotY);

  let primary = genome.palette.primary;
  if (animState.adultForm === "radiant") primary = shadeColor(genome.palette.primary, 28);
  if (animState.adultForm === "rough") primary = shadeColor(genome.palette.primary, -28);

  // Layer order: appendages behind, then body, then markings, then eyes.
  drawAppendage(ctx, originX, baseOriginY, genome, bounds);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (genome.cells[r][c]) cell(ctx, originX, baseOriginY, c, r, primary);
    }
  }

  drawMarking(ctx, originX, baseOriginY, genome, bounds);

  const expression = animState.blink ? "closed" : animState.expression;
  drawEyes(ctx, originX, baseOriginY, bounds, genome.eyeStyle, expression);

  // Equipment sits on top of the body but under nothing - drawn last so gear
  // always reads clearly. items.js owns the per-slot geometry.
  if (typeof drawEquipment === "function") {
    drawEquipment(ctx, originX, baseOriginY, bounds, animState.equipped);
  }

  // Shiny coats get a slow twinkle so they read as special even in a still
  // screenshot. Deterministic per-sparkle offsets keep them from strobing.
  if (genome.shiny) {
    const t = Date.now() / 700;
    const spots = [
      [bounds.minCol + 0.5, bounds.minRow + 0.8],
      [bounds.maxCol - 0.2, bounds.minRow + 1.8],
      [bounds.maxCol - 1.0, bounds.maxRow - 0.6],
      [bounds.minCol + 1.4, bounds.maxRow - 1.2],
    ];
    for (let i = 0; i < spots.length; i++) {
      const a = Math.sin(t + i * 1.9);
      if (a <= 0) continue;
      const [sc, sr] = spots[i];
      const px = originX + sc * CREATURE_CELL;
      const py = baseOriginY + sr * CREATURE_CELL;
      const arm = CREATURE_CELL * (0.5 + a * 0.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = "#fffdf0";
      ctx.fillRect(px - arm, py - CREATURE_CELL * 0.15, arm * 2, CREATURE_CELL * 0.3); // horizontal
      ctx.fillRect(px - CREATURE_CELL * 0.15, py - arm, CREATURE_CELL * 0.3, arm * 2); // vertical
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();
}
