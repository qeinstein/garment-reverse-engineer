import type { GarmentIR } from '@garment-ir/core';
import {
  reconstructGarment,
  type ViewLabel,
  type ViewImageInput,
} from './lib/reconstruction/hf-client.js';
import { PatternCanvas2D } from './lib/editor/viewer2d.js';
import { GarmentViewport3D } from './lib/editor/viewer3d.js';
import { downloadSeamerPattern, downloadGarmentIR } from './lib/editor/exportSeamer.js';

// State
const viewsMap = new Map<ViewLabel, ViewImageInput>();
let currentGarmentIR: GarmentIR | null = null;
let canvas2D: PatternCanvas2D | null = null;
let viewport3D: GarmentViewport3D | null = null;

// DOM Elements
const btnReconstruct = document.getElementById('btnReconstruct') as HTMLButtonElement;
const btnLoadSample = document.getElementById('btnLoadSample') as HTMLButtonElement;
const btnExportSeamer = document.getElementById('btnExportSeamer') as HTMLButtonElement;
const btnExportIR = document.getElementById('btnExportIR') as HTMLButtonElement;
const selectVariant = document.getElementById('selectVariant') as HTMLSelectElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;
const statusDot = document.getElementById('statusDot') as HTMLDivElement;
const metricBox = document.getElementById('metricBox') as HTMLDivElement;
const lblInferenceTime = document.getElementById('lblInferenceTime') as HTMLElement;
const lblPanelsCount = document.getElementById('lblPanelsCount') as HTMLElement;
const lblSeamsCount = document.getElementById('lblSeamsCount') as HTMLElement;
const jsonDisplay = document.getElementById('jsonDisplay') as HTMLElement;
const seamsList = document.getElementById('seamsList') as HTMLDivElement;

const viewCards = ['front', 'right', 'back', 'left'] as const;

function init() {
  // 1. Initialize 2D Pattern Canvas
  const canvasEl = document.getElementById('canvas2d') as HTMLCanvasElement;
  if (canvasEl) {
    canvas2D = new PatternCanvas2D(canvasEl);
  }

  // 2. Initialize 3D Viewport
  const container3d = document.getElementById('container3d') as HTMLElement;
  if (container3d) {
    viewport3D = new GarmentViewport3D(container3d);
  }

  // 3. Setup File Uploads for 4 Viewpoints
  for (const label of viewCards) {
    const card = document.getElementById(`card${capitalize(label)}`) as HTMLElement;
    const fileInput = document.getElementById(`file${capitalize(label)}`) as HTMLInputElement;

    card.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleFileSelect(label, file, card);
      }
    });
  }

  // 4. Sample Button
  btnLoadSample.addEventListener('click', loadSampleSkirt);

  // 5. Reconstruct Action
  btnReconstruct.addEventListener('click', handleReconstruct);

  // 6. Export Actions
  btnExportSeamer.addEventListener('click', () => {
    if (currentGarmentIR) downloadSeamerPattern(currentGarmentIR);
  });
  btnExportIR.addEventListener('click', () => {
    if (currentGarmentIR) downloadGarmentIR(currentGarmentIR);
  });

  // 7. Tabs Navigation
  setupTabs();
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function handleFileSelect(label: ViewLabel, file: File, card: HTMLElement) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target?.result as string;
    viewsMap.set(label, { label, file, dataUrl });

    // Update card UI
    let img = card.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      card.appendChild(img);
    }
    img.src = dataUrl;
    card.classList.add('filled');

    checkReadyState();
  };
  reader.readAsDataURL(file);
}

function checkReadyState() {
  const isReady = viewCards.every((lbl) => viewsMap.has(lbl));
  btnReconstruct.disabled = !isReady;
  if (isReady && !btnReconstruct.disabled) {
    statusText.textContent = 'All 4 views loaded. Ready to reconstruct.';
  }
}

