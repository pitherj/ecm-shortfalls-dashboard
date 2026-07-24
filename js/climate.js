/* =============================================================================
   climate.js -- the interactive climate explorer (manuscript Figure 3)
   -----------------------------------------------------------------------------
   Three panels, one per scope:
     freq  -- how common each climate is across Canada (the denominator)
     gf    -- what share of each climate zone GlobalFungi has sampled
     comb  -- the same for GlobalFungi + GenBank combined

   Each panel pairs a zoomable Web-Mercator raster MAP (left) with the matching
   2-D CLIMATE SPACE (right): a 50 x 50 grid of mean-annual-temperature (MAT) by
   mean-annual-precipitation (MAP) "climate zones". Moving the cursor over the
   map looks up the climate zone at that location and highlights the same zone in
   the climate-space chart, so you can see where a place sits in climate space --
   and, in the coverage panels, whether that climate has been sampled at all.

   All values come from window.ECM_DATA.climate (built by R/sync_inputs.R,
   following 17_hutchinsonian.R).
   ============================================================================= */

const CLIMATE_SCOPES = {
  freq: { raster: "clim_freq", title: "Available climate frequency",
          value: z => z.n,  scale: "sqrt",
          vlabel: "Canadian grid cells sharing that climate" },
  gf:   { raster: "clim_gf",   title: "GlobalFungi coverage",
          value: z => z.gf, scale: "linear", zmax: 1,
          vlabel: "proportion of the zone's Canadian cells sampled" },
  comb: { raster: "clim_comb", title: "GlobalFungi + GenBank coverage",
          value: z => z.cb, scale: "linear", zmax: 1,
          vlabel: "proportion of the zone's Canadian cells sampled" }
};

/* interpolate a colour out of a raster cfg's `stops` array (t in 0..1) */
function rampColor(stops, t) {
  if (!stops || !stops.length) return "#888";
  t = Math.max(0, Math.min(1, t));
  const p = t * (stops.length - 1), i = Math.floor(p), f = p - i;
  if (i >= stops.length - 1) return stops[stops.length - 1];
  const c1 = hexToRgb(stops[i]), c2 = hexToRgb(stops[i + 1]);
  return `rgb(${Math.round(c1[0] + (c2[0] - c1[0]) * f)},` +
         `${Math.round(c1[1] + (c2[1] - c1[1]) * f)},` +
         `${Math.round(c1[2] + (c2[2] - c1[2]) * f)})`;
}
function hexToRgb(h) {
  h = String(h).replace("#", "");
  if (h.length === 8) h = h.substring(0, 6);      // hcl.colors may emit #RRGGBBAA
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16),
          parseInt(h.substring(4, 6), 16)];
}

/* which climate zone is at a lat/lon? (uses the coarse lookup grid) */
function zoneAtLatLng(C, lat, lon) {
  const L = C.lookup; if (!L) return null;
  const col = Math.floor((lon - L.west) / L.cell);
  const row = Math.floor((L.north - lat) / L.cell);
  if (col < 0 || row < 0 || col >= L.ncol || row >= L.nrow) return null;
  const b = L.bins[row * L.ncol + col];
  return b > 0 ? b : null;
}

/* -----------------------------------------------------------------------------
   drawClimateSpace: the 50 x 50 MAT x MAP grid as an SVG.
   Returns { highlight(zoneId) } so the map can drive it.
   -------------------------------------------------------------------------- */
