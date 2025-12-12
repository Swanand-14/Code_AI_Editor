import { WebContainer } from "@webcontainer/api";

class WebContainerService {
  private static instance: WebContainer | null = null;
  private static initializationPromise: Promise<WebContainer> | null = null;
  private devServerProcess: any = null;
  private serverUrl: string | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private currentProjectId: string | null = null;
  private sessionId: string | null = null; // 🔥 FIX: Track session ID

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
      
      // 🔥 FIX: Extract session ID from WebContainer URL
      const sessionMatch = url.match(/--(\w+)\./);
      if (sessionMatch) {
        this.sessionId = sessionMatch[1];
        console.log(`📋 Session ID: ${this.sessionId}`);
      }
      
      this.emit("server-ready", { port, url });
    });
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
      console.warn(`⚠️ No listeners for event: ${event}`);
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

  // 🔥 NEW: Get session ID for new tab feature
  getSessionId(): string | null {
    return this.sessionId;
  }

  // 🔥 NEW: Get full preview URL for opening in new tab
  getPreviewUrl(): string | null {
    if (!this.serverUrl) return null;
    return `/preview/webcontainer?url=${encodeURIComponent(this.serverUrl)}`;
  }

  /**
   * 🔥 FIX: Properly clear project and wait for completion
   */
  async clearProject(): Promise<void> {
    console.log("🧹 Clearing project files...");
    
    // Stop server first
    this.stopDevServer();
    
    // Clear URLs and IDs
    this.serverUrl = null;
    this.sessionId = null;
    this.currentProjectId = null;
    
    const instance = await this.getInstance();
    
    try {
      const files = await instance.fs.readdir("/");
      
      for (const file of files) {
        // Skip WebContainer internal directories
        if (file === "tmp" || file === ".webcontainer") continue;
        
        try {
          await instance.fs.rm(`/${file}`, { recursive: true, force: true });
          console.log(`🗑️ Removed: /${file}`);
        } catch (error) {
          console.warn(`Failed to remove ${file}:`, error);
        }
      }
      
      console.log("✅ Project completely cleared");
    } catch (error) {
      console.error("❌ Failed to clear project:", error);
    }
  }

  /**
   * 🔥 FIX: Await cleanup when switching projects
   */
  async setCurrentProject(projectId: string): Promise<void> {
    if (this.currentProjectId && this.currentProjectId !== projectId) {
      console.log(`🔄 Switching projects: ${this.currentProjectId} → ${projectId}`);
      // 🔥 CRITICAL: Wait for cleanup to complete
      await this.clearProject();
    }
    this.currentProjectId = projectId;
  }

  getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  async writeFile(path: string, content: string): Promise<void> {
    console.log(`💾 writeFile called for: ${path} (content length: ${content.length})`);
    try {
      const instance = await this.getInstance();
      const pathParts = path.split("/");
      const folderPath = pathParts.slice(0, -1).join("/");
      
      if (folderPath) {
        console.log(`📁 Creating directory: ${folderPath}`);
        await instance.fs.mkdir(folderPath, { recursive: true });
      }
      
      console.log(`✍️ Writing file: ${path}`);
      await instance.fs.writeFile(path, content);
      console.log(`✅ Successfully wrote ${path} to WebContainer filesystem`);
    } catch (error) {
      console.error(`❌ Error writing file ${path}:`, error);
      throw error;
    }
  }

  async readFile(path: string): Promise<string> {
    const instance = await this.getInstance();
    return await instance.fs.readFile(path, "utf-8");
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const instance = await this.getInstance();
      await instance.fs.readFile(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 🔥 FIX: Better script detection with proper 'start' handling
   */
  async detectStartCommand(): Promise<{ command: string; args: string[] }> {
    try {
      const packageJson = await this.readFile("package.json");
      const pkg = JSON.parse(packageJson);
      const scripts = pkg.scripts || {};

      console.log("📜 Available scripts:", Object.keys(scripts));

      // Priority order for start commands
      if (scripts.dev) {
        console.log("✅ Using 'dev' script");
        return { command: "npm", args: ["run", "dev"] };
      }
      
      if (scripts.start) {
        console.log("✅ Using 'start' script");
        // 🔥 FIX: Use 'npm start' (not 'npm run start')
        return { command: "npm", args: ["start"] };
      }
      
      if (scripts.serve) {
        console.log("✅ Using 'serve' script");
        return { command: "npm", args: ["run", "serve"] };
      }

      // Fallback
      console.warn("⚠️ No dev/start/serve script found, defaulting to 'npm start'");
      return { command: "npm", args: ["start"] };
    } catch (error) {
      console.error("❌ Failed to read package.json:", error);
      // Safe fallback
      return { command: "npm", args: ["run", "dev"] };
    }
  }

  /**
   * 🔥 FIX: Improved server start with URL detection from output
   */
  async startDevServer(
    command?: string,
    args?: string[],
    onOutput?: (data: string) => void
  ): Promise<void> {
    if (this.devServerProcess) {
      console.log("⚠️ Dev server already running");
      return;
    }

    const instance = await this.getInstance();
    let finalCommand = command;
    let finalArgs = args;
    
    // 🔥 FIX: Auto-detect if not provided
    if (!command || !args) {
      const detected = await this.detectStartCommand();
      finalCommand = detected.command;
      finalArgs = detected.args;
    }
    
    console.log(`🚀 Starting server: ${finalCommand} ${finalArgs!.join(" ")}`);
    
    // 🔥 FIX: Monitor output for server URL patterns
    const outputStream = new WritableStream({
      write: (data) => {
        console.log("📝 Server output:", data);
        
        // Try to detect URL from output
        this.detectServerUrlFromOutput(data);
        
        if (onOutput) onOutput(data);
      },
    });

    this.devServerProcess = await instance.spawn(finalCommand!, finalArgs!);
    this.devServerProcess.output.pipeTo(outputStream);

    // Handle exit
    this.devServerProcess.exit.then((code: number) => {
      console.log(`Dev server exited with code ${code}`);
      this.devServerProcess = null;
      
      if (code !== 0) {
        console.error("❌ Server failed to start");
        this.emit("server-error", { code });
      }
    });
  }

  /**
   * 🔥 NEW: Detect server URL from console output as fallback
   */
  private detectServerUrlFromOutput(output: string): void {
    if (this.serverUrl) return; // Already have URL

    // Common patterns in server output
    const patterns = [
      /Local:?\s+(https?:\/\/[^\s]+)/i,
      /listening on (https?:\/\/[^\s]+)/i,
      /server running at (https?:\/\/[^\s]+)/i,
      /available at (https?:\/\/[^\s]+)/i,
      /(https?:\/\/localhost:\d+)/i,
      /(https?:\/\/127\.0\.0\.1:\d+)/i,
      /(https?:\/\/[a-z0-9-]+\.webcontainer\.io)/i,
      /ready on (https?:\/\/[^\s]+)/i,
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match && match[1]) {
        const url = match[1].trim();
        console.log(`🔍 Detected server URL from output: ${url}`);
        this.serverUrl = url;
        
        // Extract port
        const portMatch = url.match(/:(\d+)/);
        const port = portMatch ? parseInt(portMatch[1]) : 3000;
        
        // Extract session ID
        const sessionMatch = url.match(/--(\w+)\./);
        if (sessionMatch) {
          this.sessionId = sessionMatch[1];
        }
        
        this.emit("server-ready", { port, url });
        break;
      }
    }
  }

  /**
   * 🔥 FIX: Restart with auto-detected command
   */
  async restartDevServer(onOutput?: (data: string) => void): Promise<void> {
    console.log("🔄 Restarting dev server...");

    if (this.devServerProcess) {
      this.devServerProcess.kill();
      this.devServerProcess = null;
      this.serverUrl = null;
      this.sessionId = null;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 🔥 FIX: Auto-detect on restart (don't hardcode)
    await this.startDevServer(undefined, undefined, onOutput);
  }

  stopDevServer(): void {
    if (this.devServerProcess) {
      console.log("🛑 Stopping dev server...");
      this.devServerProcess.kill();
      this.devServerProcess = null;
      this.serverUrl = null;
      this.sessionId = null;
    }
  }

  async installDependencies(onOutput?: (data: string) => void): Promise<number> {
    const instance = await this.getInstance();
    
    console.log("📦 Installing dependencies...");
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

    return await installProcess.exit;
  }

  isServerRunning(): boolean {
    return this.devServerProcess !== null;
  }

  destroy(): void {
    console.log("🗑️ Destroying WebContainer instance");
    this.stopDevServer();
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