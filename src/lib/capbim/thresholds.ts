import type { SpaceClass } from "./types";

export const SPACE = {
  S: { name: "Small room", longest_dim_m: 8, area_m2_max: 60, images: [60, 150] as const },
  M: { name: "Medium space", longest_dim_m: 20, area_m2_max: 300, images: [150, 400] as const },
  L: { name: "Large hall", longest_dim_m: 60, area_m2_max: 3000, images: [300, 1200] as const },
};

type ByClass = Record<SpaceClass, number>;

export const THRESHOLDS = {
  stage_00_plan: {
    predicted_target_precision_mm_max: { S: 0.5, M: 0.8, L: 1.5 } as ByClass,
    predicted_surface_precision_mm_max: { S: 1.5, M: 2.5, L: 5.0 } as ByClass,
    gsd_mm_max_at_walls: { S: 0.8, M: 1.2, L: 2.5 } as ByClass,
    targets_min: { S: 20, M: 40, L: 80 } as ByClass,
    scalebars_total_min: { S: 4, M: 6, L: 8 } as ByClass,
    scalebars_heldout_min: { S: 1, M: 2, L: 3 } as ByClass,
    level_datum_targets_min: 4,
    independent_checks_min: { S: 10, M: 20, L: 40 } as ByClass,
    survey_control_required: { S: false, M: "optional", L: true } as Record<SpaceClass, boolean | "optional">,
  },
  stage_01_capture: {
    image_count_min: { S: 60, M: 150, L: 300 } as ByClass,
    focal_length_values_max: 1,
    iso_max: 800,
    aperture_f_range: [5.6, 11] as [number, number],
    shutter_s_max_handheld: 0.004,
    blur_reject_fraction_max: 0.05,
    clipped_highlight_fraction_max: 0.02,
    targets_detected_fraction_min: 0.95,
    scalebar_cert_uncertainty_mm_max: 0.1,
  },
  stage_02_onsite_qc: {
    aligned_fraction_min: 0.97,
    components_max: 1,
    targets_ge4_projections_fraction_min: 0.95,
    scalebar_residual_abs_mm_max: { S: 2.0, M: 3.0, L: 5.0 } as ByClass,
    coverage_gap_max_m2: { S: 0.5, M: 1.0, L: 4.0 } as ByClass,
  },
  stage_03_alignment: {
    aligned_fraction_min: { S: 0.98, M: 0.97, L: 0.95 } as ByClass,
    components_max: 1,
    tiepoint_rms_reproj_px_max: 0.5,
    marker_rms_reproj_px_max: 0.3,
    marker_projections_min: 4,
    median_tiepoints_per_image_min: 1500,
    f_stderr_px_max: 1.0,
    cx_cy_stderr_px_max: 1.0,
    param_correlation_abs_max: 0.95,
    focus_groups_max: 1,
  },
  stage_04_scale_and_datum: {
    control_bar_residual_rms_mm_max: { S: 0.5, M: 1.0, L: 1.5 } as ByClass,
    control_bar_residual_abs_mm_max: { S: 1.0, M: 2.0, L: 3.0 } as ByClass,
    check_bar_residual_abs_mm_max: { S: 1.0, M: 1.5, L: 2.5 } as ByClass,
    level_datum_z_residual_abs_mm_max: { S: 1.0, M: 1.5, L: 3.0 } as ByClass,
    survey_control_rmse_mm_max: { M: 2.0, L: 3.0 } as Partial<ByClass>,
    survey_check_rmse_mm_max: { M: 2.5, L: 4.0 } as Partial<ByClass>,
    long_diagonal_check_abs_mm_max: { S: 2.0, M: 3.0, L: 5.0 } as ByClass,
  },
  stage_05_dense_mesh_texture: {
    mesh_vs_tiepoints_median_mm_max: { S: 1.0, M: 1.5, L: 2.5 } as ByClass,
    mesh_vs_tiepoints_p95_mm_max: { S: 3.0, M: 4.0, L: 6.0 } as ByClass,
    mesh_vs_marker_centres_rmse_mm_max: { S: 1.0, M: 1.5, L: 2.5 } as ByClass,
    hole_area_fraction_max: 0.02,
    texture_px_per_mm_min_walls: { S: 1.0, M: 0.5, L: 0.25 } as ByClass,
    scan_registration_rms_mm_max: 2.0,
    heldout_psnr_db_min: 25,
  },
  stage_06_geometry_extraction: {
    plane_fit_rms_mm_max: { S: 1.5, M: 2.5, L: 4.0 } as ByClass,
    plane_inlier_fraction_min: 0.9,
    expected_elements_found_fraction_min: 0.95,
    wall_to_wall_vs_check_abs_mm_max: { S: 3.0, M: 4.0, L: 6.0 } as ByClass,
    deviation_within_5mm_area_fraction_min: { S: 0.95, M: 0.9, L: 0.85 } as ByClass,
    deviation_within_10mm_area_fraction_min: { S: 0.99, M: 0.98, L: 0.95 } as ByClass,
  },
  stage_07_semantics_attributes: {
    required_attributes_filled_fraction_min: 1,
    auto_accept_confidence_min: 0.85,
    evidence_images_per_element_min: 2,
  },
  stage_08_bim_authoring: {
    ifc_schema_validation_errors_max: 0,
    ids_required_facets_pass_fraction_min: 1,
    ifc_vs_mesh_p95_mm_max: { S: 4.0, M: 5.0, L: 8.0 } as ByClass,
  },
  stage_09_browser_delivery: {
    first_load_s_max: 10,
    bundle_mb_max: { S: 300, M: 600, L: 1500 } as ByClass,
    measurement_tool_vs_ifc_abs_mm_max: 0.5,
    pset_visible_sampled_elements_fraction_min: 1,
  },
  stage_10_blind_validation: {
    checks_used_min: { S: 10, M: 20, L: 40 } as ByClass,
    rmse_mm_max: { S: 2.0, M: 2.5, L: 5.0 } as ByClass,
    p95_abs_mm_max: { S: 4.0, M: 5.0, L: 10.0 } as ByClass,
    abs_max_mm_max: { S: 6.0, M: 8.0, L: 15.0 } as ByClass,
    L_hybrid: { rmse_mm_max: 3.0, p95_abs_mm_max: 6.0, abs_max_mm_max: 10.0 },
  },
};

export function byClass(table: ByClass, cls: SpaceClass): number {
  return table[cls];
}
