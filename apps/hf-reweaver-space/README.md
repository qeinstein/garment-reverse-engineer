---
title: ReWeaver ZeroGPU Garment Reconstructor
emoji: 🧵
colorFrom: indigo
colorTo: purple
sdk: gradio
sdk_version: 5.16.0
app_file: app.py
pinned: false
license: mit
short_description: Multi-view garment reconstruction to 3D & 2D sewing patterns
---

# ReWeaver ZeroGPU Garment Reconstructor

A free, cloud-native garment reconstruction service targeting **Hugging Face ZeroGPU**.

Takes 4 multi-view photos of an existing garment (front, right, back, left) and reconstructs:
1. **3D Surface & Curves**: Draped 3D panels and boundary curves.
2. **2D Sewing Patterns**: Editable 2D pattern panels with metric scaling in millimeters.
3. **Seam Connections**: Topological edge-to-edge stitching pairs derived from shared 3D seam curves.
4. **Canonical GarmentIR**: Emits the standard `GarmentIR` schema (`schema_version: 0.1.0`) ready for Seamer Studio or CAD export.

---

## ZeroGPU Architecture

This Space utilizes dynamic GPU allocation via `@spaces.GPU(duration=60)`:
* **Idle**: 0 GPU consumption (runs on free CPU tier).
* **Active**: Attaches Nvidia A100 / L40S GPU for ~3.5 seconds during forward pass.
* **Weights**: Automatically cached from `SII-LiMing/ReWeaver`.

---

## Programmatic API Usage

You can query this Space programmatically from Python or TypeScript:

### TypeScript / Node.js
```typescript
import { Client } from "@gradio/client";

const client = await Client.connect("qeinstein/reweaver-zero");
const result = await client.predict("/reconstruct", {
  front_img: frontBlob,
  right_img: rightBlob,
  back_img: backBlob,
  left_img: leftBlob,
  variant: "GCD_ori",
});

const garmentIR = JSON.parse(result.data[0]);
console.log("Reconstructed panels:", garmentIR.panels.length);
```

### Python
```python
from gradio_client import Client, handle_file

client = Client("qeinstein/reweaver-zero")
result = client.predict(
    front_img=handle_file("front.png"),
    right_img=handle_file("right.png"),
    back_img=handle_file("back.png"),
    left_img=handle_file("left.png"),
    variant="GCD_ori",
    api_name="/reconstruct"
)
garment_ir_json, npz_path, pattern_image = result
```
