export interface LossPoint {
  step: number;
  loss: number;
}

const LOSS_AMPLITUDE = 2.55;
const LOSS_FLOOR = 0.39;
const PROGRESS_DECAY_DIVISOR = 20;
const STEP_DECAY_DIVISOR = 5;
const STEP_JITTER_AMPLITUDE = 0.07;

/**
 * Computes the simulated scalar training loss for a given progress percentage (0-100).
 */
export function calculateSimulatedLoss(progress: number): number {
  return Number(
    (LOSS_AMPLITUDE * Math.exp(-progress / PROGRESS_DECAY_DIVISOR) + LOSS_FLOOR).toFixed(3)
  );
}

/**
 * Generates a simulated training loss curve up to the current progress percentage.
 */
export function generateLossCurve(progress: number): LossPoint[] {
  const pointCount = Math.max(2, Math.floor(progress / 4) + 1);
  return Array.from({ length: pointCount }, (_, index) => ({
    step: index * 100,
    loss: Number(
      (
        LOSS_AMPLITUDE * Math.exp(-index / STEP_DECAY_DIVISOR) +
        LOSS_FLOOR +
        Math.sin(index * 2) * STEP_JITTER_AMPLITUDE
      ).toFixed(3)
    ),
  }));
}
