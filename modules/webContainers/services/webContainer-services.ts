import { WebContainer } from "@webcontainer/api";

class WebContainerService {
  private static instance: WebContainer | null = null;
  private static initializationPromise: Promise<WebContainer> | null = null;
  private devServerProcess: any = null;
  private serverUrl: string | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private currentProjectId: string | null = null;
  private sessionId: string | null = null;

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
   * 🔥 FIX: Detect the correct executable based on installed packages
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

      // Determine the correct dev script based on version
      let devScript = scripts.dev || "next dev";

      // Parse the current script to see if it already has flags
      const hasWebpackFlag = devScript.includes("--webpack");
      const hasExperimentalWebpack = devScript.includes("--experimental-webpack");

      // If package.json already has the correct setup, use it as-is
      if (scripts.dev && (hasWebpackFlag || hasExperimentalWebpack)) {
        console.log(`✅ Using existing dev script: ${scripts.dev}`);
        return { command: "npm", args: ["run", "dev"] };
      }

      // Otherwise, construct the appropriate command
      if (majorVersion >= 16) {
        console.log("✅ Using 'next dev --webpack' for Next.js 16+");
        return { command: "npm", args: ["run", "dev"] };
      } else if (majorVersion === 15) {
        console.log("✅ Using 'next dev --experimental-webpack' for Next.js 15");
        return { command: "npm", args: ["run", "dev"] };
      } else {
        console.log("✅ Using plain 'next dev' for Next.js 13-14");
        return { command: "npm", args: ["run", "dev"] };
      }
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
handleServerError(callback: (data: { code: number }) => void) {
  this.on("server-error", callback);
}


  /**
   * 🔥 NEW: Verify that critical binaries exist after npm install
   */
  async verifyBinaries(): Promise<boolean> {
    try {
      const instance = await this.getInstance();
      
      // Check if .bin directory exists
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
   * 🔥 FIXED: Install dependencies with proper .bin setup
   */
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

    const exitCode = await installProcess.exit;
    
    if (exitCode !== 0) {
      console.error(`❌ npm install failed with code ${exitCode}`);
      return exitCode;
    }
    
    console.log("✅ npm install completed");
    
    // 🔥 FIX: Verify and fix .bin directory
    const binariesOk = await this.verifyBinaries();
    
    if (!binariesOk) {
      console.log("🔧 Running npm rebuild to fix .bin symlinks...");
      
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
        
        // Verify again
        const binariesOkAfterRebuild = await this.verifyBinaries();
        if (!binariesOkAfterRebuild) {
          console.error("❌ .bin directory still not set up correctly after rebuild");
        }
      } else {
        console.error(`❌ npm rebuild failed with code ${rebuildExit}`);
      }
    }
    
    return exitCode;
  }

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
  
  if (!command || !args) {
    const detected = await this.detectStartCommand();
    finalCommand = detected.command;
    finalArgs = detected.args;
  }
  
  console.log(`🚀 Starting server: ${finalCommand} ${finalArgs!.join(" ")}`);
  
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
      
      if (code !== 0 && code !== 143) { // 143 is SIGTERM (normal shutdown)
        console.error("❌ Server failed to start");
        this.emit("server-error", { code });
      }
    });
  } catch (error) {
    console.error("❌ Failed to spawn dev server:", error);
    this.devServerProcess = null;
    this.emit("server-error", { code: -1 });
    throw error;
  }
}

  private detectServerUrlFromOutput(output: string): void {
    if (this.serverUrl) return;

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
      this.devServerProcess.kill();
      this.devServerProcess = null;
      this.serverUrl = null;
      this.sessionId = null;
    }
  }

  async directoryExists(path: string): Promise<boolean> {
    try {
      const instance = await this.getInstance();
      await instance.fs.readdir(path);
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