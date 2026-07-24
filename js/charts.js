/* =============================================================================
   charts.js -- tiny dependency-free DOM + chart helpers
   -----------------------------------------------------------------------------
   Everything the dashboard draws (apart from the Leaflet map) is built here from
   plain HTML/SVG, so there is no charting library to maintain or update. All
   fills use rgba() with the shortfall's accent colour so that overlaid labels
   stay readable -- a deliberate, repo-wide convention.
   ============================================================================= */

/* ---- DOM helper: el("div.klass", {attr}, [children|text]) ----------------- */
function el(spec, attrs, kids) {
  const [tag, ...classes] = spec.split(".");
  const n = document.createElement(tag || "div");
  if (classes.length) n.className = classes.join(" ");
  if (attrs) for (const k in attrs) {
    if (k === "html") n.innerHTML = attrs[k];
    else if (k === "text") n.textContent = attrs[k];
    else if (k === "style") n.setAttribute("style", attrs[k]);
    else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(c =>
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return n;
}

/* ---- per-card description ("what am I looking at?") -----------------------
   withNote(cardEl, text) adds a small ⓘ toggle to a card's title that reveals a
   one- or two-sentence explanation of that infographic. Implemented as a real
   <button> with aria-expanded/aria-controls (not a hover tooltip) so it works
   with keyboard and screen readers, and on touch devices.                      */
let _noteSeq = 0;
function withNote(cardEl, text) {
  const titleEl = cardEl.querySelector(".card-title");
  if (!titleEl) return cardEl;
  const id = "cardnote-" + (++_noteSeq);
  const body = el("div.card-note", { id, role: "note", text });
  body.hidden = true;
  const btn = el("button.info-btn", {
    type: "button", "aria-expanded": "false", "aria-controls": id,
    title: "What is this?", "aria-label": "Show description of: " + titleEl.textContent,
    text: "i"
  });
  btn.addEventListener("click", () => {
    const opening = body.hidden;
    body.hidden = !opening;
    btn.setAttribute("aria-expanded", String(opening));
  });
  titleEl.appendChild(btn);
  titleEl.insertAdjacentElement("afterend", body);
  return cardEl;
}

/* ---- "EcM" -> "EcM fungal" for pipeline-derived label text ----------------
   Metric strings come from the manuscript's CSVs, where "EcM" is used on its own
   (e.g. "EcM genera in our Canadian dataset"). On the dashboard we spell out
   that these refer to the FUNGI. "EcM host ..." is left alone, because there
   "EcM" correctly qualifies the plant host.                                    */
function ecmText(s) {
  return String(s)
    // "EcM genera" -> "EcM fungal genera"; skip host/fungal/fungi/lineage
    .replace(/\bEcM (?!fungal\b|fungi\b|host\b|hosts\b)/g, "EcM fungal ")
    // hyphenated forms: "EcM-genus", "EcM-fungus"
    .replace(/\bEcM-(?=genus\b|genera\b|species\b)/g, "EcM fungal ");
}

/* ---- number formatting ---------------------------------------------------- */
const fmt = {
  n:  v => (v == null || isNaN(v)) ? "—" : Math.round(v).toLocaleString("en-CA"),
  pct: v => (v == null || isNaN(v)) ? "—" : (+v).toFixed(1) + "%",
};

/* ---- colour helper: hex -> rgba with alpha -------------------------------- */
function rgba(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16),
        g = parseInt(h.substring(2, 4), 16),
        b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---- horizontal bar chart (HTML) -----------------------------------------
   data: [{label, value, color?}]   opts: {accent, unit, max, valueFmt}
   Bars are translucent (rgba) with a solid left edge; the value sits at the end
   of each bar in dark text so it is always legible.

   Percent-of-denominator convention (repo-wide, matches the Raunkiæran trait
   charts): whenever a chart has a natural "out of N" denominator, pass
   `max: N` so bar WIDTH reads as percent of that denominator, and a
   `valueFmt(value, row)` that prints "<count> of <N> (<pct>%)" so the absolute
   count is never lost. `pctOf(value, denom)` below is a shared helper for
   writing that valueFmt tersely. Charts without a meaningful common
   denominator (e.g. ranked top-N lists with nothing to divide by) keep the
   plain count/unit format.                                                    */
function pctOf(denom, unit) {
  return (v, d) => `${fmt.n(v)}${unit ? " " + unit : ""} of ${fmt.n(denom)} (${denom ? Math.round(100 * v / denom) : 0}%)`;
}
function hbars(data, opts = {}) {
  const accent = opts.accent || "#2c6b8f";
  const max = opts.max || Math.max(1, ...data.map(d => d.value || 0));
  const vf = opts.valueFmt || (v => fmt.n(v) + (opts.unit ? " " + opts.unit : ""));
  const wrap = el("div.hbars", {
    role: "img",
    "aria-label": "Bar chart. " + data.map(d => `${d.label}: ${vf(d.value, d)}`).join("; ") + "."
  });
  data.forEach(d => {
    const col = d.color || accent;
    const label = vf(d.value, d);
    // The value sits BESIDE the track, not layered on top of the fill, so a
    // longer "count of N (pct%)" label is never clipped or low-contrast
    // against a near-full bar.
    const row = el("div.hbar-row", { title: `${d.label}: ${label}` }, [
      el("div.hbar-label", { text: d.label }),
      el("div.hbar-bar", null, [
        el("div.hbar-track", null,
          el("div.hbar-fill", {
            style: `width:${Math.max(1.5, 100 * (d.value || 0) / max)}%;` +
                   `background:${rgba(col, 0.55)};border-left:3px solid ${col};`
          })),
        el("span.hbar-val", { text: label })
      ])
    ]);
    wrap.appendChild(row);
  });
  return wrap;
}

/* ---- two-segment donut (SVG) ---------------------------------------------
   data: [{label, value, color}]   opts: {centerTop, centerBottom}
   Uses stroke-dasharray on stacked circles; translucent fills.                */
function donut(data, opts = {}) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0) || 1;
  const R = 60, C = 2 * Math.PI * R, cx = 90, cy = 90;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 180 180");
  svg.setAttribute("class", "donut-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label",
    "Ring chart. " + data.map(d => `${d.label}: ${fmt.n(d.value)}`).join("; ") + ".");
  // track
  const track = document.createElementNS(svgNS, "circle");
  track.setAttribute("cx", cx); track.setAttribute("cy", cy); track.setAttribute("r", R);
  track.setAttribute("fill", "none"); track.setAttribute("stroke", "#eceff1");
  track.setAttribute("stroke-width", 22);
  svg.appendChild(track);
  let offset = 0;
  data.forEach(d => {
    const frac = (d.value || 0) / total;
    const arc = document.createElementNS(svgNS, "circle");
    arc.setAttribute("cx", cx); arc.setAttribute("cy", cy); arc.setAttribute("r", R);
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke", rgba(d.color, 0.8));
    arc.setAttribute("stroke-width", 22);
    arc.setAttribute("stroke-dasharray", `${frac * C} ${C}`);
    arc.setAttribute("stroke-dashoffset", -offset * C);
    arc.setAttribute("transform", `rotate(-90 ${cx} ${cy})`);
    arc.setAttribute("class", "donut-arc");
    const t = document.createElementNS(svgNS, "title");
    t.textContent = `${d.label}: ${fmt.n(d.value)} (${(frac * 100).toFixed(1)}%)`;
    arc.appendChild(t);
    svg.appendChild(arc);
    offset += frac;
  });
  if (opts.centerTop) {
    const t1 = document.createElementNS(svgNS, "text");
    t1.setAttribute("x", cx); t1.setAttribute("y", cy - 2);
    t1.setAttribute("class", "donut-center-top"); t1.textContent = opts.centerTop;
    svg.appendChild(t1);
  }
  if (opts.centerBottom) {
    const t2 = document.createElementNS(svgNS, "text");
    t2.setAttribute("x", cx); t2.setAttribute("y", cy + 16);
    t2.setAttribute("class", "donut-center-bottom"); t2.textContent = opts.centerBottom;
    svg.appendChild(t2);
  }
  const wrap = el("div.donut-wrap");
  wrap.appendChild(svg);
  // legend
  const leg = el("div.donut-legend");
  data.forEach(d => leg.appendChild(el("div.legend-item", null, [
    el("span.legend-swatch", { style: `background:${rgba(d.color, 0.8)}` }),
    el("span", { text: `${d.label} — ${fmt.n(d.value)}` })
  ])));
  wrap.appendChild(leg);
  return wrap;
}

