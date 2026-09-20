// ---------------------------------------------------------------------------
// Procedural equipment.
// Items are generated the same spirit as creatures: roll a rarity, a
// material palette, and a shape variant, then draw a few flat pixel shapes.
// Slots are anatomy-driven - a pet only has the slots its body supports
// (every pet has head/face/body; feet/antennae/ears/tentacle slots appear
// only if the pet actually has those parts), so equipment always looks
// attached. Rarer gear yields more Credits, tying the shop back into the bank.
//
// This file is pure item logic + rendering. Owning/equipping/buying lives in
// main.js with the rest of the game state. Loaded after creature.js so it can
// reuse CREATURE_CELL / cell() / bodyBounds.
// ---------------------------------------------------------------------------

// Color-coded rarity, the genre convention (grey/green/blue/purple/orange).
// weight = relative drop chance; yield = income bonus while equipped;
// price = multiplier on a slot's base price.
const RARITIES = {
  common: { label: "Common", color: "#9aa5a0", weight: 50, yield: 0.02, price: 1 },
  uncommon: { label: "Uncommon", color: "#4caf7d", weight: 27, yield: 0.05, price: 2.2 },
  rare: { label: "Rare", color: "#4a90d9", weight: 14, yield: 0.09, price: 4 },
  epic: { label: "Epic", color: "#9a58d8", weight: 6, yield: 0.16, price: 7.5 },
  legendary: { label: "Legendary", color: "#e0913d", weight: 3, yield: 0.28, price: 15 },
};
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

const ITEM_MATERIALS = [
  { name: "Iron", main: "#8a94a0", trim: "#5a6570" },
  { name: "Bronze", main: "#b5793d", trim: "#7a4f22" },
  { name: "Gold", main: "#e0c04a", trim: "#a8862a" },
  { name: "Coral", main: "#e57f6b", trim: "#a84a3d" },
  { name: "Jade", main: "#5ec98f", trim: "#2f7a52" },
  { name: "Amethyst", main: "#a56bd8", trim: "#6b3da0" },
  { name: "Frost", main: "#8fc5e5", trim: "#4a80a8" },
  { name: "Rose", main: "#e58fb1", trim: "#a03d61" },
];

const FLAIR_ADJECTIVES = ["Gleaming", "Ancient", "Radiant", "Mythic", "Blessed", "Starlit"];

// Every slot: a label, an emoji (used as its icon everywhere in the UI - no
// per-item art needed for grids/buttons), and a pool of nouns for names.
const SLOTS = {
  head: { label: "Head", icon: "🎩", nouns: ["Cap", "Helm", "Crown", "Hood", "Topper"] },
  face: { label: "Face", icon: "🥽", nouns: ["Goggles", "Shades", "Mask", "Monocle"] },
  body: { label: "Body", icon: "🧥", nouns: ["Vest", "Cloak", "Plate", "Sash"] },
  back: { label: "Back", icon: "🧣", nouns: ["Cape", "Cloak", "Mantle", "Wrap"] },
  ringLeft: { label: "Ring (L)", icon: "💍", nouns: ["Band", "Loop", "Ring"] },
  ringRight: { label: "Ring (R)", icon: "💍", nouns: ["Band", "Loop", "Ring"] },
  feet: { label: "Feet", icon: "👢", nouns: ["Boots", "Sandals", "Socks"] },
  antenna: { label: "Antennae", icon: "📡", nouns: ["Bells", "Baubles", "Beads"] },
  ears: { label: "Ears", icon: "👂", nouns: ["Cuffs", "Studs", "Bows"] },
  tentacles: { label: "Tentacles", icon: "🌀", nouns: ["Bands", "Wraps", "Cuffs"] },
};

const SLOT_BASE_PRICE = 20;

// Universal slots every pet gets regardless of body shape, plus whichever
// anatomy slot its appendage supports - so slot count varies per pet but
// never drops below the RPG basics (head/face/body/back/rings).
const UNIVERSAL_SLOTS = ["head", "face", "body", "back", "ringLeft", "ringRight"];

function slotsForGenome(genome) {
  const slots = UNIVERSAL_SLOTS.slice();
  switch (genome && genome.appendage) {
    case "stubs": slots.push("feet"); break;
    case "antennae": slots.push("antenna"); break;
    case "ears": slots.push("ears"); break;
    case "tentacles": slots.push("tentacles"); break;
  }
  return slots;
}

function itemPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollRarity(bias = 0) {
  // bias shifts the total weight toward rarer items (shop tiers can raise it).
  const entries = RARITY_ORDER.map((key, i) => ({ key, weight: RARITIES[key].weight * (1 + bias * i * 0.5) }));
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e.key;
  }
  return "common";
}

function itemPrice(item) {
  return Math.round(SLOT_BASE_PRICE * RARITIES[item.rarity].price);
}

function generateItem(slotId, rarityBias = 0) {
  const slot = slotId || itemPick(Object.keys(SLOTS));
  const rarity = rollRarity(rarityBias);
  const material = itemPick(ITEM_MATERIALS);
  const variant = Math.floor(Math.random() * 3);
  const noun = itemPick(SLOTS[slot].nouns);

  // Epic+ gear earns a flourish adjective, so a Legendary reads special.
  const flair = rarity === "epic" || rarity === "legendary" ? itemPick(FLAIR_ADJECTIVES) + " " : "";
  const name = `${flair}${material.name} ${noun}`;

  return {
    id: Math.random().toString(36).slice(2),
    slot,
    rarity,
    material: material.name,
    colors: { main: material.main, trim: material.trim, gem: RARITIES[rarity].color },
    variant,
    name,
    yield: RARITIES[rarity].yield,
    stats: rollItemStats(rarity),
  };
}

