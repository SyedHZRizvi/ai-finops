// Public surface of the importers module.
//
// The API layer imports `getImporter(provider)` to dispatch a run, and
// `listImporters()` to render the import UI's provider picker.
// `encrypt` / `decrypt` are re-exported so the API layer can persist
// credentials without depending on a separate crypto module.

export * from './types';
export { encrypt, decrypt, getKey } from './crypto';
export type { EncryptedBlob } from './crypto';

import type { Importer, SupportedProvider } from './types';
import { anthropicImporter } from './anthropic';
import { openaiImporter } from './openai';
import { csvImporter } from './csv';

const REGISTRY: Record<SupportedProvider, Importer> = {
  anthropic: anthropicImporter,
  openai: openaiImporter,
  csv: csvImporter,
  google: {
    provider: 'google',
    label: 'Google Cloud Billing',
    run: async () => {
      throw new Error('Google importer not yet implemented');
    },
  },
  azure: {
    provider: 'azure',
    label: 'Azure OpenAI',
    run: async () => {
      throw new Error('Azure importer not yet implemented');
    },
  },
};

export function getImporter(provider: SupportedProvider): Importer {
  const imp = REGISTRY[provider];
  if (!imp) throw new Error(`Unknown importer: ${provider}`);
  return imp;
}

export interface ImporterListEntry {
  provider: SupportedProvider;
  label: string;
  implemented: boolean;
}

export function listImporters(): ImporterListEntry[] {
  return [
    { provider: 'anthropic', label: 'Anthropic (admin API)', implemented: true },
    { provider: 'openai', label: 'OpenAI (org usage API)', implemented: true },
    { provider: 'csv', label: 'Generic CSV upload', implemented: true },
    { provider: 'google', label: 'Google Cloud Billing', implemented: false },
    { provider: 'azure', label: 'Azure OpenAI', implemented: false },
  ];
}
