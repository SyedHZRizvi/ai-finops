import { StudioForm } from '@/components/StudioForm';

export const dynamic = 'force-dynamic';

export default function StudioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Prompt Studio</h1>
        <p className="text-sm text-muted mt-0.5">
          Describe your problem and desired outcome — generate an optimized prompt
          tuned for Claude, GPT, Gemini, Copilot, Cursor, or Perplexity.
        </p>
      </div>
      <StudioForm />
    </div>
  );
}