// Gear stat affixes - the RPG hook that makes items impactful beyond income.
// Rarer items grant more (and bigger) bonuses. Kept small so nothing is
// game-breaking; a full min-max set still only nudges the sim.
const ITEM_STAT_AFFIXES = {
  common: { count: 0, max: 1 },
  uncommon: { count: 1, max: 2 },
  rare: { count: 1, max: 3 },
  epic: { count: 2, max: 3 },
  legendary: { count: 2, max: 4 },
};

function rollItemStats(rarity) {
  const cfg = ITEM_STAT_AFFIXES[rarity];
  const stats = {};
  const keys = STAT_KEYS.slice();
  for (let i = 0; i < cfg.count && keys.length; i++) {
    const key = keys.splice(Math.floor(Math.random() * keys.length), 1)[0];
    stats[key] = 1 + Math.floor(Math.random() * cfg.max);
  }
  return stats;
}

// ---- Rendering ------------------------------------------------------------
// Each slot computes its anchor from the pet's body bounds (same trick the
// appendages use) and draws a few pixels. `gem` cells appear only for rarer
// items, so higher tiers read as flashier at a glance.

function drawItemAt(ctx, ox, oy, item, slot, bounds) {
  const { minRow, maxRow, minCol, maxCol, centerCol } = bounds;
  const { main, trim, gem } = item.colors;
  const showGem = item.rarity !== "common";
  const c = (col, row, color) => cell(ctx, ox, oy, col, row, color);

  switch (slot) {
    case "head": {
      const brim = Math.max(0, minRow);
      const crown = Math.max(0, minRow - 1);
      c(centerCol - 1, brim, trim);
      c(centerCol, brim, trim);
      c(centerCol + 1, brim, trim);
      c(centerCol, crown, main);
      if (item.variant > 0) c(centerCol - 1, crown, main);
      if (item.variant > 1) c(centerCol + 1, crown, main);
      if (showGem) c(centerCol, crown, gem);
      break;
    }
    case "face": {
      const row = Math.max(minRow + 1, 3);
      const spread = maxCol - minCol >= 4 ? 2 : 1;
      c(centerCol - spread, row, trim);
      c(centerCol + spread, row, trim);
      if (item.variant > 0) c(centerCol, row, trim); // bridge
      if (showGem) c(centerCol - spread, row, gem);
      break;
    }
    case "body": {
      const row = Math.min(maxRow - 1, Math.round((minRow + maxRow) / 2) + 1);
      c(centerCol, row, main);
      c(centerCol - 1, row, main);
      c(centerCol + 1, row, main);
      if (item.variant > 0) c(centerCol, row + 1, trim);
      if (showGem) c(centerCol, row, gem);
      break;
    }
    case "back": {
      // A hem peeking past the body's own silhouette at the bottom edges -
      // reads as a cape/cloak trailing behind without needing a separate
      // behind-the-body draw pass.
      const row = Math.min(CREATURE_GRID_SIZE - 1, maxRow);
      c(Math.max(0, minCol - 1), row, main);
      c(Math.min(CREATURE_GRID_SIZE - 1, maxCol + 1), row, main);
      if (item.variant > 0) {
        c(Math.max(0, minCol - 1), row - 1, trim);
        c(Math.min(CREATURE_GRID_SIZE - 1, maxCol + 1), row - 1, trim);
      }
      if (showGem) c(Math.max(0, minCol - 1), row, gem);
      break;
    }
    case "ringLeft": {
      const row = Math.round((minRow + maxRow) / 2);
      c(minCol, row, showGem ? gem : main);
      break;
    }
    case "ringRight": {
      const row = Math.round((minRow + maxRow) / 2);
      c(maxCol, row, showGem ? gem : main);
      break;
    }
    case "feet": {
      const row = Math.min(CREATURE_GRID_SIZE - 1, maxRow + 1);
      c(minCol + 1, row, trim);
      c(maxCol - 1, row, trim);
      if (showGem) c(minCol + 1, row, gem);
      break;
    }
    case "antenna": {
      const row = Math.max(0, minRow - 2);
      c(centerCol - 1, row, main);
      c(centerCol + 1, row, main);
      if (showGem) {
        c(centerCol - 1, row, gem);
        c(centerCol + 1, row, gem);
      }
      break;
    }
    case "ears": {
      const row = Math.max(0, minRow - 1);
      c(minCol, row, main);
      c(maxCol, row, main);
      if (showGem) {
        c(minCol, row, gem);
        c(maxCol, row, gem);
      }
      break;
    }
    case "tentacles": {
      const row = Math.min(CREATURE_GRID_SIZE - 1, maxRow + 1);
      for (let col = minCol + 1; col <= maxCol - 1; col += 2) c(col, row, showGem ? gem : trim);
      break;
    }
  }
}

// Draws all equipped items over the creature. `equipped` is a { slot: item }
// map; anything falsy is skipped. Safe to call with an empty/undefined map.
function drawEquipment(ctx, ox, oy, bounds, equipped) {
  if (!equipped) return;
  for (const slot of Object.keys(SLOTS)) {
    const item = equipped[slot];
    if (item) drawItemAt(ctx, ox, oy, item, slot, bounds);
  }
}
