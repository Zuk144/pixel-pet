// ---------------------------------------------------------------------------
// Scenes — little pixel-art worlds the pet lives in (Johnny Castaway energy).
//
// This file is pure painting: each scene draws a backdrop plus its animated
// props/critters from (now, dayPhase, fx). The "director" that decides what
// the pet is doing — walking to the tree, working the console, napping —
// lives in main.js and talks to this file only through prop anchor positions
// (scenePropSpots) and the shared fx object it mutates (fallen apples, coin
// bursts, nap Zs, lever state...). Everything here is cosmetic-only: nothing
// in a scene touches the simulation.
// ---------------------------------------------------------------------------

// Px from the top of the screen where feet rest. The slab layout makes the
// world as tall as the device, so main.js recomputes this on every resize
// (sizeSceneCanvas) — it's a `let`, not a const, on purpose.
let SCENE_GROUND_Y = 196;
const SP = 4; // scene pixel size — chunky, matches the creature's vibe

// Where the interesting things stand, as fractions of screen width.
// "open" is a neutral hang-out spot between props.
function scenePropSpots(id, w) {
  if (id === "ship") {
    return { console: 0.26 * w, lever: 0.80 * w, porthole: 0.60 * w, open: 0.48 * w };
  }
  if (id === "beach") {
    return { palm: 0.18 * w, castle: 0.40 * w, sea: 0.62 * w, open: 0.50 * w };
  }
  if (id === "room") {
    return { tv: 0.22 * w, bed: 0.52 * w, window: 0.80 * w, open: 0.50 * w };
  }
  if (id === "cave") {
    return { vein: 0.24 * w, mushroom: 0.55 * w, pool: 0.82 * w, open: 0.44 * w };
  }
  return { tree: 0.20 * w, basket: 0.34 * w, pond: 0.80 * w, open: 0.55 * w };
}

function spx(ctx, x, y, color, wPx = 1, hPx = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), wPx * SP, hPx * SP);
}

function lerpColor(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}
function rgb(c) {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function hexToRgbStr(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
function hexToRgbArr(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Soft radial bloom — the workhorse for bioluminescent glows. `rgbStr` is a
// bare "r,g,b"; alpha is the glow's peak opacity at the center.
function drawGlow(ctx, x, y, r, rgbStr, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgbStr},${alpha})`);
  g.addColorStop(1, `rgba(${rgbStr},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---- Meadow -------------------------------------------------------------

// Sky keyframes around the day: phase 0 = dawn, .25 = noon, .5 = dusk,
// .75 = midnight (this matches simulatedAmbient's sine exactly).
const SKY_KEYS = [
  { at: 0.0, top: [246, 178, 122], bot: [255, 226, 176] },  // dawn
  { at: 0.25, top: [126, 197, 238], bot: [206, 234, 247] }, // noon
  { at: 0.5, top: [142, 98, 148], bot: [242, 166, 118] },   // dusk
  { at: 0.75, top: [22, 28, 58], bot: [46, 56, 94] },       // midnight
  { at: 1.0, top: [246, 178, 122], bot: [255, 226, 176] },  // dawn again
];

function skyColors(phase) {
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
    if (phase >= a.at && phase <= b.at) {
      const t = (phase - a.at) / (b.at - a.at);
      return { top: lerpColor(a.top, b.top, t), bot: lerpColor(a.bot, b.bot, t) };
    }
  }
  return { top: SKY_KEYS[0].top, bot: SKY_KEYS[0].bot };
}

// Deterministic star field (same stars every night, they just twinkle).
function drawStars(ctx, w, h, now, alpha) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 26; i++) {
    const x = ((i * 137 + 31) % 97) / 97 * w;
    const y = ((i * 61 + 13) % 83) / 83 * (h * 0.55);
    const tw = 0.55 + 0.45 * Math.sin(now / 700 + i * 2.3);
    ctx.fillStyle = `rgba(255,252,230,${tw})`;
    ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawMeadowTree(ctx, x, groundY, now, fx) {
  const shake = fx.treeShakeUntil > now ? Math.sin(now / 30) * 3 : 0;
  // trunk
  spx(ctx, x - SP, groundY - 13 * SP, "#7a5636", 2, 13);
  spx(ctx, x - SP * 2, groundY - 6 * SP, "#6b4a2e", 1, 2); // root knob
  // canopy — three stacked blobs, sways as one when shaken
  const cx = x + shake;
  spx(ctx, cx - SP * 5, groundY - 17 * SP, "#4d8a44", 10, 4);
  spx(ctx, cx - SP * 6, groundY - 15 * SP, "#57984c", 12, 3);
  spx(ctx, cx - SP * 4, groundY - 20 * SP, "#5fa653", 8, 3);
  spx(ctx, cx - SP * 3, groundY - 22 * SP, "#57984c", 6, 2);
  // highlights + hanging apples
  spx(ctx, cx - SP * 2, groundY - 21 * SP, "#79bd68", 3, 1);
  spx(ctx, cx + SP * 2, groundY - 16 * SP, "#79bd68", 2, 1);
  spx(ctx, cx - SP * 3, groundY - 16 * SP, "#d64545", 1, 1);
  spx(ctx, cx + SP * 3, groundY - 18 * SP, "#d64545", 1, 1);
  spx(ctx, cx, groundY - 19 * SP, "#d64545", 1, 1);
}

function drawBasket(ctx, x, groundY, fill) {
  spx(ctx, x - SP * 2, groundY - SP * 3, "#8a6238", 4, 1); // rim
  spx(ctx, x - SP * 1.5, groundY - SP * 2, "#a0764a", 3, 2); // body
  const apples = Math.min(3, Math.floor(fill * 4));
  for (let i = 0; i < apples; i++) {
    spx(ctx, x - SP * 1.5 + i * SP, groundY - SP * 3.6, "#d64545", 1, 1);
  }
}

function drawPond(ctx, x, groundY, now) {
  spx(ctx, x - SP * 6, groundY - SP, "#4d7fb8", 12, 2);
  spx(ctx, x - SP * 4, groundY - SP * 2, "#5b90c9", 8, 1);
  // slow ripple ring sliding across
  const rip = (now / 40) % 200;
  if (rip < 100) {
    ctx.globalAlpha = 1 - rip / 100;
    spx(ctx, x - SP * 3 + (rip / 100) * SP * 4, groundY - SP * 1.4, "#a8cdea", 2, 0.4);
    ctx.globalAlpha = 1;
  }
  // a fish hops out every ~7s
  const ft = (now % 7000) / 7000;
  if (ft > 0.42 && ft < 0.58) {
    const p = (ft - 0.42) / 0.16;
    const fy = groundY - SP * 2 - Math.sin(p * Math.PI) * SP * 4;
    spx(ctx, x - SP + p * SP * 3, fy, "#e8964a", 1.4, 0.8);
  }
}

// The meadow's resident butterfly wanders a lazy figure-eight. Exposed so
// the director can send the pet chasing it.
function butterflyPos(now, w) {
  const t = now / 1000;
  return {
    x: w * 0.5 + Math.sin(t * 0.32) * w * 0.33,
    y: SCENE_GROUND_Y - 104 + Math.sin(t * 0.83) * 26,
  };
}

function drawButterfly(ctx, now, w) {
  const { x, y } = butterflyPos(now, w);
  const flap = Math.floor(now / 130) % 2 === 0;
  ctx.fillStyle = "#e8b23e";
  if (flap) {
    ctx.fillRect(x - 5, y - 2, 4, 4);
    ctx.fillRect(x + 1, y - 2, 4, 4);
  } else {
    ctx.fillRect(x - 3, y - 4, 3, 6);
    ctx.fillRect(x, y - 4, 3, 6);
  }
  ctx.fillStyle = "#5a4a3a";
  ctx.fillRect(x - 1, y - 2, 2, 5);
}

// ---- Shared background fillers (the slab gives a tall sky to fill) --------

// A drifting band of puffy clouds spread across [topY, topY+bandH].
function drawCloudLayer(ctx, w, now, count, topY, bandH, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < count; i++) {
    const cw = SP * (7 + (i % 4) * 4);
    const speed = 70 + (i % 3) * 45;
    const cx = ((now / speed + i * 220) % (w + cw + 90)) - cw - 45;
    const cy = topY + ((i * 53) % 100) / 100 * bandH;
    ctx.fillRect(cx, cy, cw, SP * 1.6);
    ctx.fillRect(cx + cw * 0.2, cy - SP, cw * 0.55, SP);
    ctx.fillRect(cx + cw * 0.5, cy - SP * 0.6, cw * 0.3, SP * 0.8);
  }
  ctx.globalAlpha = 1;
}

// A little V-formation of birds drifting slowly across the sky.
function drawBirdFlock(ctx, w, now, baseY, tint) {
  const drift = (now / 120) % (w + 120) - 60;
  ctx.strokeStyle = tint || "rgba(70,70,86,0.5)";
  ctx.lineWidth = 2;
  for (const [ox, oy] of [[0, 0], [16, 8], [-16, 8], [32, 14], [-32, 14]]) {
    const bx = drift + ox, by = baseY + oy + Math.sin(now / 400 + ox) * 2;
    const flap = Math.sin(now / 160 + ox) * 3;
    ctx.beginPath();
    ctx.moveTo(bx - 4, by + flap); ctx.lineTo(bx, by); ctx.lineTo(bx + 4, by + flap);
    ctx.stroke();
  }
}

// Two receding hill ranges behind the horizon, for parallax depth.
function drawDistantHills(ctx, w, groundY, nightness) {
  const bands = [
    { y: groundY - 74, amp: 40, col: lerpColor([150, 178, 150], [40, 54, 66], nightness * 0.8) },
    { y: groundY - 44, amp: 30, col: lerpColor([124, 166, 116], [36, 52, 54], nightness * 0.8) },
  ];
  for (const b of bands) {
    ctx.fillStyle = rgb(b.col);
    ctx.beginPath();
    ctx.moveTo(0, b.y);
    ctx.quadraticCurveTo(w * 0.25, b.y - b.amp, w * 0.5, b.y - b.amp * 0.4);
    ctx.quadraticCurveTo(w * 0.78, b.y + b.amp * 0.5, w, b.y - b.amp * 0.7);
    ctx.lineTo(w, groundY); ctx.lineTo(0, groundY);
    ctx.fill();
  }
}

function drawMeadow(ctx, w, h, dayPhase, now, fx) {
  const sky = skyColors(dayPhase);
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.8);
  grad.addColorStop(0, rgb(sky.top));
  grad.addColorStop(1, rgb(sky.bot));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Night factor: how deep into darkness we are (0 day .. 1 midnight)
  const nightness = Math.max(0, Math.min(1, (Math.cos((dayPhase - 0.75) * Math.PI * 2) - 0.3) / 0.7));
  if (nightness > 0.15) drawStars(ctx, w, h, now, nightness);

  // Sun and moon arc across the same path, half a day apart
  const sunA = (dayPhase + 0.25) * Math.PI * 2; // peaks at noon
  const sunX = w * 0.5 - Math.sin(sunA) * w * 0.4;
  const sunY = h * 0.52 - Math.max(0, -Math.cos(sunA)) * h * 0.42;
  if (Math.cos(sunA) < 0.1) {
    spx(ctx, sunX - SP, sunY - SP, "#ffd76b", 3, 3);
    spx(ctx, sunX - SP * 0.5, sunY - SP * 1.5, "#ffe9a8", 2, 1);
  }
  const moonA = sunA + Math.PI;
  const moonX = w * 0.5 - Math.sin(moonA) * w * 0.4;
  const moonY = h * 0.52 - Math.max(0, -Math.cos(moonA)) * h * 0.42;
  if (Math.cos(moonA) < 0.1) {
    spx(ctx, moonX - SP, moonY - SP, "#e8e6d8", 3, 3);
    spx(ctx, moonX - SP * 0.2, moonY - SP * 0.6, rgb(sky.top), 1.4, 1.4); // crescent bite
  }

  // Drifting clouds spread across the tall sky (dimmer at night)
  drawCloudLayer(ctx, w, now, 6, h * 0.05, h * 0.42, 0.9 - nightness * 0.6);
  if (nightness < 0.5) drawBirdFlock(ctx, w, now, h * 0.24);

  // Distant parallax hill ranges at the horizon, then the near back hill
  drawDistantHills(ctx, w, SCENE_GROUND_Y, nightness);
  ctx.fillStyle = rgb(lerpColor([106, 160, 92], [42, 62, 52], nightness * 0.7));
  ctx.beginPath();
  ctx.moveTo(0, SCENE_GROUND_Y - 20);
  ctx.quadraticCurveTo(w * 0.3, SCENE_GROUND_Y - 58, w * 0.62, SCENE_GROUND_Y - 24);
  ctx.quadraticCurveTo(w * 0.82, SCENE_GROUND_Y - 4, w, SCENE_GROUND_Y - 30);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  ctx.fillStyle = rgb(lerpColor([93, 156, 80], [38, 58, 46], nightness * 0.7));
  ctx.fillRect(0, SCENE_GROUND_Y, w, h - SCENE_GROUND_Y);
  ctx.fillStyle = rgb(lerpColor([122, 91, 61], [52, 42, 34], nightness * 0.7));
  ctx.fillRect(0, SCENE_GROUND_Y + 18, w, h);

  // grass tufts, deterministic spots
  ctx.fillStyle = rgb(lerpColor([70, 128, 60], [30, 48, 40], nightness * 0.7));
  for (let i = 0; i < 14; i++) {
    const gx = ((i * 89 + 17) % 101) / 101 * w;
    ctx.fillRect(gx, SCENE_GROUND_Y + 2 + (i % 3) * 4, 3, 6);
  }
  // scattered flowers dotting the field
  const petals = ["#ff8fae", "#ffd76b", "#ffffff", "#c79bff"];
  for (let i = 0; i < 10; i++) {
    const fx2 = ((i * 71 + 33) % 100) / 100 * w;
    const fy = SCENE_GROUND_Y + 6 + (i % 4) * 9;
    ctx.fillStyle = rgb(lerpColor(hexToRgbArr(petals[i % 4]), [60, 60, 70], nightness * 0.6));
    ctx.fillRect(fx2 - 2, fy - 2, 2, 2); ctx.fillRect(fx2 + 1, fy - 2, 2, 2);
    ctx.fillRect(fx2 - 2, fy + 1, 2, 2); ctx.fillRect(fx2 + 1, fy + 1, 2, 2);
    ctx.fillStyle = "#ffe9a8"; ctx.fillRect(fx2 - 0.5, fy - 0.5, 2, 2);
  }

  const spots = scenePropSpots("meadow", w);
  drawMeadowTree(ctx, spots.tree, SCENE_GROUND_Y, now, fx);
  drawBasket(ctx, spots.basket, SCENE_GROUND_Y, fx.basketFill);
  drawPond(ctx, spots.pond, SCENE_GROUND_Y, now);
  if (nightness < 0.6) drawButterfly(ctx, now, w);
}

