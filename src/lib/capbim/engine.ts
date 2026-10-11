import { check, diagnosisOf, statusOf } from "./checks";
import { r2, r3 } from "./format";
import { sha256, fnv } from "./hash";
import { predict } from "./predict";
import { designTruths } from "./room";
import { stageById, STAGES } from "./stages";
import { THRESHOLDS as T, byClass } from "./thresholds";
import type { GateId, Job, JobSpec, Prediction, ReviewItem, SpaceClass, StageCheck, StageReport } from "./types";


export function specHash(spec: JobSpec): string {
  return JSON.stringify(spec);
}

export function predictionFor(spec: JobSpec): Prediction {
  return predict({
    cls: spec.spaceClass,
    cam: spec.camera,
    overlap: spec.overlap,
    gsdTarget: spec.gsdTarget,
    length: spec.lengthM,
    width: spec.widthM,
    height: spec.heightM,
  });
}

export function imageCount(spec: JobSpec, pred: Prediction): number {
  if (spec.faults.lowImageCount) return Math.max(12, Math.round(pred.images_total_est * 0.45));
  if (spec.imageOverride && spec.imageOverride > 0) return Math.round(spec.imageOverride);
  return pred.images_total_est;
}

function cls(spec: JobSpec): SpaceClass {
  return spec.spaceClass;
}

function controlBars(spec: JobSpec): number {
  return Math.max(1, spec.scalebars - Math.min(spec.heldoutBars, spec.scalebars));
}

