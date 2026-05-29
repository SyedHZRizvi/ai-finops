// OpenAPI 3.0 spec generator for the AI FinOps API surface.
//
// Read by /api/openapi.json (which serves it) and by the in-house API explorer
// page at /api-docs. The spec is built dynamically per-request so the
// servers[0].url reflects the actual host the dashboard is being accessed
// through (localhost in dev, fly.io / vercel in prod, etc).
//
// Types are inlined here rather than pulled from `openapi-types` or
// `openapi3-ts` because the instruction was explicit: no new dependencies.
// The shapes we use are the subset needed for the explorer UI plus what
// validators commonly check.
//
// CONVENTIONS
//   - Every route gets a tag for sidebar grouping.
//   - Every route declares 200 + 400 + 500 responses; routes that auth or
//     can return 401/404/503 declare those too.
//   - Reusable response/body schemas live under components.schemas and are
//     referenced via $ref so the spec stays compact and validates cleanly.
//   - operationId is unique per (method, path) — used by the explorer as a
//     React key and as the URL fragment for deep-linking endpoints.

export type OpenApiPrimitive = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

export interface OpenApiSchema {
  type?: OpenApiPrimitive | OpenApiPrimitive[];
  format?: string;
  description?: string;
  enum?: readonly (string | number | boolean | null)[];
  items?: OpenApiSchema | { $ref: string };
  properties?: Record<string, OpenApiSchema | { $ref: string }>;
  required?: string[];
  additionalProperties?: boolean | OpenApiSchema | { $ref: string };
  example?: unknown;
  default?: unknown;
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  oneOf?: (OpenApiSchema | { $ref: string })[];
  anyOf?: (OpenApiSchema | { $ref: string })[];
  $ref?: string;
}

export interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  schema: OpenApiSchema | { $ref: string };
  example?: unknown;
}

export interface OpenApiMediaType {
  schema: OpenApiSchema | { $ref: string };
  example?: unknown;
  examples?: Record<string, { value: unknown; summary?: string }>;
}

export interface OpenApiRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, OpenApiMediaType>;
}

export interface OpenApiResponse {
  description: string;
  content?: Record<string, OpenApiMediaType>;
}

export interface OpenApiOperation {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  security?: Array<Record<string, string[]>>;
}

export type OpenApiHttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type OpenApiPathItem = Partial<Record<OpenApiHttpMethod, OpenApiOperation>>;

export interface OpenApiTag {
  name: string;
  description?: string;
}

export interface OpenApiServer {
  url: string;
  description?: string;
}

export interface OpenApiComponents {
  schemas: Record<string, OpenApiSchema>;
  securitySchemes?: Record<
    string,
    {
      type: 'http' | 'apiKey';
      scheme?: 'bearer' | 'basic';
      bearerFormat?: string;
      description?: string;
      name?: string;
      in?: 'header' | 'query';
    }
  >;
}

export interface OpenAPIDocument {
  openapi: '3.0.3';
  info: {
    title: string;
    description: string;
    version: string;
  };
  servers: OpenApiServer[];
  tags: OpenApiTag[];
  paths: Record<string, OpenApiPathItem>;
  components: OpenApiComponents;
}

// -- Schemas ----------------------------------------------------------------

const ErrorSchema: OpenApiSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string', description: 'Human-readable error message' },
    details: {
      type: 'object',
      description: 'Optional zod validation flatten() payload',
      additionalProperties: true,
    },
  },
  example: { error: 'validation failed' },
};

const CategorySchema: OpenApiSchema = {
  type: 'string',
  enum: [
    'factual',
    'reasoning',
    'creative',
    'code',
    'analytical',
    'conversational',
    'instructional',
    'other',
  ],
};

const ComplexitySchema: OpenApiSchema = {
  type: 'string',
  enum: ['simple', 'moderate', 'complex', 'multidimensional'],
};

const PeriodSchema: OpenApiSchema = {
  type: 'string',
  enum: ['24h', '7d', '30d', 'all'],
  description: 'Rolling time window for aggregation',
};

