import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyError,
  ensureBlob,
  reconstructGarment,
  type ViewImageInput
} from '../apps/web/src/lib/reconstruction/hf-client';
import handler from '../apps/web/api/reconstruct';
import { PENCIL_SKIRT_FIXTURE } from '@garment-ir/core';

// Mock @gradio/client
vi.mock('@gradio/client', () => {
  return {
    Client: {
      connect: vi.fn(),
    },
  };
});

import { Client } from '@gradio/client';

describe('Hugging Face Client & Reconstruction Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HF_TOKEN;
    delete process.env.PUBLIC_RECONSTRUCTION_MODE;
  });

  describe('classifyError', () => {
    it('correctly classifies quota exhaustion (429 / rate limit)', () => {
      const err1 = new Error('Client error: 429 Quota Exceeded for ZeroGPU');
      expect(classifyError(err1).code).toBe('QUOTA_EXCEEDED');

      const err2 = 'Rate limit reached, please try again later';
      expect(classifyError(err2).code).toBe('QUOTA_EXCEEDED');
    });

    it('correctly classifies sleeping / building space (503 / sleep)', () => {
      const err1 = new Error('Space is currently sleeping');
      expect(classifyError(err1).code).toBe('SPACE_UNAVAILABLE');

      const err2 = new Error('HTTP 503 Service Unavailable: Space paused');
      expect(classifyError(err2).code).toBe('SPACE_UNAVAILABLE');
    });

    it('correctly classifies timeouts (504 / timeout)', () => {
      const err1 = new Error('Operation timeout after 120000ms');
      expect(classifyError(err1).code).toBe('TIMEOUT');

      const err2 = 'Gateway Timeout 504';
      expect(classifyError(err2).code).toBe('TIMEOUT');
    });

    it('falls back to INFERENCE_FAILED for unknown errors', () => {
      const err = new Error('CUDA out of memory: internal kernel panic');
      expect(classifyError(err).code).toBe('INFERENCE_FAILED');
      expect(classifyError(err).message).toContain('CUDA out of memory');
    });
  });

  describe('ensureBlob', () => {
    it('returns the provided Blob or File unmodified', async () => {
      const blob = new Blob(['sample-png-bytes'], { type: 'image/png' });
      const input: ViewImageInput = { label: 'front', file: blob };
      const result = await ensureBlob(input);
      expect(result).toBe(blob);
    });

    it('converts base64 data URLs to Blobs', async () => {
      // 1x1 transparent PNG data URL
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const input: ViewImageInput = { label: 'right', dataUrl };
      const result = await ensureBlob(input);
      expect(result).toBeInstanceOf(Blob);
      expect(result.size).toBeGreaterThan(0);
    });

    it('throws when neither file nor dataUrl is provided', async () => {
      const input = { label: 'back' } as ViewImageInput;
      await expect(ensureBlob(input)).rejects.toThrow('Missing image data for viewpoint: back');
    });
  });

  describe('reconstructGarment View Validation', () => {
    it('rejects with INVALID_INPUT when fewer than 4 views are provided', async () => {
      const views: ViewImageInput[] = [
        { label: 'front', file: new Blob(['1']) },
        { label: 'back', file: new Blob(['2']) },
      ];

      const result = await reconstructGarment(views);
      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('INVALID_INPUT');
      expect(result.error?.message).toContain('Expected exactly 4 views');
    });

    it('rejects with INVALID_INPUT when viewpoints are incomplete or duplicate', async () => {
      const views: ViewImageInput[] = [
        { label: 'front', file: new Blob(['1']) },
        { label: 'front', file: new Blob(['2']) },
        { label: 'back', file: new Blob(['3']) },
        { label: 'left', file: new Blob(['4']) },
      ];

      const result = await reconstructGarment(views);
      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('INVALID_INPUT');
      expect(result.error?.message).toContain('All 4 views');
    });
  });

  describe('reconstructGarment Direct ZeroGPU Mode', () => {
    const validViews: ViewImageInput[] = [
      { label: 'front', file: new Blob(['front']) },
      { label: 'right', file: new Blob(['right']) },
      { label: 'back', file: new Blob(['back']) },
      { label: 'left', file: new Blob(['left']) },
    ];

    it('connects to Gradio client and returns parsed GarmentIR on success', async () => {
      const mockPredict = vi.fn().mockResolvedValue({
        data: [
          JSON.stringify(PENCIL_SKIRT_FIXTURE),
          'test.npz',
          'plot.png',
        ],
      });

      vi.mocked(Client.connect).mockResolvedValue({
        predict: mockPredict,
      } as any);

      const result = await reconstructGarment(validViews, {
        spaceUrl: 'https://huggingface.co/spaces/qeinstein/reweaver-zero',
        mode: 'direct',
      });

      expect(Client.connect).toHaveBeenCalledWith(
        'https://huggingface.co/spaces/qeinstein/reweaver-zero'
      );
      expect(mockPredict).toHaveBeenCalledWith('/reconstruct', expect.objectContaining({
        variant: 'GCD_ori',
      }));

      expect(result.status).toBe('success');
      expect(result.garmentIR?.metadata.name).toBe(PENCIL_SKIRT_FIXTURE.metadata.name);
      expect(result.timings.totalSeconds).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('validates returned GarmentIR and flags topological errors', async () => {
      // Create invalid GarmentIR with empty panels
      const invalidIR = {
        schema_version: '0.1.0',
        metadata: { name: 'Broken' },
        panels: [],
        seams: [],
      };

      const mockPredict = vi.fn().mockResolvedValue({
        data: [JSON.stringify(invalidIR), null, null],
      });

      vi.mocked(Client.connect).mockResolvedValue({
        predict: mockPredict,
      } as any);

      const result = await reconstructGarment(validViews, { mode: 'direct' });
      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('INVALID_GARMENT_IR');
      expect(result.error?.message).toContain('topological gaps or invalid panels');
    });

    it('catches and classifies ZeroGPU errors during inference', async () => {
      vi.mocked(Client.connect).mockRejectedValue(
        new Error('ZeroGPU quota limit reached: 429')
      );

      const result = await reconstructGarment(validViews, { mode: 'direct' });
      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('QUOTA_EXCEEDED');
    });
  });

  describe('reconstructGarment Proxy Mode', () => {
    const validViews: ViewImageInput[] = [
      { label: 'front', file: new Blob(['f']) },
      { label: 'right', file: new Blob(['r']) },
      { label: 'back', file: new Blob(['b']) },
      { label: 'left', file: new Blob(['l']) },
    ];

    it('posts FormData to /api/reconstruct and returns server payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          status: 'success',
          garmentIR: PENCIL_SKIRT_FIXTURE,
          modelVersion: 'ReWeaver-GCD_ori',
          timings: { totalSeconds: 1.4 },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await reconstructGarment(validViews, { mode: 'proxy' });

      expect(mockFetch).toHaveBeenCalledWith('/api/reconstruct', expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }));

      expect(result.status).toBe('success');
      expect(result.garmentIR?.metadata.name).toBe(PENCIL_SKIRT_FIXTURE.metadata.name);

      vi.unstubAllGlobals();
    });

    it('maps server proxy error responses to classified errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: vi.fn().mockResolvedValue({
          message: 'The Space is sleeping. Retry in 30 seconds.',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await reconstructGarment(validViews, { mode: 'proxy' });

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('SPACE_UNAVAILABLE');

      vi.unstubAllGlobals();
    });
  });

  describe('Vercel Serverless Function Handler (api/reconstruct)', () => {
    function createMockReqRes(method = 'POST', body: any = {}) {
      const req: any = { method, body };
      const res: any = {
        statusCode: 200,
        headers: {},
        data: null,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.data = payload;
          return this;
        },
      };
      return { req, res };
    }

    it('rejects non-POST HTTP methods with 405', async () => {
      const { req, res } = createMockReqRes('GET');
      await handler(req, res);
      expect(res.statusCode).toBe(405);
      expect(res.data.error).toBe('Method Not Allowed');
    });

    it('rejects requests missing viewpoints with 400', async () => {
      const { req, res } = createMockReqRes('POST', { front: 'img1' });
      await handler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.data.error.code).toBe('INVALID_INPUT');
    });

    it('proxies request to Gradio using server-only HF_TOKEN and returns 200 on success', async () => {
      process.env.HF_TOKEN = 'hf_test_secret_token';

      const mockPredict = vi.fn().mockResolvedValue({
        data: [JSON.stringify(PENCIL_SKIRT_FIXTURE), null, null],
      });

      vi.mocked(Client.connect).mockResolvedValue({
        predict: mockPredict,
      } as any);

      const { req, res } = createMockReqRes('POST', {
        front: 'data:front',
        right: 'data:right',
        back: 'data:back',
        left: 'data:left',
        variant: 'GCD_ori',
      });

      await handler(req, res);

      expect(Client.connect).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ hf_token: 'hf_test_secret_token' })
      );

      expect(res.statusCode).toBe(200);
      expect(res.data.status).toBe('success');
      expect(res.data.garmentIR.metadata.name).toBe(PENCIL_SKIRT_FIXTURE.metadata.name);
    });

    it('returns 502 INVALID_GARMENT_IR if predicted payload fails validation', async () => {
      const invalidIR = { schema_version: '0.1.0', metadata: {}, panels: [] };
      vi.mocked(Client.connect).mockResolvedValue({
        predict: vi.fn().mockResolvedValue({
          data: [JSON.stringify(invalidIR), null, null],
        }),
      } as any);

      const { req, res } = createMockReqRes('POST', {
        front: 'f',
        right: 'r',
        back: 'b',
        left: 'l',
      });

      await handler(req, res);
      expect(res.statusCode).toBe(502);
      expect(res.data.error.code).toBe('INVALID_GARMENT_IR');
    });

    it('returns 429 when ZeroGPU quota is exceeded', async () => {
      vi.mocked(Client.connect).mockRejectedValue(new Error('Quota limit exceeded: 429'));

      const { req, res } = createMockReqRes('POST', {
        front: 'f',
        right: 'r',
        back: 'b',
        left: 'l',
      });

      await handler(req, res);
      expect(res.statusCode).toBe(429);
      expect(res.data.error.code).toBe('QUOTA_EXCEEDED');
    });
  });
});
