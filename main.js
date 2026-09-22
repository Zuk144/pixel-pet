// ---------------------------------------------------------------------------
// Pixel Pet - Generation 1 beta.
// One state object, one update loop, one render pass. New in this
// generation: life stages, a hidden care-mistakes counter that shapes how
// your pet turns out, real stakes (sickness -> running away), and
// "push" alerts (sound + tab flashing + notifications) so the pet can
// call out to you instead of you having to remember to check in.
// ---------------------------------------------------------------------------

const SAVE_KEY = "pixelPetSave";

// A real day, paced like a pet you check in on, not a bar you refill.
// `timeScale` multiplies how fast sim-time passes; it's live-adjustable from
// the Test Tools panel at the bottom so you can fast-forward through aging
// and drop back to 1x (real time) without touching the URL. ?dev=60 just
// sets the starting value. This whole panel is a beta/testing aid.
const params = new URLSearchParams(location.search);
let timeScale = params.has("dev") ? Number(params.get("dev")) || 60 : 1;
const TIME_SCALE_PRESETS = [1, 10, 100, 1000];

const HOUR = 3600;

const MAX_POOP = 4;
const POOP_MIN_INTERVAL = 3 * HOUR;
const POOP_MAX_INTERVAL = 5 * HOUR;
const POOP_DIRTY_AMOUNT = 12; // cleanliness lost when a poop appears

// ---- Food as a commodity ------------------------------------------------
// Values match the old hardcoded data-food numbers exactly, so making food
// cost money changes the ECONOMY without retuning hunger at all. Priced at
// ~1 credit per 2 hunger points, with a small bulk discount on Feast so it's
// a choice rather than arithmetic.
const FOOD_TYPES = {
  snack: { label: "Snack", emoji: "🍪", value: 12, price: 6 },
  meal: { label: "Meal", emoji: "🍎", value: 30, price: 15 },
  feast: { label: "Feast", emoji: "🍲", value: 55, price: 25 },
};
const FOOD_ORDER = ["snack", "meal", "feast"];

// The safety net. Its ONLY job is to remove money as a cause of DEATH - not
// as a cause of hunger, nagging or discomfort. One free Meal per 6h supplies
// ~30 of the ~90 hunger points accrued in that window, so a broke player
// stays alive and permanently nagging, never comfortable.
const FORAGE_COOLDOWN = 6 * HOUR;
const FORAGE_VALUE = 30;

// ---- Ground coins: income for a pet too young to earn -------------------
// Only adults earn passively, and a pet takes 108h (~4.5 real days) to get
// there - so a young pet had NO income at all. These pay for SHOWING UP,
// which is the one behaviour the whole game is built around, and they fade
// to irrelevance beside adult income: forage as a kid, earn as an adult.
const GROUND_COIN_MIN_GAP = 30 * 60; // don't litter the world on a quick reload
const GROUND_COIN_MAX = 5;           // caps a 3-day absence at one visit's worth
const GROUND_COIN_MIN_VALUE = 5;
const GROUND_COIN_MAX_VALUE = 8;

// ---- Need cadences: each need has its OWN tempo -------------------------
// Sim testing showed hunger and cleanliness both went critical at ~5h, so
// every check-in was the same undifferentiated "tap everything" ritual.
// Now they're deliberately staggered:
//   hunger = the heartbeat (warns ~4h)   cleanliness = the daily chore (~13h)
// so a short visit usually has ONE obvious thing to do, not three.
const HUNGER_RATE = 15 / HOUR; // points per second, always rising
const CLEAN_PASSIVE_RATE = 100 / (20 * HOUR); // slow background grime, separate from poop

// Warn = "starting to nag, no harm yet". Critical = a real care mistake.
const WARN_HUNGER = 80;
const WARN_CLEAN = 35;

// ---- The distress ladder (predictable, not dice-rolled) -----------------
// Old behaviour rolled sickness ~0.5x/hr, so runaway landed anywhere from
// 10h to 17.7h - a player could do the same thing two days running and lose
// the pet only once. These are hard deadlines measured from the moment the
// pet FIRST starts nagging (state.distressSince), so the rule is learnable:
//   0h nag -> 4h sick -> 8h gone.  With hunger warning at ~4h, that reads as
//   "flags at 4h, sick at 8h, runs away at 12h" from a well-cared-for pet.
const DISTRESS_URGENT_SECONDS = 2 * HOUR; // louder alert before anything bad
const DISTRESS_SICK_SECONDS = 4 * HOUR;
const DISTRESS_RUNAWAY_SECONDS = 8 * HOUR;

// Temperature is an environment you gently counter, not a bar you refill.
// A simulated "weather" ambient drifts across the day; the pet's temp eases
// toward it. When a real weather feed is wired in later, it just replaces
// simulatedAmbient() - nothing else changes.
const AMBIENT_DAY_PERIOD = 24 * HOUR;
const AMBIENT_MIN = 28;
const AMBIENT_MAX = 72;
const TEMP_PULL = 1 / (5 * HOUR); // legacy gentle pull (used by offline catch-up)
const TEMP_HOMEOSTASIS = 1 / (40 * 60); // self-regulates back to comfort in ~40min
let weatherAmbient = null; // set once a real weather feed exists; null = use simulation

// ---- Weather events: making temperature actually matter ------------------
// Measured: with gentle drift alone the pet spent 0.0% of its life outside
// the comfort window - it was mathematically incapable of getting cold or
// hot, so Warm/Cool solved a problem that never happened. Instead of a
// permanent background chore, temperature is now RARE and DRAMATIC: a few
// times a day a cold snap or heat wave rolls in, pushes hard, and Warm/Cool
// genuinely rescue the pet. Short, legible, and skippable if you're around.
const WEATHER_EVENT_CHANCE_PER_HOUR = 0.14; // ~3 a day
const WEATHER_EVENT_MIN = 25 * 60;
const WEATHER_EVENT_MAX = 55 * 60;
const WEATHER_PUSH = 34 / HOUR; // points/sec toward the extreme while it rages
const WEATHER_COOLDOWN = 2 * HOUR; // no back-to-back events

// ---- Sleep ----------------------------------------------------------------
// The pet sleeps through its OWN world-night - the same dayPhase() sine that
// already drives the sky and the ambient temperature - so the world visibly
// darkens at exactly the hour the pet turns in. No separate schedule to
// explain. Sleep is the game's rest beat: needs nearly stop, weather leaves
// it alone, and the distress clock pauses, so an overnight is safe by design
// rather than the most dangerous window in the day.
const SLEEP_START_PHASE = 0.60; // dusk-ish
const SLEEP_END_PHASE = 0.90;   // just before dawn  (~7.2h of a 24h cycle)
const SLEEP_NEED_MULT = 0.2;    // hunger/grime almost stop while asleep
const ENERGY_RECHARGE = 100 / (6 * HOUR); // a full night = a full battery
const ENERGY_DRAIN_AWAKE = 100 / (30 * HOUR); // slowly spent while up and about

function dayPhaseAt(simClock) {
  return (((simClock / AMBIENT_DAY_PERIOD) % 1) + 1) % 1;
}

function isAsleep() {
  if (state.stage === "egg" || state.ranAway) return false;
  const p = dayPhaseAt(state.simClock);
  return p >= SLEEP_START_PHASE && p < SLEEP_END_PHASE;
}

// 0..1 through the night - drives the "Recharging" readout.
function sleepProgress() {
  const p = dayPhaseAt(state.simClock);
  return clamp((p - SLEEP_START_PHASE) / (SLEEP_END_PHASE - SLEEP_START_PHASE), 0, 1);
}

function simulatedAmbient(simClock) {
  const mid = (AMBIENT_MIN + AMBIENT_MAX) / 2;
  const amp = (AMBIENT_MAX - AMBIENT_MIN) / 2;
  return mid + amp * Math.sin((simClock / AMBIENT_DAY_PERIOD) * 2 * Math.PI);
}

// ---- Real weather (opt-in) -------------------------------------------
// Open-Meteo needs no API key and allows CORS, so this is a plain fetch once
// we have a location. Refreshes on a real wall-clock timer (not timeScale -
// the real world doesn't fast-forward), independent of any one pet's life.
let weatherEnabled = false;
let weatherRefreshAt = 0; // Date.now()-based ms timestamp for the next fetch
const WEATHER_REFRESH_MS = 30 * 60 * 1000;
const REAL_TEMP_MIN_F = 20; // maps to internal 0
const REAL_TEMP_MAX_F = 100; // maps to internal 100

function fahrenheitToInternal(f) {
  return clamp(((f - REAL_TEMP_MIN_F) / (REAL_TEMP_MAX_F - REAL_TEMP_MIN_F)) * 100, 0, 100);
}

