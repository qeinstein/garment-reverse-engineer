import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@gradio/client';
import { validateGarmentIR } from '@garment-ir/validation';
import { repairGarmentIR } from '@garment-ir/seamer-adapter';
import type { GarmentIR } from '@garment-ir/core';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const spaceUrl =
    process.env.PUBLIC_HF_REWEAVER_SPACE_URL ||
    process.env.HF_SPACE_URL ||
    'https://huggingface.co/spaces/Fluxx08/reweaver-zero';

  // Server-only secret token (never exposed to browser)
  const hfToken = process.env.HF_TOKEN;

  const startTime = Date.now();

  try {
    const { front, right, back, left, variant } = req.body || {};

    if (!front || !right || !back || !left) {
      return res.status(400).json({
        status: 'failed',
        error: {
          code: 'INVALID_INPUT',
          message: 'All 4 viewpoint images (front, right, back, left) are required.',
        },
      });
    }

    const client = await Client.connect(spaceUrl, {
      hf_token: hfToken as `hf_${string}` | undefined,
    });

    const result = await client.predict('/reconstruct', {
      front_img: front,
      right_img: right,
      back_img: back,
      left_img: left,
      variant: variant || 'GCD_ori',
    });

    const totalSeconds = (Date.now() - startTime) / 1000;
    const data = result.data as [string, unknown, unknown];
    const garmentIRJson = data[0];

    if (!garmentIRJson) {
      throw new Error('Empty response payload from Hugging Face Space.');
    }

    let garmentIR: GarmentIR = JSON.parse(garmentIRJson);
    garmentIR = repairGarmentIR(garmentIR);
    const report = validateGarmentIR(garmentIR);

    if (!garmentIR.panels || garmentIR.panels.length === 0) {
      return res.status(502).json({
        status: 'failed',
        error: {
          code: 'INVALID_GARMENT_IR',
          message: 'Model prediction failed topology validation (no panels produced).',
          details: report.errors,
        },
        timings: { totalSeconds },
      });
    }

    return res.status(200).json({
      status: 'success',
      garmentIR,
      modelVersion: `ReWeaver-${variant || 'GCD_ori'}`,
      timings: { totalSeconds },
      warnings: [
        ...report.warnings.map((w) => `${w.code}: ${w.message}`),
        ...report.errors.map((e) => `Topology notice: ${e.message}`),
      ],
    });
  } catch (error: unknown) {
    const totalSeconds = (Date.now() - startTime) / 1000;
    const errStr = String(error).toLowerCase();

    let statusCode = 500;
    let code = 'INFERENCE_FAILED';
    let message = error instanceof Error ? error.message : String(error);

    if (errStr.includes('quota') || errStr.includes('429')) {
      statusCode = 429;
      code = 'QUOTA_EXCEEDED';
      message = 'ZeroGPU burst quota exhausted. Please wait a few minutes before retrying.';
    } else if (errStr.includes('sleep') || errStr.includes('503') || errStr.includes('pause')) {
      statusCode = 503;
      code = 'SPACE_UNAVAILABLE';
      message = 'The reconstruction Space is waking up. Please retry in 30 seconds.';
    }

    return res.status(statusCode).json({
      status: 'failed',
      error: { code, message },
      timings: { totalSeconds },
    });
  }
}
