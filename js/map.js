/* =============================================================================
   map.js -- interactive Leaflet sampling map (Web Mercator, fully zoomable)
   -----------------------------------------------------------------------------
   Draws the ~1,600 unique EcM sampling sites from ECM_DATA.map_points, coloured
   by data source (GlobalFungi vs GenBank), with a source toggle and a legend.
   Uses CartoDB Positron tiles (needs internet); the markers themselves are
   vector circles, so no marker images are required.

   NOTE ON PROJECTION: the manuscript's static maps use Canada Albers Equal Area
   Conic. This interactive map is Web Mercator (the only practical projection for
   tiled slippy maps), chosen here specifically to give smooth zoom/pan. The
   Albers analysis figures remain available, unaltered, on the shortfall pages.
   ============================================================================= */

const SRC_STYLE = {
  GF: { color: "#2166ac", label: "GlobalFungi" },
  GB: { color: "#d95f02", label: "GenBank" }
};

const POSITRON = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const POSITRON_OPTS = { attribution: '&copy; OpenStreetMap contributors &copy; CARTO', subdomains: "abcd", maxZoom: 19 };

// Canada Albers Equal Area Conic -- the manuscript's projection. Used for VECTOR
// maps so areas are not distorted (unlike Web Mercator). Requires proj4 +
// Proj4Leaflet. There are no slippy tiles in this projection, so Albers maps
// render the vector data on a plain background (the polygons are the map).
const ALBERS_PROJ =
  "+proj=aea +lat_0=40 +lon_0=-96 +lat_1=50 +lat_2=70 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs";
/* fitAlbers(): fit a map to a vector layer's TRUE projected extent.
   Leaflet's fitBounds only projects the two corners of the lat/lng bounding box,
   which under-estimates the extent in a CONIC projection (Canada curves in
   Albers), so it over-zooms and clips. Here we project every vertex, take the
   real min/max in projected metres, and choose the zoom from that.            */
function fitAlbers(map, layer, padPx) {
  const crs = map.options.crs, res = crs.options && crs.options.resolutions;
  if (!res) return;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, n = 0;
  const walk = ll => {
    if (Array.isArray(ll)) return ll.forEach(walk);
    const p = crs.project(ll);
    minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
    miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); n++;
  };
  layer.eachLayer(l => { if (l.getLatLngs) walk(l.getLatLngs()); });
  if (!n) return;
  const pad = padPx == null ? 10 : padPx, size = map.getSize();
  const w = Math.max(1, size.x - pad * 2), h = Math.max(1, size.y - pad * 2);
  const need = Math.max((maxx - minx) / w, (maxy - miny) / h);
  let z = 0;                       // resolutions are descending; take the finest that still fits
  for (let i = 0; i < res.length; i++) if (res[i] >= need) z = i;
  map.setView(crs.unproject(L.point((minx + maxx) / 2, (miny + maxy) / 2)), z, { animate: false });
}

function makeAlbersCRS() {
  // A fine geometric series of metres-per-pixel levels (ratio ~1.15) so that
  // fitBounds can land on a near-edge-to-edge fit (Proj4Leaflet snaps to these
  // discrete levels, so a coarse 2x series would over/under-shoot).
  const res = [];
  for (let v = 40000; v > 30; v /= 1.15) res.push(v);
  return new L.Proj.CRS("ECM:AEA", ALBERS_PROJ, {
    resolutions: res,
    origin: [-4000000, 5500000]   // top-left (x, y) in Albers metres, beyond Canada
  });
}

function buildSamplingMap(container) {
  if (typeof L === "undefined") {
    container.appendChild(el("div.fig-missing", { text: "Leaflet failed to load." }));
    return;
  }
  const map = L.map(container, { scrollWheelZoom: true, minZoom: 2, worldCopyJump: true })
    .setView([62, -96], 3);
  container.setAttribute("role", "img");
  container.setAttribute("aria-label",
    "Zoomable map of ectomycorrhizal fungal sampling locations across Canada, " +
    "coloured by data source (GlobalFungi and GenBank).");

  L.tileLayer(POSITRON, POSITRON_OPTS).addTo(map);

  const pts = (window.ECM_DATA && window.ECM_DATA.map_points) || [];
  const layers = { GF: L.layerGroup(), GB: L.layerGroup() };
  const counts = { GF: 0, GB: 0 };
  pts.forEach(p => {
    const [lat, lon, src] = p;
    const st = SRC_STYLE[src] || SRC_STYLE.GF;
    counts[src] = (counts[src] || 0) + 1;
    L.circleMarker([lat, lon], {
      radius: 4, weight: 0, fillColor: st.color, fillOpacity: 0.6
    }).bindPopup(`<b>${st.label}</b><br>${lat.toFixed(3)}, ${lon.toFixed(3)}`)
      .addTo(layers[src] || layers.GF);
  });
  layers.GF.addTo(map); layers.GB.addTo(map);

  const overlays = {};
  overlays[`<span style="color:#2166ac">●</span> GlobalFungi (${counts.GF.toLocaleString("en-CA")})`] = layers.GF;
  overlays[`<span style="color:#d95f02">●</span> GenBank (${counts.GB.toLocaleString("en-CA")})`] = layers.GB;
  L.control.layers(null, overlays, { collapsed: false, position: "topright" }).addTo(map);

  // Legend (with the number of unique sampling locations per source)
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "map-legend");
    div.innerHTML =
      '<div class="map-legend-title">Sampling locations</div>' +
      `<div><span class="dot" style="background:${SRC_STYLE.GF.color}"></span>GlobalFungi — ${counts.GF.toLocaleString("en-CA")}</div>` +
      `<div><span class="dot" style="background:${SRC_STYLE.GB.color}"></span>GenBank — ${counts.GB.toLocaleString("en-CA")}</div>`;
    return div;
  };
  legend.addTo(map);

  // Ensure correct sizing once the container is laid out / revealed.
  setTimeout(() => map.invalidateSize(), 200);
  return map;
}