function fetchRealWeather() {
  if (!navigator.geolocation) {
    showMessage("Location isn't available here.");
    weatherEnabled = false;
    updateWeatherToggleBtn();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&temperature_unit=fahrenheit`
      )
        .then((r) => r.json())
        .then((data) => {
          weatherAmbient = fahrenheitToInternal(data.current.temperature_2m);
          weatherRefreshAt = Date.now() + WEATHER_REFRESH_MS;
          showMessage(`Local weather: ${Math.round(data.current.temperature_2m)}°F`);
          render();
        })
        .catch(() => showMessage("Couldn't reach the weather service."));
    },
    () => {
      showMessage("Location permission denied.");
      weatherEnabled = false;
      updateWeatherToggleBtn();
    }
  );
}

function toggleWeather() {
  weatherEnabled = !weatherEnabled;
  if (weatherEnabled) {
    fetchRealWeather();
  } else {
    weatherAmbient = null;
  }
  updateWeatherToggleBtn();
  render();
}

function updateWeatherToggleBtn() {
  weatherToggleBtnEl.textContent = weatherEnabled ? "📍 Using real weather" : "📍 Use my real local weather";
  weatherToggleBtnEl.classList.toggle("enabled", weatherEnabled);
}

// The pet's personal comfort window - not one fixed range for every pet.
// Species sets the base (a Lizard likes it warmer than a Squid); Grit
// widens or narrows it on top, so a high-Grit pet of a "picky" species can
// still be hardy. This is the single source of truth for "is temp fine
// right now" - mood, care mistakes, sickness risk, and income all read it
// instead of each hard-coding their own numbers.
const COMFORT_CRITICAL_BUFFER = 15; // points past the window edge before it's a real mistake/sickness risk
const COMFORT_MOOD_BUFFER = 8; // smaller buffer before the mood face shows real distress

function comfortWindow() {
  const comfort = speciesComfort(state.genome && state.genome.species);
  const gritStat = effectiveStats().grit;
  const widthMult = clamp(1 + (gritStat - 10) * 0.05, 0.5, 1.8);
  const halfWidth = (comfort.width * widthMult) / 2;
  return {
    min: clamp(comfort.center - halfWidth, 0, 100),
    max: clamp(comfort.center + halfWidth, 0, 100),
  };
}

// 0 while inside the window; otherwise how far past the nearest edge.
function tempDiscomfortAmount() {
  const { min, max } = comfortWindow();
  if (state.temp < min) return min - state.temp;
  if (state.temp > max) return state.temp - max;
  return 0;
}

const MAX_OFFLINE_SECONDS = 3 * 24 * HOUR; // cap stat catch-up so a long trip doesn't nuke the numbers

// Life stages. Durations are seconds spent in that stage before growing up.
// A full life (egg to adult) runs several real days, like something worth
// coming back to rather than a one-sitting demo.
const STAGES = ["egg", "baby", "child", "teen", "adult"];
const STAGE_DURATIONS = { egg: 10 * 60, baby: 24 * HOUR, child: 36 * HOUR, teen: 48 * HOUR };
const STAGE_LABELS = { egg: "Egg", baby: "Baby", child: "Child", teen: "Teenager", adult: "Adult" };

// Crossing these lines counts as a care mistake (tracked silently - never
// shown as a bar, only felt through how your pet turns out and behaves).
const CRITICAL_HUNGER = 90;
const CRITICAL_CLEAN = 10;
const CARE_MISTAKE_THRESHOLD = 2; // <= this many mistakes by adulthood -> the "good" form
// Suffixes - the pet's name is prepended at alert time so the message reads
// "Mochi is starving!".
const CARE_MISTAKE_MESSAGES = {
  hunger: "is starving!",
  clean: "is filthy!",
  tempLow: "is freezing!",
  tempHigh: "is overheating!",
};

// (Sickness/runaway timing now lives in the distress ladder above -
// DISTRESS_SICK_SECONDS / DISTRESS_RUNAWAY_SECONDS. The old random
// per-second sick roll was removed: it made outcomes unpredictable.)

// Cute names so you bond with "Mochi", not "the pet". Picked at birth,
// revealed the moment it hatches, and carried into the Hall of Fame.
const PET_NAMES = [
  "Mochi", "Pixel", "Biscuit", "Nugget", "Pip", "Waffle", "Sprout", "Bloop",
  "Ziggy", "Tofu", "Peanut", "Comet", "Marble", "Bubbles", "Noodle", "Gizmo",
  "Pebble", "Sushi", "Momo", "Bean", "Squish", "Taro", "Wren", "Opal",
  "Kiwi", "Muffin", "Cinny", "Fig", "Yuzu", "Dot",
];

function randomName() {
  return PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)];
}

// ---- Currency ---------------------------------------------------------
// Grown-up pets earn Credits on a per-species variable-ratio timer (random
// interval + random amount within a range) rather than a fixed clock -
// unpredictable small rewards read as more alive than a metronome. The bank
// is a global, persistent stash - separate from any one pet's state - so a
// pet running away never costs you your savings. Core care stays free;
// Credits are purely for cosmetics later, so none of this gates basic play.
const MAX_EARNINGS_LOG = 30;

const REACTION_MS = 750; // how long a click-quirk animation plays

// ---- State --------------------------------------------------------------

function defaultState() {
  const genome = generateGenome();
  return {
    // The pet's own clock, in seconds. Only ever advances by `dt` inside
    // tick()/catchUpAfterGap() - never read from Date.now() directly - so
    // that ?dev=N speed actually speeds up stage growth and sickness
    // timeouts, not just the smooth stats.
    simClock: 0,
    name: randomName(),
    stage: "egg",
    stageEnteredAt: 0,
    hunger: 20, // 0 = full, 100 = starving
    cleanliness: 100, // 100 = spotless, 0 = filthy
    // Born at the CENTRE of its own species' comfort range. A hardcoded 50
    // used to leave ~23% of pets uncomfortable from the very first second,
    // since comfort windows are species- and Grit-specific.
    temp: speciesComfort(genome.species).center,
    ambient: 50, // the simulated environment temp the pet drifts toward
    poopTimer: randomPoopInterval(),
    careMistakes: 0,
    criticalFlags: { hunger: false, clean: false, tempLow: false, tempHigh: false },
    distressSince: null, // sim-seconds when the pet FIRST started nagging; null = content
    urgentNotified: false, // so the louder "please come back" alert only fires once
    weather: null, // { kind: "cold"|"heat", until } - an active weather event
    weatherNextAt: 1.5 * HOUR, // earliest sim-time the next event may roll
    energy: 100, // 0-100; refills overnight, spent staying up (and later, on adventures)
    wasAsleep: false, // edge-detects the moment it drops off / wakes up
    sick: false,
    sickSince: null,
    ranAway: false,
    needsNaming: false, // true for the moment between hatching and confirming a name
    adultForm: null,
    nextPayoutAt: null, // sim-seconds; set once the pet reaches adulthood
    forageNextAt: 0, // sim-seconds; throttles the broke-and-starving safety net
    equipped: {}, // slot -> item; gear worn by THIS pet (slots depend on its anatomy)
    genome,
    lastTick: Date.now(), // wall-clock - used only to measure real offline gaps
  };
}

let state = defaultState();
let poops = []; // { id, x, y } as percentages within the screen
let groundItems = []; // { id, kind, value, x, y } - coins waiting on the ground
let history = []; // past pets that ran away - most recent first
const MAX_HISTORY = 20;
let bank = 0; // persistent across every pet - never reset by a runaway
// Counters, not backpack items: ~33 meals to raise a pet cannot fit 20 shared
// slots, and stacking logic in a grid built for unique rarity/affix items is
// exactly the abstraction this project avoids. Three integers render the shelf.
let pantry = { snack: 0, meal: 0, feast: 0 };
let earnings = []; // recent payout log, most recent first: { amount, note, at }
let inventory = []; // owned-but-unequipped items (the "backpack") - global, survives pets
const BACKPACK_CAPACITY = 20;

// ---- Shop ---------------------------------------------------------------
// A rotating 3-slot stock, independent of any one pet (like the bank). It
// runs on its own clock (shopClock, advanced in simTick alongside timeScale)
// so the fast-forward test tools can exercise restocking too. Buying marks
// a slot "sold" until the next restock - real scarcity, not infinite supply.
const SHOP_SLOT_COUNT = 3;
const SHOP_AUTO_REFRESH_SECONDS = 6 * HOUR;
const SHOP_MANUAL_REFRESH_COST = 15;
let shopStock = []; // array of item|null, null = sold until next restock
let shopClock = 0;
let nextShopRefreshAt = 0;

function refreshShop() {
  shopStock = Array.from({ length: SHOP_SLOT_COUNT }, () => generateItem());
  nextShopRefreshAt = shopClock + SHOP_AUTO_REFRESH_SECONDS;
}

function buyShopItem(index) {
  const item = shopStock[index];
  if (!item) return false;
  if (inventory.length >= BACKPACK_CAPACITY) {
    showMessage("Backpack is full - equip or clear space first.");
    return false;
  }
  const price = itemPrice(item);
  if (bank < price) {
    showMessage("Not enough Credits.");
    return false;
  }
  bank -= price;
  inventory.push(item);
  shopStock[index] = null;
  renderShop();
  renderBank();
  return true;
}

function manualRefreshShop() {
  if (bank < SHOP_MANUAL_REFRESH_COST) {
    showMessage("Not enough Credits.");
    return;
  }
  bank -= SHOP_MANUAL_REFRESH_COST;
  refreshShop();
  renderShop();
  renderBank();
}

function randomPoopInterval() {
  return POOP_MIN_INTERVAL + Math.random() * (POOP_MAX_INTERVAL - POOP_MIN_INTERVAL);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function speciesLabel(genome) {
  const spec = SPECIES[genome && genome.species];
  const base = spec ? spec.label : "Blob";
  // A rare shiny coat reads in the name too, not just the sprite ("Cosmic Fluff ✨")
  return genome && genome.shiny ? `${genome.shiny} ${base} ✨` : base;
}

// Fewer hidden care mistakes -> more stars in the Hall of Fame.
function careStars(careMistakes) {
  if (careMistakes <= 0) return 5;
  if (careMistakes <= 2) return 4;
  if (careMistakes <= 4) return 3;
  if (careMistakes <= 6) return 2;
  return 1;
}

function formatAge(seconds) {
  const hours = seconds / HOUR;
  if (hours < 1) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

// ---- Save / load ----------------------------------------------------------

function save() {
  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({
      state, poops, groundItems, history, bank, pantry, earnings, inventory,
      shopStock, shopClock, nextShopRefreshAt, weatherEnabled,
    })
  );
}

// Fast-forwards the smooth stats and any missed poops across a real-world
// gap (tab was closed, laptop slept, etc.) without stepping through it
// second by second. Advancing simClock by the same amount lets
// checkStageProgress()/checkSickness() resolve growth and runaway timeouts
// in one shot, the same logic that handles a normal small tick.
function catchUpAfterGap(elapsedSeconds) {
  if (state.ranAway) return;
  const capped = clamp(elapsedSeconds, 0, MAX_OFFLINE_SECONDS);
  state.simClock += capped;

  checkStageProgress();
  if (state.stage === "egg") return;

  state.hunger = clamp(state.hunger + HUNGER_RATE * hungerRateFactor() * capped, 0, 100);
  state.cleanliness = clamp(state.cleanliness - CLEAN_PASSIVE_RATE * capped, 0, 100);

  // Temp settles toward wherever the environment ended up over the gap.
  state.ambient = weatherAmbient !== null ? weatherAmbient : simulatedAmbient(state.simClock);
  state.temp = clamp(state.temp + (state.ambient - state.temp) * clamp(TEMP_PULL * capped, 0, 1), 0, 100);

  // Any weather event blew over while you were away - don't resume mid-storm.
  state.weather = null;
  state.weatherNextAt = state.simClock + WEATHER_COOLDOWN;

  const missedPoops = Math.floor(capped / ((POOP_MIN_INTERVAL + POOP_MAX_INTERVAL) / 2));
  const roomForPoop = MAX_POOP - poops.length;
  for (let i = 0; i < Math.min(missedPoops, roomForPoop); i++) {
    spawnPoop();
  }

  checkCareMistakes();
  // Bound the probability window so a multi-day gap doesn't guarantee
  // sickness outright - being critical for "at least an hour" during the
  // gap is enough to roll the real chance.
  checkSickness(Math.min(capped, HOUR));

  if (state.stage === "adult") {
    // Bounded by the gap itself (`capped`), not total time-as-adult - an
    // adult who reloads daily shouldn't get paid for the same days twice.
    // Also bounded by time-as-adult in case they grew up mid-gap, above.
    catchUpEarnings(Math.min(capped, state.simClock - state.stageEnteredAt));
  }

  // NOTE: this is called with REAL elapsed seconds, never scaled by timeScale -
  // so the dev time slider will never produce return coins. Set state.lastTick
  // directly to test them.
  spawnReturnCoins(capped);
  if (capped >= GROUND_COIN_MIN_GAP) petSpeak("welcomeBack");

  state.lastTick = Date.now();
}

function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;

  const saved = JSON.parse(raw);
  state = Object.assign(defaultState(), saved.state, {
    criticalFlags: Object.assign(
      { hunger: false, clean: false, tempLow: false, tempHigh: false },
      saved.state.criticalFlags
    ),
  });
  poops = saved.poops || [];
  groundItems = saved.groundItems || []; // legacy saves predate this
  history = saved.history || [];
  bank = saved.bank || 0;
  pantry = Object.assign({ snack: 0, meal: 0, feast: 0 }, saved.pantry); // legacy saves predate this
  earnings = saved.earnings || [];
  inventory = saved.inventory || [];
  shopStock = saved.shopStock || [];
  shopClock = saved.shopClock || 0;
  nextShopRefreshAt = saved.nextShopRefreshAt || 0;
  if (shopStock.length !== SHOP_SLOT_COUNT) refreshShop();
  weatherEnabled = saved.weatherEnabled || false;
  if (weatherEnabled) fetchRealWeather(); // kicks off a fresh fetch; simTick keeps it refreshed after

  // An in-progress pet from before layered DNA needs its genome upgraded so
  // movement/quirk lookups below have the new fields.
  state.genome = normalizeGenome(state.genome);
  if (!state.equipped) state.equipped = {}; // pre-equipment saves

  // A pet saved as an adult before the currency system existed won't have
  // a payout scheduled - without this, nextPayoutAt is null and the very
  // next tick would read `simClock >= null` as true and pay out instantly.
  if (state.stage === "adult" && state.nextPayoutAt === null) schedulePayout();

  if (state.ranAway) return;
  catchUpAfterGap((Date.now() - state.lastTick) / 1000);
}

// ---- Actions (buttons call these) -----------------------------------------

function feed(amount) {
  state.hunger = clamp(state.hunger - amount, 0, 100);
  petSpeak("fed");
  floatEmoji("❤️");
}

function buyFood(kind) {
  const food = FOOD_TYPES[kind];
  if (!food || bank < food.price) return false;
  bank -= food.price;
  pantry[kind]++;
  return true;
}

function pantryCount() {
  return FOOD_ORDER.reduce((n, k) => n + pantry[k], 0);
}

function cheapestFoodPrice() {
  return Math.min(...FOOD_ORDER.map((k) => FOOD_TYPES[k].price));
}

// What a plain tap on Feed uses. NOT "cheapest" (you'd tap Snack three times
// on a starving pet) and NOT "biggest" (you'd burn a Feast on a peckish one):
// the largest food that won't waste much, falling back to whatever exists.
function bestFoodFor() {
  const room = state.hunger + 10; // a little overfill is fine, a lot is waste
  for (let i = FOOD_ORDER.length - 1; i >= 0; i--) {
    const k = FOOD_ORDER[i];
    if (pantry[k] > 0 && FOOD_TYPES[k].value <= room) return k;
  }
  for (const k of FOOD_ORDER) if (pantry[k] > 0) return k;
  return null;
}

function feedFromPantry(kind) {
  if (!pantry[kind]) return false;
  pantry[kind]--;
  feed(FOOD_TYPES[kind].value);
  return true;
}

// Removes MONEY as a cause of death, nothing more. Tied to the distress
// ladder rather than a fullness percentage: at WARN_HUNGER the clock that
// leads to sick/runaway has just started, and one free Meal drops hunger
// clear of the warn tier so anyWarning() resets it. Poverty alone can
// therefore never run a pet off - but a pet that's ALSO dirty or cold keeps
// its clock ticking, so this doesn't make anything immortal.
function maybeForage() {
  if (state.stage === "egg" || state.ranAway || isAsleep()) return;
  if (state.hunger < WARN_HUNGER) return;
  if (pantryCount() > 0) return;
  if (bank >= cheapestFoodPrice()) return; // not broke, just unprepared
  if (state.simClock < (state.forageNextAt || 0)) return;
  if (groundItems.some((g) => g.kind === "forage")) return;
  state.forageNextAt = state.simClock + FORAGE_COOLDOWN;
  const spot = freeGroundSpot();
  groundItems.push({
    id: Math.random().toString(36).slice(2),
    kind: "forage",
    value: FORAGE_VALUE,
    x: spot.x,
    y: spot.y,
  });
}

function clean() {
  state.cleanliness = 100;
  poops = [];
  petSpeak("cleaned");
  floatEmoji("✨");
  checkGroundClear();
}

function warmUp() {
  state.temp = clamp(state.temp + 15, 0, 100);
  petSpeak("warmed");
}

function coolDown() {
  state.temp = clamp(state.temp - 15, 0, 100);
  petSpeak("cooled");
}

function giveMedicine() {
  if (!state.sick) return;
  state.sick = false;
  state.sickSince = null;
  // Treating the pet buys back the full ladder, even if it's still hungry -
  // curing it shouldn't leave it one tick away from running away.
  state.distressSince = anyWarning() ? state.simClock : null;
  state.urgentNotified = false;
  petSpeak("cured");
  floatEmoji("💗");
}

function cleanOnePoop(id) {
  poops = poops.filter((p) => p.id !== id);
  state.cleanliness = clamp(state.cleanliness + POOP_DIRTY_AMOUNT, 0, 100);
  checkGroundClear();
}

// Ground items are tap targets ~44px across, so two landing on the same spot
// means the one underneath can't be reached until the top one is gone. Sample
// a handful of candidate spots and keep the one furthest from everything
// already down - best-effort, bounded, and it degrades gracefully to "the
// roomiest of 20 tries" when the ground really is crowded.
function freeGroundSpot() {
  const w = screenEl.clientWidth || 428;
  const bandPx = 0.12 * (screenEl.clientHeight || 926); // matches bandHeight in renderPoops
  const taken = poops.concat(groundItems);
  let best = { x: 12 + Math.random() * 76, y: Math.random() * 100 };
  let bestDist = -1;
  for (let i = 0; i < 20; i++) {
    const spot = { x: 12 + Math.random() * 76, y: Math.random() * 100 };
    let nearest = Infinity;
    for (const t of taken) {
      const dx = ((spot.x - t.x) / 100) * w;
      const dy = ((spot.y - t.y) / 100) * bandPx;
      nearest = Math.min(nearest, Math.hypot(dx, dy));
    }
    if (nearest > bestDist) {
      bestDist = nearest;
      best = spot;
    }
    if (nearest >= 46) break; // clear of every neighbour's tap target
  }
  return best;
}

// Coming back after a while seeds the world with things to tap: the missed
// poops are the chore (already spawned by catchUpAfterGap), these are the
// payoff. One return, some tidying, a little treasure.
function spawnReturnCoins(elapsedSeconds) {
  if (state.stage === "egg" || state.ranAway) return;
  if (elapsedSeconds < GROUND_COIN_MIN_GAP) return; // a quick reload isn't a return
  const n = clamp(Math.floor(elapsedSeconds / HOUR), 1, GROUND_COIN_MAX);
  // Spread them across the width in slots rather than placing each at random:
  // two coins landing on the same spot means the one underneath can't be
  // tapped at all.
  for (let i = 0; i < n; i++) {
    const spot = freeGroundSpot();
    groundItems.push({
      id: Math.random().toString(36).slice(2),
      kind: "coin",
      value:
        GROUND_COIN_MIN_VALUE +
        Math.round(Math.random() * (GROUND_COIN_MAX_VALUE - GROUND_COIN_MIN_VALUE)),
      x: spot.x,
      y: spot.y,
    });
  }
}

function collectGroundItem(id) {
  const it = groundItems.find((g) => g.id === id);
  if (!it) return;
  groundItems = groundItems.filter((g) => g.id !== id);
  if (it.kind === "forage") {
    // Foraged food reads as the pet finding its own dinner, not a handout.
    feed(it.value);
  } else {
    bank += it.value;
    logEarning(it.value, `${state.name} found it.`);
    showFloatingCredit(it.value);
    chimeDing();
  }
  checkGroundClear();
}

// "The level ends clean and simple." Only ever called from a site that just
// removed something, so a world that was already tidy never triggers it.
function checkGroundClear() {
  if (poops.length === 0 && groundItems.length === 0) {
    petSpeak("tidy");
    floatEmoji("✨");
  }
}

function shakeEgg() {
  if (state.stage !== "egg") return;
  state.stageEnteredAt -= 60; // wiggling nudges the hatch timer along
  showMessage("*wiggle*");
}

function newEgg() {
  state = defaultState();
  poops = [];
  groundItems = [];
  activeRoom = "hall"; // egg stage: Home/Vet don't apply, so land on the Hall
  save();
  render();
}

// ---- Poop spawning ----------------------------------------------------

function spawnPoop() {
  if (poops.length >= MAX_POOP) return;
  const spot = freeGroundSpot();
  poops.push({
    id: Math.random().toString(36).slice(2),
    x: spot.x, // percent across the screen
    y: spot.y, // position within the ground band
  });
  state.cleanliness = clamp(state.cleanliness - POOP_DIRTY_AMOUNT, 0, 100);
}

// ---- Life stages ------------------------------------------------------

function checkStageProgress() {
  // A while loop (not if) so a long time away can advance through
  // several short stages in one go, same as the offline catch-up above.
  while (STAGE_DURATIONS[state.stage] !== undefined) {
    const elapsed = state.simClock - state.stageEnteredAt;
    if (elapsed < STAGE_DURATIONS[state.stage]) break;
    advanceStage();
  }
}

function advanceStage() {
  const next = STAGES[STAGES.indexOf(state.stage) + 1];
  state.stage = next;
  state.stageEnteredAt = state.simClock;

  if (next === "baby") {
    // Hatching - the big reveal of who this pet is. state.name is currently
    // just a suggestion (randomName() from birth) - the naming overlay lets
    // the player keep it or pick their own before the reveal alert fires.
    chimeHatch();
    activeRoom = "home";
    state.needsNaming = true;
    pushAlert(`🐣 It's ${state.name}!`, `Your egg hatched into a ${speciesLabel(state.genome)}. Say hi!`);
  } else if (next === "adult") {
    state.adultForm = state.careMistakes <= CARE_MISTAKE_THRESHOLD ? "radiant" : "rough";
    schedulePayout();
    chimeEvolve();
    pushAlert(
      `🎉 ${state.name} grew up!`,
      state.adultForm === "radiant"
        ? `All that good care paid off - ${state.name} blossomed into a radiant adult! Time to start earning.`
        : `${state.name} made it to adulthood, a little rough around the edges. Time to start earning.`
    );
  } else {
    chimeEvolve();
    pushAlert(`🎉 ${state.name} grew!`, `${state.name} grew into a ${STAGE_LABELS[next].toLowerCase()}!`);
  }
}

