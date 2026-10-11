export type SpaceClass = "S" | "M" | "L";
export type CameraId = "ff61_24mm" | "ff45_24mm" | "ff45_35mm" | "mf102_32mm";
export type TabId = "plan" | "pipeline" | "model" | "review" | "qc";
export type GateId = "g0" | "g2" | "g3";
export type GateState = "pending" | "approved" | "waived";

export type Faults = {
  stabilisationOn: boolean;
  slowShutter: boolean;
  plainWalls: boolean;
  barIdMismatch: boolean;
  lowImageCount: boolean;
};

export type JobSpec = {
  name: string;
  site: string;
  spaceClass: SpaceClass;
  camera: CameraId;
  lengthM: number;
  widthM: number;
  heightM: number;
  overlap: number;
  gsdTarget: number | null;
  iso: number;
  aperture: number;
  shutterS: number;
  targets: number;
  scalebars: number;
  heldoutBars: number;
  levelTargets: number;
  independentChecks: number;
  surveyControl: boolean;
  tls: boolean;
  splats: boolean;
  certUncertaintyMm: number;
  checksSealed: boolean;
  blurReject: number;
  clippedHighlight: number;
  imageOverride: number | null;
  faults: Faults;
};

export type Prediction = {
  class: SpaceClass;
  camera: CameraId;
  geometry_m: { L: number; W: number; H: number; Z_wall: number };
  standoff_m: number;
  standoff_clamped: boolean;
  pixel_pitch_um: number;
  scale_number: number;
  gsd_mm_at_walls: number;
  footprint_m: [number, number];
  station_spacing_m: number;
  perimeter_m: number;
  images_perimeter: number;
  images_total_est: number;
  fraser_precision_targets_mm: number;
  fraser_precision_tiepoints_mm: number;
  depth_precision_pair_mm: number;
  depth_precision_multiview_mm: number;
  surface_2x_gsd_mm: number;
  surface_rule_1to3xGSD_mm: [number, number];
  space_diagonal_m: number;
  scale_error_on_diagonal_mm_from_one_bar: number;
  note: string;
};

export type CheckResult = "pass" | "fail" | "warn" | "n/a";
export type Severity = "blocking" | "warning";
export type Operator = "<=" | "<" | ">=" | ">" | "==";

export type StageCheck = {
  id: string;
  metric: string;
  operator: Operator;
  threshold: number | boolean;
  value: number | boolean | null;
  result: CheckResult;
  severity: Severity;
  threshold_source: string;
  note?: string;
};

export type Artifact = {
  path: string;
  sha256: string;
  kind?: string;
  bytes?: number;
  sealed?: boolean;
};

export type StageReport = {
  job_id: string;
  stage_id: string;
  stage_name: string;
  space_class: SpaceClass;
  attempt: number;
  status: "pass" | "warn" | "fail" | "blocked" | "skipped";
  started_at: string;
  finished_at: string;
  software: { name: string; version: string; host: string }[];
  params: Record<string, string | number | boolean | null>;
  inputs: Artifact[];
  outputs: Artifact[];
  metrics: Record<string, number | string | boolean | null>;
  checks: StageCheck[];
  retry?: {
    allowed: boolean;
    ladder_step_next: number;
    ladder_max: number;
    param_changes: Record<string, string | number | boolean>;
    reason: string;
  };
  human_gate?: {
    required: boolean;
    id: GateId;
    summary: string;
    items: string[];
  };
  diagnosis: string;
};

export type ReviewItem = {
  id: string;
  elementId: string;
  elementName: string;
  attribute: string;
  opus: string;
  sol: string;
  confidence: number;
  images: [string, string];
  decision: string | null;
};

export type LogLine = { at: string; text: string };

export type CheckRow = {
  id: string;
  label: string;
  distanceM: number;
  residualMm: number | null;
};

export type Job = {
  id: string;
  createdAt: string;
  spec: JobSpec;
  reports: StageReport[];
  ladders: Record<string, number>;
  attempts: Record<string, number>;
  gates: Record<GateId, GateState>;
  gateNotes: Partial<Record<GateId, string>>;
  reviews: ReviewItem[];
  sealedHash: string | null;
  truths: { id: string; label: string; distanceM: number }[];
  residuals: number[] | null;
  unsealed: boolean;
  degraded: boolean;
  forcedStages: string[];
  signedBy: string | null;
  signedAt: string | null;
  log: LogLine[];
  specHashAtRun: string | null;
};

export type StageDef = {
  id: string;
  name: string;
  yaml: string;
  ladder: string[];
  gate?: GateId;
};
