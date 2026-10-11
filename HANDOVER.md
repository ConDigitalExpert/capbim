# Capbim handover for Grok Bot

You own this product end to end. Read this file before changing code. The GitHub repo is the source of truth, not chat memory.

- Repo: https://github.com/ConDigitalExpert/capbim
- Branch: `main`
- Owner: ConDigitalExpert
- Product name: Capbim
- What it is: a browser desk for planning a photogrammetry capture, running QC gates, measuring a parametric room, reviewing disputed attributes, and signing a rehearsal accuracy statement.

## Facts, inferences, and limits

Facts in the repo:

- The running app is a TanStack Start site. Jobs live in the browser (`localStorage` key `capbim-jobs-v2`). There is no job database and no Metashape process.
- Stages 01–11 produce stage reports by a deterministic synthetic engine in `src/lib/capbim/engine.ts`. The numbers obey `src/lib/capbim/thresholds.ts`. They are not a survey.
- The 3D view is real three.js. Walls, openings, markers, and scale bars are built from the job dimensions. Measurements are raycast distances on that mesh, not distances from a point cloud.
- A signed statement is a rehearsal. The UI must keep saying it is not a certificate.
- `attachments/` holds the original spec: `PLAN-v2.md`, `qc-thresholds.yaml`, `stage-report.schema.json`, `predict_precision.py`, `metashape_pipeline.py`, `TASKS.md`. The Python Metashape script is a skeleton. Its API names were marked VERIFY and it is not wired to the app.

Inferences, do not treat as measured:

- Fraser / GSD numbers in `src/lib/capbim/predict.ts` match the planning math in `attachments/predict_precision.py` (pixel pitch, scale number, GSD, station spacing, Fraser `q * S * sigma / sqrt(k)`). They leave out systematic error. The predictor says so.
- Seed sites (Milton yard office, North wing, Assembly hall) are fixtures, not live jobs.

Already done:

- Desk, five workspace tabs, twelve stages, three human gates, retry ladders, three seeded jobs, model tools listed in `FEATURES`, downloads, GitHub publish of `main`.

Not done, and do not pretend otherwise:

- No headless Metashape, COLMAP, Revit, or IFC schema validator.
- IFC and glTF downloads are generated text/geometry for the parametric room, not an authored BIM exchange that would pass buildingSMART certification.
- No offline service worker bundle, no photo files behind the photo lookup (stations are labels), no TLS fusion, no Gaussian splats.
- No auth gate on the desk. The repo still contains the app-builder auth scaffold. Leave it unless a task is about auth.

Waiting on the user before you do them:

- Connecting a real capture folder, Metashape, or a survey instrument.
- Publishing, emailing, or messaging anyone about this product.
- Changing a threshold number. Thresholds are read-only in the UI on purpose.

## How to run

```bash
git clone https://github.com/ConDigitalExpert/capbim.git
cd capbim
npm install
npm run dev
```

Dev server: Vite on `0.0.0.0:8080` via `node scripts/with-app-env.mjs`. Do not switch frameworks. `@tanstack/react-start` must stay on `^1.168.60` or newer (CVE-2026-102989). Stack already in `package.json`: Tailwind v4, Zustand, three `^0.186.1`, lucide-react. Do not add a heavy 3D or UI library.

Routes:

- `/` desk, `src/routes/index.tsx` → `src/components/desk.tsx`
- `/job/$jobId` workspace, `src/routes/job.$jobId.tsx` → `src/components/workspace.tsx`

Tabs: Plan, Pipeline, Model, Review, QC.

## Seeded jobs

Created by `seedJobs()` in `src/lib/capbim/store.ts`.

| id | name | class | why it exists |
|---|---|---|---|
| `mil-214` | Room 214, Milton yard office | S, 6×4×2.8 m, clean | Happy path. Approve the plan, run the ladder, measure, sign. |
| `gallery-b` | Gallery B, North wing | M, 18×10×3.6 m | Faults `plainWalls` and `barIdMismatch`. Expect scale/dense trouble until the ladder clears the bar IDs. |
| `hall-north` | North hall, Assembly hall | L, 60×40×10 m | Class L with `surveyControl: false`. Stage 00 fails on survey only. Waive or turn control on. Do not silently pass it. |

## Pipeline the code actually implements

Stage ids in the UI are `00`–`11` (`src/lib/capbim/stages.ts`). Each stage points at a YAML key that matches `THRESHOLDS`.

| UI | Name | Threshold key | Gate | Retry ladder |
|---|---|---|---|---|
| 00 | Capture plan | `stage_00_plan` | G0 approve plan | none |
| 01 | Capture | `stage_01_capture` | | Re-shoot: IS off, 1/250 s, full count |
| 02 | On-site QC | `stage_02_onsite_qc` | | Re-shoot gaps, targets on thin walls, convergent ties |
| 03 | Image preparation | `stage_03_image_prep` | | Drop blurred frames |
| 04 | Alignment | `stage_03_alignment` | | 80k/10k, guided matching, highest accuracy |
| 05 | Scale and datum | `stage_04_scale_and_datum` | | Disable 3σ markers, match bar IDs, extra distortion only if check bars improve |
| 06 | Dense mesh | `stage_05_dense_mesh_texture` | | Moderate filter, high depth maps, mask glass |
| 07 | Element extraction | `stage_06_geometry_extraction` | | Tighten plane threshold, fit sample, seed missed planes |
| 08 | Attributes | `stage_07_semantics_attributes` | G2 review queue | none |
| 09 | BIM authoring | `stage_08_bim_authoring` | | Regenerate IFC from fitted elements |
| 10 | Browser delivery | `stage_09_browser_delivery` | | none |
| 11 | Blind validation | `stage_10_blind_validation` | G3 sign or hold | none |

