<script lang="ts">
  import { reconstructGarment, type ViewImageInput, type ViewLabel } from '$lib/reconstruction/hf-client';
  import { garmentIRToSeamer } from '@garment-ir/seamer-adapter';
  import type { GarmentIR } from '@garment-ir/core';
  import type { Pattern } from '@seamer/pattern-model';
  import { toastSuccess, toastError } from '$lib/stores/toast';

  interface Props {
    onapply: (pattern: Pattern, garmentIR: GarmentIR) => void;
    oncancel: () => void;
  }

  let { onapply, oncancel }: Props = $props();

  let variant = $state<'GCD_ori' | 'tileable'>('GCD_ori');
  let spaceUrl = $state(
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_HF_REWEAVER_SPACE_URL) ||
    'Fluxx08/reweaver-zero'
  );

  let views = $state<Record<ViewLabel, { file: File | null; dataUrl: string | null }>>({
    front: { file: null, dataUrl: null },
    right: { file: null, dataUrl: null },
    back: { file: null, dataUrl: null },
    left: { file: null, dataUrl: null }
  });

  let loading = $state(false);
  let statusMessage = $state('');
  let errorMessage = $state<string | null>(null);
  let elapsedSeconds = $state(0);
  let timerInterval: any = null;
  let abortController: AbortController | null = null;

  const viewSlots: { key: ViewLabel; label: string; angle: string }[] = [
    { key: 'front', label: 'Front View', angle: '0°' },
    { key: 'right', label: 'Right Side', angle: '90°' },
    { key: 'back', label: 'Back View', angle: '180°' },
    { key: 'left', label: 'Left Side', angle: '270°' }
  ];

  let missingSlots = $derived(
    viewSlots.filter((slot) => !views[slot.key].file && !views[slot.key].dataUrl)
  );

  let uploadedCount = $derived(4 - missingSlots.length);

  function processFile(key: ViewLabel, file: File) {
    if (!file.type.startsWith('image/')) {
      toastError(`Invalid file type for ${key}: only images (PNG, JPEG, WebP) are supported.`);
      return;
    }
    views[key].file = file;
    const reader = new FileReader();
    reader.onload = (re) => {
      views[key].dataUrl = re.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  function handleFileSelect(key: ViewLabel, e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    processFile(key, file);
  }

  function handleDrop(key: ViewLabel, e: DragEvent) {
    e.preventDefault();
    if (loading) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processFile(key, file);
    }
  }

  async function loadSampleSkirt() {
    loading = true;
    statusMessage = 'Loading sample photos...';
    try {
      for (const slot of viewSlots) {
        const res = await fetch(`/sample_views/${slot.key}.png`);
        const blob = await res.blob();
        const file = new File([blob], `${slot.key}.png`, { type: 'image/png' });
        views[slot.key].file = file;
        views[slot.key].dataUrl = URL.createObjectURL(blob);
      }
      toastSuccess('Loaded 4-view sample pencil skirt photos');
    } catch (e) {
      toastError('Failed to load sample photos');
    } finally {
      loading = false;
      statusMessage = '';
    }
  }

  async function loadPrecomputedSample() {
    errorMessage = null;
    loading = true;
    statusMessage = 'Loading pre-computed ReWeaver neural output...';
    try {
      if (uploadedCount < 4) {
        await loadSampleSkirt();
      }
      const res = await fetch('/sample_views/pencil_skirt_garment_ir.json');
      if (!res.ok) throw new Error(`HTTP ${res.status} loading sample garment JSON`);
      const gIR = await res.json();
      statusMessage = 'Converting GarmentIR to Seamer CAD pattern...';
      const seamerPattern = garmentIRToSeamer(gIR);
      toastSuccess(`Loaded pre-computed sample Pencil Skirt (${gIR.panels.length} panels, ${gIR.seams.length} seams)!`);
      onapply(seamerPattern, gIR);
    } catch (err: any) {
      console.error('Failed to load sample GarmentIR:', err);
      errorMessage = err?.message || String(err);
      toastError(errorMessage);
    } finally {
      loading = false;
      statusMessage = '';
    }
  }

  function cancelReconstruction() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    loading = false;
    statusMessage = '';
    toastError('Reconstruction cancelled by user.');
  }

  async function startReconstruction() {
    errorMessage = null;

    // Validate all 4 views
    const inputs: ViewImageInput[] = [];
    for (const slot of viewSlots) {
      const v = views[slot.key];
      if (!v.file && !v.dataUrl) {
        errorMessage = `Please provide all 4 viewpoints. Missing: ${slot.label}`;
        return;
      }
      inputs.push({
        label: slot.key,
        file: v.file || undefined,
        dataUrl: v.dataUrl || undefined
      });
    }

    loading = true;
    elapsedSeconds = 0;
    statusMessage = 'Connecting to Hugging Face ZeroGPU Space...';

    timerInterval = setInterval(() => {
      elapsedSeconds++;
      if (elapsedSeconds > 8 && elapsedSeconds <= 25) {
        statusMessage = 'Waking up ZeroGPU container & allocating GPU slice (cold start ~30s)...';
      } else if (elapsedSeconds > 25) {
        statusMessage = 'Running ReWeaver neural network prediction & curve fitting...';
      }
    }, 1000);

    try {
      const res = await reconstructGarment(inputs, {
        spaceUrl,
        variant
      });

      if (res.status === 'failed' || !res.garmentIR) {
        throw new Error(res.error?.message || 'Reconstruction failed');
      }

      statusMessage = 'Converting GarmentIR to Seamer Pattern...';
      const seamerPattern = garmentIRToSeamer(res.garmentIR);

      toastSuccess(`Reconstructed ${res.garmentIR.metadata.name}! ${res.garmentIR.panels.length} panels, ${res.garmentIR.seams.length} seams in ${res.timings.totalSeconds.toFixed(1)}s`);
      onapply(seamerPattern, res.garmentIR);
    } catch (err: any) {
      console.error('Reconstruction error:', err);
      errorMessage = err?.message || String(err);
      toastError(errorMessage || 'Inference error');
    } finally {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      loading = false;
      statusMessage = '';
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && !loading) oncancel(); }} />