// ---- Spaceship ------------------------------------------------------------

function drawShipConsole(ctx, x, groundY, now, fx) {
  // cabinet
  spx(ctx, x - SP * 6, groundY - SP * 10, "#3d4358", 12, 10);
  spx(ctx, x - SP * 6, groundY - SP * 10, "#4a5169", 12, 1);
  // monitor with a scrolling green trace
  spx(ctx, x - SP * 5, groundY - SP * 9, "#101822", 10, 4);
  ctx.fillStyle = "#4ade80";
  for (let i = 0; i < 9; i++) {
    const ty = groundY - SP * 7 + Math.sin(now / 300 + i * 0.9) * SP * 1.2;
    ctx.fillRect(x - SP * 4.5 + i * SP, ty, 3, 3);
  }
  // button rows — idle blink, and a excited flurry right after a tap
  const excited = now - fx.consoleTapAt < 900;
  const cols = ["#e05252", "#e8b23e", "#4ade80", "#5b90c9"];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const on = excited
        ? Math.floor(now / 90 + r + c) % 2 === 0
        : Math.floor(now / 900 + r * 4 + c * 2.7) % 5 === 0;
      ctx.fillStyle = on ? cols[(r + c) % 4] : "#252b3a";
      ctx.fillRect(x - SP * 4 + c * SP * 2, groundY - SP * (4 - r * 1.5), SP, SP);
    }
  }
}

function drawShipLever(ctx, x, groundY, now, fx) {
  spx(ctx, x - SP, groundY - SP * 5, "#3d4358", 3, 5); // pedestal
  spx(ctx, x - SP * 0.5, groundY - SP * 5.4, "#252b3a", 2, 0.6); // slot
  const t = Math.min(1, (now - fx.leverFlipAt) / 350);
  const target = fx.leverOn ? 1 : -1;
  const from = -target;
  const lean = (from + (target - from) * t) * SP * 2.2;
  ctx.strokeStyle = "#8a92a8";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + SP * 0.5, groundY - SP * 5);
  ctx.lineTo(x + SP * 0.5 + lean, groundY - SP * 9);
  ctx.stroke();
  ctx.fillStyle = fx.leverOn ? "#4ade80" : "#e05252";
  ctx.fillRect(x + SP * 0.5 + lean - 4, groundY - SP * 9 - 4, 9, 9);
}

