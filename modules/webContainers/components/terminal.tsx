"use client";

import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { SearchAddon } from "xterm-addon-search";
import "xterm/css/xterm.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Copy, Trash2, Download, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalProps {
  webcontainerUrl?: string;
  className?: string;
  theme?: "dark" | "light";
  webContainerInstance?: any;
  onServerReady?: (url: string) => void; // Callback when server starts
  autoStartCommand?: string; //Command to run automatically
}

// Define the methods that will be exposed through the ref
export interface TerminalRef {
  writeToTerminal: (data: string) => void;
  clearTerminal: () => void;
  focusTerminal: () => void;
  getWorkingDirectory: () => string;
  runCommand: (command: string) => Promise<void>; // 🔥 NEW: Programmatically run commands
}

const TerminalComponent = forwardRef<TerminalRef, TerminalProps>(({ 
  webcontainerUrl, 
  className,
  theme = "dark",
  webContainerInstance,
  onServerReady,
  autoStartCommand
}, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const searchAddon = useRef<SearchAddon | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  
  // 🔥 Shell state
  const shellProcess = useRef<any>(null);
  const shellWriter = useRef<WritableStreamDefaultWriter | null>(null);
  const workingDirectory = useRef<string>("/");
  const environmentVariables = useRef<Map<string, string>>(new Map([
    ["PATH", "/usr/local/bin:/usr/bin:/bin"],
    ["HOME", "/home"],
    ["USER", "user"],
  ]));
  
  // Command history
  const commandHistory = useRef<string[]>([]);
  const historyIndex = useRef<number>(-1);
  const commandBuffer = useRef<string>("");
  
  // 🔥 NEW: Track if auto-start command has been run
  const hasRunAutoStart = useRef<boolean>(false);
  const serverRunningInForeground = useRef<boolean>(false);

  const terminalThemes = {
    dark: {
      background: "#09090B",
      foreground: "#FAFAFA",
      cursor: "#FAFAFA",
      cursorAccent: "#09090B",
      selection: "#27272A",
      black: "#18181B",
      red: "#EF4444",
      green: "#22C55E",
      yellow: "#EAB308",
      blue: "#3B82F6",
      magenta: "#A855F7",
      cyan: "#06B6D4",
      white: "#F4F4F5",
      brightBlack: "#3F3F46",
      brightRed: "#F87171",
      brightGreen: "#4ADE80",
      brightYellow: "#FDE047",
      brightBlue: "#60A5FA",
      brightMagenta: "#C084FC",
      brightCyan: "#22D3EE",
      brightWhite: "#FFFFFF",
    },
    light: {
      background: "#FFFFFF",
      foreground: "#18181B",
      cursor: "#18181B",
      cursorAccent: "#FFFFFF",
      selection: "#E4E4E7",
      black: "#18181B",
      red: "#DC2626",
      green: "#16A34A",
      yellow: "#CA8A04",
      blue: "#2563EB",
      magenta: "#9333EA",
      cyan: "#0891B2",
      white: "#F4F4F5",
      brightBlack: "#71717A",
      brightRed: "#EF4444",
      brightGreen: "#22C55E",
      brightYellow: "#EAB308",
      brightBlue: "#3B82F6",
      brightMagenta: "#A855F7",
      brightCyan: "#06B6D4",
      brightWhite: "#FAFAFA",
    },
  };

  const writePrompt = useCallback(() => {
    if (term.current) {
      const promptText = `\r\n${workingDirectory.current} $ `;
      term.current.write(promptText);
      commandBuffer.current = "";
    }
  }, []);

  // 🔥 NEW: Detect server URL from output
  const detectServerUrl = useCallback((output: string) => {
    const patterns = [
    // WebContainer-specific URL (highest priority)
    /(https?:\/\/[a-z0-9-]+\.webcontainer\.io)/i,
    /(https?:\/\/[a-z0-9-]+--\d+--[a-z0-9]+\.local-corp\.webcontainer-api\.io)/i,
    
    // Generic patterns that might contain WebContainer URLs
    /Server ready at:?\s+(https?:\/\/[^\s]+webcontainer[^\s]+)/i,
    /Local:?\s+(https?:\/\/[^\s]+webcontainer[^\s]+)/i,
    /listening on (https?:\/\/[^\s]+webcontainer[^\s]+)/i,
    /ready on (https?:\/\/[^\s]+webcontainer[^\s]+)/i,
  ];

    for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match && match[1]) {
      const url = match[1].trim();
      
      // 🔥 CRITICAL: Verify it's actually a WebContainer URL
      if (url.includes('webcontainer')) {
        console.log(`🔍 Terminal detected server URL: ${url}`);
        onServerReady?.(url);
        break;
      }
    }
  }


  }, [onServerReady]);

  // 🔥 FIXED: Initialize persistent shell session
  const initializeShell = useCallback(async () => {
    if (!webContainerInstance || shellProcess.current) return;

    try {
      console.log("🐚 Starting persistent shell session (jsh)...");
      
      const shell = await webContainerInstance.spawn("jsh", [], {
        terminal: {
          cols: term.current?.cols || 80,
          rows: term.current?.rows || 24,
        },
      });

      shellProcess.current = shell;
      shellWriter.current = shell.input.getWriter();

      // 🔥 CRITICAL: Pipe shell output to terminal AND detect server URLs
      shell.output.pipeTo(
        new WritableStream({
          write: (data) => {
            if (term.current) {
              const isSigintError = 
          data.includes('ERR_INVALID_ARG_TYPE') && 
          data.includes('SIGINT') &&
          (data.includes('start-server.js') || data.includes('process.exit'));

          if (isSigintError) {
          console.warn('🔇 Filtered Next.js SIGINT error (known WebContainer bug)');
          return; // Don't display this error
        }
        
              term.current.write(data);
              
              // 🔥 Detect server URL from output
              detectServerUrl(data);
              //new
              const serverListeningPatterns = [
                /listening on.*port (\d+)/i,
                /server.*running.*(?:port|on).*(\d+)/i,
                /started.*on.*(\d+)/i,
                /express.*server.*listening/i,
                /server is running/i,
                /app listening/i,
                /listening at/i,
              ];
               for (const pattern of serverListeningPatterns) {
                if (pattern.test(data)) {
                  console.log("🌐 Detected server started - marking as foreground process");
                  serverRunningInForeground.current = true;
                  
                  // Show a helpful message for Express apps
                  setTimeout(() => {
                    if (term.current && serverRunningInForeground.current) {
                      term.current.write('\r\n💡 Server is running in foreground. Press Ctrl+C to stop it and run other commands.\r\n');
                    }
                  }, 500);
                  break;
                }
              }
              
              // Detect working directory changes
              const cdMatch = data.match(/cd\s+([^\r\n]+)/);
              if (cdMatch) {
                const newDir = cdMatch[1].trim();
                if (newDir === "..") {
                  workingDirectory.current = workingDirectory.current
                    .split("/")
                    .slice(0, -1)
                    .join("/") || "/";
                } else if (newDir.startsWith("/")) {
                  workingDirectory.current = newDir;
                } else {
                  workingDirectory.current = `${workingDirectory.current}/${newDir}`.replace(/\/+/g, "/");
                }
                console.log(`📁 Working directory changed to: ${workingDirectory.current}`);
              }
            }
          },
        })
      );

      // Handle shell exit
      shell.exit.then((code: number) => {
        console.log(`🐚 Shell exited with code ${code}`);
        if (term.current) {
          if (code !== 0) {
            term.current.writeln(`\r\n❌ Shell exited with code ${code}`);
          }
          writePrompt();
        }
        shellProcess.current = null;
        shellWriter.current = null;
        
        // Attempt to restart shell
        setTimeout(() => {
          if (webContainerInstance) {
            initializeShell();
          }
        }, 1000);
      });

      setIsConnected(true);
      if (term.current) {
        term.current.writeln("✅ Shell session ready");
        writePrompt();
        console.log("emitting terminal ready");
        window.dispatchEvent(new CustomEvent('terminalReady'));
        
        // 🔥 NEW: Auto-run command if provided and not yet run
        if (autoStartCommand && !hasRunAutoStart.current) {
          hasRunAutoStart.current = true;
          console.log(`🚀 Auto-running command: ${autoStartCommand}`);
          
          // Small delay to let shell fully initialize
          setTimeout(async () => {
            await executeCommand(autoStartCommand);
          }, 500);
        }
      }
    } catch (error) {
      console.error("❌ Failed to start shell:", error);
      if (term.current) {
        term.current.writeln("\r\n❌ Failed to start shell session");
      }
      setIsConnected(false);
    }
  }, [webContainerInstance, writePrompt, autoStartCommand, detectServerUrl]);

  // 🔥 FIXED: Execute command through persistent shell
  const executeCommand = useCallback(async (command: string) => {
    if (!shellWriter.current || !term.current) {
      console.warn("⚠️ Cannot execute command - shell not ready");
      return;
    }

    const trimmedCommand = command.trim();
    
    // Add to history (avoid duplicates)
    if (trimmedCommand && commandHistory.current[commandHistory.current.length - 1] !== trimmedCommand) {
      commandHistory.current.push(trimmedCommand);
      if (commandHistory.current.length > 1000) {
        commandHistory.current = commandHistory.current.slice(-1000);
      }
    }
    historyIndex.current = -1;

    try {
      // Handle built-in commands (client-side)
      if (trimmedCommand === "clear" || trimmedCommand === "cls") {
        term.current.clear();
        writePrompt();
        return;
      }

      if (trimmedCommand === "history") {
        commandHistory.current.forEach((cmd, index) => {
          term.current!.writeln(`  ${index + 1}  ${cmd}`);
        });
        writePrompt();
        return;
      }

      if (trimmedCommand.startsWith("export ")) {
        const match = trimmedCommand.match(/export\s+(\w+)=(.+)/);
        if (match) {
          const [, key, value] = match;
          environmentVariables.current.set(key, value.replace(/['"]/g, ""));
          term.current.writeln(`✅ Set ${key}=${value}`);
        }
        writePrompt();
        return;
      }

      if (trimmedCommand === "env") {
        environmentVariables.current.forEach((value, key) => {
          term.current!.writeln(`${key}=${value}`);
        });
        writePrompt();
        return;
      }

      // Empty command - just show new prompt
      if (trimmedCommand === "") {
        writePrompt();
        return;
      }

      // 🔥 Send command to persistent shell
      console.log(`📤 Sending command to shell: ${trimmedCommand}`);
      await shellWriter.current.write(trimmedCommand + "\n");
      
    } catch (error) {
      console.error("❌ Command execution error:", error);
      if (term.current) {
        term.current.writeln(`\r\n❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        writePrompt();
      }
    }
  }, [writePrompt]);

  // 🔥 ENHANCED: Terminal input handler with ALL keyboard shortcuts
  const handleTerminalInput = useCallback((data: string) => {
    if (!term.current) return;

    // Handle special characters and sequences
    switch (data) {
      case '\r': // Enter
        term.current.write('\r\n');
        executeCommand(commandBuffer.current);
        commandBuffer.current = "";
        break;
        
      case '\u007F': // Backspace
        if (commandBuffer.current.length > 0) {
          commandBuffer.current = commandBuffer.current.slice(0, -1);
          term.current.write('\b \b');
        }
        break;
        
      case '\u0003': // Ctrl+C
        
        
        term.current.write('^C\r\n');
        commandBuffer.current = "";
        
        const wasServerRunning = serverRunningInForeground.current;
        
        if (shellWriter.current) {
          try {
            shellWriter.current.write('\x03');
            
            // 🔥 Smart reset: Clear flag after delay to allow process cleanup
            setTimeout(() => {
              if (wasServerRunning) {
                console.log("🔓 Resetting terminal - server interrupted");
              }
              serverRunningInForeground.current = false;
              
              if (term.current) {
                writePrompt();
              }
            }, 300); // Increased to 300ms for Express cleanup
            
          } catch (error) {
            console.error("Failed to send Ctrl+C:", error);
            serverRunningInForeground.current = false;
            setTimeout(() => writePrompt(), 100);
          }
        } else {
          serverRunningInForeground.current = false;
          writePrompt();
        }
        break;
      case '\u0004': // Ctrl+D (EOF)
        if (commandBuffer.current === "") {
          term.current.write('\r\nexit\r\n');
          shellProcess.current?.kill();
        }
        break;
        
      case '\u000C': // Ctrl+L (clear screen)
        term.current.clear();
        writePrompt();
        break;
        
      case '\u0015': // Ctrl+U (delete line)
        term.current.write('\r' + ' '.repeat(commandBuffer.current.length + workingDirectory.current.length + 3));
        commandBuffer.current = "";
        writePrompt();
        break;
        
      case '\u0017': // Ctrl+W (delete word)
        const words = commandBuffer.current.trim().split(' ');
        if (words.length > 1) {
          const lastWord = words.pop()!;
          commandBuffer.current = words.join(' ') + ' ';
          term.current.write('\b \b'.repeat(lastWord.length));
        } else {
          term.current.write('\b \b'.repeat(commandBuffer.current.length));
          commandBuffer.current = "";
        }
        break;
        
      case '\u0001': // Ctrl+A (beginning of line)
        term.current.write('\r' + `${workingDirectory.current} $ `);
        break;
        
      case '\u0005': // Ctrl+E (end of line)
        term.current.write('\r' + `${workingDirectory.current} $ ${commandBuffer.current}`);
        break;
        
      case '\u001b[A': // Up arrow - previous command
        if (commandHistory.current.length > 0) {
          if (historyIndex.current === -1) {
            historyIndex.current = commandHistory.current.length - 1;
          } else if (historyIndex.current > 0) {
            historyIndex.current--;
          }
          
          const historyCommand = commandHistory.current[historyIndex.current];
          const clearLength = commandBuffer.current.length;
          term.current.write('\b \b'.repeat(clearLength));
          term.current.write(historyCommand);
          commandBuffer.current = historyCommand;
        }
        break;
        
      case '\u001b[B': // Down arrow - next command
        if (historyIndex.current !== -1) {
          if (historyIndex.current < commandHistory.current.length - 1) {
            historyIndex.current++;
            const historyCommand = commandHistory.current[historyIndex.current];
            const clearLength = commandBuffer.current.length;
            term.current.write('\b \b'.repeat(clearLength));
            term.current.write(historyCommand);
            commandBuffer.current = historyCommand;
          } else {
            historyIndex.current = -1;
            const clearLength = commandBuffer.current.length;
            term.current.write('\b \b'.repeat(clearLength));
            commandBuffer.current = "";
          }
        }
        break;
        
      case '\u001b[C': // Right arrow
      case '\u001b[D': // Left arrow
        // TODO: Implement cursor movement within line
        break;
        
      case '\t': // Tab
        term.current.write('  ');
        commandBuffer.current += '  ';
        break;
        
      default:
        // Regular character input
        if (data >= ' ' || data === '\t') {
          commandBuffer.current += data;
          term.current.write(data);
        }
        break;
    }
  }, [executeCommand, writePrompt]);

  // Expose methods through ref
  useImperativeHandle(ref, () => ({
    writeToTerminal: (data: string) => {
      if (term.current) {
        term.current.write(data);
      }
    },
    clearTerminal: () => {
      if (term.current) {
        term.current.clear();
        writePrompt();
      }
    },
    focusTerminal: () => {
      if (term.current) {
        term.current.focus();
      }
    },
    getWorkingDirectory: () => {
      return workingDirectory.current;
    },
    runCommand: async (command: string) => {
      await executeCommand(command);
    },
  }));

  const initializeTerminal = useCallback(() => {
    if (!terminalRef.current || term.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"Fira Code", "JetBrains Mono", "Consolas", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: terminalThemes[theme],
      allowTransparency: false,
      convertEol: true,
      scrollback: 10000,
      tabStopWidth: 4,
      allowProposedApi: true,
    });

    const fitAddonInstance = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddonInstance = new SearchAddon();

    terminal.loadAddon(fitAddonInstance);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddonInstance);

    terminal.open(terminalRef.current);
    
    fitAddon.current = fitAddonInstance;
    searchAddon.current = searchAddonInstance;
    term.current = terminal;

    terminal.onData(handleTerminalInput);

    terminal.onResize(({ cols, rows }) => {
      console.log(`📐 Terminal resized to ${cols}x${rows}`);
      if (shellProcess.current?.resize) {
        try {
          shellProcess.current.resize({ cols, rows });
        } catch (error) {
          console.warn("Could not resize shell PTY:", error);
        }
      }
    });

    setTimeout(() => {
      fitAddonInstance.fit();
    }, 100);

    // Welcome message
   
    terminal.writeln("");

    return terminal;
  }, [theme, handleTerminalInput]);

  const clearTerminal = useCallback(() => {
    if (term.current) {
      term.current.clear();
      term.current.writeln("🚀 WebContainer Terminal v2.0");
      writePrompt();
    }
  }, [writePrompt]);

  const copyTerminalContent = useCallback(async () => {
    if (term.current) {
      const content = term.current.getSelection();
      if (content) {
        try {
          await navigator.clipboard.writeText(content);
        } catch (error) {
          console.error("Failed to copy to clipboard:", error);
        }
      }
    }
  }, []);

  const downloadTerminalLog = useCallback(() => {
    if (term.current) {
      const buffer = term.current.buffer.active;
      let content = "";
      
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          content += line.translateToString(true) + "\n";
        }
      }

      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `terminal-log-${new Date().toISOString().slice(0, 19)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  const searchInTerminal = useCallback((term: string) => {
    if (searchAddon.current && term) {
      searchAddon.current.findNext(term);
    }
  }, []);

  // Initialize terminal
  useEffect(() => {
    initializeTerminal();

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddon.current) {
        setTimeout(() => {
          fitAddon.current?.fit();
        }, 100);
      }
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (shellProcess.current) {
        shellProcess.current.kill();
      }
      if (shellWriter.current) {
        shellWriter.current.releaseLock();
      }
      if (term.current) {
        term.current.dispose();
        term.current = null;
      }
    };
  }, [initializeTerminal]);

  // 🔥 CRITICAL: Initialize shell when WebContainer is ready
  useEffect(() => {
    if (webContainerInstance && term.current && !shellProcess.current) {
      setTimeout(() => {
        initializeShell();
      }, 100);
    }
  }, [webContainerInstance, initializeShell]);

  return (
    <div className={cn("flex flex-col h-full bg-background border rounded-lg overflow-hidden", className)}>
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <span className="text-sm font-medium">Terminal</span>
          {isConnected && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-xs text-muted-foreground">Shell Active</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <FolderOpen className="h-3 w-3" />
            <span>{workingDirectory.current}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {showSearch && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  searchInTerminal(e.target.value);
                }}
                className="h-6 w-32 text-xs"
              />
            </div>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSearch(!showSearch)}
            className="h-6 w-6 p-0"
          >
            <Search className="h-3 w-3" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={copyTerminalContent}
            className="h-6 w-6 p-0"
          >
            <Copy className="h-3 w-3" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={downloadTerminalLog}
            className="h-6 w-6 p-0"
          >
            <Download className="h-3 w-3" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={clearTerminal}
            className="h-6 w-6 p-0"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 relative">
        <div 
          ref={terminalRef} 
          className="absolute inset-0 p-2"
          style={{ 
            background: terminalThemes[theme].background,
          }}
        />
      </div>
    </div>
  );
});

TerminalComponent.displayName = "TerminalComponent";

export default TerminalComponent;