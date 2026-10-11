#!/usr/bin/env python3
"""
metashape_pipeline.py  —  Stages 02–05 of the capture-to-BIM pipeline as a headless Metashape Pro 2.x script.

Run (macOS):   /Applications/MetashapePro.app/Contents/MacOS/MetashapePro -r metashape_pipeline.py -- --job job.json --stage 03
Run (Linux):   metashape.sh -r metashape_pipeline.py -- --job job.json --stage 03   (headless servers: Qt flag "-platform offscreen" is used in HPC setups but is not documented by Agisoft)
Each stage writes stages/<id>/report.json conforming to stage-report.schema.json, then exits 0 (pass/warn) or 2 (fail).
The orchestrator (not this script) decides retries using the per-stage ladder in PLAN-v2.md and qc-thresholds.yaml.

SKELETON STATUS: method names checked against the Metashape Python API reference 2.3.0 (detectMarkers, addScalebar,
matchPhotos/alignCameras/optimizeCameras, TiePoints.Filter, buildDepthMaps/Model/Texture/PointCloud, exportModel GLTF,
exportReport, exportCameras COLMAP, importPointCloud(is_laser_scan=True)). Lines marked "VERIFY" are helper calls whose
exact names were not checked (mesh pick, rotation helper, calibration covariance access).
"""
import argparse, datetime, hashlib, json, math, os, statistics, sys
import Metashape  # noqa: E402  (only importable inside Metashape's bundled Python)

ISO = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()

# ----------------------------------------------------------------------------- helpers
def sha256(path, block=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(block), b""):
            h.update(chunk)
    return h.hexdigest()

def artifact(path, kind):
    return {"path": path, "sha256": sha256(path), "kind": kind, "bytes": os.path.getsize(path)}

def check(cid, metric, op, threshold, value, severity="blocking", src=None):
    ops = {"<=": lambda a, b: a <= b, "<": lambda a, b: a < b, ">=": lambda a, b: a >= b, ">": lambda a, b: a > b, "==": lambda a, b: a == b}
    ok = value is not None and ops[op](value, threshold)
    return {"id": cid, "metric": metric, "operator": op, "threshold": threshold, "value": value,
            "result": "pass" if ok else ("fail" if severity == "blocking" else "warn"), "severity": severity,
            "threshold_source": src or ""}

def write_report(job, stage_id, name, attempt, params, inputs, outputs, metrics, checks, started):
    blocking_fail = any(c["result"] == "fail" for c in checks)
    warn = any(c["result"] == "warn" for c in checks)
    rep = {"job_id": job["job_id"], "stage_id": stage_id, "stage_name": name, "space_class": job["space_class"],
           "attempt": attempt, "status": "fail" if blocking_fail else ("warn" if warn else "pass"),
           "started_at": started, "finished_at": ISO(),
           "software": [{"name": "Metashape Professional", "version": Metashape.app.version, "host": os.uname().nodename}],
           "params": params, "inputs": inputs, "outputs": outputs, "metrics": metrics, "checks": checks,
           "log_path": os.path.join(job["root"], "stages", stage_id, "log.txt")}
    out = os.path.join(job["root"], "stages", stage_id)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "report.json"), "w") as f:
        json.dump(rep, f, indent=2)
    print(f"[{stage_id}] {rep['status']}  -> {out}/report.json")
    return 0 if rep["status"] in ("pass", "warn") else 2

def thr(job, *keys):
    """Look up a threshold in the loaded qc-thresholds dict; class-specific dicts resolve by job['space_class']."""
    v = job["thresholds"]
    for k in keys:
        v = v[k]
    return v[job["space_class"]] if isinstance(v, dict) and job["space_class"] in v else v

# ----------------------------------------------------------------------------- metrics
def tiepoint_rms_px(chunk):
    """RMS reprojection error of valid tie points, in pixels (full-resolution image coordinates)."""
    tp = chunk.tie_points
    if tp is None:
        return None, 0
    points = tp.points
    npoints = len(points)
    sq, n = 0.0, 0
    for cam in chunk.cameras:
        if not cam.transform or cam not in tp.projections:
            continue
        for proj in tp.projections[cam]:
            tid = proj.track_id
            if tid >= npoints or not points[tid].valid:
                continue
            est = cam.project(points[tid].coord)
            if est is None:
                continue
            d = est - proj.coord
            sq += d.x * d.x + d.y * d.y
            n += 1
    return (math.sqrt(sq / n) if n else None), n