<div class="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="modal-ai-title">
  <div class="bg-base-100 rounded-xl shadow-2xl max-w-2xl w-full border border-base-300 overflow-hidden flex flex-col max-h-[92vh] my-auto">
    <!-- Header -->
    <div class="px-4 sm:px-6 py-3 sm:py-4 border-b border-base-300 flex items-center justify-between bg-base-200/50 shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-2xl shrink-0">🧵</span>
        <div class="min-w-0">
          <h3 id="modal-ai-title" class="font-bold text-base sm:text-lg leading-tight font-lexend truncate">AI Garment Reverse Engineer</h3>
          <p class="text-xs opacity-60 truncate">Reconstruct editable 2D sewing patterns and 3D cloth drape from 4 photos</p>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm btn-circle shrink-0" onclick={oncancel} disabled={loading} aria-label="Close modal">✕</button>
    </div>

    <!-- Body -->
    <div class="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
      {#if errorMessage}
        <div class="alert alert-error text-xs py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
          <button class="btn btn-xs btn-outline bg-base-100/20 text-xs shrink-0 self-end sm:self-auto" onclick={loadPrecomputedSample} disabled={loading}>
            ⚡ Load Pre-computed Sample
          </button>
        </div>
      {/if}

      <!-- Quick sample banner -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-primary/10 border border-primary/20 rounded-lg p-3 text-xs gap-2">
        <div class="flex items-center gap-1.5 font-medium">
          <span>✨</span>
          <span>Sample Pencil Skirt (4 angles):</span>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button class="btn btn-xs btn-ghost border border-primary/30 font-medium shrink-0" onclick={loadSampleSkirt} disabled={loading}>
            Load 4 Photos
          </button>
          <button class="btn btn-xs btn-primary font-medium shrink-0" onclick={loadPrecomputedSample} disabled={loading} title="Instantly load real ReWeaver output without waiting for GPU queue">
            ⚡ Instant Model Demo
          </button>
        </div>
      </div>

      <!-- 4 Viewports Upload Grid -->
      <div>
        <div class="flex items-center justify-between py-1">
          <span class="label-text font-semibold text-xs uppercase tracking-wider opacity-70">4 Viewpoint Photos (Neutral Background)</span>
          {#if uploadedCount === 4}
            <span class="badge badge-success badge-xs gap-1 font-medium">✓ Ready (4/4)</span>
          {:else if uploadedCount > 0}
            <span class="badge badge-warning badge-xs gap-1 font-medium">{uploadedCount}/4 (Missing {missingSlots.map(s => s.label).join(', ')})</span>
          {:else}
            <span class="badge badge-ghost badge-xs opacity-60">0/4 Uploaded</span>
          {/if}
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {#each viewSlots as slot}
            <div class="flex flex-col items-center">
              <label
                class="w-full aspect-square rounded-lg border-2 border-dashed border-base-300 hover:border-primary/60 transition-colors flex flex-col items-center justify-center p-2 cursor-pointer bg-base-200/40 relative overflow-hidden group"
                ondragover={(e) => { e.preventDefault(); }}
                ondrop={(e) => handleDrop(slot.key, e)}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  class="hidden"
                  onchange={(e) => handleFileSelect(slot.key, e)}
                  disabled={loading}
                />
                {#if views[slot.key].dataUrl}
                  <img
                    src={views[slot.key].dataUrl}
                    alt={slot.label}
                    class="absolute inset-0 w-full h-full object-contain p-1"
                  />
                  <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                    Replace
                  </div>
                {:else}
                  <span class="text-2xl opacity-40 mb-1">📷</span>
                  <span class="text-[11px] font-medium text-center">{slot.label}</span>
                  <span class="text-[9px] opacity-50">({slot.angle})</span>
                {/if}
              </label>
            </div>
          {/each}
        </div>
      </div>

      <!-- Advanced Settings Accordion -->
      <div class="collapse collapse-arrow bg-base-200/40 border border-base-300 text-xs">
        <input type="checkbox" />
        <div class="collapse-title font-medium py-2 min-h-0 text-xs opacity-75">
          Advanced Settings (Model & Space URL)
        </div>
        <div class="collapse-content space-y-3 pt-2">
          <label class="form-control w-full">
            <div class="label py-0"><span class="label-text text-xs">Hugging Face Space Endpoint</span></div>
            <input
              type="text"
              class="input input-bordered input-xs w-full"
              bind:value={spaceUrl}
              placeholder="https://huggingface.co/spaces/Fluxx08/reweaver-zero"
              disabled={loading}
            />
          </label>

          <label class="form-control w-full">
            <div class="label py-0"><span class="label-text text-xs">Model Weights Variant</span></div>
            <select class="select select-bordered select-xs w-full" bind:value={variant} disabled={loading}>
              <option value="GCD_ori">GCD_ori (Recommended for photographic clothing)</option>
              <option value="tileable">tileable (Procedural repeating pattern textures)</option>
            </select>
          </label>
        </div>
      </div>

      <!-- Status Indicator -->
      {#if loading}
        <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg border border-base-300">
          <div class="flex items-center gap-3">
            <span class="loading loading-spinner loading-md text-primary shrink-0"></span>
            <div class="text-xs">
              <div class="font-semibold text-primary">{statusMessage}</div>
              <div class="opacity-60 text-[10px]">Elapsed: {elapsedSeconds}s · ZeroGPU allocates an Nvidia A100/L40S slice for ~3.5s</div>
            </div>
          </div>
          <button class="btn btn-xs btn-outline btn-error shrink-0" onclick={cancelReconstruction}>
            Cancel
          </button>
        </div>
      {/if}
    </div>

    <!-- Footer Actions (Sticky on Mobile) -->
    <div class="px-4 sm:px-6 py-3 sm:py-4 border-t border-base-300 flex items-center justify-between bg-base-200/80 backdrop-blur-sm sticky bottom-0 shrink-0">
      <button class="btn btn-sm btn-ghost" onclick={oncancel} disabled={loading}>
        Close
      </button>

      <button
        class="btn btn-sm btn-primary gap-2 font-semibold shadow-md"
        onclick={startReconstruction}
        disabled={loading || uploadedCount < 4}
      >
        {#if loading}
          <span class="loading loading-spinner loading-xs"></span>
          Reconstructing...
        {:else}
          <span>🚀</span> Reconstruct Garment
        {/if}
      </button>
    </div>
  </div>
</div>