const PromptLogSchema: OpenApiSchema = {
  type: 'object',
  description: 'A single logged LLM call',
  properties: {
    id: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
    appName: { type: 'string', nullable: true },
    userId: { type: 'string', nullable: true },
    model: { type: 'string' },
    provider: { type: 'string', nullable: true },
    promptText: { type: 'string' },
    responseText: { type: 'string', nullable: true },
    inputTokens: { type: 'integer', minimum: 0 },
    outputTokens: { type: 'integer', minimum: 0 },
    totalTokens: { type: 'integer', minimum: 0 },
    inputCost: { type: 'number' },
    outputCost: { type: 'number' },
    totalCost: { type: 'number' },
    category: { $ref: '#/components/schemas/Category' },
    complexity: { $ref: '#/components/schemas/Complexity' },
    complexityScore: { type: 'integer', minimum: 0, maximum: 100 },
    dimensions: { type: 'array', items: { type: 'string' } },
    characteristics: { type: 'object', additionalProperties: true },
    latencyMs: { type: 'integer', nullable: true },
    metadata: { type: 'object', nullable: true, additionalProperties: true },
    potentialSavedTokens: { type: 'integer' },
    potentialSavedCost: { type: 'number' },
    tags: { type: 'string', nullable: true },
    callCount: { type: 'integer' },
  },
};

const StatsResponseSchema: OpenApiSchema = {
  type: 'object',
  required: [
    'totals',
    'potentialSavings',
    'byCategory',
    'byComplexity',
    'byModel',
    'timeseries',
  ],
  properties: {
    totals: {
      type: 'object',
      properties: {
        calls: { type: 'integer' },
        inputTokens: { type: 'integer' },
        outputTokens: { type: 'integer' },
        totalTokens: { type: 'integer' },
        cost: { type: 'number' },
        avgLatencyMs: { type: 'number' },
      },
      required: ['calls', 'cost'],
    },
    potentialSavings: {
      type: 'object',
      properties: {
        tokens: { type: 'integer' },
        cost: { type: 'number' },
        percent: { type: 'number' },
      },
    },
    byCategory: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { $ref: '#/components/schemas/Category' },
          calls: { type: 'integer' },
          tokens: { type: 'integer' },
          cost: { type: 'number' },
        },
      },
    },
    byComplexity: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          complexity: { $ref: '#/components/schemas/Complexity' },
          calls: { type: 'integer' },
          tokens: { type: 'integer' },
          cost: { type: 'number' },
        },
      },
    },
    byModel: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          model: { type: 'string' },
          calls: { type: 'integer' },
          tokens: { type: 'integer' },
          cost: { type: 'number' },
        },
      },
    },
    timeseries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ts: { type: 'string', format: 'date-time' },
          calls: { type: 'integer' },
          tokens: { type: 'integer' },
          cost: { type: 'number' },
        },
      },
    },
  },
};

const LogIngestBodySchema: OpenApiSchema = {
  type: 'object',
  required: ['model', 'promptText'],
  properties: {
    model: { type: 'string', minLength: 1, maxLength: 200, example: 'gpt-4o' },
    provider: { type: 'string', maxLength: 50, example: 'openai' },
    appName: { type: 'string', maxLength: 200, example: 'customer-support-bot' },
    userId: { type: 'string', maxLength: 200 },
    promptText: { type: 'string', minLength: 1, example: 'Summarize this article in one paragraph.' },
    responseText: { type: 'string' },
    inputTokens: { type: 'integer', minimum: 0 },
    outputTokens: { type: 'integer', minimum: 0 },
    latencyMs: { type: 'integer', minimum: 0, description: 'Round-trip duration in ms (max 1h)' },
    metadata: {
      type: 'object',
      description: 'Arbitrary key/value metadata (max 64 keys)',
      additionalProperties: true,
    },
  },
  example: {
    model: 'gpt-4o',
    provider: 'openai',
    appName: 'demo-app',
    promptText: 'Summarize: AI FinOps tracks LLM cost.',
    responseText: 'AI FinOps tracks LLM cost.',
    inputTokens: 12,
    outputTokens: 8,
    latencyMs: 420,
  },
};