// ---- Care mistakes & sickness (the real stakes) ----------------------

function criticalStats() {
  const { min, max } = comfortWindow();
  return {
    hunger: state.hunger >= CRITICAL_HUNGER,
    clean: state.cleanliness <= CRITICAL_CLEAN,
    tempLow: state.temp <= min - COMFORT_CRITICAL_BUFFER,
    tempHigh: state.temp >= max + COMFORT_CRITICAL_BUFFER,
  };
}

function checkCareMistakes() {
  const critical = criticalStats();
  for (const key of Object.keys(critical)) {
    if (critical[key] && !state.criticalFlags[key]) {
      state.criticalFlags[key] = true;
      state.careMistakes += 1;
      chimeMistake();
      pushAlert(`⚠️ ${state.name} needs you!`, `${state.name} ${CARE_MISTAKE_MESSAGES[key]}`);
    } else if (!critical[key] && state.criticalFlags[key]) {
      state.criticalFlags[key] = false; // can count again if it happens again later
    }
  }
}

// ---- Weather events -------------------------------------------------------
// A cold snap or heat wave rolls in a few times a day, shoves the pet's temp
// hard toward one extreme, and blows over on its own. Being caught in one is
// only a problem if nobody's around to hit Warm/Cool - which is exactly the
// "temperature finally means something" moment the old gentle drift never
// produced. Cosmetic side lives in scenes.js (drawWeatherFX).
function weatherLabel() {
  if (!state.weather) return null;
  return state.weather.kind === "cold" ? "❄️ Cold snap" : "🔥 Heat wave";
}

function updateWeather(dt) {
  if (state.weather) {
    if (state.simClock >= state.weather.until) {
      state.weather = null;
      state.weatherNextAt = state.simClock + WEATHER_COOLDOWN;
      return;
    }
    // Push hard toward the extreme. Warm/Cool fight back; Grit (via the
    // comfort window) decides how much of this the pet can shrug off.
    const dir = state.weather.kind === "cold" ? -1 : 1;
    state.temp = clamp(state.temp + dir * WEATHER_PUSH * dt, 0, 100);
    return;
  }
  if (state.simClock < state.weatherNextAt) return;
  if (isAsleep()) return; // let it sleep through the night undisturbed
  if (Math.random() < (WEATHER_EVENT_CHANCE_PER_HOUR / HOUR) * dt) {
    const kind = Math.random() < 0.5 ? "cold" : "heat";
    const dur = WEATHER_EVENT_MIN + Math.random() * (WEATHER_EVENT_MAX - WEATHER_EVENT_MIN);
    state.weather = { kind, until: state.simClock + dur };
    pushAlert(
      kind === "cold" ? "❄️ A cold snap!" : "🔥 A heat wave!",
      `${state.name} needs help staying comfortable.`
    );
  }
}

// ---- Sleep tick -----------------------------------------------------------
// Energy is the thing sleep is FOR: it fills overnight and drains slowly
// while the pet is up. Adventures will spend it (roadmap), but it already
// reads as a purpose right now via the "Recharging" line on the sleep chip.
function updateSleep(asleep, dt) {
  if (asleep) {
    state.energy = clamp(state.energy + ENERGY_RECHARGE * dt, 0, 100);
    // The distress clock PAUSES while asleep - an overnight should never be
    // the thing that loses you the pet. Sliding the start forward keeps
    // whatever distress was already banked without adding to it.
    if (state.distressSince !== null) state.distressSince += dt;
  } else {
    state.energy = clamp(state.energy - ENERGY_DRAIN_AWAKE * dt, 0, 100);
  }

  if (asleep !== state.wasAsleep) {
    state.wasAsleep = asleep;
    if (asleep) {
      state.weather = null; // storms don't bother a sleeping pet
      petSpeak("sleepy");
    } else {
      petSpeak("waking");
    }
  }
}

// "Nagging" tier - the pet is asking for something but nothing bad has
// happened yet. This is what drives the 4h soft flag on the status orbs.
function warnStats() {
  const { min, max } = comfortWindow();
  return {
    hunger: state.hunger >= WARN_HUNGER,
    clean: state.cleanliness <= WARN_CLEAN,
    tempLow: state.temp <= min,
    tempHigh: state.temp >= max,
  };
}

function anyWarning() {
  return Object.values(warnStats()).some(Boolean);
}

// The distress ladder. Deterministic on purpose: the same neglect always
// produces the same outcome at the same time, so the rule is learnable.
// Vitality still matters - it stretches how long the pet holds out before
// the clock starts (sickChanceFactor < 1 = hardier pet).
function checkSickness(dt) {
  if (anyWarning()) {
    if (state.distressSince === null) state.distressSince = state.simClock;
  } else {
    // Everything's been handled - the pet forgives and the clock resets.
    state.distressSince = null;
    state.urgentNotified = false;
    return;
  }

  const distress = (state.simClock - state.distressSince) / Math.max(0.2, sickChanceFactor());

  if (!state.urgentNotified && distress >= DISTRESS_URGENT_SECONDS) {
    state.urgentNotified = true;
    pushAlert(`😟 ${state.name} really needs you`, "Fullness, cleanliness or comfort has been ignored for a while.");
  }
  if (!state.sick && distress >= DISTRESS_SICK_SECONDS) {
    state.sick = true;
    state.sickSince = state.simClock;
    chimeSad();
    pushAlert(`🤒 ${state.name} is sick!`, "Head to the Vet and give medicine before it's too late.");
  }
  if (distress >= DISTRESS_RUNAWAY_SECONDS) runAway();
}

// ---- Stats: effective values + how they reshape the sim ---------------
// Effective = innate roll (genome.baseStats) + a small bump per life stage
// (pets "level up" as they grow) + whatever gear adds. Everything downstream
// reads this, and each stat maps to one gentle factor centered on 10 = average
// so a fresh pet plays like the tuning we already had.

function stageStatBonus() {
  // egg 0, baby +0, child +1, teen +2, adult +3 - visible growth over a life.
  return Math.max(0, STAGES.indexOf(state.stage) - 1);
}

function equippedStatBonus(key) {
  let total = 0;
  for (const item of Object.values(state.equipped)) {
    if (item && item.stats && item.stats[key]) total += item.stats[key];
  }
  return total;
}

function effectiveStats() {
  const base = (state.genome && state.genome.baseStats) || defaultStats();
  const bump = stageStatBonus();
  const out = {};
  for (const key of STAT_KEYS) {
    out[key] = clamp(base[key] + bump + equippedStatBonus(key), 1, 40);
  }
  return out;
}

function maxHP() {
  return 20 + effectiveStats().vit * 3;
}

// Each helper maps a stat to a factor centered on 1.0 at stat 10, clamped so
// no build can trivialize or brick the game.
function hungerRateFactor() {
  return clamp(1 - (effectiveStats().endurance - 10) * 0.03, 0.4, 1.4);
}
function sickChanceFactor() {
  return clamp(1 - (effectiveStats().vit - 10) * 0.04, 0.25, 1.5);
}
function charmIncomeBonus() {
  return (effectiveStats().charm - 10) * 0.02;
}

// Current diligence (fed, clean, comfortable right now) plus lifetime
// reputation (the Radiant/Scrappy grade from how they were raised) plus
// stats and gear. Sick pets earn nothing - a real incentive to keep them well.
// Grit already widened/narrowed the comfort window itself (comfortWindow()),
// so temp discomfort here is just distance past that window - no separate
// Grit multiplier needed, that would double-count the same stat.
function incomeMultiplier() {
  if (state.sick) return 0;
  const wellness = clamp(1 - (state.hunger + (100 - state.cleanliness) + tempDiscomfortAmount()) / 250, 0, 1);
  let multiplier = 0.4 + 0.6 * wellness;
  if (state.adultForm === "radiant") multiplier *= 1.2;
  if (state.adultForm === "rough") multiplier *= 0.85;
  multiplier *= 1 + equippedYield(); // rarer gear earns more - the point of shopping
  multiplier *= clamp(1 + charmIncomeBonus(), 0.5, 2); // Charm sweetens every payout
  return multiplier;
}

// Sum of the income bonus from everything the pet currently has equipped.
function equippedYield() {
  let total = 0;
  for (const item of Object.values(state.equipped)) {
    if (item) total += item.yield;
  }
  return total;
}

// ---- Equip / backpack -------------------------------------------------
// Equipping onto a filled slot bumps the old item back to the backpack.
// A pet can only wear items in the slots its anatomy supports.
function equipItem(item) {
  if (!slotsForGenome(state.genome).includes(item.slot)) return false;
  const displaced = state.equipped[item.slot];
  if (displaced) inventory.push(displaced);
  inventory = inventory.filter((i) => i.id !== item.id);
  state.equipped[item.slot] = item;
  return true;
}

function unequipSlot(slot) {
  const item = state.equipped[slot];
  if (!item) return;
  inventory.push(item);
  delete state.equipped[slot];
}

// A runaway shouldn't cost you your gear - it goes back in the backpack,
// same protective spirit as the bank surviving.
function stowEquippedToBackpack() {
  for (const slot of Object.keys(state.equipped)) {
    if (state.equipped[slot]) inventory.push(state.equipped[slot]);
  }
  state.equipped = {};
}

function schedulePayout() {
  const cfg = payoutConfig(state.genome);
  state.nextPayoutAt = state.simClock + cfg.minInterval + Math.random() * (cfg.maxInterval - cfg.minInterval);
}

function logEarning(amount, note) {
  earnings.unshift({ amount, note, at: Date.now() });
  earnings = earnings.slice(0, MAX_EARNINGS_LOG);
}

function awardPayout() {
  const multiplier = incomeMultiplier();
  if (multiplier <= 0) return 0; // sick right now - no payout, real stakes
  const cfg = payoutConfig(state.genome);
  const base = cfg.minAmount + Math.random() * (cfg.maxAmount - cfg.minAmount);
  const amount = Math.max(1, Math.round(base * multiplier));
  bank += amount;
  logEarning(amount, `${state.name} contributed.`);
  chimeDing();
  showFloatingCredit(amount);
  // payday! - a cosmetic coin burst wherever the pet is standing
  for (let i = 0; i < 5; i++) {
    sceneFX.coins.push({
      x: sceneFX.petX - 14 + Math.random() * 28,
      y0: sceneFX.petY - 8 - Math.random() * 18,
      spawnAt: performance.now() + i * 90,
    });
  }
  return amount;
}

// Awards one lump sum for a real-world gap instead of stepping through it -
// same spirit as the poop/stat catch-up. Uses the pet's health *right now*
// as a stand-in for the whole gap, since we can't reconstruct history.
function catchUpEarnings(adultElapsedSeconds) {
  const cfg = payoutConfig(state.genome);
  const multiplier = incomeMultiplier();
  if (multiplier > 0) {
    const avgInterval = (cfg.minInterval + cfg.maxInterval) / 2;
    const avgAmount = (cfg.minAmount + cfg.maxAmount) / 2;
    const missed = Math.floor(adultElapsedSeconds / avgInterval);
    if (missed > 0) {
      const amount = Math.max(1, Math.round(missed * avgAmount * multiplier));
      bank += amount;
      logEarning(amount, `${state.name} earned this while you were away.`);
    }
  }
  schedulePayout();
}

function runAway() {
  state.ranAway = true;
  chimeRunaway();
  pushAlert(`💔 ${state.name} ran away`, `${state.name} couldn't take it anymore and wandered off.`);
  stowEquippedToBackpack(); // you keep your gear even if the pet leaves

  history.unshift({
    name: state.name,
    genome: state.genome,
    stage: state.stage,
    adultForm: state.adultForm,
    careMistakes: state.careMistakes,
    ageSeconds: state.simClock,
    ranAwayAt: Date.now(),
  });
  history = history.slice(0, MAX_HISTORY);
  renderHall();
}

// ---- Update loop --------------------------------------------------------

function tick(dt) {
  if (state.ranAway) return;
  state.simClock += dt;

  checkStageProgress();
  if (state.stage === "egg") {
    state.lastTick = Date.now();
    return; // nothing to care for yet
  }

  const asleep = isAsleep();
  updateSleep(asleep, dt);
  const needMult = asleep ? SLEEP_NEED_MULT : 1;

  state.hunger = clamp(state.hunger + HUNGER_RATE * hungerRateFactor() * needMult * dt, 0, 100);
  state.cleanliness = clamp(state.cleanliness - CLEAN_PASSIVE_RATE * needMult * dt, 0, 100);

  // Body temp is HOMEOSTATIC: left alone the pet self-regulates back toward
  // the middle of its own comfort window within ~40min. Ambient nudges it,
  // but only a weather event can actually overwhelm it - so temperature is
  // an occasional emergency, never a permanent background chore.
  state.ambient = weatherAmbient !== null ? weatherAmbient : simulatedAmbient(state.simClock);
  const cw = comfortWindow();
  const restingTemp = (cw.min + cw.max) / 2 + (state.ambient - 50) * 0.12;
  state.temp = clamp(
    state.temp + (restingTemp - state.temp) * clamp(TEMP_HOMEOSTASIS * dt, 0, 1),
    0, 100
  );
  updateWeather(dt);

  state.poopTimer -= dt;
  if (state.poopTimer <= 0) {
    spawnPoop();
    state.poopTimer = randomPoopInterval();
  }

  checkCareMistakes();
  checkSickness(dt);
  maybeForage();

  if (state.stage === "adult" && state.simClock >= state.nextPayoutAt) {
    awardPayout();
    schedulePayout();
  }

  state.lastTick = Date.now();
}

// ---- Mood -----------------------------------------------------------------

function currentMood() {
  const { min, max } = comfortWindow();
  if (state.hunger > 75) return { expression: "upset", label: "Starving" };
  if (state.cleanliness < 25) return { expression: "upset", label: "Filthy" };
  if (state.temp < min - COMFORT_MOOD_BUFFER) return { expression: "upset", label: "Freezing" };
  if (state.temp > max + COMFORT_MOOD_BUFFER) return { expression: "upset", label: "Overheating" };
  if (state.hunger > 45 || state.cleanliness < 50 || tempDiscomfortAmount() > 0) {
    return { expression: "normal", label: "Okay" };
  }
  return { expression: "normal", label: "Happy" };
}

// ---- Sound (no audio files - just tones from the Web Audio API) -----------

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

function playTone(freq, duration, delay = 0, type = "sine") {
  setTimeout(() => {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
      osc.stop(ctx.currentTime + duration / 1000);
    } catch (e) {
      // Audio blocked or unavailable - the visual/text alert still gets through.
    }
  }, delay);
}

