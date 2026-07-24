# =============================================================================
# sync_inputs.R  --  Refresh the dashboard's data + figure snapshot
# =============================================================================
#
# WHAT THIS DOES
# --------------
# The dashboard is a *self-contained* project: it renders from a small snapshot
# of summary tables (data/) and map figures (figures/) rather than from the full
# ~1.4 GB manuscript pipeline output. This script copies exactly the files the
# dashboard needs out of a manuscript checkout, so that a routine update is just:
#
#     1. Re-run the manuscript pipeline (scripts/run_all.R) so data_derived/
#        and figures/ are current.
#     2. Run THIS script, pointing SOURCE_ROOT at that manuscript checkout.
#     3. Re-render dashboard.qmd.
#
# It also reduces the large primary dataset (emf_canada_em_only.csv, one row per
# fungal detection) down to a tiny map_points.csv (one row per unique sampling
# site x data source) so the snapshot stays small.
#
# Every run writes data/MANIFEST.csv recording what was copied, when, from where,
# and each file's size + modification time -- a provenance trail so you always
# know how fresh the dashboard is.
#
# HOW TO RUN
# ----------
#   # from the ECM_dashboard/ directory:
#   Rscript R/sync_inputs.R  /path/to/ECM_manuscript
#
#   # or interactively, editing the default below and calling:
#   source("R/sync_inputs.R")
#
# Only base R + readr are required (no pipeline dependencies).
# =============================================================================

suppressPackageStartupMessages(library(readr))

# ---------------------------------------------------------------------------
# 1. Locate the manuscript checkout (the SOURCE of truth).
#    Priority: command-line argument > environment variable > default guess.
#    The default assumes this dashboard lives at <manuscript>/temp/ECM_dashboard.
# ---------------------------------------------------------------------------
args <- commandArgs(trailingOnly = TRUE)
SOURCE_ROOT <- if (length(args) >= 1) {
  args[[1]]
} else if (nzchar(Sys.getenv("ECM_MANUSCRIPT_ROOT"))) {
  Sys.getenv("ECM_MANUSCRIPT_ROOT")
} else {
  normalizePath(file.path(getwd(), "..", ".."), mustWork = FALSE)  # temp/ECM_dashboard -> project root
}

# Dashboard root = directory that contains this script's parent (R/).
DASH_ROOT <- if (interactive()) getwd() else normalizePath(file.path(dirname(sub("--file=", "",
  grep("--file=", commandArgs(FALSE), value = TRUE)[1])), ".."), mustWork = FALSE)
if (is.na(DASH_ROOT) || !dir.exists(file.path(DASH_ROOT, "R"))) DASH_ROOT <- getwd()

src_data <- file.path(SOURCE_ROOT, "data_derived")
src_figs <- file.path(SOURCE_ROOT, "figures")
dst_data <- file.path(DASH_ROOT, "data")
dst_figs <- file.path(DASH_ROOT, "figures")

message("Manuscript source : ", SOURCE_ROOT)
message("Dashboard target  : ", DASH_ROOT)

if (!dir.exists(src_data))
  stop("Could not find data_derived/ under SOURCE_ROOT.\n",
       "Pass the manuscript path explicitly, e.g.:\n",
       "  Rscript R/sync_inputs.R /path/to/ECM_manuscript")

# ---------------------------------------------------------------------------
# 2. The manifest of summary tables to copy (relative to data_derived/).
#    These are the SAME files the manuscript reads for its in-text statistics
#    and tables -- the dashboard therefore never diverges from the paper.
#    Add a line here if a new shortfall metric table is needed on the dashboard.
# ---------------------------------------------------------------------------
data_files <- c(
  "linnean/linnean_summary.csv",
  "linnean/linnean_genus_coverage.csv",
  "wallacean/wallacean_sampling_intensity.csv",
  "wallacean/wallacean_locs_per_species.csv",
  "wallacean/wallacean_locs_per_genus.csv",
  "prestonian/prestonian_summary.csv",
  "darwinian/darwinian_summary.csv",
  "darwinian/darwinian_genus_summary.csv",
  "raunkiaeran/raunkiaeran_trait_coverage.csv",
  "raunkiaeran/raunkiaeran_trait_distributions.csv",
  "hutchinsonian/hutchinsonian_ecozone_summary.csv",
  "hutchinsonian/hutchinsonian_ecozone_sample_counts.csv",
  "eltonian/eltonian_summary.csv",
  "eltonian/eltonian_genus_occurrence_counts.csv",
  "checkpoints/gf_global_comparator_cheap.csv"   # GlobalFungi-WIDE comparators (12,970 SH etc.)
)

# Figures used as showcase / embedded maps (relative to figures/). PNG = good
# web resolution; already drawn in the manuscript's Canada Albers projection.
fig_files <- c(
  "Figure-01_sampling_map.png",
  "Figure-02_wallacean_occupancy.png",
  "Figure-03_climate_gap.png",
  "Figure-04_host_bivariate_map.png",
  "Figure-S1_dark_diversity.png",
  "Figure-S4_ecozone_sampling_map.png"
)