def marker_residuals_px(chunk):
    """Per-marker RMS reprojection error (px) and projection counts."""
    out = {}
    for m in chunk.markers:
        if m.position is None:
            continue
        sq, n = 0.0, 0
        for cam, proj in m.projections.items():
            if not cam.transform or not proj.valid:
                continue
            est = cam.project(m.position)
            if est is None:
                continue
            d = est - proj.coord
            sq += d.x * d.x + d.y * d.y
            n += 1
        out[m.label] = {"rms_px": math.sqrt(sq / n) if n else None, "projections": n}
    return out

def scalebar_residuals_mm(chunk):
    """Signed residual (model − certificate) for every scale bar, in mm; split by control/check."""
    T = chunk.transform.matrix
    res = {"control": {}, "check": {}}
    for sb in chunk.scalebars:
        m1, m2 = sb.point0, sb.point1
        if m1.position is None or m2.position is None or sb.reference.distance is None:
            continue
        d_model = (T.mulp(m1.position) - T.mulp(m2.position)).norm()
        r = (d_model - sb.reference.distance) * 1000.0
        res["control" if sb.reference.enabled else "check"][sb.label] = round(r, 3)
    return res

def rms(vals):
    return math.sqrt(sum(v * v for v in vals) / len(vals)) if vals else None

# ----------------------------------------------------------------------------- stages
def stage_02_onsite_qc(job, attempt):
    """Low-resolution alignment on the capture laptop before leaving site: coverage + gross scale check."""
    started = ISO()
    doc = Metashape.Document()
    chunk = doc.addChunk()
    photos = sorted(os.path.join(job["images_dir"], f) for f in os.listdir(job["images_dir"]) if f.lower().endswith((".jpg", ".jpeg", ".tif", ".tiff")))
    chunk.addPhotos(photos)
    params = {"downscale": 4, "keypoint_limit": 20000, "tiepoint_limit": 2000, "target_type": "CircularTarget12bit", "tolerance": 50}
    chunk.detectMarkers(target_type=getattr(Metashape, job.get("target_type", "CircularTarget12bit")), tolerance=params["tolerance"])
    chunk.matchPhotos(downscale=params["downscale"], generic_preselection=True, reference_preselection=False,
                      keypoint_limit=params["keypoint_limit"], tiepoint_limit=params["tiepoint_limit"])
    chunk.alignCameras(adaptive_fitting=False)
    _apply_scalebars(chunk, job)
    chunk.updateTransform()
    aligned = sum(1 for c in chunk.cameras if c.transform)
    aligned_frac = aligned / max(1, len(chunk.cameras))
    mres = marker_residuals_px(chunk)
    tgt_ok = sum(1 for v in mres.values() if v["projections"] >= 4) / max(1, len(job["targets_placed"]))
    sb = scalebar_residuals_mm(chunk)
    sb_abs_max = max([abs(v) for v in list(sb["control"].values()) + list(sb["check"].values())] or [None])
    metrics = {"images": len(chunk.cameras), "aligned": aligned, "aligned_fraction": aligned_frac,
               "targets_ge4_fraction": tgt_ok, "scalebar_abs_max_mm": sb_abs_max, "scalebars": sb}
    checks = [check("aligned", "aligned_fraction", ">=", job["thresholds"]["stage_02_onsite_qc"]["aligned_fraction_min"], aligned_frac),
              check("targets", "targets_ge4_fraction", ">=", job["thresholds"]["stage_02_onsite_qc"]["targets_ge4_projections_fraction_min"], tgt_ok),
              check("scale", "scalebar_abs_max_mm", "<=", thr(job, "stage_02_onsite_qc", "scalebar_residual_abs_mm_max"), sb_abs_max)]
    psx = os.path.join(job["root"], "stages", "02", "onsite.psx")
    os.makedirs(os.path.dirname(psx), exist_ok=True)
    doc.save(psx)
    return write_report(job, "02", "onsite_qc", attempt, params, [], [artifact(psx, "psx")], metrics, checks, started)

