# Hugging Face ZeroGPU Deployment Guide

This guide provides step-by-step instructions to deploy the ReWeaver reconstruction service to a free **Hugging Face ZeroGPU Space** and verify the deployed production endpoint.

---

## 1. Prerequisites & Account Setup

* A free [Hugging Face account](https://huggingface.co/join).
* Git installed locally with Git LFS (optional, since model weights are fetched dynamically from the Hub and not committed).
* Optional: A Hugging Face User Access Token (only required if configuring a **Private** Space or automated git push).

---

## 2. Space Configuration Parameters

When creating the Space in the Hugging Face web console:

| Configuration Field | Recommended Setting | Rationale |
| :--- | :--- | :--- |
| **Owner** | Your Hugging Face username or organization | Primary account |
| **Space Name** | `reweaver-zero` | Clean, predictable URL: `https://huggingface.co/spaces/<user>/reweaver-zero` |
| **License** | `mit` | Permissive open source |
| **Space SDK** | **`Gradio`** | Standard Python runtime. Do **not** select Docker; Gradio SDK natively supports ZeroGPU. |
| **Gradio Version** | `5.16.0` (or leave default 5.x) | Matches `apps/hf-reweaver-space/requirements.txt` |
| **Space Hardware** | **`ZeroGPU` (A100 / L40S, free tier)** | Dynamically assigns 24–48GB VRAM slice on-demand during inference calls. |
| **Visibility** | **`Public` (Recommended for prototype)** | Allows direct tokenless browser/API queries from the Vercel web app. |

> [!TIP]
> **Public vs. Private Recommendation**:
> * **Public**: Best for getting started. Does not require passing tokens from Vercel or managing token rotation.
> * **Private**: If you require privacy, the Space must be queried through the Vercel server-side proxy (`/api/reconstruct`) using an authenticated `HF_TOKEN`. Never expose an HF token in browser-facing code!

---

## 3. Required Secrets & Environment Variables

### In the Hugging Face Space
* **Required Secrets**: **NONE**.
* **Required Environment Variables**: **NONE**.
* **Model Repo Access**: The official model weights reside at [`SII-LiMing/ReWeaver`](https://huggingface.co/SII-LiMing/ReWeaver), which is a public model repository. No authentication is needed to download the checkpoints.

### If Configuring a Private Space
If you set the Space to **Private**, the Space itself still needs no secrets, but the calling client (the Vercel app or smoke test) must provide an authenticated token:
* Go to [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
* Create a new token with **`Read`** permission.
* Configure this token as `HF_TOKEN` in your Vercel project settings or local `.env`.
* Minimum required permission: **`read`**. Never use a `write` or `admin` token for inference.

---

## 4. Step-by-Step Deployment Instructions

`apps/hf-reweaver-space` is completely self-contained. It contains `app.py`, `requirements.txt`, `README.md`, and the bundled reconstruction engine in `reweaver/`.

### Method A: Direct Git Push (Fastest)

1. **Create the Space on Hugging Face**:
   * Navigate to [huggingface.co/new-space](https://huggingface.co/new-space).
   * Name: `reweaver-zero`
   * SDK: `Gradio`
   * Hardware: `ZeroGPU` (under "GPU" section, select "ZeroGPU (Free)").
   * Click **Create Space**.

2. **Clone the Space Repository locally or push from `apps/hf-reweaver-space`**:
   ```bash
   # From the root of garment-reverse-engineer:
   cd apps/hf-reweaver-space

   # Initialize a temporary git repository or add the space remote
   git init -b main
   git remote add space https://huggingface.co/spaces/<YOUR_HF_USERNAME>/reweaver-zero

   # Commit the self-contained space package
   git add .
   git commit -m "Deploy ReWeaver ZeroGPU Space"

   # Push to Hugging Face (will prompt for HF username and password/token)
   git push -f space main
   ```
   *(Note: For password prompt, use a Hugging Face Access Token with `write` permission).*

---

## 5. Monitoring Build and Runtime Lifecycle

1. **Build Phase (Container Initialization)**:
   * Open `https://huggingface.co/spaces/<YOUR_HF_USERNAME>/reweaver-zero`.
   * Click **Logs** at the top right.
   * Verify the build output:
     - Debian base image initialized.
     - `pip install -r requirements.txt` succeeds without compilation errors (all packages are binary wheels).
     - Status transitions from `Building` to `Running`.
   * Total build duration: typically **15 to 40 seconds**.

2. **Runtime Phase (ZeroGPU Allocation)**:
   * When the application boots, `pipeline = get_pipeline()` loads the model architecture onto CPU memory.
   * When a reconstruction request arrives at `/reconstruct`, `@spaces.GPU(duration=60)` triggers the ZeroGPU scheduler.
   * You will observe in the runtime log:
     ```text
     [ZeroGPU] Attaching GPU (A100-SXM4-80GB)
     Loading weights from cache...
     Forward pass duration: ~3.4s
     [ZeroGPU] Releasing GPU
     ```

3. **Rebuild / Restart Procedure**:
   * If you need to force a clean restart:
     1. Click **Settings** on the Space page.
     2. Scroll to **Factory rebuild** and click **Rebuild Space**.

---

## 6. Manual Verification & Smoke Testing

Once the Space shows `Running`, verify it using the repository's automated smoke test:

### Running from the Repository
```bash
# Public Space:
HF_SPACE_URL="https://huggingface.co/spaces/<YOUR_HF_USERNAME>/reweaver-zero" pnpm smoke:hf

# Or with Python:
HF_SPACE_URL="https://huggingface.co/spaces/<YOUR_HF_USERNAME>/reweaver-zero" python3 scripts/smoke_hf_space.py

# Private Space (requires token):
HF_SPACE_URL="https://huggingface.co/spaces/<YOUR_HF_USERNAME>/reweaver-zero" HF_TOKEN="hf_..." pnpm smoke:hf
```

### Manual curl Test
```bash
curl -X POST "https://<YOUR_HF_USERNAME>-reweaver-zero.hf.space/gradio_api/call/reconstruct" \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      "data:image/png;base64,iVBORw0KGgo...",
      "data:image/png;base64,iVBORw0KGgo...",
      "data:image/png;base64,iVBORw0KGgo...",
      "data:image/png;base64,iVBORw0KGgo...",
      "GCD_ori"
    ]
  }'
```
