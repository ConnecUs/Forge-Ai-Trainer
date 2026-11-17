import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import TrainerErrorBoundary from '@/components/features/TrainerErrorBoundary';
import { TrainerProvider } from '@/hooks/useTrainer';

const Index = lazy(() => import('@/pages/Index'));
const Training = lazy(() => import('@/pages/Training'));
const Datasets = lazy(() => import('@/pages/Datasets'));
const SkillStudio = lazy(() => import('@/pages/SkillStudio'));
const Capture = lazy(() => import('@/pages/Capture'));
const Models = lazy(() => import('@/pages/Models'));
const TrainedModels = lazy(() => import('@/pages/TrainedModels'));
const TrainedModelDashboard = lazy(() => import('@/pages/TrainedModelDashboard'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <TrainerErrorBoundary>
          <TrainerProvider>
            <BrowserRouter>
              <Sidebar />
              <div className="min-h-screen lg:ml-[232px]">
                <Header />
                <main className="mx-auto max-w-[1600px] p-5 py-8 lg:p-9">
                  <Suspense
                    fallback={
                      <div className="panel p-8 text-muted-foreground" role="status">
                        Loading workspace…
                      </div>
                    }
                  >
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/training" element={<Training />} />
                      <Route path="/datasets" element={<Datasets />} />
                      <Route path="/skills" element={<SkillStudio />} />
                      <Route path="/capture" element={<Capture />} />
                      <Route path="/models" element={<Models />} />
                      <Route path="/trained" element={<TrainedModels />} />
                      <Route path="/trained/:id" element={<TrainedModelDashboard />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </main>
              </div>
            </BrowserRouter>
          </TrainerProvider>
        </TrainerErrorBoundary>
        <Toaster theme="dark" richColors closeButton position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