const OptimizationResultSchema: OpenApiSchema = {
  type: 'object',
  properties: {
    originalPrompt: { type: 'string' },
    optimizedPrompt: { type: 'string' },
    originalTokens: { type: 'integer' },
    optimizedTokens: { type: 'integer' },
    savedTokens: { type: 'integer' },
    savedPercent: { type: 'number' },
    estimatedCostSavings: { type: 'number' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          before: { type: 'string' },
          after: { type: 'string' },
          estimatedTokenSavings: { type: 'integer' },
          estimatedCostSavings: { type: 'number' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    analysis: {
      type: 'object',
      properties: {
        inputTokens: { type: 'integer' },
        estimatedOutputTokens: { type: 'integer' },
        category: { $ref: '#/components/schemas/Category' },
        complexity: { $ref: '#/components/schemas/Complexity' },
        complexityScore: { type: 'integer' },
        dimensions: { type: 'array', items: { type: 'string' } },
        characteristics: { type: 'object', additionalProperties: true },
      },
    },
  },
};

const InsightsResponseSchema: OpenApiSchema = {
  type: 'object',
  properties: {
    period: { $ref: '#/components/schemas/Period' },
    generatedAt: { type: 'string', format: 'date-time' },
    totals: {
      type: 'object',
      properties: {
        calls: { type: 'integer' },
        cost: { type: 'number' },
        avgCostPerCall: { type: 'number' },
      },
    },
    projectedSavings: {
      type: 'object',
      properties: {
        monthly: { type: 'number' },
        annual: { type: 'number' },
        percentReduction: { type: 'number' },
      },
    },
    concentration: {
      type: 'object',
      properties: {
        p20Cost: { type: 'number' },
        p20Percent: { type: 'number' },
        p5Cost: { type: 'number' },
        p5Percent: { type: 'number' },
        giniLike: { type: 'number' },
      },
    },
    rootCauses: { type: 'array', items: { type: 'object', additionalProperties: true } },
    recommendations: { type: 'array', items: { type: 'object', additionalProperties: true } },
    topSpenders: { type: 'array', items: { type: 'object', additionalProperties: true } },
    modelMismatch: { type: 'array', items: { type: 'object', additionalProperties: true } },
    redundancyClusters: { type: 'array', items: { type: 'object', additionalProperties: true } },
    outputBloat: { type: 'array', items: { type: 'object', additionalProperties: true } },
    appHotspots: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
};

const StudioBodySchema: OpenApiSchema = {
  type: 'object',
  required: ['problem', 'targetProvider'],
  properties: {
    problem: { type: 'string', minLength: 1, example: 'Generate a customer-friendly refund email.' },
    desiredOutcome: { type: 'string', example: 'A polite, concise email body.' },
    targetProvider: {
      type: 'string',
      enum: ['claude', 'gpt', 'gemini', 'copilot', 'cursor', 'perplexity', 'generic'],
      example: 'gpt',
    },
    audience: {
      type: 'string',
      enum: ['beginner', 'general', 'expert', 'executive'],
    },
    outputFormat: {
      type: 'string',
      enum: [
        'free-text', 'bullet-list', 'numbered-list', 'table',
        'code', 'json', 'markdown', 'essay', 'summary',
        'qa-pairs', 'step-by-step',
      ],
    },
    outputLength: { type: 'string', enum: ['brief', 'medium', 'long'] },
    mustInclude: { type: 'array', items: { type: 'string' } },
    mustAvoid: { type: 'array', items: { type: 'string' } },
    tone: { type: 'string', enum: ['neutral', 'formal', 'casual', 'technical', 'persuasive'] },
    starterPrompt: { type: 'string' },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          input: { type: 'string' },
          output: { type: 'string' },
        },
      },
    },
  },
};

const StudioResultSchema: OpenApiSchema = {
  type: 'object',
  properties: {
    detectedComplexity: { $ref: '#/components/schemas/Complexity' },
    detectedCategory: { $ref: '#/components/schemas/Category' },
    detectedDimensions: { type: 'array', items: { type: 'string' } },
    targetProvider: { type: 'string' },
    recommendedModel: { type: 'string' },
    variants: { type: 'array', items: { type: 'object', additionalProperties: true } },
    splitPrompts: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    tips: { type: 'array', items: { type: 'string' } },
  },
};

const ModelPricingSchema: OpenApiSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    model: { type: 'string' },
    provider: { type: 'string', nullable: true },
    inputCostPer1M: { type: 'number' },
    outputCostPer1M: { type: 'number' },
    contextWindow: { type: 'integer' },
    isActive: { type: 'boolean' },
  },
};

const CredentialSchema: OpenApiSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    provider: { type: 'string' },
    label: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const ImportJobSchema: OpenApiSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    provider: { type: 'string' },
    status: { type: 'string', enum: ['running', 'succeeded', 'failed'] },
    startedAt: { type: 'string', format: 'date-time' },
    finishedAt: { type: 'string', format: 'date-time', nullable: true },
    rangeFrom: { type: 'string', format: 'date-time', nullable: true },
    rangeTo: { type: 'string', format: 'date-time', nullable: true },
    recordsImported: { type: 'integer' },
    errorMessage: { type: 'string', nullable: true },
  },
};

const BudgetStatusSchema: OpenApiSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    scope: { type: 'string', enum: ['global', 'app', 'user'] },
    scopeValue: { type: 'string', nullable: true },
    monthlyLimit: { type: 'number' },
    currency: { type: 'string' },
    monthToDate: { type: 'number' },
    percent: { type: 'number' },
    severity: { type: 'string', enum: ['ok', 'warn', 'critical', 'breached'] },
    webhookUrl: { type: 'string', nullable: true },
    alertAt75: { type: 'boolean' },
    alertAt90: { type: 'boolean' },
    alertAt100: { type: 'boolean' },
    isActive: { type: 'boolean' },
  },
};

