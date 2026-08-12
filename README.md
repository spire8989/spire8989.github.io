# Quest for the Holy Grail — HTML5 Prototype

This repository is a minimal, browser-only foundation for a portrait game. It intentionally contains no game mechanics, frameworks, build tools, backend code, art, or third-party libraries.

## Project layout

- `index.html` defines the game page and its small placeholder interface. Think of it as the initial level/UI hierarchy.
- `css/style.css` controls presentation, the fixed 9:16 game viewport, responsive scaling, and input feedback.
- `js/game.js` owns startup, input binding, game state, and the `requestAnimationFrame` game loop. Its `update()` and `render()` functions are the main extension points.
- `assets/` is reserved for future images, audio, fonts, and other game content.
- `vendor/` is reserved for any third-party browser libraries added later. It is empty for now.

## Run locally

The project has no install or build step. From a terminal opened in this folder, run:

```sh
python -m http.server 8000
```

If `python` is not recognized on Windows, the Python launcher often works instead:

```sh
py -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000) in Chrome or Edge. Stop the server with `Ctrl+C` in the terminal.

## Why use a local HTTP server?

Double-clicking `index.html` loads it through a `file://` URL. Browsers apply extra security restrictions to local files, so features commonly used by games—such as loading JSON, modules, audio, or other assets—may fail even though the same code works when published. Serving the folder over `http://localhost` makes development behave much more like a real website and avoids those surprises.

## Find JavaScript errors

In Chrome or Edge, open DevTools with `F12` or `Ctrl+Shift+I`, then select the **Console** tab. JavaScript errors appear there in red, usually with a clickable file name and line number. The **Sources** tab is useful for setting breakpoints and stepping through `js/game.js`.
