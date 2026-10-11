declare module "three" {
  export const WebGLRenderer: any;
  export const Scene: any;
  export const PerspectiveCamera: any;
  export const HemisphereLight: any;
  export const DirectionalLight: any;
  export const MeshStandardMaterial: any;
  export const Mesh: any;
  export const BoxGeometry: any;
  export const Plane: any;
  export const Vector3: any;
  export const PlaneGeometry: any;
  export const BufferAttribute: any;
  export const DoubleSide: any;
  export const Group: any;
  export const SphereGeometry: any;
  export const BufferGeometry: any;
  export const Line: any;
  export const LineBasicMaterial: any;
  export const Raycaster: any;
  export const Vector2: any;
}

declare module "three/examples/jsm/controls/OrbitControls.js" {
  export class OrbitControls {
    constructor(camera: any, element: HTMLElement);
    enableDamping: boolean;
    enableRotate: boolean;
    target: { set(x: number, y: number, z: number): void; copy(v: any): void };
    update(): void;
    dispose(): void;
  }
}