function drawPorthole(ctx, x, now) {
  const cy = SCENE_GROUND_Y - 128, r = 34;
  ctx.fillStyle = "#4a5169";
  ctx.beginPath();
  ctx.arc(x, cy, r + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a0e1c";
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.clip();
  // two drifting star layers
  for (let i = 0; i < 14; i++) {
    const speed = i % 2 === 0 ? 14 : 7;
    const sx = x - r + ((i * 53 + now / (60 - speed)) % (r * 2));
    const sy = cy - r + ((i * 37 + 11) % (r * 2));
    ctx.fillStyle = i % 2 === 0 ? "#fffce6" : "#8a92c8";
    ctx.fillRect(sx, sy, 2, 2);
  }
  // shooting star window every ~9s
  const st = (now % 9000) / 9000;
  if (st > 0.7 && st < 0.78) {
    const p = (st - 0.7) / 0.08;
    ctx.strokeStyle = "rgba(255,252,230,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r + p * r * 2, cy - r * 0.6 + p * r * 0.9);
    ctx.lineTo(x - r + p * r * 2 - 10, cy - r * 0.6 + p * r * 0.9 - 6);
    ctx.stroke();
  }
  ctx.restore();
  // rivets
  ctx.fillStyle = "#6a7288";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.fillRect(x + Math.cos(a) * (r + 3) - 1.5, cy + Math.sin(a) * (r + 3) - 1.5, 3, 3);
  }
}

function drawShip(ctx, w, h, now, fx) {
  // hull backdrop
  const hg = ctx.createLinearGradient(0, 0, 0, h);
  hg.addColorStop(0, "#242938");
  hg.addColorStop(1, "#2d3243");
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, w, h);

  // riveted wall panel grid covering the tall hull
  const panelH = 52;
  ctx.strokeStyle = "#353b4d";
  ctx.lineWidth = 2;
  for (let py = 6; py < SCENE_GROUND_Y - 8; py += panelH) {
    for (let px = 6; px < w - 6; px += 64) {
      ctx.strokeRect(px, py, Math.min(64, w - 6 - px) - 6, panelH - 6);
    }
    ctx.fillStyle = "#3f465c"; // rivets along each seam
    for (let px = 12; px < w - 6; px += 22) ctx.fillRect(px, py + 3, 2, 2);
  }

  // vertical conduits / pipes running down each side
  for (const px of [w * 0.06, w * 0.94]) {
    ctx.fillStyle = "#3a4056";
    ctx.fillRect(px - 3, 10, 6, SCENE_GROUND_Y - 18);
    ctx.fillStyle = "#4a5169";
    for (let py = 20; py < SCENE_GROUND_Y - 12; py += 26) ctx.fillRect(px - 5, py, 10, 4); // brackets
  }

  // overhead vent grilles near the ceiling
  ctx.fillStyle = "#1c2130";
  for (const vx of [w * 0.3, w * 0.7]) {
    ctx.fillRect(vx - 16, 6, 32, 12);
    ctx.fillStyle = "#3a4157";
    for (let k = 0; k < 5; k++) ctx.fillRect(vx - 14 + k * 6, 8, 3, 8);
    ctx.fillStyle = "#1c2130";
  }

  // a secondary viewscreen high on the wall (radar sweep)
  const scx = w * 0.82, scy = h * 0.2;
  ctx.fillStyle = "#12202a";
  ctx.fillRect(scx - 20, scy - 15, 40, 30);
  ctx.strokeStyle = "#2f4a3a"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(scx, scy, 11, 0, Math.PI * 2); ctx.stroke();
  const sweep = (now / 900) % (Math.PI * 2);
  ctx.strokeStyle = "#4ade80";
  ctx.beginPath(); ctx.moveTo(scx, scy); ctx.lineTo(scx + Math.cos(sweep) * 11, scy + Math.sin(sweep) * 11); ctx.stroke();

  // blinking status lights scattered on the walls
  const lights = [[0.18, 0.14, "#e05252"], [0.5, 0.1, "#e8b23e"], [0.72, 0.32, "#4ade80"], [0.14, 0.4, "#5b90c9"]];
  for (const [lx, ly, col] of lights) {
    const on = Math.floor(now / 700 + lx * 10) % 3 !== 0;
    ctx.fillStyle = on ? col : "#2a3040";
    ctx.fillRect(w * lx, h * ly, 4, 4);
  }

  // ceiling light strip — flashes when the lever gets pulled
  const flash = now - fx.leverFlipAt < 700 && Math.floor(now / 100) % 2 === 0;
  ctx.fillStyle = flash ? "#ffd76b" : fx.leverOn ? "#7ec5ee" : "#454c62";
  ctx.fillRect(w * 0.1, 2, w * 0.8, 4);
  // floor
  ctx.fillStyle = "#383e50";
  ctx.fillRect(0, SCENE_GROUND_Y, w, h - SCENE_GROUND_Y);
  ctx.fillStyle = "#2e3444";
  for (let i = 0; i < 6; i++) ctx.fillRect(i * (w / 6) + 4, SCENE_GROUND_Y + 8, w / 6 - 8, 3);

  const spots = scenePropSpots("ship", w);
  drawPorthole(ctx, spots.porthole, now);
  drawShipConsole(ctx, spots.console, SCENE_GROUND_Y, now, fx);
  drawShipLever(ctx, spots.lever, SCENE_GROUND_Y, now, fx);
}

// ---- Beach ----------------------------------------------------------------

// The near edge of the surf (absolute px). Slides in and out on a slow tide;
// the director reads this so the pet can dance just ahead of the foam.
function beachTideEdge(now, w) {
  const shoreX = w * 0.62;
  return shoreX + (Math.sin(now / 1600) * 0.5 + 0.5) * 38;
}

function drawPalm(ctx, x, groundY, now) {
  // curved trunk, stepping toward the sea as it rises
  let tx = x, ty = groundY - SP;
  for (let i = 0; i < 8; i++) {
    tx = x + Math.sin(i / 8 * 1.3) * SP * 2;
    ty = groundY - SP - i * SP * 1.7;
    spx(ctx, tx - SP * 0.5, ty, "#a9784a", 1.3, 1.7);
  }
  // coconuts at the crown
  spx(ctx, tx - SP, ty - SP, "#6b4a2e", 1, 1);
  spx(ctx, tx + SP * 0.4, ty - SP * 0.4, "#6b4a2e", 1, 1);
  // drooping fronds
  const sway = Math.sin(now / 620) * 3;
  ctx.strokeStyle = "#3f9a54";
  ctx.lineWidth = 5;
  for (const ang of [-2.7, -2.0, -1.2, -0.5, -3.6]) {
    ctx.beginPath();
    ctx.moveTo(tx, ty - 2);
    ctx.lineTo(tx + Math.cos(ang) * 26, ty - 2 + Math.sin(ang) * 22 + sway);
    ctx.stroke();
  }
  ctx.strokeStyle = "#4fb268";
  ctx.lineWidth = 2;
  for (const ang of [-2.4, -1.6, -0.9]) {
    ctx.beginPath();
    ctx.moveTo(tx, ty - 2);
    ctx.lineTo(tx + Math.cos(ang) * 22, ty - 2 + Math.sin(ang) * 18 + sway);
    ctx.stroke();
  }
}

function drawSandcastle(ctx, x, groundY, fill) {
  const base = "#d8b878", dk = "#c2a05f";
  spx(ctx, x - SP * 3, groundY - SP * 2, base, 6, 2); // mound
  const th = 1 + Math.floor(fill * 3); // towers grow as it's built
  spx(ctx, x - SP * 3, groundY - SP * (2 + th), dk, 1.4, th);
  spx(ctx, x + SP * 1.6, groundY - SP * (2 + th), dk, 1.4, th);
  spx(ctx, x - SP * 0.8, groundY - SP * (2 + th + 1), base, 1.7, th + 1); // taller center keep
  if (fill > 0.5) {
    spx(ctx, x, groundY - SP * (3 + th + 1), "#e05252", 1, 1); // flag
    spx(ctx, x - SP * 0.35, groundY - SP * (3 + th + 1), "#8a6238", 0.35, 1);
  }
}

function drawSeagull(ctx, x, y, now, i) {
  const flap = Math.sin(now / 260 + i) * 3;
  ctx.strokeStyle = "rgba(74,74,86,0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 6, y + flap);
  ctx.lineTo(x, y - 2);
  ctx.lineTo(x + 6, y + flap);
  ctx.stroke();
}

