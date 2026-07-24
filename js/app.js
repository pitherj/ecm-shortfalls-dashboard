/* =============================================================================
   app.js -- orchestration: nav, radial hub, shortfall sections, interactions
   -----------------------------------------------------------------------------
   Reads window.ECM_DATA + the SHORTFALLS config and assembles the page. The
   landing "hub" is a radial wheel of all seven shortfalls (an extension of the
   manuscript's Figure 5), each a single image/icon under a translucent colour
   wash; clicking a tile jumps to that shortfall's section.
   ============================================================================= */

document.addEventListener("DOMContentLoaded", function () {
  const D = window.ECM_DATA;
  if (!D) { document.body.innerHTML = "<p style='padding:2rem'>Data bundle not found. Run <code>R/sync_inputs.R</code>.</p>"; return; }

  // Derived: distinct sampling sites (unique lat/lon regardless of source).
  D.n_sites = new Set((D.map_points || []).map(p => p[0] + "," + p[1])).size;

  buildNav(D);
  buildHero(D);
  buildSections(D);
  buildAbout(D);
  wireScrollSpy();
});

/* ---- top navigation ------------------------------------------------------- */
function buildNav(D) {
  const links = document.getElementById("nav-links");
  links.appendChild(navLink("#hub", "Hub"));
  SHORTFALLS.forEach(sf => {
    const a = navLink("#" + sf.id, sf.name);
    a.style.setProperty("--accent", sf.color);
    links.appendChild(a);
  });
  links.appendChild(navLink("#about", "About"));
  document.getElementById("nav-date").textContent = "data: " + (D.meta ? D.meta.synced : "—");
}
function navLink(href, label) {
  return el("a.nav-link", { href, text: label, onclick: e => { e.preventDefault(); smoothScroll(href); } });
}

/* ---- hero: central sampling map framed by the seven shortfall tiles -------
   The radial "wheel" is gone: the central image is a legible Figure 1 sampling
   map (sampling is the overriding shortfall) with the seven clickable tiles
   arranged around it via CSS grid. No text is overlaid on the map.             */
function buildHero(D) {
  const hero = document.getElementById("hero");
  const hub = el("div.hub", { id: "hub-wheel" });

  const zones = {
    top:    el("div.hub-top.hub-zone"),
    left:   el("div.hub-left"),
    right:  el("div.hub-right"),
    bottom: el("div.hub-bottom.hub-zone")
  };
  // which tile sits where (frame around the map)
  const placement = {
    linnean: "top", wallacean: "top", prestonian: "top",
    darwinian: "right", raunkiaeran: "bottom", hutchinsonian: "bottom", eltonian: "left"
  };
  SHORTFALLS.forEach(sf => zones[placement[sf.id]].appendChild(makeSpoke(sf)));

  const map = el("div.hub-map", null,
    el("img.hub-map-img", {
      src: "figures/Figure-01_sampling_map.png",
      alt: "Map of ectomycorrhizal fungal sampling sites across Canada"
    }));

  hub.appendChild(zones.top);
  hub.appendChild(zones.left);
  hub.appendChild(map);
  hub.appendChild(zones.right);
  hub.appendChild(zones.bottom);
  hero.appendChild(hub);
}

/* one clickable shortfall tile */
function makeSpoke(sf) {
  const bg = sf.img
    ? `background-image:linear-gradient(${hexA(sf.color, .58)},${hexA(sf.color, .72)}),url('${sf.img}');`
    : `background-image:linear-gradient(${hexA(sf.color, .82)},${hexA(sf.color, .92)});`;
  return el("a.spoke", {
    href: "#" + sf.id, style: bg,
    onclick: e => { e.preventDefault(); smoothScroll("#" + sf.id); }
  }, [
    sf.icon ? el("div.spoke-icon", { html: ICONS[sf.icon] }) : null,
    el("div.spoke-name", { text: sf.name }),
    el("div.spoke-action", { html: sf.action })
  ].filter(Boolean));
}

/* ---- shortfall detail sections -------------------------------------------- */
function buildSections(D) {
  const main = document.getElementById("sections");
  SHORTFALLS.forEach(sf => {
    const sec = el("section.shortfall", { id: sf.id });
    sec.style.setProperty("--accent", sf.color);
    // header band (translucent accent so text stays readable)
    sec.appendChild(el("div.sf-head", { style: `background:${hexA(sf.color, .12)}` }, [
      el("div.sf-head-main", null, [
        el("span.sf-badge", { text: sf.name, style: `background:${sf.color}` }),
        el("h2.sf-question", { text: sf.question })
      ]),
      el("span.sf-action-chip", { html: "→ " + sf.action, style: `color:${sf.color};border-color:${hexA(sf.color, .4)}` })
    ]));
    // stat tiles
    const tiles = el("div.stat-tiles");
    sf.stats(D).forEach(s => tiles.appendChild(
      el("div.stat-tile", { style: `background:${hexA(sf.color, .10)};border-left:4px solid ${sf.color}` }, [
        el("div.stat-value", { text: s.v }),
        el("div.stat-label", { text: s.l })
      ])));
    sec.appendChild(tiles);
    // body
    const body = el("div.sf-body");
    sf.detail.call(sf, body, D);
    sec.appendChild(body);
    main.appendChild(sec);
  });
}

