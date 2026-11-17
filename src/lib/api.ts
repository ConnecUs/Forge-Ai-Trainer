import type {
  AssignmentStatus,
  AssignmentTargetType,
  BuiltSkillRecord,
  CompileDatasetFormat,
  CompiledDatasetStats,
  Dataset,
  DatasetPreviewResponse,
  EnvironmentInfo,
  HubModelsResponse,
  KnowledgeSourceRecord,
  KnowledgeStatusResponse,
  ModelAvailability,
  SkillValidationLens,
  TrainedModelDetail,
  TrainedModelDetailResponse,
  TrainedModelsResponse,
  TrainingRun,
} from '@/types/trainer';
import type { TrainingValues } from '@/lib/validations';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function fetchHubModels(params?: { q?: string; format?: string }): Promise<HubModelsResponse> {
  const search = new URLSearchParams();
  if (params?.q) search.set('q', params.q);
  if (params?.format && params.format !== 'all') search.set('format', params.format);
  const qs = search.toString();
  return requestJson<HubModelsResponse>(`/api/hub/models${qs ? `?${qs}` : ''}`);
}

export function fetchEnvironment(): Promise<EnvironmentInfo> {
  return requestJson<EnvironmentInfo>('/api/environment');
}

export function setupEnvironment(): Promise<{ ok: boolean; message?: string; error?: string }> {
  return requestJson<{ ok: boolean; message?: string; error?: string }>('/api/environment/setup', {
    method: 'POST',
  });
}

export async function fetchDatasets(): Promise<Dataset[]> {
  const data = await requestJson<{ datasets: Dataset[] }>('/api/datasets');
  return data.datasets;
}

export async function createDataset(
  payload: Omit<Dataset, 'id' | 'created'>
): Promise<Dataset> {
  const data = await requestJson<{ dataset: Dataset }>('/api/datasets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.dataset;
}

export async function deleteDataset(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/datasets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchRuns(): Promise<TrainingRun[]> {
  const data = await requestJson<{ runs: TrainingRun[] }>('/api/runs');
  return data.runs;
}

export async function createRun(payload: TrainingValues): Promise<TrainingRun> {
  const data = await requestJson<{ run: TrainingRun }>('/api/runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.run;
}

export async function toggleRunState(id: string): Promise<TrainingRun> {
  const data = await requestJson<{ run: TrainingRun }>(
    `/api/runs/${encodeURIComponent(id)}/toggle`,
    { method: 'POST' }
  );
  return data.run;
}

export async function deleteRun(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/runs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function fetchTrainedModels(): Promise<TrainedModelsResponse> {
  return requestJson<TrainedModelsResponse>('/api/trained-models');
}

export function fetchTrainedModel(id: string): Promise<TrainedModelDetailResponse> {
  return requestJson<TrainedModelDetailResponse>(`/api/trained-models/${encodeURIComponent(id)}`);
}

export async function updateTrainedModel(
  id: string,
  payload: {
    displayName?: string;
    availability?: ModelAvailability;
    notes?: string;
    tags?: string[];
  }
): Promise<TrainedModelDetail> {
  const data = await requestJson<{ model: TrainedModelDetail }>(
    `/api/trained-models/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
  return data.model;
}

export async function addModelAssignment(
  id: string,
  payload: {
    appName: string;
    processName?: string;
    targetType?: AssignmentTargetType;
    status?: AssignmentStatus;
    port?: number;
    pathOrCommand?: string;
    endpoint?: string;
    notes?: string;
  }
): Promise<TrainedModelDetail> {
  const data = await requestJson<{ model: TrainedModelDetail }>(
    `/api/trained-models/${encodeURIComponent(id)}/assignments`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return data.model;
}

export async function updateModelAssignment(
  id: string,
  assignmentId: string,
  payload: {
    status?: AssignmentStatus;
    port?: number;
    processName?: string;
    pathOrCommand?: string;
    endpoint?: string;
    notes?: string;
  }
): Promise<TrainedModelDetail> {
  const data = await requestJson<{ model: TrainedModelDetail }>(
    `/api/trained-models/${encodeURIComponent(id)}/assignments/${encodeURIComponent(assignmentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
  return data.model;
}

export async function deleteModelAssignment(
  id: string,
  assignmentId: string
): Promise<TrainedModelDetail> {
  const data = await requestJson<{ model: TrainedModelDetail }>(
    `/api/trained-models/${encodeURIComponent(id)}/assignments/${encodeURIComponent(assignmentId)}`,
    {
      method: 'DELETE',
    }
  );
  return data.model;
}

export async function pingModelTelemetry(id: string): Promise<TrainedModelDetail> {
  const data = await requestJson<{ model: TrainedModelDetail }>(
    `/api/trained-models/${encodeURIComponent(id)}/telemetry/ping`,
    {
      method: 'POST',
    }
  );
  return data.model;
}

export function fetchKnowledgeStatus(): Promise<KnowledgeStatusResponse> {
  return requestJson<KnowledgeStatusResponse>('/api/knowledge/status');
}

export async function ingestKnowledgeSource(payload: {
  name?: string;
  mode: 'text' | 'technical';
  localPaths?: string[];
  rawText?: string;
  uploadedFiles?: Array<{ name: string; contentBase64: string }>;
}): Promise<KnowledgeSourceRecord> {
  const data = await requestJson<{ knowledge: KnowledgeSourceRecord }>('/api/knowledge/ingest', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.knowledge;
}

export async function deleteKnowledgeSource(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/knowledge/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function buildSkillPackage(payload: {
  sourceId: string;
  slug?: string;
  title?: string;
  description?: string;
  lens: SkillValidationLens;
}): Promise<BuiltSkillRecord> {
  const data = await requestJson<{ skill: BuiltSkillRecord }>('/api/skills/build', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.skill;
}

export function fetchSkillFiles(
  id: string,
  workspacePath?: string
): Promise<{ files: Array<{ name: string; content: string }> }> {
  const qs = workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : '';
  return requestJson<{ files: Array<{ name: string; content: string }> }>(
    `/api/skills/${encodeURIComponent(id)}/files${qs}`
  );
}

export async function deleteSkillPackage(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/skills/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function compileDatasetFromKnowledge(payload: {
  sourceId?: string;
  skillId?: string;
  workspaceSkillPath?: string;
  name?: string;
  format: CompileDatasetFormat;
  targetTokens: number;
  systemPrompt?: string;
}): Promise<{ dataset: Dataset; stats: CompiledDatasetStats }> {
  return requestJson<{ dataset: Dataset; stats: CompiledDatasetStats }>('/api/datasets/compile', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchDatasetPreview(id: string): Promise<DatasetPreviewResponse> {
  return requestJson<DatasetPreviewResponse>(`/api/datasets/${encodeURIComponent(id)}/preview`);
}
