import type { BaseModelInfo, TrainerState } from '@/types/trainer';

export const STORAGE_KEY = 'froge-trainer-v1';

export const SIMULATION_TICK_MS = 1800;

export const MAX_IMPORT_FILE_BYTES = 500_000;

export const BASE_MODELS: BaseModelInfo[] = [
  {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 · 3B',
    description: 'Lightweight personal assistant',
  },
  {
    id: 'mistral-7b-v0.3',
    name: 'Mistral 7B · v0.3',
    description: 'General-purpose instruction tuning',
  },
  {
    id: 'qwen-2.5-7b',
    name: 'Qwen 2.5 · 7B',
    description: 'Multilingual knowledge and reasoning',
  },
  {
    id: 'gemma-2-2b',
    name: 'Gemma 2 · 2B',
    description: 'Compact local experimentation',
  },
];

export const INITIAL_STATE: TrainerState = {
  datasets: [
    {
      id: 'personal',
      name: 'Personal knowledge',
      kind: 'Documents',
      examples: 1248,
      size: '4.8 MB',
      created: '2026-11-14',
    },
    {
      id: 'dialogue',
      name: 'Assistant conversations',
      kind: 'Conversations',
      examples: 856,
      size: '2.1 MB',
      created: '2026-11-13',
    },
    {
      id: 'workflow',
      name: 'Daily workflows',
      kind: 'Screen',
      examples: 312,
      size: '18.4 MB',
      created: '2026-11-12',
    },
  ],
  runs: [
    {
      id: 'demo-run',
      name: 'Personal assistant v2',
      model: 'Llama 3.2 · 3B',
      method: 'QLoRA',
      dataset: 'Personal knowledge',
      epochs: 3,
      rank: 16,
      learningRate: '0.0002',
      progress: 68,
      status: 'paused',
      created: '2026-11-14',
    },
  ],
};
