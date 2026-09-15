import type { GarmentIR } from '@garment-ir/core';
import { garmentIRToSeamer } from '@garment-ir/seamer-adapter';

/**
 * Exports canonical GarmentIR to a downloadable .seamer pattern file
 * ready for import into Seamer Studio or Atelier CAD.
 */
export function exportToSeamerPattern(garmentIR: GarmentIR) {
  return garmentIRToSeamer(garmentIR);
}

/**
 * Triggers a client-side file download of the .seamer pattern.
 */
export function downloadSeamerPattern(garmentIR: GarmentIR, filename?: string) {
  const pattern = garmentIRToSeamer(garmentIR);
  const jsonStr = JSON.stringify(pattern, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${garmentIR.metadata.id || 'garment'}.seamer`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Triggers a client-side file download of the raw GarmentIR JSON.
 */
export function downloadGarmentIR(garmentIR: GarmentIR, filename?: string) {
  const jsonStr = JSON.stringify(garmentIR, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${garmentIR.metadata.id || 'garment'}.garment-ir.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
