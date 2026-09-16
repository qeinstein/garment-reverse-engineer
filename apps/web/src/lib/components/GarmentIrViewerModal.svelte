<script lang="ts">
  import { onMount } from 'svelte';
  import type { GarmentIR } from '@garment-ir/core';
  import { PatternCanvas2D as GarmentIrCanvas2D } from '$lib/editor/viewer2d';

  interface Props {
    garmentIR: GarmentIR;
    onclose: () => void;
  }

  let { garmentIR, onclose }: Props = $props();

  let canvasEl: HTMLCanvasElement | null = $state(null);
  let renderer: GarmentIrCanvas2D | null = null;
  let activeTab = $state<'canvas' | 'panels' | 'seams' | 'json'>('canvas');

  onMount(() => {
    if (canvasEl) {
      canvasEl.width = canvasEl.parentElement?.clientWidth || 700;
      canvasEl.height = 420;
      renderer = new GarmentIrCanvas2D(canvasEl);
      renderer.setGarment(garmentIR);
    }
  });

  function downloadJson() {
    const blob = new Blob([JSON.stringify(garmentIR, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${garmentIR.metadata?.name || 'garment'}_ir.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleResetView() {
    if (renderer) {
      renderer.fitToScreen();
      renderer.render();
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} />

<div class="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="modal-ir-title">
  <div class="bg-base-100 rounded-xl shadow-2xl max-w-4xl w-full border border-base-300 overflow-hidden flex flex-col max-h-[92vh] my-auto">
    <!-- Header -->
    <div class="px-4 sm:px-6 py-3 sm:py-4 border-b border-base-300 flex items-center justify-between bg-base-200/50 shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-2xl shrink-0">📊</span>
        <div class="min-w-0">
          <h3 id="modal-ir-title" class="font-bold text-base sm:text-lg leading-tight font-lexend truncate">
            GarmentIR Reconstruction Diagnostics
          </h3>
          <p class="text-xs opacity-60 truncate">
            {garmentIR.metadata?.name || 'Garment'} · {garmentIR.panels.length} panels · {garmentIR.seams?.length || 0} seams · Schema {garmentIR.schema_version || '0.1.0'}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn btn-xs btn-outline gap-1" onclick={downloadJson} title="Download raw GarmentIR JSON">
          <span>💾</span> Download JSON
        </button>
        <button class="btn btn-ghost btn-sm btn-circle shrink-0" onclick={onclose} aria-label="Close dialog">✕</button>
      </div>
    </div>

    <!-- Tab Bar -->
    <div class="flex border-b border-base-300 px-4 sm:px-6 bg-base-200/30 shrink-0 text-xs">
      <button
        class="py-2.5 px-4 font-semibold border-b-2 transition-colors {activeTab === 'canvas' ? 'border-primary text-primary' : 'border-transparent opacity-60 hover:opacity-100'}"
        onclick={() => { activeTab = 'canvas'; setTimeout(handleResetView, 50); }}
      >
        2D Pattern Canvas
      </button>
      <button
        class="py-2.5 px-4 font-semibold border-b-2 transition-colors {activeTab === 'panels' ? 'border-primary text-primary' : 'border-transparent opacity-60 hover:opacity-100'}"
        onclick={() => (activeTab = 'panels')}
      >
        Panels & Confidence ({garmentIR.panels.length})
      </button>
      <button
        class="py-2.5 px-4 font-semibold border-b-2 transition-colors {activeTab === 'seams' ? 'border-primary text-primary' : 'border-transparent opacity-60 hover:opacity-100'}"
        onclick={() => (activeTab = 'seams')}
      >
        Seams ({garmentIR.seams?.length || 0})
      </button>
      <button
        class="py-2.5 px-4 font-semibold border-b-2 transition-colors {activeTab === 'json' ? 'border-primary text-primary' : 'border-transparent opacity-60 hover:opacity-100'}"
        onclick={() => (activeTab = 'json')}
      >
        Raw JSON
      </button>
    </div>

    <!-- Body -->
    <div class="p-4 sm:p-6 overflow-y-auto flex-1 min-h-[380px]">
      {#if activeTab === 'canvas'}
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs text-base-content/70">
            <span>Drag to pan · Scroll wheel to zoom · Panel labels display neural network confidence</span>
            <button class="btn btn-xs btn-ghost" onclick={handleResetView}>Reset View</button>
          </div>
          <div class="w-full bg-base-200/50 rounded-lg border border-base-300 overflow-hidden flex items-center justify-center">
            <canvas bind:this={canvasEl} class="cursor-grab active:cursor-grabbing w-full h-[420px]"></canvas>
          </div>
        </div>

      {:else if activeTab === 'panels'}
        <div class="space-y-3 text-xs">
          {#each garmentIR.panels as panel, idx}
            <div class="p-3 bg-base-200/40 rounded-lg border border-base-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-sm">{panel.name || panel.id}</span>
                  <span class="badge badge-sm badge-outline opacity-70">ID: {panel.id}</span>
                  <span class="badge badge-sm badge-info font-medium">
                    Confidence: {Math.round((panel.confidence ?? 0.85) * 100)}%
                  </span>
                </div>
                <div class="opacity-60 text-[11px]">
                  Material: {panel.material_id} · Edges: {panel.boundary.edges.length}
                </div>
              </div>
              <div class="text-right font-mono text-[11px] opacity-70 bg-base-100 px-2 py-1 rounded border border-base-300">
                3D pos: [{panel.translation?.map((v) => v.toFixed(1)).join(', ') ?? '0, 0, 0'}]
              </div>
            </div>
          {/each}
        </div>

      {:else if activeTab === 'seams'}
        <div class="space-y-2 text-xs">
          {#if !garmentIR.seams || garmentIR.seams.length === 0}
            <p class="opacity-60">No seams defined in this garment.</p>
          {:else}
            {#each garmentIR.seams as seam, idx}
              <div class="p-3 bg-base-200/40 rounded-lg border border-base-300 flex items-center justify-between">
                <div>
                  <span class="font-semibold">{seam.id || `Seam #${idx + 1}`}</span>
                  <div class="opacity-70 mt-1 flex items-center gap-2">
                    <span class="badge badge-xs badge-ghost">{seam.edges_a.map((e) => `${e.panel_id}:${e.edge_id}`).join(', ')}</span>
                    <span>⟷</span>
                    <span class="badge badge-xs badge-ghost">{seam.edges_b.map((e) => `${e.panel_id}:${e.edge_id}`).join(', ')}</span>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>

      {:else if activeTab === 'json'}
        <pre class="bg-base-300 p-4 rounded-lg text-xs font-mono overflow-x-auto max-h-[440px] text-base-content leading-relaxed">{JSON.stringify(garmentIR, null, 2)}</pre>
      {/if}
    </div>

    <!-- Footer -->
    <div class="px-4 sm:px-6 py-3 border-t border-base-300 flex items-center justify-between bg-base-200/50 shrink-0">
      <span class="text-xs opacity-60">GarmentIR v{garmentIR.schema_version || '0.1.0'}</span>
      <button class="btn btn-sm btn-primary" onclick={onclose}>Close</button>
    </div>
  </div>
</div>