`nextAction()` in `engine.ts` is the only legal cursor: stale spec, unapproved G0, next unrun stage, review queue, survey-only failure, next ladder step, exhausted ladder, or done. Spec edits after a run set `specHashAtRun` mismatch and the job goes stale until reset.

Faults (`JobSpec.faults`): `stabilisationOn`, `slowShutter`, `plainWalls`, `barIdMismatch`, `lowImageCount`. `applyRetry` clears the capture faults on stage 01 ladder step 1, and clears `barIdMismatch` on stage 05 ladder step 2. Other ladder steps change reported metrics inside `buildChecks`, not the spec.

Checks are pure: `check()` in `src/lib/capbim/checks.ts` returns pass, fail, warn, or n/a. A blocking fail fails the stage. Warnings warn. Stage 08 stays blocked until every review item has a decision.

Human gates:

- G0 after a passing plan, or when the only stage-00 failure is `survey` (large class without control). Approve or waive with a note. Waive is not a pass of the metric.
- G2 is the review queue, not a rubber stamp. Default disputes are door handing (0.62, Opus vs Sol) and window type. Evidence images are names (`IMG_0144`), not files.
- G3 signs with a person's name. `sign()` must refuse when residuals are missing, unsealed, or the validation stage did not pass. The statement text comes from `accuracyText()` in `exports.ts`.

Blind checks: `designTruths()` in `room.ts` builds distances from the room. Residuals are drawn once, hashed, and sealed. Unsealing early sets `unsealed` and the statement must say the validation was opened early. Class L with TLS uses the hybrid limits on `stage_10_blind_validation.L_hybrid` (tighter than plain L). `tls` and `splats` are flags only.

RNG is `mulberry32` plus Box-Muller, seeded from the job id and stage. Same job and ladder step must reproduce the same report.

## Model

`src/components/model-view.tsx` owns the canvas. three.js is imported there, not in route modules that run on the server.

`FEATURES` in `engine.ts` is the contract:

- Tree with isolate and hide. Selection on BIM boxes and the mesh.
- Property panel, `Pset_CaptureEvidence`.
- Distance and angle, surface snap, millimetres, accuracy badge from the latest relevant report. The badge is the represented accuracy, not the pixel length of the measurement.
- Section planes X, Y, Z plus a plan camera. Clip constant is `t` (default 0.55).
- Mesh layer and a ±10 mm deviation ramp from `bowMmFor()` (worse when `plainWalls`).
- Photo lookup lists station names that see the element.
- Markers (`markersOf`) and scale bars (`barsOf`) in local coordinates. Y in the data is depth; the view maps it to three.js Z.
- QC tab: stage table, residuals, provenance (`src/components/qc-view.tsx`).
- Downloads in `src/lib/capbim/exports.ts`: job YAML, IFC text, glTF, point-sample CSV, validation JSON, accuracy statement.

Room geometry is `roomOf()`: floor, ceiling, wall segments around one door and one window, a column. Not a scanned mesh.

## File map

Touch Capbim only under these paths unless the task is the app shell.

- `src/lib/capbim/types.ts` — job, spec, report, review
- `src/lib/capbim/thresholds.ts` — the numbers. Keep them aligned with `attachments/qc-thresholds.yaml`
- `src/lib/capbim/stages.ts` — order, names, ladders, gates
- `src/lib/capbim/predict.ts` — cameras and Fraser/GSD
- `src/lib/capbim/checks.ts` — comparator
- `src/lib/capbim/engine.ts` — reports, gates, ladders, `nextAction`
- `src/lib/capbim/room.ts` — geometry, markers, bars, truths
- `src/lib/capbim/store.ts` — Zustand, hydrate, seeds
- `src/lib/capbim/exports.ts` — downloads
- `src/lib/capbim/hash.ts`, `format.ts`
- `src/components/desk.tsx`, `workspace.tsx`, `plan-view.tsx`, `pipeline-view.tsx`, `model-view.tsx`, `review-view.tsx`, `qc-view.tsx`, `checks.tsx`, `ui.tsx`
- `src/styles.css` — visual system
- `attachments/` — do not rewrite the plan to match a shortcut in the app. If code and YAML disagree, the YAML wins and the code should be fixed.

## Visual and writing rules

Already in the UI. Do not restyle it into a generic dashboard.

- Dark field `#121410`, warm stone type, amber marks. No purple gradient, no Inter, no card-inside-card, no three equal feature cards.
- Name the limitation in the interface: synthetic metrics, rehearsal statement.
- When you talk to Mohamed, stay under about 200 words, plain language, no jargon pile-up. He is a developer. Do not explain what Git or React is.

## Boundaries

- Do not send email, post, or open a pull request to a different repo without an explicit yes.
- Do not put credentials in the repo. `.gitignore` already drops `.env`, `node_modules`, `.vercel`, `dist`, `.project_id`.
- Do not claim a stage "ran in Metashape" or that a residual is a measured site residual.
- Do not weaken a gate so a demo looks green. Gallery B and North hall are supposed to fail until the user acts.
- Continue on `main` of `ConDigitalExpert/capbim` unless he asks for a branch.

## First action when you pick this up

1. Clone the repo and run `npm run dev`.
2. Open Room 214, Gallery B, and North hall. Confirm the three outcomes above.
3. Reply with what you verified and the one next gap you recommend. Do not start that gap until he agrees.