function chimeHatch() {
  playTone(523, 120, 0);
  playTone(784, 160, 120);
}
function chimeEvolve() {
  playTone(523, 100, 0);
  playTone(659, 100, 100);
  playTone(784, 220, 200);
}
// Both use "sine" (the softest oscillator shape) so a worried pet reads as
// sad, not alarming - a square wave here read as a buzzy alarm in playtesting.
function chimeMistake() {
  playTone(392, 90, 0, "sine");
  playTone(330, 130, 90, "sine");
}
function chimeSad() {
  playTone(392, 140, 0, "sine");
  playTone(294, 240, 130, "sine");
}
function chimeRunaway() {
  playTone(200, 200, 0, "triangle");
  playTone(150, 400, 220, "triangle");
}
function chimeDing() {
  playTone(1046, 70, 0);
  playTone(1568, 110, 70);
}

// ---- Push alerts: flash the tab title and fire a notification when the --
// ---- pet needs you and you're not looking at it. -------------------------

const ORIGINAL_TITLE = document.title;
let titleFlashInterval = null;

function startTitleFlash(text) {
  if (!document.hidden || titleFlashInterval) return;
  let on = false;
  titleFlashInterval = setInterval(() => {
    document.title = on ? ORIGINAL_TITLE : text;
    on = !on;
  }, 1000);
}

function stopTitleFlash() {
  if (!titleFlashInterval) return;
  clearInterval(titleFlashInterval);
  titleFlashInterval = null;
  document.title = ORIGINAL_TITLE;
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) stopTitleFlash();
});

function notify(title, body) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!document.hidden) return; // only nag when they're not already looking
  try {
    new Notification(title, { body });
  } catch (e) {
    // ignore - best effort
  }
}

function pushAlert(title, body) {
  showMessage(body);
  if (document.hidden) {
    startTitleFlash("🔴 " + title);
    notify(title, body);
  }
}

// ---- Render ---------------------------------------------------------------

const appEl = document.getElementById("app");
const petEl = document.getElementById("pet");
const petCanvasEl = document.getElementById("pet-canvas");
const petCanvasCtx = petCanvasEl.getContext("2d");
const messageEl = document.getElementById("pet-message");
const poopLayerEl = document.getElementById("poop-layer");
const hungerFillEl = document.getElementById("hunger-fill");
const cleanFillEl = document.getElementById("clean-fill");
const tempComfortBandEl = document.getElementById("temp-comfort-band");
const tempAmbientTickEl = document.getElementById("temp-ambient-tick");
const tempMarkerEl = document.getElementById("temp-marker");
const thermoRingEl = document.getElementById("thermo-ring");
const thermoNeedleEl = document.getElementById("thermo-needle");
const thermoEmojiEl = document.getElementById("thermo-emoji");
const thermoTempLabelEl = document.getElementById("thermo-temp-label");
const thermoStatusEl = document.getElementById("thermo-status");
const thermoOutsideEl = document.getElementById("thermo-outside");
const weatherToggleBtnEl = document.getElementById("weather-toggle-btn");
const stageBadgeEl = document.getElementById("stage-badge");
const medicineBtnEl = document.getElementById("medicine-btn");
const runawayOverlayEl = document.getElementById("runaway-overlay");
const nameOverlayEl = document.getElementById("name-overlay");
const nameInputEl = document.getElementById("name-input");
const vetBadgeEl = document.getElementById("vet-badge");
const vetHealthyEl = document.getElementById("vet-healthy");
const petNameEl = document.getElementById("pet-name");
const hallListEl = document.getElementById("hall-list");
const hallEmptyEl = document.getElementById("hall-empty");
const petTagEl = document.getElementById("pet-tag");
const statusOrbEl = document.getElementById("status-orb");
const orbIconEl = document.getElementById("orb-icon");
const bankBigAmountEl = document.getElementById("bank-big-amount");
const bankFlavorEl = document.getElementById("bank-flavor");
const bankLogEl = document.getElementById("bank-log");
const screenEl = document.getElementById("screen");
const companionEl = document.getElementById("companion");
const companionScreenEl = document.getElementById("companion-screen");
const foldCloseEl = document.getElementById("fold-close");
const vetPillEl = document.getElementById("vet-pill");
const tempPillEl = document.getElementById("temp-pill");
const tempPillTextEl = document.getElementById("temp-pill-text");
const cleanPillEl = document.getElementById("clean-pill");
const sleepPillEl = document.getElementById("sleep-pill");
const sleepTextEl = document.getElementById("sleep-text");
const feedMenuEl = document.getElementById("feed-menu");
const sheetTitleEl = document.getElementById("sheet-title");
const sheetHpEl = document.getElementById("sheet-hp");
const statBlockEl = document.getElementById("stat-block");
const dollPreviewEl = document.getElementById("doll-preview");
const dollPreviewCtx = dollPreviewEl.getContext("2d");
const dollAnatomyRowEl = document.getElementById("doll-anatomy-row");
const backpackGridEl = document.getElementById("backpack-grid");
const shopGridEl = document.getElementById("shop-grid");
const shopFlavorEl = document.getElementById("shop-flavor");

let messageTimeout = null;

// System text (alerts, "backpack full") — plain, not the pet's voice.
function showMessage(text) {
  clearTimeout(messageTimeout);
  messageEl.textContent = text;
  messageTimeout = setTimeout(() => {
    messageEl.textContent = "";
  }, 2000);
}

// ---- Pet voice: speech chips in the pet's own language -----------------
// The chip shows the pet's alien glyphs + a mood emoji (so feeling always
// reads). Tapping it reveals the English translation — a first taste of the
// translation mechanic that a bond/skill system will formalize later.
let lastVoice = null; // { glyph, english, emo } currently on screen

function petSpeak(intent) {
  if (state.stage === "egg" || state.ranAway) return;
  lastVoice = petVoice(intent, state.genome);
  renderSpeech(false);
  clearTimeout(messageTimeout);
  messageTimeout = setTimeout(() => {
    messageEl.textContent = "";
    lastVoice = null;
  }, 4200);
}

function renderSpeech(translated) {
  if (!lastVoice) return;
  messageEl.innerHTML =
    `<span class="say-body">` +
    (translated
      ? `<span class="say-en">${lastVoice.english}</span>`
      : `<span class="say-glyphs">${lastVoice.glyph}</span>`) +
    `<span class="say-emo">${lastVoice.emo}</span></span>` +
    `<span class="say-hint">${translated ? "tap: hide" : "tap: translate"}</span>`;
}