// The beach picks a "mood" per visit (main.js setupBeach) instead of tracking
// the global clock — so a gorgeous sunset is a special roll you look forward
// to, not something tied to what time you happen to check in. `space` is the
// rare surprise (an alien shore under a ringed planet).
const BEACH_SKY = {
  day: {
    stops: [[0, [126, 197, 238]], [0.62, [206, 234, 247]]],
    sand: [232, 210, 156], ripple: [214, 190, 138], sea: [52, 148, 188], seaHi: [124, 196, 224],
  },
  sunset: {
    stops: [[0, [72, 50, 110]], [0.4, [232, 104, 120]], [0.72, [255, 166, 96]], [1, [255, 216, 150]]],
    sand: [226, 178, 132], ripple: [206, 150, 110], sea: [196, 116, 120], seaHi: [255, 196, 150],
  },
  night: {
    stops: [[0, [16, 20, 44]], [0.7, [38, 48, 84]]],
    sand: [104, 98, 82], ripple: [80, 76, 64], sea: [22, 50, 82], seaHi: [58, 96, 132],
  },
  space: {
    stops: [[0, [32, 16, 60]], [0.55, [86, 46, 124]], [1, [150, 96, 158]]],
    sand: [150, 120, 172], ripple: [124, 98, 150], sea: [70, 58, 146], seaHi: [150, 120, 224],
  },
};

function drawRingedPlanet(ctx, x, y) {
  drawGlow(ctx, x, y, 34, "150,110,240", 0.25);
  ctx.fillStyle = "#b98ae0";
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#9a6ad0";
  ctx.beginPath(); ctx.arc(x - 5, y - 4, 10, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(230,210,255,0.85)";
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(x, y, 26, 8, -0.4, 0, Math.PI * 2); ctx.stroke();
}

function drawShell(ctx, s, groundY) {
  if (s.gone) return;
  const x = s.x, y = groundY + 5;
  if (s.glow) drawGlow(ctx, x, y, 12, hexToRgbStr(s.col), 0.55);
  ctx.fillStyle = s.col;
  if (s.kind === 0) { // spiral shell
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(x - 1, y - 1, 2, 3);
  } else if (s.kind === 1) { // clam fan
    ctx.beginPath(); ctx.moveTo(x - 5, y + 2); ctx.lineTo(x, y - 4); ctx.lineTo(x + 5, y + 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 2); ctx.stroke();
  } else { // starfish
    ctx.fillRect(x - 1, y - 5, 2, 10); ctx.fillRect(x - 5, y - 1, 10, 2);
    ctx.fillRect(x - 3, y - 3, 2, 2); ctx.fillRect(x + 2, y - 3, 2, 2);
  }
}

// A hazy distant island sitting on the sea horizon.
function drawIsland(ctx, x, y, dark) {
  ctx.fillStyle = dark ? "rgba(40,44,70,0.8)" : "rgba(96,122,96,0.7)";
  ctx.beginPath();
  ctx.moveTo(x - 26, y);
  ctx.quadraticCurveTo(x - 8, y - 16, x, y - 17);
  ctx.quadraticCurveTo(x + 10, y - 18, x + 26, y);
  ctx.fill();
  ctx.fillStyle = dark ? "rgba(60,120,110,0.5)" : "rgba(70,150,90,0.55)";
  ctx.fillRect(x - 3, y - 22, 2, 6); // a lone palm silhouette
  ctx.beginPath(); ctx.ellipse(x - 2, y - 22, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
}

// A little sailboat gliding gently across the open water. Its range is a
// FIXED slice of sea (past the tide's farthest reach), and it drifts on a slow
// sine, so it never wobbles with the tide or teleports at a loop point.
function drawSailboat(ctx, w, now, seaTop) {
  const x0 = w * 0.62 + 46; // clears the surf even at low tide
  const x1 = w - 16;
  if (x1 - x0 < 20) return; // sea too narrow to bother
  const t = (Math.sin(now / 11000) + 1) / 2; // slow, smooth ping-pong
  const x = x0 + (x1 - x0) * t;
  const y = seaTop + 12 + Math.sin(now / 900) * 1.5; // gentle bob
  const facing = Math.cos(now / 11000) >= 0 ? 1 : -1; // sail catches the wind the way it's heading
  ctx.fillStyle = "#6b4a2e";
  ctx.fillRect(x - 7, y, 14, 3); // hull
  ctx.fillStyle = "#8a6238";
  ctx.fillRect(x - 0.5, y - 14, 1.5, 14); // mast
  ctx.fillStyle = "#fbf3e0";
  ctx.beginPath();
  ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 1); ctx.lineTo(x + 8 * facing, y - 1); ctx.fill(); // sail
}

function drawBeach(ctx, w, h, dayPhase, now, fx) {
  const mood = BEACH_SKY[fx.beachSky] || BEACH_SKY.day;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  for (const [pos, col] of mood.stops) grad.addColorStop(pos, rgb(col));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const dark = fx.beachSky === "night" || fx.beachSky === "space";
  if (dark) drawStars(ctx, w, h, now, fx.beachSky === "space" ? 0.9 : 0.8);
  else drawCloudLayer(ctx, w, now, 7, h * 0.05, h * 0.55, fx.beachSky === "sunset" ? 0.5 : 0.85);

  const edge = beachTideEdge(now, w);
  const seaTop = SCENE_GROUND_Y - 10; // matches the sand line so the sea doesn't float above it

  // celestial, tuned per mood
  if (fx.beachSky === "day") {
    spx(ctx, w * 0.7, 40, "#ffe27a", 3, 3);
    spx(ctx, w * 0.7 + SP * 0.5, 40 + SP * 0.5, "#fff3c0", 1.5, 1.5);
  } else if (fx.beachSky === "sunset") {
    // a big low sun resting on the ocean — the Hawaii money shot
    const sx = w * 0.78, sy = seaTop - 4;
    const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, 32);
    sg.addColorStop(0, "#fff0c0"); sg.addColorStop(0.5, "#ff9e5a"); sg.addColorStop(1, "rgba(255,120,90,0)");
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sx, sy, 32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd27a";
    ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2); ctx.fill();
  } else if (fx.beachSky === "night") {
    spx(ctx, w * 0.72, 40, "#e8e6d8", 3, 3);
    spx(ctx, w * 0.72 + SP * 0.6, 40 + SP * 0.4, rgb(mood.stops[0][1]), 1.6, 1.6);
  } else { // space
    drawRingedPlanet(ctx, w * 0.34, 62);
    spx(ctx, w * 0.72, 34, "#d8c0ff", 2, 2);
  }

  // sand
  ctx.fillStyle = rgb(mood.sand);
  ctx.fillRect(0, SCENE_GROUND_Y - 10, w, h - (SCENE_GROUND_Y - 10));
  ctx.fillStyle = rgb(mood.ripple);
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(((i * 71 + 20) % 100) / 100 * w * 0.55, SCENE_GROUND_Y + 6 + i * 6, 12, 2);
  }

  // sea filling the lower-right, with a sliding surf edge
  ctx.fillStyle = rgb(mood.sea);
  ctx.fillRect(edge, seaTop, w - edge, h - seaTop);
  if (fx.beachSky === "sunset") {
    // warm sun-glitter column reflected on the water
    ctx.fillStyle = "rgba(255,180,110,0.32)";
    ctx.fillRect(w * 0.78 - 8, seaTop, 16, h - seaTop);
  }
  ctx.fillStyle = rgb(mood.seaHi);
  for (let i = 0; i < 6; i++) {
    const wy = seaTop + 8 + i * 9;
    const off = (now / (24 + i * 6)) % 34;
    for (let x = edge + (off % 34); x < w; x += 34) ctx.fillRect(x, wy, 15, 2);
  }
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillRect(edge - 4, seaTop, 6, h - seaTop);

  // out on the water: a distant island and a drifting sailboat
  drawIsland(ctx, edge + (w - edge) * 0.62, seaTop + 4, dark);
  drawSailboat(ctx, w, now, seaTop);

  if (!dark) {
    drawSeagull(ctx, w * 0.3 + Math.sin(now / 2600) * 30, 46, now, 0);
    drawSeagull(ctx, w * 0.42 + Math.sin(now / 2200 + 1) * 26, 62, now, 1.7);
    drawSeagull(ctx, w * 0.6 + Math.sin(now / 2400 + 2) * 28, h * 0.16, now, 3.1);
  }

  // dune grass tufts scattered on the dry sand
  ctx.strokeStyle = rgb(lerpColor([150, 168, 96], [70, 74, 56], dark ? 0.7 : 0));
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const gx = ((i * 61 + 20) % 100) / 100 * (edge - 20) + 6;
    const gy = SCENE_GROUND_Y + 4 + (i % 3) * 7;
    for (const a of [-3, 0, 3]) {
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + a, gy - 7); ctx.stroke();
    }
  }

  const spots = scenePropSpots("beach", w);
  drawPalm(ctx, spots.palm, SCENE_GROUND_Y, now);
  drawSandcastle(ctx, spots.castle, SCENE_GROUND_Y, fx.castleFill);
  for (const s of (fx.shells || [])) drawShell(ctx, s, SCENE_GROUND_Y);
}

