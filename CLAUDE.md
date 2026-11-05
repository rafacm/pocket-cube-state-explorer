# Pocket Cube State Explorer: notes for Claude

A 3D explorer of all 3,674,160 states of the 2×2×2 cube. TypeScript (strict) + Vite + Three.js r147,
no UI framework, no CSS framework. Runs as a standalone page (`index.html`) and as the
`<pocket-cube-explorer>` web component (`src/element.ts`). Read `README.md` for the user-facing
description.

## Commands (bun is the package manager and test runner; there may be no `node`)

- `bun run dev` / `bun run build` / `bun run preview`: the build writes the site to `dist/` and the
  embed bundle to `dist/embed/pocket-cube-explorer.js` (second Vite config, `vite.embed.config.ts`).
- `bun run typecheck` (tsc, strict), `bun run test` (unit tests in `tests/`, ~4 s),
  `bun run e2e` (Playwright in `e2e/`: builds, serves with `vite preview`, drives headless Chromium).
- `bun run screenshots [scene ...]`: renders `docs/screenshots/*.png` and `public/og.png` (the
  link-preview image) from `dist/`. Scenes are listed in `scripts/screenshots.ts`.
- CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, build and e2e on pushes to main and PRs.

## Working with the owner

- They try changes in a browser and give visual feedback. Explain the *why* of anything odd they see
  before changing it; offer options when there is a real trade-off.
- Small commits that are easy to review; keep the app working after each one.
- Deploys: Vercel builds every push (https://pocket-cube-state-explorer.vercel.app is `main`, i.e.
  production; branches get preview URLs). Work on a branch and open a PR; the owner merges.
- Preferences learned so far: paper-white stage (`--stage: #F6F4EF`), calm defaults, slow walks
  (about 2 s per step with the camera following), labels only when readable, nothing moves until
  asked (clicking selects; Solve / Play from solved walk), everything deselectable (click empty
  space, Esc), no needless GPU work when idle. Light and dark mode for the whole explorer (cubes and
  lines too) is wanted later; the stage is paper white in both themes today.
- An older single-file copy was published as a claude.ai artifact
  (https://claude.ai/artifact/Gk5QzYF7cJg12XfvtTT2kt). It predates the TypeScript version.

## Code map (`src/`)

One explorer instance is one `Explorer` object (`explorer/types.ts`) holding all its state. Modules
are plain functions taking it as the first argument (`onState(x)`, `grow(x)`, ...); modules may
import each other freely (only functions, nothing runs at import time).

- `model/` – pure cube logic, no DOM or Three.js, unit-tested: stickers and moves (`cube.ts`),
  canonical orientation, net and facelet strings (`net.ts`), compact state numbers and move tables
  (`numbering.ts`: `encodeKey`/`decodeCode`, `PT`/`OT`, `applyCode`, `decodeStickersInto`), parsing
  scrambles and facelet strings (`parse.ts`), published layer totals (`index.ts`).
- `graph/` – the cube layers as data: nodes and links (`graph.ts`), growing a layer (`expand.ts`,
  data only, unit-tested), shortest routes (`routes.ts`), sphere radii (`radii.ts`), force layout
  (`layout.ts`), distances of all states and routes from them (`distances.ts`).
- `outer/` – the dot layers: the job that builds one (`dots.ts`, phases
  `search → (count) → even → cells → place → relax → reveal`, a time-boxed slice per frame),
  cube-map placement maths (`placement.ts`), colour by routes in (`colors.ts`), bundled links
  (`bundles.ts`).
- `render/` – the graph scene and line sets (`scene.ts`), the instanced cube shader
  (`cube-shader.ts`), zoom-in cubes for nearby dots (`detail.ts`), labels (`labels.ts`), selection
  box and route tubes (`markers.ts`), picking (`picking.ts`), wheel zoom, panning and camera flights
  (`navigation.ts`).
- `cube/` – the live cube in the panel and its turn queue (`live-cube.ts`), Solve / Play from solved
  / Walk the loop and walk timing (`walks.ts`).
- `ui/` – the markup (`template.html`), typed element lookup inside the container (`elements.ts`),
  panel controls, census and totals (`panel.ts`), net and orientation (`net.ts`), routes list
  (`routes.ts`), find a state (`find.ts`), progress line (`status.ts`).
- `explorer/` – selection and highlights (`selection.ts`), where states are drawn (`locate.ts`),
  growing and Start over (`grow.ts`), the frame loop with on-demand drawing (`frame.ts`), settings,
  theme (3D colours read from the CSS tokens), RNG, listeners that `destroy()` removes (`events.ts`).
- `explorer.ts` – `createExplorer(container, { keyboard })` → `{ destroy }`. `main.ts` mounts it on
  the standalone page; `element.ts` is the web component.
- `styles/` – `tokens.css` (on `:root, :host`), `layout.css`, `stage.css`, `panel.css`, combined by
  `explorer.css`; `page.css` is only for the standalone page. The narrow layout is a container query
  (`.pcse` is the container), so it also applies to an explorer in a narrow column.

## Model facts (verified; `bun run test` re-checks them)

- Canonical orientation: the yellow-orange-blue corner at down-left-back, yellow down. The graph
  grows with U, R, F (± and 2) only, which never move that corner. D/L/B and x/y/z turns exist for the
  user; states are compared via `canonical()`.
- Colours: U white, F green, R red, D yellow, L orange, B blue (WCA scrambling orientation).
- Facelet strings: faces in order U R F D L B, each read row by row as in the net, letters W Y R O G B.
- State number = rank of the 7 movable corners' order (7! = 5,040) × 729 + twist of 6 corners (3⁶).
  Corner slots are listed in one consistent turning order so the twist sum is invariant mod 3.
- Layer sizes, quarter turns: 1, 6, 27, 120, 534, 2256, 8969, 33058, 114149, 360508, 930588,
  1350852, 782536, 90280, 276 (14 layers). Half turns: 11 layers, 2,644 at distance 11.
- Quarter-turn graph is bipartite: no links inside a layer; every link joins neighbouring layers.
  11,022,480 links, 3,674,159 of them a tree, 7,348,321 extra (loops). Three layers: 154 states,
  168 links.
- All 276 states of layer 14 have all 6 neighbours in layer 13.

## Rendering and layout decisions (and why)

- Layers 0–7 (0–5 with half turns) are real objects with links and a force layout; outer layers are
  `THREE.Points` with typed arrays (`Dots`: `dist/map/codes/parent/pos/pin/col/patch`, ≈80 MB).
- Radii: every layer's sphere is sized for its states (cube layers 11.25 units apart, dot layers 9 in
  their most crowded patch), and grows ≥ 1.25× per layer. The first dot layer is evened out once
  (`evenOut`): evening out every layer pushed states thousands of units from their parents.