// A little emoji that floats up off the pet — cheap, reinforces "alive".
function floatEmoji(emoji) {
  const el = document.createElement("div");
  el.className = "float-emoji";
  el.textContent = emoji;
  el.style.left = 42 + Math.random() * 16 + "%";
  screenEl.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

// Which single contextual pill (if any) the world is showing, worst first.
// Keyed off the SAME thresholds as the orb pulses and the distress clock, so
// the pill, the orb and the timer that leads to sick/runaway all agree.
// Nothing nags while asleep - weather events don't spawn at night anyway, and
// the whole sleep design says leave it be.
function pickContextPill() {
  if (state.ranAway || state.stage === "egg") return null;
  if (state.sick) return "vet";
  if (isAsleep()) return null;
  if (tempDiscomfortAmount() > 0) return "temp";
  if (state.cleanliness <= WARN_CLEAN) return "clean";
  return null;
}

function renderVisibility() {
  appEl.classList.toggle("stage-egg", state.stage === "egg" && !state.ranAway);
  appEl.classList.toggle("ranaway", state.ranAway);
  medicineBtnEl.classList.toggle("hidden", !state.sick || state.ranAway);
  vetHealthyEl.classList.toggle("hidden", state.sick);
  runawayOverlayEl.classList.toggle("hidden", !state.ranAway);
  vetBadgeEl.classList.toggle("hidden", !state.sick);
  // Contextual pills replace the old Warm/Cool/Clean keys. The world asks for
  // what it needs instead of five permanent buttons waiting to be needed.
  // Exactly ONE shows at a time, worst-first - three pills stacked on the same
  // 66px line would overlap, and a pet that is sick in a heatwave should be
  // told about the vet, not the weather.
  const pill = pickContextPill();
  // Any pill sits exactly where the speech chip goes, so the chip drops below
  // it - the same collision the sleep pill already had to solve. The vet pill
  // never did, it just went unnoticed because a sick pet is rare.
  appEl.classList.toggle("has-pill", pill !== null);
  vetPillEl.classList.toggle("hidden", pill !== "vet");
  tempPillEl.classList.toggle("hidden", pill !== "temp");
  cleanPillEl.classList.toggle("hidden", pill !== "clean");
  if (pill === "temp") {
    const cold = state.temp < comfortWindow().min;
    tempPillEl.classList.toggle("cold", cold);
    tempPillEl.classList.toggle("heat", !cold);
    tempPillTextEl.textContent = cold ? "❄️ Cold snap" : "🔥 Heat wave";
  }

  // Sleep: quiet the whole UI down so it reads "leave me be". The vet pill
  // still wins if the pet is ill - that always needs you.
  const asleep = isAsleep();
  appEl.classList.toggle("asleep", asleep);
  sleepPillEl.classList.toggle("hidden", !asleep || state.sick);
  if (asleep) {
    sleepTextEl.textContent = `Sleeping · ${Math.round(state.energy)}%`;
  }

  // The naming overlay: prime the input with the suggested name only on the
  // moment it opens, so it doesn't clobber what the player is typing.
  const showNaming = state.needsNaming && !state.ranAway;
  nameOverlayEl.classList.toggle("hidden", !showNaming);
  if (showNaming && !nameOverlayShown) {
    nameInputEl.value = state.name;
    nameOverlayShown = true;
  } else if (!showNaming) {
    nameOverlayShown = false;
  }

  const named = state.stage !== "egg" && !state.ranAway;
  petNameEl.classList.toggle("hidden", !named);
  if (named) petNameEl.textContent = state.name;
}

// ---- Rooms ----------------------------------------------------------------

let activeRoom = "home";
let lastSheetRoom = "gear"; // what the ••• key reopens the sheet to
let nameOverlayShown = false; // primes the name input once per naming moment

function setRoom(room) {
  activeRoom = room;
  if (room !== "home") lastSheetRoom = room;
  renderRooms();
  renderCompanionScreen();
}

function renderRooms() {
  for (const tab of document.querySelectorAll(".room-tab")) {
    tab.classList.toggle("active", tab.dataset.room === activeRoom);
  }
  for (const room of document.querySelectorAll(".room")) {
    room.classList.toggle("hidden", room.id !== `room-${activeRoom}`);
  }
  // "home" is the folded/resting state (care pad showing). Any other mode
  // means the companion is unfolded: light its readout, show the fold button.
  const unfolded = activeRoom !== "home" && !state.ranAway;
  companionEl.classList.toggle("open", unfolded);
  foldCloseEl.classList.toggle("hidden", !unfolded);
}

// The little amber readout inside the unfolded companion: a one-line
// context digest for whatever mode is open. Blank + dim when folded.
function renderCompanionScreen() {
  if (activeRoom === "home" || state.ranAway) {
    companionScreenEl.classList.add("off");
    companionScreenEl.textContent = "";
    return;
  }
  companionScreenEl.classList.remove("off");
  const alive = state.stage !== "egg";
  let txt = "";
  switch (activeRoom) {
    case "care":
      txt = alive
        ? `${Math.round(state.temp)}°  ·  ${tempDiscomfortAmount() > 0 ? "UNCOMFORTABLE" : "COMFY"}`
        : "NO PET";
      break;
    case "gear":
      txt = alive
        ? `${state.name}  ♥${maxHP()}  BAG ${inventory.length}/${BACKPACK_CAPACITY}`
        : `NO PET  ·  BAG ${inventory.length}/${BACKPACK_CAPACITY}`;
      break;
    case "shop":
      txt = `${bank} CR  ·  FULL ${Math.round(100 - state.hunger)}%`;
      break;
    case "vet":
      txt = !alive ? "NO PET" : state.sick ? `! ${state.name.toUpperCase()} IS SICK` : `${state.name.toUpperCase()} IS WELL`;
      break;
    case "bank":
      txt = `${bank} CREDITS SAVED`;
      break;
    case "hall":
      txt = `${history.length} PET${history.length === 1 ? "" : "S"} REMEMBERED`;
      break;
  }
  companionScreenEl.textContent = txt;
}

function renderHall() {
  hallEmptyEl.classList.toggle("hidden", history.length > 0);
  hallListEl.innerHTML = "";

  for (const entry of history) {
    const row = document.createElement("div");
    row.className = "hall-entry";

    const canvas = document.createElement("canvas");
    canvas.width = CREATURE_CANVAS_SIZE;
    canvas.height = CREATURE_CANVAS_SIZE;
    drawCreature(canvas.getContext("2d"), entry.genome, {
      bobOffset: 0,
      flipX: false,
      squish: 0,
      blink: false,
      expression: "normal",
      adultForm: entry.stage === "adult" ? entry.adultForm : null,
    });

    let stageText = STAGE_LABELS[entry.stage] || entry.stage;
    if (entry.stage === "adult" && entry.adultForm) {
      stageText += entry.adultForm === "radiant" ? " · Radiant" : " · Scrappy";
    }
    const stars = careStars(entry.careMistakes);
    const starText = "★".repeat(stars) + "☆".repeat(5 - stars);

    const info = document.createElement("div");
    info.className = "hall-info";
    info.innerHTML =
      `<div class="hall-name">${entry.name || "Buddy"}</div>` +
      `<div class="hall-species">${speciesLabel(entry.genome)} · ${stageText}</div>` +
      `<div class="hall-stars">${starText}</div>` +
      `<div>Cared for ${formatAge(entry.ageSeconds || 0)}</div>`;

    row.appendChild(canvas);
    row.appendChild(info);
    hallListEl.appendChild(row);
  }
}

function relativeTime(ms) {
  const seconds = (Date.now() - ms) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

function renderBank() {
  bankBigAmountEl.textContent = bank;

  const alive = state.stage !== "egg" && !state.ranAway;
  bankFlavorEl.textContent =
    state.stage === "adult"
      ? `${state.name} the ${speciesLabel(state.genome)}: ${payoutFlavor(state.genome)}`
      : alive
      ? `${state.name} will start earning once grown up.`
      : "Raise a pet to adulthood to start earning.";

  bankLogEl.innerHTML = "";
  if (earnings.length === 0) {
    bankLogEl.innerHTML = '<p class="room-note">No earnings yet - grow a pet to adulthood and keep it happy.</p>';
    return;
  }
  for (const entry of earnings) {
    const row = document.createElement("div");
    row.className = "bank-entry";
    row.innerHTML = `<span>+${entry.amount} 🪙</span><span class="bank-entry-note">${entry.note || ""} · ${relativeTime(entry.at)}</span>`;
    bankLogEl.appendChild(row);
  }
}

// ---- Gear screen: paper doll + stat block + backpack -----------------
// Two ways to equip, sharing the same equipItem()/unequipSlot() calls:
//  - Click-to-equip: tap a backpack item to select it, tap a slot to equip.
//    Also the fallback for anything that isn't real pointer-drag.
//  - Drag: pick an item up and drop it on a slot (or drop a worn item back
//    onto the backpack to take it off). See setupDragSource() below.
let selectedItemId = null;

// "+3 Vitality, +2 Grit" - empty string for a plain item with no affixes.
function itemStatsSummary(item) {
  if (!item.stats) return "";
  return Object.entries(item.stats)
    .map(([key, amount]) => `+${amount} ${STAT_LABELS[key]}`)
    .join(", ");
}

function itemIconHTML(item, extraClass) {
  const rarity = RARITIES[item.rarity];
  const statsSummary = itemStatsSummary(item);
  const title = statsSummary ? `${item.name} (${statsSummary})` : item.name;
  return (
    `<div class="item-icon ${extraClass || ""}" style="border-color:${rarity.color}" title="${title}">` +
    `<span>${SLOTS[item.slot].icon}</span></div>`
  );
}

function slotButtonEl(slot) {
  return document.querySelector(`.slot-btn[data-slot="${slot}"]`);
}

function renderGear() {
  const alive = state.stage !== "egg" && !state.ranAway;
  if (!alive) {
    sheetTitleEl.textContent = state.ranAway ? "No pet right now" : "Egg — not hatched yet";
    sheetHpEl.textContent = "";
    statBlockEl.innerHTML = '<p class="room-note">Stats reveal when your egg hatches.</p>';
    dollAnatomyRowEl.innerHTML = "";
    backpackGridEl.innerHTML = "";
    return;
  }

  sheetTitleEl.textContent = `${state.name} · ${speciesLabel(state.genome)}`;
  sheetHpEl.textContent = `❤️ ${maxHP()} HP`;

  renderStatBlock();
  renderDoll();
  renderBackpack();
}

function renderStatBlock() {
  const bump = stageStatBonus();
  const stats = effectiveStats();

  statBlockEl.innerHTML = "";
  for (const key of STAT_KEYS) {
    const bonus = bump + equippedStatBonus(key); // everything on top of the innate roll
    const row = document.createElement("div");
    row.className = "stat-line";
    row.innerHTML =
      `<div class="stat-top">` +
      `<span class="stat-name">${STAT_LABELS[key]}</span>` +
      `<span class="stat-track"><span class="stat-fill" style="width:${Math.min(100, (stats[key] / 20) * 100)}%"></span></span>` +
      `<span class="stat-value">${stats[key]}${bonus ? `<span class="stat-bonus"> (+${bonus})</span>` : ""}</span>` +
      `</div>` +
      `<div class="stat-blurb">${STAT_BLURBS[key]}</div>`;
    statBlockEl.appendChild(row);
  }
}

function renderDoll() {
  const supported = slotsForGenome(state.genome);
  const anatomySlot = supported.find((s) => !UNIVERSAL_SLOTS.includes(s));
  const selectedItem = selectedItemId ? inventory.find((i) => i.id === selectedItemId) : null;

  for (const btn of document.querySelectorAll(".slot-btn")) {
    const slot = btn.dataset.slot;
    const item = state.equipped[slot];
    // Only the slot that actually matches the selected item lights up -
    // otherwise every slot looked "ready" regardless of fit.
    btn.classList.toggle("selectable", !!selectedItem && selectedItem.slot === slot);
    btn.innerHTML = item
      ? itemIconHTML(item)
      : `<span class="slot-empty">${SLOTS[slot].icon}<small>${SLOTS[slot].label}</small></span>`;
  }

  // The one anatomy-dependent slot (feet/antenna/ears/tentacles) renders in
  // its own row since not every pet has one.
  dollAnatomyRowEl.innerHTML = "";
  if (anatomySlot) {
    const btn = document.createElement("button");
    btn.className = "slot-btn anatomy-slot";
    btn.dataset.slot = anatomySlot;
    btn.classList.toggle("selectable", !!selectedItem && selectedItem.slot === anatomySlot);
    const item = state.equipped[anatomySlot];
    btn.innerHTML = item
      ? itemIconHTML(item)
      : `<span class="slot-empty">${SLOTS[anatomySlot].icon}<small>${SLOTS[anatomySlot].label}</small></span>`;
    btn.addEventListener("click", () => handleSlotClick(anatomySlot));
    setupDragSource(btn, () => state.equipped[anatomySlot], "slot", anatomySlot);
    dollAnatomyRowEl.appendChild(btn);
  }

  drawCreature(dollPreviewCtx, state.genome, {
    bobOffset: 0,
    flipX: false,
    squish: 0,
    blink: false,
    expression: state.sick ? "sick" : currentMood().expression,
    adultForm: state.stage === "adult" ? state.adultForm : null,
    equipped: state.equipped,
  });
}

function renderBackpack() {
  backpackGridEl.innerHTML = "";
  for (let i = 0; i < BACKPACK_CAPACITY; i++) {
    const item = inventory[i];
    const cell = document.createElement("div");
    cell.className = "backpack-cell";
    if (item) {
      cell.classList.toggle("selected", item.id === selectedItemId);
      cell.innerHTML = itemIconHTML(item);
      cell.querySelector(".item-icon").removeAttribute("title"); // custom bubble instead of native tooltip
      cell.addEventListener("click", () => handleBackpackClick(item));
      cell.addEventListener("mouseenter", () => showItemTip(item, cell));
      cell.addEventListener("mouseleave", hideItemTip);
      setupDragSource(cell, () => item, "backpack", null);
    }
    backpackGridEl.appendChild(cell);
  }
}

// ---- Item hover bubble --------------------------------------------------
// A single reusable tooltip that pops above a hovered backpack item with its
// name, rarity, slot, stat bonuses, and Credit yield.
const itemTipEl = document.createElement("div");
itemTipEl.id = "item-tip";
itemTipEl.className = "hidden";
document.body.appendChild(itemTipEl);

function showItemTip(item, cellEl) {
  const rarity = RARITIES[item.rarity];
  const statLines = item.stats
    ? Object.entries(item.stats).map(([k, v]) => `<div class="tip-stat">+${v} ${STAT_LABELS[k]}</div>`).join("")
    : "";
  itemTipEl.innerHTML =
    `<div class="tip-name" style="color:${rarity.color}">${item.name}</div>` +
    `<div class="tip-sub">${rarity.label} · ${SLOTS[item.slot].label}</div>` +
    (statLines || `<div class="tip-stat tip-plain">No stat bonuses</div>`) +
    `<div class="tip-yield">+${Math.round(item.yield * 100)}% Credits</div>`;

  itemTipEl.classList.remove("hidden");
  // Position centered above the cell; flip below if too close to the top.
  const rect = cellEl.getBoundingClientRect();
  const below = rect.top < 130;
  itemTipEl.classList.toggle("below", below);
  itemTipEl.style.left = rect.left + rect.width / 2 + "px";
  itemTipEl.style.top = (below ? rect.bottom + 8 : rect.top - 8) + "px";
}

function hideItemTip() {
  itemTipEl.classList.add("hidden");
}

// Tapping a backpack item equips it straight away. equipItem() swaps out
// whatever was in that slot back into the backpack, so it's a clean trade.
function handleBackpackClick(item) {
  selectedItemId = null;
  if (equipItem(item)) {
    showMessage(`Equipped ${item.name}!`);
    hideItemTip();
  } else {
    showMessage(`${state.name} can't wear that.`);
  }
  renderGear();
}

function handleSlotClick(slot) {
  if (selectedItemId) {
    const item = inventory.find((i) => i.id === selectedItemId);
    if (item && item.slot === slot) {
      equipItem(item);
      showMessage(`Equipped ${item.name}!`);
    } else {
      showMessage("That doesn't fit there.");
    }
    selectedItemId = null;
    renderGear();
    return;
  }
  if (state.equipped[slot]) {
    const name = state.equipped[slot].name;
    unequipSlot(slot);
    showMessage(`Put away ${name}.`);
    renderGear();
  }
}

// ---- Drag and drop (Pointer Events - works for mouse, touch, and pen in
// one code path, unlike native HTML5 drag/drop which touch browsers don't
// support). A short move threshold tells a real drag apart from a tap, so
// the same elements support both interaction styles.
const DRAG_THRESHOLD_PX = 6;
let dragGhostEl = null;
let dragCtx = null; // { item, source, slot, startX, startY, dragging }

function setupDragSource(el, getItem, source, slot) {
  el.addEventListener("pointerdown", (e) => {
    const item = getItem();
    if (!item) return;
    dragCtx = { item, source, slot, startX: e.clientX, startY: e.clientY, dragging: false };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => onDragPointerMove(e));
  el.addEventListener("pointerup", (e) => onDragPointerUp(e));
  el.addEventListener("pointercancel", () => cancelDrag());
}

function onDragPointerMove(e) {
  if (!dragCtx) return;
  const dx = e.clientX - dragCtx.startX;
  const dy = e.clientY - dragCtx.startY;
  if (!dragCtx.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

  if (!dragCtx.dragging) {
    dragCtx.dragging = true;
    dragGhostEl = document.createElement("div");
    dragGhostEl.className = "drag-ghost";
    dragGhostEl.innerHTML = `<span>${SLOTS[dragCtx.item.slot].icon}</span>`;
    dragGhostEl.style.borderColor = RARITIES[dragCtx.item.rarity].color;
    document.body.appendChild(dragGhostEl);
  }
  dragGhostEl.style.left = e.clientX + "px";
  dragGhostEl.style.top = e.clientY + "px";

  document.querySelectorAll(".drop-hover").forEach((el) => el.classList.remove("drop-hover"));
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const slotBtn = target && target.closest(".slot-btn");
  if (slotBtn && slotBtn.dataset.slot === dragCtx.item.slot) slotBtn.classList.add("drop-hover");
  const backpackTarget = target && target.closest("#backpack-grid");
  if (backpackTarget && dragCtx.source === "slot") backpackTarget.classList.add("drop-hover");
}

function onDragPointerUp(e) {
  if (!dragCtx) return;
  if (!dragCtx.dragging) {
    // Too small a move to count as a drag - let the click handler run instead.
    dragCtx = null;
    return;
  }

  const target = document.elementFromPoint(e.clientX, e.clientY);
  const slotBtn = target && target.closest(".slot-btn");
  const backpackTarget = target && target.closest("#backpack-grid");

  if (slotBtn && slotBtn.dataset.slot === dragCtx.item.slot) {
    equipItem(dragCtx.item);
    showMessage(`Equipped ${dragCtx.item.name}!`);
    selectedItemId = null;
    renderGear();
  } else if (backpackTarget && dragCtx.source === "slot") {
    unequipSlot(dragCtx.slot);
    showMessage(`Put away ${dragCtx.item.name}.`);
    renderGear();
  } else if (target && target.closest(".slot-btn")) {
    showMessage("That doesn't fit there.");
  }

  cancelDrag();
}

function cancelDrag() {
  document.querySelectorAll(".drop-hover").forEach((el) => el.classList.remove("drop-hover"));
  if (dragGhostEl) {
    dragGhostEl.remove();
    dragGhostEl = null;
  }
  dragCtx = null;
}

// ---- Shop ---------------------------------------------------------------

// Always stocked, deliberately outside the rotating gear stock: "the shop has
// no food today" while your pet starves would be a rage-quit.
function renderFoodShop() {
  const grid = document.getElementById("food-grid");
  if (!grid) return;
  grid.innerHTML = "";
  for (const k of FOOD_ORDER) {
    const f = FOOD_TYPES[k];
    const card = document.createElement("div");
    card.className = "food-card";
    const affordable = bank >= f.price;
    card.innerHTML =
      `<div class="food-emoji">${f.emoji}</div>` +
      `<div class="food-name">${f.label}</div>` +
      `<div class="food-value">+${f.value}</div>` +
      `<div class="food-owned">have ${pantry[k]}</div>`;
    const btn = document.createElement("button");
    btn.className = "shop-buy-btn"; // same affordance as the gear cards below
    btn.textContent = `🪙 ${f.price}`;
    btn.disabled = !affordable;
    btn.addEventListener("click", () => {
      if (buyFood(k)) {
        showMessage(`Bought a ${f.label}.`);
        render();
      }
    });
    card.appendChild(btn);
    grid.appendChild(card);
  }
}

function renderShop() {
  renderFoodShop();
  const supported = state.stage !== "egg" && !state.ranAway ? slotsForGenome(state.genome) : [];
  shopFlavorEl.textContent =
    supported.length > 0
      ? `New stock rolls in periodically. Anything ${state.name} can't wear yet just waits in your backpack.`
      : "New stock rolls in periodically - stash gear in your backpack for your next pet.";

  shopGridEl.innerHTML = "";
  shopStock.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "shop-card";
    if (!item) {
      card.classList.add("shop-sold");
      card.innerHTML = `<div class="item-icon sold-icon"><span>✅</span></div><div class="shop-sold-label">Sold</div>`;
      shopGridEl.appendChild(card);
      return;
    }
    const affordable = bank >= itemPrice(item);
    const statsSummary = itemStatsSummary(item);
    card.innerHTML =
      itemIconHTML(item) +
      `<div class="shop-name">${item.name}</div>` +
      `<div class="shop-rarity" style="color:${RARITIES[item.rarity].color}">${RARITIES[item.rarity].label}</div>` +
      (statsSummary ? `<div class="shop-stats">${statsSummary}</div>` : "") +
      `<button class="shop-buy-btn" ${affordable ? "" : "disabled"}>🪙 ${itemPrice(item)}</button>`;
    card.querySelector(".shop-buy-btn").addEventListener("click", () => buyShopItem(index));
    shopGridEl.appendChild(card);
  });
}

function showFloatingCredit(amount) {
  const el = document.createElement("div");
  el.className = "floating-credit";
  el.textContent = `+${amount} 🪙`;
  el.style.left = 40 + Math.random() * 20 + "%";
  screenEl.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

function renderStageBadge() {
  let text = STAGE_LABELS[state.stage] || state.stage;
  if (state.stage === "adult" && state.adultForm) {
    text += state.adultForm === "radiant" ? " · Radiant" : " · Scrappy";
  }
  stageBadgeEl.textContent = text;
}

function renderStats() {
  // Shown as *fullness* (inverse of hunger) - the popover is titled
  // "Fullness" and the bezel orb fills the same way, so full bar = fed pet.
  hungerFillEl.style.width = 100 - state.hunger + "%";
  cleanFillEl.style.width = state.cleanliness + "%";
  renderTempWidgets();
}

// Trend text: is the pet's own temp currently drifting toward a hotter or
// colder ambient, or already settled? Lets you anticipate a nudge instead
// of only reacting once it's already uncomfortable.
function tempTrendArrow() {
  const gap = state.ambient - state.temp;
  if (gap > 3) return "▲ warming";
  if (gap < -3) return "▼ cooling";
  return "→ steady";
}

function ambientDescription(ambient) {
  if (ambient <= 25) return { icon: "❄️", label: "Cold" };
  if (ambient <= 42) return { icon: "🌥️", label: "Cool" };
  if (ambient <= 58) return { icon: "🌤️", label: "Mild" };
  if (ambient <= 75) return { icon: "☀️", label: "Warm" };
  return { icon: "🔥", label: "Hot" };
}

function renderTempWidgets() {
  const alive = state.stage !== "egg" && !state.ranAway;
  if (!alive) return;

  const { min, max } = comfortWindow();

  // Compact always-visible strip: green comfort band, a solid marker for
  // the pet's actual temp, a faint dashed tick for where ambient is pulling it.
  tempComfortBandEl.style.left = min + "%";
  tempComfortBandEl.style.width = max - min + "%";
  tempMarkerEl.style.left = state.temp + "%";
  tempAmbientTickEl.style.left = clamp(state.ambient, 0, 100) + "%";

  // The dial: a ring colored cold/comfortable/hot by this pet's own window,
  // needle at its current temp. Offset so the middle of the 0-100 scale (a
  // typical comfort zone) points up - reads more like a real gauge than
  // having the "good" zone wrap awkwardly around the bottom.
  thermoRingEl.style.background =
    `conic-gradient(from -180deg, #4a90d9 0%, #4a90d9 ${min}%, #4caf7d ${min}%, ` +
    `#4caf7d ${max}%, #d9534f ${max}%, #d9534f 100%)`;
  thermoNeedleEl.style.transform = `rotate(${(state.temp / 100) * 360 - 180}deg)`;

  thermoEmojiEl.textContent = state.sick ? "🤒" : currentMood().expression === "upset" ? "😣" : "🙂";
  thermoTempLabelEl.textContent = Math.round(state.temp) + "°";

  const discomfort = tempDiscomfortAmount();
  thermoStatusEl.textContent =
    discomfort <= 0 ? "Cozy and comfortable" : state.temp < min ? "Getting chilly - warm it up" : "Getting warm - cool it down";

  const outside = ambientDescription(state.ambient);
  const event = weatherLabel();
  thermoOutsideEl.innerHTML =
    (event ? `<strong>${event} — it'll pass soon</strong><br>` : "") +
    `Outside: ${outside.icon} ${outside.label} <span class="temp-trend">${tempTrendArrow()}</span>` +
    (weatherEnabled ? "<br>📍 Using your local weather" : "<br>Simulated day/night cycle");
}

// The creature only exists visually once hatched - egg and "ran away"
// still use the simple emoji div instead. Movement personality (how far/fast
// it wanders, how much it bobs) comes from the pet's DNA, so every pet feels
// a little different to watch. reactionStart drives the click quirk.
let creatureAnim = {
  x: 0, targetX: 0, nextWanderAt: 0, blinkUntil: 0, nextBlinkAt: 0,
  squishUntil: 0, flipX: false, reactionStart: 0,
};

function petMovement() {
  return (state.genome && state.genome.movement) || SPECIES.blob.movement;
}

// Clamped to however much room the screen actually has around the canvas
// (not just the DNA-rolled range) so a high-jitter roll can never wander
// the creature past the visible terrarium, regardless of screen size.
function maxWanderDistance() {
  return Math.max(0, (screenEl.clientWidth - petCanvasEl.width) / 2 - 4);
}

function pickWanderTarget(now) {
  const mv = petMovement();
  const range = Math.min(mv.range, maxWanderDistance());
  creatureAnim.targetX = (Math.random() * 2 - 1) * range;
  creatureAnim.nextWanderAt = now + mv.pause * (0.6 + Math.random() * 0.8);
}

function scheduleBlink(now) {
  creatureAnim.nextBlinkAt = now + 2000 + Math.random() * 4000;
}

function triggerSquish() {
  creatureAnim.squishUntil = performance.now() + 300;
}

// Direct click on the pet -> its species-specific quirk animation.
function triggerReaction() {
  creatureAnim.reactionStart = performance.now();
}

function updateCreatureAnim(now) {
  const mv = petMovement();
  // out in the scene, the director owns where the pet is headed
  if (sceneView.mode !== "scene" && now >= creatureAnim.nextWanderAt) pickWanderTarget(now);
  if (now >= creatureAnim.nextBlinkAt && now >= creatureAnim.blinkUntil) {
    creatureAnim.blinkUntil = now + 150;
    scheduleBlink(now);
  }

  const dx = creatureAnim.targetX - creatureAnim.x;
  if (Math.abs(dx) > 0.5) creatureAnim.flipX = dx < 0;
  creatureAnim.x += dx * 0.03 * mv.speed;
}

function currentReaction(now) {
  const elapsed = now - creatureAnim.reactionStart;
  if (creatureAnim.reactionStart === 0 || elapsed > REACTION_MS) return null;
  return { quirk: state.genome.quirk, progress: elapsed / REACTION_MS };
}

// ---- Scene director -------------------------------------------------------
// The pet lives in a little pixel world (scenes.js paints it, always visible
// as the screen's backdrop). Interacting keeps the pet big and front-and-
// center; leave it alone for ~15s and it shrinks down and goes about its day
// out in the scene — shaking the apple tree, working the spaceship console.
// Johnny Castaway energy. Purely cosmetic: rides the rAF loop and never
// touches the simulation; a payout landing in the sim just gets *depicted*
// here as a coin burst wherever the pet happens to be standing.
const SCENE_IDLE_MS = 15000;
const SCENE_PET_SCALE = 0.55;
const CLOSEUP_PET_SCALE = 2.2; // pet fills the big slab when up close
// How far the ground line sits above the dock. Raising this lifts the pet out
// of the buttons AND shrinks the sky above it, since the pet's feet ride the
// ground - the two things that read as "too empty" on a full-bleed phone.
const GROUND_DOCK_GAP = 90;

const sceneCanvasEl = document.getElementById("scene-canvas");
const sceneCtx = sceneCanvasEl.getContext("2d");

let sceneView = {
  id: "meadow",
  mode: "closeup", // "closeup" | "scene"
  lastTouchAt: performance.now(),
  visits: 0,
  scale: 1, // eased each frame toward the mode's target
  dy: 0,
  act: null,
  nextActAt: 0,
};

let sceneFX = {
  apples: [], coins: [], shards: [], napping: false, basketFill: 0, castleFill: 0,
  beachSky: "day", shells: [],
  treeShakeUntil: 0, consoleTapAt: 0, leverFlipAt: -9999, leverOn: false,
  crystalHitAt: -9999, mushroomPulseAt: -9999,
  vig: null, petFloat: 0,
  petX: 0, petY: 0,
};

let sleepWashLevel = 0; // eased 0..1 night overlay, so dusk/dawn fade in

// Which world the pet visits next — cycles one per visit so every trip is
// somewhere different. Add a scene to scenes.js, drop its id in here.
const SCENE_ROTATION = ["meadow", "beach", "cave", "ship", "room"];

// The beach rolls a fresh mood each visit: usually a bright day, often a
// sunset, sometimes night, and rarely the alien "space" shore. Shells (glowing
// on the space beach) are scattered for the pet to collect.
function setupBeach() {
  const r = Math.random();
  sceneFX.beachSky = r < 0.44 ? "day" : r < 0.74 ? "sunset" : r < 0.9 ? "night" : "space";
  const w = sceneCanvasEl.width || 272;
  const space = sceneFX.beachSky === "space";
  const dayCols = ["#e7c9a0", "#e39a9a", "#d9b3e0"];
  const spaceCols = ["#7ef0e0", "#c88af0", "#8ab6f0"];
  sceneFX.shells = [];
  const n = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    sceneFX.shells.push({
      x: w * (0.1 + Math.random() * 0.45),
      kind: Math.floor(Math.random() * 3),
      col: (space ? spaceCols : dayCols)[i % 3],
      glow: space,
      gone: false,
    });
  }
}

// The uncollected shell nearest the pet, for the shell-hunt act.
function nearestShell() {
  const px = sceneCanvasEl.width / 2 + creatureAnim.x;
  let best = null, bd = 1e9;
  for (const s of sceneFX.shells || []) {
    if (s.gone) continue;
    const d = Math.abs(s.x - px);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function sizeSceneCanvas() {
  sceneCanvasEl.width = screenEl.clientWidth;
  sceneCanvasEl.height = screenEl.clientHeight;
  // The ground rides just above the floating dock. Measuring the dock beats a
  // hardcoded offset: full-bleed on a notched phone, safe-area-inset-bottom
  // lifts the dock ~34px, and a fixed number left the pet standing on top of it.
  const dockEl = document.getElementById("dock");
  const dockTop = dockEl ? dockEl.getBoundingClientRect().top : 0;
  SCENE_GROUND_Y = dockTop
    ? Math.round(dockTop - screenEl.getBoundingClientRect().top) - GROUND_DOCK_GAP
    : sceneCanvasEl.height - (85 + GROUND_DOCK_GAP); // pre-layout fallback
}
window.addEventListener("resize", sizeSceneCanvas);

function dayPhase() {
  return ((state.simClock / AMBIENT_DAY_PERIOD) % 1 + 1) % 1;
}

// Any touch anywhere brings the pet back up close - it comes to see you.
document.addEventListener("pointerdown", () => {
  sceneView.lastTouchAt = performance.now();
  if (sceneView.mode === "scene") exitScene();
});

function exitScene() {
  sceneView.mode = "closeup";
  sceneView.act = null;
  sceneFX.napping = false;
  sceneFX.vig = null;
  sceneFX.petFloat = 0;
  creatureAnim.targetX = 0;
}

function enterScene(now) {
  sceneView.id = SCENE_ROTATION[sceneView.visits % SCENE_ROTATION.length];
  sceneView.visits++;
  sceneView.mode = "scene";
  sceneView.act = null;
  sceneView.nextActAt = now + 900;
  sceneFX.apples = [];
  sceneFX.basketFill = 0;
  sceneFX.castleFill = 0;
  sceneFX.vig = null;
  sceneFX.petFloat = 0;
  if (sceneView.id === "beach") setupBeach();
}

// Dev shortcut (Test Tools): force a specific world right now instead of
// waiting on the idle timer + rotation. Rerolls the beach mood each press,
// so mashing "Beach" is how you preview sunset/night/space on demand.
function jumpToScene(id) {
  if (state.stage === "egg" || state.ranAway) {
    showMessage("Hatch first!");
    return;
  }
  sceneView.id = id;
  sceneView.mode = "scene";
  sceneView.act = null;
  sceneView.nextActAt = performance.now() + 300;
  sceneFX.apples = [];
  sceneFX.basketFill = 0;
  sceneFX.castleFill = 0;
  sceneFX.vig = null;
  sceneFX.petFloat = 0;
  if (id === "beach") setupBeach();
}

// Prop x (absolute px) -> translateX offset from the screen's center,
// clamped so the pet can't press against the bezel.
function spotOffset(x) {
  const lim = Math.max(0, sceneCanvasEl.width / 2 - 38);
  return clamp(x - sceneCanvasEl.width / 2, -lim, lim);
}

const SCENE_ACT_DUR = {
  shakeTree: 3200, eatApple: 1800, pickApples: 6000, chaseButterfly: 5000,
  pondGaze: 4500, nap: 9000, workConsole: 6500, pullLever: 2200, portholeGaze: 5000,
  buildCastle: 6000, chaseWaves: 6500, shellHunt: 900,
  watchTV: 6500, jumpBed: 3500, gazeWindow: 4500,
  mineCrystal: 6000, pokeMushroom: 3600, poolGaze: 4500,
};

// Special "look what happened!" moments (scenes.js paints the visitor). Kept
// kinda common on purpose — VIGNETTE_CHANCE of every act pick becomes one of
// these instead of a routine act. `b` = how the pet engages: chase a moving
// critter, walk over and watch, mine, float (zero-G), or panic (red alert).
const VIGNETTE_CHANCE = 0.42;
const VIGNETTES = {
  meadow: [
    { k: "birdSteal", b: "chase", dur: 5200 },
    { k: "rainbow", b: "watch", dur: 5200, spot: (s, w) => w * 0.5 },
    { k: "swarm", b: "chase", dur: 5200 },
  ],
  beach: [
    { k: "crab", b: "chase", dur: 5600, pinch: true },
    { k: "bottle", b: "watch", dur: 5000, spot: (s, w) => w * 0.42 + 12, chip: true },
    { k: "dolphin", b: "watch", dur: 5200, spot: (s) => s.sea - 46 },
  ],
  cave: [
    { k: "bat", b: "watch", dur: 4600, spot: (s, w) => w * 0.5 },
    { k: "glowFish", b: "watch", dur: 4600, spot: (s) => s.pool - 30 },
    { k: "bigGem", b: "mine", dur: 5600, spot: (s) => s.vein + 22, chip: true },
  ],
  ship: [
    { k: "saucer", b: "watch", dur: 5000, spot: (s) => s.porthole, wave: true },
    { k: "zeroG", b: "float", dur: 5200 },
    { k: "redAlert", b: "panic", dur: 4600, spot: (s) => s.console + 36 },
  ],
  room: [
    { k: "moth", b: "watch", dur: 4600, spot: (s) => s.tv + 18 },
    { k: "mouse", b: "chase", dur: 4600 },
    { k: "wishStar", b: "watch", dur: 4600, spot: (s) => s.window - 30, chip: true },
  ],
};

// Where the pet should aim while chasing a moving visitor (stands a little to
// the side so it doesn't cover the critter it's chasing).
function vigChaseX(k, now, w, p) {
  if (k === "birdSteal") return vigBirdPos(w, p < 0.55 ? p : 0.55).x + 16;
  if (k === "swarm") return vigSwarmX(w, now);
  if (k === "crab") return vigCrabPos(w, p).x + 16;
  if (k === "mouse") return vigMousePos(w, p).x - 14;
  return w * 0.5;
}

function startVignette(entry, now) {
  const w = sceneCanvasEl.width;
  const spots = scenePropSpots(sceneView.id, w);
  sceneFX.vig = { k: entry.k, startAt: now, dur: entry.dur };
  sceneView.act = {
    kind: "vig", vig: entry, startAt: now,
    walking: entry.b === "watch" || entry.b === "mine",
    lastBeatAt: 0, flags: {},
  };
  if (entry.spot) creatureAnim.targetX = spotOffset(entry.spot(spots, w));
  else if (entry.b === "chase") creatureAnim.targetX = spotOffset(vigChaseX(entry.k, now, w, 0));
}

function pickSceneVignette(now) {
  const pool = VIGNETTES[sceneView.id];
  if (!pool) return false;
  startVignette(pool[Math.floor(Math.random() * pool.length)], now);
  return true;
}

// Dev shortcut (Test Tools): force the current scene's vignettes one at a
// time, in order, so mashing the button previews every "look what happened!"
// moment without waiting on VIGNETTE_CHANCE to roll one naturally.
let vigCycleIdx = 0;
function jumpToVignette() {
  if (state.stage === "egg" || state.ranAway) {
    showMessage("Hatch first!");
    return;
  }
  const pool = VIGNETTES[sceneView.id];
  if (!pool) {
    showMessage("No vignettes for this scene yet.");
    return;
  }
  sceneView.mode = "scene";
  sceneView.scale = SCENE_PET_SCALE;
  const entry = pool[vigCycleIdx % pool.length];
  vigCycleIdx++;
  startVignette(entry, performance.now());
  showMessage(`🎬 ${entry.k}`);
}

function runVignette(now, act) {
  const entry = act.vig;
  const w = sceneCanvasEl.width;
  const p = Math.min(1, (now - act.startAt) / entry.dur);
  const spots = scenePropSpots(sceneView.id, w);

  if (entry.b === "chase" && !act.flags.pinched) {
    creatureAnim.targetX = spotOffset(vigChaseX(entry.k, now, w, p));
    if (now - act.lastBeatAt > 300) { act.lastBeatAt = now; triggerSquish(); }
    if (entry.pinch && p > 0.72) {
      act.flags.pinched = true; // yow! — recoil away and let the crab scuttle off
      creatureAnim.targetX = spotOffset(w / 2 + creatureAnim.x + 46);
      triggerReaction();
    }
  } else if (entry.b === "watch" || entry.b === "mine") {
    if (act.walking) {
      if (Math.abs(creatureAnim.x - creatureAnim.targetX) < 8) act.walking = false;
    } else {
      if (entry.wave && !act.flags.waved) { act.flags.waved = true; triggerReaction(); }
      if (entry.b === "mine" && now - act.lastBeatAt > 420) {
        act.lastBeatAt = now; triggerSquish(); sceneFX.crystalHitAt = now;
        for (let k = 0; k < 3; k++) {
          sceneFX.shards.push({
            x: spots.vein + (Math.random() * 20 - 10), y: SCENE_GROUND_Y - 18,
            vx: Math.random() * 2 - 1, vy: -(0.6 + Math.random()),
            col: ["#7ee0ff", "#9a7bff", "#4bd6e6"][k % 3], spawnAt: now,
          });
        }
      }
    }
  } else if (entry.b === "float") {
    sceneFX.petFloat = -Math.sin(p * Math.PI) * 34; // gravity cuts, pet drifts up and settles
  } else if (entry.b === "panic") {
    creatureAnim.targetX = spotOffset(entry.spot(spots, w) + Math.sin(now / 70) * 34);
    if (now - act.lastBeatAt > 220) { act.lastBeatAt = now; triggerSquish(); }
  }

  if (entry.chip && p > 0.45 && !act.flags.chipped) { act.flags.chipped = true; petSpeak("happy"); }

  if (p >= 1) {
    sceneFX.vig = null;
    sceneFX.petFloat = 0;
    sceneView.act = null;
    sceneView.nextActAt = now + 1800 + Math.random() * 3000;
  }
}

function pickSceneAct(now) {
  if (Math.random() < VIGNETTE_CHANCE && pickSceneVignette(now)) return;
  const spots = scenePropSpots(sceneView.id, sceneCanvasEl.width);
  const rested = state.hunger < 45 && state.cleanliness > 55;
  const acts = [];
  if (sceneView.id === "meadow") {
    acts.push({ kind: "shakeTree", spotX: spots.tree + 30, weight: state.hunger > 55 ? 4 : 1 });
    if (state.stage === "adult") acts.push({ kind: "pickApples", spotX: spots.basket + 16, weight: 2.5 });
    acts.push({ kind: "chaseButterfly", spotX: spots.open, weight: 1.5 });
    acts.push({ kind: "pondGaze", spotX: spots.pond - 34, weight: 1 });
    if (rested) acts.push({ kind: "nap", spotX: spots.tree + 38, weight: 2 });
  } else if (sceneView.id === "ship") {
    acts.push({ kind: "workConsole", spotX: spots.console + 36, weight: state.stage === "adult" ? 4 : 2 });
    acts.push({ kind: "pullLever", spotX: spots.lever - 24, weight: 1.5 });
    acts.push({ kind: "portholeGaze", spotX: spots.porthole, weight: 1.5 });
    if (rested) acts.push({ kind: "nap", spotX: spots.open, weight: 1 });
  } else if (sceneView.id === "beach") {
    acts.push({ kind: "buildCastle", spotX: spots.castle + 14, weight: state.stage === "adult" ? 3.5 : 2 });
    acts.push({ kind: "chaseWaves", spotX: spots.sea - 40, weight: 3 });
    const shell = nearestShell();
    if (shell) acts.push({ kind: "shellHunt", spotX: shell.x, weight: 2.5 });
    if (rested) acts.push({ kind: "nap", spotX: spots.palm + 20, weight: 1.5 });
  } else if (sceneView.id === "cave") {
    acts.push({ kind: "mineCrystal", spotX: spots.vein + 22, weight: state.stage === "adult" ? 4 : 2.5 });
    acts.push({ kind: "pokeMushroom", spotX: spots.mushroom, weight: 2 });
    acts.push({ kind: "poolGaze", spotX: spots.pool - 30, weight: 1.5 });
    if (rested) acts.push({ kind: "nap", spotX: spots.open, weight: 1 });
  } else if (sceneView.id === "room") {
    acts.push({ kind: "watchTV", spotX: spots.tv + 34, weight: 3 });
    acts.push({ kind: "jumpBed", spotX: spots.bed, weight: 2 });
    acts.push({ kind: "gazeWindow", spotX: spots.window - 30, weight: 1.5 });
    if (rested) acts.push({ kind: "nap", spotX: spots.bed, weight: 2.5 });
  }
  let total = 0;
  for (const a of acts) total += a.weight;
  let roll = Math.random() * total;
  let chosen = acts[0];
  for (const a of acts) { roll -= a.weight; if (roll <= 0) { chosen = a; break; } }
  sceneView.act = { kind: chosen.kind, walking: true, until: 0, dur: SCENE_ACT_DUR[chosen.kind], lastBeatAt: 0, beats: 0 };
  creatureAnim.targetX = spotOffset(chosen.spotX);
}

function runSceneAct(now) {
  const act = sceneView.act;
  const w = sceneCanvasEl.width;

  if (act.kind === "vig") { runVignette(now, act); return; }

  // the butterfly won't wait around - track it live for the whole chase
  if (act.kind === "chaseButterfly" && !act.walking) {
    creatureAnim.targetX = spotOffset(butterflyPos(now, w).x);
  }
  // dance just ahead of the surf as the tide slides in and out
  if (act.kind === "chaseWaves" && !act.walking) {
    creatureAnim.targetX = spotOffset(beachTideEdge(now, w) - 22);
  }

  if (act.walking) {
    if (Math.abs(creatureAnim.x - creatureAnim.targetX) < 8) {
      act.walking = false;
      act.until = now + act.dur;
      if (act.kind === "nap") sceneFX.napping = true;
      if (act.kind === "pullLever") {
        sceneFX.leverOn = !sceneFX.leverOn;
        sceneFX.leverFlipAt = now;
        triggerSquish();
      }
      if (act.kind === "shellHunt") {
        const s = nearestShell();
        if (s) s.gone = true; // picked it up
        triggerSquish();
      }
    }
    return;
  }

  // rhythmic beats while performing: hop, tap, munch
  const beatEvery = {
    shakeTree: 600, eatApple: 450, pickApples: 900, workConsole: 700,
    buildCastle: 900, jumpBed: 480, mineCrystal: 520, pokeMushroom: 900,
  }[act.kind];
  if (beatEvery && now - act.lastBeatAt > beatEvery) {
    act.lastBeatAt = now;
    act.beats++;
    triggerSquish();
    if (act.kind === "shakeTree") {
      sceneFX.treeShakeUntil = now + 280;
      if ((act.beats === 2 || act.beats === 4) && sceneFX.apples.length < 3) {
        const spots = scenePropSpots("meadow", w);
        sceneFX.apples.push({ x: spots.tree + Math.random() * 36 - 8, y0: SCENE_GROUND_Y - 70, spawnAt: now });
      }
    }
    if (act.kind === "workConsole") sceneFX.consoleTapAt = now;
    if (act.kind === "pickApples") sceneFX.basketFill = Math.min(1, sceneFX.basketFill + 0.18);
    if (act.kind === "buildCastle") sceneFX.castleFill = Math.min(1, sceneFX.castleFill + 0.16);
    if (act.kind === "pokeMushroom") sceneFX.mushroomPulseAt = now;
    if (act.kind === "mineCrystal") {
      sceneFX.crystalHitAt = now;
      const spots = scenePropSpots("cave", w);
      for (let k = 0; k < 3; k++) {
        sceneFX.shards.push({
          x: spots.vein + (Math.random() * 20 - 10), y: SCENE_GROUND_Y - 18,
          vx: Math.random() * 2 - 1, vy: -(0.6 + Math.random()),
          col: ["#7ee0ff", "#9a7bff", "#4bd6e6"][k % 3], spawnAt: now,
        });
      }
    }
  }

  if (now >= act.until) {
    if (act.kind === "shakeTree" && sceneFX.apples.length) {
      // dinner's on the ground - go eat one (cosmetic snack, no sim effect)
      sceneView.act = { kind: "eatApple", walking: true, until: 0, dur: SCENE_ACT_DUR.eatApple, lastBeatAt: 0, beats: 0 };
      creatureAnim.targetX = spotOffset(sceneFX.apples[0].x);
      return;
    }
    if (act.kind === "eatApple") sceneFX.apples.shift();
    if (act.kind === "nap") sceneFX.napping = false;
    sceneView.act = null;
    sceneView.nextActAt = now + 1500 + Math.random() * 3000;
  }
}

function updateSceneDirector(now) {
  // Asleep: settle into the world, curl up, and stop taking direction. This
  // reuses the existing nap visuals (drifting Zs) rather than needing a
  // sleep pose drawn five times over.
  if (isAsleep()) {
    if (sceneView.mode !== "scene") {
      sceneView.mode = "scene";
      sceneView.act = null;
      creatureAnim.targetX = creatureAnim.x;
    }
    sceneFX.napping = true;
    sceneView.act = null;
    applySceneTransform();
    return;
  }
  if (sceneFX.napping && !(sceneView.act && sceneView.act.kind === "nap")) {
    sceneFX.napping = false; // woke up
  }

  // sick pets stay big and up front - they need you to see them
  const roamable = state.stage !== "egg" && !state.ranAway && !state.sick;
  if (!roamable) {
    if (sceneView.mode === "scene") exitScene();
  } else if (sceneView.mode === "closeup") {
    if (now - sceneView.lastTouchAt > SCENE_IDLE_MS) enterScene(now);
  } else {
    if (!sceneView.act && now >= sceneView.nextActAt) pickSceneAct(now);
    if (sceneView.act) runSceneAct(now);
  }

  applySceneTransform();
}

// Feet stay on the ground line in both modes - closeup is just BIGGER,
// not floating. The sprite doesn't fill its canvas (babies leave a big
// transparent margin), so we ground the measured feet, not the canvas edge.
function applySceneTransform() {
  const inScene = sceneView.mode === "scene";
  const targetScale = inScene ? SCENE_PET_SCALE : CLOSEUP_PET_SCALE;
  const targetDy =
    SCENE_GROUND_Y - screenEl.clientHeight / 2 +
    (spritePad.bottom - petCanvasEl.height / 2) * targetScale + 4;
  sceneView.scale += (targetScale - sceneView.scale) * 0.07;
  sceneView.dy += (targetDy - sceneView.dy) * 0.07;
}

// How much transparent canvas hangs below the sprite's feet — measured from
// the pixels every so often, since it varies by species, stage, and gear.
let spritePad = { bottom: 26, at: 0 };

function measureSpritePad(now) {
  if (now - spritePad.at < 1500) return;
  spritePad.at = now;
  const size = petCanvasEl.height;
  const d = petCanvasCtx.getImageData(0, 0, size, size).data;
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x += 2) {
      if (d[(y * size + x) * 4 + 3] > 10) {
        spritePad.bottom = size - 1 - y;
        return;
      }
    }
  }
}

function renderPet() {
  const alive = state.stage !== "egg" && !state.ranAway;
  petCanvasEl.classList.toggle("hidden", !alive);
  petEl.classList.toggle("hidden", alive);
  petEl.classList.toggle("egg-clickable", state.stage === "egg");

  if (!alive) {
    petEl.textContent = state.ranAway ? "🌫️" : "🥚";
    return;
  }

  const now = performance.now();
  updateCreatureAnim(now);

  petCanvasEl.classList.toggle("sick", state.sick);
  petCanvasEl.style.transform =
    `translate(${creatureAnim.x}px, ${sceneView.dy + sceneFX.petFloat}px) scale(${sceneView.scale})`;
  sceneFX.petX = sceneCanvasEl.width / 2 + creatureAnim.x;
  sceneFX.petY = sceneView.mode === "scene" ? SCENE_GROUND_Y - 26 : screenEl.clientHeight / 2;

  const mv = petMovement();
  const squish = creatureAnim.squishUntil > now ? (creatureAnim.squishUntil - now) / 300 : 0;
  const expression = state.sick ? "sick" : currentMood().expression;

  drawCreature(petCanvasCtx, state.genome, {
    bobOffset: Math.sin(now / 400 * mv.speed) * mv.bobAmp,
    flipX: creatureAnim.flipX,
    squish,
    blink: now < creatureAnim.blinkUntil || sceneFX.napping,
    expression,
    adultForm: state.stage === "adult" ? state.adultForm : null,
    reaction: currentReaction(now),
    equipped: state.equipped,
  });
  measureSpritePad(now);
}

function renderPoops() {
  poopLayerEl.innerHTML = "";
  // item.y (0-100) maps onto the ground band, not the whole tall screen. The
  // band spans from just above the ground line to just short of the dock -
  // it used to be ~26px tall, which crammed everything into one strip and had
  // coins and poops constantly landing on each other.
  const groundPct = (SCENE_GROUND_Y / Math.max(1, screenEl.clientHeight)) * 100;
  const bandTop = groundPct - 7;
  const bandHeight = 12;
  for (const poop of poops) {
    const btn = document.createElement("button");
    btn.className = "poop";
    btn.textContent = "💩";
    btn.style.left = poop.x + "%";
    btn.style.top = bandTop + (poop.y / 100) * bandHeight + "%";
    btn.title = "Clean this up";
    btn.addEventListener("click", () => {
      cleanOnePoop(poop.id);
      render();
    });
    poopLayerEl.appendChild(btn);
  }
  // Coins ride the same ground band, so the chore and the reward read as one
  // tidy-up rather than two systems.
  for (const it of groundItems) {
    const btn = document.createElement("button");
    const forage = it.kind === "forage";
    btn.className = forage ? "ground-forage" : "ground-coin";
    btn.textContent = forage ? "🍎" : "🪙";
    btn.style.left = it.x + "%";
    btn.style.top = bandTop + (it.y / 100) * bandHeight + "%";
    btn.title = forage ? "A snack to forage" : `Pick up ${it.value} credits`;
    btn.addEventListener("click", () => {
      collectGroundItem(it.id);
      render();
    });
    poopLayerEl.appendChild(btn);
  }
}

// Everything except the creature itself - safe to call from the
// once-a-second simulation tick without fighting the animation loop below.
function render() {
  renderVisibility();
  renderStageBadge();
  renderStats();
  renderStatusOrbs();
  renderPantry();
  renderPoops();
  renderRooms();
  renderCompanionScreen();
  renderBank();
  renderGear();
  renderShop();
}

// ---- Wire up buttons --------------------------------------------------

// Pressing a mode button unfolds it; pressing the active one again folds shut.
for (const tab of document.querySelectorAll(".room-tab")) {
  tab.addEventListener("click", () => setRoom(activeRoom === tab.dataset.room ? "home" : tab.dataset.room));
}
foldCloseEl.addEventListener("click", () => setRoom("home"));

// The ••• key reopens the sheet to wherever you last were; taps again to close.
document.getElementById("more-btn").addEventListener("click", () => {
  setRoom(activeRoom === "home" ? lastSheetRoom : "home");
});

// Feeding is the heartbeat of the game - hunger warns first ~90% of the time -
// so a plain tap just feeds a Meal. Hold for the Snack/Feast flyout. This makes
// the most frequent action in the game one tap instead of two.
const feedBtnEl = document.getElementById("feed-btn");
const FEED_HOLD_MS = 450;
let feedHold = null;

// NOT stopPropagation: the global pointerdown that zooms the pet back to
// closeup should still fire, so feeding brings it to you like any other tap.
// The flyout's own close handler already ignores taps inside #feed-btn.
feedBtnEl.addEventListener("pointerdown", () => {
  feedHold = setTimeout(() => {
    feedHold = null; // consumed by the hold, so pointerup must not also feed
    feedMenuEl.classList.remove("hidden");
  }, FEED_HOLD_MS);
});
feedBtnEl.addEventListener("pointerup", () => {
  if (!feedHold) return; // the hold already opened the flyout
  clearTimeout(feedHold);
  feedHold = null;
  const kind = bestFoodFor();
  if (!kind) {
    // Nothing to feed. Teach the rule rather than failing silently.
    showMessage("The pantry is empty.");
    setRoom("shop");
    render();
    return;
  }
  feedFromPantry(kind);
  triggerSquish();
  render();
});
feedBtnEl.addEventListener("pointercancel", () => {
  clearTimeout(feedHold);
  feedHold = null;
});
document.addEventListener("pointerdown", (e) => {
  if (!feedMenuEl.contains(e.target) && !document.getElementById("feed-btn").contains(e.target)) {
    feedMenuEl.classList.add("hidden");
  }
});

vetPillEl.addEventListener("click", () => setRoom("vet"));

// The temp pill does the RIGHT thing on its own - under pressure you shouldn't
// have to work out whether you need Warm or Cool, which is what two permanent
// keys asked of you.
tempPillEl.addEventListener("click", () => {
  if (state.temp < comfortWindow().min) warmUp();
  else coolDown();
  triggerSquish();
  render();
});
cleanPillEl.addEventListener("click", () => {
  clean();
  triggerSquish();
  render();
});

for (const btn of document.querySelectorAll(".food-btn")) {
  btn.addEventListener("click", () => {
    if (!feedFromPantry(btn.dataset.food)) return;
    triggerSquish();
    feedMenuEl.classList.add("hidden");
    render();
  });
}

// The shelf shows what you actually own; an empty Feed key teaches the new
// rule by sending you to the shop instead of failing silently.
function renderPantry() {
  for (const btn of document.querySelectorAll(".food-btn")) {
    const k = btn.dataset.food;
    const n = pantry[k] || 0;
    btn.disabled = n === 0;
    const badge = btn.querySelector(".food-count");
    if (badge) badge.textContent = n;
  }
  feedBtnEl.classList.toggle("empty", pantryCount() === 0);

  // An egg has no hunger to show - a full faint ring reads as "no data yet"
  // rather than a partial arc implying the egg is starving.
  // NOTE: --fullness, deliberately not --fill. --fill is the .status-orb's
  // property and custom properties inherit; distinct names mean the two
  // gauges can never cross-contaminate.
  const alive = state.stage !== "egg" && !state.ranAway;
  const fullness = alive ? Math.round(100 - state.hunger) : 100;
  feedBtnEl.style.setProperty("--fullness", fullness);
  feedBtnEl.style.setProperty(
    "--feed-ring",
    fullness > 55 ? "#e8b84b" : fullness > 25 ? "#dda03a" : "#c9822f"
  );
}
document.getElementById("clean-btn").addEventListener("click", () => {
  clean();
  triggerSquish();
  render();
});
document.getElementById("warm-btn").addEventListener("click", () => {
  warmUp();
  triggerSquish();
  render();
});
document.getElementById("cool-btn").addEventListener("click", () => {
  coolDown();
  triggerSquish();
  render();
});
medicineBtnEl.addEventListener("click", () => {
  giveMedicine();
  triggerSquish();
  render();
});
document.getElementById("new-egg-btn").addEventListener("click", () => {
  newEgg();
});
document.getElementById("name-reroll-btn").addEventListener("click", () => {
  nameInputEl.value = randomName();
  nameInputEl.focus();
});
document.getElementById("name-confirm-btn").addEventListener("click", () => {
  const chosen = nameInputEl.value.trim();
  if (chosen) state.name = chosen.slice(0, 16);
  state.needsNaming = false;
  save();
  render();
});
nameInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("name-confirm-btn").click();
});
petEl.addEventListener("click", () => {
  shakeEgg();
  render();
});
// Poking the live creature triggers its species quirk + a giggly little line.
petCanvasEl.addEventListener("click", () => {
  if (isAsleep()) {
    petSpeak("disturbed"); // let sleeping pets lie
    return;
  }
  triggerReaction();
  petSpeak("poked");
});
// Tapping the speech chip toggles the translation on/off.
messageEl.addEventListener("click", (e) => {
  if (!lastVoice) return;
  e.stopPropagation();
  renderSpeech(!messageEl.querySelector(".say-en"));
  clearTimeout(messageTimeout);
  messageTimeout = setTimeout(() => {
    messageEl.textContent = "";
    lastVoice = null;
  }, 5000);
});