/* =============================================================================
   Source datasets: version pinned / date accessed.
   -----------------------------------------------------------------------------
   Transcribed from the manuscript's `data_raw/DATA-DICTIONARY.md`, which is the
   authoritative provenance record. UPDATE THIS TABLE whenever a pipeline input is
   refreshed. (Only the numbers on this dashboard update automatically; these are
   properties of the upstream sources, not of our derived files.)
   ============================================================================= */
const DATA_SOURCES = [
  ["GlobalFungi", "v5 release"],
  ["NCBI GenBank", "queried 29 June 2026"],
  ["UNITE (species-hypothesis reference)", "v10.0, build 4 April 2024 — DOI 10.15156/BIO/2959332"],
  ["FungalTraits", "v1.2 (Põlme et al. 2020, MOESM4)"],
  ["FungalRoot", "GBIF Darwin Core Archive — DOI 10.15468/a7ujmj"],
  ["BIEN, NSR, GIFT, GBIF backbone", "live queries, cached at pipeline run; NSR checklists: VASCAN refreshed 16 September 2024, WCVP v13 21 May 2024"],
  ["BIEN2 modelled host ranges", "biendata.org API (Moulatlet et al. 2025)"],
  ["JGI MycoCosm", "organism list (genome availability)"],
  ["BioTIME", "v2 raw data, 2025 release"],
  ["WorldClim", "v2.1, 30 arc-second, Canada"],
  ["van Galen et al. (2025) dark-taxa layers", "figshare DOI 10.6084/m9.figshare.28830371"],
  ["GBIF specimen occurrence download", "DOI 10.15468/dl.92rns5"],
  ["Ecoregions / ecozones", "National Ecological Framework for Canada (AAFC)"],
  ["Natural Earth", "lakes basemap"]
];

/* ---- about + updating ----------------------------------------------------- */
function buildAbout(D) {
  const sec = document.getElementById("about");
  sec.appendChild(el("h2.about-h", { text: "About" }));

  // Contact address assembled at runtime so the literal string is not sitting in
  // the page source for scrapers; it is displayed in a spaced-out form too.
  const eUser = "jason.pither", eDom = "ubc.ca";

  sec.appendChild(card("What this is", el("div.prose", {
    html:
      `<p>A companion to <i>“An assessment of biodiversity data shortfalls for ectomycorrhizal ` +
      `(EcM) fungi in Canada”</i> (Eckert et al.). It reports the seven biodiversity data ` +
      `shortfalls of Hortal et al. (2015) for EcM fungi in Canada.</p>` +
      `<p>Every value shown is read from the same pipeline outputs that generate the ` +
      `manuscript's statistics, tables and figures, and is refreshed each time the dashboard is ` +
      `synced. Text on the dashboard describes what each item shows; it does not characterise ` +
      `the size of any gap, because those values change with each update.</p>` +
      `<ul>` +
      `<li><b>Data snapshot:</b> ${D.meta ? D.meta.synced : "—"}</li>` +
      `<li><b>Built by:</b> Jason Pither and Claude Opus 4.8 (high).</li>` +
      `<li><b>Contact:</b> <a id="contact-link" href="#">${eUser} [at] ${eDom}</a></li>` +
      `<li><b>Maps:</b> raster and point maps are interactive Web Mercator; the ecozone vector ` +
      `map uses Canada Albers Equal Area Conic, the manuscript's projection.</li>` +
      `</ul>`
  })));

  // Source datasets: version / access date
  const t = el("table.metrics");
  t.appendChild(el("thead", null, el("tr", null, [
    el("th", { text: "Source dataset" }), el("th", { text: "Version pinned / date accessed" })])));
  const tb = el("tbody");
  DATA_SOURCES.forEach(([name, ver]) => tb.appendChild(el("tr", null, [
    el("td", { text: name }), el("td", { text: ver })])));
  t.appendChild(tb);
  sec.appendChild(card("Source datasets — version pinned or date accessed", t,
    el("p.muted", {
      text: "Transcribed from the manuscript's data_raw/DATA-DICTIONARY.md, the authoritative " +
            "provenance record. These are properties of the upstream sources; they change only " +
            "when a pipeline input is refreshed, and are maintained by hand in js/app.js."
    })));

  // Wire the contact link at runtime (keeps the plain address out of the source).
  const link = document.getElementById("contact-link");
  if (link) link.setAttribute("href", "mailto:" + "jason.pither" + "@" + "ubc.ca");
}

/* ---- scroll-spy: highlight the active nav link ---------------------------- */
function wireScrollSpy() {
  const ids = ["hub", ...SHORTFALLS.map(s => s.id), "about"];
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        document.querySelectorAll(".nav-link").forEach(a =>
          a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  ids.forEach(id => { const n = document.getElementById(id); if (n) obs.observe(n); });
}

/* ---- helpers -------------------------------------------------------------- */
function smoothScroll(href) {
  const t = document.querySelector(href);
  if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
}
function hexA(hex, a) { return rgba(hex, a); }
function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }
