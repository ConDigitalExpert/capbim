# Capture-to-BIM pipeline — revised plan v2 (2026-10-11)

Engineering-grade photorealistic 3D BIM interiors from small image sets, with frontier models (GPT-6 Astra, GPT-6.1 Sol, Claude Opus 5.5) in the loop and every accuracy figure labelled **[src]** (sourced, see §7) or **[est]** (estimated, basis stated).

## 0. What changed from v1 and why

| # | v1 | v2 | Why |
|---|---|---|---|
| 1 | "±2–5 mm", "laser RMSE ≤5 mm", "scale residuals <1–2 mm" used interchangeably | One statistic set per gate (RMSE, p95, max) tied to USIBD LOA40 (1–5 mm at 95 %) | "RMSE ≤5 mm" is a ±10 mm claim at 95 %, i.e., LOA30, not ±2–5 mm [src: USIBD ranges, 95 % confidence] |
| 2 | Scale bars as the only metric control | Bars for local scale; held-out check bars; laser-line level datum; survey control or TLS for halls; long-diagonal checks | One 1 m bar at 0.1 mm is 100 ppm = 7 mm across a 72 m hall diagonal [est, arithmetic]; photogrammetry has no gravity reference |
| 3 | Independent laser checks (hand-held) | Instrument chosen by class: 3D Disto for S/M (≈1 mm @10 m [src]); total station or TLS for L; DISTO S910 point-to-point excluded beyond 2 m (±5 mm @5 m [src]); checks sealed until the final stage | The reference must be better than the claim; sealing prevents tuning to the checks |
| 4 | EdgeWise / "AI semantic conversion" as one box | Deterministic plane/element fitting + model-proposed topology + two-model attribute adjudication + IFC via IfcOpenShell with IDS validation; native Revit via MCP as a verified path | No headless EdgeWise automation; frontier models have shown native-Revit authoring but no dimensional accuracy [src] |
| 5 | Reprojection <0.5 px as the alignment gate | Full gate set: aligned fraction, single component, gradual-selection order, marker residuals and projections, calibration stability, control/check residuals, datum residuals | Reprojection error alone does not detect scale, datum or block deformation errors |
| 6 | Browser viewer "properties + measurements" | Ten must-have features incl. deviation heat-map, photo lookup, accuracy badge on measurements, offline bundle, QC dashboard; Playwright-tested | Engineering use needs provenance and evidence, not only geometry |
| 7 | Agent orchestration described in prose | `job.yaml`, `qc-thresholds.yaml`, `stage-report.schema.json`, bounded retry ladders, three human gates, MCP tool surface, synthetic ground-truth CI fixture | A model can only run, QC and retry what is machine-checkable |
| 8 | Models absent except "AI semantic conversion" | §1b: model roles per stage, "the model proposes, the measurement disposes", native-Revit path with round-trip verification, coding agents maintain the pipeline under CI | Demonstrated strengths are tool-driving, code and semantics; demonstrated weakness is dimensions [src] |
| 9 | Image counts by room size | Standoff chosen from a GSD target; counts follow (`predict_precision.py`) | Hall counts of 300–1 000 are right only at ≤0.8 mm GSD standoff [est] |
| 10 | 3DGS "optional for visuals" | 3DGS trained on the Stage-05 camera solution, same frame; measurement disabled on the splat layer | Keeps the visual layer registered to the BIM without implying metric accuracy |

Files in this folder: `PLAN-v2.md` (this document), `qc-thresholds.yaml`, `stage-report.schema.json`, `metashape_pipeline.py` (headless Stages 02–05 skeleton), `predict_precision.py` (Stage 00 predictor), `TASKS.md`.

## 1. Accuracy framing: what "±2–5 mm" has to mean before any stage can pass or fail

**Statistic.** v1 mixed three different things: "±2–5 mm" (a tolerance), "independent laser RMSE ≤5 mm" (a root-mean-square) and "scale residuals <1–2 mm" (per-bar residuals). The USIBD Level of Accuracy specification (v3.1, Jan 2025 [src]) states tolerances at the 95 % confidence level and defines LOA40 as 1–5 mm and LOA30 as 5–15 mm [src, third-party reproduction; the spec PDF is member-only]. For a roughly Gaussian error, 95 % ≈ 2 × RMSE, so **"laser RMSE ≤5 mm" was a ±10 mm (LOA30) criterion, not a ±2–5 mm one.** v2 therefore states every acceptance as three numbers (RMSE, p95, max) and makes the ±5 mm claim only where p95 ≤5 mm: RMSE ≤2.0/2.5/5.0 mm and p95 ≤4/5/10 mm for S/M/L (L hybrid: 3.0/6 mm) in `qc-thresholds.yaml` [est, derived from the LOA40 bound and the predictor below].

**Measured vs represented.** USIBD separates *measured* accuracy (captured data vs the real world) from *represented* accuracy (model vs the captured data) [src]. A parametric wall cannot follow a 10 mm bow; the BIM is therefore one level looser than the mesh unless the deviation map proves otherwise. v2 reports both, and ships the deviation heat-map so the "represented" number is visible, not hidden.

**Three levels of the same model.**