def _apply_scalebars(chunk, job):
    """job['scalebars'] = [{label, marker_a, marker_b, length_m, uncertainty_m, role: control|check}]"""
    by_label = {m.label: m for m in chunk.markers}
    for s in job["scalebars"]:
        a, b = by_label.get(s["marker_a"]), by_label.get(s["marker_b"])
        if a is None or b is None:
            print(f"scalebar {s['label']}: marker(s) not detected", file=sys.stderr)
            continue
        sb = chunk.addScalebar(a, b)
        sb.label = s["label"]
        sb.reference.distance = s["length_m"]
        sb.reference.accuracy = s["uncertainty_m"]          # e.g. 0.0001 (0.1 mm) from the certificate
        sb.reference.enabled = (s["role"] == "control")      # check bars are held out

def stage_03_alignment(job, attempt, ladder):
    """Full-resolution alignment, target detection, gradual selection and self-calibration."""
    started = ISO()
    doc = Metashape.Document()
    psx = os.path.join(job["root"], "stages", "03", "align.psx")
    os.makedirs(os.path.dirname(psx), exist_ok=True)
    doc.save(psx)
    chunk = doc.addChunk()
    chunk.crs = Metashape.CoordinateSystem("LOCAL_CS[\"Local Coordinates (m)\",LOCAL_DATUM[\"Local Datum\",0],UNIT[\"metre\",1]]")
    photos = sorted(os.path.join(job["images_dir"], f) for f in os.listdir(job["images_dir"]) if f.lower().endswith((".jpg", ".jpeg", ".tif", ".tiff")))
    chunk.addPhotos(photos)
    if job.get("masks_dir"):
        chunk.generateMasks(path=os.path.join(job["masks_dir"], "{filename}_mask.png"), masking_mode=Metashape.MaskingModeFile)
    # retry ladder (orchestrator passes the step index): widen limits, then guided matching, then full-res "Highest"
    base = {"downscale": 1, "keypoint_limit": 40000, "tiepoint_limit": 4000, "guided_matching": False}
    steps = [{}, {"keypoint_limit": 80000, "tiepoint_limit": 10000}, {"guided_matching": True}, {"downscale": 0}]
    params = {**base, **steps[min(ladder, len(steps) - 1)], "ladder_step": ladder}
    chunk.detectMarkers(target_type=getattr(Metashape, job.get("target_type", "CircularTarget12bit")), tolerance=50)
    chunk.matchPhotos(downscale=params["downscale"], generic_preselection=True, reference_preselection=False,
                      keypoint_limit=params["keypoint_limit"], tiepoint_limit=params["tiepoint_limit"],
                      guided_matching=params["guided_matching"], keep_keypoints=True)
    chunk.alignCameras(adaptive_fitting=False)
    fit = dict(fit_f=True, fit_cx=True, fit_cy=True, fit_b1=False, fit_b2=False, fit_k1=True, fit_k2=True, fit_k3=True,
               fit_k4=False, fit_p1=True, fit_p2=True, fit_corrections=False, adaptive_fitting=False, tiepoint_covariance=True)
    chunk.optimizeCameras(**fit)
    # gradual selection, in the documented order, each followed by re-optimisation
    gs = job["thresholds"]["stage_03_alignment"]["gradual_selection"]
    F = Metashape.TiePoints.Filter
    for crit, val in [(F.ReconstructionUncertainty, gs["reconstruction_uncertainty_max"]),
                      (F.ProjectionAccuracy, gs["projection_accuracy_max"]),
                      (F.ReprojectionError, gs["reprojection_error_max"])]:
        f = F(); f.init(chunk, criterion=crit); f.removePoints(val)
        chunk.optimizeCameras(**fit)
    f = F(); f.init(chunk, criterion=F.ImageCount); f.removePoints(gs["min_image_count"] - 1)   # VERIFY semantics of ImageCount threshold
    chunk.optimizeCameras(**fit)
    # metrics
    aligned = sum(1 for c in chunk.cameras if c.transform)
    aligned_frac = aligned / max(1, len(chunk.cameras))
    tp_rms, n_proj = tiepoint_rms_px(chunk)
    mres = marker_residuals_px(chunk)
    m_rms = rms([v["rms_px"] for v in mres.values() if v["rms_px"] is not None])
    m_min_proj = min([v["projections"] for v in mres.values()] or [0])
    per_img = [len(chunk.tie_points.projections[c]) for c in chunk.cameras if c.transform and c in chunk.tie_points.projections]
    calib = chunk.sensors[0].calibration
    metrics = {"images": len(chunk.cameras), "aligned": aligned, "aligned_fraction": aligned_frac,
               "tiepoint_rms_px": tp_rms, "tiepoint_projections": n_proj, "marker_rms_px": m_rms,
               "marker_min_projections": m_min_proj, "markers_detected": len(mres),
               "median_tiepoints_per_image": statistics.median(per_img) if per_img else 0,
               "calibration": {"f": calib.f, "cx": calib.cx, "cy": calib.cy, "k1": calib.k1, "k2": calib.k2, "k3": calib.k3, "p1": calib.p1, "p2": calib.p2},
               "sensors": len(chunk.sensors)}
    # NOTE: parameter standard errors / correlations come from the calibration covariance (chunk.sensors[0].calibration covariance
    # is exposed via exportReport / "Camera Calibration" dialog); export the report and parse it, or compute from tiepoint_covariance. VERIFY.
    T3 = job["thresholds"]["stage_03_alignment"]
    checks = [check("aligned", "aligned_fraction", ">=", thr(job, "stage_03_alignment", "aligned_fraction_min"), aligned_frac),
              check("tp_rms", "tiepoint_rms_px", "<=", T3["tiepoint_rms_reproj_px_max"], tp_rms),
              check("mk_rms", "marker_rms_px", "<=", T3["marker_rms_reproj_px_max"], m_rms),
              check("mk_proj", "marker_min_projections", ">=", T3["marker_projections_min"], m_min_proj),
              check("tp_density", "median_tiepoints_per_image", ">=", T3["median_tiepoints_per_image_min"], metrics["median_tiepoints_per_image"], "warning"),
              check("one_group", "sensors", "<=", T3["calibration"]["focus_groups_max"], len(chunk.sensors), "warning")]
    doc.save(psx)
    rep = os.path.join(job["root"], "stages", "03", "alignment_report.pdf")
    chunk.exportReport(rep, title=f"{job['job_id']} alignment")
    return write_report(job, "03", "alignment", attempt, params, [], [artifact(psx, "psx"), artifact(rep, "pdf")], metrics, checks, started)

