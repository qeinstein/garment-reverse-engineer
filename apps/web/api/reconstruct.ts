import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@gradio/client';

interface PanelBoundaryEdge {
  id?: string;
  type?: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  curvature?: number;
}

interface Panel {
  id: string;
  material_id?: string;
  boundary?: {
    edges?: PanelBoundaryEdge[];
  };
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
}

interface Seam {
  id?: string;
  edges_a: Array<{ panel_id: string; edge_id: string }>;
  edges_b: Array<{ panel_id: string; edge_id: string }>;
}

interface GarmentIR {
  version?: string;
  metadata?: Record<string, unknown>;
  materials?: Array<Record<string, unknown>>;
  panels: Panel[];
  seams?: Seam[];
}

function repairGarmentIR(rawGarment: GarmentIR): GarmentIR {
  if (!rawGarment || !rawGarment.panels) return rawGarment;
  const garment = structuredClone(rawGarment);

  if (!garment.materials || garment.materials.length === 0) {
    garment.materials = [{
      id: 'default_cotton',
      name: 'Default Cotton',
      color: '#4a5568',
      stretch_warp: 10,
      stretch_weft: 10,
      bend_stiffness: 15,
      thickness_mm: 0.5,
      density_gsm: 180
    }];
  }
  const materialIds = new Set(garment.materials.map((m) => m.id));
  const fallbackMaterialId = (garment.materials[0]?.id as string) || 'default_cotton';

  const validPanelEdgeIds = new Map<string, Set<string>>();

  for (let pi = 0; pi < garment.panels.length; pi++) {
    const panel = garment.panels[pi];
    if (!panel.id) panel.id = `panel_${pi}`;
    if (!materialIds.has(panel.material_id)) {
      panel.material_id = fallbackMaterialId;
    }

    const edges = panel.boundary?.edges ?? [];
    const edgeIdSet = new Set<string>();

    if (edges.length >= 3) {
      for (let ei = 0; ei < edges.length; ei++) {
        const edge = edges[ei];
        if (!edge.id) edge.id = `edge_${ei}`;
        edgeIdSet.add(edge.id);

        const nextEdge = edges[(ei + 1) % edges.length];
        nextEdge.start = { x: edge.end.x, y: edge.end.y };
      }
    }
    validPanelEdgeIds.set(panel.id, edgeIdSet);
  }

  if (garment.seams) {
    garment.seams = garment.seams
      .map((seam, si) => {
        if (!seam.id) seam.id = `seam_${si}`;
        const edges_a = (seam.edges_a ?? []).filter((ref) =>
          validPanelEdgeIds.get(ref.panel_id)?.has(ref.edge_id)
        );
        const edges_b = (seam.edges_b ?? []).filter((ref) =>
          validPanelEdgeIds.get(ref.panel_id)?.has(ref.edge_id)
        );
        return { ...seam, edges_a, edges_b };
      })
      .filter((seam) => seam.edges_a.length > 0 && seam.edges_b.length > 0);
  }

  return garment;
}

async function parseMultipartRequest(req: VercelRequest): Promise<{ fields: Record<string, string>; files: Record<string, Blob> }> {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    return { fields: {}, files: {} };
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];

  let buffer: Buffer;
  if (Buffer.isBuffer(req.body)) {
    buffer = req.body;
  } else if (typeof req.body === 'string') {
    buffer = Buffer.from(req.body);
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    buffer = Buffer.concat(chunks);
  }

  const fields: Record<string, string> = {};
  const files: Record<string, Blob> = {};

  const delimiter = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(delimiter);

  while (start !== -1) {
    const nextStart = buffer.indexOf(delimiter, start + delimiter.length);
    if (nextStart === -1) break;

    const partBuffer = buffer.subarray(start + delimiter.length, nextStart);
    start = nextStart;

    let sepIndex = partBuffer.indexOf('\r\n\r\n');
    let headerOffset = 4;
    if (sepIndex === -1) {
      sepIndex = partBuffer.indexOf('\n\n');
      headerOffset = 2;
    }
    if (sepIndex === -1) continue;

    const headersStr = partBuffer.subarray(0, sepIndex).toString('utf8');
    // strip boundary newline (\r\n) from end of part
    let bodyEnd = partBuffer.length;
    if (partBuffer[bodyEnd - 1] === 10) bodyEnd--; // \n
    if (partBuffer[bodyEnd - 1] === 13) bodyEnd--; // \r
    const bodyBuffer = partBuffer.subarray(sepIndex + headerOffset, bodyEnd);

    const dispMatch = headersStr.match(/name="([^"]+)"/);
    if (!dispMatch) continue;
    const name = dispMatch[1];

    const filenameMatch = headersStr.match(/filename="([^"]+)"/);
    const ctMatch = headersStr.match(/Content-Type:\s*([^\r\n]+)/i);
    const mimeType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';

    if (filenameMatch) {
      files[name] = new Blob([bodyBuffer], { type: mimeType });
    } else {
      fields[name] = bodyBuffer.toString('utf8').trim();
    }
  }

  return { fields, files };
}

function toBlobOrData(input: unknown): Blob | unknown {
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      const match = input.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return new Blob([Buffer.from(match[2], 'base64')], { type: match[1] });
      }
    }
    if (input.length > 200 && !input.startsWith('http') && !input.startsWith('/')) {
      try {
        const buf = Buffer.from(input, 'base64');
        return new Blob([buf], { type: 'image/png' });
      } catch {
        // keep as is
      }
    }
  }
  return input;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const spaceUrl =
    process.env.PUBLIC_HF_REWEAVER_SPACE_URL ||
    process.env.HF_SPACE_URL ||
    'Fluxx08/reweaver-zero';

  // Server-only secret token (never exposed to browser)
  const hfToken = process.env.HF_TOKEN;

  const startTime = Date.now();

  try {
    let front = req.body?.front;
    let right = req.body?.right;
    let back = req.body?.back;
    let left = req.body?.left;
    let variant = req.body?.variant;

    const contentType = req.headers?.['content-type'] || '';
    if ((!front || !right || !back || !left) && contentType.includes('multipart/form-data')) {
      const { fields, files } = await parseMultipartRequest(req);
      front = files['front'] || toBlobOrData(fields['front']);
      right = files['right'] || toBlobOrData(fields['right']);
      back = files['back'] || toBlobOrData(fields['back']);
      left = files['left'] || toBlobOrData(fields['left']);
      if (fields['variant']) variant = fields['variant'];
    }

    front = toBlobOrData(front);
    right = toBlobOrData(right);
    back = toBlobOrData(back);
    left = toBlobOrData(left);

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

    if (!garmentIR.panels || garmentIR.panels.length === 0) {
      return res.status(502).json({
        status: 'failed',
        error: {
          code: 'INVALID_GARMENT_IR',
          message: 'Model prediction failed topology validation (no panels produced).',
        },
        timings: { totalSeconds },
      });
    }

    return res.status(200).json({
      status: 'success',
      garmentIR,
      modelVersion: `ReWeaver-${variant || 'GCD_ori'}`,
      timings: { totalSeconds },
      warnings: [],
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
