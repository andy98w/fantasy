// Node 22+: list tools, or call one with a JSON arguments object.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const url = process.env.MCP_SERVER_URL ?? 'https://web-production-8d109.up.railway.app/mcp';
const client = new Client({ name: 'fantasy-example-agent', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  const name = process.argv[2];
  const result = name
    ? await client.callTool({ name, arguments: JSON.parse(process.argv[3] ?? '{}') })
    : await client.listTools();
  console.log(JSON.stringify(result, null, 2));
  if (result.isError) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'MCP connection failed.');
  process.exitCode = 1;
} finally {
  await client.close();
}
