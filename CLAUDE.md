# pet-game/ — Pixel Pet

## Vision

**"A cozy pocket creature you raise, dress, and eventually send on adventures — Tamagotchi's heart,
an RPG's depth, worn lightly."**

The surface should stay mindless and warm: feed it, poke it, watch it wander — glanceable in
seconds, fun for a kid. The depth (stat blocks, gear, a bank, a Hall of Fame) is one tap away and
never required. That contrast — deadly simple on top, D&D underneath — is the whole identity.
Don't let RPG complexity leak into the core loop; keep it opt-in.

## Tech approach (deliberate, don't change without discussion)

- **Vanilla JS, no build step, no framework, no npm dependencies.** Plain `<script>` tags, loaded
  in order: `creature.js` → `items.js` → `main.js`. Each later file can reference functions/consts
  from earlier ones (function-declaration hoisting; these are plain scripts, not modules).
- Kept intentionally light on code — this project favors flat, simple implementations over
  abstraction, per repeated explicit preference from the user. Don't add frameworks, bundlers, or
  dependencies without asking.
- Minimal comments: only where the *why* is genuinely non-obvious.

## Design language (established; keep new UI consistent with this)

The app **is** "the world in a phone" — one slab, the pixel world full-bleed, warm candy controls
floating over it on frosted glass. GigaPet heart, iPhone body. NOT a dashboard: no persistent stat
bars, no labeled form sections, no data-dense buttons.

- **Palette/typography**: candy gradient page, warm brown ink, rounded font stack (`ui-rounded` /
  SF Pro Rounded). All color tokens are CSS variables in `:root`.
- **The slab** (`#app`): a phone-shaped face (~420px, 78dvh) with the scene canvas edge-to-edge
  behind everything; faint scanlines kept via `#screen::after` for the retro soul.
  **At ≤540px wide the card framing drops entirely** (media query at the end of style.css):
  `#app` goes `100%` × `100dvh`, radius 0, no shadow, and the top bar / dock / name overlay pick
  up `env(safe-area-inset-*)` so they clear the Dynamic Island and home indicator. The reason:
  a framed card on a candy gradient reads as a toy on a table on desktop, but on a real phone it
  reads as a phone inside a phone, with dead gradient bands top and bottom. Units are `dvh`, not
  `vh` — iOS `vh` counts the area behind Safari's toolbars. The ground line
  `SCENE_GROUND_Y` is dynamic (`sizeSceneCanvas`) and **measured from the dock's actual top
  minus 33px**, not a hardcoded `height − 118`: full-bleed on a notched phone the safe-area inset
  lifts the dock ~34px, and the old constant put the ground *below* the dock's top edge, leaving
  the pet standing inside it. The fallback constant is still there for the pre-layout call. The
  pet's feet ride it in BOTH modes — closeup is just bigger (`CLOSEUP_PET_SCALE` 2.2 vs
  `SCENE_PET_SCALE` 0.55). **Composition is tuned by exactly two numbers**, both near the top of
  the scene section of main.js: `CLOSEUP_PET_SCALE` (how big the pet draws up close) and
  `GROUND_DOCK_GAP` (how far the ground line sits above the dock). Raising the gap lifts the pet
  out of the buttons *and* shrinks the sky, since the feet ride the ground — but it thickens the
  terrain band by the same amount, so the two trade off. Measured at 428×926, baby stage:
  closeup 1.45/gap 33 put the pet at 16% of screen height with its head 68% down; 2.2/gap 90 puts
  it at 24% with its head 58% down and 88px of clearance above the dock. `measureSpritePad()` scans the canvas pixels so feet (not the canvas
  edge) sit on the ground. GOTCHA: never animate `transform` on `#pet-canvas` via CSS (it clobbers
  the inline position transform — sickPulse uses `filter` for exactly this reason).
