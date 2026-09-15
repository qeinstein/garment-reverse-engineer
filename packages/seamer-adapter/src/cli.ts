#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import type { GarmentIR } from '@garment-ir/core';
import { validateGarmentIR } from '@garment-ir/validation';
import { garmentIRToSeamer } from './convert.js';

function printUsage() {
  console.log(`
Usage: garment-to-seamer <input-garment-ir.json> [output-pattern.seamer]

Options:
  --help, -h       Show help
  --strict         Fail on warnings as well as errors
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const inputFile = args[0];
  const outputFile = args[1] && !args[1].startsWith('--') ? args[1] : null;
  const strict = args.includes('--strict');

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  const rawJson = fs.readFileSync(inputFile, 'utf-8');
  let garment: GarmentIR;
  try {
    garment = JSON.parse(rawJson);
  } catch (err) {
    console.error(`Error: Invalid JSON in ${inputFile}:`, err);
    process.exit(1);
  }

  console.log(`\n🧵 GarmentIR -> Seamer Converter`);
  console.log(`----------------------------------------`);
  console.log(`Input: ${inputFile}`);
  console.log(`Garment: "${garment.metadata?.name ?? 'Unnamed'}" (${garment.metadata?.id})`);
  console.log(`Panels: ${garment.panels?.length ?? 0}`);
  console.log(`Seams: ${garment.seams?.length ?? 0}`);
  console.log(`Materials: ${garment.materials?.length ?? 0}`);

  // Validate
  console.log(`\n🔍 Validating GarmentIR...`);
  const validation = validateGarmentIR(garment);

  if (validation.warnings.length > 0) {
    console.warn(`\n⚠️  Warnings (${validation.warnings.length}):`);
    for (const w of validation.warnings) {
      console.warn(`  - [${w.code}] ${w.path}: ${w.message}`);
    }
  }

  if (!validation.valid) {
    console.error(`\n❌ Validation Failed with ${validation.errors.length} error(s):`);
    for (const e of validation.errors) {
      console.error(`  - [${e.code}] ${e.path}: ${e.message}`);
    }
    process.exit(1);
  }

  if (strict && validation.warnings.length > 0) {
    console.error(`\n❌ Failed due to warnings in --strict mode.`);
    process.exit(1);
  }

  console.log(`✓ GarmentIR is structurally valid.`);

  // Convert
  console.log(`\n🔄 Converting to Seamer Pattern representation...`);
  const pattern = garmentIRToSeamer(garment);

  console.log(`✓ Conversion successful:`);
  console.log(`  - Seamer Points: ${pattern.points.length}`);
  console.log(`  - Seamer Paths: ${pattern.paths.length}`);
  console.log(`  - Seamer Pieces: ${pattern.pieces.length}`);
  console.log(`  - Seamer Seams: ${pattern.seams.length}`);
  console.log(`  - Seamer Materials: ${pattern.materials.length}`);
  console.log(`  - 3D Placements:`);
  for (const piece of pattern.pieces) {
    const arr = piece.settings3d.arrangement;
    console.log(`    * [${piece.name}] -> Cylinder: ${arr.cylinderName}, Angle: ${arr.uDegrees}°, v: ${arr.v}, FlipNormal: ${piece.settings3d.flipNormals}`);
  }

  if (outputFile) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(pattern, null, 2), 'utf-8');
    console.log(`\n💾 Saved Seamer project to: ${outputFile}`);
  } else {
    console.log(`\n(Tip: specify an output path to save the .seamer file)`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
