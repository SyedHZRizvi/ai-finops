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
import { bedrockImporter } from './bedrock';
import { vertexImporter } from './vertex';
import { azureImporter } from './azure';

// `google` is the legacy slot for the Google Cloud / Vertex AI importer;
// it now resolves to the same stub as the canonical `vertex` provider so
// any credentials stored under the old name keep working. The card UI
// surfaces only the new name.
const googleAlias: Importer = {
  provider: 'google',
  label: vertexImporter.label,
  run: vertexImporter.run,
};

const REGISTRY: Record<SupportedProvider, Importer> = {
  anthropic: anthropicImporter,
  openai: openaiImporter,
  csv: csvImporter,
  bedrock: bedrockImporter,
  vertex: vertexImporter,
  azure: azureImporter,
  google: googleAlias,
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
    { provider: 'bedrock', label: 'Amazon Bedrock (Cost Explorer)', implemented: false },
    { provider: 'vertex', label: 'Google Vertex AI (Cloud Billing)', implemented: false },
    { provider: 'azure', label: 'Azure OpenAI (Cost Management)', implemented: false },
  ];
}
