// ---------------------------------------------------------------------------
// Pet language — a generative, deterministic conlang.
//
// Design: emotion ALWAYS reads (every line carries a mood emoji), so an
// untranslated pet is still endearing, not alien. Meaning comes from a small
// intent-keyed English phrase bank; the alien glyphs are generated in real
// time by a word->glyph cipher SEEDED BY THE PET'S DNA. Because the cipher is
// deterministic, the same English word always makes the same glyph-word for a
// given pet ("that squiggle always means food") — which is what makes the
// language learnable, and what makes every pet's language uniquely its own.
//
// Translation is layered on in main.js (a per-pet bond level reveals words),
// so this file just produces { glyph, english, emo } for any intent.
// ---------------------------------------------------------------------------

// Each species "speaks" in a different glyph flavor, tied to its DNA vibe.
// All chosen from widely-supported Unicode so they render on iOS/Mac (no tofu).
// All drawn from the Geometric Shapes / Dingbats blocks, which render on
// essentially every system (no "tofu" boxes) while still giving each species
// a distinct visual voice.
const SPEECH_GLYPHS = {
  blob: "●○◍◉◎◐◑◒◓⬤".split(""),      // round & bubbly
  lizard: "▲△▼▽◆◇◣◢◤◥".split(""),    // angular runes
  fluff: "★☆✦✧✱✳❋✺✽❀".split(""),     // soft sparkles
  squid: "◜◝◞◟◠◡～〜≈∿".split(""),    // flowing waves
};
const SPEECH_FALLBACK = SPEECH_GLYPHS.blob;

// Little sentence-ending flourishes so lines read as "language", not a blob.
const SPEECH_PUNCT = ["", "", "~", "·", "…"];

// Phrase bank keyed by intent. `t` = English meaning, `e` = mood emoji that
// always shows so feeling reads even with zero translation.
const SPEECH_LINES = {
  happy: [
    { t: "I love you!", e: "🥰" },
    { t: "Best day ever!", e: "😄" },
    { t: "You're my favorite.", e: "🥰" },
    { t: "I feel great!", e: "😊" },
  ],
  idle: [
    { t: "La la la~", e: "🎵" },
    { t: "What shall we do?", e: "🙂" },
    { t: "Just vibing.", e: "😌" },
    { t: "Wanna play?", e: "😃" },
    { t: "Hello, friend!", e: "👋" },
  ],
  hungry: [
    { t: "I'm getting hungry...", e: "🥺" },
    { t: "Snack time?", e: "🍽️" },
    { t: "My tummy rumbles.", e: "😔" },
  ],
  dirty: [
    { t: "I feel icky.", e: "😣" },
    { t: "Bath time, please?", e: "🛁" },
    { t: "Ew, so messy!", e: "😖" },
  ],
  cold: [
    { t: "Brrr, chilly!", e: "🥶" },
    { t: "I'm shivering...", e: "🥶" },
    { t: "Warm me up?", e: "❄️" },
  ],
  hot: [
    { t: "So warm...", e: "🥵" },
    { t: "I'm overheating!", e: "🥵" },
    { t: "Need a breeze.", e: "💨" },
  ],
  sick: [
    { t: "I don't feel good...", e: "🤒" },
    { t: "Achoo!", e: "🤧" },
    { t: "My tummy hurts.", e: "😷" },
  ],
  fed: [
    { t: "Yummy!", e: "😋" },
    { t: "Delicious, thank you!", e: "😋" },
    { t: "So good!", e: "🤤" },
  ],
  cleaned: [
    { t: "Ahh, fresh!", e: "✨" },
    { t: "Squeaky clean!", e: "🫧" },
  ],
  warmed: [{ t: "Cozy now!", e: "☺️" }, { t: "Much better!", e: "😌" }],
  cooled: [{ t: "Refreshing!", e: "😎" }, { t: "Ahh, cool!", e: "😌" }],
  cured: [{ t: "All better!", e: "😊" }, { t: "Thank you!", e: "🥹" }],
  poked: [
    { t: "Hehe, that tickles!", e: "😆" },
    { t: "Boop!", e: "😝" },
    { t: "Hi hi!", e: "😄" },
  ],
  sleepy: [
    { t: "Getting sleepy...", e: "🥱" },
    { t: "Goodnight, friend.", e: "🌙" },
    { t: "Time to curl up.", e: "😴" },
  ],
  waking: [
    { t: "Good morning!", e: "🌅" },
    { t: "That was a good nap.", e: "😊" },
    { t: "I feel recharged!", e: "✨" },
  ],
  disturbed: [
    { t: "Mmf... five more minutes.", e: "😪" },
    { t: "Shhh, I'm sleeping.", e: "🤫" },
    { t: "Zzz...", e: "😴" },
  ],
};

function speechHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

// A stable numeric fingerprint for a pet, derived from DNA fields that never
// change after birth — no save migration needed, and legacy pets work.
function speechSeed(genome) {
  const key = (genome && genome.species) + "|" + JSON.stringify(genome && genome.baseStats) +
    "|" + (genome && genome.palette && genome.palette.primary);
  return speechHash(key);
}

// Deterministic: same (word, pet) always yields the same glyph-word.
function glyphWord(word, set, seed) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "") || word;
  const base = speechHash(clean + "~" + seed);
  const len = 2 + (clean.length % 4); // 2-5 glyphs, roughly tracks word length
  let out = "";
  for (let i = 0; i < len; i++) {
    out += set[(base + i * 2654435761 + clean.charCodeAt(i % clean.length)) % set.length];
  }
  return out;
}

// Turns an English phrase into this pet's alien script, word for word.
function toGlyphs(english, genome) {
  const set = SPEECH_GLYPHS[genome && genome.species] || SPEECH_FALLBACK;
  const seed = speechSeed(genome);
  const glyphs = english
    .split(/\s+/)
    .map((w) => glyphWord(w, set, seed))
    .join(" ");
  const punct = SPEECH_PUNCT[speechHash(english + seed) % SPEECH_PUNCT.length];
  return glyphs + punct;
}

// Public: pick a line for an intent and render it in this pet's voice.
// Returns { glyph, english, emo, words } where `words` is the per-word
// [{en, gl}] pairing that a future translation UI can reveal progressively.
function petVoice(intent, genome) {
  const pool = SPEECH_LINES[intent] || SPEECH_LINES.idle;
  const line = pool[Math.floor(Math.random() * pool.length)];
  const set = SPEECH_GLYPHS[genome && genome.species] || SPEECH_FALLBACK;
  const seed = speechSeed(genome);
  const words = line.t.split(/\s+/).map((w) => ({ en: w, gl: glyphWord(w, set, seed) }));
  return { glyph: toGlyphs(line.t, genome), english: line.t, emo: line.e, words };
}
