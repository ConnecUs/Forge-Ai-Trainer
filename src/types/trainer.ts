export type DatasetKind = 'Documents' | 'Conversations' | 'Screen';

export type TrainingMethod = 'QLoRA' | 'LoRA' | 'Full fine-tune';

export type RunStatus = 'running' | 'paused' | 'completed' | 'failed';

export interface LossPoint {
  step: number;
  loss: number;
}

export interface Dataset {
  id: string;
  name: string;
  kind: DatasetKind;
  examples: number;
  size: string;
  content?: string;
  filePath?: string;
  created: string;
}

export interface TrainingRun {
  id: string;
  name: string;
  model: string;
  modelId?: string;
  modelPath?: string;
  method: TrainingMethod;
  dataset: string;
  epochs: number;
  rank: number;
  learningRate: string;
  autoBalance?: boolean;
  progress: number;
  status: RunStatus;
  currentLoss?: number;
  lossHistory?: LossPoint[];
  logs?: string[];
  error?: string;
  outputDir?: string;
  created: string;
}

export interface TrainerState {
  datasets: Dataset[];
  runs: TrainingRun[];
}

export interface BaseModelInfo {
  id: string;
  name: string;
  description: string;
}

export interface HubModel {
  id: string;
  name: string;
  type: string;
  format: string;
  path: string;
  filename: string;
  directory: string;
  size_bytes: number;
  size_formatted: string;
  last_modified?: string;
  category?: string;
  architecture?: string;
  quantization?: string;
  is_lora?: boolean;
  trainable?: boolean;
  trainableReason?: string;
}

export interface HubModelsResponse {
  connected: boolean;
  hubUrl: string;
  error?: string;
  models: HubModel[];
  totalCount: number;
  totalSizeFormatted: string;
  lastScanned: string | null;
  scannedPaths: string[];
}

export interface GpuTelemetry {
  name: string;
  totalMb: number;
  freeMb: number;
  usedMb: number;
  utilizationPct: number;
  temperatureC: number;
}

export interface EnvironmentInfo {
  agentConnected: boolean;
  gpu: GpuTelemetry | null;
  pythonCommand: string;
  python: {
    pythonVersion: string | null;
    cudaAvailable: boolean;
    cudaVersion?: string | null;
    deviceName?: string | null;
    cudaToolkitPath?: string | null;
    tritonCudaReady?: boolean;
    packages: Record<string, string | null>;
    error?: string;
  };
  trainingReady: boolean;
  hub: {
    connected: boolean;
    modelCount: number;
    totalSizeFormatted: string;
  };
}

export type ModelAvailability = 'available' | 'assigned' | 'archived';

export type AssignmentStatus = 'assigned' | 'available' | 'disabled';

export type AssignmentTargetType = 'app' | 'process' | 'service';

export interface ModelAssignment {
  id: string;
  appName: string;
  processName?: string;
  targetType: AssignmentTargetType;
  status: AssignmentStatus;
  port?: number;
  pathOrCommand?: string;
  endpoint?: string;
  notes?: string;
  updatedAt: string;
  liveStatus: 'online' | 'offline' | 'unknown';
  matchedPid?: number;
  matchedProcess?: string;
  listeningPorts: number[];
  memoryMb?: number;
}

export interface TelemetryLogEntry {
  id: string;
  timestamp: string;
  event: string;
  message: string;
}

export interface TelemetryPoint {
  step: number;
  epoch?: number;
  loss?: number;
  learningRate?: number;
  gradNorm?: number;
  entropy?: number;
  meanTokenAccuracy?: number;
  numTokens?: number;
}

export interface ModelArtifactFile {
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  modifiedAt: string;
}

export interface ModelCheckpointInfo {
  name: string;
  step: number;
  epoch?: number;
  sizeBytes: number;
  sizeFormatted: string;
  modifiedAt?: string;
}

export interface ProceduralKpi {
  id: string;
  label: string;
  value: string;
  detail: string;
}

export interface ProceduralChartSpec {
  id: string;
  title: string;
  subtitle: string;
  dataKey: keyof TelemetryPoint;
  unit: string;
  colorToken: 'primary' | 'chart';
}

export interface TrainedModelDetail {
  id: string;
  displayName: string;
  runName: string;
  baseModel: string;
  baseModelPath?: string;
  outputDir: string;
  adapterReady: boolean;
  adapterBytes: number;
  adapterSizeFormatted: string;
  totalArtifactBytes: number;
  totalArtifactSizeFormatted: string;
  method: TrainingMethod;
  dataset: string;
  epochs: number;
  rank: number;
  loraAlpha: number;
  targetModules: string[];
  learningRate: string;
  created: string;
  availability: ModelAvailability;
  notes: string;
  tags: string[];
  assignments: ModelAssignment[];
  telemetryLog: TelemetryLogEntry[];
  updatedAt: string;
  architecture: {
    archetype: string;
    architectureName: string;
    modelType?: string;
    hiddenSize?: number;
    numLayers?: number;
    numHeads?: number;
    vocabSize?: number;
    maxPositionEmbeddings?: number;
    torchDtype?: string;
    hasChatTemplate: boolean;
    hasTokenizer: boolean;
  };
  telemetrySummary: {
    totalSteps: number;
    maxSteps: number;
    epochsCompleted: number;
    finalLoss?: number;
    bestLoss?: number;
    bestLossStep?: number;
    finalAccuracy?: number;
    bestAccuracy?: number;
    finalEntropy?: number;
    finalGradNorm?: number;
    totalTokensProcessed?: number;
    totalFlos?: number;
  };
  telemetrySeries: TelemetryPoint[];
  checkpoints: ModelCheckpointInfo[];
  files: ModelArtifactFile[];
  dashboardSpec: {
    archetype: string;
    capabilities: string[];
    kpis: ProceduralKpi[];
    metricsWidgets: ProceduralChartSpec[];
    pythonSnippet: string;
    jsonDescriptor: string;
  };
}

export interface DiscoveredApp {
  id: string;
  name: string;
  targetType: AssignmentTargetType;
  port?: number;
  processName?: string;
  pathOrCommand: string;
  source: string;
}

export interface TrainedModelsResponse {
  models: TrainedModelDetail[];
  discoveredApps: DiscoveredApp[];
  liveProcessCount: number;
  listeningPortCount: number;
}

export interface TrainedModelDetailResponse {
  model: TrainedModelDetail;
  discoveredApps: DiscoveredApp[];
  gpu: GpuTelemetry | null;
  liveProcessCount: number;
  listeningPortCount: number;
}
