import { WebContainer } from "@webcontainer/api";

class WebContainerService {
  private static instance: WebContainer | null = null;
  private static initializationPromise: Promise<WebContainer> | null = null;
  private devServerProcess: any = null;
  private serverUrl: string | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private currentProjectId: string | null = null;
  private sessionId: string | null = null;
  private detectedPort: number | null = null;
  
  // 🔥 NEW: File watcher state
  private fileWatchers: Map<string, AsyncIterator<any>> = new Map();
  private packageJsonContent: string | null = null;
  private packageJsonPollInterval: NodeJS.Timeout | null = null;

  async getInstance(): Promise<WebContainer> {
    if (WebContainerService.instance) {
      return WebContainerService.instance;
    }
    if (WebContainerService.initializationPromise) {
      return WebContainerService.initializationPromise;
    }

    WebContainerService.initializationPromise = WebContainer.boot()
      .then((instance) => {
        WebContainerService.instance = instance;
        this.setupServerListener(instance);
        this.setupFileWatchers(instance); // 🔥 NEW
        
        console.log("✅ WebContainer initialized");
        return instance;
      })
      .catch((error) => {
        console.error("❌ Failed to initialize WebContainer:", error);
        WebContainerService.initializationPromise = null;
        throw error;
      });

    return WebContainerService.initializationPromise;
  }

  private setupServerListener(instance: WebContainer) {
    instance.on("server-ready", (port: number, url: string) => {
      console.log(`🌐 Server ready at ${url} on port ${port}`);
      this.serverUrl = url;
      
      const sessionMatch = url.match(/--(\w+)\./);
      if (sessionMatch) {
        this.sessionId = sessionMatch[1];
        console.log(`📋 Session ID: ${this.sessionId}`);
      }
      
      this.emit("server-ready", { port, url });
    });
  }

  


  // 🔥 NEW: Setup file watchers for critical files
   private setupFileWatchers(instance: WebContainer) {
    console.log("📦 Setting up package.json polling...");
    this.startPackageJsonPolling(instance);
  }


