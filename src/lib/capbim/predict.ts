import type { CameraId, Prediction, SpaceClass } from "./types";

export const CAMERAS: Record<
  CameraId,
  { label: string; sensor_w_mm: number; sensor_h_mm: number; px_w: number; px_h: number; c_mm: number }
> = {
  ff61_24mm: { label: "61 MP, 24 mm", sensor_w_mm: 35.7, sensor_h_mm: 23.8, px_w: 9504, px_h: 6336, c_mm: 24 },
  ff45_24mm: { label: "45 MP, 24 mm", sensor_w_mm: 35.9, sensor_h_mm: 23.9, px_w: 8192, px_h: 5464, c_mm: 24 },
  ff45_35mm: { label: "45 MP, 35 mm", sensor_w_mm: 35.9, sensor_h_mm: 23.9, px_w: 8192, px_h: 5464, c_mm: 35 },
  mf102_32mm: { label: "102 MP, 32 mm", sensor_w_mm: 43.8, sensor_h_mm: 32.9, px_w: 11648, px_h: 8736, c_mm: 32 },
};

const CLASS_Z: Record<SpaceClass, number> = { S: 3, M: 5, L: 12 };

function round(n: number, d = 0): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

export function predict(opts: {
  cls: SpaceClass;
  cam: CameraId;
  overlap?: number;
  heights?: number;
  kRays?: number;
  q?: number;
  sigmaPxTie?: number;
  sigmaPxTarget?: number;
  extra?: number;
  gsdTarget?: number | null;
  length: number;
  width: number;
  height: number;
}): Prediction {
  const overlap = opts.overlap ?? 0.8;
  const heights = opts.heights ?? 3;
  const kRays = opts.kRays ?? 6;
  const q = opts.q ?? 1;
  const sigmaPxTie = opts.sigmaPxTie ?? 0.5;
  const sigmaPxTarget = opts.sigmaPxTarget ?? 0.1;
  const extra = opts.extra ?? 0.5;
  const c = CAMERAS[opts.cam];
  const p = c.sensor_w_mm / c.px_w;
  let z = opts.gsdTarget ? (opts.gsdTarget * c.c_mm) / (p * 1000) : CLASS_Z[opts.cls];
  const fit = Math.min(opts.length, opts.width) * 0.45;
  let clamped = false;
  if (z > fit && fit > 0.8) {
    z = fit;
    clamped = true;
  }
  const S = (z * 1000) / c.c_mm;
  const gsd = (p * z * 1000) / c.c_mm;
  const Wf = (z * c.sensor_w_mm) / c.c_mm;
  const Hf = (z * c.sensor_h_mm) / c.c_mm;
  const spacing = (1 - overlap) * Wf;
  const P = 2 * (opts.length + opts.width);
  const nPerim = Math.ceil(P / Math.max(spacing, 0.05)) * heights;
  const nTotal = Math.ceil(nPerim * (1 + extra));
  const sigTie = sigmaPxTie * p;
  const sigTgt = sigmaPxTarget * p;
  const fraserTgt = (q * S * sigTgt) / Math.sqrt(kRays);
  const fraserTie = (q * S * sigTie) / Math.sqrt(kRays);
  const depthPair = (z / Math.max(spacing, 0.05)) * S * sigTie;
  const depthMulti = depthPair / Math.sqrt(Math.max(1, kRays - 1));
  const diag = Math.hypot(opts.length, opts.width);
  return {
    class: opts.cls,
    camera: opts.cam,
    geometry_m: { L: opts.length, W: opts.width, H: opts.height, Z_wall: round(z, 2) },
    standoff_m: round(z, 2),
    standoff_clamped: clamped,
    pixel_pitch_um: round(p * 1000, 2),
    scale_number: round(S),
    gsd_mm_at_walls: round(gsd, 2),
    footprint_m: [round(Wf, 2), round(Hf, 2)],
    station_spacing_m: round(spacing, 2),
    perimeter_m: round(P, 1),
    images_perimeter: nPerim,
    images_total_est: nTotal,
    fraser_precision_targets_mm: round(fraserTgt, 3),
    fraser_precision_tiepoints_mm: round(fraserTie, 3),
    depth_precision_pair_mm: round(depthPair, 2),
    depth_precision_multiview_mm: round(depthMulti, 2),
    surface_2x_gsd_mm: round(2 * gsd, 2),
    surface_rule_1to3xGSD_mm: [round(gsd, 2), round(3 * gsd, 2)],
    space_diagonal_m: round(diag, 2),
    scale_error_on_diagonal_mm_from_one_bar: round((diag * 1000 * 0.1) / 1000, 2),
    note: "Systematic error (calibration drift, dome, texture-less walls) is not in these numbers.",
  };
}