def stage_04_scale_datum(job, attempt, ladder):
    """Scale from control bars, level datum from laser-line targets, held-out check bars and survey checks."""
    started = ISO()
    doc = Metashape.Document()
    doc.open(os.path.join(job["root"], "stages", "03", "align.psx"))
    chunk = doc.chunk
    for sb in list(chunk.scalebars):
        chunk.remove(sb)
    _apply_scalebars(chunk, job)
    # optional surveyed control (total station): job['survey_points'] = [{marker, x, y, z, sigma_m, role}]
    by_label = {m.label: m for m in chunk.markers}
    for p in job.get("survey_points", []):
        m = by_label.get(p["marker"])
        if m is None:
            continue
        m.reference.location = Metashape.Vector([p["x"], p["y"], p["z"]])
        m.reference.accuracy = Metashape.Vector([p["sigma_m"]] * 3)
        m.reference.enabled = (p["role"] == "control")
    chunk.marker_location_accuracy = Metashape.Vector([0.002, 0.002, 0.002])
    chunk.updateTransform()
    fit = dict(fit_f=True, fit_cx=True, fit_cy=True, fit_b1=False, fit_b2=False, fit_k1=True, fit_k2=True, fit_k3=True,
               fit_k4=False, fit_p1=True, fit_p2=True, fit_corrections=False, adaptive_fitting=False, tiepoint_covariance=True)
    chunk.optimizeCameras(**fit)
    chunk.updateTransform()
    # level datum: rotate so the best-fit plane through the laser-line targets is horizontal (rigid transform only)
    lvl = [by_label[l] for l in job.get("level_targets", []) if l in by_label and by_label[l].position is not None]
    z_resid_mm = None
    if len(lvl) >= 3 and not job.get("survey_points"):
        T = chunk.transform.matrix
        pts = [T.mulp(m.position) for m in lvl]
        c = Metashape.Vector([sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts), sum(p.z for p in pts) / len(pts)])
        # plane normal via cross products averaged (simple, adequate for >=3 well-spread targets); replace with SVD for production
        n = Metashape.Vector([0, 0, 0])
        for i in range(len(pts)):
            a, b = pts[i] - c, pts[(i + 1) % len(pts)] - c
            n += Metashape.Vector.cross(a, b)
        n.normalize()
        if n.z < 0:
            n = -n
        z = Metashape.Vector([0, 0, 1])
        axis = Metashape.Vector.cross(n, z); s = axis.norm(); cth = n * z
        if s > 1e-9:
            axis.normalize(); ang = math.atan2(s, cth)
            R = Metashape.Matrix.Rotation(Metashape.Utils.createRotationMatrix(axis, ang)) if hasattr(Metashape.Utils, "createRotationMatrix") else None  # VERIFY helper name
            if R is not None:
                M = Metashape.Matrix.Translation(c) * R * Metashape.Matrix.Translation(-c)
                chunk.transform.matrix = M * chunk.transform.matrix
        T = chunk.transform.matrix
        zs = [T.mulp(m.position).z for m in lvl]
        zmean = sum(zs) / len(zs)
        z_resid_mm = max(abs(v - zmean) for v in zs) * 1000.0
    sb = scalebar_residuals_mm(chunk)
    ctrl, chk = list(sb["control"].values()), list(sb["check"].values())
    metrics = {"scalebars": sb, "control_rms_mm": rms(ctrl), "control_abs_max_mm": max(map(abs, ctrl)) if ctrl else None,
               "check_abs_max_mm": max(map(abs, chk)) if chk else None, "level_z_resid_abs_max_mm": z_resid_mm,
               "scale": chunk.transform.scale}
    T4 = "stage_04_scale_and_datum"
    checks = [check("ctrl_rms", "control_rms_mm", "<=", thr(job, T4, "control_bar_residual_rms_mm_max"), metrics["control_rms_mm"]),
              check("ctrl_max", "control_abs_max_mm", "<=", thr(job, T4, "control_bar_residual_abs_mm_max"), metrics["control_abs_max_mm"]),
              check("chk_max", "check_abs_max_mm", "<=", thr(job, T4, "check_bar_residual_abs_mm_max"), metrics["check_abs_max_mm"]),
              check("level", "level_z_resid_abs_max_mm", "<=", thr(job, T4, "level_datum_z_residual_abs_mm_max"), z_resid_mm, "warning" if z_resid_mm is None else "blocking")]
    psx = os.path.join(job["root"], "stages", "04", "scaled.psx"); os.makedirs(os.path.dirname(psx), exist_ok=True)
    doc.save(psx)
    cams = os.path.join(job["root"], "stages", "04", "cameras_colmap")
    os.makedirs(cams, exist_ok=True)
    chunk.exportCameras(os.path.join(cams, "cameras.txt"), format=Metashape.CamerasFormatColmap)   # COLMAP export since 2.1.3; feeds Postshot / Nerfstudio splatfacto
    return write_report(job, "04", "scale_datum", attempt, {"ladder_step": ladder}, [], [artifact(psx, "psx")], metrics, checks, started)

