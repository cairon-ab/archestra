"use client";

import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import type {
  McpUiDisplayMode,
  McpUiResourceCsp,
  McpUiResourcePermissions,
  McpUiStyles,
} from "@modelcontextprotocol/ext-apps";
import { useTheme } from "next-themes";
import type React from "react";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getMcpSandboxBaseUrl } from "@/lib/config";
import { cn } from "@/lib/utils";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type McpCallToolResult = CallToolResult;

/**
 * Shape of MCP tool output stored by the backend in the AI SDK's tool result.
 * Contains a text string for model context plus rich metadata for UI rendering.
 *
 * Matches the return type of `executeMcpTool` in chat-mcp-client.ts.
 */
export type McpToolOutput = {
  /** Text representation for the model and text-only hosts */
  content: string;
  /** Additional metadata (timestamps, version info, etc.) not intended for model context */
  _meta?: Record<string, unknown>;
  /** Structured data optimized for UI rendering (not added to model context) */
  structuredContent?: Record<string, unknown>;
  /** Original MCP content blocks from the tool response */
  rawContent?: McpCallToolResult["content"];
};

const AVAILABLE_DISPLAY_MODES: McpUiDisplayMode[] = ["inline", "fullscreen"];

/** Reads a CSS custom property value from :root */
function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/**
 * Collects all @font-face rules from the document's stylesheets and resolves
 * relative URLs to absolute so cross-origin sandbox iframes can load them.
 * Cached by stylesheet count to avoid repeated iteration.
 */
let _cachedFontFaces = "";
let _cachedSheetCount = -1;

function collectFontFacesCss(): string {
  if (document.styleSheets.length === _cachedSheetCount) {
    return _cachedFontFaces;
  }
  const rules: string[] = [];
  const origin = window.location.origin;
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSFontFaceRule) {
            // Make relative src paths absolute for cross-origin iframe access
            const cssText = rule.cssText.replace(
              /url\((['"]?)(\/[^)'"]+)\1\)/g,
              (_match, _quote, path) => `url("${origin}${path}")`,
            );
            rules.push(cssText);
          }
        }
      } catch {
        // Cross-origin stylesheets are not accessible — skip
      }
    }
  } catch {
    // Ignore
  }
  _cachedSheetCount = document.styleSheets.length;
  _cachedFontFaces = rules.join("\n");
  return _cachedFontFaces;
}

/**
 * Maps Archestra's shadcn/tweakcn CSS variables to the MCP UI standardised
 * style variable keys so Views can theme themselves to match the host.
 * Cached by document.documentElement.className to avoid redundant reads.
 */
let _cachedStyles: McpUiStyles | null = null;
let _cachedClassName = "";

