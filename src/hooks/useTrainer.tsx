import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createDataset,
  createRun,
  deleteDataset,
  deleteRun,
  fetchDatasets,
  fetchEnvironment,
  fetchHubModels,
  fetchRuns,
  fetchTrainedModels,
  setupEnvironment,
  toggleRunState,
} from '@/lib/api';
import type { TrainingValues } from '@/lib/validations';
import type {
  Dataset,
  DiscoveredApp,
  EnvironmentInfo,
  HubModel,
  HubModelsResponse,
  TrainedModelDetail,
  TrainingRun,
} from '@/types/trainer';

interface TrainerContextValue {
  datasets: Dataset[];
  runs: TrainingRun[];
  trainedModels: TrainedModelDetail[];
  discoveredApps: DiscoveredApp[];
  hubModels: HubModel[];
  hubStatus: HubModelsResponse | undefined;
  environment: EnvironmentInfo | undefined;
  refreshHub: () => void;
  refreshTrainedModels: () => void;
  repairEnvironment: () => Promise<void>;
  addDataset: (data: Omit<Dataset, 'id' | 'created'>) => Promise<void>;
  removeDataset: (id: string) => Promise<void>;
  startRun: (data: TrainingValues) => Promise<void>;
  toggleRun: (id: string) => Promise<void>;
  removeRun: (id: string) => Promise<void>;
}

const TrainerContext = createContext<TrainerContextValue | null>(null);

export function TrainerProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const datasetsQuery = useQuery({
    queryKey: ['datasets'],
    queryFn: fetchDatasets,
    initialData: [],
  });

  const runsQuery = useQuery({
    queryKey: ['runs'],
    queryFn: fetchRuns,
    initialData: [],
    refetchInterval: (query) => {
      const runs = query.state.data || [];
      return runs.some((run) => run.status === 'running') ? 1500 : false;
    },
  });

  const hubQuery = useQuery({
    queryKey: ['hub-models'],
    queryFn: () => fetchHubModels(),
    staleTime: 30_000,
  });

  const envQuery = useQuery({
    queryKey: ['environment'],
    queryFn: fetchEnvironment,
    refetchInterval: 15_000,
  });

  const trainedQuery = useQuery({
    queryKey: ['trained-models'],
    queryFn: fetchTrainedModels,
    refetchInterval: 15_000,
  });

  const addDataset = async (data: Omit<Dataset, 'id' | 'created'>) => {
    try {
      await createDataset(data);
      await queryClient.invalidateQueries({ queryKey: ['datasets'] });
      toast.success('Saved to local dataset library');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save dataset');
    }
  };

  const removeDataset = async (id: string) => {
    try {
      await deleteDataset(id);
      await queryClient.invalidateQueries({ queryKey: ['datasets'] });
      toast.success('Dataset removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove dataset');
    }
  };

  const startRun = async (data: TrainingValues) => {
    try {
      await createRun(data);
      await queryClient.invalidateQueries({ queryKey: ['runs'] });
      await queryClient.invalidateQueries({ queryKey: ['trained-models'] });
      toast.success('Training run queued');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start training run');
    }
  };

  const toggleRun = async (id: string) => {
    try {
      await toggleRunState(id);
      await queryClient.invalidateQueries({ queryKey: ['runs'] });
      await queryClient.invalidateQueries({ queryKey: ['trained-models'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update training run');
    }
  };

  const removeRun = async (id: string) => {
    try {
      await deleteRun(id);
      await queryClient.invalidateQueries({ queryKey: ['runs'] });
      await queryClient.invalidateQueries({ queryKey: ['trained-models'] });
      toast.success('Training run removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete training run');
    }
  };

  const refreshHub = () => {
    void queryClient.invalidateQueries({ queryKey: ['hub-models'] });
    void queryClient.invalidateQueries({ queryKey: ['environment'] });
  };

  const refreshTrainedModels = () => {
    void queryClient.invalidateQueries({ queryKey: ['trained-models'] });
  };

  const repairEnvironment = async () => {
    const toastId = toast.loading('Detecting/configuring CUDA Python environment…');
    try {
      const result = await setupEnvironment();
      await queryClient.invalidateQueries({ queryKey: ['environment'] });
      toast.success(result.message || 'Python CUDA environment ready', { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Environment setup failed', {
        id: toastId,
      });
    }
  };

  return (
    <TrainerContext.Provider
      value={{
        datasets: datasetsQuery.data,
        runs: runsQuery.data,
        trainedModels: trainedQuery.data?.models ?? [],
        discoveredApps: trainedQuery.data?.discoveredApps ?? [],
        hubModels: hubQuery.data?.models ?? [],
        hubStatus: hubQuery.data,
        environment: envQuery.data,
        refreshHub,
        refreshTrainedModels,
        repairEnvironment,
        addDataset,
        removeDataset,
        startRun,
        toggleRun,
        removeRun,
      }}
    >
      {children}
    </TrainerContext.Provider>
  );
}

export function useTrainer(): TrainerContextValue {
  const context = useContext(TrainerContext);
  if (!context) {
    throw new Error('TrainerProvider is required');
  }
  return context;
}