// ---- Cozy room ------------------------------------------------------------

function drawWindow(ctx, x, now) {
  const cy = SCENE_GROUND_Y - 130, ww = 62, hh = 62;
  ctx.fillStyle = "#e9dcc4"; // frame
  ctx.fillRect(x - ww / 2 - 5, cy - hh / 2 - 5, ww + 10, hh + 10);
  ctx.fillStyle = "#161f3a"; // night pane
  ctx.fillRect(x - ww / 2, cy - hh / 2, ww, hh);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - ww / 2, cy - hh / 2, ww, hh);
  ctx.clip();
  for (let i = 0; i < 16; i++) {
    const sx = x - ww / 2 + ((i * 29 + 7) % ww);
    const sy = cy - hh / 2 + ((i * 17 + 3) % hh);
    const tw = 0.5 + 0.5 * Math.sin(now / 700 + i);
    ctx.fillStyle = `rgba(255,250,220,${tw})`;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.fillStyle = "#e8e6d8"; // moon
  ctx.beginPath();
  ctx.arc(x + ww * 0.2, cy - hh * 0.18, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#161f3a";
  ctx.beginPath();
  ctx.arc(x + ww * 0.34, cy - hh * 0.24, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#e9dcc4"; // muntins
  ctx.fillRect(x - 1.5, cy - hh / 2, 3, hh);
  ctx.fillRect(x - ww / 2, cy - 1.5, ww, 3);
}

function drawTV(ctx, x, floorY, now) {
  spx(ctx, x - SP, floorY - SP * 1.5, "#5a3f2a", 2, 1.5); // stand
  const bw = SP * 7, bh = SP * 5, bx = x - bw / 2, by = floorY - SP * 1.5 - bh;
  ctx.fillStyle = "#3a3f4a"; // cabinet
  ctx.fillRect(bx, by, bw, bh);
  // flickering picture
  const pics = [["#4ade80", "#22333a"], ["#5b90c9", "#22243a"], ["#e8b23e", "#3a2f22"], ["#e05252", "#3a2222"]];
  const p = pics[Math.floor(now / 500) % pics.length];
  ctx.fillStyle = p[1];
  ctx.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
  ctx.fillStyle = p[0];
  const bandY = by + 3 + (Math.floor(now / 110) % (bh - 6));
  ctx.fillRect(bx + 3, bandY, bw - 6, 3);
  // warm glow spilling on the floor
  ctx.fillStyle = `rgba(255,238,180,${0.06 + 0.045 * Math.sin(now / 260)})`;
  ctx.beginPath();
  ctx.moveTo(x, floorY - SP);
  ctx.lineTo(x + 46, floorY + 22);
  ctx.lineTo(x - 46, floorY + 22);
  ctx.fill();
}

function drawBed(ctx, x, floorY) {
  const bw = SP * 9, bh = SP * 3;
  ctx.fillStyle = "#6b4a2e"; // frame
  ctx.fillRect(x - bw / 2, floorY - bh, bw, bh);
  ctx.fillStyle = "#e7ddc8"; // mattress
  ctx.fillRect(x - bw / 2 + 2, floorY - bh - SP, bw - 4, SP * 1.4);
  ctx.fillStyle = "#7fae8f"; // blanket
  ctx.fillRect(x - bw / 2 + 2, floorY - bh - SP, bw * 0.55, SP * 1.4);
  ctx.fillStyle = "#fff"; // pillow
  ctx.fillRect(x + bw / 2 - SP * 2.6, floorY - bh - SP * 1.5, SP * 2, SP * 1.2);
  ctx.fillStyle = "#5a3f28"; // headboard
  ctx.fillRect(x + bw / 2 - 2, floorY - bh - SP * 2.6, 5, SP * 3.6);
}

function drawPlant(ctx, x, floorY) {
  spx(ctx, x - SP * 0.8, floorY - SP * 1.4, "#b5654a", 1.7, 1.4); // pot
  ctx.fillStyle = "#4d8a44";
  for (const dx of [-3, 0, 3]) ctx.fillRect(x + dx, floorY - SP * 1.4 - 15, 3, 15);
}

function drawBookshelf(ctx, x, floorY) {
  const bw = 42, bh = 92, bx = x - bw / 2, by = floorY - bh;
  ctx.fillStyle = "#6b4a2e";
  ctx.fillRect(bx, by, bw, bh); // cabinet
  ctx.fillStyle = "#4f3620";
  for (let s = 1; s < 4; s++) ctx.fillRect(bx, by + s * (bh / 4), bw, 3); // shelves
  const bookCols = ["#c05a5a", "#5a8ac0", "#c0a05a", "#6ab27a", "#9a6cc6", "#c07ba0"];
  for (let s = 0; s < 4; s++) {
    let px = bx + 4;
    const shelfY = by + s * (bh / 4) + 4;
    let k = (s * 7) % bookCols.length;
    while (px < bx + bw - 5) {
      const bwid = 3 + ((k * 5) % 4);
      const bhei = (bh / 4) - 8 - ((k * 3) % 5);
      ctx.fillStyle = bookCols[k % bookCols.length];
      ctx.fillRect(px, shelfY + ((bh / 4) - 7 - bhei), bwid, bhei);
      px += bwid + 1; k++;
    }
  }
}

function drawWallClock(ctx, x, y, now) {
  ctx.fillStyle = "#3a2e22";
  ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f3ead4";
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
  const t = now / 1000;
  ctx.strokeStyle = "#5a4a3a"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(t / 6 - 1.6) * 5, y + Math.sin(t / 6 - 1.6) * 5); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(t - 1.6) * 7, y + Math.sin(t - 1.6) * 7); ctx.stroke();
}

// A pendant lamp hanging down into the room, casting a warm pool of light.
function drawLamp(ctx, x, drop) {
  ctx.fillStyle = "#5a4a3a";
  ctx.fillRect(x - 0.5, 0, 1.5, drop); // long cord from the ceiling
  const sy = drop;
  drawGlow(ctx, x, sy + 30, 64, "255,220,140", 0.16); // warm pool of light
  ctx.fillStyle = "#3a2e22";
  ctx.beginPath();
  ctx.moveTo(x - 13, sy + 12); ctx.lineTo(x + 13, sy + 12); ctx.lineTo(x + 7, sy); ctx.lineTo(x - 7, sy); ctx.fill(); // shade
  ctx.fillStyle = "#ffe9a8";
  ctx.fillRect(x - 4, sy + 12, 8, 3); // glowing bulb underside
}

// A string of warm dot-lights draped across the top of the wall.
function drawFairyLights(ctx, w, now) {
  const cols = ["#ff9d6b", "#ffd76b", "#8fd8a0", "#8fb8e8", "#e090c0"];
  ctx.strokeStyle = "rgba(90,74,58,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) ctx.lineTo(x, 14 + Math.sin(x / w * 6.28 * 3) * 8);
  ctx.stroke();
  for (let i = 0; i * 30 < w; i++) {
    const lx = i * 30 + 15;
    const ly = 14 + Math.sin(lx / w * 6.28 * 3) * 8 + 4;
    const tw = 0.6 + 0.4 * Math.sin(now / 500 + i);
    ctx.fillStyle = cols[i % cols.length];
    ctx.globalAlpha = tw;
    ctx.fillRect(lx - 1.5, ly, 3, 3);
    ctx.globalAlpha = 1;
  }
}

function drawRoom(ctx, w, h, now, fx) {
  const floorY = SCENE_GROUND_Y - 6;
  const wg = ctx.createLinearGradient(0, 0, 0, floorY);
  wg.addColorStop(0, "#a87c57");
  wg.addColorStop(1, "#b98a63");
  ctx.fillStyle = wg; // warm wall
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.04)"; // wallpaper stripes
  for (let x = 0; x < w; x += SP * 3) ctx.fillRect(x, 0, SP, floorY);
  // wainscot trim along the lower wall
  ctx.fillStyle = "rgba(255,248,236,0.10)";
  ctx.fillRect(0, floorY - 44, w, 40);
  ctx.fillStyle = "#8a6543";
  ctx.fillRect(0, floorY - 46, w, 3);

  const spots = scenePropSpots("room", w);
  // fairy lights strung across the top, and a pendant lamp hanging into the room
  drawFairyLights(ctx, w, now);
  drawLamp(ctx, w * 0.5, h * 0.2);
  // framed pictures + clock on the wall
  ctx.fillStyle = "#8a6238";
  ctx.fillRect(w * 0.34, SCENE_GROUND_Y - 168, 34, 26);
  ctx.fillStyle = "#c9a06a";
  ctx.fillRect(w * 0.34 + 4, SCENE_GROUND_Y - 164, 26, 18);
  ctx.fillStyle = "#8a6238";
  ctx.fillRect(w * 0.48, SCENE_GROUND_Y - 150, 22, 22);
  ctx.fillStyle = "#7fae8f";
  ctx.fillRect(w * 0.48 + 3, SCENE_GROUND_Y - 147, 16, 16);
  drawWallClock(ctx, w * 0.66, SCENE_GROUND_Y - 158, now);

  // floor + boards
  ctx.fillStyle = "#8a5a38";
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.fillStyle = "#7a4e30";
  for (let i = 1; i < 7; i++) ctx.fillRect(0, floorY + i * ((h - floorY) / 7), w, 2);
  ctx.fillStyle = "#6b4326"; // baseboard
  ctx.fillRect(0, floorY - 3, w, 4);
  // round rug
  ctx.fillStyle = "#a85a5a";
  ctx.beginPath();
  ctx.ellipse(w * 0.5, floorY + (h - floorY) * 0.42, w * 0.27, (h - floorY) * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c47b7b";
  ctx.beginPath();
  ctx.ellipse(w * 0.5, floorY + (h - floorY) * 0.42, w * 0.19, (h - floorY) * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  drawBookshelf(ctx, w * 0.08, floorY);
  drawWindow(ctx, spots.window, now);
  drawTV(ctx, spots.tv, floorY, now);
  drawBed(ctx, spots.bed, floorY);
  drawPlant(ctx, w * 0.94, floorY);
}

// ---- Crystal cave ---------------------------------------------------------
// Bioluminescent underground — Pandora-at-night. The pet's "job" here is
// mining the crystal vein (adults chip at it; a real payout still fires its
// own coin burst, so it reads as getting paid for the work).

function drawCrystalVein(ctx, x, groundY, now, fx) {
  const hit = now - (fx.crystalHitAt || -9999) < 220;
  const pulse = 0.6 + 0.4 * Math.sin(now / 500);
  drawGlow(ctx, x, groundY - 16, 48, "120,220,255", hit ? 0.5 : 0.22 * pulse);
  const shards = [
    [-18, 20, "#6ad0ff"], [-10, 32, "#4bd6e6"], [-2, 46, "#7ee0ff"],
    [8, 36, "#5ab6ff"], [16, 24, "#9a7bff"],
  ];
  for (const [dx, ht, col] of shards) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + dx - 4, groundY);
    ctx.lineTo(x + dx, groundY - ht);
    ctx.lineTo(x + dx + 4, groundY);
    ctx.fill();
    ctx.fillStyle = hit ? "#ffffff" : "rgba(255,255,255,0.5)";
    ctx.fillRect(x + dx - 1, groundY - ht + 4, 2, ht * 0.4);
  }
}

function drawGlowMushrooms(ctx, x, groundY, now, fx) {
  const pulse = now - (fx.mushroomPulseAt || -9999) < 400;
  const mush = [[-14, 12, "200,138,240"], [1, 18, "126,240,224"], [13, 13, "138,182,240"]];
  for (const [dx, ht, rgbStr] of mush) {
    const gx = x + dx;
    const glowA = pulse ? 0.55 : 0.24 + 0.14 * Math.sin(now / 600 + dx);
    drawGlow(ctx, gx, groundY - ht, 20, rgbStr, glowA);
    ctx.fillStyle = "#3a3350";
    ctx.fillRect(gx - 2, groundY - ht, 4, ht); // stem
    ctx.fillStyle = `rgb(${rgbStr})`;
    ctx.beginPath(); ctx.ellipse(gx, groundY - ht, 7, 5, 0, 0, Math.PI * 2); ctx.fill(); // cap
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(gx - 3, groundY - ht - 1, 1.5, 1.5);
    ctx.fillRect(gx + 2, groundY - ht + 1, 1.5, 1.5);
  }
}

function drawCavePool(ctx, x, groundY, now) {
  drawGlow(ctx, x, groundY, 40, "90,200,255", 0.18);
  ctx.fillStyle = "#1b4a66";
  ctx.beginPath(); ctx.ellipse(x, groundY, 34, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3a8fb8";
  ctx.beginPath(); ctx.ellipse(x, groundY - 1, 24, 5, 0, 0, Math.PI * 2); ctx.fill();
  const rip = (now / 40) % 60;
  ctx.globalAlpha = Math.max(0, 1 - rip / 60);
  ctx.strokeStyle = "rgba(150,230,255,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(x, groundY - 1, 6 + rip * 0.4, 2 + rip * 0.1, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawCave(ctx, w, h, now, fx) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0e0b1a");
  g.addColorStop(1, "#171326");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // ambient glow washes so the whole cavern feels lit from within
  drawGlow(ctx, w * 0.25, SCENE_GROUND_Y - 30, 74, "80,200,220", 0.10);
  drawGlow(ctx, w * 0.55, SCENE_GROUND_Y - 22, 62, "150,110,230", 0.10);
  drawGlow(ctx, w * 0.82, SCENE_GROUND_Y - 16, 62, "90,160,255", 0.10);
  drawGlow(ctx, w * 0.4, h * 0.28, 90, "90,120,200", 0.06); // deep-cavern haze up high

  // rocky ceiling band with hanging stalactites of varied length
  ctx.fillStyle = "#1e1a30";
  ctx.fillRect(0, 0, w, 10);
  ctx.fillStyle = "#241f38";
  for (let i = 0; i < 12; i++) {
    const sx = (i + 0.5) * (w / 12);
    const len = 14 + ((i * 37) % 7) * 9; // some now hang much longer
    const wd = 5 + (i % 3) * 2;
    ctx.beginPath();
    ctx.moveTo(sx - wd, 0); ctx.lineTo(sx + wd, 0); ctx.lineTo(sx, len); ctx.fill();
  }

  // background crystal clusters, small + dim, for depth
  const bgCrystals = [[0.12, -70, "70,150,200"], [0.68, -96, "130,100,200"], [0.9, -60, "80,180,200"], [0.4, -120, "90,140,220"]];
  for (const [fxp, dy, col] of bgCrystals) {
    const cx = w * fxp, cy = SCENE_GROUND_Y + dy;
    drawGlow(ctx, cx, cy, 26, col, 0.16 + 0.06 * Math.sin(now / 700 + fxp * 9));
    ctx.fillStyle = `rgba(${col},0.5)`;
    for (const [ox, oh] of [[-6, 14], [0, 22], [6, 16]]) {
      ctx.beginPath();
      ctx.moveTo(cx + ox - 3, cy); ctx.lineTo(cx + ox, cy - oh); ctx.lineTo(cx + ox + 3, cy); ctx.fill();
    }
  }

  // a single drip falling on a slow cycle
  const dripT = (now % 3200) / 3200;
  if (dripT < 0.5) {
    const dy = (dripT / 0.5) * (SCENE_GROUND_Y - 24);
    ctx.fillStyle = "rgba(150,230,255,0.7)";
    ctx.fillRect(w * 0.5 - 1, 22 + dy, 2, 4);
  }

  // floor
  ctx.fillStyle = "#1c1830";
  ctx.fillRect(0, SCENE_GROUND_Y - 8, w, h);
  ctx.fillStyle = "#15111f";
  ctx.fillRect(0, SCENE_GROUND_Y + 14, w, h);

  // stalagmites rising from the cave floor
  ctx.fillStyle = "#221d34";
  for (let i = 0; i < 6; i++) {
    const sx = ((i * 79 + 30) % 100) / 100 * w;
    const ht = 10 + ((i * 53) % 4) * 7;
    ctx.beginPath();
    ctx.moveTo(sx - 6, SCENE_GROUND_Y); ctx.lineTo(sx, SCENE_GROUND_Y - ht); ctx.lineTo(sx + 6, SCENE_GROUND_Y); ctx.fill();
  }

  const spots = scenePropSpots("cave", w);
  drawCavePool(ctx, spots.pool, SCENE_GROUND_Y, now);
  drawGlowMushrooms(ctx, spots.mushroom, SCENE_GROUND_Y, now, fx);
  drawCrystalVein(ctx, spots.vein, SCENE_GROUND_Y, now, fx);

  // spore motes drifting up through the whole tall cavern
  for (let i = 0; i < 22; i++) {
    const t = ((now / 2600) + i / 22) % 1;
    const mx = ((i * 83 + 20) % 100) / 100 * w;
    ctx.globalAlpha = (1 - t) * 0.6;
    ctx.fillStyle = i % 2 ? "#7ef0e0" : "#c88af0";
    ctx.fillRect(mx, SCENE_GROUND_Y - t * (SCENE_GROUND_Y - 20), 2, 2);
    ctx.globalAlpha = 1;
  }
}

// ---- Vignettes: the "look what happened!" moments ------------------------
// Little events that visit a scene now and then (a crab, a shooting star, a
// UFO past the porthole). The pet reacts; the director in main.js drives the
// pet, this file just paints the visitor. Actor *paths* live here too, shared
// with the director so the pet can chase what it sees. `p` is 0..1 progress.

