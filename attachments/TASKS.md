# Capture-to-BIM pipeline review — tasks (started 2026-10-11)

- [x] Research: instrument accuracy specs — done; LOA ranges spot-checked (95 % confidence, LOA40 = 1–5 mm)
- [x] Research: SfM engine automation — done; no-splat, COLMAP export and laser-scan API spot-checked in the PDFs
- [x] Research: scan-to-BIM automation — done; 3DR CLI, IFClite and Cloud2BIM spot-checked
- [x] Research: browser viewers — done (ThatOpen+Spark primary, xeokit alt, IFClite lacks measurement)
- [x] Research: literature — done (23 sourced rows; Barazzetti 2018 and Luhmann 2014 spot-checked)
- [x] Verified myself: CloudCompare CLI (-RANSAC, -C2M_DIST, -SAMPLE_MESH), Open3D segment_plane, pyRevit CLI `run` (batch on Windows+Revit)
- [x] Spot-check key subagent figures against primary sources (LOA, S910, 3DR CLI, IFClite, Cloud2BIM, Metashape PDFs, Barazzetti 2018, Luhmann 2014, VGGT field test, VSI-Bench)
- [x] Write qc-thresholds.yaml (validated) and stage-report.schema.json (validated)
- [x] Write metashape_pipeline.py skeleton (syntax-checked; API names marked VERIFY pending research)
- [x] Write predict_precision.py (Stage 00 predictor) and run S/M/L cases
- [x] Draft plan parts: stages (§2), browser delivery (§4), orchestration (§5)
- [x] Write §1, §3, §6, §7 and the AI-model section §1b
- [x] Assemble PLAN-v2.md (13.5k words, 167 sourced + 30 estimated figures), send deliverable, summarise in chat