async function loadSampleSkirt() {
  statusText.textContent = 'Loading sample pencil skirt views...';

  const mockColors: Record<ViewLabel, string> = {
    front: '#3b82f6',
    right: '#10b981',
    back: '#f59e0b',
    left: '#8b5cf6',
  };

  for (const label of viewCards) {
    const canvas = document.createElement('canvas');
    canvas.width = 518;
    canvas.height = 518;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, 518, 518);
    ctx.fillStyle = mockColors[label];
    ctx.fillRect(160, 100, 198, 320);

    const dataUrl = canvas.toDataURL('image/png');
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `${label}.png`, { type: 'image/png' });

    const card = document.getElementById(`card${capitalize(label)}`) as HTMLElement;
    handleFileSelect(label, file, card);
  }

  statusText.textContent = 'Sample pencil skirt loaded. Click Reconstruct Garment.';
}

async function handleReconstruct() {
  const views = Array.from(viewsMap.values());
  if (views.length !== 4) return;

  btnReconstruct.disabled = true;
  statusDot.className = 'status-dot active';
  statusText.textContent = 'Submitting to Hugging Face ZeroGPU Space...';

  // State progression
  setTimeout(() => {
    if (statusDot.classList.contains('active')) {
      statusText.textContent = 'ZeroGPU allocated. Running ReWeaver feed-forward inference (~3.5s)...';
    }
  }, 1000);

  const result = await reconstructGarment(views, {
    variant: selectVariant.value as 'GCD_ori' | 'tileable',
  });

  if (result.status === 'success' && result.garmentIR) {
    currentGarmentIR = result.garmentIR;
    statusDot.className = 'status-dot';
    statusText.textContent = 'Reconstruction complete. 2D patterns & 3D placement ready.';

    // Populate Visualizers
    canvas2D?.setGarment(currentGarmentIR);
    viewport3D?.setGarment(currentGarmentIR);

    // Populate Seams
    renderSeams(currentGarmentIR);

    // Populate JSON
    jsonDisplay.textContent = JSON.stringify(currentGarmentIR, null, 2);

    // Enable Exports
    btnExportSeamer.disabled = false;
    btnExportIR.disabled = false;

    // Metrics
    metricBox.style.display = 'block';
    lblInferenceTime.textContent = `${result.timings.totalSeconds.toFixed(2)}s`;
    lblPanelsCount.textContent = `${currentGarmentIR.panels.length}`;
    lblSeamsCount.textContent = `${currentGarmentIR.seams.length}`;
  } else {
    statusDot.className = 'status-dot error';
    statusText.textContent = `Failed: ${result.error?.message || 'Unknown error'}`;
  }

  btnReconstruct.disabled = false;
}

function renderSeams(garmentIR: GarmentIR) {
  seamsList.innerHTML = '';

  if (garmentIR.seams.length === 0) {
    seamsList.innerHTML = '<div style="color: var(--text-muted);">No seams derived.</div>';
    return;
  }

  for (const seam of garmentIR.seams) {
    const card = document.createElement('div');
    card.style.background = '#1e293b';
    card.style.padding = '0.75rem';
    card.style.borderRadius = '6px';
    card.style.display = 'flex';
    card.style.justifyContent = 'space-between';
    card.style.alignItems = 'center';

    const pA = seam.edges_a[0]?.panel_id || 'Unknown';
    const pB = seam.edges_b[0]?.panel_id || 'Unknown';
    const conf = Math.round((seam.confidence ?? 0.8) * 100);

    card.innerHTML = `
      <div>
        <strong style="color: #38bdf8;">${seam.id}</strong>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
          ${pA} &harr; ${pB} (Type: ${seam.seam_type || 'plain'})
        </div>
      </div>
      <span class="badge" style="color: ${conf > 90 ? '#10b981' : '#f59e0b'};">
        ${conf}% Conf
      </span>
    `;
    seamsList.appendChild(card);
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      const targetId = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach((tc) => {
        (tc as HTMLElement).style.display = tc.id === targetId ? 'flex' : 'none';
      });

      if (targetId === 'tab2d') {
        canvas2D?.fitToScreen();
        canvas2D?.render();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
