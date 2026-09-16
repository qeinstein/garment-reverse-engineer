import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { garmentIRToSeamer, repairGarmentIR } from '../packages/seamer-adapter/src/index';
import { validateGarmentIR } from '../packages/validation/src/index';

describe('Real HF Space Output Pipeline Validation', () => {
  it('successfully processes real ReWeaver output into Seamer pattern', async () => {
    const rawJson = fs.readFileSync(new URL('../apps/web/static/sample_views/pencil_skirt_garment_ir.json', import.meta.url), 'utf8');
    const garmentIR = JSON.parse(rawJson);

    console.log("Raw panels:", garmentIR.panels?.length, "seams:", garmentIR.seams?.length);

    const repaired = repairGarmentIR(garmentIR);
    console.log("Repaired panels:", repaired.panels?.length, "seams:", repaired.seams?.length);

    const report = validateGarmentIR(repaired);
    console.log("Report valid:", report.valid, "errors:", report.errors.length, "warnings:", report.warnings.length);
    if (report.errors.length > 0) {
      console.log("Validation errors:", JSON.stringify(report.errors, null, 2));
    }

    const seamerPattern = garmentIRToSeamer(repaired);
    console.log("Seamer pattern pieces:", seamerPattern.pieces?.length, "points:", seamerPattern.points?.length, "paths:", seamerPattern.paths?.length);

    expect(seamerPattern.pieces.length).toBeGreaterThan(0);

    const { assertPatternBuildable3d } = await import('../apps/web/src/lib/utils/importSimplePattern');
    expect(() => assertPatternBuildable3d(seamerPattern)).not.toThrow();
    console.log('assertPatternBuildable3d SUCCEEDED!');
  }, 60000);
});
