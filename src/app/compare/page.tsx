import { CompareForm } from '@/components/CompareForm';

export const dynamic = 'force-dynamic';

export default function ComparePage() {
  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-2xl font-bold tracking-tight">A/B Prompt Compare</h1>
        <p className="text-sm text-muted mt-1">
          Drop two prompts in. See exactly what changed and what it saves.
        </p>
      </div>

      <CompareForm />
    </div>
  );
}
