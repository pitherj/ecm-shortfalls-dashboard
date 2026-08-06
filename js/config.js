/* =============================================================================
   config.js -- the seven shortfalls: presentation metadata + detail builders
   -----------------------------------------------------------------------------
   This is the file to edit to change WHAT each shortfall page shows. Numbers and
   data series all come from window.ECM_DATA (built by R/sync_inputs.R); this file
   only decides labels, colours, the landing image/icon, and which charts/figures
   appear. Each shortfall's `detail(host, D)` receives the page container and the
   data object and fills it in.
   ============================================================================= */

/* ---- shared UI helpers ---------------------------------------------------- */
function card(title, ...body) {
  return el("div.card", null, [el("div.card-title", { text: title }), ...body]);
}
function note(html, color) {
  return el("div.note", { html, style: color ? `border-left-color:${color}` : "" });
}
function figCard(title, src, alt) { return card(title, figureViewer(src, alt)); }

// mapCard(): a card holding a Leaflet map. `build(el)` runs once the host div is
// in the DOM (Leaflet needs a laid-out, sized container).
function mapCard(title, id, build) {
  const c = card(title);
  const host = el("div.leaflet-host", { id });
  c.appendChild(host);
  requestAnimationFrame(() => build(host));
  return c;
}

/* ---- simple inline-SVG icons for the three non-map shortfalls -------------- */
const ICONS = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/><path d="M3 12h2M19 12h2" opacity=".5"/></svg>',
  dna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 3c0 4 10 6 10 10s-10 6-10 10"/><path d="M17 3c0 4-10 6-10 10s10 6 10 10"/><path d="M8.5 6h7M8 9h8M8 15h8M8.5 18h7" opacity=".7"/></svg>',
  trait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3c-4 0-7 3-7 7 0 1 1 2 3 2h8c2 0 3-1 3-2 0-4-3-7-7-7z"/><path d="M12 12v9M9 21h6" /><path d="M9 8h.01M15 8h.01" opacity=".7"/></svg>'
};

/* =============================================================================
   The seven shortfalls (manuscript order).
   Each: id, name, question, action (landing verb), color, and either
   `img` (a manuscript figure) or `icon` for the landing tile.
   ============================================================================= */