function vigBirdPos(w, p) {
  // swoops in from the right, lands by the fallen apples, then flees left
  let x;
  if (p < 0.4) x = w * 1.08 + (w * 0.34 - w * 1.08) * (p / 0.4);
  else if (p < 0.55) x = w * 0.34;
  else x = w * 0.34 + (-w * 0.2 - w * 0.34) * ((p - 0.55) / 0.45);
  const airborne = p < 0.42 || p > 0.55;
  return { x, y: airborne ? SCENE_GROUND_Y - 120 : SCENE_GROUND_Y - 22, airborne, hasApple: p > 0.52 };
}
function vigCrabPos(w, p) { return { x: w * 0.72 + (w * 0.16 - w * 0.72) * p, y: SCENE_GROUND_Y - 4 }; }
function vigMousePos(w, p) { return { x: w * 0.14 + (w * 0.92 - w * 0.14) * p, y: SCENE_GROUND_Y - 2 }; }
function vigSwarmX(w, now) { return w * 0.5 + Math.sin(now / 620) * w * 0.24; }

function vigDrawBird(ctx, w, now, p) {
  const b = vigBirdPos(w, p);
  const flap = b.airborne ? Math.sin(now / 90) * 4 : 0;
  ctx.fillStyle = "#4a4a55";
  ctx.fillRect(b.x - 4, b.y - 2, 8, 5);
  ctx.fillStyle = "#3a3a45";
  ctx.fillRect(b.x - 9, b.y - 2 + flap, 6, 2);
  ctx.fillRect(b.x + 3, b.y - 2 + flap, 6, 2);
  ctx.fillStyle = "#e8b23e";
  ctx.fillRect(b.x + 4, b.y - 1, 3, 2);
  if (b.hasApple) { ctx.fillStyle = "#d64545"; ctx.fillRect(b.x - 2, b.y + 3, 4, 4); }
}

