import { Client } from '@gradio/client';
import type { GarmentIR } from '@garment-ir/core';
import { validateGarmentIR } from '@garment-ir/validation';
import { repairGarmentIR } from '@garment-ir/seamer-adapter';

export type ViewLabel = 'front' | 'right' | 'back' | 'left';

export interface ViewImageInput {
  label: ViewLabel;
  file?: File | Blob;
  dataUrl?: string;
}

export interface ReconstructionOptions {
  spaceUrl?: string;
  variant?: 'GCD_ori' | 'tileable';
  garmentName?: string;
  category?: string;
  mode?: 'direct' | 'proxy';
  timeoutMs?: number;
}

export interface ReconstructionTimings {
  queueSeconds?: number;
  inferenceSeconds?: number;
  totalSeconds: number;
}

export interface ReconstructionError {
  code:
    | 'SPACE_UNAVAILABLE'
    | 'QUOTA_EXCEEDED'
    | 'TIMEOUT'
    | 'INVALID_INPUT'
    | 'INVALID_GARMENT_IR'
    | 'INFERENCE_FAILED'
    | 'NETWORK_ERROR';
  message: string;
  details?: unknown;
}

export interface ReconstructionResult {
  status: 'success' | 'failed';
  garmentIR: GarmentIR | null;
  modelVersion: string;
  timings: ReconstructionTimings;
  warnings?: string[];
  error?: ReconstructionError;
  rawNpzBlob?: Blob | null;
}

/**
 * Converts a File, Blob, or base64 data URL into a Blob suitable for transmission.
 */
export async function ensureBlob(input: ViewImageInput): Promise<Blob> {
  if (input.file) {
    return input.file;
  }
  if (input.dataUrl) {
    const res = await fetch(input.dataUrl);
    return await res.blob();
  }
  throw new Error(`Missing image data for viewpoint: ${input.label}`);
}

/**
 * Reconstructs an existing garment from 4 viewpoint reference images.
 * Completely abstracts Hugging Face Gradio network structures.
 */
export async function reconstructGarment(
  views: ViewImageInput[],
  options: ReconstructionOptions = {}
): Promise<ReconstructionResult> {
  const startTime = Date.now();
  const mode = options.mode || (typeof process !== 'undefined' && process.env?.PUBLIC_RECONSTRUCTION_MODE === 'proxy' ? 'proxy' : 'direct');

  // 1. Verify exactly 4 ordered views
  if (views.length !== 4) {
    return {
      status: 'failed',
      garmentIR: null,
      modelVersion: 'unknown',
      timings: { totalSeconds: 0 },
      error: {
        code: 'INVALID_INPUT',
        message: `Expected exactly 4 views (front, right, back, left), received ${views.length}.`,
      },
    };
  }

  // Ensure views are mapped in canonical order: front (0), right (1), back (2), left (3)
  const viewMap = new Map<ViewLabel, ViewImageInput>();
  for (const v of views) {
    viewMap.set(v.label, v);
  }

  const front = viewMap.get('front');
  const right = viewMap.get('right');
  const back = viewMap.get('back');
  const left = viewMap.get('left');

  if (!front || !right || !back || !left) {
    return {
      status: 'failed',
      garmentIR: null,
      modelVersion: 'unknown',
      timings: { totalSeconds: 0 },
      error: {
        code: 'INVALID_INPUT',
        message: 'All 4 views (front, right, back, left) are required.',
      },
    };
  }

  try {
    if (mode === 'proxy') {
      return await reconstructViaProxy([front, right, back, left], options, startTime);
    } else {
      return await reconstructViaDirectHF([front, right, back, left], options, startTime);
    }
  } catch (err: unknown) {
    const totalSeconds = (Date.now() - startTime) / 1000;
    const classified = classifyError(err);
    return {
      status: 'failed',
      garmentIR: null,
      modelVersion: options.variant || 'GCD_ori',
      timings: { totalSeconds },
      error: classified,
    };
  }
}

/**
 * Directly connects to the public Hugging Face ZeroGPU Space via @gradio/client.
 */
