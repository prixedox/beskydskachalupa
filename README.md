# Beskydská chalupa – website and house tour

Virtuální prohlídka domů z 360° fotek. Static site (Vite + Photo Sphere Viewer).

## Run

```powershell
npm install
npm run dev          # http://localhost:5173/?house=trojanovice
npm test             # unit tests
npm run test:e2e     # Playwright smoke tests (first run: npx playwright install chromium)
npm run build        # static output in dist/
```

URL parameters: `house=<id>` (house folder), `room=<id>` (start room), `edit` (editor).

## Adding a new house

1. Put 360° photos (2:1 equirectangular JPG) and other photos (exterior) in one folder.
2. Optional: create `houses-src/<id>.mapping.json` mapping file names to `{ "id", "name" }` (see `trojanovice.mapping.json`).
3. `node scripts/prepare-house.mjs <photoFolder> <id> --map houses-src/<id>.mapping.json --title "Název domu"` (`--title` sets the tour title, default is the id; mapping ids must match `a-z0-9-` and be unique; the title can also be changed later in the editor field "Název prohlídky").
4. `node scripts/render-plan.mjs <plan.pdf> <id> --crop x,y,w,h` (crop as page fractions; check `plan.png`, adjust).
   A house with several floors takes one PDF per floor, drawn side by side into one `plan.png`:
   `node scripts/render-plan.mjs <přízemí.pdf> <podkroví.pdf> <id> --rotate 270 --crop … --crop … --floor "Přízemí" --floor "Podkroví"`
   (`--rotate` turns sideways drawings upright; one `--crop` per floor, given as the turned page looks;
   one `--floor` name per PDF, written to `plan.floors` and shown as tabs on the plan).
   A "floor" can also be an image, for example a garden map: `houses-src/trojanovice.zahrada.svg`
   is drawn in metres and added as the third part, `Zahrada`.
5. `npm run dev`, open `/?house=<id>&edit`:
   - per room: pick target → "Přidat průchod" → click the doorway,
   - "Umístit na plán" → click the room on the plan,
   - face the top side of the plan → "Nastavit sever",
   - fix everything in "Kontrola".
6. "Export tour.json" → replace `public/houses/<id>/tour.json`, commit.

Optional fields of a room in `tour.json`, written by hand:

- `floor`: name of the floor, one of the names in `plan.floors` (for example `"Přízemí"`). The plan
  then shows the floor of the current room, with tabs to look at the others.
- `startYaw`: where the view points (radians) when the tour opens in that room.
- `fixedView: true`: walking in also turns to `startYaw` instead of keeping the walking direction
  (garden spots are far apart, so the direction means little there).
- A room without `planPos` (garden, drone photo) hides the minimap while you are in it.

The cottage, `trojanovice`, uses all three.

## 3D model

`/?house=<id>&view=3d` shows a 3D model of the house: a dollhouse view from above ("Shora"),
the exterior with the roof ("Zvenku") and a first-person walk ("Procházet": drag to look,
W A S D / arrow keys to walk, click the floor to go there). Room labels and the rings on the
floor open that room's 360° photo; the "3D" button in the 360° tour opens the model.
The button only appears when the house has a `model.json`.

The model is `public/houses/<id>/model.json`, written by hand from the floor plan's
dimension lines (millimetres, origin at the outer top-left corner of the house, x to the
right, z down the plan):

- `walls` and `openings` (doors and windows with `sill` and `head` heights) as plan rectangles;
  walls are cut around the openings automatically,
- `rooms` with the tour room `id` and their floor rectangles, optional tile `lining`,
- `roofs` (hip, or `gable`), `posts`, `slabs`, `materials`,
- `plan.originPx` / `plan.mmPerPx`: where the house corner is in `plan.png` and the pixel
  size, so the tour's `planPos` maps onto the model.

Textures (floor, tiles, roof, grass) are cut out of the house's own photos:

```powershell
node scripts/sample-textures.mjs <id> --raw   # writes public/houses/<id>/textures/
```

`houses-src/<id>.textures.json` says where each one comes from: a top-down floor patch or a
straight view out of a panorama (angles in degrees, distances in metres), or a pixel crop of
a normal photo. `--raw` also writes the patches before they are made seamless, to check them.

## Website

`site/` is the new design of beskydskachalupa.cz: plain HTML, CSS and JS, no build step. It
embeds the tour from `prohlidka/` and is marked `noindex` until it replaces the live site.

`node scripts/deploy-pages.mjs` publishes everything to GitHub Pages (branch `gh-pages`):

- `/beskydskachalupa/` – the website from `site/`,
- `/beskydskachalupa/prohlidka/` – this tour app.

Split from the former `housetour` repository; the Vikymont preview lives in `vikymont`.