// ---- Test tools (beta) ------------------------------------------------
// Live time control so you can fast-forward through aging and drop back to
// real time, plus a one-tap "skip to next stage". This whole panel is a
// developer aid - gate it behind a flag or remove it before any real launch.

function setTimeScale(scale) {
  timeScale = scale;
  for (const btn of document.querySelectorAll(".speed-btn")) {
    btn.classList.toggle("active", Number(btn.dataset.speed) === scale);
  }
}

// Jumps the current stage's timer to done so the next tick grows the pet.
// Only the timed stages (egg..teen) can be skipped; adults are the last stage.
function skipStage() {
  if (STAGE_DURATIONS[state.stage] === undefined) {
    showMessage("Already fully grown.");
    return;
  }
  state.stageEnteredAt = state.simClock - STAGE_DURATIONS[state.stage];
  checkStageProgress();
  render();
}

// Test Tools are dev-only and stay hidden from a normal player. Open them
// with `?dev=1` in the URL, or by tapping the stage badge 5 times fast -
// a quick way in without editing the address bar mid-session.
const testToolsEl = document.getElementById("test-tools");
let devTapCount = 0;
let devTapResetAt = 0;

function setDevMode(on) {
  testToolsEl.classList.toggle("hidden", !on);
}

function setupDevMode() {
  if (new URLSearchParams(location.search).get("dev") === "1") setDevMode(true);
  stageBadgeEl.addEventListener("click", (e) => {
    e.stopPropagation(); // #pet-tag opens Gear; the dev gesture must not
    const now = performance.now();
    devTapCount = now < devTapResetAt ? devTapCount + 1 : 1;
    devTapResetAt = now + 2500;
    if (devTapCount >= 5) {
      devTapCount = 0;
      setDevMode(true);
    }
  });
}

