import { z } from 'zod';

export const trainingSchema = z.object({
  name: z.string().trim().min(3, 'Enter at least 3 characters.'),
  model: z.string().min(1, 'Select a model.'),
  modelId: z.string().optional(),
  modelPath: z.string().optional(),
  method: z.enum(['QLoRA', 'LoRA', 'Full fine-tune']),
  dataset: z.string().min(1, 'Select a dataset.'),
  epochs: z.coerce.number().int().min(1).max(20),
  rank: z.coerce.number().int().min(4).max(128),
  learningRate: z
    .string()
    .refine(
      (value) => Number(value) > 0 && Number(value) <= 0.1,
      'Use a rate between 0 and 0.1.'
    ),
  autoBalance: z.boolean().default(true),
});

export type TrainingValues = z.infer<typeof trainingSchema>;

export const conversationSchema = z.object({
  prompt: z.string().trim().min(1, 'Enter a prompt.'),
  response: z.string().trim().min(1, 'Enter a response.'),
});

export type ConversationValues = z.infer<typeof conversationSchema>;
