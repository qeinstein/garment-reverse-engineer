import type { GarmentIR, GarmentPanel } from '@garment-ir/core';

export interface CanvasTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const PALETTE = [
  '#3b82f6', // blue (front)
  '#f59e0b', // amber (back)
  '#10b981', // emerald
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
];

/**
 * Interactive 2D Pattern Canvas Renderer.
 * Draws 2D panel geometries, seam notches, edge labels, and confidence ratings.
 */
export class PatternCanvas2D {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private garmentIR: GarmentIR | null = null;
  private transform: CanvasTransform = { scale: 0.5, offsetX: 100, offsetY: 300 };
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get 2D canvas context');
    this.ctx = context;
    this.setupInteractions();
  }

  public setGarment(garmentIR: GarmentIR) {
    this.garmentIR = garmentIR;
    this.fitToScreen();
    this.render();
  }

  private setupInteractions() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.transform.offsetX += dx;
      this.transform.offsetY += dy;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.render();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.transform.scale *= zoomFactor;
      this.render();
    });
  }

  public fitToScreen() {
    if (!this.garmentIR || this.garmentIR.panels.length === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    let currentXOffset = 0;
    for (const panel of this.garmentIR.panels) {
      for (const edge of panel.boundary.edges) {
        const pts = edge.polyline_samples ?? [edge.start, edge.end];
        for (const pt of pts) {
          minX = Math.min(minX, pt.x + currentXOffset);
          maxX = Math.max(maxX, pt.x + currentXOffset);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
        }
      }
      currentXOffset += 450; // offset between panels
    }

    const w = maxX - minX || 500;
    const h = maxY - minY || 500;
    const padding = 60;

    const scaleX = (this.canvas.width - padding * 2) / w;
    const scaleY = (this.canvas.height - padding * 2) / h;
    this.transform.scale = Math.min(scaleX, scaleY, 1.2);
    this.transform.offsetX = padding - minX * this.transform.scale;
    this.transform.offsetY = this.canvas.height / 2;
  }

  public render() {
    const { ctx, canvas, transform } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid
    this.drawGrid();

    if (!this.garmentIR) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Upload 4 photos and click Reconstruct to view 2D sewing patterns.', canvas.width / 2, canvas.height / 2);
      return;
    }

    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, -transform.scale); // Invert Y so +Y is up

    let panelSpacing = 0;
    for (let pIdx = 0; pIdx < this.garmentIR.panels.length; pIdx++) {
      const panel = this.garmentIR.panels[pIdx];
      const color = PALETTE[pIdx % PALETTE.length];

      this.drawPanel(panel, panelSpacing, color);
      panelSpacing += 450; // Spacing in mm
    }

    ctx.restore();
  }

  private drawGrid() {
    const { ctx, canvas } = this;
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  private drawPanel(panel: GarmentPanel, offsetX: number, color: string) {
    const { ctx } = this;
    const edges = panel.boundary.edges;
    if (edges.length === 0) return;

    // 1. Draw panel fill & stroke
    ctx.beginPath();
    let firstPt = true;
    for (const edge of edges) {
      const pts = edge.polyline_samples ?? [edge.start, edge.end];
      for (const pt of pts) {
        if (firstPt) {
          ctx.moveTo(pt.x + offsetX, pt.y);
          firstPt = false;
        } else {
          ctx.lineTo(pt.x + offsetX, pt.y);
        }
      }
    }
    ctx.closePath();

    ctx.fillStyle = `${color}18`; // 10% opacity fill
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 / this.transform.scale;
    ctx.stroke();

    // 2. Draw panel label and confidence
    ctx.save();
    ctx.scale(1, -1); // restore text orientation
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.max(12, 14 / this.transform.scale)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${panel.name}`, offsetX + 150, 25);
    ctx.font = `${Math.max(10, 11 / this.transform.scale)}px Inter, sans-serif`;
    ctx.fillStyle = '#64748b';
    ctx.fillText(`Confidence: ${Math.round((panel.confidence ?? 0.85) * 100)}%`, offsetX + 150, 45);
    ctx.restore();
  }
}
