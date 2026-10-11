import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { latestReport, predictionFor } from "@/lib/capbim/engine";
import { barsOf, bowMmFor, elementsOf, markersOf, roomOf, type ElementRec } from "@/lib/capbim/room";
import type { Job } from "@/lib/capbim/types";
import { Btn } from "./ui";

type Pt = { x: number; y: number; z: number };
type Tool = "orbit" | "distance" | "angle";

export function ModelView({ job }: { job: Job }) {
  const room = roomOf(job.spec);
  const elements = elementsOf(room);
  const [tool, setTool] = useState<Tool>("orbit");
  const [heat, setHeat] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showBars, setShowBars] = useState(true);
  const [hidden, setHidden] = useState<string[]>([]);
  const [isolate, setIsolate] = useState(false);
  const [selected, setSelected] = useState<string | null>("wall-s");
  const [points, setPoints] = useState<Pt[]>([]);
  const [section, setSection] = useState({ x: false, y: false, z: false, t: 0.55 });
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    setTool: (t: Tool) => void;
    setFlags: (f: { heat: boolean; markers: boolean; bars: boolean; hidden: string[]; isolate: boolean; selected: string | null }) => void;
    setSection: (s: { x: boolean; y: boolean; z: boolean; t: number }) => void;
    plan: () => void;
    focus: (id: string) => void;
  } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.localClippingEnabled = true;
    renderer.setClearColor(0x121410, 1);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 4000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const cx = room.L / 2;
    const cy = room.H * 0.45;
    const cz = room.W / 2;
    camera.position.set(cx + room.L * 0.85, room.H * 1.35, cz + room.W * 1.15);
    controls.target.set(cx, cy, cz);
    scene.add(new THREE.HemisphereLight(0xf0ebe1, 0x1b1e18, 1.05));
    const sun = new THREE.DirectionalLight(0xf0ebe1, 0.55);
    sun.position.set(room.L, room.H * 2, room.W);
    scene.add(sun);

    const mats: any[] = [];
    const meshes: any[] = [];
    const clipX = new THREE.Plane(new THREE.Vector3(-1, 0, 0), room.L);
    const clipY = new THREE.Plane(new THREE.Vector3(0, -1, 0), room.H);
    const clipZ = new THREE.Plane(new THREE.Vector3(0, 0, -1), room.W);

    const mat = (color: number, kind: string) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0 });
      m.userData.kind = kind;
      m.clippingPlanes = [];
      mats.push(m);
      return m;
    };
    const addBox = (id: string, x: number, y: number, z: number, dx: number, dy: number, dz: number, color: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(dx, 0.02), Math.max(dz, 0.02), Math.max(dy, 0.02)), mat(color, "bim"));
      mesh.position.set(x + dx / 2, z + dz / 2, y + dy / 2);
      mesh.userData = { id, kind: "bim" };
      scene.add(mesh);
      meshes.push(mesh);
    };
    const t = 0.12;
    addBox("floor", 0, 0, -0.08, room.L, room.W, 0.08, 0x2c2a26);
    addBox("ceiling", 0, 0, room.H, room.L, room.W, 0.06, 0x343830);
    const door = room.door;
    const win = room.window;
    addBox("wall-s", 0, -t, 0, door.x, t, room.H, 0x3c4238);
    addBox("wall-s", door.x + door.w, -t, 0, room.L - door.x - door.w, t, room.H, 0x3c4238);
    addBox("wall-s", door.x, -t, door.h, door.w, t, room.H - door.h, 0x3c4238);
    addBox("door-1", door.x, 0.02, 0, door.w, 0.05, door.h, 0x6a4632);
    addBox("wall-n", 0, room.W, 0, room.L, t, room.H, 0x3c4238);
    addBox("wall-w", -t, 0, 0, t, room.W, room.H, 0x454b40);
    const eastX = room.L;
    addBox("wall-e", eastX, 0, 0, t, win.y, room.H, 0x454b40);
    addBox("wall-e", eastX, win.y + win.w, 0, t, Math.max(0.05, room.W - win.y - win.w), room.H, 0x454b40);
    addBox("wall-e", eastX, win.y, 0, t, win.w, win.sill, 0x454b40);
    addBox("wall-e", eastX, win.y, win.sill + win.h, t, win.w, Math.max(0.05, room.H - win.sill - win.h), 0x454b40);
    addBox("window-1", eastX - 0.02, win.y, win.sill, 0.04, win.w, win.h, 0x6f8f9a);
    addBox("column-1", room.column.x, room.column.y, 0, room.column.w, room.column.d, room.H, 0x8d877c);

    const bow = bowMmFor(job.spec.spaceClass, job.spec.faults.plainWalls);
    const heatMesh = (id: string, w: number, h: number) => {
      const geo = new THREE.PlaneGeometry(w, h, 28, 14);
      const pos = geo.getAttribute("position");
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) / w + 0.5;
        const v = pos.getY(i) / h + 0.5;
        const mm = bow * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        const k = Math.min(1, Math.max(0, mm / 10));
        colors[i * 3] = 0.83;
        colors[i * 3 + 1] = 0.64 * (1 - k) + 0.4 * k;
        colors[i * 3 + 2] = 0.29 * (1 - k) + 0.31 * k;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
      m.clippingPlanes = [];
      mats.push(m);
      const mesh = new THREE.Mesh(geo, m);
      mesh.userData = { id, kind: "heat" };
      mesh.visible = false;
      scene.add(mesh);
      meshes.push(mesh);
      return mesh;
    };
    const south = heatMesh("wall-s", room.L, room.H);
    south.position.set(cx, room.H / 2, 0.02);
    const north = heatMesh("wall-n", room.L, room.H);
    north.position.set(cx, room.H / 2, room.W - 0.02);
    north.rotation.y = Math.PI;
    const floorH = heatMesh("floor", room.L, room.W);
    floorH.rotation.x = -Math.PI / 2;
    floorH.position.set(cx, 0.02, cz);

    const markerGroup = new THREE.Group();
    const markerMat = mat(0xd4a24a, "marker");
    const levelMat = mat(0xd4654f, "marker");
    for (const mk of markersOf(job.spec)) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(Math.min(0.06, room.L * 0.004), 10, 8), mk.kind === "level" ? levelMat : markerMat);
      s.position.set(mk.x, mk.z, mk.y);
      markerGroup.add(s);
    }
    scene.add(markerGroup);

    const barGroup = new THREE.Group();
    for (const bar of barsOf(job.spec)) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(bar.x1, 0.05, bar.y1), new THREE.Vector3(bar.x2, 0.05, bar.y2)]);
      barGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: bar.role === "check" ? 0x6f8f9a : 0xd4a24a })));
    }
    scene.add(barGroup);

    const measureGroup = new THREE.Group();
    scene.add(measureGroup);
    const pickMat = mat(0xf0ebe1, "pick");
    const live = { tool: "orbit" as Tool, points: [] as Pt[] };

    const paintMeasure = () => {
      while (measureGroup.children.length) {
        const child = measureGroup.children[0];
        measureGroup.remove(child);
        if (child instanceof THREE.Line || child instanceof THREE.Mesh) child.geometry?.dispose();
      }
      const pts = live.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      if (pts.length >= 2) {
        const linePts = live.tool === "angle" && pts[2] ? [pts[0]!, pts[1]!, pts[2]!] : pts.slice(0, 2);
        measureGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: 0xf0ebe1 })));
      }
      for (const p of pts) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), pickMat);
        dot.position.copy(p);
        measureGroup.add(dot);
      }
    };

    const applyFlags = (f: { heat: boolean; markers: boolean; bars: boolean; hidden: string[]; isolate: boolean; selected: string | null }) => {
      const hide = new Set(f.hidden);
      markerGroup.visible = f.markers;
      barGroup.visible = f.bars;
      for (const mesh of meshes) {
        const id = String(mesh.userData.id ?? "");
        if (mesh.userData.kind === "heat") {
          mesh.visible = f.heat && !hide.has(id);
          continue;
        }
        mesh.visible = !(hide.has(id) || (f.isolate && f.selected && id !== f.selected));
        const material = mesh.material as { emissive?: { set: (hex: number) => void } };
        material.emissive?.set(id === f.selected ? 0x3a2d12 : 0x000000);
      }
    };

    const applySection = (s: { x: boolean; y: boolean; z: boolean; t: number }) => {
      clipX.constant = room.L * s.t;
      clipY.constant = room.H * s.t;
      clipZ.constant = room.W * s.t;
      const planes = [s.x ? clipX : null, s.y ? clipY : null, s.z ? clipZ : null].filter((p) => p !== null);
      for (const m of mats) m.clippingPlanes = planes;
    };

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const cast = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObjects(meshes, false).find((hit: { object: { visible: boolean; userData: { id?: string } }; point: Pt }) => hit.object.visible) ?? null;
    };
    const onDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };
    const onUp = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return;
      const hit = cast(ev);
      if (!hit) return;
      if (live.tool === "orbit") {
        setSelected(String(hit.object.userData.id ?? ""));
        return;
      }
      const p = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
      const cap = live.tool === "angle" ? 3 : 2;
      live.points = live.points.length >= cap ? [p] : [...live.points, p];
      setPoints(live.points.map((q) => ({ ...q })));
      paintMeasure();
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    api.current = {
      setTool: (next) => {
        live.tool = next;
        controls.enableRotate = next === "orbit";
        if (next === "orbit") {
          live.points = [];
          setPoints([]);
          paintMeasure();
        }
      },
      setFlags: applyFlags,
      setSection: applySection,
      plan: () => {
        camera.position.set(cx, Math.max(room.H * 4, room.L), cz + 0.01);
        controls.target.set(cx, 0, cz);
      },
      focus: (id) => {
        const mesh = meshes.find((m) => m.userData.id === id && m.userData.kind === "bim");
        if (mesh) controls.target.copy(mesh.position);
      },
    };
    applyFlags({ heat: false, markers: true, bars: true, hidden: [], isolate: false, selected: "wall-s" });

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj: { geometry?: { dispose: () => void } }) => {
        obj.geometry?.dispose();
      });
      for (const m of mats) m.dispose();
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
      api.current = null;
    };
  }, [job.id, job.spec, room.H, room.L, room.W, room.column.d, room.column.w, room.column.x, room.column.y, room.door.h, room.door.w, room.door.x, room.window.h, room.window.sill, room.window.w, room.window.y]);

  useEffect(() => {
    api.current?.setTool(tool);
  }, [tool]);
  useEffect(() => {
    api.current?.setFlags({ heat, markers: showMarkers, bars: showBars, hidden, isolate, selected });
  }, [heat, showMarkers, showBars, hidden, isolate, selected]);
  useEffect(() => {
    api.current?.setSection(section);
  }, [section]);

  const element = elements.find((item) => item.id === selected) ?? null;
  const pred = predictionFor(job.spec);
  const blind = latestReport(job, "11");
  const p95 = blind?.checks.find((c) => c.id === "p95");
  const measure = describe(tool, points);

  return (
    <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Btn kind={tool === "orbit" ? "primary" : "ghost"} onClick={() => setTool("orbit")}>
            Orbit
          </Btn>
          <Btn kind={tool === "distance" ? "primary" : "ghost"} data-testid="tool-distance" onClick={() => setTool("distance")}>
            Distance
          </Btn>
          <Btn kind={tool === "angle" ? "primary" : "ghost"} onClick={() => setTool("angle")}>
            Angle
          </Btn>
          <Btn kind={heat ? "primary" : "ghost"} onClick={() => setHeat((v) => !v)}>
            Deviation
          </Btn>
          <Btn onClick={() => api.current?.plan()}>Plan</Btn>
          <Btn kind={showMarkers ? "primary" : "ghost"} onClick={() => setShowMarkers((v) => !v)}>
            Targets
          </Btn>
          <Btn kind={showBars ? "primary" : "ghost"} onClick={() => setShowBars((v) => !v)}>
            Bars
          </Btn>
        </div>
        <div ref={host} className="h-[28rem] w-full overflow-hidden rounded-md border border-line bg-bg md:h-[36rem]" data-testid="room-canvas" />
        <div className="grid gap-3 md:grid-cols-3">
          <Section label="Clip X" on={section.x} t={section.t} onToggle={() => setSection({ ...section, x: !section.x })} onT={(n) => setSection({ ...section, t: n })} />
          <Section label="Clip Y" on={section.y} t={section.t} onToggle={() => setSection({ ...section, y: !section.y })} onT={(n) => setSection({ ...section, t: n })} />
          <Section label="Clip Z" on={section.z} t={section.t} onToggle={() => setSection({ ...section, z: !section.z })} onT={(n) => setSection({ ...section, t: n })} />
        </div>
        <p className="text-sm text-muted">
          Origin is the south-west floor corner, Z up, metres. {tool === "orbit" ? "Click a face to select it." : "Orbit is paused. Click the surface."} Deviation colour is the bow the extractor used ({bowMmFor(job.spec.spaceClass, job.spec.faults.plainWalls).toFixed(1)} mm peak), not a scan.
        </p>
      </div>
      <aside className="flex flex-col gap-4">
        <div className="rounded-md border border-line bg-surface p-4">
          <h2 className="text-sm font-medium">Measurement</h2>
          <p className="num mt-2 text-2xl">{measure.label}</p>
          <p className="mt-1 text-sm text-muted">{measure.detail}</p>
          <p className="chip mt-3 border-brass text-brass">
            {p95 && typeof p95.value === "number"
              ? `p95 ${p95.value} mm vs ±${p95.threshold} mm · ${p95.result} · synthetic`
              : `Sealed · 2×GSD estimate ${pred.surface_2x_gsd_mm.toFixed(2)} mm`}
          </p>
        </div>
        <ElementCard element={element} job={job} />
        <div className="rounded-md border border-line p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Spatial tree</h2>
            <Btn onClick={() => setIsolate((v) => !v)}>{isolate ? "Show all" : "Isolate"}</Btn>
          </div>
          <ul className="flex flex-col">
            {elements.map((item) => (
              <li key={item.id} className="flex items-center gap-2 border-b border-line py-1 last:border-b-0">
                <button
                  type="button"
                  className={`min-h-11 flex-1 text-left text-sm ${selected === item.id ? "text-brass" : ""}`}
                  onClick={() => {
                    setSelected(item.id);
                    api.current?.focus(item.id);
                  }}
                >
                  {item.name}
                </button>
                <button
                  type="button"
                  className="min-h-11 px-2 text-xs text-muted"
                  onClick={() => setHidden((cur) => (cur.includes(item.id) ? cur.filter((id) => id !== item.id) : [...cur, item.id]))}
                >
                  {hidden.includes(item.id) ? "Show" : "Hide"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function describe(tool: Tool, points: Pt[]): { label: string; detail: string } {
  if (tool === "orbit" || points.length < 2) {
    return { label: "—", detail: tool === "angle" ? "Three clicks. The angle is taken at the middle point." : "Two clicks for a distance on the face." };
  }
  const a = points[0]!;
  const b = points[1]!;
  if (tool === "distance" || points.length < 3) {
    const mm = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 1000;
    return { label: `${mm.toFixed(1)} mm`, detail: "Snapped to the face. Same geometry as the IFC faces." };
  }
  const c = points[2]!;
  const v1 = new THREE.Vector3(a.x - b.x, a.y - b.y, a.z - b.z).normalize();
  const v2 = new THREE.Vector3(c.x - b.x, c.y - b.y, c.z - b.z).normalize();
  const deg = (Math.acos(Math.min(1, Math.max(-1, v1.dot(v2)))) * 180) / Math.PI;
  return { label: `${deg.toFixed(1)}°`, detail: "Angle at the second click." };
}

function ElementCard({ element, job }: { element: ElementRec | null; job: Job }) {
  if (!element) return <p className="text-sm text-muted">Nothing selected.</p>;
  const frames = [0, 1].map((i) => `IMG_${String(140 + element.id.length * 17 + i * 11).padStart(4, "0")}`);
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <h2 className="font-medium">{element.name}</h2>
      <p className="text-sm text-muted">{element.ifcType}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted">Quantity</dt>
        <dd>{element.quantity}</dd>
        <dt className="text-muted">Material</dt>
        <dd>{element.material}</dd>
        <dt className="text-muted">Parent</dt>
        <dd>{element.parent}</dd>
      </dl>
      <h3 className="mt-4 text-xs tracking-wide text-muted">Pset_CaptureEvidence</h3>
      <p className="mt-1 text-sm">Class {job.spec.spaceClass}. Synthetic fixture. Two frames required.</p>
      <ul className="mt-2 flex gap-2">
        {frames.map((id) => (
          <li key={id} className="num rounded-md border border-line px-2 py-1 text-xs text-muted">
            {id}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ label, on, t, onToggle, onT }: { label: string; on: boolean; t: number; onToggle: () => void; onT: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-2">
        <input type="checkbox" checked={on} onChange={onToggle} />
        {label}
      </span>
      <input type="range" min={0.15} max={0.95} step={0.01} value={t} disabled={!on} onChange={(e) => onT(Number(e.target.value))} />
    </label>
  );
}
