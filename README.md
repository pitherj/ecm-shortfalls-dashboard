# EcM Fungi in Canada — Shortfalls Dashboard

**Live:** https://pitherj.github.io/ecm-shortfalls-dashboard/

An interactive, dependency-light **JavaScript** dashboard that summarizes the
**seven biodiversity data shortfalls** (Hortal et al. 2015) for **ectomycorrhizal
(EcM) fungi in Canada**, as quantified in the manuscript *"An assessment of
biodiversity data shortfalls for ectomycorrhizal fungi in Canada"* (Eckert et al.,
submitted to *FACETS*).

It is a **companion to the paper, not a re-analysis**: every number, chart, and
figure is read from the same pipeline outputs that generate the manuscript's
statistics, so the dashboard cannot drift from the paper. The design goal is a
lightweight, static site that can be **refreshed on a routine schedule (target:
twice yearly)** as the underlying data sources are updated.

---

## What it shows

- **Landing “hub”** — a radial wheel of all seven shortfalls around a central
  core showing the **Figure 1 sampling map** (sampling gaps underlie every
  shortfall). Each tile is a single representative map or icon under a translucent
  colour wash; click a tile to jump to that shortfall.
- **One section per shortfall** — headline stat tiles, a short plain-language
  framing, and the supporting charts/figures/maps. GlobalFungi vs GenBank
  differences are broken out where relevant (Linnean Venn diagrams; Wallacean and
  Eltonian sub-sections; a GlobalFungi-vs-GenBank ecozone bar in Hutchinsonian).

| Shortfall | Question | Core metric |
|---|---|---|
| Linnean | How many species are there? | % of SH codes that cannot be named (“dark”) |
| Wallacean | Where do they occur? | % of taxa known from a single site |
| Prestonian | How abundant, and changing? | % of species with no abundance time series |
| Darwinian | How have they evolved? | % of species with no sequenced genome |
| Raunkiæran | What are their traits? | trait-coverage gap (ecological vs. morphological) |
| Hutchinsonian | What are their climatic limits? | unsampled ecozones + climate-space gaps |
| Eltonian | Who do they interact with? | % of host species with any fungal-partner record |

**Maps.** All geographic maps are **interactive Leaflet maps (Web Mercator, fully
zoomable/pannable)**, each in its own window:

- the **sampling map** (point layers by source; only in-Canada coordinates are
  shown — GenBank records with out-of-country lat/lon are filtered out);
- the **dark-diversity raster** (Linnean) and the **host-richness** and
  **host-coverage rasters** (Eltonian, the two layers of manuscript Figure 4),
  each reprojected to Web Mercator by `R/sync_inputs.R` and overlaid as a
  georeferenced PNG with a gradient legend.

- the **climate explorer** (Figure 3): three panels — available-climate frequency,
  GlobalFungi coverage, and GlobalFungi + GenBank coverage — each pairing a
  zoomable map with its 2-D MAT × MAP **climate space** (a 50 × 50 grid of climate
  zones). Moving the cursor over a map highlights that location's climate zone in
  the chart, so you can see whether a place's climate has been sampled at all.

**The text reports numbers; it does not characterise them.** Because the dashboard
is meant to show the *current* data and those values change at each update, all
prose deliberately avoids evaluative adjectives ("severe", "sparse", "barely").
Section notes state the numbers; card descriptions explain what an item shows and
how it was computed. Keep new text to that standard, or it will go stale.

**Every infographic carries a short description.** Each card's title has a small
ⓘ toggle that reveals a one- or two-sentence explanation of what the chart or map
shows and how to read it. It is a real `<button>` with `aria-expanded` (not a
hover tooltip), so it works with keyboard, touch and screen readers. Edit these in
`js/config.js` / `js/climate.js` via `withNote(card(...), "text")`.

**Accessibility.** All images carry `alt` text; every map and chart exposes
`role="img"` with a descriptive `aria-label`; there is a skip-link, visible
keyboard focus rings, and `prefers-reduced-motion` support. Colour is never the
only cue, and all gradient maps use perceptually uniform, colour-blind-safe
ramps — **viridis for magnitudes** (counts, percentages) and **plasma for
proportions** (0–1) — with categorical comparisons drawn in blue/orange rather
than red/green.

**Bar charts show percent of a denominator, with the count superimposed.** Every
chart with a natural "out of N" denominator scales bar width to percent of that
total and labels the bar "count of N (pct%)" — e.g. Wallacean's most-sampled
genera are shown as a percentage of all GlobalFungi sampling sites, not a
relative ranking. `pctOf(denom, unit)` in `js/charts.js` is the shared helper;
`hbars()`'s `valueFmt(value, row)` and `stackBars()`'s `opts.percentOf` implement
the pattern. Charts without a meaningful shared denominator (e.g. a plain ranked
top-N list) keep a plain count.