/* ---- two-set overlap ("Venn") diagram (SVG) ------------------------------
   Two translucent overlapping circles with counts placed in each region.
   data: {a_only, shared, b_only}  opts: {labelA, labelB, colorA, colorB}      */
function venn2(a_only, shared, b_only, opts = {}) {
  const cA = opts.colorA || "#2166ac", cB = opts.colorB || "#d95f02";
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 330 210");
  svg.setAttribute("class", "venn-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label",
    `Two-set overlap diagram. ${opts.labelA || "A"} only: ${fmt.n(a_only)}; ` +
    `shared by both: ${fmt.n(shared)}; ${opts.labelB || "B"} only: ${fmt.n(b_only)}.`);
  const circle = (cx, col) => {
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", cx); c.setAttribute("cy", 95); c.setAttribute("r", 82);
    c.setAttribute("fill", rgba(col, 0.42)); c.setAttribute("stroke", rgba(col, 0.9));
    c.setAttribute("stroke-width", 1.5); return c;
  };
  svg.appendChild(circle(110, cA));
  svg.appendChild(circle(220, cB));
  const txt = (x, val, big) => {
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", x); t.setAttribute("y", 100);
    t.setAttribute("class", big ? "venn-num" : "venn-num small"); t.textContent = fmt.n(val);
    return t;
  };
  svg.appendChild(txt(78, a_only, true));
  svg.appendChild(txt(165, shared, false));
  svg.appendChild(txt(252, b_only, true));
  const wrap = el("div.venn-wrap");
  wrap.appendChild(svg);
  wrap.appendChild(el("div.venn-legend", null, [
    el("span.legend-item", null, [el("span.legend-swatch", { style: `background:${rgba(cA, .8)}` }),
      el("span", { text: opts.labelA || "A" })]),
    el("span.legend-item", null, [el("span.legend-swatch", { style: `background:${rgba(cB, .8)}` }),
      el("span", { text: opts.labelB || "B" })]),
    el("span.venn-mid", { text: "overlap = shared" })
  ]));
  return wrap;
}

