import { ApiKeyCreateForm } from '@/components/ApiKeyCreateForm';
import { ApiKeyList, type ApiKeyListItem } from '@/components/ApiKeyList';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

interface ApiKeyListResponse {
  items: ApiKeyListItem[];
  error?: string;
}

async function loadApiKeys(): Promise<{ items: ApiKeyListItem[] | null; error: string | null }> {
  try {
    const r = await fetch(`${BASE_URL}/api/api-keys`, { cache: 'no-store' });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return { items: null, error: j.error ?? `Status ${r.status}` };
    }
    const json = (await r.json()) as ApiKeyListResponse;
    return { items: Array.isArray(json.items) ? json.items : [], error: null };
  } catch (err) {
    return { items: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export default async function ApiKeysPage() {
  const { items, error } = await loadApiKeys();
  const isEmpty = items !== null && items.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="API keys"
        gradient
        subtitle="Issue per-app ingest tokens. Scope to specific app names, set expiry, and revoke independently. Each token's last-used timestamp is tracked so stale keys are easy to find and retire."
      />

      <ApiKeyCreateForm />

      {error && (
        <div className="card card-pad border-warn/40 bg-warn/5 text-sm text-warn">
          Couldn&apos;t load keys: {error}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          title="No API keys yet"
          subtitle="Issue your first per-app ingest token above. The raw token is shown exactly once — copy it then, because it can't be recovered later."
          variant="brand"
        />
      )}

      {items && items.length > 0 && <ApiKeyList items={items} />}
    </div>
  );
}