function vigDrawRainbow(ctx, w, p) {
  const a = Math.min(1, p / 0.2) * (p > 0.85 ? (1 - p) / 0.15 : 1);
  ctx.globalAlpha = Math.max(0, a) * 0.75;
  const cols = ["#e0556b", "#e8a23e", "#e8d84a", "#5fbf5a", "#4d8ad6", "#8a5ad6"];
  ctx.lineWidth = 4;
  for (let i = 0; i < cols.length; i++) {
    ctx.strokeStyle = cols[i];
    ctx.beginPath();
    ctx.arc(w * 0.5, SCENE_GROUND_Y + 20, 78 - i * 4, Math.PI, 0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function vigDrawSwarm(ctx, w, now) {
  for (let i = 0; i < 4; i++) {
    const t = now / 1000 + i * 1.7;
    const bx = w * 0.5 + Math.sin(t * 0.9 + i) * w * 0.28;
    const by = SCENE_GROUND_Y - 110 + Math.sin(t * 1.4 + i * 2) * 30;
    const flap = Math.floor(now / 120 + i) % 2 === 0;
    ctx.fillStyle = ["#e8b23e", "#e07ba8", "#7bb0e0", "#b07be0"][i];
    if (flap) { ctx.fillRect(bx - 4, by - 2, 3, 4); ctx.fillRect(bx + 1, by - 2, 3, 4); }
    else { ctx.fillRect(bx - 2, by - 3, 2, 5); ctx.fillRect(bx, by - 3, 2, 5); }
  }
}

function vigDrawCrab(ctx, w, p) {
  const c = vigCrabPos(w, p);
  const step = Math.sin(p * 60) * 2;
  ctx.fillStyle = "#d1553f";
  ctx.fillRect(c.x - 6, c.y - 4, 12, 6);
  ctx.fillStyle = "#b8452f";
  ctx.fillRect(c.x - 8, c.y - 6, 4, 3);
  ctx.fillRect(c.x + 4, c.y - 6, 4, 3);
  ctx.fillStyle = "#1a1a22";
  ctx.fillRect(c.x - 3, c.y - 5, 1.5, 1.5); ctx.fillRect(c.x + 2, c.y - 5, 1.5, 1.5);
  ctx.strokeStyle = "#b8452f"; ctx.lineWidth = 1;
  for (const dx of [-5, -2, 2, 5]) {
    ctx.beginPath(); ctx.moveTo(c.x + dx, c.y + 2); ctx.lineTo(c.x + dx + step, c.y + 5); ctx.stroke();
  }
}

function vigDrawBottle(ctx, w) {
  const x = w * 0.42, y = SCENE_GROUND_Y + 2;
  ctx.fillStyle = "rgba(150,200,180,0.85)";
  ctx.fillRect(x - 3, y - 10, 6, 12);
  ctx.fillStyle = "#8a6238"; ctx.fillRect(x - 1.5, y - 13, 3, 3);
  ctx.fillStyle = "#f3e9d0"; ctx.fillRect(x - 1.5, y - 8, 3, 6);
}

function vigDrawDolphin(ctx, w, now, p) {
  const jump = Math.sin(p * Math.PI * 3);
  if (jump <= 0) return;
  const x = w * 0.82 - p * w * 0.08;
  const y = SCENE_GROUND_Y - 6 - jump * 34;
  ctx.fillStyle = "#5a7a9a";
  ctx.save(); ctx.translate(x, y); ctx.rotate(0.5 - p * 1.5);
  ctx.fillRect(-8, -3, 16, 6); ctx.fillRect(6, -6, 4, 4); ctx.fillRect(-9, -6, 4, 3);
  ctx.restore();
}

function vigDrawBat(ctx, w, now, p) {
  const x = w * 0.15 + p * w * 0.7;
  const y = SCENE_GROUND_Y - 150 + Math.sin(p * 12) * 14;
  const flap = Math.sin(now / 80) * 4;
  ctx.fillStyle = "#2a2438";
  ctx.fillRect(x - 3, y - 2, 6, 4);
  ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x - 11, y - flap); ctx.lineTo(x - 4, y + 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 3, y); ctx.lineTo(x + 11, y - flap); ctx.lineTo(x + 4, y + 2); ctx.fill();
}

function vigDrawGlowFish(ctx, w, now, p) {
  const px = scenePropSpots("cave", w).pool;
  const jump = Math.sin(p * Math.PI * 3);
  if (jump <= 0) return;
  const x = px, y = SCENE_GROUND_Y - jump * 40;
  drawGlow(ctx, x, y, 14, "120,240,220", 0.6);
  ctx.fillStyle = "#7ef0e0";
  ctx.save(); ctx.translate(x, y); ctx.rotate(0.6 - p * 1.8);
  ctx.fillRect(-5, -2, 10, 4); ctx.fillRect(-7, -3, 3, 6);
  ctx.restore();
}

function vigDrawBigGem(ctx, w, now, p) {
  const x = scenePropSpots("cave", w).vein;
  const rise = Math.sin(Math.min(1, p / 0.85) * Math.PI);
  const baseY = SCENE_GROUND_Y + 10 - rise * 26;
  const ht = 40;
  drawGlow(ctx, x, baseY - ht * 0.5, 42, "180,140,255", 0.35 + 0.25 * Math.sin(now / 200));
  ctx.fillStyle = "#c89bff";
  ctx.beginPath();
  ctx.moveTo(x - 12, baseY); ctx.lineTo(x, baseY - ht); ctx.lineTo(x + 12, baseY);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(x - 2, baseY - ht + 8, 3, ht * 0.5);
}

function vigDrawSaucer(ctx, w, p) {
  const px = scenePropSpots("ship", w).porthole;
  const x = px - 34 + p * 68;
  const y = SCENE_GROUND_Y - 134 + Math.sin(p * 8) * 4;
  drawGlow(ctx, x, y, 18, "150,240,255", 0.4); // beam-glow so it pops against the porthole
  ctx.fillStyle = "#c2cee6";
  ctx.beginPath(); ctx.ellipse(x, y, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#dff5ff";
  ctx.beginPath(); ctx.arc(x, y - 3, 5, Math.PI, 0); ctx.fill();
  ctx.fillStyle = "#4ade80";
  ctx.fillRect(x - 7, y + 2, 2, 2); ctx.fillRect(x - 1, y + 3, 2, 2); ctx.fillRect(x + 5, y + 2, 2, 2);
}

function vigDrawZeroG(ctx, w, now, p) {
  ctx.fillStyle = "#8a92a8";
  for (let i = 0; i < 3; i++) {
    const t = now / 1000 + i * 2;
    const x = w * (0.32 + i * 0.18) + Math.sin(t) * 8;
    const y = SCENE_GROUND_Y - 20 - Math.abs(Math.sin(p * Math.PI)) * (30 + i * 8) + Math.cos(t) * 5;
    ctx.fillRect(x, y, 4, 4);
  }
}

function vigDrawRedAlert(ctx, w, h, now) {
  if (Math.floor(now / 180) % 2 !== 0) return;
  ctx.fillStyle = "rgba(224,60,60,0.14)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,80,80,0.5)";
  ctx.fillRect(0, 0, w, 4);
}

function vigDrawMoth(ctx, w, now) {
  const tvx = scenePropSpots("room", w).tv;
  const x = tvx + 16 + Math.sin(now / 200) * 10;
  const y = SCENE_GROUND_Y - 34 + Math.cos(now / 260) * 8;
  const flap = Math.floor(now / 100) % 2 === 0;
  ctx.fillStyle = "#c9bfa0";
  if (flap) { ctx.fillRect(x - 4, y - 1, 3, 3); ctx.fillRect(x + 1, y - 1, 3, 3); }
  else { ctx.fillRect(x - 2, y - 2, 2, 4); ctx.fillRect(x, y - 2, 2, 4); }
}

function vigDrawMouse(ctx, w, p) {
  const m = vigMousePos(w, p);
  const scurry = Math.sin(p * 90) * 1.5;
  ctx.fillStyle = "#8a8490";
  ctx.fillRect(m.x - 4, m.y - 3, 8, 4);
  ctx.fillRect(m.x + 3, m.y - 4, 3, 3);
  ctx.fillStyle = "#c8a0b0";
  ctx.fillRect(m.x - 3, m.y - 5, 2, 2);
  ctx.strokeStyle = "#8a8490"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(m.x - 4, m.y - 1); ctx.lineTo(m.x - 9, m.y - 1 + scurry); ctx.stroke();
}

function vigDrawWishStar(ctx, w, p) {
  const wx = scenePropSpots("room", w).window;
  const t = (p % 0.5) / 0.5;
  const x = wx - 30 + t * 60, y = SCENE_GROUND_Y - 152 + t * 30;
  ctx.strokeStyle = "rgba(255,250,220,0.9)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y - 6); ctx.stroke();
  ctx.fillStyle = "#fffce0"; ctx.fillRect(x - 1, y - 1, 2, 2);
}

function drawVignette(ctx, w, h, now, fx) {
  const v = fx.vig;
  if (!v) return;
  const p = Math.min(1, (now - v.startAt) / v.dur);
  switch (v.k) {
    case "birdSteal": vigDrawBird(ctx, w, now, p); break;
    case "rainbow": vigDrawRainbow(ctx, w, p); break;
    case "swarm": vigDrawSwarm(ctx, w, now); break;
    case "crab": vigDrawCrab(ctx, w, p); break;
    case "bottle": vigDrawBottle(ctx, w); break;
    case "dolphin": vigDrawDolphin(ctx, w, now, p); break;
    case "bat": vigDrawBat(ctx, w, now, p); break;
    case "glowFish": vigDrawGlowFish(ctx, w, now, p); break;
    case "bigGem": vigDrawBigGem(ctx, w, now, p); break;
    case "saucer": vigDrawSaucer(ctx, w, p); break;
    case "zeroG": vigDrawZeroG(ctx, w, now, p); break;
    case "redAlert": vigDrawRedAlert(ctx, w, h, now); break;
    case "moth": vigDrawMoth(ctx, w, now); break;
    case "mouse": vigDrawMouse(ctx, w, p); break;
    case "wishStar": vigDrawWishStar(ctx, w, p); break;
  }
}

// ---- Shared fx: falling apples, coin bursts, nap Zs -----------------------

function drawSceneFX(ctx, w, h, now, fx) {
  // apples: spawn at the tree, fall with a little gravity, rest on the ground
  for (const a of fx.apples) {
    const t = (now - a.spawnAt) / 1000;
    const y = Math.min(SCENE_GROUND_Y - 5, a.y0 + 220 * t * t);
    spx(ctx, a.x, y, "#d64545", 1.2, 1.2);
    spx(ctx, a.x + 2, y - 3, "#4d8a44", 0.6, 0.6); // leaf
  }
  // coins: payday burst — rise, sparkle, fade over 1.2s
  fx.coins = fx.coins.filter((c) => now - c.spawnAt < 1200);
  for (const c of fx.coins) {
    const t = (now - c.spawnAt) / 1200;
    ctx.globalAlpha = 1 - t;
    const y = c.y0 - t * 34;
    ctx.fillStyle = "#ffd76b";
    ctx.fillRect(c.x, y, 6, 6);
    ctx.fillStyle = "#b8860b";
    ctx.fillRect(c.x + 2, y + 1, 2, 4);
    ctx.globalAlpha = 1;
  }
  // gem shards flung out while mining the crystal vein
  fx.shards = (fx.shards || []).filter((s) => now - s.spawnAt < 550);
  for (const s of fx.shards) {
    const t = (now - s.spawnAt) / 550;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = s.col;
    ctx.fillRect(s.x + s.vx * t * 40, s.y + s.vy * t * 40 + 70 * t * t, 3, 3);
    ctx.globalAlpha = 1;
  }
  // Nap Zs drift up from wherever the pet is sleeping. They go pale during
  // the night wash - the daytime brown is invisible against a dark sky.
  if (fx.napping) {
    const night = fx.sleepWash || 0;
    ctx.fillStyle = night > 0.15
      ? `rgba(226,232,255,${0.55 + 0.35 * night})`
      : "rgba(90,74,58,0.75)";
    ctx.font = "bold 13px monospace";
    for (let i = 0; i < 3; i++) {
      const t = ((now / 1400) + i * 0.33) % 1;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.fillText("z", fx.petX + 16 + i * 4 + Math.sin(t * 5) * 3, fx.petY - 20 - t * 26);
    }
    ctx.globalAlpha = 1;
  }
}

// ---- Weather events -------------------------------------------------------
// Deliberately cheap: a colour wash over the whole world plus one particle
// layer. No new sprites, reads instantly in any of the five scenes.
function drawWeatherFX(ctx, w, h, now, kind) {
  if (!kind) return;
  if (kind === "cold") {
    ctx.fillStyle = "rgba(150,200,255,0.16)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 34; i++) {
      const seedX = ((i * 71 + 13) % 100) / 100;
      const drift = Math.sin(now / 900 + i) * 12;
      const x = seedX * w + drift;
      const y = ((now / 26 + i * 47) % (h + 20)) - 10;
      ctx.fillRect(x, y, 2, 2);
    }
    // frost creeping in from the edges
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(200,235,255,0.30)");
    g.addColorStop(0.35, "rgba(200,235,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = "rgba(255,150,60,0.15)";
    ctx.fillRect(0, 0, w, h);
    // heat shimmer rising off the ground
    ctx.strokeStyle = "rgba(255,220,160,0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const bx = ((i * 83 + 20) % 100) / 100 * w;
      const t = (now / 700 + i * 0.6);
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const yy = SCENE_GROUND_Y - k * 11 - ((now / 22 + i * 30) % 22);
        ctx.lineTo(bx + Math.sin(t + k * 0.9) * 5, yy);
      }
      ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, h, 0, h * 0.4);
    g.addColorStop(0, "rgba(255,170,80,0.28)");
    g.addColorStop(1, "rgba(255,170,80,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

// ---- Sleep wash -----------------------------------------------------------
// Deliberately ONE overlay instead of a sleep variant of five worlds: a deep
// blue wash plus a soft vignette reads as "night, hush" in the meadow, the
// cave and the spaceship alike. The pet's own curled-up pose and drifting Zs
// come free from the existing nap fx.
function drawSleepWash(ctx, w, h, amount) {
  if (amount <= 0) return;
  ctx.fillStyle = `rgba(18,22,54,${0.55 * amount})`;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h * 0.62, h * 0.12, w / 2, h * 0.62, h * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(6,8,26,${0.5 * amount})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Public: paint one full frame of the current scene.
function drawScene(ctx, w, h, id, dayPhase, now, fx) {
  if (id === "ship") drawShip(ctx, w, h, now, fx);
  else if (id === "beach") drawBeach(ctx, w, h, dayPhase, now, fx);
  else if (id === "cave") drawCave(ctx, w, h, now, fx);
  else if (id === "room") drawRoom(ctx, w, h, now, fx);
  else drawMeadow(ctx, w, h, dayPhase, now, fx);
  // Night falls on the WORLD, then the fx layer (nap Zs, coins) draws on top
  // of it - otherwise the wash mutes the very cues that say "I'm asleep".
  drawSleepWash(ctx, w, h, fx.sleepWash || 0);
  drawSceneFX(ctx, w, h, now, fx);
  drawVignette(ctx, w, h, now, fx);
  drawWeatherFX(ctx, w, h, now, fx.weather);
}