- **Top: identity left, one status orb right.** The `#top-bar` rail is gone — 24% of its 404px was
  empty, so it framed a gap rather than grouping anything, and once the dock rail went it was the
  only rectangular slab left on a screen whose point is a creature. Now **four corners:
  left = who, right = what; top = status, bottom = action.**
  - `#pet-tag` (top-left): name + stage chip in one shrink-wrapped frosted pill. It's **identity**,
    which is why it earns a permanent slot when the stage only changes four times a life. Tapping
    it opens Gear — the only existing room that's about *this pet* (stat block, portrait). A `div`,
    not a `button`, because `#stage-badge` nests its own listener inside it.
    **GOTCHA: the dev gesture is 5 taps on `#stage-badge`, which now lives inside that tappable
    chip** — its listener calls `e.stopPropagation()` first, or five taps opens Gear five times.
  - `#status-orb` (top-right): **ONE** orb, 44px, answering one question — *does the pet need
    anything?* `overallStatus()` keys off `warnStats()`, the same resolver the pills and distress
    clock use. **Hunger is checked first on purpose**: temp and clean each raise a pill, hunger
    raises none, so this orb *is* hunger's warning. (That order deliberately differs from
    `pickContextPill()`'s worst-first — the pill answers "what's the emergency", the orb answers
    "what does it need", so when hunger and a cold snap are both true the pill covers the cold and
    the orb shows the thing nothing else is showing.) It dims to 0.5 when nothing is wrong, the
    same move as `#app.asleep #dock`, so a healthy pet's screen is just the pet.
  - Three orbs became one because the presentation was lying: the conic ring was ~4px wide at 34px
    and `orbState("temp")` returned `fill: 100` unconditionally, so one of three rings carried no
    level at all. What actually communicated was colour and pulse — two states, three times over —
    for three needs on 4h/13h/rare tempos that are almost never simultaneously interesting.
    Tapping the orb now opens the stat popover showing **all three** needs at once, so a tap gives
    strictly more than the old one-orb-one-need did.
  - **The coin badge was cut.** It read `0` for every pet's entire pre-adult life (credits accrue
    only for adults), `awardPayout()` already floats a "+N 🪙" in the world, and the balance shows
    on the amber LCD in Shop and Bank — you see your money where you spend it. Its `setRoom("bank")`
    also just duplicated the Bank tab.
  - Three surfaces, three questions, no overlap: **pills are for "now", the sheet is for "on
    purpose", the orb is for "does it need anything".**
- **Care dock** (`#dock`): **two 71px circles in the bottom corners — butter `Feed` bottom-left,
  dark `••• More` bottom-right.** The frosted rail is gone: a rail is a container for a *row* of
  keys, and with two corner buttons there is no row to contain. `#dock` itself survives as a
  **transparent, `pointer-events: none` positioning wrapper** — see the gotcha section, it is
  load-bearing for the ground line. `pointer-events: auto` goes back on the buttons so the
  invisible span between them passes taps through to the world. Symmetry does the grouping the
  rail used to do, so both circles keep the same diameter, underside depth and 12px edge inset.
  A circle has no room for a label, so `#feed-btn::after` paints a faint `•••` pip to carry the
  "there's more in here" hint — borrowing the More key's own language. Feed is
  tap-to-Meal (+30) and **hold 450ms** for the `#feed-menu` flyout (Snack/Meal/Feast); More slides
  up the sheet. The core loop is never hidden behind navigation — that's the law, and Feed being
  one tap is that law honoured properly rather than diluted five ways.
  **Warm/Cool/Clean used to be permanent keys and are not any more.** Measured against the
  simulation they were a lie about importance: hunger warns first ~90% of the time, cleanliness is
  a ~13h chore, and temperature was measured at **0.0% occurrence** before weather events existed.
  Three of five keys sat idle almost always, diluting the one key that is the actual loop. They
  are **contextual pills** now (below) plus a permanent home in the sheet's **Care tab**
  (`#room-care`: `#warm-btn`/`#cool-btn`/`#clean-btn` as `.pop-action`s). **Those ids are
  deliberately unchanged** so the original listeners still work untouched.
  Keeping `#clean-btn` reachable is not optional: `CLEAN_PASSIVE_RATE` grime (100/20h) is **not**
  recoverable by tapping poops (+12 each), so with no full `clean()` anywhere, cleanliness can
  only ever fall and the pet drifts into permanent distress.
  The governing rule, which is what stops this sprawling again:
  **pills are for "now", the sheet is for "on purpose".** That's why the actions *moved* into Care
  rather than also being duplicated in the orb popovers — the popovers keep their readouts (bars,
  thermostat dial, weather toggle) and go back to being pure status. Temperature lives in exactly
  two places (the pill and Care), never three. The tab row is `flex: 1` so six tabs auto-fit at
  ~62px on a 404px sheet; **six is the ceiling, don't add a seventh.**