function setupTestTools() {
  for (const btn of document.querySelectorAll(".speed-btn")) {
    btn.addEventListener("click", () => setTimeScale(Number(btn.dataset.speed)));
  }
  document.getElementById("skip-stage-btn").addEventListener("click", skipStage);
  document.getElementById("give-item-btn").addEventListener("click", () => {
    if (inventory.length >= BACKPACK_CAPACITY) {
      showMessage("Backpack is full.");
      return;
    }
    // Drops into the backpack (not auto-equipped) so the equip UI itself gets exercised.
    const item = generateItem(null, 0.6); // slight rare bias so testing is interesting
    inventory.push(item);
    showMessage(`${item.name} added to backpack!`);
    render();
  });
  document.getElementById("add-credits-btn").addEventListener("click", () => {
    bank += 100;
    render();
  });
  for (const btn of document.querySelectorAll(".scene-jump-btn")) {
    btn.addEventListener("click", () => jumpToScene(btn.dataset.scene));
  }
  document.getElementById("vignette-btn").addEventListener("click", jumpToVignette);

  // ---- Jump straight to a state, for testing the systems that otherwise
  // need real hours of waiting or a lucky roll. ----

  document.getElementById("grow-adult-btn").addEventListener("click", () => {
    let guard = 0;
    while (STAGE_DURATIONS[state.stage] !== undefined && guard++ < 6) skipStage();
    showMessage(`${state.name} is fully grown.`);
    render();
  });

  // Sickness is normally 4h into the distress ladder. Straight to it.
  document.getElementById("make-sick-btn").addEventListener("click", () => {
    state.sick = true;
    state.distressSince = state.simClock - DISTRESS_SICK_SECONDS;
    render();
  });

  document.getElementById("make-hungry-btn").addEventListener("click", () => {
    state.hunger = 95;
    render();
  });

  document.getElementById("make-dirty-btn").addEventListener("click", () => {
    state.cleanliness = 15;
    render();
  });

  // The ONLY practical way to see the temp pill - a real event is a ~2-3/day
  // random roll that also refuses to fire while the pet sleeps.
  document.getElementById("weather-btn").addEventListener("click", () => {
    const kind = state.temp > 50 ? "cold" : "heat";
    state.weather = { kind, until: state.simClock + WEATHER_EVENT_MAX };
    state.temp = kind === "cold" ? 10 : 90; // shove it clear of any comfort window
    state.weatherNextAt = state.simClock + WEATHER_COOLDOWN;
    render();
  });

  // catchUpAfterGap is fed REAL elapsed seconds, never scaled by timeScale,
  // so the speed slider can never produce return coins. This can.
  document.getElementById("return-btn").addEventListener("click", () => {
    state.lastTick = Date.now() - 12 * HOUR * 1000;
    catchUpAfterGap(12 * HOUR);
    render();
  });

  setTimeScale(timeScale);
}

