import { OptimizerForm } from '@/components/OptimizerForm';

export const dynamic = 'force-dynamic';

export default function OptimizerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Optimizer</h1>
        <p className="text-sm text-muted mt-0.5">
          Paste a prompt to see token cost, category, complexity, and concrete suggestions.
        </p>
      </div>

      <OptimizerForm />
    </div>
  );
}
