# Cannon Game

A small browser-based cannon-and-target game.

## Project layout

- `index.html` — app entry point.
- `src/game.js` — game setup and drawing logic.
- `src/style.css` — page and canvas styling.
- `public/assets/sprites/` — place original game sprites here.
  - `cannon/` — cannon body, barrel, wheels, etc.
  - `targets/` — target images.
  - `projectiles/` — cannonball and projectile images.
  - `effects/` — explosions, smoke, impact effects.
  - `backgrounds/` — scene and background images.

## Run locally

This is currently a dependency-free static web app. Open `index.html` in a browser, or serve the repository with a local static server.

## Adding sprites

Copy your sprite files into the appropriate folder under `public/assets/sprites/`. Keep the original files unchanged: do not resize, recolor, crop, recompress, or otherwise edit them. Reference them from the app using paths such as:

```js
const cannonImage = new Image();
cannonImage.src = "public/assets/sprites/cannon/cannon.png";
```

The example filename is illustrative; use the exact filename of each uploaded sprite.

## Current prototype

The page displays a white game area with a simple circle as a temporary drawing test. This placeholder can be replaced as the game is built.