  // 🔥 NEW: Watch a specific file
  private async startPackageJsonPolling(instance: WebContainer) {
    // Read initial content
    try {
      this.packageJsonContent = await instance.fs.readFile('/package.json', 'utf-8');
      console.log("📦 Initial package.json loaded");
    } catch (error) {
      console.warn("package.json not found yet");
    }
    
    // Poll every 2 seconds
    this.packageJsonPollInterval = setInterval(async () => {
      try {
        const currentContent = await instance.fs.readFile('/package.json', 'utf-8');
        
        // Check if content changed
        if (this.packageJsonContent && currentContent !== this.packageJsonContent) {
          console.log("📦 package.json changed - emitting event!");
          
          const oldPkg = JSON.parse(this.packageJsonContent);
          const newPkg = JSON.parse(currentContent);
          
          console.log("Old deps:", Object.keys(oldPkg.dependencies || {}));
          console.log("New deps:", Object.keys(newPkg.dependencies || {}));
          
          // Update stored content
          this.packageJsonContent = currentContent;
          
          // Emit change event
          this.emit("package-json-changed", { content: currentContent });
        } else if (!this.packageJsonContent) {
          // First time reading
          this.packageJsonContent = currentContent;
        }
      } catch (error) {
        // File doesn't exist or can't be read - ignore
      }
    }, 2000); // Check every 2 seconds
    
    console.log("✅ Package.json polling started (checking every 2s)");
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    const listeners = this.listeners.get(event);
    if (!listeners || listeners.size === 0) {
      return;
    }
    
    console.log(`📢 Emitting '${event}' to ${listeners.size} listener(s)`);
    listeners.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in listener for ${event}:`, error);
      }
    });
  }

  getServerUrl(): string | null {
    return this.serverUrl;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getPreviewUrl(): string | null {
    if (!this.serverUrl) return null;
    return `/preview/webcontainer?url=${encodeURIComponent(this.serverUrl)}`;
  }

  async clearProject(): Promise<void> {
    console.log("🧹 Clearing project files...");
    
    this.stopDevServer();
    
    // Stop all file watchers
    this.fileWatchers.clear();
    
    this.serverUrl = null;
    this.sessionId = null;
    this.currentProjectId = null;
    
    const instance = await this.getInstance();
    
    try {
      const files = await instance.fs.readdir("/");
      
      for (const file of files) {
        if (file === "tmp" || file === ".webcontainer" || file === "node_modules"){
          console.log(`Preserving: /${file}`);
          continue; 
        }
        
        try {
          await instance.fs.rm(`/${file}`, { recursive: true, force: true });
          console.log(`🗑️ Removed: /${file}`);
        } catch (error) {
          console.warn(`Failed to remove ${file}:`, error);
        }
      }
      
      console.log("✅ Project completely cleared (except node_modules and internal dirs)");
    } catch (error) {
      console.error("❌ Failed to clear project:", error);
    }
  }

  async setCurrentProject(projectId: string): Promise<void> {
    if (this.currentProjectId && this.currentProjectId !== projectId) {
      console.log(`🔄 Switching projects: ${this.currentProjectId} → ${projectId}`);
      await this.clearProject();
    }
    this.currentProjectId = projectId;
    
    // Restart file watchers for new project
    const instance = await this.getInstance();
    this.setupFileWatchers(instance);
  }

  getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  async writeFile(path: string, content: string): Promise<void> {
    console.log(`💾 writeFile called for: ${path} (content length: ${content.length})`);
    try {
      const instance = await this.getInstance();
      const pathParts = path.split("/").filter(Boolean);
      const folderPath = pathParts.slice(0, -1).join("/");
      
      if (folderPath) {
        const fullFolderPath = `/${folderPath}`;
        console.log(`📁 Creating directory: ${fullFolderPath}`);
        await instance.fs.mkdir(fullFolderPath, { recursive: true });
      }
      
      const fullPath = `/${path.replace(/^\/+/, "")}`;
      console.log(`✍️ Writing file: ${fullPath}`);
      await instance.fs.writeFile(fullPath, content);
      console.log(`✅ Successfully wrote ${fullPath} to WebContainer filesystem`);
      
      // 🔥 NEW: Emit write event for terminal/UI sync
      this.emit("file-written", { path: fullPath, content });
    } catch (error) {
      console.error(`❌ Error writing file ${path}:`, error);
      throw error;
    }
  }

  async readFile(path: string): Promise<string> {
    const instance = await this.getInstance();
    const fullPath = `/${path.replace(/^\/+/, "")}`;
    return await instance.fs.readFile(fullPath, "utf-8");
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const instance = await this.getInstance();
      const fullPath = `/${path.replace(/^\/+/, "")}`;
      await instance.fs.readFile(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
 * 🔥 NEW: Patch Next.js to fix Ctrl+C handling in WebContainer
 */
  async patchNextJsForWebContainer(): Promise<void> {
    try {
      const instance = await this.getInstance();
      
      // Check if Next.js is installed
      const hasNext = await this.fileExists('node_modules/next/dist/server/lib/start-server.js');
      if (!hasNext) {
        console.log('ℹ️ Next.js not found, skipping patch');
        return;
      }

      console.log('🔧 Patching Next.js for WebContainer Ctrl+C handling...');
      
      // Read the start-server.js file
      const filePath = 'node_modules/next/dist/server/lib/start-server.js';
      let content = await instance.fs.readFile(filePath, 'utf-8');
      
      // Replace process.exit('SIGINT') with process.exit(130)
      // 130 is the standard exit code for SIGINT (128 + 2)
      const patched = content.replace(
        /process\.exit\(['"]SIGINT['"]\)/g,
        'process.exit(130)'
      );
      
      if (patched !== content) {
        await instance.fs.writeFile(filePath, patched);
        console.log('✅ Next.js patched successfully for WebContainer');
      } else {
        console.log('ℹ️ Next.js already patched or pattern not found');
      }
    } catch (error) {
      console.warn('⚠️ Could not patch Next.js:', error);
      // Non-critical, continue anyway
    }
  }

  /**
   * 🔥 ENHANCED: Detect correct start command with better version detection
   */
  async detectStartCommand(): Promise<{ command: string; args: string[] }> {
    try {
      const packageJson = await this.readFile("package.json");
      const pkg = JSON.parse(packageJson);
      const scripts = pkg.scripts || {};
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      console.log("📜 Available scripts:", Object.keys(scripts));

      // Special handling for Next.js
      if (deps.next) {
        const nextVersionStr = deps.next;
        const majorVersion = parseInt(nextVersionStr.match(/\d+/)?.[0] || "13");
        
        console.log(`📦 Next.js detected: ${nextVersionStr} (major: ${majorVersion})`);

        let devScript = scripts.dev || "next dev";
        const hasWebpackFlag = devScript.includes("--webpack");
        const hasExperimentalWebpack = devScript.includes("--experimental-webpack");

        if (scripts.dev && (hasWebpackFlag || hasExperimentalWebpack)) {
          console.log(`✅ Using existing dev script: ${scripts.dev}`);
          return { command: "npm", args: ["run", "dev"] };
        }

        // Use plain next dev for all versions (13-16+)
        console.log("✅ Using plain 'next dev' (recommended for all versions)");
        return { command: "npm", args: ["run", "dev"] };
      }

      // Priority order for other frameworks
      if (scripts.dev) {
        console.log("✅ Using 'dev' script");
        return { command: "npm", args: ["run", "dev"] };
      }
      
      if (scripts.start) {
        console.log("✅ Using 'start' script");
        return { command: "npm", args: ["start"] };
      }
      
      if (scripts.serve) {
        console.log("✅ Using 'serve' script");
        return { command: "npm", args: ["run", "serve"] };
      }

      console.warn("⚠️ No dev/start/serve script found, defaulting to 'npm start'");
      return { command: "npm", args: ["start"] };
    } catch (error) {
      console.error("❌ Failed to read package.json:", error);
      return { command: "npm", args: ["run", "dev"] };
    }
  }

  /**
   * 🔥 NEW: Error handler for server failures
   */
  handleServerError(callback: (data: { code: number }) => void) {
    this.on("server-error", callback);
  }

  /**
   * 🔥 ENHANCED: Verify binaries with better detection
   */
  async verifyBinaries(): Promise<boolean> {
    try {
      const instance = await this.getInstance();
      
      try {
        const binFiles = await instance.fs.readdir('/node_modules/.bin');
        console.log(`📂 .bin directory has ${binFiles.length} files`);
        
        if (binFiles.length === 0) {
          console.warn('⚠️ .bin directory is empty');
          return false;
        }
        
        return true;
      } catch (error) {
        console.error('❌ .bin directory not found');
        return false;
      }
    } catch (error) {
      console.error('❌ Error verifying binaries:', error);
      return false;
    }
  }

  /**
   * 🔥 ENHANCED: Install with output streaming to terminal
   */
  async installDependencies(onOutput?: (data: string) => void): Promise<number> {
    const instance = await this.getInstance();
    
    console.log("📦 Installing dependencies...");
    onOutput?.("📦 Installing dependencies...\r\n");
    onOutput?.("This may take a few minutes...\r\n\r\n");
    
    const installProcess = await instance.spawn("npm", ["install"]);

    if (onOutput) {
      installProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            onOutput(data);
          },
        })
      );
    }

    const exitCode = await installProcess.exit;
    
    if (exitCode !== 0) {
      console.error(`❌ npm install failed with code ${exitCode}`);
      onOutput?.(`\r\n❌ npm install failed with exit code ${exitCode}\r\n`);
      return exitCode;
    }
    
    console.log("✅ npm install completed");
    onOutput?.("\r\n✅ npm install completed successfully\r\n");
    
    // 🔥 FIX: Read updated package.json and package-lock.json and emit change event
    try {
      const packageJsonContent = await instance.fs.readFile('/package.json', 'utf-8');
      console.log("📦 Emitting package.json change event after install");
      
      // Trigger file change detection to sync UI
      this.emit("package-json-changed", { 
        content: packageJsonContent,
        isAfterInstall: true
      });
      
      // Also try to read package-lock.json to confirm install
      try {
        const lockContent = await instance.fs.readFile('/package-lock.json', 'utf-8');
        console.log("🔒 package-lock.json updated");
      } catch (e) {
        console.warn("package-lock.json not found");
      }
    } catch (error) {
      console.error("Failed to read package.json after install:", error);
    }
    
    // 🔥 FIX: Verify and fix .bin directory
    const binariesOk = await this.verifyBinaries();
    
    if (!binariesOk) {
      console.log("🔧 Running npm rebuild to fix .bin symlinks...");
      onOutput?.("🔧 Running npm rebuild...\r\n");
      
      const rebuildProcess = await instance.spawn("npm", ["rebuild"]);
      
      if (onOutput) {
        rebuildProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              onOutput(data);
            },
          })
        );
      }
      
      const rebuildExit = await rebuildProcess.exit;
      
      if (rebuildExit === 0) {
        console.log("✅ npm rebuild completed");
        onOutput?.("✅ npm rebuild completed\r\n");
        
        const binariesOkAfterRebuild = await this.verifyBinaries();
        if (!binariesOkAfterRebuild) {
          console.error("❌ .bin directory still not set up correctly after rebuild");
        }
      } else {
        console.error(`❌ npm rebuild failed with code ${rebuildExit}`);
        onOutput?.(`❌ npm rebuild failed with exit code ${rebuildExit}\r\n`);
      }
    }
    
    return exitCode;
  }

  /**
   * 🔥 ENHANCED: Start dev server with proper output streaming
   */
  async startDevServer(
    command?: string,
    args?: string[],
    onOutput?: (data: string) => void
  ): Promise<void> {
    if (this.devServerProcess) {
      console.log("⚠️ Dev server already running");
      onOutput?.("⚠️ Dev server already running\r\n");
      return;
    }

    const instance = await this.getInstance();
    let finalCommand = command;
    let finalArgs = args;
    
    if (!command || !args) {
      const detected = await this.detectStartCommand();
      finalCommand = detected.command;
      finalArgs = detected.args;
    }
    
    console.log(`🚀 Starting server: ${finalCommand} ${finalArgs!.join(" ")}`);
    onOutput?.(`🚀 Starting server: ${finalCommand} ${finalArgs!.join(" ")}\r\n\r\n`);
    
    const outputStream = new WritableStream({
      write: (data) => {
        console.log("📝 Server output:", data);
        this.detectServerUrlFromOutput(data);
        if (onOutput) onOutput(data);
      },
    });

    try {
      this.devServerProcess = await instance.spawn(finalCommand!, finalArgs!);
      this.devServerProcess.output.pipeTo(outputStream);

      this.devServerProcess.exit.then((code: number) => {
        console.log(`Dev server exited with code ${code}`);
        this.devServerProcess = null;
        this.emit("server-stopped", { code });
        
        if (code !== 0 && code !== 143) {
          console.error("❌ Server failed to start");
          onOutput?.(`\r\n❌ Server exited with code ${code}\r\n`);
          this.emit("server-error", { code });
        }
      });
    } catch (error) {
      console.error("❌ Failed to spawn dev server:", error);
      onOutput?.(`❌ Failed to start server: ${error}\r\n`);
      this.devServerProcess = null;
      this.emit("server-error", { code: -1 });
      throw error;
    }
  }

  private detectServerUrlFromOutput(output: string): void {
    if (this.serverUrl) return;

     const patterns = [
    /(https?:\/\/[a-z0-9-]+\.webcontainer\.io)/i,
    /(https?:\/\/[a-z0-9-]+--\d+--[a-z0-9]+\.local-corp\.webcontainer-api\.io)/i,
    /Server ready at:?\s+(https?:\/\/[^\s]+webcontainer[^\s]+)/i,
  ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match && match[1]) {
        const url = match[1].trim();
        console.log(`🔍 Detected server URL from output: ${url}`);
        this.serverUrl = url;
        
        const portMatch = url.match(/:(\d+)/);
        const port = portMatch ? parseInt(portMatch[1]) : 3000;
        
        const sessionMatch = url.match(/--(\w+)\./);
        if (sessionMatch) {
          this.sessionId = sessionMatch[1];
        }
        
        this.emit("server-ready", { port, url });
        break;
      }
    }
  }

  async restartDevServer(onOutput?: (data: string) => void): Promise<void> {
    console.log("🔄 Restarting dev server...");
    onOutput?.("🔄 Restarting dev server...\r\n");

    if (this.devServerProcess) {
      this.devServerProcess.kill();
      this.devServerProcess = null;
      this.serverUrl = null;
      this.sessionId = null;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.startDevServer(undefined, undefined, onOutput);
  }

  stopDevServer(): void {
    if (this.devServerProcess) {
      console.log("🛑 Stopping dev server...");
      this.emit("server-stopped", {});
      this.devServerProcess.kill();
      this.devServerProcess = null;
      this.serverUrl = null;
      this.sessionId = null;
    }
  }

  async directoryExists(path: string): Promise<boolean> {
    try {
      const instance = await this.getInstance();
      const fullPath = `/${path.replace(/^\/+/, "")}`;
      await instance.fs.readdir(fullPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  isServerRunning(): boolean {
    return this.devServerProcess !== null;
  }

  destroy(): void {
    console.log("🗑️ Destroying WebContainer instance");
    this.stopDevServer();
    
    // Stop all file watchers
    this.fileWatchers.clear();
    
    if (WebContainerService.instance) {
      WebContainerService.instance.teardown();
      WebContainerService.instance = null;
      WebContainerService.initializationPromise = null;
    }
    this.currentProjectId = null;
    this.sessionId = null;
  }
}

export const webContainerService = new WebContainerService();