"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, XCircle, RefreshCw, Globe, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TerminalComponent, { TerminalRef } from "./terminal";
import { cn } from "@/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

// ─── Multi-terminal tab types ─────────────────────────────────────────────────

interface TerminalTab {
  id: string;
  label: string;
}

let _tabCounter = 1;
function makeTab(): TerminalTab {
  const n = _tabCounter++;
  return { id: `t-${n}`, label: `Shell ${n}` };
}

// ─── Props (identical to original) ───────────────────────────────────────────

interface WebContainerPreviewProps {
  serverUrl: string | null;
  isLoading: boolean;
  error: string | null;
  instance: any;
  onRestartServer?: () => Promise<void>;
  className?: string;
  templateData?: any;
  terminalRef?: React.RefObject<TerminalRef>; // Accept terminal ref from parent
  showTerminal?: boolean;
  onServerReady?: (url: string) => void;
}

export const WebContainerPreview = ({
  serverUrl,
  isLoading,
  error,
  instance,
  onRestartServer,
  className,
  templateData,
  terminalRef: externalTerminalRef,
  showTerminal = true,
  onServerReady, // Receive ref from parent
}: WebContainerPreviewProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── original refs ──
  const internalTerminalRef = useRef<TerminalRef>(null);
  // tab-0 always uses the same ref the parent expects (unchanged behaviour)
  const tab0Ref = externalTerminalRef || internalTerminalRef;

  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [addressBarInput, setAddressBarInput] = useState<string>("");
  const healthCheckInterval = useRef<NodeJS.Timeout>();
  const fileChangeDebounceRef = useRef<NodeJS.Timeout>(); // kept from original
  const healthCheckAttempts = useRef(0);
  const [terminalServerUrl, setTerminalServerUrl] = useState<string | null>(null); // kept from original

  // ── multi-terminal state ──
  const [tabs, setTabs] = useState<TerminalTab[]>(() => {
    _tabCounter = 1; // reset so first tab is always "Shell 1"
    return [makeTab()];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);

  // Stable map: tabId -> ref (only for tabs beyond tab-0)
  const extraTabRefs = useRef<Map<string, React.RefObject<TerminalRef>>>(new Map());
  tabs.slice(1).forEach((tab) => {
    if (!extraTabRefs.current.has(tab.id)) {
      extraTabRefs.current.set(tab.id, React.createRef<TerminalRef>());
    }
  });

  const refForTab = (tabId: string): React.RefObject<TerminalRef> =>
    tabId === tabs[0].id
      ? tab0Ref
      : (extraTabRefs.current.get(tabId) ?? React.createRef<TerminalRef>());

  const handleAddTab = useCallback(() => {
    const t = makeTab();
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (tabs.length === 1) return; // never close the last tab
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId) setActiveTabId(next[next.length - 1].id);
        return next;
      });
      extraTabRefs.current.delete(tabId);
    },
    [tabs.length, activeTabId]
  );

  // ─── Terminal panel JSX ───────────────────────────────────────────────────
  // Extracted once here; used in both resizable-panel slots below so the
  // tab state is shared (same component instance, not two separate ones).

  const TerminalPanel = (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div
        className="flex items-center border-b bg-[#09090B] px-2 pt-1 shrink-0 overflow-x-auto"
        style={{ minHeight: 32 }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-t text-xs cursor-pointer select-none whitespace-nowrap transition-colors",
              activeTabId === tab.id
                ? "bg-[#18181B] text-white border border-b-0 border-zinc-700"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
            style={{ marginBottom: activeTabId === tab.id ? -1 : 0 }}
          >
            <span>{tab.label}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => handleCloseTab(tab.id, e)}
                className="ml-0.5 rounded hover:bg-zinc-600 p-0.5 text-zinc-400 hover:text-white transition-colors"
                title="Close tab"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        ))}

        {/* New tab button */}
        <button
          onClick={handleAddTab}
          className="ml-1 p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0"
          title="New terminal"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Terminal instances — all mounted, only active shown (preserves jsh shell) */}
      <div className="flex-1 relative min-h-0">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{ display: activeTabId === tab.id ? "block" : "none" }}
          >
            <TerminalComponent
              ref={refForTab(tab.id)}
              webContainerInstance={instance}
              theme="dark"
              className="h-full"
              onServerReady={tab.id === tabs[0].id ? onServerReady : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );

  // ─── All original effects below — zero changes ────────────────────────────

  // Health check for server readiness
  useEffect(() => {
    if (!serverUrl) {
      setIsPreviewReady(false);
      healthCheckAttempts.current = 0;
      setCurrentUrl("");
      setAddressBarInput("");
      return;
    }

    setCurrentUrl(serverUrl);
    setAddressBarInput("");

    console.log("🏥 Starting health check for:", serverUrl);
    healthCheckAttempts.current = 0;
    const maxAttempts = 30;

    const checkHealth = async () => {
      try {
        healthCheckAttempts.current++;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        await fetch(serverUrl, {
          method: "HEAD",
          mode: "no-cors",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log("✅ Preview server is ready!");
        setIsPreviewReady(true);
        setPreviewError(null);

        if (healthCheckInterval.current) {
          clearInterval(healthCheckInterval.current);
          healthCheckInterval.current = undefined;
        }
      } catch (error: any) {
        console.log(`⏳ Waiting for server... (${healthCheckAttempts.current}/${maxAttempts})`);

        if (healthCheckAttempts.current >= maxAttempts) {
          console.log("⚠️ Attempting to show preview anyway...");
          setIsPreviewReady(true);
          setPreviewError("Server may be slow to respond");

          if (healthCheckInterval.current) {
            clearInterval(healthCheckInterval.current);
            healthCheckInterval.current = undefined;
          }
        }
      }
    };

    checkHealth();
    healthCheckInterval.current = setInterval(checkHealth, 1000);

    return () => {
      if (healthCheckInterval.current) {
        clearInterval(healthCheckInterval.current);
        healthCheckInterval.current = undefined;
      }
    };
  }, [serverUrl]);

  // File change listener - log for debugging, let HMR handle updates
  useEffect(() => {
    if (!isPreviewReady || !iframeRef.current) return;

    const handleFileChange = (event: CustomEvent) => {
      console.log("📝 File changed:", event.detail?.path, "- HMR will handle the update");
    };

    window.addEventListener("webcontainerFileChange", handleFileChange as EventListener);

    return () => {
      window.removeEventListener("webcontainerFileChange", handleFileChange as EventListener);
    };
  }, [isPreviewReady]);

  useEffect(() => {
    if (!serverUrl) return;

    let wasServerDown = false;
    let consecutiveFailures = 0;
    let hasShownDownMessage = false;

    const checkServerStatus = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        await fetch(serverUrl, {
          method: "HEAD",
          mode: "no-cors",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        consecutiveFailures = 0;

        if (wasServerDown && iframeRef.current) {
          console.log("✅ Server back online via health check - auto-refreshing preview");
          setIsPreviewReady(true);
          setPreviewError(null);
          handleForceRefresh();
          wasServerDown = false;
          hasShownDownMessage = false;
        }
      } catch (error) {
        consecutiveFailures++;

        if (consecutiveFailures >= 3 && !wasServerDown) {
          console.log("⚠️ Server appears down via health check");
          wasServerDown = true;

          if (!hasShownDownMessage) {
            setIsPreviewReady(false);
            setPreviewError("Server stopped - waiting for restart...");
            hasShownDownMessage = true;
          }
        }
      }
    };

    const statusInterval = setInterval(checkServerStatus, 1000);
    return () => clearInterval(statusInterval);
  }, [serverUrl]);

  useEffect(() => {
    if (!instance) return;

    const handleServerStopped = (data?: { code?: number }) => {
      console.log("🛑 Server stopped event received", data);
      setIsPreviewReady(false);
      setPreviewError("Server restarting...");
      if (iframeRef.current) {
        iframeRef.current.src = "about:blank";
      }
    };

    const handleServerStarted = ({ url }: { port: number; url: string }) => {
      console.log("🚀 Server started event received:", url);
      setTimeout(() => {
        setIsPreviewReady(true);
        setPreviewError(null);
        if (iframeRef.current && url) {
          console.log("🔄 Auto-loading new server URL");
          setCurrentUrl(url);
          iframeRef.current.src = url;
        }
      }, 1500);
    };

    const { webContainerService } = require("../services/webContainer-services");
    webContainerService.on("server-stopped", handleServerStopped);
    webContainerService.on("server-ready", handleServerStarted);

    return () => {
      webContainerService.off("server-stopped", handleServerStopped);
      webContainerService.off("server-ready", handleServerStarted);
    };
  }, [instance]);

  const handleForceRefresh = async () => {
    if (!iframeRef.current) return;

    console.log("🔄 Force refreshing preview...");
    setIsRefreshing(true);

    const currentSrc = iframeRef.current.src;
    iframeRef.current.src = "about:blank";

    setTimeout(() => {
      if (iframeRef.current && currentSrc) {
        iframeRef.current.src = currentSrc;
      }
      setIsRefreshing(false);
    }, 100);
  };

  const handleNavigate = (path: string) => {
    if (!serverUrl) return;

    let cleanPath = path.replace(/^\.\.\//, "").replace(/^\//, "");

    if (cleanPath && !cleanPath.startsWith("/")) {
      cleanPath = "/" + cleanPath;
    }

    const newUrl = `${serverUrl}${cleanPath}`;
    console.log("🧭 Navigating to:", newUrl);

    setCurrentUrl(newUrl);
    setAddressBarInput(cleanPath);

    if (iframeRef.current) {
      iframeRef.current.src = newUrl;
    }
  };

  const handleAddressBarChange = (value: string) => {
    setAddressBarInput(value);
  };

  const handleAddressBarSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleNavigate(addressBarInput);
    }
  };

  const handleIframeLoad = () => {
    console.log("📺 Preview iframe loaded successfully");
    setPreviewError(null);
  };

  const handleIframeError = () => {
    console.error("❌ Preview iframe error");
    setPreviewError("Failed to load preview");
  };

  if (error) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-lg max-w-md">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="h-5 w-5" />
            <h3 className="font-semibold">Error</h3>
          </div>
          <p className="text-sm mb-2">{error}</p>
          <div className="flex gap-2 mt-4">
            {onRestartServer && (
              <Button onClick={onRestartServer} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Restart Server
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn("h-full flex items-center justify-center", className)}>
        <div className="text-center space-y-4 max-w-md p-6 rounded-lg bg-gray-50 dark:bg-gray-900">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <h3 className="text-lg font-medium">Setting Up Preview</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Initializing WebContainer environment...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-full flex flex-col bg-background", className)}>
      {/* Preview Header with Navigation */}
      <div className="flex flex-col border-b bg-muted/30">
        {/* Top Bar with Controls */}
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Preview</span>

            {serverUrl && (
              <div className="flex items-center gap-2">
                {isPreviewReady ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-xs text-muted-foreground">Live</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Connecting... ({healthCheckAttempts.current}/30)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleForceRefresh}
              disabled={!serverUrl || isRefreshing}
              className="h-7"
              title="Force refresh preview"
            >
              <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
            </Button>

            {onRestartServer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRestartServer}
                className="h-7 text-xs"
              >
                Restart Server
              </Button>
            )}
          </div>
        </div>

        {/* Address Bar */}
        {serverUrl && isPreviewReady && (
          <div className="flex items-center gap-2 px-4 py-2 bg-background/50">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Enter route: /dashboard, /settings, etc."
              value={addressBarInput}
              onChange={(e) => handleAddressBarChange(e.target.value)}
              onKeyDown={handleAddressBarSubmit}
              className="flex-1 h-7 text-xs px-3"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleNavigate(addressBarInput)}
              className="h-7 px-3 text-xs"
            >
              Go
            </Button>
          </div>
        )}
      </div>

      {/* Main Content Area with Resizable Terminal */}
      {serverUrl && isPreviewReady ? (
        showTerminal ? (
          <ResizablePanelGroup direction="vertical" className="flex-1">
            {/* Preview Panel */}
            <ResizablePanel defaultSize={70} minSize={30}>
              <div className="h-full bg-transparent">
                {previewError ? (
                  <div className="h-full flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/10">
                    <div className="text-center space-y-3 p-6">
                      <XCircle className="h-10 w-10 text-yellow-600 dark:text-yellow-400 mx-auto" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                          {previewError}
                        </p>
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                          The preview may still work - trying to load anyway
                        </p>
                      </div>
                      <Button onClick={handleForceRefresh} size="sm" variant="outline">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry
                      </Button>
                    </div>
                  </div>
                ) : (
                  <iframe
                    ref={iframeRef}
                    src={currentUrl}
                    className="w-full h-full border-none"
                    title="WebContainer Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-storage-access-by-user-activation"
                    onLoad={handleIframeLoad}
                    onError={handleIframeError}
                    allow="cross-origin-isolated"
                    referrerPolicy="origin"
                    style={{ backgroundColor: "inherit", colorScheme: "normal" }}
                  />
                )}
              </div>
            </ResizablePanel>

            {/* Resizable Handle */}
            <ResizableHandle />

            {/* ── Multi-terminal panel ── */}
            <ResizablePanel defaultSize={30} minSize={20}>
              {TerminalPanel}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          // Guest view - Full screen preview, no terminal
          <div className="flex-1 h-full bg-transparent">
            {previewError ? (
              <div className="h-full flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/10">
                <div className="text-center space-y-3 p-6">
                  <XCircle className="h-10 w-10 text-yellow-600 dark:text-yellow-400 mx-auto" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      {previewError}
                    </p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                      The preview may still work - trying to load anyway
                    </p>
                  </div>
                  <Button onClick={handleForceRefresh} size="sm" variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </div>
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                src={currentUrl}
                className="w-full h-full border-none"
                title="WebContainer Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-storage-access-by-user-activation"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                allow="cross-origin-isolated"
                style={{ backgroundColor: "inherit", colorScheme: "normal" }}
              />
            )}
          </div>
        )
      ) : (
        // Loading state
        showTerminal ? (
          <ResizablePanelGroup direction="vertical" className="flex-1">
            {/* Loading State */}
            <ResizablePanel defaultSize={70}>
              <div className="h-full flex flex-col items-center justify-center p-8 bg-muted/30">
                <div className="text-center space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                  <div>
                    <h3 className="text-lg font-semibold">
                      {serverUrl ? "Waiting for server..." : "Starting development server..."}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      {serverUrl
                        ? `Health checking ${serverUrl.split("//")[1]?.split(".")[0] || "server"}...`
                        : "This may take a few moments"}
                    </p>
                  </div>

                  {serverUrl && (
                    <div className="flex flex-col items-center gap-2 mt-4">
                      <code className="text-xs bg-muted px-3 py-1 rounded">{serverUrl}</code>
                      <Button onClick={handleForceRefresh} size="sm" variant="outline" className="mt-2">
                        Try Loading Anyway
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle />

            {/* ── Multi-terminal panel ── */}
            <ResizablePanel defaultSize={30} minSize={20}>
              {TerminalPanel}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          // Guest loading - no terminal
          <div className="flex-1 h-full flex flex-col items-center justify-center p-8 bg-muted/30">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <div>
                <h3 className="text-lg font-semibold">
                  {serverUrl ? "Waiting for server..." : "Connecting to host..."}
                </h3>
                <p className="text-sm text-muted-foreground mt-2">
                  {serverUrl ? "Loading preview from host..." : "Waiting for host to start the server"}
                </p>
              </div>

              {serverUrl && (
                <div className="flex flex-col items-center gap-2 mt-4">
                  <code className="text-xs bg-muted px-3 py-1 rounded">{serverUrl}</code>
                  <Button onClick={handleForceRefresh} size="sm" variant="outline" className="mt-2">
                    Try Loading Anyway
                  </Button>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
};