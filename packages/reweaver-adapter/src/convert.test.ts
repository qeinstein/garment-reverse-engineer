import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateGarmentIR } from '@garment-ir/validation';
import { garmentIRToSeamer } from '@garment-ir/seamer-adapter';
import { reweaverToGarmentIR } from './convert.js';
import type { ReWeaverRawOutput } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ReWeaver to GarmentIR Adapter', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/reweaver-pencil-skirt.json');
  const rawFixture: ReWeaverRawOutput = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  it('converts raw ReWeaver output into valid GarmentIR v0.1.0', () => {
    const garmentIR = reweaverToGarmentIR(rawFixture, {
      garmentName: 'Reconstructed Pencil Skirt',
      category: 'skirt',
    });

    expect(garmentIR.schema_version).toBe('0.1.0');
    expect(garmentIR.metadata.name).toBe('Reconstructed Pencil Skirt');
    expect(garmentIR.metadata.reconstruction_model?.name).toBe('ReWeaver');
    expect(garmentIR.units.spatial_2d).toBe('mm');
    expect(garmentIR.units.spatial_3d).toBe('m');

    // 2 panels: Front and Back
    expect(garmentIR.panels).toHaveLength(2);
    const frontPanel = garmentIR.panels.find((p) => p.id === 'panel_0');
    const backPanel = garmentIR.panels.find((p) => p.id === 'panel_1');

    expect(frontPanel).toBeDefined();
    expect(backPanel).toBeDefined();
    expect(frontPanel?.category).toBe('body_front');
    expect(backPanel?.category).toBe('body_back');

    // Panel edges scaled to mm (scale 0.55m -> width around 380mm, height around 600mm)
    expect(frontPanel?.boundary.edges).toHaveLength(4);
    expect(frontPanel?.boundary.closed).toBe(true);
    for (const edge of frontPanel!.boundary.edges) {
      expect(edge.kind).toBe('polyline');
      expect(edge.polyline_samples).toBeDefined();
      expect(edge.polyline_samples!.length).toBe(50);
      expect(edge.confidence).toBeGreaterThan(0.8);
    }

    // Seams derived from shared curves 1 and 3
    expect(garmentIR.seams).toHaveLength(2);
    for (const seam of garmentIR.seams) {
      expect(seam.edges_a).toHaveLength(1);
      expect(seam.edges_b).toHaveLength(1);
      expect(seam.edges_b[0].reversed).toBe(true);
      expect(seam.confidence).toBeGreaterThan(0.9);
    }

    // Hypotheses: documents unobserved closures without fabricating
    expect(garmentIR.hypotheses).toBeDefined();
    expect(garmentIR.hypotheses!.length).toBeGreaterThan(0);
    const closureHypo = garmentIR.hypotheses!.find((h) => h.aspect === 'closure_type');
    expect(closureHypo).toBeDefined();
    expect(closureHypo?.chosen).toBe(false);
    expect(closureHypo?.alternatives.length).toBeGreaterThanOrEqual(2);
  });

  it('passes canonical GarmentIR validation with 0 errors', () => {
    const garmentIR = reweaverToGarmentIR(rawFixture);
    const report = validateGarmentIR(garmentIR);

    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it('converts to Seamer Pattern structure with correct pieces, seams, and placement', () => {
    const garmentIR = reweaverToGarmentIR(rawFixture);
    const pattern = garmentIRToSeamer(garmentIR);

    expect(pattern.pieces).toHaveLength(2);
    expect(pattern.seams).toHaveLength(2);

    const piece0 = pattern.pieces.find((p) => p.id === 'panel_0');
    const piece1 = pattern.pieces.find((p) => p.id === 'panel_1');

    expect(piece0).toBeDefined();
    expect(piece1).toBeDefined();
    expect(piece0?.settings3d.arrangement.cylinderName).toBe('Torso');
    expect(piece0?.settings3d.arrangement.uDegrees).toBe(0);
    expect(piece1?.settings3d.arrangement.uDegrees).toBe(180);
  });
});

