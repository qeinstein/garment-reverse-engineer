# Vercel Deployment Guide

This guide provides exact, manual deployment instructions to deploy the `apps/web` application to **Vercel**.

---

## 1. Vercel Project Settings

When importing the repository into Vercel, configure the following project settings:

| Configuration Field | Setting | Explanation |
| :--- | :--- | :--- |
| **Framework Preset** | **`Vite`** | Automatically detects Vite single-page application and outputs to `dist`. |
| **Root Directory** | **`apps/web`** | **CRITICAL**: Do NOT leave as repository root. Set to `apps/web`. |
| **Build Command** | `pnpm build` (or leave default) | Runs `vite build` within `apps/web`. |
| **Output Directory** | `dist` (default) | Standard static assets directory. |
| **Install Command** | `pnpm install` | Monorepo package linking via pnpm workspace. |
| **Node.js Version** | **`20.x`** | Matches local environment (Node 20.20.1). |

---

## 2. Environment Variables Configuration

Configure the following variables in the **Environment Variables** tab of your Vercel Project Settings:

### For Public Hugging Face Space (Recommended)
| Variable Name | Value | Environments | Secret? |
| :--- | :--- | :--- | :--- |
| `PUBLIC_HF_REWEAVER_SPACE_URL` | `https://huggingface.co/spaces/<your-username>/reweaver-zero` | Production, Preview, Development | **No** (Public) |
| `PUBLIC_RECONSTRUCTION_MODE` | `direct` | Production, Preview, Development | **No** (Public) |

### For Private Hugging Face Space
| Variable Name | Value | Environments | Secret? |
| :--- | :--- | :--- | :--- |
| `PUBLIC_HF_REWEAVER_SPACE_URL` | `https://huggingface.co/spaces/<your-username>/reweaver-zero` | Production, Preview, Development | **No** (Public) |
| `PUBLIC_RECONSTRUCTION_MODE` | `proxy` | Production, Preview, Development | **No** (Public) |
| `HF_TOKEN` | `hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | Production, Preview, Development | **YES (Server-Only)** |

> [!CAUTION]
> **NEVER** name the secret token `PUBLIC_HF_TOKEN` or `NEXT_PUBLIC_HF_TOKEN`. The `HF_TOKEN` must remain strictly server-side inside the `/api/reconstruct` serverless proxy function.

---

## 3. Serverless Proxy & CORS Architecture

* **Direct Mode (`PUBLIC_RECONSTRUCTION_MODE=direct`)**:
  * Browser client communicates directly with Hugging Face ZeroGPU Space using `@gradio/client` WebSockets and REST.
  * Hugging Face Spaces natively support cross-origin requests from Gradio clients.
  * Lowest latency; zero Vercel serverless execution cost.

* **Proxy Mode (`PUBLIC_RECONSTRUCTION_MODE=proxy`)**:
  * Browser sends multipart or JSON image payloads to `/api/reconstruct` on the same Vercel origin.
  * The Vercel serverless function attaches `Authorization: Bearer <HF_TOKEN>` and forwards to the private Space.
  * CORS is eliminated because the browser calls its own origin.

---

## 4. Step-by-Step Manual Deployment Checklist

1. Log into your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** → **Project**.
3. Select the GitHub repository: `qeinstein/garment-reverse-engineer`.
4. Under **Project Settings**:
   * Click **Edit** next to **Root Directory**.
   * Select `apps/web`.
   * Framework Preset: Select `Vite`.
5. Expand **Environment Variables**:
   * Add `PUBLIC_HF_REWEAVER_SPACE_URL` with your Hugging Face Space URL.
   * Add `PUBLIC_RECONSTRUCTION_MODE` with `direct`.
   * (If Space is Private): Add `HF_TOKEN` with your Hugging Face Access Token.
6. Click **Deploy**.
7. Wait ~45 seconds for Vercel build to complete.
8. Copy the generated Vercel production URL (e.g. `https://garment-reverse-engineer-xxx.vercel.app`).
9. Open the URL in your browser:
   * Upload 4 viewpoint photos (front, right, back, left).
   * Click **Reconstruct Garment**.
   * Verify the recovered 2D sewing panels, seams, and 3D preview appear in the interactive viewer.
