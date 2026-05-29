#!/usr/bin/env node
// AI FinOps MCP server.
//
// Speaks the Model Context Protocol over stdio JSON-RPC, exposing the AI
// FinOps platform's tools to Claude Desktop, Cursor, Cline, and any other MCP
// client. This server is a thin shell — every tool call ultimately hits the
// running AI FinOps Next.js dashboard over HTTP (the URL is configured via
// FINOPS_BASE_URL).
//
// Why a separate process: the MCP transport is stdin/stdout JSON-RPC, which
// means stdout MUST be reserved exclusively for protocol traffic. Any stray
// console.log() crashes the client. To stay safe we route all diagnostics to
// stderr and never write to stdout directly.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { FinOpsApiClient } from './client.js';
import { ALL_TOOLS, findTool, listTools } from './tools.js';

const SERVER_NAME = 'ai-finops';
// Note: kept in sync manually with package.json. The build doesn't bundle
// package.json into dist, so we hard-code the version string here.
const SERVER_VERSION = '0.1.0';

// stderr-only logger. stdout is owned by the JSON-RPC transport — writing to
// it produces invalid framing that hangs the client.
function logErr(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.error('[ai-finops-mcp]', ...args);
}

async function main(): Promise<void> {
  const baseUrl = process.env.FINOPS_BASE_URL ?? 'http://localhost:3000';
  const token = process.env.FINOPS_INGEST_TOKEN;

  const client = new FinOpsApiClient({
    baseUrl,
    ...(token ? { token } : {}),
  });

  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // --- tools/list -----------------------------------------------------------
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: listTools() };
  });

  // --- tools/call -----------------------------------------------------------
  // The MCP SDK's TS types for the tools/call response union are stricter
  // than the runtime spec — newer SDK versions added a task-bearing variant
  // that's marked required in the union. The legacy `{content, isError}`
  // shape we return IS valid per spec; this cast bridges the type vs.
  // runtime gap without changing any wire behavior.

  server.setRequestHandler(CallToolRequestSchema, (async (req) => {
    const { name, arguments: args } = req.params;
    const tool = findTool(name);
    if (!tool) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Unknown tool: "${name}". Known tools: ${ALL_TOOLS.map((t) => t.name).join(', ')}`,
          },
        ],
        isError: true,
      };
    }

    // Every handler already wraps its own logic in try/catch and converts
    // errors to a clean text response. Wrap once more here as a final safety
    // net so a thrown exception inside a handler never crashes the server
    // (which would kill the stdio connection and the client would lose all
    // tools, not just this one).
    try {
      const result = await tool.handler(args ?? {}, client);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logErr(`tool "${name}" threw:`, message);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Tool "${name}" failed: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }) as Parameters<typeof server.setRequestHandler<typeof CallToolRequestSchema>>[1]);

  // --- top-level safety nets ------------------------------------------------
  // An unhandled promise rejection or uncaught exception would terminate the
  // process and kill the MCP connection. Log + keep running.
  process.on('uncaughtException', (err) => {
    logErr('uncaughtException:', err instanceof Error ? err.stack ?? err.message : String(err));
  });
  process.on('unhandledRejection', (reason) => {
    logErr('unhandledRejection:', reason instanceof Error ? reason.stack ?? reason.message : String(reason));
  });

  // Quick (non-fatal) connectivity check at startup. If the dashboard isn't
  // reachable we want the operator to see why in their MCP client logs, but
  // we still register tools so the LLM gets the same surface area as soon as
  // the dashboard comes online.
  void client
    .health()
    .then(() => logErr(`connected to AI FinOps at ${baseUrl}`))
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logErr(`startup: could not reach AI FinOps at ${baseUrl}: ${message}`);
      logErr(`tool calls will keep retrying — start the dashboard with \`npm run dev\` or set FINOPS_BASE_URL to a reachable instance`);
    });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logErr(`MCP server "${SERVER_NAME}" v${SERVER_VERSION} listening on stdio (FINOPS_BASE_URL=${baseUrl})`);
}

main().catch((err) => {
  logErr('fatal startup error:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