# ---------------------------------------------------------------------------
# 3. Copy helper: copies one file, preserving the sub-directory structure, and
#    returns a manifest row (or a warning row if the source is missing).
# ---------------------------------------------------------------------------
copy_one <- function(rel, src_base, dst_base, category) {
  src <- file.path(src_base, rel)
  dst <- file.path(dst_base, rel)
  if (!file.exists(src)) {
    warning("MISSING: ", src, call. = FALSE)
    return(data.frame(category = category, file = rel, status = "MISSING",
                      bytes = NA, source_mtime = NA, stringsAsFactors = FALSE))
  }
  dir.create(dirname(dst), recursive = TRUE, showWarnings = FALSE)
  file.copy(src, dst, overwrite = TRUE, copy.date = TRUE)
  data.frame(category = category, file = rel, status = "ok",
             bytes = file.info(src)$size,
             source_mtime = format(file.mtime(src), "%Y-%m-%d %H:%M:%S"),
             stringsAsFactors = FALSE)
}

manifest <- rbind(
  do.call(rbind, lapply(data_files, copy_one, src_data, dst_data, "data")),
  do.call(rbind, lapply(fig_files,  copy_one, src_figs, dst_figs, "figure"))
)

# ---------------------------------------------------------------------------
# 4. Reduce the primary dataset to a small map-points file.
#    emf_canada_em_only.csv is one row per detection; the sampling map only
#    needs unique georeferenced sites and their data source. We keep lat/lon
#    rounded to 3 dp ("sites", per the manuscript convention) + source.
# ---------------------------------------------------------------------------
emf_path <- file.path(src_data, "emf_canada_em_only.csv")
if (file.exists(emf_path)) {
  emf <- read_csv(emf_path, show_col_types = FALSE,
                  col_select = c("lat", "lon", "source", "coord_in_canada"))
  # Keep only coordinates that actually fall within Canada. GenBank records can
  # carry a Canada country tag but an out-of-country lat/lon (e.g. a US or ocean
  # point); `coord_in_canada` (set by the pipeline) flags the valid ones. Using
  # `%in% TRUE` also drops NA. This matches the manuscript's mapped sample set.
  ok  <- !is.na(emf$lat) & !is.na(emf$lon) & (emf$coord_in_canada %in% TRUE)
  pts <- emf[ok, c("lat", "lon", "source")]
  pts$lat <- round(pts$lat, 3)
  pts$lon <- round(pts$lon, 3)
  pts <- unique(pts)
  write_csv(pts, file.path(dst_data, "map_points.csv"))
  manifest <- rbind(manifest, data.frame(
    category = "data", file = "map_points.csv (derived from emf_canada_em_only.csv)",
    status = "ok", bytes = NA,
    source_mtime = format(file.mtime(emf_path), "%Y-%m-%d %H:%M:%S"),
    stringsAsFactors = FALSE))
  message("map_points.csv: ", nrow(pts), " unique site x source rows")
} else {
  warning("MISSING primary dataset: ", emf_path, call. = FALSE)
}