function buildMcpUiStyleVariables(): McpUiStyles {
  const currentClassName = document.documentElement.className;
  if (_cachedStyles && currentClassName === _cachedClassName) {
    return _cachedStyles;
  }
  const bg = getCssVar("--background");
  const fg = getCssVar("--foreground");
  const card = getCssVar("--card");
  const muted = getCssVar("--muted");
  const mutedFg = getCssVar("--muted-foreground");
  const border = getCssVar("--border");
  const ring = getCssVar("--ring");
  const destructive = getCssVar("--destructive");
  const primary = getCssVar("--primary");
  const primaryFg = getCssVar("--primary-foreground");
  const radius = getCssVar("--radius");
  const fontSans = getCssVar("--font-sans");
  const fontMono = getCssVar("--font-mono");
  const shadowSm = getCssVar("--shadow-sm");
  const shadowMd = getCssVar("--shadow-md");
  const shadowLg = getCssVar("--shadow-lg");

  const result: McpUiStyles = {
    // Backgrounds
    "--color-background-primary": card,
    "--color-background-secondary": bg,
    "--color-background-tertiary": bg,
    "--color-background-inverse": primary,
    "--color-background-ghost": "transparent",
    "--color-background-info": undefined,
    "--color-background-danger": destructive,
    "--color-background-success": undefined,
    "--color-background-warning": undefined,
    "--color-background-disabled": border,
    // Text
    "--color-text-primary": fg,
    "--color-text-secondary": mutedFg,
    "--color-text-tertiary": fg,
    "--color-text-inverse": primaryFg,
    "--color-text-ghost": bg,
    "--color-text-info": primary,
    "--color-text-danger": destructive,
    "--color-text-success": undefined,
    "--color-text-warning": undefined,
    "--color-text-disabled": mutedFg,
    // Borders
    "--color-border-primary": border,
    "--color-border-secondary": border,
    "--color-border-tertiary": undefined,
    "--color-border-inverse": undefined,
    "--color-border-ghost": "transparent",
    "--color-border-info": undefined,
    "--color-border-danger": destructive,
    "--color-border-success": undefined,
    "--color-border-warning": undefined,
    "--color-border-disabled": muted,
    // Rings
    "--color-ring-primary": ring,
    "--color-ring-secondary": ring,
    "--color-ring-inverse": primaryFg,
    "--color-ring-info": ring,
    "--color-ring-danger": destructive,
    "--color-ring-success": undefined,
    "--color-ring-warning": undefined,
    // Typography — family
    "--font-sans": fontSans,
    "--font-mono": fontMono,
    // Typography — weight
    "--font-weight-normal": "400",
    "--font-weight-medium": "500",
    "--font-weight-semibold": "600",
    "--font-weight-bold": "700",
    // Typography — text size
    "--font-text-xs-size": "0.75rem",
    "--font-text-sm-size": "0.875rem",
    "--font-text-md-size": "1rem",
    "--font-text-lg-size": "1.125rem",
    // Typography — heading size
    "--font-heading-xs-size": "1.25rem",
    "--font-heading-sm-size": "1.5rem",
    "--font-heading-md-size": "1.875rem",
    "--font-heading-lg-size": "2.25rem",
    "--font-heading-xl-size": "3rem",
    "--font-heading-2xl-size": "3.75rem",
    "--font-heading-3xl-size": "4.5rem",
    // Typography — text line height
    "--font-text-xs-line-height": "1rem",
    "--font-text-sm-line-height": "1.25rem",
    "--font-text-md-line-height": "1.5rem",
    "--font-text-lg-line-height": "1.75rem",
    // Typography — heading line height
    "--font-heading-xs-line-height": "1.75rem",
    "--font-heading-sm-line-height": "2rem",
    "--font-heading-md-line-height": "2.25rem",
    "--font-heading-lg-line-height": "2.5rem",
    "--font-heading-xl-line-height": "1",
    "--font-heading-2xl-line-height": "1",
    "--font-heading-3xl-line-height": "1",
    // Border radius
    "--border-radius-xs": "2px",
    "--border-radius-sm": `calc(${radius} - 4px)`,
    "--border-radius-md": `calc(${radius} - 2px)`,
    "--border-radius-lg": radius,
    "--border-radius-xl": `calc(${radius} + 4px)`,
    "--border-radius-full": "9999px",
    // Border width
    "--border-width-regular": "1px",
    // Shadows
    "--shadow-hairline": `0 0 0 1px ${border}`,
    "--shadow-sm": shadowSm,
    "--shadow-md": shadowMd,
    "--shadow-lg": shadowLg,
  };
  _cachedClassName = currentClassName;
  _cachedStyles = result;
  return result;
}

/** Catches render errors from MCP App iframes so a crashing app doesn't take down the chat. */
class McpAppErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          MCP App crashed: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

/** Metadata extracted from a UI resource's _meta.ui */
interface AppResourceMeta {
  html: string;
  csp?: McpUiResourceCsp;
  permissions?: McpUiResourcePermissions;
}

/**
 * Self-contained MCP App section for use inside a Tool collapsible.
 * Owns display-mode / size state and the rawToolResult derivation so the
 * parent only needs to forward the raw output from the tool part.
 */
