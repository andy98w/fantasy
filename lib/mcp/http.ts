import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createFantasyMcpServer, type FantasyMcpData } from "./server";

export async function handleMcpRequest(request: Request, deps: FantasyMcpData): Promise<Response> {
  const origin = request.headers.get("origin");
  const allowed = new Set([new URL(request.url).origin]);
  if (process.env.RAILWAY_PUBLIC_DOMAIN) allowed.add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  if (origin && !allowed.has(origin)) return Response.json({ error: "Origin not allowed." }, { status: 403 });
  // This server has no sessions or unsolicited events; Streamable HTTP clients
  // fall back to request/response when GET/SSE returns 405.
  if (request.method !== "POST") return new Response(null, { status: request.method === "OPTIONS" ? 204 : 405, headers: { Allow: "POST, OPTIONS", "Cache-Control": "no-store" } });
  const server = createFantasyMcpServer(deps);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 32768 });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "MCP request failed." } }, { status: 500 });
  } finally { await server.close(); }
}
