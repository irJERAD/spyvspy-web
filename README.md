# Spy vs Spy — The Corridor

A hidden-information duel in five rooms, built from the Corridor design spec. Plain HTML/CSS/JS — no build step, no dependencies.

## Files

- `index.html` — page structure
- `styles.css` — Classical design-system tokens + game layout
- `app.js` — the game engine (ported faithfully from the design doc's authoritative rules script) and DOM rendering

## Run locally

Any static file server works, e.g.:

```
npx serve .
```

or just open `index.html` directly in a browser.

## Deploy

### Vercel

```
npx vercel --prod
```

Or connect the repo/folder at vercel.com/new — it's a static site, so no framework preset or build command is needed (output directory: `.`).

### Netlify

```
npx netlify deploy --prod
```

Or drag-and-drop this folder at app.netlify.com/drop. `netlify.toml` already points the publish directory at the project root.

## Traps

Spend a round to string a tripwire in your room (one live trap each, hidden from the other side). If the enemy ends a round in a trapped room it springs for 3 wounds and exposes him. Listen within two rooms reveals his trap. `TRAP_DMG` is set at the top of `app.js`.

## Tuning

Balance knobs live at the top of `app.js` in `CONFIG`: `startingHealth` (10), `pistolDelay` (1 round), `pistolAmmo` (3), `luckJitter` (8 points). These match the defaults from the design doc's exposed tweaks.
