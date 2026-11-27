import { PRODUCT, PRODUCT_TITLE, PUBLIC_ORIGIN, VERSION } from "./identity.js";
import { PROTOCOL_VERSIONS } from "./mcp.js";

export const MCP_URL = `${PUBLIC_ORIGIN}/mcp`;
export const OPENAPI_URL = `${PUBLIC_ORIGIN}/openapi.json`;
export const CONNECT_URL = `${PUBLIC_ORIGIN}/connect`;
export const GROK_CONNECTORS_URL = "https://grok.com/connectors";
export const AI_STUDIO_URL = "https://aistudio.google.com/";
export const GEMINI_CLI_URL = "https://github.com/google-gemini/gemini-cli";

export const SERVER_CARD_SCHEMA = "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json";
/** Reverse-DNS server name. One slash, per the server-card schema. */
export const SERVER_CARD_NAME = "com.azieleliab/trades-runtime";

export function cursorServerConfig(): { url: string } {
  return { url: MCP_URL };
}

export function cursorInstallDocument(): { mcpServers: Record<string, { url: string }> } {
  return { mcpServers: { [PRODUCT]: cursorServerConfig() } };
}

export function vscodeServerConfig(): { type: "http"; url: string } {
  return { type: "http", url: MCP_URL };
}

export function vscodeInstallDocument(): {
  servers: Record<string, { type: "http"; url: string }>;
} {
  return { servers: { [PRODUCT]: vscodeServerConfig() } };
}

export function claudeDesktopInstallDocument(): { mcpServers: Record<string, { url: string }> } {
  return { mcpServers: { [PRODUCT]: { url: MCP_URL } } };
}

export function lmStudioInstallDocument(): { mcpServers: Record<string, { url: string }> } {
  return { mcpServers: { [PRODUCT]: { url: MCP_URL } } };
}

export function mcpJsonDocument(): {
  mcpServers: Record<string, { type: "http"; url: string }>;
} {
  return { mcpServers: { [PRODUCT]: { type: "http", url: MCP_URL } } };
}

export function cursorInstallLink(): string {
  const config = btoa(JSON.stringify(cursorServerConfig()));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(PRODUCT)}&config=${encodeURIComponent(config)}`;
}

export function vscodeInstallLink(): string {
  const payload = { name: PRODUCT, type: "http" as const, url: MCP_URL };
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify(payload))}`;
}

export function claudeConnectorLink(): string {
  const params = new URLSearchParams({
    modal: "add-custom-connector",
    connectorName: PRODUCT_TITLE,
    connectorUrl: MCP_URL
  });
  return `https://claude.ai/customize/connectors?${params.toString()}`;
}

export function serverCard(): Record<string, unknown> {
  return {
    $schema: SERVER_CARD_SCHEMA,
    name: SERVER_CARD_NAME,
    title: PRODUCT_TITLE,
    version: VERSION,
    description:
      "Public read-only MCP for the Trades-Runtime giveaway. Tools: trades_runtime_health, trades_runtime_stats, trades_runtime_cite, trades_runtime_skill. No authentication and no authorization server. Author Aziel Eliab. live_backends false. This card ships in the Worker source and is not a deploy.",
    websiteUrl: `${PUBLIC_ORIGIN}/`,
    remotes: [
      {
        type: "streamable-http",
        url: MCP_URL,
        supportedProtocolVersions: [...PROTOCOL_VERSIONS]
      }
    ]
  };
}

/** RFC 9728. Empty authorization_servers: public server, no authorization server. */
export function oauthProtectedResource(): Record<string, unknown> {
  return {
    resource: MCP_URL,
    authorization_servers: [],
    scopes_supported: [],
    bearer_methods_supported: [],
    resource_documentation: CONNECT_URL
  };
}
