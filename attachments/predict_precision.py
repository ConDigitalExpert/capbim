#!/usr/bin/env python3
"""
predict_precision.py — Stage 00 capture-plan predictor (no external deps).
Estimates GSD, footprint, station spacing, image count, Fraser network precision and multi-view depth precision
for a space class and camera. All outputs are ESTIMATES; they are the basis for the [est] figures in PLAN-v2.md.

Fraser (1996) network design: sigma_c = q * S * sigma_img / sqrt(k), S = Z/c (scale number), sigma_img = image
measurement precision, k = rays per point, q = design factor (~0.7 strong convergent ... 1.5 weak).
Normal-case stereo depth precision: sigma_Z = (Z/B) * S * sigma_img ; averaged over k_pairs: / sqrt(k_pairs).
"""
import argparse, json, math

CAMERAS = {
    "ff61_24mm": {"sensor_w_mm": 35.7, "sensor_h_mm": 23.8, "px_w": 9504, "px_h": 6336, "c_mm": 24.0},   # 61 MP full frame + 24 mm prime
    "ff45_24mm": {"sensor_w_mm": 35.9, "sensor_h_mm": 23.9, "px_w": 8192, "px_h": 5464, "c_mm": 24.0},   # 45 MP full frame + 24 mm prime
    "ff45_35mm": {"sensor_w_mm": 35.9, "sensor_h_mm": 23.9, "px_w": 8192, "px_h": 5464, "c_mm": 35.0},   # for halls (longer range)
    "mf102_32mm": {"sensor_w_mm": 43.8, "sensor_h_mm": 32.9, "px_w": 11648, "px_h": 8736, "c_mm": 32.0}, # 102 MP medium format
}
CLASSES = {  # representative geometries
    "S": {"L": 6.0, "W": 4.0, "H": 2.8, "Z_wall": 3.0},
    "M": {"L": 20.0, "W": 12.0, "H": 4.0, "Z_wall": 5.0},
    "L": {"L": 60.0, "W": 40.0, "H": 10.0, "Z_wall": 12.0},
}

def predict(cls, cam, overlap=0.8, sidelap=0.6, heights=3, k_rays=6, q=1.0, sigma_px_tie=0.5, sigma_px_target=0.1, extra=0.5, gsd_target=None):
    g, c = dict(CLASSES[cls]), CAMERAS[cam]
    p = c["sensor_w_mm"] / c["px_w"]                       # pixel pitch, mm
    if gsd_target:                                         # standoff chosen from the GSD requirement (mm/px)
        g["Z_wall"] = round(gsd_target * c["c_mm"] / (p * 1000), 2)
    Z = g["Z_wall"]; S = Z * 1000 / c["c_mm"]              # scale number
    gsd = p * Z * 1000 / c["c_mm"]                         # mm/px at the walls
    Wf = Z * c["sensor_w_mm"] / c["c_mm"]; Hf = Z * c["sensor_h_mm"] / c["c_mm"]   # footprint, m (landscape)
    s = (1 - overlap) * Wf                                 # station spacing along walls, m
    P = 2 * (g["L"] + g["W"])
    n_perim = math.ceil(P / s) * heights
    n_total = math.ceil(n_perim * (1 + extra))             # + convergent corners, floor/ceiling, inward stations
    sig_img_tie = sigma_px_tie * p; sig_img_tgt = sigma_px_target * p
    fraser_tgt = q * S * sig_img_tgt / math.sqrt(k_rays)   # mm, targeted points
    fraser_tie = q * S * sig_img_tie / math.sqrt(k_rays)   # mm, natural tie points
    B = s                                                  # base between adjacent stations
    depth_pair = (Z / B) * S * sig_img_tie                 # mm, single normal pair
    depth_multi = depth_pair / math.sqrt(max(1, k_rays - 1))
    diag = math.hypot(g["L"], g["W"])
    return {
        "class": cls, "camera": cam, "geometry_m": g, "standoff_m": Z, "pixel_pitch_um": round(p * 1000, 2), "scale_number": round(S),
        "gsd_mm_at_walls": round(gsd, 2), "footprint_m": [round(Wf, 2), round(Hf, 2)], "station_spacing_m": round(s, 2),
        "perimeter_m": round(P, 1), "images_perimeter": n_perim, "images_total_est": n_total,
        "fraser_precision_targets_mm": round(fraser_tgt, 3), "fraser_precision_tiepoints_mm": round(fraser_tie, 3),
        "depth_precision_pair_mm": round(depth_pair, 2), "depth_precision_multiview_mm": round(depth_multi, 2),
        "surface_rule_1to3xGSD_mm": [round(gsd, 2), round(3 * gsd, 2)], "space_diagonal_m": round(diag, 1),
        "scale_bar_0.1mm_over_1m_ppm": 100, "scale_error_on_diagonal_mm_from_bar": round(diag * 1000 * 0.1 / 1000, 2),
        "note": "systematic errors (calibration drift, dome effect, texture-less surfaces) are NOT in these numbers",
    }

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--class", dest="cls", default=None); ap.add_argument("--camera", default="ff61_24mm")
    ap.add_argument("--overlap", type=float, default=0.8); ap.add_argument("--json", action="store_true"); ap.add_argument("--gsd-target", type=float, default=None)
    a = ap.parse_args()
    rows = [predict(c, a.camera, overlap=a.overlap, gsd_target=a.gsd_target) for c in ([a.cls] if a.cls else ["S", "M", "L"])]
    if a.json:
        print(json.dumps(rows, indent=2))
    else:
        keys = ["class", "standoff_m", "gsd_mm_at_walls", "station_spacing_m", "images_total_est", "fraser_precision_targets_mm", "fraser_precision_tiepoints_mm", "depth_precision_pair_mm", "depth_precision_multiview_mm", "surface_rule_1to3xGSD_mm", "scale_error_on_diagonal_mm_from_bar"]
        print(" | ".join(keys))
        for r in rows:
            print(" | ".join(str(r[k]) for k in keys))