def stage_05_dense(job, attempt, ladder):
    """Depth maps -> mesh -> UV/texture -> exports; mesh checked against tie points and marker centres."""
    started = ISO()
    doc = Metashape.Document(); doc.open(os.path.join(job["root"], "stages", "04", "scaled.psx")); chunk = doc.chunk
    cls = job["space_class"]
    base = {"depth_downscale": 1 if cls == "S" else 2, "filter": "MildFiltering", "face_count": "HighFaceCount", "texture_size": 8192, "pages": {"S": 4, "M": 8, "L": 16}[cls]}
    steps = [{}, {"filter": "ModerateFiltering"}, {"depth_downscale": 1}]
    params = {**base, **steps[min(ladder, len(steps) - 1)], "ladder_step": ladder}
    chunk.buildDepthMaps(downscale=params["depth_downscale"], filter_mode=getattr(Metashape, params["filter"]))
    chunk.buildModel(source_data=Metashape.DepthMapsData, surface_type=Metashape.Arbitrary, interpolation=Metashape.EnabledInterpolation,
                     face_count=getattr(Metashape, params["face_count"]), vertex_colors=True)
    chunk.buildUV(mapping_mode=Metashape.GenericMapping, page_count=params["pages"], texture_size=params["texture_size"])
    chunk.buildTexture(blending_mode=Metashape.MosaicBlending, texture_size=params["texture_size"], ghosting_filter=True)
    chunk.buildPointCloud(source_data=Metashape.DepthMapsData, point_colors=True)
    out = os.path.join(job["root"], "stages", "05"); os.makedirs(out, exist_ok=True)
    glb = os.path.join(out, "mesh.glb"); e57 = os.path.join(out, "cloud.e57"); obj = os.path.join(out, "mesh.obj")
    chunk.exportModel(glb, format=Metashape.ModelFormatGLTF, binary=True, gltf_y_up=True, save_texture=True, embed_texture=True, texture_format=Metashape.ImageFormatJPEG)
    chunk.exportModel(obj, format=Metashape.ModelFormatOBJ, save_texture=True, texture_format=Metashape.ImageFormatJPEG)
    chunk.exportPointCloud(e57, format=Metashape.PointCloudFormatE57)
    # mesh-vs-markers: distance from each marker centre (on a surface) to the mesh
    T = chunk.transform.matrix
    dists = []
    for m in chunk.markers:
        if m.position is None or m.label in job.get("markers_not_on_surface", []):
            continue
        hit = chunk.model.pickPoint(m.position, m.position + Metashape.Vector([0, 0, 1e-3]))  # VERIFY: use closestPoint/raycast helper available in installed version
        if hit is not None:
            dists.append((T.mulp(hit) - T.mulp(m.position)).norm() * 1000.0)
    metrics = {"faces": len(chunk.model.faces), "mesh_vs_marker_rmse_mm": rms(dists), "marker_samples": len(dists)}
    # mesh-vs-tiepoints and hole area are computed outside Metashape with CloudCompare CLI (-C2M_DIST) / trimesh in qc_mesh.py
    T5 = "stage_05_dense_mesh_texture"
    checks = [check("mesh_mk", "mesh_vs_marker_rmse_mm", "<=", thr(job, T5, "mesh_vs_marker_centres_rmse_mm_max"), metrics["mesh_vs_marker_rmse_mm"], "warning")]
    doc.save(os.path.join(out, "dense.psx"))
    return write_report(job, "05", "dense_mesh_texture", attempt, params, [], [artifact(glb, "glb"), artifact(obj, "obj"), artifact(e57, "e57")], metrics, checks, started)