const ForecastResponseSchema: OpenApiSchema = {
  type: 'object',
  properties: {
    scope: { type: 'string', example: 'global' },
    monthToDate: { type: 'number' },
    daysObserved: { type: 'integer' },
    daysInMonth: { type: 'integer' },
    projection: { type: 'number', description: 'Projected total spend for the current month' },
    runRatePerDay: { type: 'number' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
};

const HealthResponseSchema: OpenApiSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'degraded', 'down'] },
    database: {
      type: 'object',
      properties: {
        reachable: { type: 'boolean' },
        latencyMs: { type: 'integer' },
      },
    },
    lastLog: {
      type: 'object',
      properties: {
        timestamp: { type: 'string', format: 'date-time', nullable: true },
        ageSeconds: { type: 'integer', nullable: true },
      },
    },
    lastImport: {
      type: 'object',
      properties: {
        provider: { type: 'string', nullable: true },
        timestamp: { type: 'string', format: 'date-time', nullable: true },
        ageSeconds: { type: 'integer', nullable: true },
      },
    },
    version: { type: 'string' },
    env: { type: 'string', enum: ['development', 'production'] },
  },
};

const TagAggSchema: OpenApiSchema = {
  type: 'object',
  properties: {
    tag: { type: 'string' },
    count: { type: 'integer' },
    totalCost: { type: 'number' },
  },
};

const AnomalySchema: OpenApiSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
    kind: { type: 'string', description: 'e.g. cost-spike, latency-spike' },
    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
    description: { type: 'string' },
    baseline: { type: 'number' },
    observed: { type: 'number' },
    acknowledgedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const DigestSchema: OpenApiSchema = {
  type: 'object',
  properties: {
    period: { type: 'string' },
    generatedAt: { type: 'string', format: 'date-time' },
    summary: { type: 'string', description: 'Plain-language headline summary' },
    bullets: { type: 'array', items: { type: 'string' } },
    totals: {
      type: 'object',
      properties: {
        calls: { type: 'integer' },
        cost: { type: 'number' },
        savings: { type: 'number' },
      },
    },
  },
};

// -- Helpers ----------------------------------------------------------------

function jsonBody(schemaRef: string, example?: unknown): OpenApiRequestBody {
  return {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: schemaRef },
        ...(example !== undefined ? { example } : {}),
      },
    },
  };
}

function jsonResponse(
  description: string,
  schemaOrRef?: OpenApiSchema | { $ref: string },
  example?: unknown,
): OpenApiResponse {
  if (!schemaOrRef) return { description };
  return {
    description,
    content: {
      'application/json': {
        schema: schemaOrRef,
        ...(example !== undefined ? { example } : {}),
      },
    },
  };
}

function errorResponse(description: string): OpenApiResponse {
  return jsonResponse(description, { $ref: '#/components/schemas/Error' });
}

function fileResponse(description: string, contentType: string): OpenApiResponse {
  return {
    description,
    content: {
      [contentType]: {
        schema: { type: 'string', format: 'binary' },
      },
    },
  };
}

// -- Spec builder -----------------------------------------------------------