function drawClimateSpace(host, C, spec, cfg) {
  const N = C.nbin, CELL = 8, ML = 58, MT = 10, MR = 10, MB = 42;
  const W = N * CELL, H = N * CELL;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${ML + W + MR} ${MT + H + MB}`);
  svg.setAttribute("class", "climate-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label",
    `${spec.title}: Canada's climate space as a ${N} by ${N} grid of zones, ` +
    `mean annual temperature (${C.mat.min.toFixed(0)} to ${C.mat.max.toFixed(0)} °C) on the ` +
    `horizontal axis and mean annual precipitation (${C.map.min.toFixed(0)} to ` +
    `${C.map.max.toFixed(0)} mm) on the vertical axis. Colour shows ${spec.vlabel}.`);

  // value range for colour scaling
  const vals = C.zones.map(spec.value).filter(v => v > 0);
  const vmax = spec.zmax != null ? spec.zmax : (vals.length ? Math.max(...vals) : 1);
  const norm = v => spec.scale === "sqrt" ? Math.sqrt(v) / Math.sqrt(vmax) : v / vmax;

  const rects = {};                       // zoneId -> rect element
  C.zones.forEach(z => {
    const v = spec.value(z);
    const r = document.createElementNS(svgNS, "rect");
    r.setAttribute("x", ML + (z.x - 1) * CELL);
    r.setAttribute("y", MT + (N - z.y) * CELL);      // flip: MAP increases upward
    r.setAttribute("width", CELL); r.setAttribute("height", CELL);
    // present in Canada but never sampled -> grey (matches the map's zero colour)
    r.setAttribute("fill", v > 0 ? rampColor(cfg && cfg.stops, norm(v)) : "#d9d9d9");
    r.setAttribute("class", "cz");
    const mat = (C.mat.min + (z.x - 0.5) * (C.mat.max - C.mat.min) / N).toFixed(1);
    const mp  = (C.map.min + (z.y - 0.5) * (C.map.max - C.map.min) / N).toFixed(0);
    const t = document.createElementNS(svgNS, "title");
    t.textContent = `MAT ${mat} °C, MAP ${mp} mm — ` +
      (spec.zmax === 1 ? `${(v * 100).toFixed(0)}% sampled` : `${v} cells`);
    r.appendChild(t);
    svg.appendChild(r);
    rects[(z.x - 1) * N + z.y] = r;
  });

  // axes
  const line = (x1, y1, x2, y2) => {
    const l = document.createElementNS(svgNS, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1);
    l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("class", "cz-axis"); svg.appendChild(l);
  };
  const text = (x, y, s, cls) => {
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", x); t.setAttribute("y", y);
    t.setAttribute("class", cls || "cz-lab"); t.textContent = s; svg.appendChild(t);
  };
  line(ML, MT + H, ML + W, MT + H);                 // x axis
  line(ML, MT, ML, MT + H);                          // y axis
  for (let i = 0; i <= 4; i++) {                     // x ticks (MAT)
    const x = ML + (W * i / 4);
    const v = C.mat.min + (C.mat.max - C.mat.min) * i / 4;
    text(x, MT + H + 15, v.toFixed(0), "cz-tick");
  }
  for (let i = 0; i <= 4; i++) {                     // y ticks (MAP)
    const y = MT + H - (H * i / 4);
    const v = C.map.min + (C.map.max - C.map.min) * i / 4;
    text(ML - 6, y + 4, v.toFixed(0), "cz-tick end");
  }
  text(ML + W / 2, MT + H + 34, "Mean annual temperature (°C)", "cz-title");
  const yl = document.createElementNS(svgNS, "text");
  yl.setAttribute("transform", `translate(13,${MT + H / 2}) rotate(-90)`);
  yl.setAttribute("class", "cz-title"); yl.textContent = "Mean annual precipitation (mm)";
  svg.appendChild(yl);

  // highlight marker (drawn on top): white halo + orange core, so it reads on
  // both the darkest and the lightest cells.
  const halo = document.createElementNS(svgNS, "rect");
  halo.setAttribute("class", "cz-marker-halo");
  halo.setAttribute("width", CELL); halo.setAttribute("height", CELL);
  halo.setAttribute("visibility", "hidden");
  svg.appendChild(halo);
  const marker = document.createElementNS(svgNS, "rect");
  marker.setAttribute("class", "cz-marker");
  marker.setAttribute("width", CELL); marker.setAttribute("height", CELL);
  marker.setAttribute("visibility", "hidden");
  svg.appendChild(marker);

  host.appendChild(svg);
  const readout = el("div.cz-readout", { text: "Hover the map to locate a place in climate space" });
  host.appendChild(readout);

  return {
    highlight(zoneId) {
      const r = zoneId != null ? rects[zoneId] : null;
      if (!r) {
        marker.setAttribute("visibility", "hidden");
        halo.setAttribute("visibility", "hidden");
        readout.textContent = "Hover the map to locate a place in climate space";
        return;
      }
      [halo, marker].forEach(m => {
        m.setAttribute("x", r.getAttribute("x"));
        m.setAttribute("y", r.getAttribute("y"));
        m.setAttribute("visibility", "visible");
      });
      readout.textContent = r.querySelector("title").textContent;
    }
  };
}

/* -----------------------------------------------------------------------------
   buildClimatePanel: one scope = map (left) + climate space (right), linked.
   -------------------------------------------------------------------------- */
function buildClimatePanel(host, scope, D) {
  const C = D.climate, spec = CLIMATE_SCOPES[scope];
  if (!C || !spec) {
    host.appendChild(el("div.fig-missing", { text: "Climate data unavailable — run R/sync_inputs.R." }));
    return;
  }
  const cfg = D.rasters[spec.raster];
  const mapHost = el("div.leaflet-host", { id: "clim-map-" + scope });
  const csHost  = el("div.climate-space");

  const mapNote = {
    freq: "How common each climate is across Canada, shown geographically: every grid cell is " +
          "coloured by how many Canadian cells share its climate zone. Lighter cells belong to " +
          "more widespread climates, darker cells to less widespread ones. Note that the Web " +
          "Mercator projection distorts geographic area, inflating regions towards the poles, so " +
          "the area a colour occupies on screen is not proportional to its area on the ground.",
    gf:   "Climate coverage by GlobalFungi: each cell is coloured by the proportion of its " +
          "climate zone's Canadian cells that contain at least one sample. Grey marks climate " +
          "zones with no samples.",
    comb: "The same coverage measure with GlobalFungi and GenBank records combined. Grey marks " +
          "climate zones with no samples from either source."
  }[scope];
  const csNote = {
    freq: "Canada's climate space: mean annual temperature (horizontal axis) against mean annual " +
          "precipitation (vertical axis), divided into a 50 × 50 grid of climate zones. Colour " +
          "shows how many Canadian grid cells fall in each zone. This is the denominator the two " +
          "coverage panels below are measured against. Because each zone is an equal-sized bin of " +
          "climate space, area here is not distorted by map projection.",
    gf:   "The same climate space, coloured by what GlobalFungi has sampled. Grey zones occur in " +
          "Canada but contain no samples; coloured zones contain at least one.",
    comb: "Climate coverage with GlobalFungi and GenBank combined. Grey zones occur in Canada but " +
          "contain no samples from either source."
  }[scope];

  host.appendChild(el("div.detail-grid", null, [
    withNote(card(spec.title + " — map (zoomable)", mapHost), mapNote),
    withNote(card(spec.title + " — climate space", csHost), csNote)
  ]));

  const cs = drawClimateSpace(csHost, C, spec, cfg);

  requestAnimationFrame(() => {
    const map = buildRasterMap(mapHost, cfg);
    if (!map) return;
    // Link: cursor position on the map -> climate zone -> highlight in the chart
    map.on("mousemove", e => cs.highlight(zoneAtLatLng(C, e.latlng.lat, e.latlng.lng)));
    map.on("mouseout", () => cs.highlight(null));
  });
}