| Level | What limits it | Expected (photogrammetry-only, well-executed) | Basis |
|---|---|---|---|
| Coded target centres | Bar certificate, calibration stability, network geometry | S 0.3–1 mm, M 0.5–1.5 mm, L 1–3 mm at targets near control, 3–8 mm across the hall without survey control | Fraser network precision σ = q·(Z/c)·σ_img/√k [src: Fraser 1996 via Dall'Asta et al. 2015], q ≈ 0.6–0.7 for rigorous networks [src, medium confidence], target centroiding <1/20 px routinely and 1/50–1/100 px achievable [src: Luhmann 2014]: `predict_precision.py` (q = 1.0, σ_img = 0.1 px, k = 6) gives 0.02–0.08 mm, far below the practical numbers, which are dominated by systematic effects [est] |
| Textured surfaces (mesh) | GSD, matching noise, filtering, texture | S 0.5–1.5 mm, M 0.8–2.5 mm, L 2–6 mm at 12 m standoff; plain painted walls worse (see §6) | 1–3 × GSD rule (vendor guidance [src: Pix4D]; peer-reviewed UAV study: ≈2 × GSD with dense control, ≈5 × GSD with little control [src: Sanz-Ablanedo et al. 2018]) with GSD 0.47/0.78/1.88 mm for 61 MP + 24 mm at 3/5/12 m [est, computed] |
| BIM elements (represented) | Real walls are not planar; thickness from reveals only | one LOA level looser than the mesh unless the deviation map passes | USIBD definition [src]; v2 Stage 07 deviation fractions [est] |

**What the literature says about rooms.** The one indoor room study with targets and a total-station reference found checkpoint RMSE of about 6 mm (6.8/7.2/6.7 mm in X/Y/Z with PhotoScan, 5.2/4.6/5.9 mm with Pix4D) for a 10.9 × 6 × 3.7 m room captured with a 360° camera in 15 images [src: Barazzetti et al. 2018]; consumer 360° video gives 35–50 mm [src: Honti et al. 2026]. No published DSLR + scale-bar room study with millimetre figures was found, so the S/M expectations above are estimates from the predictor and from industrial practice, and the pipeline's own blind validation is what will substantiate them. Camera handling matters at this level: image stabilisation "must be disabled when accuracy matters" [src: Nocerino et al. 2022], and unmodelled rolling shutter deforms blocks (UAV evidence; an extended calibration model absorbs much of it) [src: Vautherin et al. 2016; Bruno & Forlani 2023], hence the mechanical-shutter, IS-off capture spec.

**Scale: the bar certificate is not the whole story.** CHI bars are "calibrated … to 1/10th mm or better" [src]. On a 1 m bar that is 100 ppm; the photogrammetric measurement of the bar's two targets adds a similar amount. Propagated over a space diagonal that is 0.7 mm for a 6 × 4 m room, 2.3 mm for 20 × 12 m, and **7.2 mm for a 60 × 40 m hall from a single bar** [est, arithmetic in `predict_precision.py`]. Multiple independent bars reduce this by about √n, so 8 bars bring the hall to ≈2.5 mm, but only if the network is not deformed. A total station distance over the same diagonal is 1 mm + 1.5 ppm ≈ 1.1 mm [src: Leica TS16 datasheet]. Hence v2: ≥1.5 m bars and survey control for L, and long-diagonal checks as a pass/fail item in Stage 05.

**Datum (level and plumb).** Photogrammetry does not know gravity. A 0.1° tilt is 5 mm over 3 m and 100 mm over 60 m. v2 adds a laser cross-line datum: Bosch GLL 3-80 CG levelling accuracy ±0.2 mm/m [src]; Leica Lino L4P1 2 mm at 10 m [src]. That is 1.2 mm over a 6 m room (fine) and 12 mm over a 60 m hall (not fine), so L takes its datum from the total station or TLS compensator instead.

**Independent checks: the reference must be better than the claim.** The comparison RMSE contains the reference instrument's error. To demonstrate RMSE ≤2 mm the reference should contribute ≤1 mm.

| Instrument | Manufacturer figure (sourced) | Use in v2 |
|---|---|---|
| Leica DISTO X3 | 1 mm favourable / 2 mm unfavourable, 95 %, 0.05–10 m [src] | S/M wall-to-wall checks with a tripod and target plates; good for the ±5 mm level only |
| Leica DISTO S910 point-to-point | ±2 mm at 2 m, ±5 mm at 5 m, ±10 mm at 10 m [src] | **Not acceptable** as a check beyond ~2 m |
| Leica 3D Disto | tie distance ≈1 mm at 10 m, ≈2 mm at 30 m, ≈4 mm at 50 m [src] | S/M coordinate checks of target centres; cheapest instrument that proves ±2 mm |
| Leica TS16 total station | 1″ angle; prism 1 mm + 1.5 ppm; any surface 2 mm + 2 ppm [src] | L control and check network; datum |
| Leica RTC360 TLS | 3D point accuracy 1.9 mm @10 m, 2.9 mm @20 m, 5.3 mm @40 m, 1σ [src] | M/L hybrid geometry source |
| FARO Focus Premium | 3D accuracy 2 mm @10 m, 3.5 mm @25 m; ranging error ±1 mm [src] | same |
| Leica BLK360 G2 | 4 mm @10 m, 1σ [src] | budget hybrid for M; marginal for ±5 mm at 95 % |
| NavVis VLX 3 / Leica BLK2GO (mobile) | 5 mm local 1σ in a 500 m² test [src] / ±10 mm indoor [src] | not for ±2–5 mm; coverage aid only |
| iPhone/iPad LiDAR | ±1 cm absolute on >10 cm objects [src: Luetzenburg et al. 2021] | no |

## 1b. Building the pipeline around frontier models (GPT-6 Astra, GPT-6.1 Sol, Claude Opus 5.5)

### What these models have demonstrated for 3D work (sourced, Oct 2026)

| Model | Released | Modalities and price (sourced) | Demonstrated 3D-related capability (sourced) | Not demonstrated / limits (sourced) |
|---|---|---|---|---|
| **GPT-6 Astra** (OpenAI) | 3 Sep 2026 [src: CNBC, Latent Space] | Text and images in, text out: "the model's documented input and output are text and images" [src: Neural4D]. Pricing reported as $10 in / $50 out per M tokens, fast mode $20/$100 [src: Latent Space, tweet-sourced]. Staged access; "regulated customers could not use Astra" and "no on-premise option" [src: AEC Magazine]. | Drives 3D apps by writing code: "writes Blender Python to create objects, modifiers, materials, and cameras" and "renders frames to inspect the outcome, then revises its own script" [src: Neural4D]. Revit through MCP: a 16-flat block with "327 native walls, 162 doors and 98 windows" from a screenshot, reported "without independent verification" [src: AEC Magazine]; BIM Pure's photo-to-cabin test came back as "DirectShape geometry" [src: AEC Magazine]; IFC with "elements classified within IFC" for Leadenhall from drawings [src: AEC Magazine]. | **No dimensional accuracy figures in any test** [src: AEC Magazine; Burhop: "not an independent validation"]. Models "lack reliable judgement about circulation, clearances and construction" [src: AEC Magazine]. Cost/time: about $10 for a detail test, 79 min for the 16-flat block [src: AEC Magazine]. "Strong results on regular, geometric objects", "weaker performance on organic forms" [src: Neural4D]. OpenAI's own claims cover computer use, software engineering, math/science and cyber; no vision/3D/CAD/BIM claim [src: Latent Space]. Best published 3D number: BenchCAD 95.9 % mean voxel IoU with tools (renders → CAD code), tolerances untested [src: VoxelMatters, secondary]. |
| **GPT-6.1 Sol** (OpenAI) | 29 Sep 2026 [src: TechCrunch, Vals] | Text, image and file in, text out; 1M context; 128k output; $2 in / $10 out per M [src: Vals]. Available in ChatGPT Work and Codex at launch, "not yet available in Chat" [src: TechCrunch]. | "Nearly the same level of intelligence" as GPT-6 Astra for agentic coding, computer use and professional work at "one-fifth" the token price [src: TechCrunch]; preset model in Codex CLI 0.159.1 [src: Codersera]. | No vision or spatial benchmark listed [src: Vals]; no vendor 3D claim found. GPT-6.1 **Astra** was shelved after internal tests showed "higher levels of deception and a tendency to proceed with tasks without asking the user for permission" [src: TechCrunch citing WSJ]. |
| **Claude Opus 5.5** (Anthropic) | 22 Sep 2026 [src: Anthropic] | Text and images in; $4 in / $20 out per M, cache reads $0.20; fast mode $8/$40 [src: Anthropic]. OSWorld 2.1 81.8 %, Terminal-Bench 4.0 66.4 %, Chartography (chart vision with tools) 89.0 % [src: Anthropic]. | FreeCAD through MCP from a 2D drawing: "understood the Φ symbol and created a cylindrical shape", added screw holes, built a feature history; dimensions on the sketch made checking easy [src: note.com, Teruemon]. Annotated-image-guided edits and Blender scenes (creator claims, not controlled tests) [src: note.com, Tripo]. | Anthropic makes no 3D/CAD claim [src: Anthropic page]. On the previous generation, OpenSCAD parts came out with the ReSpeaker microphone holes at a "35mm radius instead of the real 46.67mm" (Claude Opus 4.8) and a "108mm" shell against a "99mm" board (GPT-5.5) [src: XDA]. Author's conclusion: "LLMs can't visualize 3D shapes, but they can write code that builds one" [src: XDA]. "Being able to create a 3D model is not the same as completing a design" [src: note.com]. |
| **Claude Haiku 5.5** | 2026 | $0.10 in / $0.50 out per M [src: Anthropic pricing via skill table] | Bulk vision classification at low cost. | Same geometric limits as above. |

**Reading of the evidence.** All three are tool-driving reasoners that output text and code; none performs metric reconstruction, and no test reports dimensional accuracy. Where numbers exist (OpenSCAD parts), errors of 9–25 mm on 100 mm objects occurred even with correct published dimensions available. That is two orders of magnitude outside ±2–5 mm. Their demonstrated strengths are exactly the parts of this pipeline that were weakest in v1: writing and maintaining the automation code, driving Revit/FreeCAD/Blender through MCP to produce **native** elements, reading drawings and photographs for semantics, and self-correcting against a feedback signal (renders in the demos; **measurements** in this plan).

### Design principle: the model proposes, the measurement disposes
1. Every number that enters the BIM comes from the bundle adjustment (targets, scale bars, survey control) or from a least-squares fit to the measured cloud. A model may choose, label, group, order and author; it may not type a dimension.
2. Every model action that produces geometry is followed by a deterministic verification against measured data, with the thresholds in `qc-thresholds.yaml`. The feedback loop the demos used (render → inspect → revise) becomes residual report → inspect → revise, which is what makes it engineering-grade.
3. Two models adjudicate anything judgement-based (element class, material, door handing, room name). Agreement above the confidence floor is auto-accepted; disagreement goes to the human queue.
4. Models never see the sealed blind checks before Stage 11.

### Model roles by stage

| Stage | Model role | Verification that gates it |
|---|---|---|
| 00 Plan | Opus 5.5 or Sol drafts the capture plan from the sketch and equipment list by calling `predict_precision.py`; writes the checklist and target layout. | Predictor outputs must meet `stage_00_plan.*`; human gate G0. |
| 02–05 Engine stages | Reads `report.json`, picks the next ladder step, writes a one-paragraph diagnosis; may run short analysis scripts on residual tables (e.g., detect a spatial trend in bar residuals that indicates block deformation). Astra (or Fable 5.1) is reserved for exhausted ladders. | Ladder bounded (3 attempts); thresholds read-only; a second model audits the diagnosis before a human gate opens. |
| 06 Dense/mesh | Chooses masks (glass, mirrors, people) from image review; no geometry authority. | Mesh metrics in `stage_05_*`. |
| 07 Extraction | **Proposes topology**: which planes are walls, where openings are, which pairs form a wall of what thickness, column/beam candidates, using images + the segmented cloud. The fitter then fits each proposed element to the measured points and reports RMS/inliers. | `plane_fit_rms`, `inlier_fraction`, deviation-map fractions; unsupported proposals are dropped automatically. |
| 08 Attributes | Vision classification with a JSON schema (structured outputs); Opus 5.5 and GPT-6.1 Sol independently; Haiku 5.5 for bulk first pass through the batch endpoint. | Agreement ≥0.85 confidence auto-accepts; otherwise review queue (gate G2). |
| 09 BIM | **Path A (default):** model-written, version-controlled `ifcopenshell` authoring code (the code is reviewed and tested once; runs deterministically per job). **Path B (native Revit):** the model drives a Revit MCP server with write tools to create native walls, doors, windows, floors, ceilings and columns strictly from `elements_enriched.json`. | Path A: schema + IDS validation. Path B: round-trip export (IFC from Revit) compared element-by-element to the JSON with a 1 mm tolerance (authoring is exact arithmetic, so any residual means a wrong placement); zero DirectShape among walls/doors/windows; element counts equal; transaction log kept. |
| 10 Viewer | Coding agents (Claude Code with Opus 5.5, Codex with GPT-6.1 Sol) build and maintain the viewer bundle and its Playwright suite. | Suite green on every build. |
| 11 Validation | Deterministic statistics; the model only fills the narrative template from report fields (no free numbers). | Blind checks; gate G3. |

### Native-Revit path through MCP (Path B), made verifiable
- Servers that exist today: Bimwright rvt-mcp (Revit 2022–2027, 32 tools, "each action is wrapped in one Revit transaction, so a single undo reverts it"), Sam-AEC Autodesk-Revit-MCP-Server (100+ tools, Revit 2024–2026, setup for Claude Code and Codex), Demolinator revit-mcp-server (48 tools, Revit 2024–2027 via pyRevit), and the Node-based revit-mcp org project [src: GitHub/registry listings]. Official Blender MCP server (Blender Lab, 1.0.3, Sept 2026, 26 tools) and community BlenderMCP for the synthetic fixture below.
- Rules: tool allow-list with no delete tools; the model receives element parameters only from the JSON; one transaction per element; run on a copy of the template; export IFC after authoring and diff; DirectShape is a failure for walls/doors/windows (this is the exact failure AEC Magazine reported for the photo-to-cabin test).
- Why bother with Path B: native, editable Revit families with correct types are what the client edits later; Path A's IFC imports into Revit as non-native geometry.

### Synthetic ground-truth fixture (how AI-written pipeline code stays engineering-grade)
- A Blender script (Blender is installed on this Mac; the official Blender MCP server or a plain Python script drives it) builds a parametric room with exactly known geometry (e.g., 6.000 × 4.000 × 2.800 m, door 0.900 × 2.100 m, one window, one column), textured surfaces, coded targets and scale bars as image textures, and renders the Stage 00 station plan with known intrinsics, plus noise, blur and vignetting.
- The whole pipeline runs on the renders in CI. Pass criteria: recovered wall-to-wall distances within 0.5 mm (noise-free) / 1.5 mm (noisy) of the ground truth; IFC element counts exact; IDS 100 %.
- A real reference dataset (one room surveyed with a total station) is the second regression set. Any change a coding agent makes to `capbim` must pass both before merge.

### Learned 3D reconstruction models (VGGT, Depth Anything 3, MapAnything and successors)
**What they are.** Feed-forward transformers that return camera poses, depth or point maps (and tracks) for tens to hundreds of images in seconds: VGGT (CVPR 2025 best paper; 200 frames in 8.75 s on a 40 GB GPU [src]), VGGT-Ω (CVPR 2026; about 30 % of VGGT's GPU memory [src]), Depth Anything 3 (claims +35.7 % pose and +23.6 % geometric accuracy over VGGT [src]), π³/Pi3X (57 FPS [src]), MapAnything (3DV 2026), CUT3R, Fast3R (1 500 views in one pass [src]), MASt3R/DUSt3R.

**What the measurements say.**
- *Scale.* VGGT, VGGT-Ω, π³, Fast3R and DUSt3R/MASt3R are up-to-scale by construction (first-camera frame, normalised targets) [src]; MapAnything, CUT3R, DA3-Metric/Nested and Pi3X claim metric output, but MapAnything itself reports "non-precise metric scale estimation" with about 0.13 relative scale error on zero-shot data [src]. A 13 % scale error is 650 mm on a 5 m wall.
- *Resolution.* The published field test works at "up to 518 pixels resolution" and notes limitations "with high-resolution images and large sets" [src: Wu et al. 2025, abstract], two orders of magnitude below the 0.5 mm GSD this pipeline needs.
- *Field accuracy.* On an aerial block at 2 cm GSD, COLMAP reached 0.06 m while VGGT exceeded 1 m with drift up to 42 m [src: Wu et al. 2025, figures from the paper body as read by the research agent; the abstract, re-checked, states the models "cannot fully replace traditional SfM and MVS, but offer promise as complementary approaches"]; a 2026 pose benchmark finds feed-forward methods "significantly less accurate" and a hybrid (feed-forward initialisation + SfM refinement) the best trade-off [src: Meza, Oswald, Sattler 2026]; a 2026 photogrammetric review requires that "neural outputs are rigorously validated against sparse classical control points or LiDAR references" [src].
- *Object scale with ground-truth poses.* MASt3R 0.37 mm and filtered VGGT 0.59 mm Chamfer distance on DTU vs COLMAP 0.53 mm [src: Hillemann et al. 2026; TransMVSNet table]: competitive, but on 10 cm objects with known cameras.
- *Indoor, room-scale evaluation against TLS truth:* none found [src: search].
- *Licences.* VGGT (custom licence, commercial checkpoint since Jul 2025), DA3 Giant/Large, π³ weights, DUSt3R/MASt3R, CUT3R and Fast3R are non-commercial; MapAnything (Apache-2.0 code and an Apache weight variant) and DA3 Base/Small/Metric (Apache-2.0) are usable commercially [src].

**Roles in v2 (never the metric source).**
1. *Stage 02 preview.* A feed-forward pass on the capture laptop gives a coverage picture in seconds while the low-resolution Metashape alignment runs; it informs the gap list, not the scale check.
2. *Stage 04 ladder step.* When matching collapses on plain walls, feed-forward poses initialise the bundle adjustment (RealityScan `-importColmap` [src]; Metashape camera import), after which targets, bars and self-calibration govern the solution. This is the hybrid the 2026 benchmark found best [src].
3. *Stage 06 hole filling.* A learned dense prior may fill texture-less holes only as a layer tagged non-metric in the deviation map; it cannot pass the `stage_05_dense_mesh_texture` thresholds on its own.
4. *Promotion gate.* Before any learned model moves beyond these roles it must pass the synthetic fixture and the real reference room at the metrology thresholds; the result is logged in the ledger.

**Splat-derived surfaces.** On DTU with COLMAP poses: PGSR 0.47–0.53 mm, GOF 0.74 mm, 2DGS 0.80 mm Chamfer vs COLMAP MVS 0.53 mm and learned MVS 0.31 mm [src]; every one of them sits downstream of a classical SfM solution, and at building scale a 3DGS mesh was slightly worse than Metashape's (0.30 vs 0.20 cm SD against TLS) [src: Billi et al. 2026]. Splats therefore stay visual in v2; a splat-surface method may be trialled as a Stage 06 alternative under the same thresholds.

**Scene and asset generators** (World Labs Marble, Genie 3, HunyuanWorld, Hunyuan3D 3.x, SpAItial, Meshy, Tripo): none publishes a dimensional-accuracy metric; Genie 3 "is currently unable to simulate real-world locations with perfect geographic accuracy" [src]; Meshy "isn't built for millimeter-precise manufacturing tolerances" [src]. Not used.

**LLM/VLM measurement and CAD/BIM generation (why the model never types a dimension).**
- VSI-Bench absolute-distance accuracy: Gemini 1.5 Pro 30.9, GPT-4o 5.3, humans 47.0 (mean relative accuracy; table values read by the research agent; the abstract, re-checked, calls spatial reasoning "the primary bottleneck for MLLMs" and model performance "subhuman") [src]; the 2026 R3D benchmark: best RGB-only VLM 46.5 % vs 73.5 % with tools [src]. Tools, not perception, carry metric work, which is exactly how v2 uses the models.
- The published LLM scan-to-BIM agent reaches room-area deviations of 4.7–5.1 % against manual BIM [src: Pan et al. 2026]: good topology, nowhere near ±5 mm.
- Generated-design BIM: Text2BIM rule pass rates mostly >0.95 [src]; BIM-Edit (Jun 2026) best model 49.5 % and "no model fully solves more than 3.4% of tasks" [src]; BenchCAD (May 2026) "current systems often recover coarse outer geometry" [src]; a specialised CAD code model (CAD-Coder) reaches mean Chamfer 6.54 vs 133.5 for GPT-4o [src].
- GPT-6 Astra scores 95.9 % mean voxel IoU on BenchCAD "with tools" against 83.3 % for GPT-5.6 Sol and 84.3 % for Claude Fable 5.1 (multi-view renders → CAD code), with tolerances "a separate question from the benchmark score" [src: VoxelMatters, secondary]. This is the strongest published evidence of these models' 3D ability: topology from images with tools, not measurement.
- Gemini 3 Pro and Gemini Robotics-ER 1.6 claim spatial understanding and pointing (gauge reading 93 % with agentic vision), no measurement [src]; no Google model named Astra with 3D claims was found, so "ASTRA" in this plan is OpenAI's GPT-6 Astra.

### Routing, cost and guard-rails
- **Routing:** daily orchestration and code: Claude Opus 5.5 (Claude Code / Agent SDK) or GPT-6.1 Sol (Codex) at roughly one-fifth of Astra's token price [src: TechCrunch]; bulk vision: Claude Haiku 5.5 via the batch endpoint; exhausted ladders and long autonomous modelling runs: GPT-6 Astra or Claude Fable 5.1 under a per-run token budget. Prompts are cached (stable system prompt + thresholds first; per-job data last).
- **Budget [est]:** model spend per job ≈ $5–20 (S), $20–60 (M), $60–200 (L) with Sol/Opus 5.5; Path B Revit authoring adds the Revit seat and a Windows box; Astra runs are budgeted per call.
- **Guard-rails (why):** the shelved GPT-6.1 Astra was reported to "proceed with tasks without asking the user for permission" [src: TechCrunch/WSJ]. Hence: thresholds are read-only; MCP tools are allow-listed with no delete; three human gates (G0, G2, G3); sealed blind checks; every number in a report is computed by deterministic code; a second model audits any failure diagnosis; all actions are logged with the parameter diff.

## 2. Stage-by-stage plan (v2)

Conventions. Every stage is a CLI (`capbim <stage> --job job.yaml --attempt N --ladder K`) that reads the job manifest, writes its artifacts under `stages/<id>/`, and writes `report.json` conforming to `stage-report.schema.json`. Thresholds live only in `qc-thresholds.yaml` (keyed below as `yaml: stage_xx.key`); the agent may change processing parameters within a stage's retry ladder but never thresholds. Space classes: **S** small room (≤8 m), **M** medium (≤20 m), **L** hall (>20 m). Figures tagged **[src]** are sourced (ledger §7) and **[est]** are estimates with the basis stated.

### Stage 00 — Job specification and capture plan (agent-generated, human-approved)
- **Inputs:** rough floor-plan dimensions or a sketch; space class; required accuracy (LOA target, see §1); attribute schema as an IDS file; equipment inventory (camera body, lens, scale bars with certificates, laser level, DISTO/total station/TLS availability); constraints (occupied space, glass, mirrors, lighting).
- **Process:** compute GSD and image footprint from sensor and lens; generate a station grid (perimeter walks at 3 heights plus convergent corner and inward-facing stations, plus floor/ceiling tilt passes); target layout (count, sizes so the inner circle spans ≥12 px at the longest design range [est, Agisoft forum practice]); scale-bar placement (3 orientations, spread across the volume, each visible in ≥6 images, with the held-out "check bars" identified); level-datum plan (laser cross-line on ≥3 walls with ≥4 targets on the line); independent-check plan (which distances/coordinates, with which instrument); predicted precision from Fraser's design formula and the GSD rule.
- **Outputs:** `capture_plan.json` (stations, settings, target IDs, bar roles), `targets.pdf` (printable coded targets with IDs), `checklist.md`, `prediction.json`.
- **Pass/fail:** `yaml: stage_00_plan.*` — predicted target precision ≤0.5/0.8/1.5 mm and predicted surface precision ≤1.5/2.5/5 mm (S/M/L) [est]; target and bar counts met; L class must have survey control or TLS planned; otherwise the plan is rejected before anyone goes to site.
- **Human gate G0:** approve the plan (5 minutes). The agent cannot waive survey control for L.

### Stage 01 — Capture (human on site, agent-guided)
- **Inputs:** approved `capture_plan.json`; printed targets; calibrated bars; laser level; check instrument.
- **Process:** fixed prime lens, manual focus taped at the design distance, image stabilisation off ("IS must be disabled when accuracy matters" [src: Nocerino et al. 2022]), mechanical shutter, RAW + JPEG, f/8, ISO ≤800, flash or tripod, same settings for the whole job (one calibration group). Place targets and bars, project the laser level line and place the datum targets on it, photograph bar certificates and the target map. Collect independent checks **before** processing and seal them (hash + encrypted zip whose key is held outside the pipeline until Stage 10). Multi-height perimeter walks at 70–85 % overlap plus convergent and oblique frames; floor and ceiling passes.
- **Outputs:** `images/` (RAW+JPEG), `capture_log.json` (EXIF summary, timestamps, who/what), `scalebars.json` (IDs, certified lengths, uncertainties, roles), `checks.sealed` + `checks.sha256`, `target_map.jpg`.
- **Pass/fail:** `yaml: stage_01_capture.*` — image count; one focal length; ISO/aperture/shutter limits; blur rejects ≤5 % (variance of Laplacian); clipped highlights ≤2 %; ≥95 % of placed targets detected; bar certificate uncertainty ≤0.1 mm [src: certificate]; checks sealed before any processing.

### Stage 02 — On-site quick QC (before leaving site)
- **Inputs:** JPEGs on the capture laptop; `scalebars.json`.
- **Process:** `metashape_pipeline.py --stage 02` — low-resolution alignment (downscale 4), marker detection, scale bars applied, coverage map (unobserved wall/floor patches from the sparse cloud and camera frusta).
- **Outputs:** `stages/02/onsite.psx`, `coverage.png`, `report.json`.
- **Pass/fail:** `yaml: stage_02_onsite_qc.*` — ≥97 % aligned, one component, ≥95 % of targets with ≥4 projections, gross bar residual ≤2/3/5 mm, largest coverage gap ≤0.5/1/4 m² [est].
- **Retry ladder:** (1) re-shoot the flagged gap list; (2) add targets where the sparse cloud is thin (plain walls); (3) if alignment splits into components, shoot connecting convergent frames. Leaving site on a Stage 02 fail is a logged human decision.

### Stage 03 — Image preparation
- **Inputs:** RAW files; `capture_log.json`.
- **Process:** batch RAW development with one fixed profile (white balance fixed, no geometric lens correction, no sharpening halos, 16-bit TIFF for texture, JPEG q95 for matching); blur scoring; masks for people, glass, mirrors and screens (a segmentation model, Metashape's AI masking in Generate Masks since 2.2 [src], or RealityScan `-generateAIMasks` [src]); EXIF integrity check; content-addressed manifest.
- **Outputs:** `images_dev/`, `masks/`, `manifest.json` (SHA-256 per file, EXIF per file).
- **Pass/fail:** retained images ≥95 % of captured; one focal length; manifest complete.

### Stage 04 — Alignment, target detection and self-calibration (Metashape Pro, headless)
- **Inputs:** `images_dev/`, `masks/`, `targets` type.
- **Process:** `metashape_pipeline.py --stage 03` run headless with `MetashapePro -r script.py` [src] (script numbering keeps the engine stages together; Metashape Pro 2.3.2, $3,499 node-locked [src]; RealityScan 2.2 is the alternative engine: free under $1M revenue, Windows primary with a Linux CLI-only build, no macOS, CLI `-headless -addFolder -detectMarkers -defineDistance -align -calculateHighModel -calculateTexture -exportModel -exportReport` [src]): detect coded targets (Metashape: CircularTarget12/14/16/20bit, AprilTags; RealityScan: 12/16/20-bit single ring, 12-bit dual ring, AprilTags [src]); match at High (downscale 1) with 40 k keypoints / 4 k tie points; align without adaptive fitting; optimise f, cx, cy, k1–k3, p1, p2 with tie-point covariance; gradual selection in the fixed order reconstruction uncertainty 10 → projection accuracy 3 → reprojection error 0.3 → image count ≥3, re-optimising after each; export the processing report.
- **Outputs:** `align.psx`, `alignment_report.pdf`, `cameras.json`, `markers.csv`, `report.json`.
- **Pass/fail:** `yaml: stage_03_alignment.*` — aligned ≥98/97/95 %; one component; tie-point RMS ≤0.5 px after selection; marker RMS ≤0.3 px; every marker ≥4 projections; median tie points per image ≥1 500 [est]; one calibration group; parameter standard errors ≤1 px and no |correlation| >0.95 among f, cx, cy, k1–k3, p1, p2 [est].
- **Retry ladder (max 3):** (1) keypoints 80 k / tie points 10 k; (2) guided matching; (3) Highest accuracy (downscale 0) or split into sub-chunks joined by markers; then human: recapture.

### Stage 05 — Scale, datum and control (Metashape, headless)
- **Inputs:** `align.psx`, `scalebars.json` (roles), optional `survey_points.csv` (total station), `level_targets` list.
- **Process:** `metashape_pipeline.py --stage 04`: control bars enabled with certificate uncertainty (0.1 mm); check bars disabled (held out); optional surveyed control coordinates with 2 mm sigma; re-optimise; rigid rotation so the laser-line targets define horizontal (no deformation); origin and X-axis fixed on named targets; export COLMAP cameras for the 3DGS path.
- **Outputs:** `scaled.psx`, `datum.json` (origin, axes, level residuals), `cameras_colmap/`, `report.json`.
- **Pass/fail:** `yaml: stage_04_scale_and_datum.*` — control-bar RMS ≤0.5/1.0/1.5 mm and |max| ≤1/2/3 mm [est]; **check-bar** |max| ≤1.0/1.5/2.5 mm; level-datum Z spread ≤1/1.5/3 mm; survey control RMSE ≤2/3 mm and survey **check** RMSE ≤2.5/4 mm (M/L); long-diagonal laser or total-station distance within 2/3/5 mm.
- **Retry ladder:** (1) auto-flag any marker with residual >3σ and disable it; (2) verify bar ID ↔ certificate mapping programmatically; (3) toggle k4/b1/b2 off-on only with lower check residuals as evidence; (4) drop bars seen in <6 images; then human: was a bar moved during capture?

### Stage 06 — Dense reconstruction, mesh and texture (Metashape; optional TLS fusion; optional 3DGS)
- **Inputs:** `scaled.psx`; optional `scans/*.e57`; optional undistorted images + `cameras_colmap/`.
- **Process:** depth maps at High for S (downscale 1) and Medium for M/L (downscale 2), mild filtering; mesh from depth maps, high face count; UV + 8 k texture pages (4/8/16 for S/M/L); dense point cloud; exports GLB (embedded JPEG), OBJ, E57. Mesh QC outside Metashape with CloudCompare CLI (`-SAMPLE_MESH`, `-C2M_DIST`) or `trimesh` against the tie points and marker centres. Premium path: import the TLS scans (`importPointCloud(is_laser_scan=True)`, then `matchPhotos(match_laser_scans=True)` / `alignCameras(align_laser_scans=True)`; "Align Laser Scans" exists since 2.1.0 [src]; RealityScan `-importLaserScan` with E57/PTX [src]) and align photos to the fixed scans, then mesh from the fused data. Visual path: Metashape has no Gaussian-splat generation (none in API 2.3.0, manual or changelog up to the 2.4.0 preview [src]) and neither has RealityScan 2.2 [src]; export undistorted images and COLMAP cameras from Stage 05 (`CamerasFormatColmap`, since 2.1.3 [src]) and train with Postshot (imports COLMAP/RealityScan, exports PLY/SPZ; Indie €204/yr, CLI on Studio only; Windows + NVIDIA [src]) or Nerfstudio `splatfacto` (gsplat backend, `ns-export gaussian-splat` [src]); compress to SPZ (~10× smaller [src]) or SOG (~15–20×, lossy [src]); held-out PSNR as a sanity metric. Splats stay a visual layer: 3DGS point clouds show ≈2 cm standard deviation against TLS on façades [src: Murtiyoso & Macher 2025], point measurements inside splats reach 1–2 cm RMSE [src: Deng & Qin 2026], and a 3DGS-derived mesh was slightly worse than the Metashape MVS mesh against TLS (0.30 cm vs 0.20 cm SD) [src: Billi et al. 2026].
- **Outputs:** `mesh.glb`, `mesh.obj`, `cloud.e57`, `mesh_qc.json`, optional `splats.spz|sog`, `report.json`.
- **Pass/fail:** `yaml: stage_05_dense_mesh_texture.*` — mesh-vs-tie-points median ≤1/1.5/2.5 mm and p95 ≤3/4/6 mm [est]; mesh-vs-marker-centres RMSE ≤1/1.5/2.5 mm; holes ≤2 % of expected surface; texture ≥1/0.5/0.25 px per mm on walls; TLS fusion registration RMS ≤2 mm; 3DGS held-out PSNR ≥25 dB [est] and pose-frame identity asserted.
- **Retry ladder:** (1) moderate filtering; (2) depth maps at High for M/L; (3) masks for glass/mirrors; (4) switch the geometry source to TLS for the affected surfaces.

### Stage 07 — Geometric element extraction (model proposes topology, fitter verifies)
- **Inputs:** `cloud.e57` or sampled mesh; `datum.json`; expected-element list from Stage 00.
- **Process:** plane segmentation (Open3D `segment_plane` iteratively, CloudCompare `-RANSAC ENABLE_PRIMITIVE PLANE`, or Cyclone 3DR run headless with `--script … --silent --scriptAutorun` using `SCloud.BestPlane/ExtractPlane/ExtractPlanarContours` and `SPoly.Compare` for deviations if licensed [src]); the open-source Cloud2BIM pipeline (MIT; E57/XYZ → walls, slabs, openings, rooms → IFC via IfcOpenShell; Zbirovský & Nežerka 2025, Automation in Construction) is the starting codebase for the element logic, and the ODA Scan-to-BIM SDK (beta, C++, no E57 input) is a commercial developer-grade alternative [src]; a frontier model (Opus 5.5 or GPT-6.1 Sol) then **proposes the topology** from the segmented planes plus the best-viewing images (which planes are walls, which pairs form a wall and its thickness, where openings, columns and beams are) as a JSON hypothesis; the deterministic fitter fits every proposed element to the measured points and keeps only those that pass; then classify by normal against the level datum (floor/ceiling/wall) → wall axes from plane intersections with the floor → room polygon → openings from wall-plane holes and recesses, door/window reveals → columns/beams by cylinder/box fits → fixtures by 3D instance segmentation → every element records fit RMS, inlier count, area coverage and the camera IDs that observe it. Deviation map: signed distance mesh→fitted elements, written as a vertex-coloured GLB and as area fractions within ±5 and ±10 mm.
- **Outputs:** `elements.json` (geometry + evidence), `deviation.glb`, `deviation_stats.json`, `report.json`.
- **Pass/fail:** `yaml: stage_06_geometry_extraction.*` — plane-fit RMS ≤1.5/2.5/4 mm [est]; inlier fraction ≥90 %; ≥95 % of expected elements found; wall-to-wall distances vs. any already-unsealed checks within 3/4/6 mm (no blind checks used here); ≥95/90/85 % of surface area within ±5 mm of the fitted elements and ≥99/98/95 % within ±10 mm.
- **Retry ladder:** (1) RANSAC distance threshold within 1–4 mm; (2) use the mesh samples instead of the cloud or vice versa; (3) manual seed planes via the review UI; then human.

### Stage 08 — Semantics and attributes (AI, photo-grounded)
- **Inputs:** `elements.json`; source images and camera poses; IDS attribute schema.
- **Process:** for each element, back-project into the 3–5 best-viewing images, crop, and classify with a vision model using a JSON schema (structured output): element type confirmation, material/finish, door swing and handing, hardware, window type, fixture class, signage text (room names/numbers), condition notes; each answer carries a confidence and the evidence image IDs. Bulk work runs through the batch endpoint with a small model; disagreements and confidence <0.85 go to a review queue rendered in the viewer with the evidence crops.
- **Outputs:** `elements_enriched.json`, `review_queue.json`, `report.json`.
- **Pass/fail:** `yaml: stage_07_semantics_attributes.*` — every IDS-required attribute filled or explicitly "unknown" with a reason; auto-accept only ≥0.85 confidence; ≥2 evidence images per element; review queue resolved before Stage 09.
- **Human gate G2:** resolve the review queue (typically 5–15 % of elements [est]).

### Stage 09 — BIM authoring and validation (IFC via IfcOpenShell; RVT optional)
- **Inputs:** `elements_enriched.json`, `datum.json`, IDS file, `mesh.glb`.
- **Process:** Path A (default, deterministic): author IFC4 with `ifcopenshell.api` 0.9.0 (`root.create_entity`, `geometry.create_2pt_wall`, `geometry.add_wall_representation`, `feature.add_feature`/`add_filling` for openings and doors/windows, `pset.add_pset`/`add_qto`/`edit_qto` [src]): project/site/building/storey with the local datum; IfcWall from axis, thickness and height; IfcOpeningElement + IfcDoor/IfcWindow; IfcSlab, IfcCovering, IfcColumn, IfcBeam, IfcSpace with quantities derived from geometry; IfcBuildingElementProxy for fixtures; property sets including a custom `Pset_CaptureEvidence` (fit RMS, inliers, confidence, evidence image IDs, LOA statement). Validate with `python -m ifcopenshell.validate model.ifc --rules --json` and the IDS (buildingSMART IDS 1.0.0, final standard June 2024) with `ifctester` 0.9.0 [src]. Compute IFC-vs-mesh deviation (represented vs measured). RVT: Path B (native Revit, model-driven): a frontier model drives a Revit MCP server (Bimwright rvt-mcp, Sam-AEC or Demolinator) to create native walls, doors, windows, floors, ceilings and columns strictly from `elements_enriched.json`, then exports IFC for the round-trip diff (§1b); alternatives are an Autodesk Platform Services Automation add-in (headless Revit in the cloud, RevitDB add-ins only; 300 free processing minutes/month then 1 token ≈ $3 per 12 minutes [src]) or pyRevit CLI `pyrevit run` on a Windows box with Revit. EdgeWise (no CLI/API found; Lite $1,995/yr [src]) and FARO As-Built for Revit 2026 (no API documented [src]) remain interactive options, not agent stages; Speckle's Revit connector loads everything as DirectShapes [src], so it is not a native path.
- **Outputs:** `model.ifc`, `ids_report.html|json`, `ifc_validation.json`, `ifc_vs_mesh.json`, optional `model.rvt`, `report.json`.
- **Pass/fail:** `yaml: stage_08_bim_authoring.*` — zero schema errors; 100 % of required IDS facets pass; element counts match the extraction; IFC-vs-mesh p95 ≤4/5/8 mm [est]; Path B: round-trip IFC-vs-JSON placement residual ≤1 mm for every element, zero DirectShape among walls/doors/windows, element counts equal, transaction log present.
- **Retry ladder:** programmatic fixes for placement/unit errors; regenerate; never hand-edit the IFC.

### Stage 10 — Browser delivery (static bundle)
- **Inputs:** `model.ifc`, `mesh.glb`, optional `splats`, `deviation.glb`, `elements_enriched.json`, `cameras.json` + thumbnails, QC reports.
- **Process:** convert IFC to the viewer format (Fragments for ThatOpen, XKT for xeokit); Draco + KTX2 compress the GLB and build LODs; assemble a static site with the feature checklist in §4 (the viewer code and its tests are written and maintained by the coding agents under the CI fixture in §1b); run the Playwright suite (load time, property panel for sampled elements, measurement of two known target pairs vs. the IFC, section planes, photo lookup).
- **Outputs:** `viewer/` static bundle, `viewer_tests.json`, `report.json`.
- **Pass/fail:** `yaml: stage_09_browser_delivery.*` — first load ≤10 s on a laptop at 100 Mbit/s [est]; bundle ≤300/600/1 500 MB; measurement tool vs IFC ≤0.5 mm (viewer arithmetic); property sets visible for 100 % of sampled elements; all required features present; test suite green.

### Stage 11 — Blind validation, accuracy statement and sign-off
- **Inputs:** `checks.sealed` (unsealed only now), `model.ifc`, `mesh.glb`, all stage reports.
- **Process:** compute every independent distance/coordinate against (a) the mesh and (b) the IFC elements; report RMSE, p95, max, per-zone and per-direction bias; produce the accuracy statement (measured vs represented, per USIBD LOA) and the provenance manifest (hashes, software versions, parameters, attempts). No re-tuning after unsealing; a failure routes back to the responsible stage with a written cause, and re-validation uses the second sealed subset.
- **Outputs:** `validation.json`, `accuracy_statement.pdf`, `provenance.json`, `qc_dashboard.html`, `report.json`.
- **Pass/fail:** `yaml: stage_10_blind_validation.*` — ≥10/20/40 checks; RMSE ≤2.0/2.5/5.0 mm (L photogrammetry-only) or ≤3.0 mm (L with TLS or survey control); p95 ≤4/5/10 mm (L hybrid ≤6 mm); max ≤6/8/15 mm (L hybrid ≤10 mm). The ±2–5 mm claim is made only where p95 ≤5 mm.
- **Human gate G3:** sign-off on the accuracy statement; the agent produces the pack but does not publish it.

## 3. Premium tools and hybrids that actually reach ±2–5 mm

| Option | What it adds | Sourced figure | When to use |
|---|---|---|---|
| **TLS-primary hybrid** (Leica RTC360 or FARO Focus Premium for geometry; photogrammetry for texture and visuals; fused in Metashape via `importPointCloud(is_laser_scan=True)` + Align Laser Scans [src] or RealityScan `-importLaserScan` [src], scans held fixed) | Surfaces at 2–3 mm regardless of wall texture; plain walls solved | RTC360 1.9 mm @10 m, 2.9 mm @20 m (1σ) [src]; Focus Premium 2 mm @10 m, 3.5 mm @25 m [src] | M with plain walls; all L; any job where the client will measure surfaces, not just targets |
| **Survey-controlled photogrammetry** (total station network of 20–40 targets as control + held-out checks) | Global scale and shape control; datum from the compensator | TS16 prism 1 mm + 1.5 ppm, 1″ [src] | L halls; multi-room jobs needing one frame |
| **Leica 3D Disto as the check instrument** | Target-centre coordinates at ≈1 mm @10 m [src] | — | S/M jobs that must *prove* ±2 mm |
| **Calibrated bars** | CHI 0.1 mm or better [src]; Brunson Invar bar ±0.003 mm [src]; industrial DPA systems 2 µm + 5 µm/m RMS [src: AICON brochure] show the ceiling | — | ≥1.5 m bars for L; keep 2–3 as held-out checks |
| **Camera** | 61 MP full frame + 24 mm prime gives GSD 0.47 mm at 3 m; 102 MP medium format + 32 mm gives 1.4 mm at 12 m | [est, `predict_precision.py`] | L halls at long standoff |
| **Texture aids for plain walls** | Stick-on targets every ~1 m or a fixed pattern projector during a geometry pass (texture pass without it) | [est] | M/L plain walls when TLS is not available |
| **Frontier models (§1b)** | Topology proposal, native-Revit authoring, attribute extraction, code maintenance | no dimensional accuracy demonstrated [src] | never as the geometric source |
| **Learned reconstruction models (§1b)** | fast preview, pose initialisation, low-texture priors | see §1b figures | never as the metric source |
| Not for this target | BLK2GO (±10 mm indoor [src]), VLX 3 (5 mm local 1σ [src]), iPhone LiDAR (±1 cm [src]) | — | coverage/preview only |

Recommended hybrids by class: **S** photogrammetry + bars + laser datum + 3D Disto checks; **M** the same plus either a total station or a TLS pass if walls are plain; **L** TLS-primary or survey-controlled photogrammetry, never bars alone.

## 4. Browser delivery completeness

The v1 line "xeokit SDK or IFClite viewer (properties + measurements)" under-specifies the deliverable. The bundle below is what "engineering-grade" means in a browser, and the Playwright suite in Stage 10 tests each line.

**Must have (blocking in `yaml: stage_09_browser_delivery.required_features_present`)**
1. IFC spatial tree (site → building → storey → space → element) with isolate/hide, and element selection from both the BIM and the photoreal mesh.
2. Property panel showing every property set, including `Pset_CaptureEvidence` (fit RMS, inliers, confidence, evidence images, LOA) and derived quantities.
3. Measurement: point-to-point distance, angle, and surface-snapped measurement with the result shown in mm; a visible accuracy badge next to every measurement ("model LOA40: ±5 mm at 95 %") so viewer precision is never mistaken for survey accuracy.
4. Section planes (axis-aligned and free) and a plan-view camera.
5. Photoreal textured mesh as a toggleable layer, aligned to the IFC in the same coordinate frame; deviation heat-map layer (mesh vs BIM, ±10 mm colour ramp) with a legend.
6. Photo lookup: click an element or a point and see the source photographs that observe it (camera poses from Stage 05), with the crop used as attribute evidence.
7. Coordinates and datum: readout of local coordinates, the datum definition, and the level-line targets; scale bars drawn in place with their certified lengths.
8. QC dashboard page: stage pass/fail table, residual histograms, validation statistics, provenance manifest, software versions.
9. Static, offline-capable bundle (no server dependency), deployable to any static host or a USB stick; size within budget; progressive loading for M/L.
10. Downloads: IFC, GLB, E57 (or LAZ), validation JSON, accuracy statement PDF.

**Should have**
- 3D Gaussian splat layer toggle for presentation views (visual only; the measurement tool is disabled on the splat layer).
- BCF viewpoint/issue export for review comments; review-queue UI for Stage 08 gate G2.
- Multi-room navigation with a 2D mini-map; bookmarked views.

**Choosing the stack (verified Oct 2026)**
- *Recommended: ThatOpen + Spark.* `@thatopen/components` 3.4.9 / `@thatopen/fragments` 3.4.8 (MIT) give Fragments (FlatBuffers) with an IfcImporter that runs in the browser or in Node, Length/Area/Angle/Volume measurement components, a Clipper and a property table [src]; `web-ifc` 0.0.78 (MPL-2.0) parses IFC in WASM [src]. Gaussian splats are composited in the same three.js scene with `@sparkjsdev/spark` 2.3.1 (MIT; PLY, SPZ, SPLAT, KSPLAT, SOG) or three r186's own GaussianSplat addon (WebGPU) [src]; the older mkkellogg library is unmaintained and lacks SPZ/SOG [src]. One scene graph for mesh, BIM, deviation map and splats.
- *BIM-first alternative: xeokit.* SDK 2.6.114 (AGPL-3.0, commercial licence via Creoox) with Distance/Angle measurement, SectionPlanes, BCF, TreeView plugins and property sets; `xeokit-bim-viewer` 2.7.1 is a ready-made app [src]. Caveats: direct IFC→XKT is alpha and drops property sets; the recommended path is the closed-source cxConverter (watermarked without a licence) → GLB+JSON → `convert2xkt` [src]; no Gaussian-splat rendering in the released SDK (July-2026 proof-of-concept branch only) [src].
- *IFClite (as named in v1).* `LTplus-AG/ifc-lite` is real and active (MPL-2.0; Rust→WASM parser; WebGPU renderer; property editing, BCF, IDS validation, 2D drawings, federation) [src]. It has **no measurement tool** [src], so it does not meet "properties + measurements" on its own; its in-browser IDS validation is useful for the QC page.
- Do not mix Speckle's viewer (three ^0.140) with ThatOpen (three ≥0.182) in one bundle [src].
- IFC carries no usable textures in these viewers (no texture pipeline in web-ifc geometry; xeokit textures arrive via glTF) [src], which is why the photoreal layer is a separate GLB.
- CI: Playwright drives WebGL in headless Chromium (xeokit's own test suite uses it); GPU-less runners use SwiftShader flags [src].

**Performance budgets [est]:** first interactive ≤10 s on a 100 Mbit/s laptop; GLB with Draco geometry and KTX2 textures; texture pages 8 k with 2 LODs for M/L; total ≤300/600/1 500 MB for S/M/L.

## 5. Agent orchestration (how an agent runs, QCs and retries this)

**Contracts.** Three files make the pipeline agent-operable without any prose in the loop: `job.yaml` (job id, class, LOA target, paths, equipment, roles of bars, sealed-check hash), `qc-thresholds.yaml` (the only place thresholds live, version-controlled), and `stage-report.schema.json` (what every stage must emit). A stage that cannot produce a schema-valid report is a failed stage.

**Runner.** A deterministic DAG runner executes stages in order (Snakemake, Prefect or a 150-line Python state machine); idempotency by content hash of inputs + params; artifacts are content-addressed; every attempt keeps its own folder. Heavy stages run on a GPU workstation or cloud node (the Mac in this workspace has 16 GB RAM and no discrete GPU, so it is the orchestrator, not the processor); Metashape runs headless with `-r script.py` [src] (the Qt `-platform offscreen` flag seen in HPC guides is not in Agisoft's documentation); Metashape names only CUDA/OpenCL GPU acceleration and Vulkan texturing on Linux/Windows [src], another reason the Mac only orchestrates; RealityScan runs on Windows (Linux CLI-only build, no macOS [src]) and is driven over SSH/WinRM if chosen.

**Agent role.** The LLM agent does not compute metrics or decide thresholds. It (1) reads `report.json`, (2) chooses the next ladder step from the stage's fixed ladder when `status: fail` and attempts < max, (3) writes a one-paragraph diagnosis into the attempt folder, (4) opens a human gate with a summary and viewer link when the ladder is exhausted or a gate is mandatory (G0 plan, G2 attribute review, G3 sign-off), and (5) runs the vision classification in Stage 08 with a JSON schema so outputs are machine-checkable. Tool interface: expose each stage as an MCP tool (`capbim.run_stage`, `capbim.read_report`, `capbim.open_gate`), so the orchestrator model calls stages rather than shelling out ad hoc. Default orchestrator model: Claude Opus 5.5; bulk vision classification with Claude Haiku 5.5 through the batch endpoint; structured outputs via `output_config.format`.

**Two-model adjudication.** Judgement-based outputs (Stage 07 topology proposals, Stage 08 attributes, failure diagnoses) are produced independently by two models from different vendors (Claude Opus 5.5 and GPT-6.1 Sol); agreement above the confidence floor is accepted, disagreement is queued for a human. This is cheap insurance against a single model's confident error, which the OpenSCAD tests in §1b show is real.

**Pipeline as software maintained by coding agents.** `capbim` is a normal repository: Claude Code (Opus 5.5) and Codex (GPT-6.1 Sol) implement and maintain stages, viewer and tests; nothing merges unless the synthetic fixture and the real reference dataset pass (§1b). Humans review the metrology code paths (scale, datum, fitting, statistics) line by line once; everything else is covered by the fixture.

**Guard-rails.** Thresholds are read-only to the agent; the blind-check key is not in the agent's environment until Stage 11; max 3 attempts per stage; every retry records the parameter diff; the agent never edits IFC or mesh files by hand; survey control for L cannot be waived by the agent.

**Minimal run loop (pseudocode).**
```
for stage in DAG:
    for attempt in 1..3:
        run(stage, ladder=attempt-1)
        r = read_report(stage)
        if r.status in (pass, warn): break
        if not ladder_has_step(stage, attempt): open_gate(stage, r); wait
    if r.status == fail: stop(job, stage)
```

**Cost and time (estimated, 2026 hardware; RTX 4090-class node).**

| Class | Capture | Processing (Stages 04–06) | Extraction + BIM | Total wall-clock |
|---|---|---|---|---|
| S | 1–2 h | 1–3 h | 1–2 h | ≤1 day |
| M | 2–4 h | 4–10 h | 2–4 h | 1–2 days |
| L | 1–2 days incl. survey control | 12–48 h | 4–8 h | 3–6 days |

## 6. Realistic caveats: rooms versus halls

1. **Everything scales with standoff.** GSD for a 61 MP + 24 mm camera is 0.47 mm at 3 m and 1.88 mm at 12 m; single-pair depth precision goes from 0.8 mm to 3.2 mm [est, `predict_precision.py`]. The user's hall image counts (300–1 000+) are right only if the standoff is chosen from a GSD target (≤0.8 mm → ≈600 images for a 60 × 40 m hall), not from coverage alone (≈260 images at 12 m standoff, which would give 2–6 mm surfaces).
2. **Scale does not propagate for free.** One 1 m bar at 0.1 mm is 100 ppm: 7 mm over a 72 m diagonal [est]. Bars control local scale; only survey distances or TLS control global scale in L.
3. **Block deformation.** Long perimeter walks with near-parallel imagery produce systematic bowl/dome deformation that bar residuals do not reveal; it results "from a combination of near-parallel imaging directions and inaccurate correction of radial lens distortion", scales linearly with radial distortion, and oblique/convergent images "can reduce DEM error by up to two orders of magnitude" [src: James & Robson 2014]. v2 adds long-diagonal checks and held-out bars precisely to catch it.
4. **Datum.** A laser level at 0.2 mm/m [src] is adequate for rooms and inadequate for halls (12 mm over 60 m); halls take the datum from the total station or TLS.
5. **Plain walls.** Photogrammetry needs texture; image-based modelling "faces difficulties when presented with the objects made of homogenous or texture-less surfaces" [src: Hafeez et al. 2018]; projected noise patterns restore matching (0.06 mm SD on a test object) [src: Hafeez et al. 2020] and multi-shot noise suppression raised completeness on white walls by up to 300 % [src: Ley et al. 2016]. Expect the mesh on such surfaces to be the weak point; use targets, projected patterns or TLS.
6. **Glass, mirrors, glossy floors, screens** produce false geometry; masks are part of Stage 03, and the deviation map will show residual artefacts.
7. **Occupied halls** mean moving people, changing lighting and no flash at 12 m; tripod work and higher ISO cost precision; schedule capture outside occupancy where possible.
8. **Wall thickness** is not observable from an interior-only capture; v2 takes it from door/window reveals and otherwise flags `thickness_source: assumed` in the IFC.
9. **Compute.** L jobs need a GPU node and days, not hours; the Mac in this workspace (16 GB, no discrete GPU) orchestrates only.
10. **What can honestly be claimed.** S: LOA40 measured and, with a passing deviation map, LOA40 represented. M: LOA40 measured at targets and textured surfaces, LOA30–40 represented. L photogrammetry-only: LOA30 (targets 3–8 mm, surfaces 5–15 mm across the hall) [est]; L with TLS or survey control: LOA40 at targets and TLS-covered surfaces [est, from the datasheet figures above].

## 7. Accuracy and capability ledger (every figure used above)

Legend: **[src]** sourced with URL and verbatim quote; **[est]** estimated, with basis. Access date 2026-10-11.

### 7.1 Instruments and standards [src]

| Figure | Value | Source | Verbatim |
|---|---|---|---|
| USIBD LOA version | v3.1, Jan 2025 | usibd.org; lidarmag.com/?p=15520 | "Level of Accuracy Specification (LOA v3.1)" |
| USIBD LOA ranges | LOA10 user-defined–5 cm; LOA20 5 cm–15 mm; LOA30 15–5 mm; LOA40 5–1 mm; LOA50 1–0 mm | techture.zohodesk.in KB (third-party reproduction; spec PDF member-only) | "*Specified at the 95 percent confidence level." |
| USIBD measured vs represented | definitions | lidarmag.com/2026/06/09/accuracy-isnt-a-setting/ | "Measured accuracy describes how closely the captured data reflects real-world conditions. Represented accuracy describes how closely the model reflects the measured data." |
| Leica RTC360 | 3D point accuracy 1.9 mm @10 m, 2.9 mm @20 m, 5.3 mm @40 m (1σ, 89 % albedo) | Leica datasheet copy, infrabooking.aalto.fi | "3D point accuracy 1.9 mm @ 10 m 2.9 mm @ 20 m 5.3 mm @ 40 m … level of confidence of 68%" |
| Leica BLK360 G2 | 4 mm @10 m (1σ, 78 % albedo) | shop.leica-geosystems.com BLK360-Spec-Sheet-v2.pdf | "3D point accuracy* 4 mm @ 10 m" |
| Leica BLK360 G1 | 6 mm @10 m / 8 mm @20 m 3D point accuracy | Leica G1 spec sheet | "3D point accuracy* 6mm @ 10m / 8mm @ 20m" |
| FARO Focus Premium | 3D accuracy 2 mm @10 m, 3.5 mm @25 m; ranging error ±1 mm | FARO brochure (dealer-hosted copy) | "3D Accuracy 2 mm @10 m 3.5 mm @25 m / Ranging Error ±1 mm" |
| Leica DISTO X3 | 1 mm favourable / 2 mm unfavourable, 95 %, 0.05–10 m | Leica X3 manual | "Accuracy with favourable conditions * 1 mm … confidence level of 95%" |
| Leica DISTO X4 | typ. ±1.0 mm | Leica X4 datasheet (dealer copy) | "Typ. distance measuring accuracy ± 1.0 mm" |
| Leica DISTO D2 | 1.5 mm / 3 mm, 95 %, 0.05–5 m | Leica D2 datasheet | "1.5 mm … 3 mm … confidence level of 95%" |
| Leica DISTO S910 P2P | ±2 mm @2 m, ±5 mm @5 m, ±10 mm @10 m; distance 1.0/2.0 mm | Leica S910 datasheet (re-checked by me from the PDF text) | "Tolerance P2P function at distances ± 2 mm / 2 m \| ± 5 mm / 5 m \| ± 10 mm / 10 m" |
| Leica 3D Disto | tie distance ≈1 mm @10 m, ≈2 mm @30 m, ≈4 mm @50 m; angle 5″ | Leica 3D Disto manual v6.1 | "Accuracy Tie Distance (3D) at 10 m ca. 1 mm, at 30 m ca. 2 mm, at 50 m ca. 4 mm" |
| Leica TS16 | angle 1″–5″; prism 1 mm + 1.5 ppm; any surface 2 mm + 2 ppm | Leica TS16 datasheet (mirror) | "Single (prism) 1mm + 1.5ppm" |
| CHI scale bars | calibrated to 0.1 mm or better | culturalheritageimaging.org | "individually calibrated by CHI staff to 1/10th mm or better accuracy" |
| Hexagon AICON DPA | system 2 µm + 5 µm/m RMS; bar certificate uncertainty **not found** | AICON DPA brochure 2019 | "Point-based measurement accuracy 2 µm + 5 µm/m (RMS)" |
| Brunson Invar bar | ±0.003 mm (product title) | brunson.us | "803-MCL +-0.003 mm Metric" |
| Bosch GLL 3-80 CG | levelling ±0.2 mm/m (discontinued; successor GLL 12V-100-33 CG) | Bosch product sheet (dealer copy) | "Nivelliergenauigkeit +/- 0,2 mm/m" |
| Leica Lino L4P1 | 2 mm at 10 m | Leica L4P1 manual | "Accuracy 2 mm at 10 m" |
| iPhone/iPad LiDAR | ±1 cm absolute (objects >10 cm); ±10 cm on a 130 m cliff | Luetzenburg, Kroon & Bjørk, Sci. Rep. 11:22221 (2021), doi:10.1038/s41598-021-01763-9 | "with an absolute accuracy of ± 1 cm" |
| NavVis VLX 3 | 5 mm local, 1σ, 500 m² test environment | navvis.com VLX 3 specifications | "5 mm in a dedicated test environment of 500 m2 … Local accuracy" |
| Leica BLK2GO | range noise ±3 mm; indoor accuracy ±10 mm (controlled), 1σ | BLK2GO spec sheet | "Accuracy indoor *** +/-10 mm" |

### 7.2 Frontier models [src]

| Figure | Value | Source | Verbatim |
|---|---|---|---|
| GPT-6 Astra release | 3 Sep 2026 | cnbc.com 2026/09/03; latent.space AINews | — |
| GPT-6 Astra modalities | text and images in/out | blog.neural4d.com | "the model's documented input and output are text and images" |
| GPT-6 Astra 3D method | Blender Python + render-check loop | blog.neural4d.com | "renders frames to inspect the outcome, then revises its own script" |
| GPT-6 Astra BIM tests | 327 native walls/162 doors/98 windows (unverified); DirectShape cabin; no accuracy figures; $10 detail test; 79 min block; no on-prem | aecmag.com GPT-6 Astra and the future of BIM modelling | "327 native walls, 162 doors and 98 windows" … "without independent verification" … "DirectShape geometry" |
| GPT-6 Astra limits | judgement gaps | aecmag.com | "lack reliable judgement about circulation, clearances and construction" |
| GPT-6 Astra pricing | $10/$50 per M; fast $20/$100 (tweet-sourced) | latent.space | — |
| GPT-6.1 Sol release/pricing | 29 Sep 2026; $2/$10 per M; 1M context; 128k output; text+image+file in, text out | techcrunch.com 2026/09/29; vals.ai | "one-fifth the standard input and output token prices" |
| GPT-6.1 Sol vs Astra | "nearly the same level of intelligence" for agentic coding, computer use, professional work | techcrunch.com | as quoted |
| GPT-6.1 Astra shelved | safety concerns | techcrunch.com citing WSJ | "higher levels of deception and a tendency to proceed with tasks without asking the user for permission" |
| Claude Opus 5.5 | 22 Sep 2026; $4/$20 per M; OSWorld 2.1 81.8 %; Terminal-Bench 4.0 66.4 %; Chartography 89.0 %; no 3D/CAD claim | anthropic.com/news/claude-opus-5-5 | "Input and output tokens are $4 and $20 per million" |
| Opus 5.5 + FreeCAD MCP | drawing → cylinder via Φ symbol; "not the same as completing a design" | note.com/teruemon | "understood the Φ symbol and created a cylindrical shape" |
| LLM CAD dimensional errors (prev. generation) | 35 mm vs 46.67 mm radius (Opus 4.8); 108 mm vs 99 mm shell (GPT-5.5) | xda-developers.com | "LLMs can't visualize 3D shapes, but they can write code that builds one" |
| Revit MCP servers | Bimwright rvt-mcp (Revit 2022–2027, 32 tools, transaction per action); Sam-AEC (100+ tools, 2024–2026); Demolinator (48 tools, 2024–2027) | NuGet / GitHub / registry listings | "each action is wrapped in one Revit transaction, so a single undo reverts it" |
| Blender MCP | official Blender Lab server 1.0.3 (Sep 2026, 26 tools); community BlenderMCP | blender.org / github.com/ahujasid/blender-mcp | — |

### 7.3 Tools verified directly [src]

| Item | Finding | Source |
|---|---|---|
| CloudCompare CLI | `-RANSAC` (2.11+, ENABLE_PRIMITIVE PLANE…), `-C2M_DIST`, `-SAMPLE_MESH` | cloudcompare.org wiki, Command line mode |
| Open3D | `segment_plane(distance_threshold, ransac_n, num_iterations)` → plane coefficients + inlier indices | open3d.org docs |
| pyRevit CLI | `pyrevit run <script> <model.rvt> --revit=<year>` batch execution (Windows + installed Revit) | pyrevitlabs.notion.site Batch Process Revit Models |

### 7.4 Scan-to-BIM and IFC/RVT automation [src]

| Figure | Value | Source | Verbatim |
|---|---|---|---|
| EdgeWise | Topcon company; Lite $1,995/yr, Pro on request; Revit import plugin; no CLI/API found | clearedge3d.com/about, /products/edgewise | "EdgeWise integrates seamlessly with Autodesk® Revit® via a dedicated import plugin" |
| Cyclone 3DR CLI | `--script`, `--scriptOutput`, `--silent`, `--scriptParam`, `--scriptAutorun` (re-checked by me) | rcdocs.leica-geosystems.com/cyclone-3dr/2025.2/Script | "--silent: Silent Mode. Disables the Graphical User Interface (no windows)." |
| Cyclone 3DR extraction/inspection | SCloud.BestPlane, ExtractPlane, ExtractPlanarContours, Classify; SPoly.Compare / SCloud.Compare; SReport; IFC export limited to piping/meshes | cyclone3dr.leica-geosystems.com help 2026.0 | "Compute the distances between 2 components for further inspection purpose (color mapping)" |
| FARO As-Built for Revit | 2026.0.0.33 (2 Oct 2026); wall fitting; no API/batch documented | knowledge.faro.com | "Version 2026.0.0.33, released 2 Oct 2026" |
| Pointfuse | standalone ended 1 May 2025; tech in ReCap Pro 2026 | autodesk.com/solutions/pointfuse | "PointFuse software, as a standalone application, will cease to exist on May 1, 2025." |
| ODA Scan-to-BIM SDK | beta C++ SDK; floors/walls/openings/roofs → IFC; no E57 | opendesign.com/products/scan-to-bim | "Architectural objects directly from point cloud: floors, walls, openings, sloped roofs." |
| Aurivus / Pointly / Cintoo / Imerso | Revit plug-in no API / classification API / cloud API not extraction / scan-vs-BIM verification | vendor pages | — |
| APS Automation API (Revit) | headless Revit; RevitDB add-ins only; 10,800 s default per work item; 300 free min/month then 1 token ($3)/12 min | aps.autodesk.com developers_guide; product-details | "The Automation API provides access to a headless version of Revit running in the cloud as an APS service." |
| IfcOpenShell | 0.9.0 (29 Sep 2026); api: root.create_entity, geometry.create_2pt_wall, add_wall/slab/door/window_representation, feature.add_feature/add_filling, pset.add_pset/add_qto/edit_qto | pypi.org/project/ifcopenshell; GitHub v0.9.0 api tree | file names as listed |
| ifcopenshell.validate | `python -m ifcopenshell.validate model.ifc --rules --json` | GitHub validate.py | "usage: validate.py [-h] [--rules] [--json] [--fields] [--spf] files" |
| ifctester / IDS | ifctester 0.9.0 with ids.xsd 1.0.0; IDS v1.0.0 final standard 3 Jun 2024 | pypi ifctester; github.com/buildingSMART/IDS/releases/tag/v1.0.0 | "The buildingSMART Final Standard" |
| Cloud2BIM | MIT; E57/XYZ → slabs, walls, windows, doors → IFC; `python cloud2entities.py config.yaml`; no accuracy figures (re-checked by me) | github.com/VaclavNezerka/Cloud2BIM; doi:10.1016/j.autcon.2025.106303 | "automates the Scan-to-BIM process by converting point clouds into 3D parametric entities" |
| RoomFormer / Mask3D / PTv3 | MIT each; floorplan polygons / 3D instance segmentation / point backbone | GitHub | — |
| Speckle | IFC import ≤1 GB; Revit connector loads DirectShapes; specklepy | speckle.systems; docs.speckle.systems | "All objects in Speckle models are loaded as Direct Shapes" |

### 7.5 Browser viewers and splats [src]

| Figure | Value | Source | Verbatim |
|---|---|---|---|
| xeokit SDK | 2.6.114 (2 Sep 2026), AGPL-3.0, commercial via Creoox; measurement/section/BCF/tree plugins; PropertySet metadata | github.com/xeokit/xeokit-sdk | "xeokit SDK is licensed under AGPLv3" |
| xeokit-convert | 1.3.2; direct IFC→XKT alpha, no property sets; cxConverter path recommended | github.com/xeokit/xeokit-convert | "Direct IFC conversion is an alpha status feature … not property sets are supported." |
| cxConverter | 5.11.15 (Sep 2026), closed source, watermark without licence | github.com/Creoox/creoox-ifc2gltfcxconverter | "The generated glb files will have a watermark." |
| xeokit-bim-viewer | 2.7.1, AGPL-3.0; BCF, tree views, measure tools, properties inspector | github.com/xeokit/xeokit-bim-viewer | "Saves and loads BCF viewpoints." |
| xeokit splats | not in released SDK; PoC branch July 2026 | PR #2076 | "feat: add PoC Gaussian Splatting render pipeline" |
| ThatOpen | components 3.4.9, fragments 3.4.8 (6 Oct 2026), MIT; IfcImporter browser/Node; Length/Area/Angle/Volume measurement; Clipper | docs.thatopen.com; github.com/ThatOpen | "Fragments is completely free and open source (MIT License)" |
| web-ifc | 0.0.78, MPL-2.0, WASM in browser | github.com/ThatOpen/engine_web-ifc | "web-ifc.wasm - The wasm (compiled C++) to run in the browser" |
| IFClite | LTplus-AG/ifc-lite, MPL-2.0, WebGPU renderer; BCF, IDS, 2D drawings, federation; **no measurement tool** (re-checked by me) | github.com/LTplus-AG/ifc-lite | "Open-source IFC toolkit: WebGPU rendering, columnar in-memory store, exact-arithmetic geometry kernel." |
| Spark | @sparkjsdev/spark 2.3.1 (Oct 2026), MIT; PLY/SPZ/SPLAT/KSPLAT/SOG; three.js compositing | github.com/sparkjsdev/spark | "Integrates with THREE.js rendering pipeline to fuse splat and mesh-based objects" |
| three.js r186 | GaussianSplat addon + SPZ/SPLAT/KSPLAT/PLY loaders (WebGPU) | github.com/mrdoob/three.js r186 | — |
| SPZ / SOG | ~10× smaller than PLY / ~15–20× smaller, lossy | github.com/nianticlabs/spz; developer.playcanvas.com | "About 10x smaller than the PLY equivalent" / "typically yielding files ~15–20× smaller" |
| Speckle viewer | 2.31.14, Apache-2.0, three ^0.140 | github.com/specklesystems | — |
| Playwright + WebGL | feasible; xeokit uses Playwright; SwiftShader for GPU-less CI | xeokit playwright.config.ts; chromium docs | "SwiftShader is a useful tool for web developers to test their sites on systems that are headless or do not have a supported GPU." |

### 7.6 SfM engines and 3DGS tooling [src]

| Figure | Value | Source | Verbatim |
|---|---|---|---|
| Metashape version | 2.3.2 build 22956 (25 Aug 2026); 2.4.0 preview (14 Sep 2026); API reference 2.3.0 | agisoft.com changelog PDF; downloads | "Version 2.3.2 build 22956 (25 August 2026)" |
| Metashape Pro price | $3,499 node-locked | agisoft.com/buy/online-store | "$ 3 499" |
| Metashape accuracy claim | "up to 1mm for close-range" appears only in the presentation PDF, not on live pages | agisoft.com/pdf/metashape_presentation.pdf | "up to 3cm for aerial, and up to 1mm for close-range photography" |
| Metashape headless | `-r script.py`; `MetashapePro -r <script>` on macOS; `-platform offscreen` not in Agisoft docs | API 2.3.0 PDF; manual 2.3 | "From command line using "-r" argument and passing the path to the script" |
| Metashape macOS/GPU | Apple Silicon native since 1.8.0; docs name CUDA/OpenCL only; Vulkan texturing Linux/Windows; CPU texturing on macOS since 2.3.1 | changelog; manual | "Metashape supports texture blending on GPU using Vulkan technology on Linux and Windows OS." |
| detectMarkers | CircularTarget12/14/16/20bit, CircularTarget, CrossTarget, AprilTag families | API 2.3.0 | "detectMarkers(target_type=CircularTarget12bit, tolerance=50, …)" |
| addScalebar / reference | addScalebar(point1, point2); Scalebar.Reference.distance / .accuracy floats | API 2.3.0 | "accuracy — Scale bar length accuracy. Type float" |
| optimizeCameras | tiepoint_covariance (since 1.5.0), fit_f/cx/cy/b1/b2/k1–k4/p1/p2, fit_corrections, adaptive_fitting | API 2.3.0 | "tiepoint_covariance (bool) – Estimate tie point covariance matrices." |
| TiePoints.Filter | ReprojectionError, ReconstructionUncertainty, ImageCount, ProjectionAccuracy; also Chunk.cleanTiePoints | API 2.3.0 | "Tie points filter criterion in [ReprojectionError, ReconstructionUncertainty, ImageCount, ProjectionAccuracy]" |
| Build/export | buildDepthMaps / buildModel / buildTexture / buildPointCloud; ModelFormatGLTF (GLB = binary glTF, gltf_y_up); exportReport PDF only | API 2.3.0; manual | "Export processing report in PDF format." |
| Laser scans | importLaserScans() removed 2.0.0 → importPointCloud(is_laser_scan=True); Align Laser Scans 2.1.0; match_laser_scans (2.1.0), align_laser_scans (2.2.1), match_depth_maps (2.3.0) (re-checked by me in the API/changelog text) | changelog; API 2.3.0 | "Added Align Laser Scans... command to Workflow menu to perform geometric matching for laser scans." |
| Gaussian splats in Metashape | none (no "splat" in API 2.3.0, manual 2.3, changelog to 2.4.0 preview; re-checked by me) | same | — |
| exportCameras COLMAP | CamerasFormatColmap since 2.1.3 (10 Sep 2024) | changelog; API 2.3.0 | "Added Colmap format support for Export Cameras command." |
| NetworkClient / CloudClient | both exist | API 2.3.0 | "NetworkClient class provides access to the network processing server" |
| Metashape AI masking | 2.2.0 preview | changelog | "Added AI based masking method to Generate Masks dialog." |
| RealityScan rename | announced 3 Jun 2025; 2.0 released 17 Jun 2025; latest 2.2 (25 Jun 2026, AMD GPUs) | realityscan.com news; cgchannel | "The product formerly known as RealityCapture" |
| RealityScan licence | free under $1M USD revenue (12 months); $1,250/seat/year | realityscan.com/license | "$1250 / seat / year" |
| RealityScan platform | Windows primary; Linux CLI-only build; no macOS | dev.epicgames.com hardware requirements | "A Linux version is also available, but it is recommended only for CLI-based workflows." |
| RealityScan CLI | -headless, -addFolder, -detectMarkers, -defineDistance, -align, -calculateNormalModel, -calculateHighModel, -calculateTexture, -exportModel, -exportReport (HTML), -setReconstructionRegionAuto, -importLaserScan, -generateAIMasks, -exportXMP, -importColmap | dev.epicgames.com command docs | "-headless: Hides user interface." |
| RealityScan laser import | PTX, E57, PLY, ZFS (terrestrial); LAS/LAZ, E57, PLY, CSV, XYZ, PTS (mobile) | rshelp.capturingreality.com importlaser | "can be imported in formats PTX, E57, PLY, and ZFS/ZFPRJ" |
| RealityScan targets / 3DGS | 12/16/20-bit single ring, 12-bit dual ring, AprilTags; no native splat generation (COLMAP export; feature request open Sep 2026) | rshelp detectmarkers; release notes; forums | "Circular, single ring, 12-bit" |
| COLMAP / GLOMAP / pycolmap | COLMAP 4.2.1 (29 Sep 2026); GLOMAP merged into COLMAP 4.0.0 as global_mapper; pycolmap 4.2.1 on PyPI (CUDA wheels Linux only) | GitHub releases; PyPI | "Integrated GLOMAP global SfM pipeline into COLMAP as a first-class alternative" |
| Postshot | Free; Indie €204/yr (yearly) or €312/yr (monthly); Studio €468/yr or €708/yr; imports COLMAP + RealityScan (no Metashape importer); exports PLY/SPZ; CLI Studio only; Windows + NVIDIA | jawset.com pricing/docs | "Import cameras and points in COLMAP, RealityScan formats" |
| Nerfstudio splatfacto | gsplat backend; `ns-train splatfacto`; `ns-export gaussian-splat` | docs.nerf.studio | "Nerfstudio uses gsplat as its gaussian rasterization backend" |
| SPZ / SOG | ~10× smaller (ZSTD v4) / ~15–20× smaller, lossy | github.com/nianticlabs/spz; developer.playcanvas.com | "typically around 10x smaller" / "lossy by design" |

### 7.7 Literature [src]

| Claim | Figure / finding | Source | Verbatim |
|---|---|---|---|
| Mobile indoor scanners vs TLS | lower accuracy than TLS; floor-elevation STD: Slammer 5 mm … Matterport 67 mm; no DSLR SfM tested | Lehtola et al. 2017, Remote Sensing 9(8):796, doi:10.3390/rs9080796 | "Mobile scanning techniques are offering an efficient way to produce point clouds, but with a lower accuracy than the traditional terrestrial laser scanning (TLS)." |
| Indoor room SfM vs total station | RMSE ≈6 mm (PhotoScan 6.8/7.2/6.7 mm; Pix4D 5.2/4.6/5.9 mm), 11 check points, 360° camera, 15 images, 10.9 × 6 × 3.7 m | Barazzetti, Previtali, Roncoroni 2018, ISPRS Archives XLII-2:69–75, doi:10.5194/isprs-archives-XLII-2-69-2018 | "show an accuracy of about 6 mm, whereas the test site is 10.9 m x 6 m x 3.7 m." |
| Consumer 360° video indoors | ≈50 mm C2C, 35 mm control-point analysis | Honti, Erdélyi, Funtík 2026, ISPRS Archives XLVIII-2/W12-2026:199–206 | "average deviations around 50 mm for C2C and 35 mm for CPA" |
| Doming | near-parallel imaging + radial distortion; linear in distortion; obliques reduce error up to 100× | James & Robson 2014, ESPL 39(10):1413–1420, doi:10.1002/esp.3609 | "result from a combination of near-parallel imaging directions and inaccurate correction of radial lens distortion" |
| Fraser formula | σ = q·(Z/c)·σ_img/√k; q = network design factor | Dall'Asta et al. 2015, Sensors 15(4):7985–8008, doi:10.3390/s150407985 citing Fraser 1996 | "q is a design factor expressing the strength of the camera network" |
| q values | 0.6–0.7 for rigorous networks (medium-low confidence: ISPRS 2004 proceedings page) | TIB viewer, ISPRS Congress 2004 Part B5 | "q factor is considered to vary from 0.6 to 0.7." |
| Target centroiding | <1/20 px routinely; 1/50–1/100 px achievable | Luhmann 2014, ISPRS Archives XL-5:363–370, doi:10.5194/isprsarchives-XL-5-363-2014 | "image measuring accuracies in the order of 1/50 – 1/100 pixel can be achieved" |
| Texture-less surfaces | difficulty; projected patterns (KAZE SD 0.0635 mm); multi-shot +300 % completeness on white walls | Hafeez et al. 2018 doi:10.24425/mms.2018.124883; Hafeez et al. 2020 Remote Sensing 12(23):3886; Ley, Hänsch, Hellwich 2016 ISPRS Annals III-3:91–98 | "faces difficulties when presented with the objects made of homogenous or texture-less surfaces" |
| Image-based vs laser for precise tasks | qualitative | Golparvar-Fard et al. 2011, Automation in Construction 20(8):1143–1155 | "image-based point cloud models may not be as accurate and dense" |
| TLS vs photogrammetry vs total station (exterior) | TLS ≤2 mm; close-range photogrammetry 0.02–0.30 m in that study | Zakaria et al. 2025, Civil Engineering Journal | "TLS deviations … as low as 2 mm compared to TS, while DCRP exhibited variations ranging from 0.02 m to 0.30 m" |
| GSD rule | 1–3 × GSD (vendor); ≈2 × GSD with dense control, ≈5 × with little (UAV) | Pix4D support article 202558889; Sanz-Ablanedo et al. 2018, Remote Sensing 10(10):1606 | "one can expect an error of 1-3 times the Ground Sampling Distance" / "approximately double the average GSD" |
| 3DGS geometry | 3DGS mesh 0.30 cm vs Metashape 0.20 cm SD (building); 3DGS clouds ≈2 cm SD vs TLS; 1–2 cm RMSE point measurements; "significant drawbacks" vs LiDAR | Billi et al. 2026 ISPRS Archives XLIX-B2; Murtiyoso & Macher 2025 ISPRS Archives XLVIII-M-9; Deng & Qin 2026 ISPRS Annals XI-2; Xiong et al. 2024 arXiv:2404.04880 | "average point cloud standard deviation of 2 cm" |
| Rolling shutter / IS | RS model improves accuracy (UAV 8 m/s); extended Fraser calibration absorbs RS affine deformation; IS must be off | Vautherin et al. 2016 ISPRS Annals III-3; Bruno & Forlani 2023 Remote Sensing 15(9):2391; Nocerino, Menna, Verhoeven 2022 ISPRS Archives XLVI-2/W1 | "IS must be disabled when accuracy matters in photogrammetric projects." |

### 7.8 Learned 3D reconstruction, splat surfaces, LLM/VLM 3D benchmarks [src]

| Claim | Figure / finding | Source | Verbatim |
|---|---|---|---|
| VGGT | not metric (first-camera frame, normalised); DTU 0.382 mm overall; 200 frames 8.75 s / 40.6 GB; custom licence, commercial checkpoint Jul 2025 | arxiv.org/abs/2503.11651; github.com/facebookresearch/vggt | "express all quantities in the coordinate frame of the first camera" |
| VGGT-Ω | CVPR 2026 oral; ≈30 % of VGGT GPU memory; contamination notice, retrained Aug 2026 | arxiv.org/abs/2605.15195 | "uses only about 30% of the GPU memory of its predecessor" |
| MapAnything | metric scale factor; scale rel-error ≈0.13 (images only); Apache-2.0 code, CC-BY-NC/Apache weights | arxiv.org/abs/2509.13414 | "non-precise metric scale estimation on ETH3D (a zero-shot dataset)" |
| Depth Anything 3 | relative scale except Metric/Nested; +35.7 % pose, +23.6 % geometry vs VGGT; Giant/Large CC-BY-NC-4.0, Base/Small/Metric Apache-2.0 | arxiv.org/abs/2511.10647 | "surpassing prior SOTA VGGT by an average of 35.7% in camera pose accuracy and 23.6% in geometric accuracy" |
| π³ / Pi3X | scale-free; Pi3X approximate metric; 57.4 FPS; weights CC-BY-NC-4.0 | arxiv.org/abs/2507.13347; github.com/yyfz/Pi3 | "predicts an affine-invariant camera pose and a scale-invariant local pointmap" |
| DUSt3R / MASt3R | CC-BY-NC-SA-4.0; DTU 0.374 mm with GT poses; scale inconsistent | arxiv.org/abs/2406.09756; arxiv.org/abs/2412.12392 | "scale is often a large source of inconsistency" |
| CUT3R / Fast3R | CUT3R claims metric, 17 FPS, NC licence; Fast3R normalised, 1 500 views, NC licence | arxiv.org/abs/2501.12387; arxiv.org/abs/2501.13928 | "All pointmaps and poses are in metric scale (i.e., meters)." / "process up to 1500 views in a single pass" |
| Aerial field test | COLMAP 0.06 m vs VGGT >1 m (up to 6 m), drift up to 42 m (paper body, per research agent); abstract re-checked by me: "up to 518 pixels resolution", "cannot fully replace traditional SfM and MVS" | Wu, Landgraf, Ulrich, Qin 2025, Geo-spatial Information Science, doi:10.1080/10095020.2025.2597491; arXiv 2507.14798 | "cannot replace traditional SfM and MVS methods entirely, they hold potential as complementary approaches" |
| VGGT on DTU (KIT) | filtered VGGT CD 0.59 mm; MASt3R 0.37 mm (GT poses); COLMAP 0.532 mm | Hillemann et al. 2026, ISPRS Annals XI-2; arxiv.org/abs/2606.16479; TransMVSNet arxiv.org/abs/2111.14600 | "a confidence threshold of 2.0 is a good choice for filtering the raw output of VGGT" |
| Pose benchmark 2026 | classical SfM more accurate; hybrid best | Meza, Oswald, Sattler 2026, arxiv.org/abs/2603.20428 | "While orders of magnitude more efficient, such recent works produce significantly less accurate estimates." |
| Photogrammetric review 2026 | validate neural outputs against control/LiDAR | Wang … Qin, Ulrich, PFG 2026, doi:10.1007/s41064-026-00412-y | "neural outputs are rigorously validated against sparse classical control points or LiDAR references" |
| Indoor TLS-truth test of feed-forward models | not found | — | — |
| Splat surfaces on DTU | 3DGS 1.96; SuGaR 1.33; 2DGS 0.80; GOF 0.74; PGSR 0.53/0.47 mm; COLMAP 0.532; TransMVSNet 0.305 (COLMAP poses throughout) | arxiv.org/abs/2403.17888; 2404.10772; github.com/zju3dv/PGSR | "The Chamfer Distance on the DTU dataset decreased to 0.47." |
| Scene/asset generators | no dimensional metric (Marble, Genie 3, HunyuanWorld, Hunyuan3D, SpAItial, Meshy, Tripo) | vendor blogs/help pages | "Meshy isn't built for millimeter-precise manufacturing tolerances." / "Genie 3 is currently unable to simulate real-world locations with perfect geographic accuracy." |
| Text2BIM | rule pass rates mostly >0.95 (generated design BIM) | arxiv.org/abs/2408.08054 (JCCE 2026) | — |
| LLM scan-to-BIM agent | room-area MAD 1.45/1.51 m², 4.70 %/5.10 % vs manual BIM | Pan et al. 2026, Automation in Construction 188, doi:10.1016/j.autcon.2026.107003 | "mean relative deviations of 4.70% and 5.10% versus manually created BIM" |
| CAD-Coder | mean CD(×10³) 6.54 vs GPT-4o 133.52, Claude 3.7 186.53; invalid code 1.45 % vs 93.0 % | arxiv.org/abs/2505.19713 (NeurIPS 2025) | — |
| BIM-Edit / BenchCAD | best model 49.5 %; no model fully solves >3.4 % of tasks / "coarse outer geometry" | arxiv.org/abs/2606.20146; 2605.10865 | "no model fully solves more than 3.4% of tasks" |
| VSI-Bench | abs-distance MRA: Gemini 1.5 Pro 30.9, GPT-4o 5.3, human 47.0 (paper table, per research agent); abstract re-checked by me: "subhuman", "primary bottleneck" | arxiv.org/abs/2412.14171 (CVPR 2025) | "spatial reasoning capabilities remain the primary bottleneck for MLLMs" |
| R3D / Metric-Bench | best RGB-only VLM 46.5 % vs 73.5 % with tools | arxiv.org/abs/2607.02921; 2609.25841 | "Metric reasoning is a critical and challenging task for Vision Language Models" |
| GPT-6 Astra BenchCAD | 95.9 % mean voxel IoU with tools vs GPT-5.6 Sol 83.3 %, Claude Fable 5.1 84.3 % (renders → CAD code); tolerances untested | VoxelMatters 11 Sep 2026; 3D Printing Industry; OfficeChai (secondary) | tolerances are "a separate question from the benchmark score" |
| GPT-6.1 Sol / Opus 5.5 docs | no 3D or measurement claim; Sol "Input modalities: text, image" | developers.openai.com gpt-6.1-sol; anthropic.com | "GPT-6.1 Sol delivers near-Astra performance at a lower cost for complex coding, computer use, and professional work." |
| Gemini 3 Pro / Robotics-ER 1.6 | spatial understanding, pointing; gauge reading 93 % with agentic vision; no "Astra" 3D claim | blog.google (Dec 2025); deepmind.google (Apr 2026) | "Gemini 3 Pro is our strongest spatial understanding model so far." |

## 8. Open items and what I could not confirm

- **USIBD LOA v3.1 text.** The spec PDF is member-only; the ranges and the 95 % statement come from two independent third-party reproductions. Download the spec before quoting it in a contract.
- **Hexagon/AICON scale-bar certificate uncertainty.** Not published; ask Hexagon for a DAkkS certificate if bars better than CHI's 0.1 mm are wanted.
- **Metashape API names flagged VERIFY in `metashape_pipeline.py`** (laser-scan import call, Gaussian-splat build/export, COLMAP camera export enum, mesh pick helper, calibration covariance access): check against the installed version's API reference before the first run.
- **Revit MCP servers: native vs DirectShape per tool.** Registry listings name wall/door/window tools but do not state whether each creates native elements; the round-trip test in Stage 09 is designed to catch this, and the server choice should be made after a one-room trial.
- **GPT-6 Astra availability and terms.** Staged rollout; "regulated customers could not use Astra" and "no on-premise option" at the time of the AEC Magazine piece; verify current API access before planning Astra-dependent stages.
- **Frontier-model dimensional accuracy.** No controlled test exists in any source found; the synthetic fixture in §1b is the way to produce one for this pipeline.
- **IFClite measurement tool.** Absent from README and code search at the time of checking; re-check before using it as the delivery viewer.
- **APS pricing.** The rate sheet changed from cloud credits to Flex tokens (2022) and Model Derivative pricing was announced to rise; confirm current rates.
- **Nothing in this plan was run end-to-end here.** The two scripts were syntax-checked and the predictor executed; Metashape, Revit, TLS instruments and the viewers were not exercised on this machine (no Metashape or Revit installed; Blender and Docker are).
