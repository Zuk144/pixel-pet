# Pixel Pet

A cozy pocket creature you raise, dress, and eventually send on adventures —
Tamagotchi's heart, an RPG's depth, worn lightly.

Feed it, poke it, watch it wander. Every pet is procedurally generated: its
species, body, markings, coat, movement personality, base stats, temperature
comfort window — and its own alien language, a per-pet cipher that always
renders the same word as the same glyph, so it's learnable.

## Running it

No build step, no dependencies, no npm. It's plain `<script>` tags. Serve the
folder with anything:

```bash
ruby -run -e httpd . -p 8124
```

Then open <http://localhost:8124>.

## Structure

| File | Owns |
|---|---|
| `creature.js` | Procedural DNA generation + creature rendering |
| `speech.js` | The pet-language engine (word→glyph cipher, phrase bank) |
| `items.js` | Procedural equipment + drawing it onto the creature |
| `scenes.js` | Pixel-art worlds: backdrops, props, vignette art |
| `main.js` | State, simulation loop, UI, economy, the scene director |

Scripts load in that order and each may reference the ones before it.

## Working on it

Read `CLAUDE.md` first — it documents the deliberate decisions (why the sim runs
on `setInterval` and not `requestAnimationFrame`, why `simClock` never reads
`Date.now()`, why the distress ladder is deterministic) and the gotchas that
look like tidyable style but aren't.

One rule that bites every time: **bump the `?v=N` query strings in `index.html`
whenever you edit a `.js` or `.css` file**, or the browser will serve you a
stale copy and you'll debug a change that isn't loaded.
