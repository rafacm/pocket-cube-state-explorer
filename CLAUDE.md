# Pocket Cube State Explorer: notes for Claude

A single-page, no-build 3D explorer of all 3,674,160 states of the 2×2×2 cube. Everything is in
`index.html` (≈2,500 lines: CSS, markup, one IIFE script). Three.js r147 UMD + OrbitControls from
jsDelivr; nothing else. Read `README.md` for the user-facing description.

## Working with the owner (Rafa)

- He tries changes in a browser and gives visual feedback. Explain the *why* of anything odd he sees
  before changing it; offer options when there is a real trade-off.
- He pushes to GitHub himself (Claude's session could not push to this repo). Write files, tell him
  the commit/push commands.
- A live copy is published as a claude.ai artifact (https://claude.ai/artifact/Gk5QzYF7cJg12XfvtTT2kt).
  That copy is a page *fragment*: the artifact viewer adds `<!doctype>`, `<head>` and a small reset.
  `index.html` here is the standalone version (it adds that reset itself). Keep the two in sync if both
  are used.
- Preferences learned so far: paper-white stage (`--stage: #F6F4EF`), calm defaults, slow walks
  (about 2 s per step with the camera following), labels only when readable, nothing moves until he
  asks (clicking selects; Solve / Play from solved walk), everything deselectable (click empty space,
  Esc), and no needless GPU work when idle.

## Map of index.html (search for the `// ----------` headings)

- `/*MODEL-START*/ … /*MODEL-END*/` – pure cube logic, no DOM/Three.js (tests run this part):
  stickers and moves, canonical orientation, net/facelet strings, **compact state numbers**
  (`encodeKey`/`decodeCode`, `PT`/`OT` move tables, `applyCode`), fast sticker decode, published
  layer totals `QTM_TOTALS` / `HTM_TOTALS`.
- settings, radii (`computeRadii`), graph data, graph scene (instanced cube shader `nodeVS/nodeFS`).
- `/*LAYOUT-START*/ … /*LAYOUT-END*/` – force layout of the cube layers (`spawnPos`, `tick`).
- routes / loops (`routes`, `preds`, `computeHighlight`), live cube + animation queue (`queue`,
  `startNext`, `stepCube`), Solve / Play / walk timing (`pushWalk`, speed slider).
- outer layers as dots: `initDots`, `startDotLayer`, `runJob` phases
  `search → (count) → even → cells → place → relax → reveal`, `finishJob`.
- colour by routes in (`paintLayer`, `renderRoutesIn`), bundled links (`buildBundles`).
- zoom-in cubes: per-layer grid index (`buildLayerIndex`), `updateDetail`, `buildDetailLinks`.
- finding a state (`parseState`, `findState`), UI, net, picking, labels (`placeLabels`,
  `updateEdgeLabels`), markers, and the frame loop (`frameBody`, on-demand drawing).

## Model facts (verified; `node tests/model-check.mjs` re-checks them in ~3 s)

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
  11,022,480 links, 3,674,159 of them a tree, 7,348,321 extra (loops).
- All 276 states of layer 14 have all 6 neighbours in layer 13.

## Rendering and layout decisions (and why)

- Layers 0–7 (0–5 with half turns) are real objects with links and a force layout; outer layers are
  `THREE.Points` with typed arrays (`dots.dist/map/codes/parent/pos/pin/col/patch`, ≈80 MB total).
- Radii: every layer's sphere is sized for its states (cube layers 11.25 units apart, dot layers 9 in
  their most crowded patch), and grows ≥ 1.25× per layer. The first dot layer is evened out once
  (`evenOut`): evening out every layer pushed states thousands of units from their parents.
- Dot placement: patches on a cube map (`faceUV`/`faceDir`), states laid out inside the patch they
  want, jittered, crowded patches relaxed (8-cell hash, `RELAX_D` 7.2). Result: no overlapping
  3.6-unit cubes, median drift from parent ≈ 20–45 units. Rank matching along a single Hilbert curve
  was tried and rejected (drift 600–2,600 units).
- Labels: plain link labels only when both end cubes are ≥ 14 px on screen, longest first, no
  overlaps. Boxed (clickable) turn labels only after the user clicks a cube; click again hides them;
  `boxesShown()` decides from the current selection every frame.
- Drawing on demand: the graph redraws only on camera motion, layout, jobs, flights, cube animation,
  recent input (600 ms) or `renderDirty`. Set `renderDirty = true` when changing anything visible
  without user input. The automatic spin stops after 25 s.
- Route tubes and the selection box keep a constant size on screen (scaled by camera distance).

## Pitfalls hit before

- All top-level names share one scope: a later `function x` silently replaces an earlier one (an
  `encodeKey` clash once broke every outer layer). Check for duplicate names after adding functions.
- Startup order: top-level code (e.g. `paintCube(curKey)`, `resize()`, `startOver()`) runs before
  later `let` declarations exist; a `let` used at startup must be declared above it (TDZ error kills
  the page). Same for `$` (defined in the UI section): early listeners use `document.getElementById`.
- Code run through `eval` in Node is 5–10× slower than normal; use `new Function` or a generated
  script when timing anything.
- OrbitControls `update()` returns whether the camera moved; on-demand drawing relies on that.

## Testing without a GPU

- `node tests/model-check.mjs` – model correctness (no dependencies).
- Browser smoke tests: headless Chrome via Playwright works, but CDNs may be blocked in sandboxes.
  A permissive Proxy stand-in for `THREE` lets the page's logic run (buttons, search, growth, no
  drawing); make its `OrbitControls.update` return `false` and give `THREE.MOUSE` real values.
  Watch `pageerror`. Visual checks need a real browser (the owner can share a Chrome window).