function diagonalErrorMm(spec: JobSpec, pred: Prediction): number {
  const one = pred.space_diagonal_m * spec.certUncertaintyMm;
  return one / Math.sqrt(controlBars(spec));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand: () => number): number {
  const u = Math.max(1e-9, rand());
  const v = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

export function defaultReviews(): ReviewItem[] {
  return [
    {
      id: "door-handing",
      elementId: "door-1",
      elementName: "Door D1",
      attribute: "Handing",
      opus: "Left-hand reverse",
      sol: "Right-hand",
      confidence: 0.62,
      images: ["IMG_0144", "IMG_0148"],
      decision: null,
    },
    {
      id: "window-type",
      elementId: "window-1",
      elementName: "Window W1",
      attribute: "Window type",
      opus: "Fixed light",
      sol: "Awning",
      confidence: 0.71,
      images: ["IMG_0202", "IMG_0206"],
      decision: null,
    },
    {
      id: "floor-finish",
      elementId: "floor",
      elementName: "Floor slab",
      attribute: "Finish",
      opus: "Sealed concrete",
      sol: "Vinyl tile",
      confidence: 0.78,
      images: ["IMG_0301", "IMG_0304"],
      decision: null,
    },
  ];
}

type Metrics = Record<string, number | string | boolean | null>;

function scaleBlock(spec: JobSpec, pred: Prediction, ladder: number) {
  const mismatch = spec.faults.barIdMismatch && ladder < 2;
  const diag = diagonalErrorMm(spec, pred);
  const controlRms = mismatch ? (cls(spec) === "S" ? 1.7 : 2.4) : Math.max(0.18, diag * 0.22);
  const controlAbs = controlRms * 1.55;
  const checkAbs = mismatch ? (cls(spec) === "L" ? 4.8 : 3.2) : Math.max(0.22, diag * 0.4);
  const level = spec.levelTargets >= 4 ? 0.42 : 2.6;
  const longDiag = mismatch ? diag * 2.4 : diag;
  const survey = spec.surveyControl;
  return {
    control_rms_mm: r2(controlRms),
    control_abs_max_mm: r2(controlAbs),
    check_abs_max_mm: r2(checkAbs),
    level_z_mm: r2(level),
    long_diagonal_mm: r2(longDiag),
    survey_rmse_mm: survey ? 1.15 : null,
    survey_check_mm: survey ? 1.55 : null,
  };
}

function denseBlock(spec: JobSpec, pred: Prediction, ladder: number) {
  const step = Math.min(ladder, 3);
  let median = Math.max(0.32, pred.gsd_mm_at_walls * 0.8);
  if (spec.faults.plainWalls) median *= 2.05;
  if (spec.tls) median = Math.min(median, 0.95);
  median *= 0.9 ** step;
  const p95 = median * 2.65;
  const marker = Math.max(0.28, pred.fraser_precision_targets_mm * 6);
  let holes = spec.faults.plainWalls ? [0.048, 0.04, 0.033, 0.012][step] : 0.008;
  if (spec.tls) holes = Math.min(holes, 0.009);
  return {
    median_mm: r2(median),
    p95_mm: r2(p95),
    marker_mm: r2(marker),
    holes: r3(holes ?? 0.02),
    texture: r2(1 / Math.max(0.05, pred.gsd_mm_at_walls)),
    tls_rms: spec.tls ? 1.35 : null,
    psnr: !spec.splats ? null : spec.faults.plainWalls && step < 2 ? 22.4 : 28.6,
  };
}

function extractionBlock(spec: JobSpec, ladder: number, denseMedian: number, longDiag: number) {
  const step = Math.min(ladder, 3);
  let rms = denseMedian * 1.3 * (step >= 1 ? 0.86 : 1);
  let inlier = spec.faults.plainWalls ? 0.83 : 0.96;
  if (step >= 1) inlier = Math.min(0.98, inlier + 0.05);
  if (step >= 2) inlier = Math.min(0.98, inlier + 0.04);
  let found = spec.faults.plainWalls ? 8 : 9;
  if (spec.tls || step >= 3) found = 9;
  const base = cls(spec) === "S" ? 0.97 : cls(spec) === "M" ? 0.93 : 0.88;
  let dev5 = spec.faults.plainWalls ? base - 0.09 : base;
  if (spec.tls || step >= 3) dev5 = Math.max(dev5, base - 0.01);
  const dev10 = Math.min(0.999, dev5 + 0.035);
  return {
    plane_rms_mm: r2(rms),
    inlier: r3(inlier),
    found: r3(found / 9),
    wall_mm: r2(longDiag * 0.85),
    dev5: r3(dev5),
    dev10: r3(dev10),
  };
}

export function buildChecks(spec: JobSpec, stageId: string, pred: Prediction, ladder: number, job: Job): StageCheck[] {
  const c = cls(spec);
  const imgs = imageCount(spec, pred);
  if (stageId === "00") {
    const need = T.stage_00_plan.survey_control_required[c];
    const has = spec.surveyControl || spec.tls;
    const survey: StageCheck =
      need === "optional"
        ? {
            id: "survey",
            metric: "survey_control",
            operator: "==",
            threshold: true,
            value: has,
            result: has ? "pass" : "warn",
            severity: "warning",
            threshold_source: "stage_00_plan.survey_control_required",
            note: "Optional for a medium space. A hall cannot waive this.",
          }
        : check("survey", "survey_control", "==", true, !need || has, "blocking", "stage_00_plan.survey_control_required", need ? "Total station or TLS" : "Not required for a small room");
    if (!need) {
      survey.result = "pass";
      survey.value = has;
      survey.threshold = false;
      survey.operator = "==";
      survey.note = "Not required for a small room";
    }
    return [
      check("tgt", "predicted_target_precision_mm", "<=", byClass(T.stage_00_plan.predicted_target_precision_mm_max, c), pred.fraser_precision_targets_mm, "blocking", "stage_00_plan.predicted_target_precision_mm_max"),
      check("srf", "predicted_surface_precision_mm", "<=", byClass(T.stage_00_plan.predicted_surface_precision_mm_max, c), pred.surface_2x_gsd_mm, "blocking", "stage_00_plan.predicted_surface_precision_mm_max", "2 × GSD, dense-control rule"),
      check("gsd", "gsd_mm", "<=", byClass(T.stage_00_plan.gsd_mm_max_at_walls, c), pred.gsd_mm_at_walls, "blocking", "stage_00_plan.gsd_mm_max_at_walls"),
      check("targets", "targets", ">=", byClass(T.stage_00_plan.targets_min, c), spec.targets, "blocking", "stage_00_plan.targets_min"),
      check("bars", "scalebars", ">=", byClass(T.stage_00_plan.scalebars_total_min, c), spec.scalebars, "blocking", "stage_00_plan.scalebars_total_min"),
      check("held", "heldout_bars", ">=", byClass(T.stage_00_plan.scalebars_heldout_min, c), spec.heldoutBars, "blocking", "stage_00_plan.scalebars_heldout_min"),
      check("level", "level_targets", ">=", T.stage_00_plan.level_datum_targets_min, spec.levelTargets, "blocking", "stage_00_plan.level_datum_targets_min"),
      check("checks", "independent_checks", ">=", byClass(T.stage_00_plan.independent_checks_min, c), spec.independentChecks, "blocking", "stage_00_plan.independent_checks_min"),
      survey,
    ];
  }
  if (stageId === "01") {
    const blur = spec.faults.slowShutter || spec.faults.stabilisationOn ? 0.11 : spec.blurReject;
    const detected = spec.targets >= byClass(T.stage_00_plan.targets_min, c) ? 0.98 : spec.targets / Math.max(1, byClass(T.stage_00_plan.targets_min, c)) * 0.9;
    return [
      check("images", "image_count", ">=", byClass(T.stage_01_capture.image_count_min, c), imgs, "blocking", "stage_01_capture.image_count_min"),
      check("focal", "focal_length_values", "<=", T.stage_01_capture.focal_length_values_max, 1, "blocking", "stage_01_capture.exif.focal_length_values_max"),
      check("iso", "iso", "<=", T.stage_01_capture.iso_max, spec.iso, "blocking", "stage_01_capture.exif.iso_max"),
      check("ap-lo", "aperture_f", ">=", T.stage_01_capture.aperture_f_range[0], spec.aperture, "blocking", "stage_01_capture.exif.aperture_f_range"),
      check("ap-hi", "aperture_f", "<=", T.stage_01_capture.aperture_f_range[1], spec.aperture, "blocking", "stage_01_capture.exif.aperture_f_range"),
      check("shutter", "shutter_s", "<=", T.stage_01_capture.shutter_s_max_handheld, spec.faults.slowShutter ? 0.02 : spec.shutterS, "blocking", "stage_01_capture.exif.shutter_s_max_handheld"),
      check("is", "image_stabilisation_off", "==", true, !spec.faults.stabilisationOn, "blocking", "stage_01_capture.exif.image_stabilisation"),
      check("blur", "blur_reject_fraction", "<=", T.stage_01_capture.blur_reject_fraction_max, r3(blur), "blocking", "stage_01_capture.blur_reject_fraction_max"),
      check("clip", "clipped_highlight_fraction", "<=", T.stage_01_capture.clipped_highlight_fraction_max, spec.clippedHighlight, "blocking", "stage_01_capture.clipped_highlight_fraction_max"),
      check("det", "targets_detected_fraction", ">=", T.stage_01_capture.targets_detected_fraction_min, r3(detected), "blocking", "stage_01_capture.targets_detected_fraction_min"),
      check("cert", "scalebar_cert_uncertainty_mm", "<=", T.stage_01_capture.scalebar_cert_uncertainty_mm_max, spec.certUncertaintyMm, "blocking", "stage_01_capture.scalebar_cert_uncertainty_mm_max"),
      check("seal", "checks_sealed", "==", true, spec.checksSealed, "blocking", "stage_01_capture.checks_sealed"),
    ];
  }
  if (stageId === "02") {
    const low = spec.faults.lowImageCount && ladder < 1;
    const plain = spec.faults.plainWalls && ladder < 1;
    const limit = byClass(T.stage_02_onsite_qc.scalebar_residual_abs_mm_max, c);
    const grossFail = spec.faults.barIdMismatch && ladder < 1;
    const barMm = grossFail ? r2(limit + 1.1) : r2(Math.min(limit * 0.45, Math.max(0.22, diagonalErrorMm(spec, pred))));
    return [
      check("aligned", "aligned_fraction", ">=", T.stage_02_onsite_qc.aligned_fraction_min, low ? 0.94 : 0.988, "blocking", "stage_02_onsite_qc.aligned_fraction_min"),
      check("comp", "components", "<=", T.stage_02_onsite_qc.components_max, low && ladder < 3 ? 2 : 1, "blocking", "stage_02_onsite_qc.components_max"),
      check("tgt", "targets_ge4_fraction", ">=", T.stage_02_onsite_qc.targets_ge4_projections_fraction_min, plain ? 0.91 : 0.98, "blocking", "stage_02_onsite_qc.targets_ge4_projections_fraction_min"),
      check("bar", "scalebar_abs_max_mm", "<=", limit, barMm, "blocking", "stage_02_onsite_qc.scalebar_residual_abs_mm_max", grossFail ? "Certificate ID does not match. A reshoot clears the gross check; stage 05 still holds the bar." : undefined),
      check("gap", "coverage_gap_m2", "<=", byClass(T.stage_02_onsite_qc.coverage_gap_max_m2, c), low ? 2.4 : plain ? (c === "S" ? 0.85 : 0.7) : 0.18, "blocking", "stage_02_onsite_qc.coverage_gap_max_m2"),
    ];
  }
  if (stageId === "03") {
    const blur = spec.faults.slowShutter || spec.faults.stabilisationOn ? 0.11 : spec.blurReject;
    const retained = ladder >= 1 ? 0.97 : r3(1 - blur);
    return [
      check("keep", "retained_fraction", ">=", 0.95, retained, "blocking", "plan.stage_03.retained_fraction"),
      check("focal", "focal_length_values", "<=", 1, 1, "blocking", "plan.stage_03.one_focal_length"),
      check("manifest", "manifest_complete", "==", true, true, "blocking", "plan.stage_03.manifest"),
    ];
  }
  if (stageId === "04") {
    const step = Math.min(ladder, 3);
    const plain = spec.faults.plainWalls;
    const low = spec.faults.lowImageCount;
    const rms = (plain ? [0.74, 0.56, 0.44, 0.33] : low ? [0.62, 0.45, 0.34, 0.26] : [0.29, 0.22, 0.18, 0.16])[step] ?? 0.3;
    const ties = (plain ? [840, 1320, 1880, 2500] : low ? [980, 1540, 2100, 2600] : [2800, 3400, 4200, 5000])[step] ?? 2000;
    const aligned = (plain || low) && ladder === 0 ? (low ? 0.91 : 0.962) : 0.993;
    const components = low && ladder < 2 ? 2 : 1;
    const markerRms = plain && ladder === 0 ? 0.38 : 0.12;
    return [
      check("aligned", "aligned_fraction", ">=", byClass(T.stage_03_alignment.aligned_fraction_min, c), r3(aligned), "blocking", "stage_03_alignment.aligned_fraction_min"),
      check("comp", "components", "<=", T.stage_03_alignment.components_max, components, "blocking", "stage_03_alignment.components_max"),
      check("rms", "tiepoint_rms_px", "<=", T.stage_03_alignment.tiepoint_rms_reproj_px_max, rms, "blocking", "stage_03_alignment.tiepoint_rms_reproj_px_max"),
      check("mk", "marker_rms_px", "<=", T.stage_03_alignment.marker_rms_reproj_px_max, markerRms, "blocking", "stage_03_alignment.marker_rms_reproj_px_max"),
      check("proj", "marker_min_projections", ">=", T.stage_03_alignment.marker_projections_min, spec.targets >= 8 ? 7 : 2, "blocking", "stage_03_alignment.marker_projections_min"),
      check("den", "median_tiepoints_per_image", ">=", T.stage_03_alignment.median_tiepoints_per_image_min, ties, "warning", "stage_03_alignment.median_tiepoints_per_image_min"),
      check("f", "f_stderr_px", "<=", T.stage_03_alignment.f_stderr_px_max, 0.46, "blocking", "stage_03_alignment.calibration.f_stderr_px_max"),
      check("cxy", "cx_cy_stderr_px", "<=", T.stage_03_alignment.cx_cy_stderr_px_max, 0.38, "blocking", "stage_03_alignment.calibration.cx_cy_stderr_px_max"),
      check("corr", "param_correlation_abs", "<=", T.stage_03_alignment.param_correlation_abs_max, 0.71, "blocking", "stage_03_alignment.calibration.param_correlation_abs_max"),
      check("grp", "focus_groups", "<=", T.stage_03_alignment.focus_groups_max, 1, "blocking", "stage_03_alignment.calibration.focus_groups_max"),
    ];
  }
  if (stageId === "05") {
    const s = scaleBlock(spec, pred, ladder);
    const surveyLim = T.stage_04_scale_and_datum.survey_control_rmse_mm_max[c];
    const surveyChk = T.stage_04_scale_and_datum.survey_check_rmse_mm_max[c];
    return [
      check("rms", "control_rms_mm", "<=", byClass(T.stage_04_scale_and_datum.control_bar_residual_rms_mm_max, c), s.control_rms_mm, "blocking", "stage_04_scale_and_datum.control_bar_residual_rms_mm_max"),
      check("abs", "control_abs_max_mm", "<=", byClass(T.stage_04_scale_and_datum.control_bar_residual_abs_mm_max, c), s.control_abs_max_mm, "blocking", "stage_04_scale_and_datum.control_bar_residual_abs_mm_max"),
      check("chk", "check_abs_max_mm", "<=", byClass(T.stage_04_scale_and_datum.check_bar_residual_abs_mm_max, c), s.check_abs_max_mm, "blocking", "stage_04_scale_and_datum.check_bar_residual_abs_mm_max"),
      check("lvl", "level_z_resid_abs_max_mm", "<=", byClass(T.stage_04_scale_and_datum.level_datum_z_residual_abs_mm_max, c), s.level_z_mm, "blocking", "stage_04_scale_and_datum.level_datum_z_residual_abs_mm_max"),
      check("surv", "survey_control_rmse_mm", "<=", surveyLim ?? 0, surveyLim ? s.survey_rmse_mm : null, "blocking", "stage_04_scale_and_datum.survey_control_rmse_mm_max"),
      check("schk", "survey_check_rmse_mm", "<=", surveyChk ?? 0, surveyChk ? s.survey_check_mm : null, "blocking", "stage_04_scale_and_datum.survey_check_rmse_mm_max"),
      check("diag", "long_diagonal_abs_mm", "<=", byClass(T.stage_04_scale_and_datum.long_diagonal_check_abs_mm_max, c), s.long_diagonal_mm, "blocking", "stage_04_scale_and_datum.long_diagonal_check_abs_mm_max"),
    ];
  }
  if (stageId === "06") {
    const d = denseBlock(spec, pred, ladder);
    return [
      check("med", "mesh_vs_tiepoints_median_mm", "<=", byClass(T.stage_05_dense_mesh_texture.mesh_vs_tiepoints_median_mm_max, c), d.median_mm, "blocking", "stage_05_dense_mesh_texture.mesh_vs_tiepoints_median_mm_max"),
      check("p95", "mesh_vs_tiepoints_p95_mm", "<=", byClass(T.stage_05_dense_mesh_texture.mesh_vs_tiepoints_p95_mm_max, c), d.p95_mm, "blocking", "stage_05_dense_mesh_texture.mesh_vs_tiepoints_p95_mm_max"),
      check("mk", "mesh_vs_marker_rmse_mm", "<=", byClass(T.stage_05_dense_mesh_texture.mesh_vs_marker_centres_rmse_mm_max, c), d.marker_mm, "blocking", "stage_05_dense_mesh_texture.mesh_vs_marker_centres_rmse_mm_max"),
      check("hole", "hole_area_fraction", "<=", T.stage_05_dense_mesh_texture.hole_area_fraction_max, d.holes, "blocking", "stage_05_dense_mesh_texture.hole_area_fraction_max"),
      check("tex", "texture_px_per_mm", ">=", byClass(T.stage_05_dense_mesh_texture.texture_px_per_mm_min_walls, c), d.texture, "blocking", "stage_05_dense_mesh_texture.texture_px_per_mm_min_walls"),
      check("tls", "tls_registration_rms_mm", "<=", T.stage_05_dense_mesh_texture.scan_registration_rms_mm_max, d.tls_rms, "blocking", "stage_05_dense_mesh_texture.tls_fusion"),
      check("psnr", "heldout_psnr_db", ">=", T.stage_05_dense_mesh_texture.heldout_psnr_db_min, d.psnr, "warning", "stage_05_dense_mesh_texture.gaussian_splats"),
    ];
  }
  if (stageId === "07") {
    const sc = scaleBlock(spec, pred, job.ladders["05"] ?? 0);
    const d = denseBlock(spec, pred, job.ladders["06"] ?? 0);
    const e = extractionBlock(spec, ladder, d.median_mm, sc.long_diagonal_mm);
    return [
      check("rms", "plane_fit_rms_mm", "<=", byClass(T.stage_06_geometry_extraction.plane_fit_rms_mm_max, c), e.plane_rms_mm, "blocking", "stage_06_geometry_extraction.plane_fit_rms_mm_max"),
      check("in", "plane_inlier_fraction", ">=", T.stage_06_geometry_extraction.plane_inlier_fraction_min, e.inlier, "blocking", "stage_06_geometry_extraction.plane_inlier_fraction_min"),
      check("found", "elements_found_fraction", ">=", T.stage_06_geometry_extraction.expected_elements_found_fraction_min, e.found, "blocking", "stage_06_geometry_extraction.expected_elements_found_fraction_min"),
      check("w2w", "wall_to_wall_abs_mm", "<=", byClass(T.stage_06_geometry_extraction.wall_to_wall_vs_check_abs_mm_max, c), e.wall_mm, "blocking", "stage_06_geometry_extraction.wall_to_wall_vs_check_abs_mm_max"),
      check("d5", "deviation_within_5mm_fraction", ">=", byClass(T.stage_06_geometry_extraction.deviation_within_5mm_area_fraction_min, c), e.dev5, "blocking", "stage_06_geometry_extraction.deviation_within_5mm_area_fraction_min"),
      check("d10", "deviation_within_10mm_fraction", ">=", byClass(T.stage_06_geometry_extraction.deviation_within_10mm_area_fraction_min, c), e.dev10, "blocking", "stage_06_geometry_extraction.deviation_within_10mm_area_fraction_min"),
    ];
  }
  if (stageId === "08") {
    const open = job.reviews.some((r) => !r.decision);
    const filled = job.reviews.length === 0 || job.reviews.every((r) => r.decision);
    const auto = job.reviews.filter((r) => r.decision).every((r) => true);
    return [
      check("fill", "attributes_filled_fraction", ">=", T.stage_07_semantics_attributes.required_attributes_filled_fraction_min, filled ? 1 : 0.67, "blocking", "stage_07_semantics_attributes.required_attributes_filled_fraction_min"),
      check("conf", "auto_accept_only_above_floor", "==", true, auto, "blocking", "stage_07_semantics_attributes.auto_accept_confidence_min", "Disagreements stay in the queue under 0.85"),
      check("queue", "review_queue_resolved", "==", true, !open, "blocking", "stage_07_semantics_attributes.review_queue_resolved_required"),
      check("ev", "evidence_images_min", ">=", T.stage_07_semantics_attributes.evidence_images_per_element_min, 2, "blocking", "stage_07_semantics_attributes.evidence_images_per_element_min"),
    ];
  }
  if (stageId === "09") {
    const d = denseBlock(spec, pred, job.ladders["06"] ?? 0);
    const p95 = r2(d.p95_mm * 1.12);
    return [
      check("schema", "ifc_schema_errors", "<=", T.stage_08_bim_authoring.ifc_schema_validation_errors_max, 0, "blocking", "stage_08_bim_authoring.ifc_schema_validation_errors_max"),
      check("ids", "ids_facets_pass_fraction", ">=", T.stage_08_bim_authoring.ids_required_facets_pass_fraction_min, 1, "blocking", "stage_08_bim_authoring.ids_required_facets_pass_fraction_min"),
      check("count", "element_count_matches", "==", true, true, "blocking", "stage_08_bim_authoring.element_count_matches_extraction"),
      check("p95", "ifc_vs_mesh_p95_mm", "<=", byClass(T.stage_08_bim_authoring.ifc_vs_mesh_p95_mm_max, c), p95, "blocking", "stage_08_bim_authoring.ifc_vs_mesh_p95_mm_max"),
      check("rvt", "rvt_roundtrip", "==", true, null, "blocking", "stage_08_bim_authoring.rvt_roundtrip_element_count_match", "Path A is IFC. Revit round-trip is not run here."),
    ];
  }
  if (stageId === "10") {
    const bundle = c === "S" ? 6 : c === "M" ? 11 : 18;
    return [
      check("load", "first_load_s", "<=", T.stage_09_browser_delivery.first_load_s_max, 1.2, "blocking", "stage_09_browser_delivery.first_load_s_max", "Local procedural model, not a 100 Mbit download"),
      check("mb", "bundle_mb", "<=", byClass(T.stage_09_browser_delivery.bundle_mb_max, c), bundle, "blocking", "stage_09_browser_delivery.bundle_mb_max"),
      check("meas", "measurement_vs_ifc_mm", "<=", T.stage_09_browser_delivery.measurement_tool_vs_ifc_abs_mm_max, 0, "blocking", "stage_09_browser_delivery.measurement_tool_vs_ifc_abs_mm_max"),
      check("pset", "pset_visible_fraction", ">=", T.stage_09_browser_delivery.pset_visible_sampled_elements_fraction_min, 1, "blocking", "stage_09_browser_delivery.pset_visible_sampled_elements_fraction_min"),
      check("feat", "required_features_present", "==", true, true, "blocking", "stage_09_browser_delivery.required_features_present"),
      check("pw", "playwright_suite", "==", true, true, "blocking", "stage_09_browser_delivery.playwright_suite_pass_required", "Feature checklist in this delivery surface"),
    ];
  }
  const stats = validationStats(spec, pred, job.degraded);
  const hybrid = c === "L" && (spec.surveyControl || spec.tls);
  const rmseMax = hybrid ? T.stage_10_blind_validation.L_hybrid.rmse_mm_max : byClass(T.stage_10_blind_validation.rmse_mm_max, c);
  const p95Max = hybrid ? T.stage_10_blind_validation.L_hybrid.p95_abs_mm_max : byClass(T.stage_10_blind_validation.p95_abs_mm_max, c);
  const maxMax = hybrid ? T.stage_10_blind_validation.L_hybrid.abs_max_mm_max : byClass(T.stage_10_blind_validation.abs_max_mm_max, c);
  const src = hybrid ? "stage_10_blind_validation.L_hybrid" : "stage_10_blind_validation";
  return [
    check("n", "checks_used", ">=", byClass(T.stage_10_blind_validation.checks_used_min, c), stats.residuals.length, "blocking", "stage_10_blind_validation.checks_used_min"),
    check("rmse", "rmse_mm", "<=", rmseMax, r2(stats.rmse), "blocking", `${src}.rmse_mm_max`),
    check("p95", "p95_abs_mm", "<=", p95Max, r2(stats.p95), "blocking", `${src}.p95_abs_mm_max`),
    check("max", "abs_max_mm", "<=", maxMax, r2(stats.absMax), "blocking", `${src}.abs_max_mm_max`),
    check("retune", "retune_after_unseal", "==", false, false, "blocking", "stage_10_blind_validation.retune_after_unseal_allowed"),
  ];
}

export function validationStats(spec: JobSpec, pred: Prediction, degraded: boolean) {
  const truths = designTruths(spec);
  let sigma = Math.max(0.35, pred.surface_2x_gsd_mm * 0.42);
  if (spec.faults.plainWalls && !spec.tls) sigma *= 1.35;
  if (spec.faults.barIdMismatch) sigma *= 1.7;
  if (degraded) sigma *= 2.6;
  if (spec.tls) sigma *= 0.72;
  const rand = mulberry32(fnv(`${spec.site}|${spec.name}|${cls(spec)}|${truths.length}|${degraded ? 1 : 0}|${spec.tls ? 1 : 0}|${spec.surveyControl ? 1 : 0}`));
  const scaleBias = cls(spec) === "L" && !spec.surveyControl && !spec.tls ? diagonalErrorMm(spec, pred) : 0;
  const residuals = truths.map((t, i) => {
    const bias = t.id === "diag" || t.id.startsWith("seg") ? scaleBias : scaleBias * 0.15;
    return gauss(rand) * sigma + bias;
  });
  const rmse = Math.sqrt(residuals.reduce((s, x) => s + x * x, 0) / residuals.length);
  const abs = residuals.map((v) => Math.abs(v)).sort((a, b) => a - b);
  const p95 = abs[Math.min(abs.length - 1, Math.ceil(0.95 * abs.length) - 1)] ?? 0;
  const absMax = abs[abs.length - 1] ?? 0;
  return { truths, residuals, rmse, p95, absMax };
}

function metricsFor(spec: JobSpec, stageId: string, pred: Prediction, ladder: number, job: Job): Metrics {
  const imgs = imageCount(spec, pred);
  if (stageId === "00") {
    return {
      gsd_mm: pred.gsd_mm_at_walls,
      standoff_m: pred.standoff_m,
      images_est: pred.images_total_est,
      fraser_targets_mm: pred.fraser_precision_targets_mm,
      surface_2x_mm: pred.surface_2x_gsd_mm,
      diagonal_m: pred.space_diagonal_m,
      one_bar_diagonal_mm: pred.scale_error_on_diagonal_mm_from_one_bar,
    };
  }
  if (stageId === "01") return { images: imgs, iso: spec.iso, aperture_f: spec.aperture, shutter_s: spec.shutterS };
  if (stageId === "04") return { ladder, tiepoint_rms_px: null };
  if (stageId === "11") {
    const s = validationStats(spec, pred, job.degraded);
    return { rmse_mm: r2(s.rmse), p95_abs_mm: r2(s.p95), abs_max_mm: r2(s.absMax), checks: s.residuals.length, synthetic: true };
  }
  return { ladder, images: imgs, gsd_mm: pred.gsd_mm_at_walls };
}

function gateFor(stageId: string, checks: StageCheck[], status: StageReport["status"]): StageReport["human_gate"] | undefined {
  if (stageId === "00" && (status === "pass" || status === "warn")) {
    return { required: true, id: "g0", summary: "Approve the capture plan before anyone goes to site.", items: ["Station count and standoff", "Target and scale-bar layout", "How the independent checks will be sealed"] };
  }
  if (stageId === "00" && checks.some((c) => c.id === "survey" && c.result === "fail")) {
    return { required: true, id: "g0", summary: "A hall needs survey control or TLS. The plan cannot waive this on its own.", items: ["Add a total station or a TLS pass", "Or record a named waiver. A waiver cannot be signed later."] };
  }
  if (stageId === "08" && status === "blocked") {
    return { required: true, id: "g2", summary: "Two readers disagreed. Pick a value, or mark it unknown.", items: ["Handing, window type, and floor finish are in the queue"] };
  }
  if (stageId === "11") {
    return { required: true, id: "g3", summary: status === "pass" || status === "warn" ? "Sign the synthetic accuracy statement, or hold it." : "The class gate failed. Do not sign.", items: ["No retune after the checks are unsealed"] };
  }
  return undefined;
}

export async function executeStage(job: Job, stageId: string): Promise<Job> {
  const stage = stageById(stageId);
  const seeded = stageId === "08" && job.reviews.length === 0 ? { ...job, reviews: defaultReviews() } : job;
  const pred = predictionFor(seeded.spec);
  const ladder = seeded.ladders[stageId] ?? 0;
  const attempt = (seeded.attempts[stageId] ?? 0) + 1;
  const checks = buildChecks(seeded.spec, stageId, pred, ladder, seeded);
  const blocked = stageId === "08" && checks.some((c) => c.id === "queue" && c.result === "fail") && checks.filter((c) => c.result === "fail").every((c) => c.id === "queue" || c.id === "fill");
  const status = statusOf(checks, blocked);
  const now = new Date().toISOString();
  const metrics = metricsFor(job.spec, stageId, pred, ladder, job);
  for (const c of checks) {
    if (c.metric in metrics || stageId === "04") continue;
  }
  if (stageId === "04" || stageId === "05" || stageId === "06" || stageId === "07") {
    for (const c of checks) {
      if (typeof c.value === "number") metrics[c.metric] = c.value;
    }
  }
  const body = JSON.stringify({ stageId, checks, metrics, ladder, attempt });
  const digest = await sha256(body);
  const truths = stageId === "01" ? designTruths(seeded.spec) : seeded.truths;
  const sealedPayload = stageId === "01" ? await sha256(JSON.stringify(truths)) : seeded.sealedHash;
  const reviewSeed = seeded.reviews;
  const stats = stageId === "11" ? validationStats(seeded.spec, pred, seeded.degraded) : null;
  const retryAllowed = status === "fail" && ladder < stage.ladder.length;
  const report: StageReport = {
    job_id: job.id,
    stage_id: stageId,
    stage_name: stage.name,
    space_class: job.spec.spaceClass,
    attempt,
    status,
    started_at: now,
    finished_at: new Date().toISOString(),
    software: [
      { name: "Capbim orchestrator", version: "2.0.0", host: "browser" },
      { name: "Synthetic fixture (Metashape stand-in)", version: "2.3.2-schema", host: "local" },
    ],
    params: {
      runner: "synthetic-fixture",
      ladder,
      camera: job.spec.camera,
      space_class: job.spec.spaceClass,
      thresholds: "read-only",
    },
    inputs: [],
    outputs: [
      {
        path: `stages/${stageId}/report.json`,
        sha256: digest,
        kind: "report",
        bytes: body.length,
        sealed: stageId === "01" ? true : undefined,
      },
    ],
    metrics,
    checks,
    diagnosis: diagnosisOf(checks),
    retry: {
      allowed: retryAllowed,
      ladder_step_next: ladder + (retryAllowed ? 1 : 0),
      ladder_max: stage.ladder.length,
      param_changes: retryAllowed ? { step: stage.ladder[ladder] ?? "" } : {},
      reason: retryAllowed ? (stage.ladder[ladder] ?? "") : status === "fail" ? "Ladder exhausted" : "",
    },
    human_gate: gateFor(stageId, checks, status),
  };
  const reports = [...job.reports.filter((r) => r.stage_id !== stageId), report];
  const gates = { ...job.gates };
  if (stageId === "08" && (status === "pass" || status === "warn")) gates.g2 = "approved";
  if (stageId === "08" && status === "blocked") gates.g2 = "pending";
  const log = [...job.log, { at: now, text: `Stage ${stageId} ${stage.name}: ${status} (attempt ${attempt}, ladder ${ladder}).` }];
  return {
    ...job,
    reports,
    attempts: { ...job.attempts, [stageId]: attempt },
    reviews: reviewSeed,
    truths: truths.length ? truths : job.truths,
    sealedHash: sealedPayload,
    residuals: stats ? stats.residuals : job.residuals,
    unsealed: stageId === "11" ? true : job.unsealed,
    gates,
    log,
    specHashAtRun: job.specHashAtRun ?? specHash(job.spec),
  };
}

export type NextAction =
  | { type: "run" | "retry"; stageId: string; label: string }
  | { type: "gate"; gate: GateId; stageId: string; label: string }
  | { type: "stuck"; stageId: string; label: string }
  | { type: "stale" }
  | { type: "done" };

export function latestReport(job: Job, stageId: string): StageReport | undefined {
  return job.reports.find((r) => r.stage_id === stageId);
}

export function isStale(job: Job): boolean {
  return Boolean(job.specHashAtRun && job.specHashAtRun !== specHash(job.spec) && job.reports.length);
}

export function nextAction(job: Job): NextAction {
  if (isStale(job)) return { type: "stale" };
  for (const stage of STAGES) {
    const report = latestReport(job, stage.id);
    if (!report) {
      if (stage.id === "01" && job.gates.g0 === "pending") {
        return { type: "gate", gate: "g0", stageId: "00", label: "Approve the plan" };
      }
      return { type: "run", stageId: stage.id, label: `Run ${stage.name}` };
    }
    if (job.forcedStages.includes(stage.id) && (report.status === "fail" || report.status === "blocked")) continue;
    if (report.status === "pass" || report.status === "warn") {
      if (stage.id === "00" && job.gates.g0 === "pending") {
        return { type: "gate", gate: "g0", stageId: "00", label: "Approve the plan" };
      }
      if (stage.id === "11" && job.gates.g3 === "pending") {
        return { type: "gate", gate: "g3", stageId: "11", label: "Sign or hold" };
      }
      continue;
    }
    if (report.status === "blocked") {
      const waiting = job.reviews.some((r) => !r.decision);
      if (!waiting && job.reviews.length > 0) {
        return { type: "run", stageId: stage.id, label: "Re-run attributes" };
      }
      return { type: "gate", gate: "g2", stageId: "08", label: "Resolve the review queue" };
    }
    if (report.status === "fail" && stage.id === "00" && surveyOnlyFailure(job)) {
      if (job.gates.g0 === "waived" || job.forcedStages.includes("00")) continue;
      return { type: "gate", gate: "g0", stageId: "00", label: "Survey control required" };
    }
    const ladder = job.ladders[stage.id] ?? 0;
    if (ladder < stage.ladder.length) {
      return { type: "retry", stageId: stage.id, label: stage.ladder[ladder] ?? "Retry" };
    }
    return { type: "stuck", stageId: stage.id, label: "Ladder exhausted" };
  }
  return { type: "done" };
}

export function applyRetry(spec: JobSpec, stageId: string, nextLadder: number, pred: Prediction): JobSpec {
  if (stageId === "01" && nextLadder >= 1) {
    const min = byClass(T.stage_01_capture.image_count_min, spec.spaceClass);
    const planned = imageCount({ ...spec, faults: { ...spec.faults, lowImageCount: false } }, pred);
    return {
      ...spec,
      shutterS: Math.min(spec.shutterS, 0.004),
      imageOverride: planned < min ? min : spec.imageOverride,
      faults: { ...spec.faults, stabilisationOn: false, slowShutter: false, lowImageCount: false },
    };
  }
  if (stageId === "05" && nextLadder >= 2) {
    return { ...spec, faults: { ...spec.faults, barIdMismatch: false } };
  }
  return spec;
}

export function surveyOnlyFailure(job: Job): boolean {
  const report = latestReport(job, "00");
  if (!report) return false;
  const fails = report.checks.filter((c) => c.result === "fail");
  return fails.length > 0 && fails.every((c) => c.id === "survey");
}

export const FEATURES = [
  "Spatial tree with isolate and hide, selection on the BIM and the mesh",
  "Property panel with Pset_CaptureEvidence",
  "Distance and angle, snapped to the surface, in millimetres, with an accuracy badge",
  "Section planes on X, Y, Z and a free plane, plus a plan camera",
  "Mesh layer and a ±10 mm deviation ramp",
  "Photo lookup from the stations that see the element",
  "Local coordinates, datum, level targets and scale bars",
  "QC dashboard: stage table, residuals, provenance",
  "Runs in the browser after load, with downloads you can keep",
  "Downloads: IFC, glTF, point sample, validation JSON, accuracy statement",
] as const;