- **The sheet** (`#companion`, reused id so main.js room logic is untouched): an iOS-style bottom
  sheet (translateY slide, rounded top, frosted cream) holding the amber LCD readout
  (`#companion-screen`), a Gear/Shop/Vet/Bank/Hall tab row, and the scrollable room panels.
  `activeRoom === "home"` = sheet closed. The ••• key reopens to `lastSheetRoom`.
- **Contextual pills**: the world asks for what it needs instead of permanent keys waiting to be
  needed. `pickContextPill()` returns **exactly one** — worst first: `vet` (sick) → `temp`
  (`tempDiscomfortAmount() > 0`) → `clean` (`cleanliness <= WARN_CLEAN`), and **nothing while
  asleep** unless sick. One at a time is not cosmetic: all three are absolutely positioned on the
  same 66px line and would stack on each other. `#temp-pill` takes `.cold`/`.heat` and **performs
  the correct action itself** — under pressure you shouldn't have to work out whether you need
  Warm or Cool, which is exactly what two permanent keys asked of you. Keying the pills off the
  same thresholds as the orb pulses means the pill, the orb and the distress clock are one signal.
  The More key still carries the red vet badge dot.
  **GOTCHA:** a pill sits exactly where the speech chip goes, so `renderVisibility()` sets
  `#app.has-pill` and the chip drops to 124px — the same collision the sleep pill already solved.
  The vet pill silently had this bug for its whole life; nobody saw it because a sick pet is rare.
  Any new pill must keep `translateX(-50%)` in its transform too, since `pillPulse` re-applies it
  every frame and a pill without it snaps to the left edge mid-animation.
- **Dev tray** (`#dev-tray`): Test Tools live BELOW the slab, not on the toy. Hidden entirely at
  phone widths (there is no "below the slab" when the slab is the whole screen); a
  `#dev-tray:has(#test-tools:not(.hidden))` rule pulls it back when dev mode is on.
- Hunger is *displayed* as "Fullness" (100 − hunger) everywhere player-facing (orb + popover bar).

## Critical architecture facts

- **Simulation runs on `setInterval` (`simTick`, every real second), not `requestAnimationFrame`.**
  Browsers fully suspend rAF on a backgrounded tab, but this game is meant to be left in the
  background for hours — that's the point of a pet you check on periodically. Cosmetic-only
  animation (bob/blink/wander) uses its own rAF loop separately, since it's fine for that to pause
  when nobody's looking.
- **`state.simClock`** is the pet's own internal clock (seconds). It only ever advances by `dt`
  inside `tick()`/`catchUpAfterGap()` — never compares directly against `Date.now()`. This is what
  lets the dev time-speed slider actually speed up stage growth and sickness timers, not just the
  smooth stat decay.
- **`timeScale`** (Test Tools panel: 1×/10×/100×/1000×) is a live multiplier on simulated time, for
  testing without waiting real hours/days.
- **Offline catch-up**: gaps longer than ~120s (tab closed, laptop slept) are fast-forwarded as one
  lump sum (`catchUpAfterGap`) rather than simulated second-by-second.
- **Bank, inventory, and Hall-of-Fame history are global** (module-level `let`, not part of
  per-pet `state`), so a pet running away never costs you your Credits or gear. `newEgg()` only
  resets the per-pet `state`.

## File ownership

- **`main.js`** — the current pet's `state`, the simulation loop, room/UI rendering, currency/bank,
  shop, equipment equip/unequip logic, temperature/comfort system, push alerts, Test Tools.
- **`creature.js`** — procedural DNA generation (species, body shape, appendages, palette, marking,
  eye style, quirk, movement personality, payout personality, base stats, temperature comfort
  window) and canvas rendering of the creature (`drawCreature`). Mirror-half-a-grid is the core
  generation trick (classic pixel-sprite-generator technique).
- **`items.js`** — procedural equipment generation (rarity tiers, materials, slots, stat affixes)
  and drawing equipped items onto the creature canvas (`drawItemAt`/`drawEquipment`).
- **`speech.js`** — the pet-language engine: DNA-seeded word→glyph cipher, per-species glyph sets,
  intent-keyed phrase bank, and `petVoice(intent, genome)` → `{glyph, english, emo, words}`. Pure;
  the chip UI + idle-chatter timer + tap-to-translate live in `main.js`.