- Dot placement: patches on a cube map (`faceUV`/`faceDir`), states laid out inside the patch they
  want, jittered, crowded patches relaxed (8-cell hash, `RELAX_D` 7.2). Result: no overlapping
  3.6-unit cubes, median drift from parent ≈ 20–45 units. Rank matching along a single Hilbert curve
  was tried and rejected (drift 600–2,600 units).
- The layout is deterministic: one seeded `Rng` per explorer, reset on Start over. Keep the order of
  random draws when changing code (e.g. a new node's birth time is drawn before its position).
- Labels: plain link labels only when both end cubes are ≥ 14 px on screen, longest first, no
  overlaps. Boxed (clickable) turn labels only after the user clicks a cube; click again hides them;
  `boxesShown()` decides from the current selection every frame.
- Drawing on demand: the graph redraws only on camera motion, layout, jobs, flights, cube animation,
  recent input inside the explorer (600 ms) or `x.renderDirty`. Set `x.renderDirty = true` when
  changing anything visible without user input. The automatic spin stops 25 s after start.
- Route tubes and the selection box keep a constant size on screen (scaled by camera distance).
- Embedding: all DOM lookups go through the container; window-level key listeners act only for keys
  inside the explorer or with the pointer over it (`keyboard: 'explorer'`), and read the real target
  with `composedPath()` (shadow DOM retargets `e.target`). `@font-face` does not work in a shadow
  root, so the element adds the Google Fonts stylesheet to the document.

## Pitfalls hit before

- OrbitControls `update()` returns whether the camera moved; on-demand drawing relies on that.
- Typed scratch buffers at module level (layout hash, relax hash, detail candidates) are shared by
  all explorers on a page; that is safe only because each use finishes within one synchronous call.
- Vite's library mode keeps whitespace in ES output; the embed config forces full minification.

## Testing without a GPU

- Headless Chromium renders with SwiftShader (`scripts/chromium.ts` has the flags). It is slow:
  building a large dot layer takes minutes, because each 12 ms job slice waits for a slow frame.
- On a machine without root (e.g. the Raspberry Pi this was developed on), `scripts/headless-deps.sh`
  unpacks Chromium's missing libraries and fonts into `.cache/headless/`; the scripts and the
  Playwright config pick them up automatically.
- Playwright locators pierce open shadow roots; scope them to one element when a page has two
  explorers (they use the same ids inside).
