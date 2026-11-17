# Froge Trainer

Local Model Fine-Tuning & Dataset Studio — refactored from `Forge_code` into a clean, modular React + TypeScript + Vite architecture.

## Features

- **Workspace Overview**: Live summary of training runs, dataset examples, ready configurations, and active run monitor.
- **Training Runs**: Configure LoRA, QLoRA, and full fine-tuning runs with simulated loss curves, pause/resume controls, and JSON log exports.
- **Datasets & Capture Studio**:
  - Import `.txt`, `.md`, `.json`, and `.jsonl` files (up to 500 KB) with validation and paragraph/record chunking.
  - Author prompt/response conversation pairs directly in the browser.
  - Capture screen/window snapshots via `getDisplayMedia` for multimodal dataset preparation.
- **Model Library**: Inspect base model references and export training configuration JSON recipes.

## Getting Started

```sh
npm install
npm run dev
```

## Scripts

- `npm run dev` — Start Vite dev server on port 8080
- `npm run build` — Production build
- `npm run typecheck` — Run TypeScript compiler check (`tsc --noEmit`)
- `npm run lint` — Run ESLint
