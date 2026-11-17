import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MessageSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTrainer } from '@/hooks/useTrainer';
import { conversationSchema, type ConversationValues } from '@/lib/validations';

export default function ConversationForm() {
  const { addDataset } = useTrainer();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConversationValues>({
    resolver: zodResolver(conversationSchema),
  });

  const onSubmit = (values: ConversationValues) => {
    const content = JSON.stringify({
      messages: [
        { role: 'user', content: values.prompt },
        { role: 'assistant', content: values.response },
      ],
    });

    addDataset({
      name: `Conversation · ${values.prompt.slice(0, 30)}`,
      kind: 'Conversations',
      examples: 1,
      size: `${(new Blob([content]).size / 1024).toFixed(1)} KB`,
      content,
    });
    reset();
  };

  return (
    <section className="panel p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="rounded-lg bg-secondary p-2.5 text-primary">
          <MessageSquare size={20} />
        </span>
        <div>
          <h2 className="section-title">Capture a conversation</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Teach your assistant how to respond
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="prompt" className="mb-2 block text-sm">
            Your prompt
          </label>
          <textarea
            id="prompt"
            rows={2}
            maxLength={20000}
            className="field resize-y"
            placeholder="What should your assistant understand?"
            {...register('prompt')}
          />
          {errors.prompt && (
            <p role="alert" className="text-sm text-destructive">
              ! {errors.prompt.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="response" className="mb-2 block text-sm">
            Ideal assistant response
          </label>
          <textarea
            id="response"
            rows={3}
            maxLength={20000}
            className="field resize-y"
            placeholder="Write the response you want to teach it…"
            {...register('response')}
          />
          {errors.response && (
            <p role="alert" className="text-sm text-destructive">
              ! {errors.response.message}
            </p>
          )}
        </div>

        <Button type="submit" variant="outline" className="h-11 w-full gap-2">
          <Plus size={16} />
          Save conversation example
        </Button>
      </form>
    </section>
  );
}