// The 6 universal slot buttons are static HTML (only the one anatomy slot
// is built dynamically in renderDoll, since it varies per pet).
function setupGearAndShop() {
  for (const btn of document.querySelectorAll(".slot-btn")) {
    const slot = btn.dataset.slot;
    btn.addEventListener("click", () => handleSlotClick(slot));
    setupDragSource(btn, () => state.equipped[slot], "slot", slot);
  }
  document.getElementById("shop-refresh-btn").addEventListener("click", manualRefreshShop);
  weatherToggleBtnEl.addEventListener("click", toggleWeather);
}

// ---- Status orbs + stat popover ----------------------------------------
// The three needs live as glowing ring-indicators on the device bezel
// (like the icon row on a classic Tamagotchi shell) instead of dashboard
// bars. Ring fill = level, ring color = urgency; tapping an orb opens a
// detail popover (the thermostat dial and weather toggle live in the
// temp one). Out-of-comfort temp pulses the orb - glanceable, never nagging.
const statPopoverEl = document.getElementById("stat-popover");
const popoverBackdropEl = document.getElementById("popover-backdrop");
let openStatPop = null;

// Orb "alert" fires exactly at the warn tier, so the pulse a player sees is
// the same moment the distress clock starts ticking - one consistent signal.
// One orb, one question: does the pet need anything? Keyed off warnStats() -
// the same resolver the pills and the distress clock use - so every signal in
// the game agrees about when something is wrong.
//
// Hunger is checked FIRST on purpose. temp and clean each raise a contextual
// pill; hunger raises none, so this orb IS hunger's warning. If hunger and a
// cold snap are both true the pill is already shouting about the cold, so the
// orb shows the thing nothing else is showing. That's why this order differs
// from pickContextPill()'s worst-first: the pill answers "what's the
// emergency", the orb answers "what does it need".
function overallStatus() {
  const w = warnStats();
  if (w.hunger) return { icon: "🍖", color: "#ff5a5f", fill: 100 - state.hunger, alert: true };
  if (w.tempLow) return { icon: "🥶", color: "#78c6e6", fill: 100, alert: true };
  if (w.tempHigh) return { icon: "🥵", color: "#ff5a5f", fill: 100, alert: true };
  if (w.clean) return { icon: "🫧", color: "#ff5a5f", fill: state.cleanliness, alert: true };
  const worst = Math.min(100 - state.hunger, state.cleanliness);
  return { icon: "🙂", color: worst < 55 ? "#ffcd5b" : "#74cc9c", fill: worst, alert: false };
}

function renderStatusOrbs() {
  const alive = state.stage !== "egg" && !state.ranAway;
  if (!alive && openStatPop) closeStatPopover();
  statusOrbEl.classList.toggle("dormant", !alive);
  if (!alive) {
    statusOrbEl.style.setProperty("--fill", 0);
    statusOrbEl.classList.remove("alert");
    orbIconEl.textContent = "🥚";
    return;
  }
  const s = overallStatus();
  statusOrbEl.style.setProperty("--fill", s.fill);
  statusOrbEl.style.setProperty("--ring", s.color);
  statusOrbEl.classList.toggle("alert", !!s.alert);
  orbIconEl.textContent = s.icon;
}

// One orb means one popover showing ALL three needs. Strictly more information
// than before, where a tap showed you exactly one of them.
function openStatPopover() {
  openStatPop = true;
  statPopoverEl.classList.remove("hidden");
  popoverBackdropEl.classList.remove("hidden");
  for (const sec of statPopoverEl.querySelectorAll(".pop-section")) {
    sec.classList.remove("hidden");
  }
  render();
}

function closeStatPopover() {
  openStatPop = false;
  statPopoverEl.classList.add("hidden");
  popoverBackdropEl.classList.add("hidden");
}

statusOrbEl.addEventListener("click", () => {
  if (openStatPop) closeStatPopover();
  else openStatPopover();
});

// Identity taps through to the pet's own screen. Gear is the only existing
// room that's about THIS pet - it holds the stat block and the portrait.
petTagEl.addEventListener("click", () => setRoom("gear"));
popoverBackdropEl.addEventListener("click", closeStatPopover);
document.getElementById("popover-close").addEventListener("click", closeStatPopover);

// ---- Main loop --------------------------------------------------------

// A corrupt or truncated save must never take the app down with it. This
// used to be a bare load(): one bad byte threw here and every line of init
// below never ran, leaving the hardcoded egg on screen with no sim loop, no
// scene, and no way to reset from inside the app. iOS evicting or truncating
// localStorage, or a kill mid-write, is enough to trigger it.
try {
  load();
} catch (err) {
  console.warn("Save was unreadable - starting a fresh pet.", err);
  localStorage.removeItem(SAVE_KEY);
  state = defaultState();
  poops = [];
}
if (shopStock.length !== SHOP_SLOT_COUNT) refreshShop(); // covers a brand-new save
if (state.stage === "egg" || state.ranAway) activeRoom = "hall";
renderHall();
updateWeatherToggleBtn();
setupDevMode();
setupTestTools();
setupGearAndShop();

// Simulation runs on setInterval, not requestAnimationFrame - browsers
// fully suspend rAF for backgrounded tabs, but this is a pet you're meant
// to leave in the background for hours. setInterval keeps ticking
// (throttled, but alive), which is what lets the push-alert system
// actually notice things while you're not looking.
const GAP_THRESHOLD_SECONDS = 120; // longer than this -> treat as a sleep/suspend, not a normal tick

let lastSimTime = Date.now();
let sinceLastSave = 0;

function simTick() {
  const now = Date.now();
  const gapSeconds = (now - lastSimTime) / 1000;
  lastSimTime = now;

  if (gapSeconds > GAP_THRESHOLD_SECONDS) {
    catchUpAfterGap(gapSeconds * timeScale);
  } else {
    tick(gapSeconds * timeScale);
  }

  shopClock += gapSeconds * timeScale;
  if (shopClock >= nextShopRefreshAt) refreshShop();

  if (weatherEnabled && now >= weatherRefreshAt) {
    weatherRefreshAt = now + WEATHER_REFRESH_MS; // set before the fetch resolves so a slow reply can't cause a refetch storm
    fetchRealWeather();
  }

  render();

  sinceLastSave += gapSeconds;
  if (sinceLastSave >= 5) {
    save();
    sinceLastSave = 0;
  }
}

setInterval(simTick, 1000);

// Idle chatter: every so often (while you're actually looking - this rides
// the rAF loop, which pauses on a hidden tab), the pet says something in its
// own voice, chosen from how it currently feels. Needs speak up more often
// than a happy pet, so it reads as a creature reacting to its state.
let nextChatterAt = 0;

function chatterIntent() {
  const { min, max } = comfortWindow();
  if (state.sick) return "sick";
  if (state.hunger > 70) return "hungry";
  if (state.cleanliness < 30) return "dirty";
  if (state.temp < min - 4) return "cold";
  if (state.temp > max + 4) return "hot";
  const content = state.hunger < 35 && state.cleanliness > 70 ? "happy" : "idle";
  return Math.random() < 0.5 ? content : "idle";
}

function maybeChatter(now) {
  if (state.stage === "egg" || state.ranAway) return;
  if (isAsleep()) return; // the world goes quiet at night
  if (openStatPop || !statPopoverEl.classList.contains("hidden")) return;
  if (messageEl.textContent || messageEl.querySelector(".say-body")) return; // don't talk over a line
  if (now < nextChatterAt) return;
  const needy = state.hunger > 70 || state.cleanliness < 30 || state.sick;
  nextChatterAt = now + (needy ? 9000 : 16000) + Math.random() * 9000;
  petSpeak(chatterIntent());
}

// The creature's bob/blink/wander is purely cosmetic animation - fine to
// let it pause when the tab isn't visible, since nobody's watching it then.
function animationFrame() {
  const now = performance.now();
  if (sceneCanvasEl.width !== screenEl.clientWidth) sizeSceneCanvas();
  sceneFX.weather = state.weather ? state.weather.kind : null;
  // Ease the night wash so dusk/dawn fade rather than snap.
  sleepWashLevel += ((isAsleep() ? 1 : 0) - sleepWashLevel) * 0.03;
  sceneFX.sleepWash = sleepWashLevel;
  updateSceneDirector(now);
  drawScene(sceneCtx, sceneCanvasEl.width, sceneCanvasEl.height, sceneView.id, dayPhase(), now, sceneFX);
  renderPet();
  maybeChatter(now);
  requestAnimationFrame(animationFrame);
}

render();
sizeSceneCanvas();
renderPet();
requestAnimationFrame(animationFrame);
