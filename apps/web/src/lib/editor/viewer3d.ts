import * as THREE from 'three';
import type { GarmentIR } from '@garment-ir/core';

export class GarmentViewport3D {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private garmentGroup: THREE.Group;
  private animFrameId: number | null = null;
  private isMouseDown = false;
  private prevMouse = { x: 0, y: 0 };
  private rotation = { x: 0.1, y: 0.3 };
  private distance = 2.2;

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f172a');

    // 2. Camera
    const aspect = container.clientWidth / (container.clientHeight || 1);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 50);
    this.updateCamera();

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // 4. Lighting & Environment
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);

    const grid = new THREE.GridHelper(3, 30, 0x334155, 0x1e293b);
    grid.position.y = 0;
    this.scene.add(grid);

    // Avatar Reference Cylinder (Torso guide)
    const torsoGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.75, 24, 1, true);
    const torsoMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });
    const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
    torsoMesh.position.set(0, 1.05, 0);
    this.scene.add(torsoMesh);

    // 5. Garment Group
    this.garmentGroup = new THREE.Group();
    this.scene.add(this.garmentGroup);

    this.setupInteractions();
    this.animate();
  }

  public setGarment(garmentIR: GarmentIR) {
    // Clear previous garment geometry
    while (this.garmentGroup.children.length > 0) {
      const obj = this.garmentGroup.children[0];
      this.garmentGroup.remove(obj);
    }

    // Render panels in 3D
    const colors = [0x3b82f6, 0xf59e0b, 0x10b981, 0xec4899];

    for (let i = 0; i < garmentIR.panels.length; i++) {
      const panel = garmentIR.panels[i];
      const color = colors[i % colors.length];

      const trans = panel.placement_3d?.translation || [0, 1.0, i === 0 ? 0.14 : -0.14];
      const isFront = panel.category === 'body_front' || trans[2] >= 0;

      // Create curved surface panel representation
      const geom = new THREE.CylinderGeometry(
        0.19,
        0.17,
        0.58,
        24,
        1,
        true,
        isFront ? -Math.PI / 2.2 : Math.PI / 2 - 0.2,
        Math.PI / 1.1
      );

      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(trans[0], 1.05, trans[2] * 0.3);
      this.garmentGroup.add(mesh);
    }
  }

  private setupInteractions() {
    this.renderer.domElement.addEventListener('mousedown', (e) => {
      this.isMouseDown = true;
      this.prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isMouseDown) return;
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.rotation.y += dx * 0.01;
      this.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.rotation.x + dy * 0.01));
      this.prevMouse = { x: e.clientX, y: e.clientY };
      this.updateCamera();
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });

    this.renderer.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distance = Math.max(1.0, Math.min(5.0, this.distance + e.deltaY * 0.002));
      this.updateCamera();
    });

    window.addEventListener('resize', () => {
      if (!this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight || 1;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  private updateCamera() {
    const cy = Math.cos(this.rotation.y);
    const sy = Math.sin(this.rotation.y);
    const cx = Math.cos(this.rotation.x);
    const sx = Math.sin(this.rotation.x);

    const x = this.distance * cx * sy;
    const y = 1.05 + this.distance * sx;
    const z = this.distance * cx * cy;

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 1.05, 0);
  }

  private animate = () => {
    this.animFrameId = requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };

  public dispose() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