# Optional premium / visual paths (API 2.3.0):
#   TLS fusion:   chunk.importPointCloud(path, is_laser_scan=True)  (importLaserScans() was removed in 2.0.0), then
#                 chunk.matchPhotos(..., match_laser_scans=True) and chunk.alignCameras(..., align_laser_scans=True);
#                 registration residuals from exportReport (PDF). RealityScan equivalent: -importLaserScan.
#   3DGS:         Metashape has NO Gaussian-splat generation (none in API 2.3.0 / changelog to 2.4.0 preview). Export
#                 undistorted images + COLMAP cameras (stage 04) and train with Postshot or Nerfstudio splatfacto
#                 (ns-train splatfacto; ns-export gaussian-splat), then compress to SPZ/SOG.

# ----------------------------------------------------------------------------- main
if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser(); ap.add_argument("--job", required=True); ap.add_argument("--stage", required=True)
    ap.add_argument("--attempt", type=int, default=1); ap.add_argument("--ladder", type=int, default=0)
    a = ap.parse_args(argv)
    with open(a.job) as f:
        job = json.load(f)          # includes "thresholds": contents of qc-thresholds.yaml (pre-parsed by the orchestrator)
    Metashape.app.cpu_enable = False
    Metashape.app.gpu_mask = job.get("gpu_mask", 1)
    fn = {"02": lambda: stage_02_onsite_qc(job, a.attempt), "03": lambda: stage_03_alignment(job, a.attempt, a.ladder),
          "04": lambda: stage_04_scale_datum(job, a.attempt, a.ladder), "05": lambda: stage_05_dense(job, a.attempt, a.ladder)}[a.stage]
    sys.exit(fn())
