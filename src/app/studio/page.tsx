import { StudioForm } from '@/components/StudioForm';

export const dynamic = 'force-dynamic';

export default function StudioPage() {
  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-2xl font-bold tracking-tight">Prompt Studio</h1>
        <p className="text-sm text-muted mt-1">
          Describe your problem and desired outcome — generate an optimized prompt tuned for Claude,
          GPT, Gemini, Copilot, Cursor, or Perplexity.
        </p>
      </div>
      <StudioForm />
    </div>
  );
}