export function McpAppSection({
  uiResourceUri,
  agentId,
  toolName,
  toolInput,
  rawOutput,
  preloadedResource,
  onSendMessage,
}: {
  uiResourceUri: string;
  agentId: string;
  /** Full prefixed tool name (e.g. "system__get-system-stats") — used to derive the server prefix for oncalltool */
  toolName: string;
  toolInput?: Record<string, unknown>;
  rawOutput: McpToolOutput | undefined;
  /** HTML pre-fetched by the backend and delivered via SSE — skips the in-browser HTTP fetch */
  preloadedResource?: AppResourceMeta;
  /** Called when the MCP App sends a ui/message request to inject a user message into the conversation */
  onSendMessage?: (text: string) => void;
}) {
  const [displayMode, setDisplayMode] = useState<McpUiDisplayMode>("inline");
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  // Reconstruct McpCallToolResult for AppFrame
  const toolResult = useMemo((): McpCallToolResult | undefined => {
    if (!rawOutput) return undefined;
    return {
      content: rawOutput.rawContent ?? [
        { type: "text" as const, text: rawOutput.content },
      ],
      structuredContent: rawOutput.structuredContent,
      _meta: rawOutput._meta,
      isError: false,
    };
  }, [rawOutput]);

  return (
    <McpAppErrorBoundary>
      <McpAppContainer
        displayMode={displayMode}
        onClose={() => setDisplayMode("inline")}
        size={size}
      >
        <McpAppView
          toolResourceUri={uiResourceUri}
          agentId={agentId}
          serverPrefix={
            toolName.includes("__") ? toolName.split("__")[0] : toolName
          }
          displayMode={displayMode}
          onDisplayModeChange={setDisplayMode}
          onSizeChange={setSize}
          toolInput={toolInput}
          toolResult={toolResult}
          preloadedResource={preloadedResource}
          onSendMessage={onSendMessage}
        />
      </McpAppContainer>
    </McpAppErrorBoundary>
  );
}

/**
 * Container that handles display mode switching (inline ↔ fullscreen).
 *
 * Uses a single stable React tree for both modes so that children (iframe)
 * are never unmounted/remounted when toggling — only CSS classes change.
 */
