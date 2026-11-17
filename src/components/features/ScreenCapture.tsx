import { useState } from 'react';
import { Camera, ScanLine, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTrainer } from '@/hooks/useTrainer';

export default function ScreenCapture() {
  const { addDataset } = useTrainer();
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);

  const captureScreen = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error(
        'Screen capture is unavailable here. Open the published site in a desktop browser.'
      );
      return;
    }

    setBusy(true);
    let stream: MediaStream | undefined;

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 400));

      const canvas = document.createElement('canvas');
      canvas.width = Math.min(960, video.videoWidth);
      canvas.height = Math.round((video.videoHeight * canvas.width) / video.videoWidth);
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

      setPreview(canvas.toDataURL('image/jpeg', 0.5));
      toast.success('Screenshot captured. Review it before saving.');
    } catch {
      toast.error(
        'Screen sharing was cancelled or blocked. You can try again on the published site.'
      );
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setBusy(false);
    }
  };

  const saveCapture = () => {
    const content = JSON.stringify({
      image: preview,
      captured: new Date().toISOString(),
      note: 'Unannotated screenshot. Requires multimodal preparation for training.',
    });

    addDataset({
      name: `Screen capture · ${new Date().toLocaleTimeString()}`,
      kind: 'Screen',
      examples: 1,
      size: `${(new Blob([content]).size / 1024).toFixed(1)} KB`,
      content,
    });
    setPreview('');
  };

  return (
    <section className="panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-secondary p-2.5 text-primary">
            <ScanLine size={20} />
          </span>
          <div>
            <h2 className="section-title">Screen &amp; workflow capture</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Capture context, with your permission
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          className="h-11 gap-2"
          onClick={() => void captureScreen()}
          disabled={busy}
        >
          <Camera size={16} />
          {busy ? 'Waiting for permission…' : 'Capture screenshot'}
        </Button>
      </div>

      {preview ? (
        <div className="mt-5">
          <img
            src={preview}
            alt="Captured screen for review before adding to a dataset"
            className="max-h-64 rounded-lg border border-border object-contain"
          />
          <div className="mt-4 flex gap-3">
            <Button variant="outline" onClick={saveCapture} className="h-11">
              Save capture
            </Button>
            <Button variant="ghost" onClick={() => setPreview('')} className="h-11">
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex items-start gap-3 rounded-lg bg-background p-4 text-sm leading-6 text-muted-foreground">
          <ShieldCheck size={18} className="mt-1 shrink-0 text-primary" />
          <p>
            Choose a tab, window, or screen. One screenshot is taken, then sharing stops. Images
            require annotation and a vision-compatible model before training.
          </p>
        </div>
      )}
    </section>
  );
}