- **`scenes.js`** — pure pixel-art painting of the little worlds the pet lives in (meadow +
  spaceship): backdrops, animated props (tree/basket/pond/butterfly, console/lever/porthole),
  and shared fx (falling apples, coin bursts, nap Zs). Prop anchor positions via
  `scenePropSpots(id, w)`. The *director* (idle detection, vignette state machine, pet
  scale/position) lives in `main.js` (search `sceneView`). Since the slab made the canvas TALL,
  each scene layers **background fillers** to occupy the big sky/wall: shared helpers
  `drawCloudLayer` / `drawBirdFlock` / `drawDistantHills` (meadow), an island + `drawSailboat` +
  dune grass (beach), background crystal clusters + stalagmites + longer stalactites + deep haze
  (cave), a riveted panel grid + conduits + radar viewscreen + status lights (ship), and a
  `drawBookshelf` + `drawWallClock` + hanging `drawLamp` + `drawFairyLights` + wainscot (room).
  Anything sky/wall-high keys off `h` or `SCENE_GROUND_Y`, never a fixed y, so it scales with the
  device height.

Script load order is now: `creature.js` → `speech.js` → `items.js` → `scenes.js` → `main.js`.

## What's built

- **Life stages**: egg → baby → child → teen → adult, real-world durations (days, not minutes).
  A hidden care-mistakes counter (never shown to the player) decides the adult outcome
  (Radiant vs. Scrappy form).
- **Needs**: hunger, cleanliness, temperature — each on a **deliberately different tempo** (sim
  testing showed all three used to go critical at ~5h, making every check-in the same
  undifferentiated "tap everything" ritual):
  - **Hunger = the heartbeat.** Warns at `WARN_HUNGER` 80 (~4h from fed). This is the need that
    actually brings you back, and it warns first ~90% of the time.
  - **Cleanliness = the daily chore.** `CLEAN_PASSIVE_RATE` halved to 100/20h, poop slowed
    (3–5h) and softened (−12), so it warns at `WARN_CLEAN` 35 around ~13h.
  - **Temperature = a rare emergency, not a background chore.** Body temp is now **homeostatic**
    (`TEMP_HOMEOSTASIS`, ~40min back to the middle of its own comfort window). Measured before
    this change: pets spent **0.0%** of their lives outside comfort — Warm/Cool solved a problem
    that could not occur. Now a **weather event** (`WEATHER_EVENT_CHANCE_PER_HOUR`, ~2–3/day,
    25–55min, cooldown 2h) shoves temp hard toward an extreme and Warm/Cool genuinely rescue it.
- **The distress ladder** (`checkSickness`): deterministic, NOT dice-rolled. The old random
  ~0.5×/hr sick roll meant identical neglect produced runaway anywhere from 10h→17.7h, so the
  rule was unlearnable. Now a single clock `state.distressSince` starts the moment ANY need
  enters its warn tier and resets when all are handled:
  `0h nag → 2h urgent alert → 4h sick (DISTRESS_SICK_SECONDS) → 8h runaway (DISTRESS_RUNAWAY_SECONDS)`.
  Vitality still matters — `sickChanceFactor()` divides elapsed distress, so a hardy pet holds out
  longer. Measured result: **warns ~4.4h, sick ~8.1h, runaway ~11.6h (range 9.3–12.9)**; check-ins
  every 4/6/8h all survive, 12h survives 1-in-5 ("may run away"), 24h never.
  `giveMedicine()` also resets the ladder so curing never leaves a pet one tick from leaving.
- **Sleep** (`isAsleep()`, `updateSleep()`): the pet sleeps through its OWN world-night — the same
  `dayPhase` sine that already drives the sky and ambient temp — between `SLEEP_START_PHASE` 0.60
  and `SLEEP_END_PHASE` 0.90, i.e. **~7.3h of every 24h**, so the world visibly darkens at exactly
  the hour it turns in. No separate schedule to explain. While asleep: needs decay at
  `SLEEP_NEED_MULT` (0.2×), weather events don't spawn, idle chatter hushes, and **the distress
  clock pauses** (`distressSince` slides forward). Measured: 10h of neglect spanning the night =
  **0/10 run away**; the identical 10h while awake = **10/10**. An overnight is safe *by design*
  instead of being the most dangerous window of the day.
  `state.energy` refills overnight (`ENERGY_RECHARGE`, a full night = full battery) and drains
  slowly while awake — it reads as purposeful now via the sleep chip, and is the hook adventures
  will spend.
