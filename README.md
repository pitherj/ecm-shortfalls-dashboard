# EcM Fungi in Canada — Shortfalls Dashboard

**Live:** https://pitherj.github.io/ecm-shortfalls-dashboard/

An interactive, dependency-light **JavaScript** dashboard that summarizes the
**seven biodiversity data shortfalls** (Hortal et al. 2015) for **ectomycorrhizal
(EcM) fungi in Canada**, as quantified in the manuscript *"An assessment of
biodiversity data shortfalls for ectomycorrhizal fungi in Canada"* (Eckert et al.,
submitted to *FACETS*).

It is a **companion to the paper, not a re-analysis**: every number, map, and
figure is read from the same pipeline outputs that generate the manuscript's
statistics, so the dashboard cannot drift from the paper. The design goal is a
lightweight, static site that can be **refreshed on a routine schedule (target:
twice yearly)** as the underlying data sources are updated.

---

## What it shows

- **Landing “hub”** — a radial wheel of all seven shortfalls around a central
  core showing the **Figure 1 sampling map** (sampling gaps underlie every
  shortfall).  
- **One section per shortfall** — headline stat tiles, a short plain-language
  framing, and the supporting charts/figures/maps. GlobalFungi vs GenBank
  differences are broken out where relevant (Linnean Venn diagrams; Wallacean and
  Eltonian sub-sections; a GlobalFungi-vs-GenBank ecozone bar in Hutchinsonian).

**Every infographic carries a short description.** Each card's title has a small
ⓘ toggle that reveals a one- or two-sentence explanation of what the figure or map
shows and how to read it. It is a real `<button>` with `aria-expanded` (not a
hover tooltip), so it works with keyboard, touch and screen readers. 

**Accessibility.** All images carry `alt` text; every map and figure exposes
`role="img"` with a descriptive `aria-label`; there is a skip-link, visible
keyboard focus rings, and `prefers-reduced-motion` support. Colour is never the
only cue, and all gradient maps use perceptually uniform, colour-blind-safe
ramps — **viridis for magnitudes** (counts, percentages) and **plasma for
proportions** (0–1) — with categorical comparisons drawn in blue/orange rather
than red/green.

---

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

## Data sources & licence

Sources (via the manuscript pipeline): GlobalFungi v5, NCBI GenBank, UNITE v10,
FungalTraits, FungalRoot, BIEN/BIEN2, MycoCosm, BioTIME, WorldClim, and van Galen
et al. (2025). The derived data and figures reproduced here inherit the manuscript
deposit's terms (**CC BY-NC 4.0**); see the manuscript repository's `README.md` and
`ARCHIVING.md` for full per-source terms and citation details:  [https://github.com/pitherj/Canada_ecto_shortfalls](https://github.com/pitherj/Canada_ecto_shortfalls).

## Reference

Hortal J, de Bello F, Diniz-Filho JAF, Lewinsohn TM, Lobo JM, Ladle RJ (2015)
Seven shortfalls that beset large-scale knowledge of biodiversity.
*Annual Review of Ecology, Evolution, and Systematics* 46: 523–549.
