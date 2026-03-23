# MCP Apps Support — Demo Guide

This document explains how to demo and test the MCP Apps feature in Archestra.

## What are MCP Apps?

MCP Apps (per the [MCP Apps Extension spec](https://modelcontextprotocol.io/docs/extensions/apps)) are **interactive UI components** that MCP servers can embed directly in the AI chat interface. When an MCP tool call returns a result containing `_meta.ui.resourceUri`, Archestra renders an interactive iframe app inline in the chat thread — alongside the tool call output.

This allows MCP servers to provide rich, interactive UIs (data visualizers, form editors, dashboards) that live directly in the conversation flow.

## Architecture

```
Host (React/Archestra chat)
  └─ Outer iframe (GET /_sandbox — opaque origin, enforces CSP)
       └─ Inner iframe (MCP App HTML written via document.write)

AppBridge (from @modelcontextprotocol/ext-apps):
  - Fetches HTML resource via POST /api/mcp/:agentId (resources/read)
  - Relays tool calls from app → MCP server via POST /api/mcp/:agentId (tools/call)
  - Sends theme, styles, display mode from host → app
  - Handles display mode changes (inline ↔ fullscreen)
  - Forwards ui/message requests (app → conversation input)
```

**Security**: The `/_sandbox` route serves an HTML proxy with a strict CSP. The outer iframe has an opaque origin (no `allow-same-origin`) so untrusted content cannot access the parent page. Origin validation is enforced both via HTTP headers and JavaScript.

## Prerequisites

1. A running Archestra instance (frontend + backend)
2. An MCP server that supports the MCP Apps Extension (returns `_meta.ui.resourceUri` in tool results)

## Testing with n8n-mcp

[n8n-mcp](https://github.com/czlonkowski/n8n-mcp) is an MCP server that exposes n8n workflows as MCP tools. Recent versions support MCP Apps for workflow visualization.

### Setup

1. Install and run n8n-mcp:
   ```bash
   # Using Docker
   docker run -p 5678:5678 n8nio/n8n
   
   # Or via the n8n-mcp MCP server
   npx n8n-mcp start --port 3000
   ```

2. Connect n8n-mcp to Archestra:
   - Go to **MCP Registry** → **Add MCP Server**
   - Enter the server URL: `http://localhost:3000/mcp`
   - Assign it to an agent

3. Chat with the agent and call a workflow tool. If the workflow tool response includes `_meta.ui.resourceUri`, the MCP App will render.

## Testing with Excalidraw MCP

[excalidraw-mcp](https://github.com/excalidraw/excalidraw-mcp) is an MCP server that provides Excalidraw (a collaborative whiteboard) as an MCP App.

### Setup

1. Install excalidraw-mcp:
   ```bash
   npx excalidraw-mcp --port 3001
   ```

2. Connect to Archestra:
   - Go to **MCP Registry** → **Add MCP Server**
   - Enter: `http://localhost:3001/mcp`
   - Assign to an agent

3. Ask the agent to create a diagram. The tool result will include `_meta.ui.resourceUri`, and Archestra will render the Excalidraw editor inline in the chat.

## Testing with a Minimal MCP App

You can test MCP Apps without a full MCP server using the following minimal server:

```typescript
// minimal-mcp-app-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "demo-app", version: "1.0" }, { capabilities: { tools: {}, resources: {} } });

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [{
    name: "show_hello_world",
    description: "Render a Hello World MCP App",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: { supportsUi: true }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "show_hello_world") {
    return {
      content: [{ type: "text", text: "Hello World App rendered" }],
      _meta: {
        ui: {
          resourceUri: "ui://demo-app/hello-world"
        }
      }
    };
  }
  throw new Error("Unknown tool");
});

// Register resource handler for the UI HTML
server.setRequestHandler({ method: "resources/read" } as any, async (request: any) => {
  if (request.params.uri === "ui://demo-app/hello-world") {
    return {
      contents: [{
        uri: "ui://demo-app/hello-world",
        mimeType: "text/html",
        text: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: sans-serif; padding: 20px; background: transparent; }
  h1 { color: #2563eb; }
</style></head>
<body>
  <h1>Hello from MCP Apps! 🎉</h1>
  <p>This UI is rendered inside an Archestra chat via the MCP Apps Extension.</p>
  <p>Current time: <strong id="time"></strong></p>
  <script>
    setInterval(() => {
      document.getElementById('time').textContent = new Date().toLocaleTimeString();
    }, 1000);
  </script>
</body>
</html>`
      }]
    };
  }
  return { contents: [] };
});

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
server.connect(transport);

// Start HTTP server
import http from "http";
const httpServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/mcp") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      const rawBody = JSON.parse(body);
      await transport.handleRequest(req, res, rawBody);
    });
  } else {
    res.writeHead(404).end();
  }
});
httpServer.listen(3002, () => console.log("MCP App demo server on :3002"));
```

Run with:
```bash
ts-node minimal-mcp-app-server.ts
```

Then connect `http://localhost:3002/mcp` in Archestra and ask: "Show hello world app".

## Acceptance Criteria Verification

### AC1: MCP Apps render in the chat interface
✅ When a tool call returns `_meta.ui.resourceUri`, an iframe app renders below the tool call collapsible in the chat thread.

### AC2: Apps can call back into MCP tools
✅ The `AppBridge.onCallTool` handler proxies tool calls from the app to the MCP server via `POST /api/mcp/:agentId`. Tool calls are scoped to the server prefix (e.g., `myserver__mytool`) to prevent cross-server access.

### AC3: Display mode switching (inline ↔ fullscreen)
✅ Apps can request fullscreen via `ui/notifications/displayModeChange`. Pressing Escape or the X button returns to inline mode.

### AC4: Theme propagation
✅ Archestra's CSS variables are mapped to the MCP UI standard style variables and sent to the app via `AppBridge`. Dark/light mode changes are forwarded in real-time.

## File Changes

### Backend
- `platform/backend/src/routes/mcp-proxy.ts` — New route: `POST /api/mcp/:agentId` (session-auth MCP proxy)
- `platform/backend/src/routes/index.ts` — Exports `mcpProxyRoutes`
- `platform/backend/src/server.ts` — Serves `/_sandbox` static HTML; imports `readFileSync`/`join`/`fileURLToPath`
- `platform/backend/src/static/mcp-sandbox-proxy.html` — Double-iframe isolation proxy for MCP App security
- `platform/backend/src/auth/fastify-plugin/middleware.ts` — Skips auth for `/_sandbox`

### Frontend
- `platform/frontend/package.json` — Adds `@modelcontextprotocol/ext-apps: ^1.1.1`
- `platform/frontend/src/lib/config.ts` — Adds `getMcpSandboxBaseUrl()`
- `platform/frontend/src/components/chat/mcp-app-container.tsx` — New: `McpAppSection` + `McpAppView` (AppBridge + iframe)
- `platform/frontend/src/components/chat/chat-messages.tsx` — Detects `_meta.ui.resourceUri` and renders `McpAppSection`