async function reconstructViaDirectHF(
  orderedViews: ViewImageInput[],
  options: ReconstructionOptions,
  startTime: number
): Promise<ReconstructionResult> {
  const spaceUrl =
    options.spaceUrl ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_HF_REWEAVER_SPACE_URL) ||
    (typeof process !== 'undefined' && process.env?.PUBLIC_HF_REWEAVER_SPACE_URL) ||
    'Fluxx08/reweaver-zero';

  const [frontBlob, rightBlob, backBlob, leftBlob] = await Promise.all([
    ensureBlob(orderedViews[0]),
    ensureBlob(orderedViews[1]),
    ensureBlob(orderedViews[2]),
    ensureBlob(orderedViews[3]),
  ]);

  const client = await Client.connect(spaceUrl);

  const predictResult = await client.predict('/reconstruct', {
    front_img: frontBlob,
    right_img: rightBlob,
    back_img: backBlob,
    left_img: leftBlob,
    variant: options.variant || 'GCD_ori',
  });

  const totalSeconds = (Date.now() - startTime) / 1000;

  // predictResult.data contains: [garment_ir_json, npz_file, plot_image]
  const data = predictResult.data as [string, unknown, unknown];
  const garmentIRJson = data[0];

  if (!garmentIRJson || typeof garmentIRJson !== 'string') {
    throw new Error('HF Space returned empty or malformed GarmentIR JSON.');
  }

  let garmentIR: GarmentIR;
  try {
    garmentIR = JSON.parse(garmentIRJson);
  } catch (e) {
    throw new Error(`Failed to parse GarmentIR JSON from Space: ${e}`);
  }

  // Repair any gaps or discrepancies from neural network predictions
  garmentIR = repairGarmentIR(garmentIR);

  // Validate GarmentIR structure
  const report = validateGarmentIR(garmentIR);
  const warnings = [
    ...report.warnings.map((w) => `${w.code}: ${w.message}`),
    ...report.errors.map((e) => `Topology notice: ${e.message}`)
  ];

  if (!garmentIR.panels || garmentIR.panels.length === 0) {
    return {
      status: 'failed',
      garmentIR: null,
      modelVersion: `ReWeaver-${options.variant || 'GCD_ori'}`,
      timings: { totalSeconds },
      error: {
        code: 'INVALID_GARMENT_IR',
        message: 'Reconstructed garment contains topological gaps or invalid panels.',
        details: report.errors,
      },
    };
  }

  return {
    status: 'success',
    garmentIR,
    modelVersion: `ReWeaver-${options.variant || 'GCD_ori'}`,
    timings: {
      totalSeconds,
    },
    warnings,
  };
}

/**
 * Calls server-side proxy route (/api/reconstruct) to keep private HF_TOKEN secure.
 */
async function reconstructViaProxy(
  orderedViews: ViewImageInput[],
  options: ReconstructionOptions,
  startTime: number
): Promise<ReconstructionResult> {
  const [frontBlob, rightBlob, backBlob, leftBlob] = await Promise.all([
    ensureBlob(orderedViews[0]),
    ensureBlob(orderedViews[1]),
    ensureBlob(orderedViews[2]),
    ensureBlob(orderedViews[3]),
  ]);

  const formData = new FormData();
  formData.append('front', frontBlob, 'front.png');
  formData.append('right', rightBlob, 'right.png');
  formData.append('back', backBlob, 'back.png');
  formData.append('left', leftBlob, 'left.png');
  formData.append('variant', options.variant || 'GCD_ori');
  if (options.garmentName) formData.append('garmentName', options.garmentName);

  const res = await fetch('/api/reconstruct', {
    method: 'POST',
    body: formData,
  });

  const totalSeconds = (Date.now() - startTime) / 1000;

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message =
      errorBody.error?.message ||
      errorBody.message ||
      res.statusText ||
      `HTTP ${res.status}`;
    const err = new Error(message);
    (err as any).status = res.status;
    (err as any).details = errorBody;
    if (errorBody.error?.code) {
      (err as any).code = errorBody.error.code;
    }
    throw err;
  }

  const payload = await res.json();
  return {
    ...payload,
    timings: {
      ...payload.timings,
      totalSeconds,
    },
  };
}

/**
 * Classifies runtime exceptions into structured user-facing error codes.
 */
export function classifyError(err: unknown): ReconstructionError {
  if (err && typeof err === 'object') {
    const candidateCode = (err as any).code || (err as any).error?.code;
    if (
      candidateCode === 'SPACE_UNAVAILABLE' ||
      candidateCode === 'QUOTA_EXCEEDED' ||
      candidateCode === 'TIMEOUT' ||
      candidateCode === 'INVALID_INPUT' ||
      candidateCode === 'INVALID_GARMENT_IR' ||
      candidateCode === 'INFERENCE_FAILED' ||
      candidateCode === 'NETWORK_ERROR'
    ) {
      return {
        code: candidateCode,
        message: (err as any).message || (err as any).error?.message || 'Reconstruction failed.',
        details: (err as any).details ?? err,
      };
    }
  }

  let str = '';
  if (err instanceof Error) {
    str = `${err.name} ${err.message} ${(err as any).status ?? ''}`;
  } else if (typeof err === 'object' && err !== null) {
    try {
      str = `${(err as any).name ?? ''} ${(err as any).message ?? ''} ${(err as any).status ?? ''} ${JSON.stringify(err)}`;
    } catch {
      str = String(err);
    }
  } else {
    str = String(err);
  }
  str = str.toLowerCase();

  if (str.includes('quota') || str.includes('429') || str.includes('rate limit')) {
    return {
      code: 'QUOTA_EXCEEDED',
      message: 'ZeroGPU burst quota exhausted. Please wait a few minutes before trying another reconstruction.',
      details: err,
    };
  }

  if (str.includes('sleep') || str.includes('pause') || str.includes('503') || str.includes('building')) {
    return {
      code: 'SPACE_UNAVAILABLE',
      message: 'The Hugging Face ZeroGPU Space is currently waking up. Please retry in 30 seconds.',
      details: err,
    };
  }

  if (str.includes('timeout') || str.includes('504')) {
    return {
      code: 'TIMEOUT',
      message: 'The reconstruction request timed out. Please try again.',
      details: err,
    };
  }

  const defaultMsg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err && typeof (err as any).message === 'string'
      ? (err as any).message
      : String(err);

  return {
    code: 'INFERENCE_FAILED',
    message: defaultMsg,
    details: err,
  };
}