/* =============================================================================
   buildRasterMap -- a zoomable Web Mercator map with a colourized raster overlay
   -----------------------------------------------------------------------------
   cfg is a raster entry from ECM_DATA.rasters: {png, bounds:[[S,W],[N,E]], zmin,
   zmax, label, stops[]}. The PNG was reprojected to Web Mercator by
   R/sync_inputs.R, so it aligns pixel-accurately when placed at its lat/lng
   bounds. A gradient legend shows the value range.
   ============================================================================= */
function buildRasterMap(container, cfg, opts) {
  opts = opts || {};
  if (typeof L === "undefined" || !cfg) {
    container.appendChild(el("div.fig-missing", { text: "Raster map unavailable — run R/sync_inputs.R." }));
    return;
  }
  const map = L.map(container, { scrollWheelZoom: true, minZoom: 2 });
  L.tileLayer(POSITRON, POSITRON_OPTS).addTo(map);
  L.imageOverlay(cfg.png, cfg.bounds, {
    opacity: opts.opacity || 0.85,
    alt: opts.alt || (cfg.label + " across Canada, shown as a colour gradient from " +
                      cfg.zmin + " to " + cfg.zmax)
  }).addTo(map);
  container.setAttribute("role", "img");
  container.setAttribute("aria-label", opts.alt || ("Map of " + cfg.label + " across Canada"));
  map.fitBounds(cfg.bounds);
  // Re-fit once the container is definitely laid out (Leaflet may size to 0 on
  // first paint inside a grid/hidden card, leaving a whole-world view).
  setTimeout(() => { map.invalidateSize(); map.fitBounds(cfg.bounds); }, 250);

  // Optional sampling-point overlay (e.g. GlobalFungi points on the dark map).
  // Orange fill + white halo (same scheme as the climate-space hover highlight)
  // reads clearly against both the darkest and the lightest cells of any ramp.
  if (opts.points && opts.points.length) {
    const pc = opts.pointColor || "#ff6b00";
    opts.points.forEach(p => L.circleMarker([p[0], p[1]], {
      radius: 3.5, weight: 1.5, color: "#ffffff", fillColor: pc, fillOpacity: 1, opacity: 1
    }).addTo(map));
  }

  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "map-legend");
    div.innerHTML =
      `<div class="map-legend-title">${cfg.label}</div>` +
      `<div class="ramp" style="background:linear-gradient(to right,${cfg.stops.join(",")})"></div>` +
      `<div class="ramp-lab"><span>${cfg.zmin}</span><span>${cfg.zmax}</span></div>` +
      (opts.pointLabel
        ? `<div style="margin-top:4px"><span class="dot" style="background:${opts.pointColor || "#ff6b00"};` +
          `box-shadow:0 0 0 1.5px #fff, 0 0 0 2.5px rgba(0,0,0,.25)"></span>${opts.pointLabel}</div>`
        : "");
    return div;
  };
  legend.addTo(map);
  return map;
}

/* =============================================================================
   buildEcozoneMap -- a clickable Web Mercator vector map of Canada's ecozones
   -----------------------------------------------------------------------------
   Draws window.ECM_ECOZONES (a GeoJSON FeatureCollection with NAME, gf, gb).
   Clicking anywhere highlights the containing ecozone and pops up its GlobalFungi
   and GenBank sample counts. No legend needed.
   ============================================================================= */
