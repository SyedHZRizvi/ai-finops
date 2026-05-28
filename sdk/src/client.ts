import type {
  FinOpsClientOptions,
  LogInput,
  LogResult,
  WrapConfig,
} from './types.js';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 3000;

export class FinOpsClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly appName: string | undefined;
  private readonly defaultUserId: string | undefined;
  private readonly fireAndForget: boolean;
  private readonly timeoutMs: number;
  private readonly onError: (err: Error) => void;
  private readonly transformPrompt: ((prompt: string) => string) | undefined;

  constructor(options: FinOpsClientOptions = {}) {
    const envBase =
      typeof process !== 'undefined' ? process.env?.FINOPS_BASE_URL : undefined;
    const envToken =
      typeof process !== 'undefined'
        ? process.env?.FINOPS_INGEST_TOKEN
        : undefined;

    this.baseUrl = (options.baseUrl ?? envBase ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      '',
    );
    this.token = options.token ?? envToken;
    this.appName = options.appName;
    this.defaultUserId = options.defaultUserId;
    this.fireAndForget = options.fireAndForget ?? true;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onError = options.onError ?? defaultOnError;
    this.transformPrompt = options.transformPrompt;
  }

  log(input: LogInput): Promise<LogResult | void> {
    const body: LogInput = {
      ...input,
      appName: input.appName ?? this.appName,
      userId: input.userId ?? this.defaultUserId,
      promptText: this.applyTransform(input.promptText) ?? input.promptText,
    };
    if (input.responseText !== undefined) {
      body.responseText = this.applyTransform(input.responseText);
    }

    if (this.fireAndForget) {
      // Intentionally do not await — caller path stays hot.
      void this.send(body).catch((err) => this.onError(toError(err)));
      return Promise.resolve();
    }

    return this.send(body).catch((err) => {
      this.onError(toError(err));
      return undefined;
    });
  }

  async wrap<T>(config: WrapConfig<T>): Promise<T> {
    const start = Date.now();
    const response = await config.call();
    const latencyMs = Date.now() - start;

    try {
      const extracted = safeExtract(config, response, this.onError);
      const logInput: LogInput = {
        model: config.model,
        provider: config.provider,
        promptText: extracted.promptText ?? config.promptText,
        latencyMs,
      };
      if (config.userId !== undefined) logInput.userId = config.userId;
      if (config.metadata !== undefined) logInput.metadata = config.metadata;
      if (extracted.responseText !== undefined)
        logInput.responseText = extracted.responseText;
      if (extracted.inputTokens !== undefined)
        logInput.inputTokens = extracted.inputTokens;
      if (extracted.outputTokens !== undefined)
        logInput.outputTokens = extracted.outputTokens;

      // log() already swallows errors via onError; no need to re-handle here.
      void this.log(logInput);
    } catch (err) {
      this.onError(toError(err));
    }

    return response;
  }

  private applyTransform(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    if (!this.transformPrompt) return value;
    try {
      return this.transformPrompt(value);
    } catch (err) {
      this.onError(toError(err));
      return value;
    }
  }

  private async send(body: LogInput): Promise<LogResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;

      const res = await fetch(`${this.baseUrl}/api/log`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await safeReadText(res);
        throw new Error(
          `FinOps ingest failed: ${res.status} ${res.statusText}${
            text ? ` — ${text}` : ''
          }`,
        );
      }

      return (await res.json()) as LogResult;
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeExtract<T>(
  config: WrapConfig<T>,
  response: T,
  onError: (err: Error) => void,
) {
  try {
    return config.extract(response);
  } catch (err) {
    onError(toError(err));
    return {};
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function defaultOnError(_err: Error): void {
  // Silent by default — logging failures must never crash the host app.
}
