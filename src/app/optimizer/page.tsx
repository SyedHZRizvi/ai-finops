import { OptimizerForm } from '@/components/OptimizerForm';

export const dynamic = 'force-dynamic';

export default function OptimizerPage() {
  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-2xl font-bold tracking-tight">Optimizer</h1>
        <p className="text-sm text-muted mt-1">
          Paste a prompt to see token cost, category, complexity, and concrete suggestions.
        </p>
      </div>

      <OptimizerForm />
    </div>
  );
}