**Vector maps use an equal-area projection.** The ecozone map is drawn in the
manuscript's **Canada Albers Equal Area Conic** (via Proj4Leaflet), with the
official Environment Canada ecozone colours and a legend; click a location to
highlight its ecozone and see its sample counts. Note that Leaflet's `fitBounds`
under-estimates extent in a conic projection (it only projects the bbox corners),
so `fitAlbers()` in `js/map.js` fits using every projected vertex instead.

---

## Stack (deliberately minimal)

Plain HTML/CSS/JS — **no build step, no framework, no npm.** The only third-party
library is **Leaflet** (vendored in `assets/leaflet/`). All charts are hand-drawn
HTML/SVG in `js/charts.js`. The interactive map needs internet access for its
basemap tiles (CARTO Positron); everything else works offline.

```
ECM_dashboard/
├── index.html             # page skeleton + script/style tags
├── css/style.css          # all styling
├── js/
│   ├── charts.js          # DOM + chart helpers (bars, donut, venn, figure zoom/pan)
│   ├── map.js             # Leaflet maps: sampling points, raster overlays, Albers ecozones
│   ├── climate.js         # the linked climate explorer (map <-> climate space)
│   ├── config.js          # ← EDIT ME: per-shortfall labels, colours, and content
│   └── app.js             # nav, hub, section assembly, interactions
├── assets/leaflet/        # vendored Leaflet (js/css/images)
├── data/
│   ├── dashboard_data.js  # window.ECM_DATA — the numbers (generated; do not edit)
│   ├── *.csv              # snapshot of the source tables (provenance)
│   ├── map_points.csv     # reduced sampling points (in-Canada only)
│   ├── rasters/*.png      # Web-Mercator raster overlays (generated)
│   └── MANIFEST.csv       # what was synced, when, from where
├── figures/               # the manuscript figures used as maps/thumbnails
└── R/sync_inputs.R        # refreshes data/ + figures/ from a manuscript checkout
```

---

## Running it

Because browsers block `fetch()` from `file://`, the data is delivered as a
`<script>` (`data/dashboard_data.js`), so you can **open `index.html` directly**.
The interactive Leaflet map still needs internet for basemap tiles; to serve
locally instead:

```bash
python3 -m http.server 8801   # then open http://localhost:8801/index.html
```

Deployed via GitHub Pages, serving directly from the `main` branch root (no
build step, no GitHub Actions). Pages redeploys automatically whenever `main`
is pushed — there is no scheduled or automated re-sync; updating is always the
manual sync → commit → push sequence below.

---

## Updating (target: twice yearly)

1. **Refresh the manuscript pipeline.** In the manuscript project, re-run
   `scripts/run_all.R` so `data_derived/` and `figures/` are current. Some raw
   inputs must be sourced manually first (a fresh GenBank pull, a new GlobalFungi
   release); see the manuscript's `data_raw/DATA-DICTIONARY.md`.

2. **Sync** into this project (base R + `readr` + `jsonlite`; `terra` is also
   needed to rebuild the raster maps, and is already part of the manuscript
   pipeline's environment):

   ```bash
   Rscript R/sync_inputs.R /path/to/ECM_manuscript
   ```

   This copies the figures + summary tables the dashboard needs, reduces the
   primary dataset to `map_points.csv` (in-Canada coordinates only), reprojects
   the dark-diversity and host rasters to Web-Mercator PNGs in `data/rasters/`,
   **rebuilds `data/dashboard_data.js`**, and rewrites `data/MANIFEST.csv` with a
   timestamp and source path. Missing source files are reported as warnings and
   flagged `MISSING` in the manifest; the committed raster PNGs persist even if the
   large source rasters are unavailable on a later sync.

3. **Reload** `index.html` (or redeploy). No build step; the data snapshot date
   updates automatically.

### Extending the dashboard

- To change **what a shortfall page shows** (labels, colours, which charts/figures
  appear), edit `js/config.js` — each shortfall's `detail(host, D)` builds its page.
- To add a **new metric or series**, add its source file to the `data_files` list
  and the bundle builder in `R/sync_inputs.R`, then reference `D.…` in `config.js`.
- Values are read by **exact metric string** from `window.ECM_DATA`, mirroring the
  manuscript; a mistyped key renders an em dash (“—”) rather than a wrong number.

---

## Data sources & licence

Sources (via the manuscript pipeline): GlobalFungi v5, NCBI GenBank, UNITE v10,
FungalTraits, FungalRoot, BIEN/BIEN2, MycoCosm, BioTIME, WorldClim, and van Galen
et al. (2025). The derived data and figures reproduced here inherit the manuscript
deposit's terms (**CC BY-NC 4.0**); see the manuscript repository's `README.md` and
`ARCHIVING.md` for full per-source terms and citation details.

## Reference

Hortal J, de Bello F, Diniz-Filho JAF, Lewinsohn TM, Lobo JM, Ladle RJ (2015)
Seven shortfalls that beset large-scale knowledge of biodiversity.
*Annual Review of Ecology, Evolution, and Systematics* 46: 523–549.