const SHORTFALLS = [
  {
    id: "linnean", name: "Linnean", question: "How many species are there and how many do we know about?",
    action: "Detect &amp; describe more species", color: "#2c6b8f",
    hubTagline: "gaps in knowledge about formal species descriptions",
    img: "figures/Figure-S1_dark_diversity.png",
    stats: D => [
      { v: fmt.n(D.totals.sh_total), l: "Species hypotheses (SH codes)" },
      { v: fmt.pct(D.totals.pct_dark), l: "Cannot be named (“dark”)" },
      { v: `${fmt.n(D.totals.n_genera)} / ${fmt.n(D.totals.n_genglob)}`, l: "Genera observed / global" }
    ],
    detail(host, D) {
      const T = D.totals, L = D.linnean, GF = "#2166ac", GB = "#d95f02";
      // Row 1: named/dark donut + Canada-vs-GlobalFungi-wide ring
      host.appendChild(el("div.detail-grid", null, [
        withNote(card("Named vs. “dark” species hypotheses",
          donut(D.charts.linnean_named_dark.map((d, i) =>
            ({ label: d.label, value: d.value, color: i ? "#9e9e9e" : this.color })),
            { centerTop: fmt.pct(T.pct_named), centerBottom: "named" })),
          "A species hypothesis (SH) is a DNA-based stand-in for a species, defined in UNITE. " +
          "This ring splits the SH codes detected in Canada into those that can be matched to a " +
          "formal species name and those that cannot — the “dark” fraction that is known only as " +
          "a sequence."),
        withNote(card("Canada vs. the whole GlobalFungi database",
          donut([
            { label: "Canada (GlobalFungi)", value: T.gf_sh_can, color: this.color },
            { label: "Rest of GlobalFungi", value: T.gf_sh_glob - T.gf_sh_can, color: "#cdd6da" }
          ], { centerTop: fmt.pct(T.gf_sh_pct), centerBottom: "of global SH" })),
          "How much of the world's sequenced EcM fungal diversity has been seen in Canada: the " +
          "SH codes in the Canadian GlobalFungi data as a share of all EcM fungal SH codes " +
          "recorded in GlobalFungi worldwide.")
      ]));
      // Row 2: two Venn diagrams (SH codes, named species) by source
      host.appendChild(el("div.detail-grid", null, [
        withNote(card("SH codes: GlobalFungi vs GenBank",
          venn2(L.sh_venn.gf_only, L.sh_venn.shared, L.sh_venn.gb_only,
            { labelA: "GlobalFungi", labelB: "GenBank", colorA: GF, colorB: GB })),
          "Counts of SH codes recorded by GlobalFungi only, by GenBank only, and by both. " +
          "GlobalFungi compiles community soil-survey data; GenBank holds varied, often targeted " +
          "studies, so the two are separate sampling efforts."),
        withNote(card("Named species: GlobalFungi vs GenBank",
          venn2(L.sp_venn.gf_only, L.sp_venn.shared, L.sp_venn.gb_only,
            { labelA: "GlobalFungi", labelB: "GenBank", colorA: GF, colorB: GB })),
          "The same source comparison, restricted to SH codes that carry a formal species name.")
      ]));
      // Row 3: dark-diversity raster + GlobalFungi sampling points, own zoomable map
      const gfPts = (D.map_points || []).filter(p => p[2] === "GF");
      host.appendChild(withNote(mapCard("Dark EcM fungal richness, with GlobalFungi sampling — Web Mercator (zoomable)",
        "linnean-dark", elh => buildRasterMap(elh, D.rasters.dark,
          { points: gfPts, pointLabel: "GlobalFungi samples" })),
        "Modelled percentage of EcM fungal taxa that are undescribed (“dark”), from the " +
        "geospatial model of van Galen et al. (2025). Black dots mark GlobalFungi sampling " +
        "locations, so modelled dark diversity and sampling effort can be compared directly. " +
        "The Web Mercator projection inflates area towards the poles, so northern regions occupy " +
        "more of the map than their true ground area."));
      host.appendChild(note(
        `Of the <b>${fmt.n(T.sh_total)}</b> species hypotheses recorded in Canada, ` +
        `<b>${fmt.n(T.sh_named)}</b> (<b>${fmt.pct(T.pct_named)}</b>) carry a species name. The ` +
        `<b>${fmt.n(T.gf_sh_can)}</b> Canadian GlobalFungi SH codes represent ` +
        `<b>${fmt.pct(T.gf_sh_pct)}</b> of the <b>${fmt.n(T.gf_sh_glob)}</b> EcM fungal SH codes recorded ` +
        `in GlobalFungi worldwide. Species-level names are attached to ` +
        `<b>${fmt.pct(L.gf_named_pct)}</b> of Canadian GlobalFungi SH codes and ` +
        `<b>${fmt.pct(L.gb_named_pct)}</b> of Canadian GenBank SH codes.`,
        this.color));
    }
  },
  {
    id: "wallacean", name: "Wallacean", question: "Where do they occur?",
    action: "Fill geographic sampling gaps", color: "#d95f02",
    hubTagline: "gaps in knowledge about species’ geographic distributions",
    img: "figures/Figure-01_sampling_map.png",
    stats: D => [
      { v: fmt.n(D.totals.wall_gf_sp_median), l: "Median GlobalFungi records / species" },
      { v: fmt.pct(D.totals.wall_sh_single), l: "SH codes at a single site" },
      { v: fmt.n(D.n_sites), l: "Sampling sites" }
    ],
    detail(host, D) {
      // Sampling map in its own zoomable window
      host.appendChild(withNote(mapCard("Sampling sites across Canada — Web Mercator (zoomable)",
        "wallacean-map", elh => buildSamplingMap(elh)),
        "Each unique georeferenced location with an EcM fungal record in Canada, coloured by " +
        "data source. Use the toggle to show or hide each source; the legend gives the number of " +
        "locations per source."));
      // GlobalFungi vs GenBank shown as two sub-sections (% of taxa at a single site).
      // Bar width = pct_single (0-100); label shows the underlying count and total.
      const bySrc = src => D.wallacean.by_source.filter(x => x.dataset === src)
        .map(x => ({ label: x.level, value: x.pct_single, count: x.n_single, total: x.n }));
      const singleFmt = (v, d) => `${fmt.n(d.count)} of ${fmt.n(d.total)} (${v}%)`;
      const singleNote = src =>
        `The percentage of ${src} taxa recorded at exactly one location in Canada, at three ` +
        "taxonomic levels. A taxon recorded at a single location provides little information " +
        "about its geographic range.";
      host.appendChild(el("div.detail-grid", null, [
        withNote(card("GlobalFungi — % of taxa known from a single site",
          hbars(bySrc("GlobalFungi"), { accent: "#2166ac", max: 100, valueFmt: singleFmt })),
          singleNote("GlobalFungi")),
        withNote(card("GenBank — % of taxa known from a single site",
          hbars(bySrc("GenBank"), { accent: "#d95f02", max: 100, valueFmt: singleFmt })),
          singleNote("GenBank"))
      ]));
      // Bar width = percent of all GlobalFungi sampling sites; label shows the count too.
      host.appendChild(withNote(card("Most-sampled EcM fungal genera (GlobalFungi)",
        hbars(D.charts.wallacean_top_genera,
          { accent: this.color, max: D.totals.gf_site_count, valueFmt: pctOf(D.totals.gf_site_count, "sites") })),
        "The EcM fungal genera recorded at the greatest number of distinct GlobalFungi " +
        "sampling sites, as a percentage of all GlobalFungi sampling sites."));
      host.appendChild(note(
        `Half of the georeferenced GlobalFungi species have ` +
        `<b>${fmt.n(D.totals.wall_gf_sp_median)}</b> or fewer records nationally. Taxa recorded at a ` +
        `single location account for <b>${fmt.pct(D.totals.wall_gf_sh_single)}</b> of GlobalFungi SH ` +
        `codes and <b>${fmt.pct(D.totals.wall_gb_sh_single)}</b> of GenBank SH codes.`,
        this.color));
    }
  },
  {
    id: "prestonian", name: "Prestonian", question: "How abundant are they in space and through time?",
    action: "Track abundance over time", color: "#5c6b73", icon: "clock",
    hubTagline: "gaps in knowledge about abundance and population dynamics",
    stats: D => [
      { v: fmt.pct(D.totals.pres_pct_absent), l: "Species with no abundance time series" },
      { v: fmt.n(D.totals.pres_studies), l: "Matching BioTIME studies" },
      { v: fmt.n(D.totals.pres_matches), l: "Exact species matches" }
    ],
    detail(host, D) {
      host.appendChild(note(
        `Of the <b>${fmt.n(D.totals.sp_named)}</b> named EcM fungal species recorded in Canada, ` +
        `<b>${fmt.n(D.totals.pres_matches)}</b> appear in <b>BioTIME</b>, a global compilation of ` +
        `abundance time series, from <b>${fmt.n(D.totals.pres_studies)}</b> matching study. ` +
        `<b>${fmt.pct(D.totals.pres_pct_absent)}</b> of the named species have no BioTIME record.`,
        this.color));
      host.appendChild(withNote(card("Prestonian shortfall — summary metrics",
        metricsTable(D.summaries.prestonian)),
        "The full set of metrics for this shortfall: how many of the Canadian EcM fungal taxa " +
        "appear in BioTIME, a global compilation of abundance time series, and how many of those " +
        "have repeat sampling at the same location."));
    }
  },
  {
    id: "darwinian", name: "Darwinian", question: "How have they evolved?",
    action: "Sequence more genomes", color: "#6a51a3", icon: "dna",
    hubTagline: "gaps in knowledge about the evolution of species lineages",
    stats: D => [
      { v: fmt.pct(D.totals.darw_pct_absent), l: "Species with no sequenced genome" },
      { v: fmt.pct(D.totals.darw_genera_pct), l: "Genera with genome data" },
      { v: `${fmt.n(D.totals.darw_genera_n)} / ${fmt.n(D.totals.n_genera)}`, l: "Genera in MycoCosm" }
    ],
    detail(host, D) {
      host.appendChild(el("div.detail-grid", null, [
        withNote(card("Genera with vs. without a sequenced genome",
          donut([
            { label: "With genome", value: D.totals.darw_genera_n, color: this.color },
            { label: "No genome", value: D.totals.n_genera - D.totals.darw_genera_n, color: "#9e9e9e" }
          ], { centerTop: fmt.pct(D.totals.darw_genera_pct), centerBottom: "of genera" })),
          "Of the EcM fungal genera recorded in Canada, how many have at least one genome in " +
          "MycoCosm, a fungal genome portal. Genome data support evolutionary and functional " +
          "analyses that a barcode alone cannot."),
        withNote(card("Canadian EcM fungal genera by MycoCosm genomes (top 20)",
          hbars(D.charts.darwinian_top_genera, { accent: this.color, unit: "" })),
          "Number of MycoCosm genomes per Canadian EcM fungal genus, for the 20 genera with the " +
          "most genomes.")
      ]));
      host.appendChild(note(
        `<b>${fmt.pct(D.totals.darw_genera_pct)}</b> of the EcM fungal genera recorded in Canada have ` +
        `at least one MycoCosm genome. <b>${fmt.pct(D.totals.darw_pct_absent)}</b> of the named EcM ` +
        `fungal species have none.`,
        this.color));
    }
  },
  {
    id: "raunkiaeran", name: "Raunkiæran", question: "What are their traits and functions?",
    action: "Document functional traits", color: "#1a9850", icon: "trait",
    hubTagline: "gaps in knowledge about species traits and functions",
    stats: D => [
      { v: fmt.pct(D.totals.raunk_morph_max), l: "Morphological-trait coverage" },
      { v: fmt.pct(D.totals.raunk_host_pct), l: "Host-specificity coverage" },
      { v: fmt.n(D.totals.n_genera), l: "Genera assessed" }
    ],
    detail(host, D) {
      // Blue vs orange (not green vs red) so the two trait classes stay
      // distinguishable with any form of colour-vision deficiency.
      const cov = D.charts.raunk_coverage.map(d => ({
        label: d.label, value: d.pct, n_doc: d.n_doc, n_total: d.n_total,
        color: d.class === "Morphological/structural" ? "#2166ac" : "#d95f02"
      })).sort((a, b) => a.value - b.value);
      host.appendChild(withNote(card("Table 4 — % of Canadian EcM fungal genera with each trait documented",
        hbars(cov, { accent: this.color, max: 100,
          valueFmt: (v, d) => `${fmt.n(d.n_doc)} of ${fmt.n(d.n_total)} (${v}%)` })),
        "How completely each FungalTraits trait is filled in for the EcM fungal genera found in " +
        "Canada. Blue bars are morphological/structural traits, orange bars are " +
        "ecological/interaction traits — the split that drives this shortfall."));
      // Bars are scaled to the total genera assessed (n = nTot), so each bar's
      // width reads as that category's share of all assessed genera, not just
      // relative to the largest category.
      const nTot = D.totals.n_genera;
      const traitFmt = v => `${v} of ${nTot} (${Math.round(100 * v / nTot)}%)`;
      host.appendChild(el("div.detail-grid", null, [
        withNote(card("Fruitbody types (share of all genera assessed)",
          hbars(D.charts.raunk_fruitbody, { accent: this.color, max: nTot, valueFmt: traitFmt })),
          "What the documented morphological trait data actually contain: the mix of fruiting-body " +
          "forms across the " + nTot + " EcM fungal genera assessed. Bars are scaled to that total, " +
          "so each bar's length is its share of all genera."),
        withNote(card("Exploration types (share of all genera assessed)",
          hbars(D.charts.raunk_exploration, { accent: "#6a51a3", max: nTot, valueFmt: traitFmt })),
          "Mycelial “exploration type” describes how far a fungus forages from the root tip, and " +
          "is the trait most likely to link EcM fungi to nutrient cycling. Bars are scaled to all " +
          nTot + " genera assessed.")
      ]));
      host.appendChild(note(
        `Morphological/structural traits (blue) are documented for up to ` +
        `<b>${fmt.pct(D.totals.raunk_morph_max)}</b> of the <b>${fmt.n(D.totals.n_genera)}</b> genera ` +
        `assessed; ecological/interaction traits (orange) for up to ` +
        `<b>${fmt.pct(D.totals.raunk_host_pct)}</b>. FungalTraits does not record enzymatic or ` +
        `carbon-acquisition traits.`,
        this.color));
    }
  },
  {
    id: "hutchinsonian", name: "Hutchinsonian", question: "What are their abiotic niches?",
    action: "Sample more climate space", color: "#c0392b",
    hubTagline: "gaps in knowledge about abiotic niches",
    img: "figures/Figure-03_climate_gap.png",
    stats: D => [
      { v: `${fmt.n(D.totals.hutch_ez_total - D.totals.hutch_ez_samp)} / ${fmt.n(D.totals.hutch_ez_total)}`, l: "Ecozones unsampled" },
      { v: `${fmt.n(D.totals.hutch_ez_30)} / ${fmt.n(D.totals.hutch_ez_total)}`, l: "Ecozones with ≥30 sites" },
      { v: fmt.n(D.n_sites), l: "Sampling sites" }
    ],
    detail(host, D) {
      // Figure 3, made interactive: three map + climate-space pairs. Moving the
      // cursor over a map highlights that location's climate zone in the chart.
      host.appendChild(el("div.subhead",
        { text: "Climate space (Figure 3) — hover a map to locate that place in climate space" }));
      ["freq", "gf", "comb"].forEach(s => buildClimatePanel(host, s, D));

      // Interactive ecozone vector map (Albers equal-area)
      host.appendChild(withNote(mapCard("Ecozones — click a location for its GlobalFungi / GenBank sample counts",
        "hutch-ecozone", elh => buildEcozoneMap(elh, this.color)),
        "Canada's 15 terrestrial ecozones, drawn in the equal-area Albers projection used by the " +
        "manuscript and coloured with the official Environment Canada palette. Click anywhere to " +
        "highlight that ecozone and see how many GlobalFungi and GenBank samples it contains. " +
        "Ecozones stand in for the soil and physiographic variation that climate alone misses."));
      // Sampling sites per ecozone, split GlobalFungi vs GenBank. Bar width is
      // each ecozone's share of all sampling sites in the country (both sources
      // combined), so ecozones are directly comparable as a percentage.
      // Sampling density per ecozone (Table S1, SM1 document): unique locations
      // per 10,000 km², split by source, on a fixed 0-30 axis.
      host.appendChild(withNote(card("Sampling density per ecozone — GlobalFungi vs GenBank (Table S1)",
        stackBars(D.charts.hutch_ecozones, [
          { key: "gf_density", label: "GlobalFungi", color: "#2166ac" },
          { key: "gb_density", label: "GenBank", color: "#d95f02" }
        ], { max: 30, valueFmt: (v, r) => `${r.density_total.toFixed(1)} / 10,000 km²` })),
        "Unique sampling locations per 10,000 km² of ecozone area, split by data source " +
        "(Table S1 of the Supplemental Materials). The axis is capped at 30 locations per " +
        "10,000 km²."));
      host.appendChild(note(
        `<b>${fmt.n(D.totals.hutch_ez_total - D.totals.hutch_ez_samp)}</b> of ` +
        `${fmt.n(D.totals.hutch_ez_total)} ecozones contain no samples; ` +
        `<b>${fmt.n(D.totals.hutch_ez_30)}</b> contain at least 30 sampling sites. Per-ecozone ` +
        `sampling density by data source is shown below.`,
        this.color));
    }
  },
  {
    id: "eltonian", name: "Eltonian", question: "Who do they interact with?",
    action: "Sample more host species", color: "#b8860b",
    hubTagline: "gaps in knowledge about species interactions",
    img: "figures/Figure-04_host_bivariate_map.png",
    stats: D => [
      { v: fmt.pct(D.totals.elt_host_pct), l: "Host species with partner data" },
      { v: `${fmt.n(D.totals.elt_genera_host)} / ${fmt.n(D.totals.n_genera)}`, l: "Genera with ≥1 host" }
    ],
    detail(host, D) {
      const T = D.totals;
      const MISS = "#9e9e9e";   // shared "missing/no info" grey, matches Linnean/Darwinian donuts

      // ---- How prevalent is host information in the source data? (the fungal,
      // not plant-host, perspective -- how often can a detected fungus actually
      // be pinned to a host, and how confidently).
      const gfTotal = T.elt_gf_samples_total, gfHost = T.elt_gf_host_samples,
            gfNoHost = gfTotal - gfHost;
      const gbTotal = T.elt_gb_total, gbHost = T.elt_gb_host, gbNoHost = gbTotal - gbHost;
      const canNoHost = T.sp_named - T.elt_named_host_can,
            globNoHost = T.sp_named - T.elt_named_host_glob;
      host.appendChild(el("div.subhead",
        { text: "How prevalent is host information in the source data?" }));
      host.appendChild(el("div.detail-grid", null, [
        withNote(card("GlobalFungi samples: host information recorded",
          donut([
            { label: "Recorded", value: gfHost, color: "#2166ac" },
            { label: "Missing", value: gfNoHost, color: MISS }
          ], { centerTop: fmt.pct(100 * gfHost / gfTotal), centerBottom: "recorded" })),
          `Of the ${fmt.n(gfTotal)} GlobalFungi samples in Canada with at least one EcM fungal ` +
          "detection, this shows how many carry a “dominant plant species” entry — the metadata " +
          "field a potential host is read from — versus how many do not."),
        withNote(card("GenBank records: host taxon recorded",
          donut([
            { label: "Recorded", value: gbHost, color: "#d95f02" },
            { label: "Missing", value: gbNoHost, color: MISS }
          ], { centerTop: fmt.pct(100 * gbHost / gbTotal), centerBottom: "recorded" })),
          `Of the ${fmt.n(gbTotal)} GenBank EcM fungal records for Canada, this shows how many ` +
          "carry a value in the structured “host” field versus how many do not.")
      ]));
      host.appendChild(withNote(card("Of GlobalFungi samples with host information, source tissue",
        hbars(D.charts.elt_gf_tissue, { accent: this.color, max: gfHost, valueFmt: pctOf(gfHost, "samples") })),
        "Among the GlobalFungi samples that do carry a dominant-plant-species entry, the sample " +
        "type it was recorded from. A soil sample only lets the host be inferred as the nearest " +
        "plant; a root sample lets the host be attributed directly."));
      host.appendChild(el("div.detail-grid", null, [
        withNote(card("Named EcM fungal species with host information — Canada",
          donut([
            { label: "Has host info", value: T.elt_named_host_can, color: this.color },
            { label: "No host info", value: canNoHost, color: MISS }
          ], { centerTop: fmt.pct(100 * T.elt_named_host_can / T.sp_named), centerBottom: "have host info" })),
          `Of the ${fmt.n(T.sp_named)} named EcM fungal species detected in Canada, how many have ` +
          "at least one documented host species from records within Canada."),
        withNote(card("Named EcM fungal species with host information — documented anywhere",
          donut([
            { label: "Has host info", value: T.elt_named_host_glob, color: this.color },
            { label: "No host info", value: globNoHost, color: MISS }
          ], { centerTop: fmt.pct(100 * T.elt_named_host_glob / T.sp_named), centerBottom: "have host info" })),
          `The same ${fmt.n(T.sp_named)} named species, now counting a documented host from ` +
          "GlobalFungi root samples or GenBank records anywhere in the world, not just Canada.")
      ]));
      host.appendChild(note(
        `Of the <b>${fmt.n(gfTotal)}</b> GlobalFungi samples with an EcM fungal detection, ` +
        `<b>${fmt.pct(100 * gfNoHost / gfTotal)}</b> lack any recorded dominant plant species. ` +
        `Where a species is recorded, <b>${fmt.pct(100 * D.charts.elt_gf_tissue.find(t => t.label === "Soil")?.value / gfHost)}</b> ` +
        `came from soil (host inferred) and <b>${fmt.pct(100 * D.charts.elt_gf_tissue.find(t => t.label === "Root")?.value / gfHost)}</b> ` +
        `from root tissue (host directly attributable). Among <b>${fmt.n(gbTotal)}</b> GenBank EcM ` +
        `fungal records, <b>${fmt.pct(100 * gbNoHost / gbTotal)}</b> lack host-taxon information. ` +
        `Host information is absent in Canada for <b>${fmt.pct(100 * canNoHost / T.sp_named)}</b> of ` +
        `the <b>${fmt.n(T.sp_named)}</b> named species detected here, and ` +
        `<b>${fmt.pct(100 * globNoHost / T.sp_named)}</b> have no host documented anywhere.`,
        this.color));

      // Figure 4, split into tree vs non-tree hosts: for each group, a richness
      // map and a data-coverage map, each its own zoomable Mercator raster.
      const richNote = grp =>
        `Estimated number of ${grp} EcM host plant species per 0.5° grid cell, from BIEN2 ` +
        "modelled ranges. These are the host species available for EcM fungal interactions.";
      const covNote = grp =>
        `Of the ${grp} host species predicted to occur in each cell, the proportion with at ` +
        "least one recorded EcM fungal partner in Canada. Compare with the richness map on the " +
        "left, which shows how many host species are present in the same cell.";
      host.appendChild(el("div.subhead", { text: "Non-tree hosts (shrubs & herbaceous)" }));
      host.appendChild(el("div.detail-grid", null, [
        withNote(mapCard("Non-tree host species richness — zoomable",
          "elt-nt-rich", elh => buildRasterMap(elh, D.rasters.nontree_richness)), richNote("non-tree")),
        withNote(mapCard("Non-tree hosts with an EcM fungal record — zoomable",
          "elt-nt-cov", elh => buildRasterMap(elh, D.rasters.nontree_coverage)), covNote("non-tree"))
      ]));
      host.appendChild(el("div.subhead", { text: "Tree hosts" }));
      host.appendChild(el("div.detail-grid", null, [
        withNote(mapCard("Tree host species richness — zoomable",
          "elt-tr-rich", elh => buildRasterMap(elh, D.rasters.tree_richness)), richNote("tree")),
        withNote(mapCard("Tree hosts with an EcM fungal record — zoomable",
          "elt-tr-cov", elh => buildRasterMap(elh, D.rasters.tree_coverage)), covNote("tree"))
      ]));
      host.appendChild(el("div.detail-grid", null, [
        withNote(card("Best-documented host-genus × fungal-genus pairs (top 20)",
          hbars(D.charts.elt_top_pairs, { accent: this.color, unit: "" })),
          "The host-genus × fungal-genus combinations with the greatest number of recorded " +
          "occurrences in the Canadian dataset."),
        withNote(card("Host species with fungal-partner records — by scope",
          hbars([
            { label: "In Canada", value: T.elt_host_canada, color: this.color },
            { label: "GlobalFungi (worldwide roots)", value: T.elt_host_gf_global, color: "#2166ac" },
            { label: "GenBank (worldwide)", value: T.elt_host_gb_global, color: "#d95f02" }
          ], { max: T.elt_host_denom, valueFmt: pctOf(T.elt_host_denom, "hosts") })),
          `How many of Canada's ${fmt.n(T.elt_host_denom)} native EcM host plant species have at ` +
          "least one documented fungal partner: counted from records within Canada, and from " +
          "records anywhere in the world.")
      ]));
      host.appendChild(note(
        `<b>${fmt.pct(T.elt_host_pct)}</b> of the <b>${fmt.n(T.elt_host_denom)}</b> native EcM host ` +
        `species have at least one documented fungal partner in Canada. Named EcM fungal species ` +
        `with at least one documented host: <b>${fmt.n(T.elt_named_host_can)}</b> within Canada, ` +
        `<b>${fmt.n(T.elt_named_host_glob)}</b> using worldwide records.`,
        this.color));
    }
  }
];

/* ---- a compact metric/value table from a summaries array ------------------ */
function metricsTable(rows) {
  const t = el("table.metrics");
  t.appendChild(el("thead", null, el("tr", null, [
    el("th", { text: "Metric" }), el("th", { text: "Value" })])));
  const tb = el("tbody");
  (rows || []).forEach(r => tb.appendChild(el("tr", null, [
    el("td", { text: ecmText(r.metric) }), el("td.num", { text: r.value })])));
  t.appendChild(tb);
  return t;
}