/* ---- stacked horizontal bars (for GlobalFungi vs GenBank per group) -------
   rows: [{label, <k1>, <k2>, ...}]   series: [{key,label,color}]
   opts.percentOf: a grand-total denominator. When given, every bar's WIDTH is
   scaled to that single shared total (so bars are directly comparable as a
   percent of the whole), and the end label shows the row's raw count plus its
   percent of that total -- the same "count of N (pct%)" convention as hbars().
   opts.max: a fixed absolute axis maximum (e.g. a literal unit cap such as
   "30 per 10,000 km²") instead of a percent-of-total denominator; pair with
   opts.valueFmt(total, row) for a custom end label.
   With neither, bars scale to the largest row (plain counts), as before.       */
function stackBars(rows, series, opts = {}) {
  const rowTotal = r => series.reduce((s, sr) => s + (r[sr.key] || 0), 0);
  const max = opts.max || opts.percentOf || Math.max(1, ...rows.map(rowTotal));
  const wrap = el("div.hbars");
  rows.forEach(r => {
    const total = rowTotal(r);
    const track = el("div.hbar-track", null, series.map(sr =>
      el("div.hbar-seg", {
        title: `${r.label} — ${sr.label}: ${fmt.n(r[sr.key])}`,
        style: `width:${100 * (r[sr.key] || 0) / max}%;background:${rgba(sr.color, 0.62)};` +
               `border-right:1px solid ${sr.color};`
      })));
    const label = opts.valueFmt ? opts.valueFmt(total, r)
      : opts.percentOf ? `${fmt.n(total)} (${Math.round(100 * total / opts.percentOf)}%)`
      : fmt.n(total);
    const bar = el("div.hbar-bar", null, [track, el("span.hbar-val", { text: label })]);
    wrap.appendChild(el("div.hbar-row", null, [el("div.hbar-label", { text: r.label }), bar]));
  });
  // legend
  wrap.appendChild(el("div.stack-legend", null, series.map(sr =>
    el("span.legend-item", null, [el("span.legend-swatch", { style: `background:${rgba(sr.color, .7)}` }),
      el("span", { text: sr.label })]))));
  return wrap;
}

/* ---- a zoom/pan figure viewer (for the Albers analysis figures) ----------
   The manuscript figures are drawn in Canada Albers Equal Area Conic; we show
   the image itself (projection preserved) with wheel-zoom + drag-pan.          */
function figureViewer(src, alt) {
  const view = el("div.fig-view");
  const img = el("img.fig-img", { src, alt: alt || "", draggable: "false" });
  view.appendChild(img);
  const ctr = el("div.fig-controls", null, [
    el("button", { title: "Zoom in", text: "+", onclick: () => zoom(1.25) }),
    el("button", { title: "Zoom out", text: "−", onclick: () => zoom(0.8) }),
    el("button", { title: "Reset", text: "↺", onclick: () => fit() }),
  ]);
  let s = 1, x = 0, y = 0, fitS = 1;
  function apply() { img.style.transform = `translate(${x}px,${y}px) scale(${s})`; }
  function fit() {
    if (!view.clientWidth || !img.naturalWidth) { setTimeout(fit, 120); return; }
    img.style.width = img.naturalWidth + "px"; img.style.height = img.naturalHeight + "px";
    fitS = Math.min(view.clientWidth / img.naturalWidth, view.clientHeight / img.naturalHeight);
    s = fitS; x = (view.clientWidth - img.naturalWidth * s) / 2;
    y = (view.clientHeight - img.naturalHeight * s) / 2; apply();
  }
  function zoom(f, mx, my) {
    mx = mx == null ? view.clientWidth / 2 : mx; my = my == null ? view.clientHeight / 2 : my;
    const ns = Math.max(fitS * 0.9, Math.min(s * f, fitS * 12));
    x = mx - (mx - x) * (ns / s); y = my - (my - y) * (ns / s); s = ns; apply();
  }
  img.addEventListener("load", fit);
  if (img.complete && img.naturalWidth) fit();
  view.addEventListener("wheel", e => {
    e.preventDefault(); const r = view.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  let drag = false, px, py;
  view.addEventListener("mousedown", e => { drag = true; px = e.clientX; py = e.clientY; view.classList.add("grabbing"); });
  window.addEventListener("mouseup", () => { drag = false; view.classList.remove("grabbing"); });
  window.addEventListener("mousemove", e => { if (!drag) return; x += e.clientX - px; y += e.clientY - py; px = e.clientX; py = e.clientY; apply(); });
  const wrap = el("div.fig-viewer");
  wrap.appendChild(view); wrap.appendChild(ctr);
  return wrap;
}