- **Sleep art is deliberately ONE overlay, not five sleep scenes**: `drawSleepWash()` (blue wash +
  vignette) reads as night in every world, and the curled-up pose + drifting Zs are the *existing*
  nap fx reused. Two ordering gotchas, both found in testing and fixed: the wash must draw
  **before** `drawSceneFX` (otherwise it mutes the very Zs that signal sleep), and the Zs switch
  to a pale colour when `fx.sleepWash > 0.15` (the daytime brown is invisible on a night sky).
  The "leave it be" feeling is carried by the UI, not the art: `#sleep-pill` (slow breathing
  animation, no pulse — it must not read as an alert) plus `#app.asleep #dock` dimmed to 0.45.
  The pill sits where the speech chip normally goes, so `#app.asleep #pet-message` drops to 124px
  and the pill is `white-space: nowrap` — they collided twice before this.
- Status orbs pulse exactly at the warn tier, so the visual flag and the distress clock are the
  same signal. Birth temp = the pet's own species comfort centre (a hardcoded 50 used to leave
  **~23% of pets born already uncomfortable**).
- **Push alerts**: Web Audio tones (no audio files) + tab-title flash + browser Notification when
  the tab isn't focused, so the pet can "call out" instead of relying on you remembering to check.
  **The "Enable Alerts" button was removed** (user decision) — it was dead weight on the phone:
  mobile Safari has no `Notification` API at all, so `updateAlertsBtn()` just hid it, and even in
  an installed PWA a notification while the app is *closed* needs real Web Push and a server.
  The `notify()` machinery is still there and harmlessly no-ops (it returns early unless
  permission is `granted`), so restoring this later is a button and a listener, not a rewrite.
- **Procedural creature DNA**: 4 species (Blob, Lizard, Fluff, Squid), each with body-shape
  tendencies, appendages, markings, eye styles, a movement "personality," a payout "personality,"
  base stats, and a temperature comfort window.
- **Coat colors + shinies** (`creature.js`): each species draws from **9** curated
  `{primary, secondary, accent}` triples in its `PALETTE_SETS` group (36 normal coats total — was
  3/species, which made pets read same-y). On top of that, every roll has a **`SHINY_CHANCE` (5%)**
  of instead pulling a `SHINY_PALETTES` coat — Cosmic / Golden / Albino / Obsidian / Opal — which
  ignores species grouping so a shiny is unmistakable at a glance. `genome.shiny` holds the coat
  name (else `null`); `drawCreature` twinkles 4 deterministic sparkles over the sprite when set,
  and `speciesLabel()` renders e.g. "Cosmic Lizard ✨". Legacy saves lack the field — that's fine,
  `undefined` is falsy everywhere it's read.
- **Pet language (`speech.js`)**: each pet speaks in its own generated alien script — a small
  intent-keyed English phrase bank + a deterministic word→glyph cipher seeded by the pet's DNA, so
  the same word always makes the same glyph FOR THAT PET (learnable, per-pet-unique). Species use
  distinct glyph flavors (Blob=circles, Lizard=angular, Fluff=stars, Squid=waves), all from
  Geometric-Shapes/Dingbats blocks so nothing renders as tofu. **Emotion always reads**: every line
  carries a mood emoji, so an untranslated pet is still endearing. Speech chips show on the LCD from
  care actions + idle chatter (chosen by current need state); tapping the chip toggles the English
  translation. NOTE: full "translation as progression" (a bond/skill/item that gradually unlocks
  words) is the intended next layer — the engine already returns per-word `{en, gl}` pairs for it.
- **Stat block** (D&D-flavored): Vitality, Might, Grit, Endurance, Charm. Rolled per-species at
  birth, +1 per life stage, + gear bonuses. Each maps to a real effect — see the stat→effect
  helper functions in `main.js` (search `effectiveStats`).
- **Temperature/comfort window**: per-species (+ Grit-modified) comfort range, not one-size-fits-all.
  Ambient environment is either a simulated day/night cycle or real local weather (opt-in, via
  Open-Meteo — no API key needed). Circular thermostat dial + compact always-visible band strip.
- **Currency (Credits)**: adult pets earn passively on a per-species variable-ratio timer; health,
  gear, and stats affect the payout multiplier. Persistent Bank with a recent-earnings log.