function buildEcozoneMap(container, color) {
  if (typeof L === "undefined" || !window.ECM_ECOZONES) {
    container.appendChild(el("div.fig-missing", { text: "Ecozone map unavailable — run R/sync_inputs.R." }));
    return;
  }
  const accent = color || "#c0392b";
  // Albers equal-area CRS, no tile basemap (the ecozone polygons are the map).
  // zoomSnap:0 lets fitBounds choose a fractional zoom so Canada fits edge-to-edge.
  const map = L.map(container, { crs: makeAlbersCRS(), scrollWheelZoom: true,
    minZoom: 0, maxZoom: 30 });
  container.setAttribute("role", "img");
  container.setAttribute("aria-label",
    "Map of Canada's 15 terrestrial ecozones in Albers equal-area projection, with " +
    "GlobalFungi and GenBank sampling locations overlaid. Select an ecozone to see " +
    "its sample counts.");

  // Layer order (bottom to top), matching the manuscript's Figure S4:
  //   1. ecozones -- translucent official-colour fill
  //   2. lakes -- on top, non-interactive (clicks pass through to the ecozone)
  //   3. sampling points -- GlobalFungi + GenBank, drawn last so they are
  //      always visible regardless of the fill beneath them
  // (A province/territory administrative basemap was tried here and removed
  // before the public deploy -- see the note in R/sync_inputs.R.)

  // Official Environment Canada ecozone colours (carried in the GeoJSON as
  // `col` by R/sync_inputs.R), drawn very transparent so the lakes read
  // through clearly.
  const fillOf = f => (f && f.properties && f.properties.col) || accent;
  const baseStyle = f => ({ color: "#8b969c", weight: 0.8, fillColor: fillOf(f), fillOpacity: 0.32 });
  const hiStyle   = f => ({ color: "#1f2a30", weight: 2.5, fillColor: fillOf(f), fillOpacity: 0.7 });
  let selected = null;

  const layer = L.geoJSON(window.ECM_ECOZONES, {
    style: baseStyle,
    onEachFeature: (feature, lyr) => {
      const p = feature.properties || {};
      const gf = p.gf == null ? 0 : p.gf, gb = p.gb == null ? 0 : p.gb;
      lyr.bindPopup(
        `<b>${p.NAME || "Ecozone"}</b><br>` +
        `<span class="dot" style="background:#2166ac"></span>GlobalFungi: ${(+gf).toLocaleString("en-CA")}<br>` +
        `<span class="dot" style="background:#d95f02"></span>GenBank: ${(+gb).toLocaleString("en-CA")}`);
      lyr.on("click", () => {
        if (selected) layer.resetStyle(selected);
        lyr.setStyle(hiStyle(feature)); lyr.bringToFront(); selected = lyr;
      });
    }
  }).addTo(map);

  if (window.ECM_LAKES) {
    L.geoJSON(window.ECM_LAKES, {
      interactive: false,
      style: { color: "#7fa8c9", weight: 0.5, fillColor: "#cfe3f2", fillOpacity: 0.92 }
    }).addTo(map);
  }

  // Legend: the 15 ecozones with their official colours, plus sample source.
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "map-legend ecozone-legend");
    const rows = (window.ECM_ECOZONES.features || [])
      .map(f => f.properties)
      .sort((a, b) => String(a.NAME).localeCompare(String(b.NAME)))
      .map(p => `<div><span class="dot sq" style="background:${p.col}"></span>${p.NAME}</div>`)
      .join("");
    div.innerHTML = '<div class="map-legend-title">Ecozones</div>' + rows +
      '<div class="map-legend-title" style="margin-top:6px">Sample source</div>' +
      `<div><span class="dot" style="background:${SRC_STYLE.GF.color}"></span>${SRC_STYLE.GF.label}</div>` +
      `<div><span class="dot" style="background:${SRC_STYLE.GB.color}"></span>${SRC_STYLE.GB.label}</div>`;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  legend.addTo(map);

  const fit = () => fitAlbers(map, layer, 12);
  fit();
  setTimeout(() => { map.invalidateSize(); fit(); }, 250);

  // Sampling locations (both sources), added AFTER the map has an established
  // view. Adding ~1,400 circleMarkers before the map's first setView/fit left
  // some of them with no valid pixel bounds, which crashed Leaflet's SVG
  // renderer ("_clipPoints" reading undefined) the moment fitAlbers ran.
  const pts = (window.ECM_DATA && window.ECM_DATA.map_points) || [];
  pts.forEach(p => {
    const [lat, lon, src] = p;
    const st = SRC_STYLE[src] || SRC_STYLE.GF;
    L.circleMarker([lat, lon], { radius: 2.6, weight: 0, fillColor: st.color, fillOpacity: 0.75 })
      .bindPopup(`<b>${st.label}</b><br>${lat.toFixed(3)}, ${lon.toFixed(3)}`)
      .addTo(map);
  });

  return map;
}