# ---------------------------------------------------------------------------
# 5. Build the front-end data bundle: data/dashboard_data.js
#    The JavaScript dashboard loads a SINGLE file that assigns window.ECM_DATA.
#    Writing it as a .js (not .json) means the dashboard also works when opened
#    directly from the file system (no web server / fetch needed). Everything
#    here is read from the CSVs we just copied, so the manuscript pipeline stays
#    the single source of truth.
# ---------------------------------------------------------------------------
if (requireNamespace("jsonlite", quietly = TRUE)) {
  rd <- function(...) {                     # read a copied snapshot CSV or NULL
    p <- file.path(dst_data, ...)
    if (file.exists(p)) suppressWarnings(read_csv(p, show_col_types = FALSE)) else NULL
  }
  gv <- function(df, m) {                   # value for an exact metric string
    if (is.null(df)) return(NA)
    x <- df$value[trimws(df$metric) == m]; if (length(x) == 0) NA else x[[1]]
  }
  num <- function(x) suppressWarnings(as.numeric(x))
  clean <- function(x) tools::toTitleCase(gsub("_", " ", x))

  linn <- rd("linnean", "linnean_summary.csv")
  lgen <- rd("linnean", "linnean_genus_coverage.csv")
  wint <- rd("wallacean", "wallacean_sampling_intensity.csv")
  wgen <- rd("wallacean", "wallacean_locs_per_genus.csv")
  pres <- rd("prestonian", "prestonian_summary.csv")
  darw <- rd("darwinian", "darwinian_summary.csv")
  dgen <- rd("darwinian", "darwinian_genus_summary.csv")
  rcov <- rd("raunkiaeran", "raunkiaeran_trait_coverage.csv")
  rdis <- rd("raunkiaeran", "raunkiaeran_trait_distributions.csv")
  hcnt <- rd("hutchinsonian", "hutchinsonian_ecozone_sample_counts.csv")
  hsum <- rd("hutchinsonian", "hutchinsonian_ecozone_summary.csv")
  elts <- rd("eltonian", "eltonian_summary.csv")
  egen <- rd("eltonian", "eltonian_genus_occurrence_counts.csv")
  gfw  <- rd("checkpoints", "gf_global_comparator_cheap.csv")   # GlobalFungi-wide

  sh_total <- num(gv(linn, "Unique UNITE v10 SH codes (combined dataset, all records)"))
  sh_named <- num(gv(linn, "Named-species SH codes: total unique across GF + GenBank (regardless of coords)"))
  gf_sh_can <- num(gv(linn, "GlobalFungi: unique SH codes (Canadian dataset)"))
  gf_sh_glob <- num(gv(gfw, "EcM SH codes detected (GlobalFungi-wide, matrix presence)"))
  hrow <- if (!is.null(hsum)) hsum[hsum$definition == "GF + GenBank combined, raw unique locations", ] else NULL

  # A helper for a 2-set overlap ("Venn") from three summary metrics.
  venn3 <- function(gf_only, shared, gb_only)
    list(gf_only = num(gv(linn, gf_only)), shared = num(gv(linn, shared)), gb_only = num(gv(linn, gb_only)))

  # Per-taxon-level helper for the Wallacean table
  wtab <- if (!is.null(wint)) lapply(seq_len(nrow(wint)), function(i) list(
      dataset = wint$dataset[i], level = wint$taxonomic_level[i],
      n = wint$n_taxa[i], mean = round(wint$mean_locs[i], 1),
      median = wint$median_locs[i], max = wint$max_locs[i],
      single = wint$n_single_location[i], pct_single = wint$pct_single_location[i])) else list()

  rows <- function(df) if (is.null(df)) list() else
    lapply(seq_len(nrow(df)), function(i) list(metric = df$metric[i], value = as.character(df$value[i])))

  bundle <- list(
    meta = list(synced = format(Sys.time(), "%Y-%m-%d"), source = SOURCE_ROOT),
    totals = list(
      sh_total = sh_total, sh_named = sh_named, sh_dark = sh_total - sh_named,
      sp_named = num(gv(linn, "Unique named species (UNITE taxonomy, excl. _sp; combined dataset)")),
      n_genera = num(gv(linn, "EcM genera observed in Canada")),
      n_genglob = num(gv(linn, "Known EcM genera globally (FungalTraits)")),
      pct_genglob = num(gv(linn, "% of global EcM genera observed in Canada")),
      pct_dark = round(100 * (sh_total - sh_named) / sh_total, 1),
      pct_named = round(100 * sh_named / sh_total, 1),
      wall_sh_single = num(wint$pct_single_location[wint$dataset == "Combined" & wint$taxonomic_level == "SH code"]),
      wall_sp_single = num(wint$pct_single_location[wint$dataset == "Combined" & wint$taxonomic_level == "Species"]),
      wall_gf_sp_median = num(wint$median_locs[wint$dataset == "GlobalFungi" & wint$taxonomic_level == "Species"]),
      pres_pct_absent = num(gv(pres, "% of our EcM named taxa absent from BioTIME")),
      pres_studies = num(gv(pres, "BioTIME studies containing matched EcM taxa")),
      pres_matches = num(gv(pres, "BioTIME species matching our EcM species (exact)")),
      darw_pct_absent = num(gv(darw, "% of our EcM species absent from MycoCosm")),
      darw_genera_pct = num(gv(darw, "% of our EcM genera with genome data")),
      darw_genera_n = num(gv(darw, "EcM genera with genome data in MycoCosm")),
      raunk_host_pct = num(rcov$pct_documented[rcov$trait == "specific_hosts"]),
      raunk_morph_max = max(rcov$pct_documented[rcov$trait_class == "Morphological/structural"]),
      hutch_ez_total = if (!is.null(hrow)) hrow$n_ecozones[1] else NA,
      hutch_ez_samp  = if (!is.null(hrow)) hrow$ecozones_ge1[1] else NA,
      hutch_ez_30    = if (!is.null(hrow)) hrow$ecozones_ge30[1] else NA,
      elt_host_pct = num(gv(elts, "% of Canadian EcM host species with any documented fungal association in Canada (paired with fungal genus)")),
      elt_empty_pct = num(gv(elts, "% of full host x named-species matrix cells empty")),
      elt_genera_host = num(gv(elts, "Canadian EcM fungal genera with >= 1 documented host species in Canada")),
      # GlobalFungi Canada vs GlobalFungi-wide (the "16% of 12,970" comparison)
      gf_sh_can = gf_sh_can, gf_sh_glob = gf_sh_glob,
      gf_sh_pct = if (!is.na(gf_sh_glob) && gf_sh_glob > 0) round(100 * gf_sh_can / gf_sh_glob, 1) else NA,
      gf_gen_glob = num(gv(gfw, "EcM genera detected (GlobalFungi-wide, matrix presence)")),
      gf_sp_glob  = num(gv(gfw, "EcM named species detected (GlobalFungi-wide, matrix presence)")),
      # Wallacean single-location by source (GlobalFungi vs GenBank)
      wall_gf_sh_single = num(wint$pct_single_location[wint$dataset == "GlobalFungi" & wint$taxonomic_level == "SH code"]),
      wall_gb_sh_single = num(wint$pct_single_location[wint$dataset == "GenBank" & wint$taxonomic_level == "SH code"]),
      # Eltonian host coverage by source / scope
      elt_host_gf_global = num(gv(elts, "Canadian host species recorded as hosts in GlobalFungi root samples anywhere in the world")),
      elt_host_gb_global = num(gv(elts, "Canadian host species recorded as hosts in GenBank EcM records anywhere in the world")),
      elt_named_host_can = num(gv(elts, "Named EcM fungal species with >= 1 documented host species (Canada scope)")),
      elt_named_host_glob = num(gv(elts, "Named EcM fungal species with >= 1 documented host species (global scope; GlobalFungi root + GenBank worldwide)")),
      elt_host_canada = num(gv(elts, "Canadian host species with >= 1 observed EcM-fungus association in Canada (paired with fungal genus)")),
      elt_host_denom = num(gv(elts, "Canadian EcM host plant species (denominator: BIEN-based native list)")),
      # Denominators for percent-of-total bar charts (see charts.js hbars()).
      darw_myco_total = num(gv(darw, "MycoCosm records matching our EcM genera")),
      elt_pairs_total = if (!is.null(egen)) sum(egen$n_occurrences, na.rm = TRUE) else NA,
      gf_site_count = if (exists("pts")) sum(pts$source == "GlobalFungi") else NA,
      gb_site_count = if (exists("pts")) sum(pts$source == "GenBank") else NA
    ),
    # ---- GlobalFungi vs GenBank overlaps (2-set "Venn" counts) --------------
    linnean = list(
      sh_venn = venn3("All SH codes: GlobalFungi only (not in GenBank)",
                      "All SH codes: shared between GlobalFungi and GenBank",
                      "All SH codes: GenBank only (not in GlobalFungi)"),
      sp_venn = venn3("Unique named species: GlobalFungi only",
                      "Unique named species: shared between GlobalFungi and GenBank",
                      "Unique named species: GenBank only"),
      gf_named_pct = num(gv(linn, "GlobalFungi: SH codes with species-level name (% of GF Canadian SHs)")),
      gb_named_pct = num(gv(linn, "GenBank: SH codes with species-level name (% of GenBank Canadian SHs)"))
    ),
    # ---- Wallacean: GlobalFungi vs GenBank sampling intensity by level ------
    wallacean = list(
      by_source = if (!is.null(wint)) {
        w <- wint[wint$dataset %in% c("GlobalFungi", "GenBank"), ]
        lapply(seq_len(nrow(w)), function(i) list(dataset = w$dataset[i], level = w$taxonomic_level[i],
          median = w$median_locs[i], pct_single = w$pct_single_location[i], n = w$n_taxa[i],
          n_single = w$n_single_location[i])) } else list()
    ),
    charts = list(
      linnean_named_dark = list(
        list(label = "Named", value = sh_named),
        list(label = "Dark (unnamed)", value = sh_total - sh_named)),
      linnean_genus_cov = list(
        list(label = "Observed in Canada", value = if (!is.null(lgen)) sum(lgen$observed_in_canada) else NA),
        list(label = "Not yet observed",  value = if (!is.null(lgen)) sum(!lgen$observed_in_canada) else NA)),
      wallacean_intensity = wtab,
      wallacean_top_genera = if (!is.null(wgen)) {
        g <- wgen[wgen$dataset == "GlobalFungi", ]; g <- g[order(-g$n_locations), ][seq_len(min(15, nrow(g))), ]
        lapply(seq_len(nrow(g)), function(i) list(label = g$genus[i], value = g$n_locations[i])) } else list(),
      darwinian_top_genera = if (!is.null(dgen)) {
        g <- dgen[order(-dgen$n_genomes), ][seq_len(min(20, nrow(dgen))), ]
        lapply(seq_len(nrow(g)), function(i) list(label = clean(g$genus[i]), value = g$n_genomes[i])) } else list(),
      raunk_coverage = if (!is.null(rcov)) lapply(seq_len(nrow(rcov)), function(i) list(
        label = rcov$trait_label[i], class = rcov$trait_class[i],
        n_doc = rcov$n_documented[i], n_total = rcov$n_total[i], pct = rcov$pct_documented[i])) else list(),
      raunk_fruitbody = if (!is.null(rdis)) {
        f <- rdis[rdis$trait == "fruitbody_type_template", ]
        lapply(seq_len(nrow(f)), function(i) list(label = clean(f$value[i]), value = f$n_genera[i])) } else list(),
      raunk_exploration = if (!is.null(rdis)) {
        e <- rdis[rdis$trait == "ectomycorrhiza_exploration_type_template" & rdis$value != "unknown", ]
        lapply(seq_len(nrow(e)), function(i) list(label = clean(e$value[i]), value = e$n_genera[i])) } else list(),
      # Sampling density per ecozone, on the same basis as Table S1 (SM1): raw
      # unique locations / area in 10,000 km^2 (NOT the 3-decimal-binned
      # "sites" used elsewhere), ordered by decreasing combined density.
      hutch_ecozones = if (!is.null(hcnt)) {
        h <- hcnt[order(-hcnt$density_total), ]
        gb_density <- (h$total_locations - h$gf_locations) / h$area_km2 * 10000
        lapply(seq_len(nrow(h)), function(i) list(
          label = h$ecozone[i],
          gf_loc = h$gf_locations[i], gb_loc = h$gb_locations[i], total_loc = h$total_locations[i],
          area_km2 = round(h$area_km2[i]),
          gf_density = round(h$density_gf[i], 2), gb_density = round(gb_density[i], 2),
          density_total = round(h$density_total[i], 2))) } else list(),
      elt_top_pairs = if (!is.null(egen)) {
        e <- egen[order(-egen$n_occurrences), ][seq_len(min(20, nrow(egen))), ]
        lapply(seq_len(nrow(e)), function(i) list(label = paste0(e$host_genus[i], " × ", e$fungal_genus[i]),
          value = e$n_occurrences[i])) } else list()
    ),
    summaries = list(
      linnean = rows(linn), prestonian = rows(pres), darwinian = rows(darw), eltonian = rows(elts)
    ),
    map_points = list()
  )

  # Sampling points as compact [lat, lon, "GF"|"GB"] triples.
  pts_path <- file.path(dst_data, "map_points.csv")
  if (file.exists(pts_path)) {
    mp <- read_csv(pts_path, show_col_types = FALSE)
    src_short <- ifelse(mp$source == "GlobalFungi", "GF", "GB")
    bundle$map_points <- unname(Map(function(a, o, s) list(a, o, s),
                                    round(mp$lat, 3), round(mp$lon, 3), src_short))
  }

  # ---------------------------------------------------------------------------
  # Reproject the raster maps to Web Mercator and export colourized PNGs.
  # These let the dashboard show the dark-diversity and host maps as fully
  # zoomable Leaflet layers (same feel as the sampling map). We reproject to
  # EPSG:3857 (so pixels are linear in the map's projection), colour-map to an
  # RGBA PNG, and record the geographic bounds for L.imageOverlay. The output
  # PNGs live in data/rasters/ and are part of the committed snapshot, so the
  # dashboard keeps working even if the (large) source rasters are unavailable.
  # Requires the `terra` package; skipped with a warning otherwise.
  # ---------------------------------------------------------------------------
  bundle$rasters <- list()
  if (requireNamespace("terra", quietly = TRUE)) {
    dir.create(file.path(dst_data, "rasters"), showWarnings = FALSE)
    canada_gpkg <- file.path(src_data, "spatial", "canada_simple.gpkg")
    canada_v <- if (file.exists(canada_gpkg)) tryCatch(terra::vect(canada_gpkg), error = function(e) NULL) else NULL

    # make_merc_png(): reproject -> mask to Canada -> trim -> colourize -> PNG.
    # Returns the front-end config (relative png path, latlng bounds, legend).
    make_merc_png <- function(r, out_rel, pal_name, label, agg = NULL, zlim = NULL,
                              method = "bilinear", min_px = NULL, zero_color = NULL,
                              rev_pal = FALSE) {
      out_abs <- file.path(dst_data, out_rel)
      if (!is.null(agg) && agg > 1)
        r <- terra::aggregate(r, fact = agg, fun = "mean", na.rm = TRUE)
      r3857 <- terra::project(r, "EPSG:3857", method = method)
      # Render coarse grids (e.g. the 0.5-deg host rasters, the 10-min climate
      # grid) at a finer PIXEL size using nearest neighbour. Cell VALUES are
      # unchanged -- this only stops the exported PNG from looking pixelated when
      # zoomed, and gives a cleaner coastline when masked.
      if (!is.null(min_px) && terra::ncol(r3857) < min_px)
        r3857 <- terra::disagg(r3857, fact = ceiling(min_px / terra::ncol(r3857)),
                               method = "near")
      if (!is.null(canada_v))
        r3857 <- terra::mask(r3857, terra::project(canada_v, "EPSG:3857"))
      r3857 <- terra::trim(r3857)
      v <- terra::values(r3857)[, 1]
      if (is.null(zlim)) zlim <- range(v, na.rm = TRUE)
      pal <- grDevices::hcl.colors(256, pal_name)
      if (rev_pal) pal <- rev(pal)
      idx <- floor((v - zlim[1]) / (zlim[2] - zlim[1]) * 255) + 1
      idx[idx < 1] <- 1; idx[idx > 256] <- 256
      colv <- pal[idx]; colv[is.na(v)] <- NA
      # e.g. climate zones present in Canada but never sampled -> flat grey
      if (!is.null(zero_color)) colv[!is.na(v) & v <= 0] <- zero_color
      m <- matrix(colv, nrow = terra::nrow(r3857), ncol = terra::ncol(r3857), byrow = TRUE)
      grDevices::png(out_abs, width = terra::ncol(r3857), height = terra::nrow(r3857), bg = "transparent")
      op <- graphics::par(mar = c(0, 0, 0, 0)); on.exit(graphics::par(op), add = TRUE)
      graphics::plot.new(); graphics::plot.window(xlim = c(0, 1), ylim = c(0, 1), xaxs = "i", yaxs = "i")
      graphics::rasterImage(grDevices::as.raster(m), 0, 0, 1, 1, interpolate = FALSE)
      grDevices::dev.off()
      e  <- terra::ext(r3857)
      llp <- terra::project(terra::as.polygons(e, crs = "EPSG:3857"), "EPSG:4326")
      le <- terra::ext(llp)
      stops <- as.vector(grDevices::hcl.colors(6, pal_name))
      if (rev_pal) stops <- rev(stops)
      # Legend end-labels: counts/percentages read as integers; proportions (a
      # narrow 0-1 range) keep 2 decimals.
      dg <- if ((zlim[2] - zlim[1]) >= 10) 0 else 2
      list(png = paste0("data/", out_rel),   # path is relative to index.html
           bounds = list(list(le$ymin, le$xmin), list(le$ymax, le$xmax)),   # [[S,W],[N,E]]
           zmin = round(zlim[1], dg), zmax = round(zlim[2], dg), label = label,
           stops = stops)
    }

    safe_raster <- function(name, src, layer, out_rel, pal, label, agg = NULL, zlim = NULL) {
      if (!file.exists(src)) { warning("raster source missing: ", src, call. = FALSE); return() }
      cfg <- tryCatch({
        r <- terra::rast(src); if (!is.null(layer)) r <- r[[layer]]
        make_merc_png(r, out_rel, pal, label, agg = agg, zlim = zlim)
      }, error = function(e) { warning("raster ", name, " failed: ", conditionMessage(e), call. = FALSE); NULL })
      if (!is.null(cfg)) bundle$rasters[[name]] <<- cfg
    }

    # Linnean: van Galen "% dark taxa" (aggregate ~100 cells like 10_dark_diversity.R)
    safe_raster("dark",
      file.path(SOURCE_ROOT, "data_raw", "van_Galen_et_al_dark_taxa_code_and_data",
                "4.Dark_EcM_taxa_richness_maps", "Dark_taxa_geospatial_layers.tif"),
      "percentage_dark_taxa", "rasters/dark_diversity.png", "viridis",
      "Dark EcM fungal taxa (%)", agg = 8)
    # Eltonian: tree vs non-tree host richness + coverage (4 maps), derived from
    # the per-species BIEN stack split by growth form -- replicates the tree /
    # non-tree panels of 18_eltonian.R (Figure 4). "Coverage" = proportion of that
    # group's host species in a cell that have >=1 EcM fungal record in Canada.
    elt_stack  <- file.path(src_data, "spatial", "bien_host_species_stack.tif")
    elt_hlist  <- file.path(src_data, "eltonian", "eltonian_host_list.csv")
    elt_hmatch <- file.path(src_data, "eltonian", "eltonian_host_matching.csv")
    if (all(file.exists(c(elt_stack, elt_hlist, elt_hmatch)))) tryCatch({
      st <- terra::rast(elt_stack); names(st) <- gsub("_", " ", names(st))
      hl <- read_csv(elt_hlist, show_col_types = FALSE)
      hm <- read_csv(elt_hmatch, show_col_types = FALSE)
      tree_sp    <- hl$species[hl$growth_form %in% "tree"]
      nontree_sp <- hl$species[!hl$growth_form %in% "tree"]
      withdata   <- unique(hm$host_clean[hm$matched %in% TRUE & !is.na(hm$host_clean)])
      sum_layers <- function(sp, zero_na = FALSE) {
        idx <- which(names(st) %in% sp); if (!length(idx)) return(NULL)
        r <- terra::app(st[[idx]], "sum", na.rm = FALSE)
        if (zero_na) r <- terra::ifel(r == 0, NA, r); r
      }
      add_elt <- function(name, r, pal, label, zlim = NULL) {
        if (is.null(r)) return()
        cfg <- tryCatch(make_merc_png(r, paste0("rasters/", name, ".png"), pal, label,
                                      zlim = zlim, method = "near", min_px = 1100),
                        error = function(e) { warning("raster ", name, ": ", conditionMessage(e), call. = FALSE); NULL })
        if (!is.null(cfg)) bundle$rasters[[name]] <<- cfg
      }
      rich_nt   <- sum_layers(nontree_sp, zero_na = TRUE)
      rich_tree <- sum_layers(tree_sp,    zero_na = TRUE)
      dat_nt    <- sum_layers(intersect(nontree_sp, withdata))
      dat_tree  <- sum_layers(intersect(tree_sp,    withdata))
      prop_nt   <- if (!is.null(rich_nt)   && !is.null(dat_nt))   terra::clamp(dat_nt   / rich_nt,   0, 1)
      prop_tree <- if (!is.null(rich_tree) && !is.null(dat_tree)) terra::clamp(dat_tree / rich_tree, 0, 1)
      # Palette convention (both perceptually uniform + colour-blind safe):
      #   viridis = a magnitude (counts, %), plasma = a proportion (0-1).
      add_elt("nontree_richness", rich_nt,   "viridis", "Non-tree host species richness")
      add_elt("nontree_coverage", prop_nt,   "Plasma",  "Proportion of non-tree hosts with a record", c(0, 1))
      add_elt("tree_richness",    rich_tree, "viridis", "Tree host species richness")
      add_elt("tree_coverage",    prop_tree, "Plasma",  "Proportion of tree hosts with a record", c(0, 1))
    }, error = function(e) warning("Eltonian tree/non-tree rasters failed: ", conditionMessage(e), call. = FALSE))

    message("rasters exported: ", paste(names(bundle$rasters), collapse = ", "))

    # ------------------------------------------------------------------------
    # Ecozone vector map: dissolve the ecoregions to Canada's 15 ecozones,
    # simplify, attach names + GF/GenBank sample counts, and write it as
    # data/ecozones.js (window.ECM_ECOZONES) for a clickable Leaflet layer.
    # ------------------------------------------------------------------------
    eco_gpkg <- file.path(src_data, "spatial", "ecoregions_processed.gpkg")
    ez_names <- file.path(src_data, "spatial", "ecozone_names.csv")
    if (file.exists(eco_gpkg) && file.exists(ez_names)) tryCatch({
      ev <- terra::vect(eco_gpkg)
      ez <- terra::aggregate(ev, by = "ECOZONE")              # dissolve to ecozones
      ez <- terra::simplifyGeom(ez, tolerance = 0.03)          # ~3 km, keeps file small
      nm <- read_csv(ez_names, show_col_types = FALSE)
      ez$NAME <- nm$NAME_EN[match(ez$ECOZONE, nm$ECOZONE)]
      if (!is.null(hcnt)) {
        ez$gf <- hcnt$gf_locations[match(ez$NAME, hcnt$ecozone)]
        ez$gb <- hcnt$gb_locations[match(ez$NAME, hcnt$ecozone)]
      }
      # Official Environment Canada ecozone colours -- the same palette used for
      # Figure S4, so the dashboard map matches the published figure.
      ecozone_colors <- c(
        "Arctic Cordillera" = "#E9F6FD", "Atlantic Maritime" = "#B2DFDB",
        "Boreal Cordillera" = "#8BBBE4", "Boreal Plains"     = "#EDF2C3",
        "Boreal Shield"     = "#99CD75", "Hudson Plains"     = "#F1EE8B",
        "Mixedwood Plains"  = "#FFE8A2", "Montane Cordillera" = "#CBE19A",
        "Northern Arctic"   = "#C1E8FA", "Pacific Maritime"  = "#44B763",
        "Prairies"          = "#FFF799", "Southern Arctic"   = "#6DCFF6",
        "Taiga Cordillera"  = "#E7D7EA", "Taiga Plains"      = "#ECEDEE",
        "Taiga Shield"      = "#BDC0C2")
      ez$col <- unname(ecozone_colors[ez$NAME])
      ez <- terra::project(ez, "EPSG:4326")
      tmp <- tempfile(fileext = ".geojson")
      terra::writeVector(ez[, c("NAME", "gf", "gb", "col")], tmp, filetype = "GeoJSON", overwrite = TRUE)
      gj <- paste(readLines(tmp, warn = FALSE), collapse = "\n")
      writeLines(paste0("window.ECM_ECOZONES = ", gj, ";\n"), file.path(dst_data, "ecozones.js"))
      message("ecozones.js written (", terra::nrow(ez), " ecozones)")
    }, error = function(e) warning("ecozone geojson failed: ", conditionMessage(e), call. = FALSE))

    # Major lakes (same Albers source as the ecozone polygons) so the ecozone
    # map has a recognisable basemap of waterbodies under the semi-transparent
    # ecozone fills, the way Figure S4 does.
    lakes_src <- file.path(src_data, "spatial", "lakes_canada_albers.gpkg")
    if (file.exists(lakes_src)) tryCatch({
      lk <- terra::vect(lakes_src)
      lk <- terra::simplifyGeom(lk, tolerance = 0.03)
      lk <- terra::project(lk, "EPSG:4326")
      tmp2 <- tempfile(fileext = ".geojson")
      terra::writeVector(lk, tmp2, filetype = "GeoJSON", overwrite = TRUE)
      gj2 <- paste(readLines(tmp2, warn = FALSE), collapse = "\n")
      writeLines(paste0("window.ECM_LAKES = ", gj2, ";\n"), file.path(dst_data, "lakes.js"))
      message("lakes.js written (", terra::nrow(lk), " features)")
    }, error = function(e) warning("lakes geojson failed: ", conditionMessage(e), call. = FALSE))

    # NOTE: a province/territory administrative basemap (GADM level 1) was
    # tried here and removed before the public deploy. GADM's licence
    # prohibits redistribution without permission, and the manuscript project
    # already excludes GADM-derived boundary products from its own public data
    # deposit for that reason (see ../../ARCHIVING.md) -- the dashboard follows
    # the same policy. The ecozone map renders fine without it (ecozones +
    # lakes + sampling points).
  } else {
    warning("Package 'terra' not installed -- raster maps NOT exported.", call. = FALSE)
  }

    # ------------------------------------------------------------------------
    # Climate explorer (Figure 3). Follows 17_hutchinsonian.R: aggregate WorldClim
    # BIO1/BIO12 to ~10 arc-min, mask to Canada, and bin the two-dimensional
    # climate space into a 50 x 50 grid of "climate zones". For each of three
    # scopes -- available climate frequency, GlobalFungi coverage, and
    # GlobalFungi + GenBank coverage -- we export a Web-Mercator PNG for the
    # geographic map plus the climate-space table, and a coarse lat/lon -> zone
    # lookup so the dashboard can highlight the zone under the cursor.
    # NOTE: reads the ~1.4 GB WorldClim raster, so this step takes a minute or two.
    # ------------------------------------------------------------------------
    clim_src <- file.path(SOURCE_ROOT, "data_raw", "climate", "wc2.1_country",
                          "CAN_wc2.1_30s_bio.tif")
    if (file.exists(clim_src) && !is.null(canada_v) && exists("pts")) tryCatch({
      AGG <- 20L; NBIN <- 50L                       # match 17_hutchinsonian.R
      cf <- terra::rast(clim_src); ln <- names(cf)
      mi <- grep("bio_?1$", ln)[1]; pj <- grep("bio_?12$", ln)[1]
      clim <- cf[[c(mi, pj)]]; names(clim) <- c("MAT", "MAP")
      mr <- terra::values(clim[["MAT"]])
      if (!all(is.na(mr)) && max(abs(mr), na.rm = TRUE) > 100)
        clim[["MAT"]] <- clim[["MAT"]] / 10
      clim <- terra::aggregate(clim, fact = AGG, fun = "mean", na.rm = TRUE)
      cv4326 <- terra::project(canada_v, "EPSG:4326")
      clim <- terra::mask(terra::crop(clim, cv4326), cv4326)

      cvals <- terra::values(clim)
      ok <- !is.na(cvals[, "MAT"]) & !is.na(cvals[, "MAP"])
      matb <- seq(min(cvals[ok, "MAT"]), max(cvals[ok, "MAT"]), length.out = NBIN + 1)
      mapb <- seq(min(cvals[ok, "MAP"]), max(cvals[ok, "MAP"]), length.out = NBIN + 1)
      xb <- yb <- rep(NA_integer_, length(ok))
      xb[ok] <- findInterval(cvals[ok, "MAT"], matb, rightmost.closed = TRUE, all.inside = TRUE)
      yb[ok] <- findInterval(cvals[ok, "MAP"], mapb, rightmost.closed = TRUE, all.inside = TRUE)
      binid <- ifelse(ok, (xb - 1L) * NBIN + yb, NA_integer_)   # zone id

      tab <- table(binid[ok])
      zone_id <- as.integer(names(tab)); zone_n <- as.integer(tab)

      # coverage = fraction of a zone's Canadian cells that contain >=1 sample
      cov_for <- function(df) {
        cells <- unique(terra::cellFromXY(clim, as.matrix(df[, c("lon", "lat")])))
        cells <- cells[!is.na(cells)]; cells <- cells[ok[cells]]
        st <- table(binid[cells])
        s <- integer(length(zone_id)); names(s) <- as.character(zone_id)
        s[names(st)] <- as.integer(st)
        as.numeric(s) / zone_n
      }
      cov_gf <- cov_for(pts[pts$source == "GlobalFungi", c("lon", "lat")])
      cov_cb <- cov_for(pts[, c("lon", "lat")])

      # each Canadian cell takes its zone's value -> geographic raster
      mk <- function(vec) {
        r <- clim[["MAT"]]
        lu <- stats::setNames(vec, as.character(zone_id))
        terra::values(r) <- unname(lu[as.character(binid)]); r
      }
      addc <- function(name, r, pal, label, zlim = NULL, zero = NULL) {
        cfg <- tryCatch(make_merc_png(r, paste0("rasters/", name, ".png"), pal, label,
                          zlim = zlim, method = "near", min_px = 1100, zero_color = zero),
                        error = function(e) { warning("climate raster ", name, ": ",
                          conditionMessage(e), call. = FALSE); NULL })
        if (!is.null(cfg)) bundle$rasters[[name]] <<- cfg
      }
      addc("clim_freq", mk(zone_n), "viridis", "Climate frequency (Canadian cells per zone)")
      addc("clim_gf",   mk(cov_gf), "Plasma", "Proportion of zone sampled (GlobalFungi)", c(0, 1), "#d9d9d9")
      addc("clim_comb", mk(cov_cb), "Plasma", "Proportion of zone sampled (GF + GenBank)", c(0, 1), "#d9d9d9")

      bundle$climate <- list(
        nbin = NBIN,
        mat = list(min = matb[1], max = matb[NBIN + 1]),
        map = list(min = mapb[1], max = mapb[NBIN + 1]),
        zones = lapply(seq_along(zone_id), function(i) list(
          x  = ((zone_id[i] - 1L) %/% NBIN) + 1L,
          y  = ((zone_id[i] - 1L) %%  NBIN) + 1L,
          n  = zone_n[i],
          gf = round(cov_gf[i], 4),
          cb = round(cov_cb[i], 4)))
      )

      # lat/lon -> zone lookup for hover, at the SAME resolution as `clim` (the
      # grid the displayed rasters are built from). An earlier version used a
      # fact=3 (modal) coarser aggregate here as a size-saving measure, but that
      # made the lookup answer for a ~3x larger area than the pixel actually
      # hovered, visibly mismatching the highlighted climate-space cell near
      # zone boundaries. Using the native grid directly keeps hover and display
      # pixel-consistent; the array is still small (one small int per cell).
      br <- clim[["MAT"]]; terra::values(br) <- binid
      lv <- terra::values(br)[, 1]; lv[is.na(lv)] <- -1
      lke <- terra::ext(br)
      bundle$climate$lookup <- list(
        west = lke$xmin, north = lke$ymax, cell = terra::res(br)[1],
        ncol = terra::ncol(br), nrow = terra::nrow(br), bins = as.integer(lv))
      message("climate explorer: ", length(zone_id), " occupied climate zones")
    }, error = function(e) warning("climate explorer failed: ", conditionMessage(e), call. = FALSE))

  js <- paste0("// AUTO-GENERATED by R/sync_inputs.R -- do not edit by hand.\n",
               "window.ECM_DATA = ",
               jsonlite::toJSON(bundle, auto_unbox = TRUE, null = "null", na = "null",
                                digits = 6, pretty = FALSE), ";\n")
  writeLines(js, file.path(dst_data, "dashboard_data.js"))
  message("dashboard_data.js: ", length(bundle$map_points), " map points + all shortfall series")
} else {
  warning("Package 'jsonlite' not installed -- dashboard_data.js NOT rebuilt.", call. = FALSE)
}

# ---------------------------------------------------------------------------
# 6. Write the provenance manifest (top line = when + from where).
# ---------------------------------------------------------------------------
header <- data.frame(
  category = "SYNC", file = paste0("synced ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"),
                                   " from ", SOURCE_ROOT),
  status = "", bytes = NA, source_mtime = "", stringsAsFactors = FALSE)
write_csv(rbind(header, manifest), file.path(dst_data, "MANIFEST.csv"))

n_ok  <- sum(manifest$status == "ok")
n_bad <- sum(manifest$status == "MISSING")
message("\nSync complete: ", n_ok, " files copied",
        if (n_bad) paste0(", ", n_bad, " MISSING (see warnings)") else "",
        ".\nManifest: ", file.path(dst_data, "MANIFEST.csv"))