- **Ground coins — the return ritual** (`groundItems`, `spawnReturnCoins`, `collectGroundItem`):
  **only adults earn passively, and a pet takes a measured 108h (~4.5 real days) to get there** —
  so a young pet had *no* income at all. Coins spawn on the ground when you come back after
  `GROUND_COIN_MIN_GAP` (30min), 1 per hour away, **capped at `GROUND_COIN_MAX` 5**, worth 5–8
  each. They pay for *showing up* — the one behaviour the whole game is built around — and fade to
  irrelevance beside adult income, which gives the pet's life two economic acts: **forage as a
  kid, earn as an adult.** Measured payout curve: 29min → 0, 31min → 1, 4h → 4, 6h → 5, and a
  3-day absence → still 5.
  The **chore half already existed**: `catchUpAfterGap` spawns missed poops, hard-capped at
  `MAX_POOP` 4 by `Math.min(missedPoops, MAX_POOP - poops.length)` — **don't "fix" that cap**, it's
  what stops a long absence becoming a chore. Coins render on the same `#poop-layer` ground band so
  chore and reward read as one tidy-up, and `checkGroundClear()` fires a `tidy` speech beat + ✨
  when the *last* item of either kind goes. It's only ever called from a site that just removed
  something, so an already-tidy world never triggers it.
  **`#poop-layer` MUST stay `z-index: 2`** — above `#pet-canvas` (z-index 1). Hit testing follows
  paint order, and the pet covers ~65% of the screen width at `CLOSEUP_PET_SCALE` 2.2, so beneath
  it **5 of 6 ground items were literally untappable**. Drawing them in front reads correctly:
  they sit in the ground band at the pet's feet, i.e. nearer the viewer. The layer itself is
  `pointer-events: none` so only the items catch taps, and each item has a `::after { inset: -11px }`
  giving it a ~44px target without touching `transform` (which `.ground-coin` animates).
  Placement goes through **`freeGroundSpot()`**, which samples 20 candidates and keeps the one
  furthest from everything already on the ground, measured in real pixels in both axes. Without it
  coins and poops landed on each other ~28% of the time and the one underneath couldn't be tapped.
  Measured after: **0 blocked out of 96** across 12 simulated returns.
  **GOTCHAS:** (1) `GROUND_COIN_MIN_GAP` is the only thing stopping a player farming coins by
  reloading — `catchUpAfterGap` runs on every page load. (2) It's called with **real** elapsed
  seconds, never scaled by `timeScale`, so **the dev time slider will never produce return coins**;
  set `state.lastTick` directly to test them. (3) The save blob now carries `groundItems`, so
  clobbering it during a headless sim loses coins as well as bank/inventory.