function McpAppContainer({
  displayMode,
  onClose,
  children,
  size,
}: {
  displayMode: McpUiDisplayMode;
  onClose: () => void;
  children: React.ReactNode;
  size: { width: number; height: number } | null;
}) {
  const isFullscreen = displayMode === "fullscreen";
  const [bounds, setBounds] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, onClose]);

  // Cover the entire viewport in fullscreen mode
  useEffect(() => {
    if (!isFullscreen) {
      setBounds(null);
      return;
    }
    setBounds({
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    });
    const update = () => {
      setBounds({
        top: 0,
        left: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, [isFullscreen]);

  return (
    <div
      className={cn(
        "will-change-auto origin-center transition-all duration-400 ease-[cubic-bezier(0.23,1,0.32,1)]",
        isFullscreen ? "fixed z-[100] bg-background flex flex-col" : "p-4 pt-0",
        isFullscreen && !bounds
          ? "opacity-0 scale-95 pointer-events-none"
          : "opacity-100 scale-100",
      )}
      style={
        isFullscreen && bounds
          ? {
              top: bounds.top,
              left: bounds.left,
              width: bounds.width,
              height: bounds.height,
            }
          : undefined
      }
    >
      {/* Close bar — animates in smoothly instead of snapping */}
      <div
        className={cn(
          "flex items-center justify-end border-b transition-all duration-300 overflow-hidden",
          isFullscreen
            ? "h-12 p-2 opacity-100"
            : "h-0 p-0 opacity-0 border-transparent",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Exit fullscreen"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </Button>
      </div>

      <div
        style={{
          maxHeight: isFullscreen
            ? `${bounds?.height || 1000}px`
            : `${size?.height || 150}px`,
        }}
        className={cn(
          "transition-[max-height] duration-400 ease-[cubic-bezier(0.23,1,0.32,1)]",
          isFullscreen
            ? "flex-1 overflow-hidden [&_iframe]:!w-full [&_iframe]:!h-full"
            : "overflow-hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * McpAppView — connects an MCP App View (iframe) to the host via AppBridge.
 *
 * Architecture (single-port, same backend origin):
 *
 *   Host (this component)
 *     └─ Outer iframe (/_sandbox — opaque origin, enforces CSP)
 *          └─ Inner iframe (MCP App HTML — written via document.write)
 *
 * The outer iframe is loaded from `/_sandbox` on the backend.
 * It acts as a postMessage relay between the host and the inner iframe.
 * The inner iframe contains the actual MCP App HTML from the resource URI.
 *
 * AppBridge connects to the outer iframe via PostMessageTransport and handles:
 *   - Fetching the resource HTML from the MCP server via POST /api/mcp/:agentId
 *   - Forwarding tool calls from the app to the MCP server
 *   - Theme injection (CSS variables)
 *   - Display mode changes (inline ↔ fullscreen)
 *   - Size change notifications
 */
function McpAppView({
  toolResourceUri,
  agentId,
  serverPrefix,
  displayMode,
  onDisplayModeChange,
  onSizeChange,
  toolInput,
  toolResult,
  preloadedResource,
  onSendMessage,
}: {
  toolResourceUri: string;
  agentId: string;
  /** Server prefix for scoping tool calls (part before "__" in tool name) */
  serverPrefix: string;
  displayMode: McpUiDisplayMode;
  onDisplayModeChange: (mode: McpUiDisplayMode) => void;
  onSizeChange: (size: { width: number; height: number } | null) => void;
  toolInput?: Record<string, unknown>;
  toolResult?: McpCallToolResult;
  preloadedResource?: AppResourceMeta;
  onSendMessage?: (text: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const { resolvedTheme } = useTheme();

  // Stable callback refs to avoid re-connecting bridge on every render
  const onDisplayModeChangeRef = useRef(onDisplayModeChange);
  onDisplayModeChangeRef.current = onDisplayModeChange;
  const onSizeChangeRef = useRef(onSizeChange);
  onSizeChangeRef.current = onSizeChange;
  const onSendMessageRef = useRef(onSendMessage);
  onSendMessageRef.current = onSendMessage;

  // Sandbox URL — served at /_sandbox on the backend
  const sandboxUrl = useMemo(() => {
    const base = getMcpSandboxBaseUrl();
    return `${base}/_sandbox`;
  }, []);

  // Backend proxy URL for MCP JSON-RPC requests
  const mcpProxyUrl = useMemo(() => {
    // Use relative URL (same origin) for the API proxy
    return `/api/mcp/${agentId}`;
  }, [agentId]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;

    const transport = new PostMessageTransport(iframe);

    const bridge = new AppBridge({
      transport,
      resourceUri: toolResourceUri,
      /**
       * Fetch the resource HTML from the MCP server via the backend proxy.
       * Uses the session cookie for authentication (no separate token needed).
       */
      onFetchResource: async (uri) => {
        if (preloadedResource) {
          return {
            html: preloadedResource.html,
            csp: preloadedResource.csp,
            permissions: preloadedResource.permissions,
          };
        }

        // POST to the MCP proxy with resources/read request
        const response = await fetch(mcpProxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "resources/read",
            params: { uri },
            id: 1,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch MCP resource: ${response.status}`);
        }

        const result = await response.json();
        if (result.error) {
          throw new Error(
            `MCP error: ${result.error.message || JSON.stringify(result.error)}`,
          );
        }

        const contents = result.result?.contents;
        if (!Array.isArray(contents) || contents.length === 0) {
          throw new Error("MCP resource returned no content");
        }

        const content = contents[0];
        if (content.mimeType !== "text/html") {
          throw new Error(
            `MCP resource has unexpected MIME type: ${content.mimeType}`,
          );
        }

        return {
          html: content.text as string,
          csp: content.csp as McpUiResourceCsp | undefined,
          permissions: content.permissions as
            | McpUiResourcePermissions
            | undefined,
        };
      },

      /**
       * Execute tool calls from the MCP App via the backend proxy.
       * Enforces server prefix scoping to prevent cross-server tool access.
       */
      onCallTool: async (name, args) => {
        // Enforce server prefix scoping: only allow tools from the owning server
        const expectedPrefix = serverPrefix + "__";
        if (!name.startsWith(expectedPrefix)) {
          throw new Error(
            `Tool "${name}" is not accessible from this MCP App (server prefix mismatch)`,
          );
        }

        const response = await fetch(mcpProxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "tools/call",
            params: { name, arguments: args },
            id: Date.now(),
          }),
        });

        if (!response.ok) {
          throw new Error(`Tool call failed: ${response.status}`);
        }

        const result = await response.json();
        if (result.error) {
          throw new Error(
            `Tool error: ${result.error.message || JSON.stringify(result.error)}`,
          );
        }

        return result.result as McpCallToolResult;
      },

      /** Handle display mode changes requested by the MCP App */
      onDisplayModeChange: (mode) => {
        if (AVAILABLE_DISPLAY_MODES.includes(mode)) {
          onDisplayModeChangeRef.current(mode);
        }
      },

      /** Track iframe size changes for inline mode height */
      onSizeChange: (size) => {
        onSizeChangeRef.current(size);
      },

      /** Handle ui/message requests to inject text into the conversation */
      onSendMessage: onSendMessage
        ? (text) => {
            onSendMessageRef.current?.(text);
          }
        : undefined,

      /** Pass the tool result so the App can render initial state immediately */
      toolResult,

      /** Pass the tool input so the App can pre-populate its form */
      toolInput,

      /** Pass host theme and CSS variables for consistent styling */
      styles: buildMcpUiStyleVariables(),

      /** Pass font-face CSS for consistent typography in cross-origin iframes */
      fontFacesCss: collectFontFacesCss(),

      /** Current display mode */
      displayMode,

      /** Available display modes */
      availableDisplayModes: AVAILABLE_DISPLAY_MODES,

      /** Host color scheme */
      colorScheme: (resolvedTheme === "dark" ? "dark" : "light") as
        | "light"
        | "dark",
    });

    bridgeRef.current = bridge;

    bridge.connect().catch((err) => {
      if (!cancelled) {
        console.error("[McpAppView] AppBridge connection error:", err);
      }
    });

    return () => {
      cancelled = true;
      bridgeRef.current = null;
      bridge.teardown();
    };
  }, [
    toolResourceUri,
    agentId,
    mcpProxyUrl,
    serverPrefix,
    preloadedResource,
    toolResult,
    toolInput,
    resolvedTheme,
    onSendMessage,
    displayMode,
    sandboxUrl,
  ]);

  // Forward display mode changes to the bridge
  useEffect(() => {
    bridgeRef.current?.setDisplayMode(displayMode);
  }, [displayMode]);

  // Forward theme changes to the bridge
  useEffect(() => {
    bridgeRef.current?.setStyles(buildMcpUiStyleVariables());
    bridgeRef.current?.setColorScheme(
      (resolvedTheme === "dark" ? "dark" : "light") as "light" | "dark",
    );
  }, [resolvedTheme]);

  return (
    <iframe
      ref={iframeRef}
      src={sandboxUrl}
      title="MCP App"
      // Double sandbox: outer opaque origin (no allow-same-origin here),
      // inner sandbox is set by the proxy HTML after receiving the HTML content.
      sandbox="allow-scripts"
      className="w-full border-0"
      style={{ height: "150px", minHeight: "100px" }}
      aria-label="MCP App panel"
    />
  );
}
