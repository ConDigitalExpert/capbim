import type { StageDef } from "./types";

export const STAGES: StageDef[] = [
  { id: "00", name: "Capture plan", yaml: "stage_00_plan", ladder: [], gate: "g0" },
  {
    id: "01",
    name: "Capture",
    yaml: "stage_01_capture",
    ladder: ["Re-shoot rejected frames: IS off, 1/250 s, full count"],
  },
  {
    id: "02",
    name: "On-site QC",
    yaml: "stage_02_onsite_qc",
    ladder: ["Re-shoot the coverage gaps", "Add targets on thin walls", "Add convergent tie frames"],
  },
  {
    id: "03",
    name: "Image preparation",
    yaml: "stage_03_image_prep",
    ladder: ["Drop blurred frames and rebuild the manifest"],
  },
  {
    id: "04",
    name: "Alignment",
    yaml: "stage_03_alignment",
    ladder: [
      "Keypoints 80k / tie points 10k",
      "Turn on guided matching",
      "Re-run at highest accuracy",
    ],
  },
  {
    id: "05",
    name: "Scale and datum",
    yaml: "stage_04_scale_and_datum",
    ladder: [
      "Disable markers beyond 3σ",
      "Match each bar ID to its certificate",
      "Refit extra distortion only if check bars improve",
    ],
  },
  {
    id: "06",
    name: "Dense mesh",
    yaml: "stage_05_dense_mesh_texture",
    ladder: ["Moderate depth filtering", "Depth maps at high", "Mask glass, mirrors and people"],
  },
  {
    id: "07",
    name: "Element extraction",
    yaml: "stage_06_geometry_extraction",
    ladder: ["Tighten the plane threshold", "Fit the mesh sample", "Seed the missed planes"],
  },
  { id: "08", name: "Attributes", yaml: "stage_07_semantics_attributes", ladder: [], gate: "g2" },
  {
    id: "09",
    name: "BIM authoring",
    yaml: "stage_08_bim_authoring",
    ladder: ["Regenerate IFC from the fitted elements"],
  },
  { id: "10", name: "Browser delivery", yaml: "stage_09_browser_delivery", ladder: [] },
  { id: "11", name: "Blind validation", yaml: "stage_10_blind_validation", ladder: [], gate: "g3" },
];

export function stageById(id: string): StageDef {
  const s = STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown stage ${id}`);
  return s;
}