- **Equipment**: procedural items (5 color-coded rarity tiers), up to 7 slots per pet — 6 universal
  (head, face, body, back, ringLeft, ringRight) + 1 anatomy-gated slot (feet/antenna/ears/tentacles,
  depending on the pet's appendage). Paper-doll Gear screen with live stat updates, a 20-slot grid
  Backpack, drag-and-drop (Pointer Events — works for mouse *and* touch, unlike native HTML5 DnD)
  with a tap-to-equip fallback.
- **Shop**: rotating 3-item stock, auto-restocks on a timer, manual refresh for a fee, buying marks
  a slot "Sold" until the next restock.
- **Rooms**: Home (Kitchen + Thermostat + Chores), Gear, Shop, Vet (medicine), Bank, Hall of Fame.
- **Scenes (`scenes.js` + `sceneView` director in `main.js`)**: Johnny Castaway-style pixel
  worlds, always painted as the LCD backdrop (a `#scene-canvas` behind the pet). Interact and the
  pet is big front-and-center; leave it alone ~15s and it shrinks (~0.55×) onto the ground line
  and goes about its day — vignettes chosen by need state (hungry → shake the apple tree, then
  eat a fallen apple; rested → nap with drifting Zs; adults "work" = pick apples / run the ship
  console / mining crystals, and a real `awardPayout()` fires a cosmetic coin burst wherever it
  stands). Five worlds in `SCENE_ROTATION` (main.js), cycling one per visit:
  **meadow** (day/night sky driven by `simClock`/`AMBIENT_DAY_PERIOD` — same sine as ambient temp —
  sun/moon/stars, butterfly to chase, pond with jumping fish),
  **beach** (picks a fresh *mood* per visit via `setupBeach()` — `day`/`sunset`/`night`/rare
  `space` in `BEACH_SKY`, so a Hawaii sunset is a special roll, not clock-tied; palm, sandcastle
  the pet builds taller, seagulls, collectible shells — glowing on the space beach, picked up by
  the `shellHunt` act via `nearestShell()` — and a tide whose surf edge slides in/out via
  `beachTideEdge()` so the pet dances just ahead of the foam),
  **cave** (bioluminescent Pandora-glow underground: pulsing crystal vein the pet *mines* as its
  job — chip beats fling gem `shards`, `crystalHitAt` flares the glow — plus glowing mushrooms it
  pokes, a glowing pool, drifting spore motes, ceiling drips; `drawGlow()` is the shared bloom
  helper),
  **spaceship** (blinking console, pullable lever that changes cabin lights, porthole starfield),
  and **room** (cozy indoor evening: flickering CRT TV with floor glow, a bed it jumps on / curls
  up in, a night window with a moon). All 100% cosmetic on the rAF loop; sick pets stay in closeup.
  Any pointerdown anywhere zooms the pet back in. Free for all pets, always (user decision). To add
  a world: draw it in scenes.js (add `scenePropSpots` + `drawScene` cases), then add its id to
  `SCENE_ROTATION` and give it acts in `pickSceneAct`/`SCENE_ACT_DUR` (+ beats in `runSceneAct`).
  A dev-only Test Tools row (`.scene-jump-btn` → `jumpToScene(id)`) forces any world on demand;
  the Beach button rerolls its mood so you can summon a sunset/space beach without waiting.
- **Scene vignettes ("look what happened!" moments)**: on top of routine acts, `VIGNETTE_CHANCE`
  (~0.42, deliberately "kinda common") of act picks fire a special visitor instead. `VIGNETTES`
  (main.js) lists 3 per world, each with a behavior `b`: **chase** (pet follows a moving critter —
  meadow bird stealing an apple, butterfly swarm, beach crab that *pinches* and makes the pet
  recoil, room mouse), **watch** (walk over and gaze — beach dolphin/message-bottle, cave
  bat/glow-fish, ship UFO past the porthole with a wave, room moth, meadow rainbow, room
  shooting-star wish), **mine** (cave big-gem treasure, extra shards), **float** (ship zero-G —
  `sceneFX.petFloat` lifts the pet), **panic** (ship red-alert strobe, pet scrambles). scenes.js
  paints each visitor via `drawVignette` + `vig*` helpers; actor *paths* (`vigBirdPos`,
  `vigCrabPos`, `vigMousePos`, `vigSwarmX`) are shared so the director can chase them. State lives
  in `sceneFX.vig`; `runVignette` drives the pet and clears it. All cosmetic. To add one: draw it +
  a `vigDrawX`/`drawVignette` case in scenes.js, then a `VIGNETTES[scene]` entry with a behavior.
- **Test Tools panel** (dev-only): time-speed slider, skip-stage, give-random-item, +100 credits,
  the scene-jump row, next-vignette, and a **systems row that jumps straight to a state**:
  grow-to-adult, make-sick, starving, filthy, weather-event, and "fake 12h away". The last two
  exist because they're otherwise untestable — a weather event is a ~2-3/day random roll that also
  refuses to fire while the pet sleeps, and return coins key off REAL elapsed seconds so the time
  slider can never produce them. **Gated behind dev mode**, not visible to normal players — open with
  `?dev=1` in the URL, or tap the stage badge 5× within 2.5s (`setupDevMode()`/`setDevMode()` in
  main.js). The dev tray now holds *only* Test Tools, so nothing player-facing sits below the slab.
- **Naming the pet**: `randomName()` still picks a cute suggestion at birth (so an unnamed pet
  never feels anonymous pre-hatch), but the moment it hatches (`advanceStage` → `next === "baby"`)
  sets `state.needsNaming = true` and a warm full-screen overlay (`#name-overlay`) lets the player
  keep the suggestion, reroll (🎲 → another `randomName()`), or type their own (16-char cap). Only
  primes the input once per naming moment (`nameOverlayShown` flag) so it doesn't clobber typing.

## Gotcha: three things that must not be "tidied up" later

All look like harmless style — or in one case like a leftover empty div — when
you meet them in the file:

- **`#dock` is a transparent empty-looking wrapper and it is load-bearing.** It
  paints nothing, has `pointer-events: none`, and contains only two circles. It
  looks deletable. It is not: `sizeSceneCanvas()` derives `SCENE_GROUND_Y` from
  `#dock`'s live bounding-rect top, so **this box is the ground the pet stands
  on**. The invariant is `ground = screenH − insetB − 175`, where
  `175 = 14 (bottom offset) + 71 (height) + 90 (GROUND_DOCK_GAP)` — verified at
  751 on a 926px screen. Keep it 71px tall at `bottom: 14px + inset`. If the
  circle diameter `H` ever changes, `GROUND_DOCK_GAP` becomes `161 − H` **and**
  the pre-layout fallback's `85` becomes `14 + H`, in the same commit, or
  desktop's first paint disagrees with its second.

- **`#app` is `overflow: clip`, NOT `overflow: hidden`.** The closed sheet's
  `translateY(105%)` parks it ~131px below the slab, which gives `#app` 132px of
  scrollable overflow. An `overflow:hidden` box is still scrollable
  *programmatically*, so focusing anything inside (the name field, a room tab) let
  the browser scroll `#app` by 131px and take the whole top bar - name, status
  orbs, credits - permanently off the slab, with no wheel on a phone to put it
  back. `clip` never creates a scrollport. `hidden` stays as the line above it for
  pre-Safari-16 fallback; don't collapse the two.
- **`load()` is wrapped in try/catch at its call site.** It used to be bare, and
  `JSON.parse` on a corrupt save threw and took every line of init below it with
  it - no sim loop, no scene, no autosave, just the hardcoded `🥚` from index.html
  and dead buttons, unrecoverable from inside the app. iOS evicting or truncating
  localStorage, or a kill mid-write, is enough. Verified against four shapes:
  `"undefined"`, a truncated blob, valid JSON with no `state` key, and an HTML
  error page.

## Known gotcha: browser caching during dev

The dev server serves fresh files correctly, but the browser can aggressively cache `main.js` /
`style.css` across reloads in a way normal reload/hard-reload doesn't defeat. Fix in place:
`?v=N` query strings on the `<script>`/`<link>` tags in `index.html`.
**Bump that version number whenever you edit `main.js`, `creature.js`, `items.js`, `speech.js`,
`scenes.js`, or `style.css`**, or your changes won't show up when testing in the preview browser.

## Gotcha: running headless balance sims

Driving `tick()` in a loop from the console is the right way to test balance (weeks in seconds),
but **the live `setInterval(simTick, 1000)` keeps running and autosaving whatever you leave in
`state`** — which will clobber the player's real save. Silencing `window.save` only covers the
synchronous probe; the interval fires between calls. Before a long sim, either snapshot
`localStorage.pixelPetSave` into a variable **and restore it in the same JS call**, or accept the
save is disposable and `newEgg()` afterwards. (Bank/inventory/history are global and survive.)
"In the same JS call" is literal: a `location.reload()` between the snapshot and the restore wipes
the variable holding it, and you write `undefined` over the save. Note that the save blob carries
bank/inventory/history too, so clobbering the *file* does lose them even though the module-level
`let`s would have survived a `newEgg()`.

## Roadmap / discussed but not yet built

- **Quests/adventures**: pets go away and bring back rewards based on Might (and other stats).
  Vision agreed on, not implemented. The spaceship scene is the intended narrative hook — the pet
  already "practices" at the console; adventures should launch from that ship.
- **More scene vignettes/worlds**: the scene system (scenes.js) is built to grow — more props,
  more acts, rarer "special" moments (Johnny Castaway's long-tail surprises). Scenes stay free
  for everyone (user decision); depth over breadth.
- **Cosmetic DNA unlocks** purchasable in the shop, applied to the *next* egg rather than the
  current pet. Agreed direction; shop currently only sells equipment, not DNA/cosmetic unlocks.
- **Costs for core actions** (feed/clean/warm/medicine): deliberately *not* added yet. Agreed to
  wire these in together with the cosmetic shop so the economy loop lands as a whole, rather than
  adding friction before there's anything worth saving for.
- **Real weather toggle**: built and verified to fail gracefully (falls back to simulated
  day/night), but the live geolocation+fetch happy path couldn't be verified in the automated
  preview environment — needs a real browser with a real user granting location permission.
- More RPG slots could still be added (rings and a back/cape slot are done).