export function buildOpenApiSpec(baseUrl: string): OpenAPIDocument {
  const paths: Record<string, OpenApiPathItem> = {};

  // -- /api/log ---
  paths['/api/log'] = {
    post: {
      operationId: 'logCall',
      summary: 'Log an LLM call',
      description:
        'Ingest a single LLM call for cost tracking. Server computes tokens, cost, category, complexity, and optimization potential if not provided. Requires Bearer auth when FINOPS_INGEST_TOKEN is set.',
      tags: ['Ingest'],
      requestBody: jsonBody('#/components/schemas/LogIngestBody'),
      security: [{ bearerAuth: [] }],
      responses: {
        '201': jsonResponse('Call logged', {
          type: 'object',
          properties: {
            id: { type: 'string' },
            totalCost: { type: 'number' },
            potentialSavedCost: { type: 'number' },
            category: { $ref: '#/components/schemas/Category' },
            complexity: { $ref: '#/components/schemas/Complexity' },
          },
        }),
        '400': errorResponse('Validation failed or invalid JSON'),
        '401': errorResponse('Missing or invalid Bearer token'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/stats ---
  paths['/api/stats'] = {
    get: {
      operationId: 'getStats',
      summary: 'Aggregate usage statistics',
      description: 'Totals, breakdowns (by category/complexity/model), and a bucketed timeseries.',
      tags: ['Analytics'],
      parameters: [
        {
          name: 'period',
          in: 'query',
          required: false,
          schema: { $ref: '#/components/schemas/Period' },
          example: '7d',
        },
      ],
      responses: {
        '200': jsonResponse('Aggregated stats', { $ref: '#/components/schemas/StatsResponse' }),
        '400': errorResponse('Invalid period'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/prompts ---
  paths['/api/prompts'] = {
    get: {
      operationId: 'listPrompts',
      summary: 'List logged prompts',
      description: 'Paginated list of prompt logs, with filters on category, complexity, model, and search text.',
      tags: ['Prompts'],
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 25 } },
        { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
        { name: 'category', in: 'query', schema: { $ref: '#/components/schemas/Category' } },
        { name: 'complexity', in: 'query', schema: { $ref: '#/components/schemas/Complexity' } },
        { name: 'model', in: 'query', schema: { type: 'string' } },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Case-insensitive substring match on promptText' },
      ],
      responses: {
        '200': jsonResponse('Page of prompt logs', {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/PromptLog' } },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
          },
        }),
        '400': errorResponse('Invalid query'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/prompts/{id} ---
  paths['/api/prompts/{id}'] = {
    get: {
      operationId: 'getPrompt',
      summary: 'Get a single prompt log',
      tags: ['Prompts'],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'PromptLog row id',
        },
      ],
      responses: {
        '200': jsonResponse('Prompt log row', { $ref: '#/components/schemas/PromptLog' }),
        '400': errorResponse('Missing id'),
        '404': errorResponse('Not found'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/optimize ---
  paths['/api/optimize'] = {
    post: {
      operationId: 'optimizePrompt',
      summary: 'Optimize a prompt',
      description: 'Rewrites a prompt for fewer tokens and returns concrete suggestions plus an analysis.',
      tags: ['Optimization'],
      requestBody: jsonBody('#/components/schemas/OptimizeBody', {
        prompt: 'Please could you possibly summarize the following article for me, thank you.',
        model: 'gpt-4o',
      }),
      responses: {
        '200': jsonResponse('Optimization result', { $ref: '#/components/schemas/OptimizationResult' }),
        '400': errorResponse('Validation failed or invalid JSON'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/insights ---
  paths['/api/insights'] = {
    get: {
      operationId: 'getInsights',
      summary: 'Cost-driver insights',
      description: 'Root-cause analysis, recommendations, top spenders, model mismatch, and more.',
      tags: ['Analytics'],
      parameters: [
        { name: 'period', in: 'query', schema: { $ref: '#/components/schemas/Period' }, example: '30d' },
      ],
      responses: {
        '200': jsonResponse('Insights payload', { $ref: '#/components/schemas/InsightsResponse' }),
        '400': errorResponse('Invalid period'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/studio ---
  paths['/api/studio'] = {
    post: {
      operationId: 'studioBuild',
      summary: 'Build prompts from scratch',
      description: 'Generates target-provider-aware prompt variants from a problem statement.',
      tags: ['Studio'],
      requestBody: jsonBody('#/components/schemas/StudioBody'),
      responses: {
        '200': jsonResponse('Studio result', { $ref: '#/components/schemas/StudioResult' }),
        '400': errorResponse('Validation failed'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/pricing ---
  paths['/api/pricing'] = {
    get: {
      operationId: 'listPricing',
      summary: 'List model pricing configs',
      tags: ['Settings'],
      responses: {
        '200': jsonResponse('Pricing table', {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/ModelPricing' } },
          },
        }),
        '500': errorResponse('Internal error'),
      },
    },
    post: {
      operationId: 'upsertPricing',
      summary: 'Create or update a pricing row',
      tags: ['Settings'],
      requestBody: jsonBody('#/components/schemas/PricingUpsertBody', {
        model: 'gpt-4o',
        provider: 'openai',
        inputCostPer1M: 2.5,
        outputCostPer1M: 10,
        contextWindow: 128000,
      }),
      responses: {
        '200': jsonResponse('Saved row', { $ref: '#/components/schemas/ModelPricing' }),
        '400': errorResponse('Validation failed'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/credentials ---
  paths['/api/credentials'] = {
    get: {
      operationId: 'listCredentials',
      summary: 'List provider credentials',
      description: 'Returns metadata only — encrypted secrets are never exposed.',
      tags: ['Credentials'],
      responses: {
        '200': jsonResponse('Credential list', {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/Credential' } },
          },
        }),
        '500': errorResponse('Internal error'),
      },
    },
    post: {
      operationId: 'upsertCredential',
      summary: 'Store an encrypted provider credential',
      tags: ['Credentials'],
      requestBody: jsonBody('#/components/schemas/CredentialUpsertBody'),
      responses: {
        '200': jsonResponse('Saved credential metadata'),
        '400': errorResponse('Validation failed'),
        '503': errorResponse('Encryption key not configured'),
        '500': errorResponse('Internal error'),
      },
    },
    delete: {
      operationId: 'deleteCredential',
      summary: 'Delete a stored credential',
      tags: ['Credentials'],
      parameters: [
        { name: 'id', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': jsonResponse('Deleted', {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
        }),
        '400': errorResponse('Missing id'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/import ---
  paths['/api/import'] = {
    get: {
      operationId: 'listImportJobs',
      summary: 'Recent import jobs',
      tags: ['Import'],
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: {
        '200': jsonResponse('Import job list', {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/ImportJob' } },
          },
        }),
        '500': errorResponse('Internal error'),
      },
    },
    post: {
      operationId: 'runImport',
      summary: 'Trigger an import job',
      description: 'Pulls usage data from a provider or accepts a CSV upload. Idempotent — duplicate rows in the same range are skipped.',
      tags: ['Import'],
      requestBody: jsonBody('#/components/schemas/ImportBody'),
      responses: {
        '200': jsonResponse('Import complete', {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
            status: { type: 'string' },
            recordsImported: { type: 'integer' },
            recordsSkippedDuplicate: { type: 'integer' },
            warnings: { type: 'array', items: { type: 'string' } },
          },
        }),
        '400': errorResponse('Validation failed'),
        '500': errorResponse('Import failed'),
      },
    },
  };

  // -- /api/anomaly ---
  paths['/api/anomaly'] = {
    get: {
      operationId: 'listAnomalies',
      summary: 'List detected anomalies',
      description: 'Returns anomalies detected by the background scanner.',
      tags: ['Anomaly'],
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        { name: 'unacknowledged', in: 'query', schema: { type: 'boolean' }, description: 'When true, returns only unacknowledged anomalies' },
      ],
      responses: {
        '200': jsonResponse('Anomaly list', {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/Anomaly' } },
          },
        }),
        '500': errorResponse('Internal error'),
      },
    },
    post: {
      operationId: 'acknowledgeAnomaly',
      summary: 'Acknowledge an anomaly',
      tags: ['Anomaly'],
      requestBody: jsonBody('#/components/schemas/AnomalyAckBody', { id: 'anom_abc123' }),
      responses: {
        '200': jsonResponse('Acknowledged'),
        '400': errorResponse('Missing id'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/anomaly/check ---
  paths['/api/anomaly/check'] = {
    post: {
      operationId: 'runAnomalyCheck',
      summary: 'Run anomaly scan now',
      description: 'Forces an immediate scan rather than waiting for the periodic job.',
      tags: ['Anomaly'],
      responses: {
        '200': jsonResponse('Scan summary', {
          type: 'object',
          properties: {
            scanned: { type: 'integer' },
            created: { type: 'integer' },
          },
        }),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/budget ---
  paths['/api/budget'] = {
    get: {
      operationId: 'listBudgets',
      summary: 'List budgets with current month-to-date status',
      tags: ['Budget'],
      responses: {
        '200': jsonResponse('Budget list', {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/BudgetStatus' } },
          },
        }),
        '500': errorResponse('Internal error'),
      },
    },
    post: {
      operationId: 'upsertBudget',
      summary: 'Create or update a budget',
      tags: ['Budget'],
      requestBody: jsonBody('#/components/schemas/BudgetUpsertBody', {
        scope: 'global',
        monthlyLimit: 5000,
        currency: 'USD',
        webhookUrl: 'https://hooks.example.com/finops',
      }),
      responses: {
        '200': jsonResponse('Saved budget'),
        '400': errorResponse('Validation failed'),
        '500': errorResponse('Internal error'),
      },
    },
    delete: {
      operationId: 'deleteBudget',
      summary: 'Delete a budget',
      tags: ['Budget'],
      parameters: [
        { name: 'id', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': jsonResponse('Deleted'),
        '400': errorResponse('Missing id'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/forecast ---
  paths['/api/forecast'] = {
    get: {
      operationId: 'getForecast',
      summary: 'Month-end cost forecast',
      tags: ['Analytics'],
      parameters: [
        {
          name: 'appName',
          in: 'query',
          required: false,
          schema: { type: 'string' },
          description: 'When set, scopes the forecast to a single app',
        },
      ],
      responses: {
        '200': jsonResponse('Forecast result', { $ref: '#/components/schemas/ForecastResponse' }),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/health ---
  paths['/api/health'] = {
    get: {
      operationId: 'getHealth',
      summary: 'Service health snapshot',
      description: 'DB reachability, latency, freshness of last log/import, version.',
      tags: ['System'],
      responses: {
        '200': jsonResponse('Health status', { $ref: '#/components/schemas/HealthResponse' }),
      },
    },
  };

  // -- /api/demo ---
  paths['/api/demo'] = {
    get: {
      operationId: 'getDemoStatus',
      summary: 'Inspect demo data state',
      tags: ['System'],
      responses: {
        '200': jsonResponse('Demo status', {
          type: 'object',
          properties: {
            active: { type: 'boolean' },
            demoRowCount: { type: 'integer' },
            realRowCount: { type: 'integer' },
          },
        }),
        '500': errorResponse('Internal error'),
      },
    },
    post: {
      operationId: 'mutateDemo',
      summary: 'Seed or clear demo data',
      tags: ['System'],
      requestBody: jsonBody('#/components/schemas/DemoBody', { action: 'seed', count: 300 }),
      responses: {
        '200': jsonResponse('Mutation result'),
        '400': errorResponse('Validation failed'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/tags ---
  paths['/api/tags'] = {
    get: {
      operationId: 'listTags',
      summary: 'Distinct prompt tags with row counts and cost',
      tags: ['Prompts'],
      responses: {
        '200': jsonResponse('Tag aggregates', {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/TagAgg' } },
          },
        }),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/digest ---
  paths['/api/digest'] = {
    get: {
      operationId: 'getDigest',
      summary: 'Human-readable summary of recent activity',
      tags: ['Analytics'],
      parameters: [
        { name: 'period', in: 'query', schema: { $ref: '#/components/schemas/Period' } },
      ],
      responses: {
        '200': jsonResponse('Digest payload', { $ref: '#/components/schemas/Digest' }),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/export/prompts ---
  paths['/api/export/prompts'] = {
    get: {
      operationId: 'exportPrompts',
      summary: 'Export prompt logs (CSV or JSON)',
      tags: ['Export'],
      parameters: [
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['csv', 'json'], default: 'csv' } },
        { name: 'category', in: 'query', schema: { $ref: '#/components/schemas/Category' } },
        { name: 'complexity', in: 'query', schema: { $ref: '#/components/schemas/Complexity' } },
        { name: 'model', in: 'query', schema: { type: 'string' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'tags', in: 'query', schema: { type: 'string' }, description: 'Comma-separated list of tags (all must match)' },
        { name: 'period', in: 'query', schema: { $ref: '#/components/schemas/Period' } },
      ],
      responses: {
        '200': {
          description: 'File download',
          content: {
            'text/csv': { schema: { type: 'string' } },
            'application/json': { schema: { type: 'array', items: { type: 'object', additionalProperties: true } } },
          },
        },
        '400': errorResponse('Invalid query'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/export/insights ---
  paths['/api/export/insights'] = {
    get: {
      operationId: 'exportInsights',
      summary: 'Export full insights bundle (CSV or JSON)',
      tags: ['Export'],
      parameters: [
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['csv', 'json'], default: 'json' } },
        { name: 'period', in: 'query', schema: { $ref: '#/components/schemas/Period' } },
      ],
      responses: {
        '200': {
          description: 'File download',
          content: {
            'text/csv': { schema: { type: 'string' } },
            'application/json': { schema: { $ref: '#/components/schemas/InsightsResponse' } },
          },
        },
        '400': errorResponse('Invalid query'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- /api/export/recommendations ---
  paths['/api/export/recommendations'] = {
    get: {
      operationId: 'exportRecommendations',
      summary: 'Export recommendations only (CSV or JSON)',
      tags: ['Export'],
      parameters: [
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['csv', 'json'], default: 'csv' } },
        { name: 'period', in: 'query', schema: { $ref: '#/components/schemas/Period' } },
      ],
      responses: {
        '200': fileResponse('File download', 'text/csv'),
        '400': errorResponse('Invalid query'),
        '500': errorResponse('Internal error'),
      },
    },
  };

  // -- Components ---
  const components: OpenApiComponents = {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'token',
        description: 'When FINOPS_INGEST_TOKEN is set, /api/log requires a Bearer token equal to it.',
      },
    },
    schemas: {
      Error: ErrorSchema,
      Category: CategorySchema,
      Complexity: ComplexitySchema,
      Period: PeriodSchema,
      PromptLog: PromptLogSchema,
      LogIngestBody: LogIngestBodySchema,
      StatsResponse: StatsResponseSchema,
      OptimizeBody: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1 },
          model: { type: 'string' },
          promptLogId: { type: 'string', description: 'Link optimization to an existing log row' },
        },
      },
      OptimizationResult: OptimizationResultSchema,
      InsightsResponse: InsightsResponseSchema,
      StudioBody: StudioBodySchema,
      StudioResult: StudioResultSchema,
      ModelPricing: ModelPricingSchema,
      PricingUpsertBody: {
        type: 'object',
        required: ['model', 'inputCostPer1M', 'outputCostPer1M', 'contextWindow'],
        properties: {
          model: { type: 'string', minLength: 1 },
          provider: { type: 'string' },
          inputCostPer1M: { type: 'number', minimum: 0 },
          outputCostPer1M: { type: 'number', minimum: 0 },
          contextWindow: { type: 'integer', minimum: 1 },
        },
      },
      Credential: CredentialSchema,
      CredentialUpsertBody: {
        type: 'object',
        required: ['provider', 'apiKey'],
        properties: {
          provider: {
            type: 'string',
            enum: ['anthropic', 'openai', 'google', 'azure', 'gateway', 'bedrock', 'vertex'],
          },
          label: { type: 'string', maxLength: 120 },
          apiKey: { type: 'string', minLength: 1 },
        },
      },
      ImportJob: ImportJobSchema,
      ImportBody: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: {
            type: 'string',
            enum: ['anthropic', 'openai', 'csv', 'google', 'azure', 'bedrock', 'vertex'],
          },
          credentialId: { type: 'string', description: 'Required for non-csv providers' },
          rangeFrom: { type: 'string', format: 'date-time' },
          rangeTo: { type: 'string', format: 'date-time' },
          csvText: { type: 'string', description: 'Required when provider=csv' },
        },
      },
      BudgetStatus: BudgetStatusSchema,
      BudgetUpsertBody: {
        type: 'object',
        required: ['scope', 'monthlyLimit'],
        properties: {
          scope: { type: 'string', enum: ['global', 'app', 'user'] },
          scopeValue: { type: 'string', description: 'Required when scope is app or user' },
          monthlyLimit: { type: 'number', minimum: 0 },
          currency: { type: 'string', default: 'USD' },
          alertAt75: { type: 'boolean' },
          alertAt90: { type: 'boolean' },
          alertAt100: { type: 'boolean' },
          webhookUrl: { type: 'string', format: 'uri' },
        },
      },
      ForecastResponse: ForecastResponseSchema,
      HealthResponse: HealthResponseSchema,
      DemoBody: {
        oneOf: [
          {
            type: 'object',
            required: ['action'],
            properties: {
              action: { type: 'string', enum: ['seed'] },
              count: { type: 'integer', minimum: 1, maximum: 2000 },
            },
          },
          {
            type: 'object',
            required: ['action'],
            properties: {
              action: { type: 'string', enum: ['clear'] },
            },
          },
        ],
      },
      TagAgg: TagAggSchema,
      Digest: DigestSchema,
      Anomaly: AnomalySchema,
      AnomalyAckBody: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  };

  return {
    openapi: '3.0.3',
    info: {
      title: 'AI FinOps API',
      description:
        'Token tracking, prompt analytics, and optimization for enterprise LLM usage. ' +
        'Self-hostable. All endpoints return JSON unless noted otherwise (export endpoints can stream CSV).',
      version: '1.0.0',
    },
    servers: [{ url: baseUrl, description: 'This server' }],
    tags: [
      { name: 'Ingest', description: 'Log new LLM calls' },
      { name: 'Analytics', description: 'Stats, insights, forecasts, digest' },
      { name: 'Prompts', description: 'Prompt log access and tag aggregates' },
      { name: 'Optimization', description: 'Prompt rewriting and savings analysis' },
      { name: 'Studio', description: 'Build prompts from scratch' },
      { name: 'Settings', description: 'Model pricing configuration' },
      { name: 'Credentials', description: 'Provider API credentials (encrypted)' },
      { name: 'Import', description: 'Pull usage from providers or upload CSV' },
      { name: 'Budget', description: 'Spend caps with month-to-date status' },
      { name: 'Anomaly', description: 'Anomaly detection and acknowledgement' },
      { name: 'Export', description: 'Download data as CSV or JSON' },
      { name: 'System', description: 'Health, version, demo data' },
    ],
    paths,
    components,
  };
}
