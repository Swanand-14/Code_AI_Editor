"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { webContainerService } from "../services/webContainer-services";
import { set } from "zod";

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  content?: string;
}

interface UseWebContainerForGithubProps {
  files: GitHubFile[];
  repoFullName: string;
  currentBranch: string;
  terminalRef?: React.RefObject<any>;
  autoStart?: boolean;
}

interface UseWebContainerForGithubReturn {
  serverUrl: string | null;
  isLoading: boolean;
  error: string | null;
  instance: any | null;
  isServerRunning: boolean;
  isSupported: boolean;
  projectType: string | null;
  startServer: () => Promise<void>;
  restartServer: () => Promise<void>;
  stopServer: () => void;
  writeFileSync: (path: string, content: string) => Promise<void>;
  isReady: boolean;
}

interface ProjectDetectionResult {
  isSupported: boolean;
  projectType: string | null;
  packageJson: any | null;
  startCommand: { command: string; args: string[] } | null;
}

export const useWebContainerForGithub = ({
  files,
  repoFullName,
  currentBranch,
  terminalRef,
  autoStart = false,
}: UseWebContainerForGithubProps): UseWebContainerForGithubReturn => {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<any | null>(null);
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [projectType, setProjectType] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const hasInitialized = useRef(false);
  const currentProjectRef = useRef<string | null>(null);
  const CACHE_KEY_PREFIX = "wc-gh-deps-";

  const writeToTerminal = useCallback(
    (data: string) => {
      if (terminalRef?.current?.writeToTerminal) {
        terminalRef.current.writeToTerminal(data);
      }
    },
    [terminalRef]
  );

  // Detect if the project is a supported web project
  const detectProjectType = useCallback(
    (files: GitHubFile[]): ProjectDetectionResult => {
      const packageJsonFile = files.find(
        (f) => f.path === "package.json" && f.content
      );

      if (!packageJsonFile?.content) {
        return {
          isSupported: false,
          projectType: null,
          packageJson: null,
          startCommand: null,
        };
      }

      try {
        const pkg = JSON.parse(packageJsonFile.content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const scripts = pkg.scripts || {};

        // Detect project type
        let detectedType = null;
        let startCommand = null;

        // Next.js
        if (deps.next) {
          detectedType = "Next.js";
          const nextVersion = parseInt(deps.next.match(/\d+/)?.[0] || "13");
          if (nextVersion >= 15) {
            startCommand = { command: "npm", args: ["run", "dev"] };
            // We'll modify package.json later to add --experimental-webpack
          } else {
            startCommand = { command: "npm", args: ["run", "dev"] };
          }
        }
        // React (Vite)
        else if (deps.vite && (deps.react || deps["@vitejs/plugin-react"])) {
          detectedType = "React (Vite)";
          startCommand = { command: "npm", args: ["run", "dev"] };
        }
        // React (CRA)
        else if (deps["react-scripts"]) {
          detectedType = "React (CRA)";
          startCommand = { command: "npm", args: ["start"] };
        }
        // Vue
        else if (deps.vue) {
          detectedType = "Vue.js";
          if (scripts.dev) startCommand = { command: "npm", args: ["run", "dev"] };
          else if (scripts.serve)
            startCommand = { command: "npm", args: ["run", "serve"] };
        }
        // Express/Node
        else if (deps.express || scripts.start || scripts.dev) {
          detectedType = "Node.js";
          if (scripts.dev) startCommand = { command: "npm", args: ["run", "dev"] };
          else if (scripts.start)
            startCommand = { command: "npm", args: ["start"] };
        }
        // Svelte
        else if (deps.svelte) {
          detectedType = "Svelte";
          startCommand = { command: "npm", args: ["run", "dev"] };
        }

        const isSupported = detectedType !== null && startCommand !== null;

        return {
          isSupported,
          projectType: detectedType,
          packageJson: pkg,
          startCommand,
        };
      } catch (e) {
        console.error("Error parsing package.json:", e);
        return {
          isSupported: false,
          projectType: null,
          packageJson: null,
          startCommand: null,
        };
      }
    },
    []
  );

  // Convert GitHub files to WebContainer format
  const convertToWebContainerFormat = useCallback((files: GitHubFile[]) => {
    const result: any = {};

    files.forEach((file) => {
      if (file.type === "file" && file.content !== undefined) {
        const pathParts = file.path.split("/");
        let current = result;

        // Create nested structure
        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = pathParts[i];
          if (!current[part]) {
            current[part] = { directory: {} };
          }
          current = current[part].directory;
        }

        // Add file
        const fileName = pathParts[pathParts.length - 1];
        current[fileName] = {
          file: {
            contents: file.content,
          },
        };
      }
    });

    return result;
  }, []);

  // Check if dependencies need installation
  const needsDependencyInstall = useCallback(
    async (projectId: string, packageJsonContent: string): Promise<boolean> => {
      try {
        const nodeModulesExists = await webContainerService.directoryExists(
          "node_modules"
        );
        if (!nodeModulesExists) {
          console.log("node_modules not found - need to install");
          return true;
        }

        const currentHash = JSON.stringify(JSON.parse(packageJsonContent));
        const cachedHash = localStorage.getItem(`${CACHE_KEY_PREFIX}${projectId}`);

        if (currentHash !== cachedHash) {
          console.log("package.json changed - need to reinstall");
          return true;
        }

        console.log("Dependencies already installed - skipping npm install");
        return false;
      } catch (error) {
        console.log("Error checking dependencies:", error);
        return true;
      }
    },
    []
  );

  // Initialize WebContainer instance
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        writeToTerminal("🔄 Initializing WebContainer...\r\n");
        const wc = await webContainerService.getInstance();
        if (mounted) {
          setInstance(wc);
          writeToTerminal("✅ WebContainer initialized\r\n");
        }
      } catch (err) {
        console.error("Failed to initialize WebContainer:", err);
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to initialize");
          writeToTerminal(
            `❌ Failed to initialize: ${err instanceof Error ? err.message : "Unknown error"}\r\n`
          );
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, [writeToTerminal]);

  // Setup server listener
  useEffect(() => {
    const handleServerReady = ({ url }: { port: number; url: string }) => {
      console.log("🎯 Server ready:", url);
      setServerUrl(url);
      setIsServerRunning(true);
      writeToTerminal(`\r\n✅ Server ready at: ${url}\r\n`);
    };

    const handleServerError = ({ code }: { code: number }) => {
      console.error("❌ Server error with code:", code);
      setIsServerRunning(false);
      setServerUrl(null);
      setError(`Dev server failed to start (exit code: ${code})`);
      writeToTerminal(`\r\n❌ Server failed to start (exit code: ${code})\r\n`);
    };

    webContainerService.on("server-ready", handleServerReady);
    webContainerService.on("server-error", handleServerError);

    return () => {
      webContainerService.off("server-ready", handleServerReady);
      webContainerService.off("server-error", handleServerError);
    };
  }, [writeToTerminal]);

  // Main setup effect - runs when repo/branch changes
  useEffect(() => {
    if (!instance || files.length === 0) return;

    async function setupProject() {
      const projectId = `${repoFullName}:${currentBranch}`;

      // Check if we're switching projects
      if (currentProjectRef.current !== projectId) {
        console.log(
          `🔄 Project/branch switch: ${currentProjectRef.current} → ${projectId}`
        );

        setIsLoading(true);
        setServerUrl(null);
        setIsServerRunning(false);
        setError(null);

        await webContainerService.setCurrentProject(projectId);

        hasInitialized.current = false;
        currentProjectRef.current = projectId;
      }

      // Skip if already initialized
      if (hasInitialized.current && currentProjectRef.current === projectId) {
        console.log("✅ Project already initialized");
        return;
      }

      try {
        writeToTerminal(`\r\n📁 Analyzing repository: ${repoFullName}\r\n`);

        // Detect project type
        const detection = detectProjectType(files);
        setIsSupported(detection.isSupported);
        setProjectType(detection.projectType);

        if (!detection.isSupported) {
          writeToTerminal(
            "⚠️ This repository is not a supported web project\r\n"
          );
          writeToTerminal(
            "Supported: Next.js, React (Vite/CRA), Vue, Node.js, Svelte\r\n"
          );
          setIsLoading(false);
          return;
        }

        writeToTerminal(
          `✅ Detected ${detection.projectType} project\r\n`
        );
        writeToTerminal("📦 Mounting files...\r\n");

        hasInitialized.current = true;

        // Mount files
        const wcFiles = convertToWebContainerFormat(files);
        await instance.mount(wcFiles);
        writeToTerminal("✅ Files mounted\r\n");

        // Modify package.json for Next.js webpack configuration
        if (
          detection.projectType === "Next.js" &&
          detection.packageJson &&
          instance
        ) {
          const pkg = detection.packageJson;
          const nextVersionStr = pkg.dependencies?.next || pkg.devDependencies?.next || "";
          
          writeToTerminal(`📦 Next.js version from package.json: ${nextVersionStr}\r\n`);

          // Try to detect the actual installed version from node_modules
          let actualVersion = 13; // default fallback
          let fullVersion = "";
          try {
            const nextPkgPath = "/node_modules/next/package.json";
            const nodeModulesExists = await webContainerService.fileExists(nextPkgPath);
            
            if (nodeModulesExists) {
              const nextPkgContent = await instance.fs.readFile(nextPkgPath, "utf-8");
              const nextPkg = JSON.parse(nextPkgContent);
              fullVersion = nextPkg.version;
              actualVersion = parseInt(fullVersion.match(/\d+/)?.[0] || "13");
              writeToTerminal(`✅ Detected installed Next.js version: ${fullVersion}\r\n`);
            } else {
              // Parse from package.json
              actualVersion = parseInt(nextVersionStr.match(/\d+/)?.[0] || "13");
              writeToTerminal(`⚠️ Using version from package.json: ${actualVersion}\r\n`);
            }
          } catch (e) {
            actualVersion = parseInt(nextVersionStr.match(/\d+/)?.[0] || "13");
            writeToTerminal(`⚠️ Could not detect installed version, using: ${actualVersion}\r\n`);
          }

          if (pkg.scripts?.dev) {
            const originalScript = pkg.scripts.dev;
            let newScript = originalScript;
            
            // IMPORTANT: Webpack flags in Next.js
            // - Next.js 13-15 stable: Use PLAIN "next dev" (no flags)
            // - Next.js 16+: Will use --webpack (when available)
            // The --experimental-webpack flag was ONLY in 15.0.0-canary and removed in stable
            
            if (actualVersion >= 16) {
              // Future: Next.js 16+ might support --webpack
              newScript = "next dev";
              writeToTerminal("🔧 Configuring for Next.js 16+ (plain next dev for now)\r\n");
            } else {
              // Next.js 13, 14, 15: Always use plain next dev
              newScript = "next dev";
              writeToTerminal(`🔧 Configuring for Next.js ${actualVersion} with plain next dev\r\n`);
            }
            
            // Only update if we need to change the script (remove any webpack flags)
            if (newScript !== originalScript) {
              pkg.scripts.dev = newScript;
              await instance.fs.writeFile(
                "/package.json",
                JSON.stringify(pkg, null, 2)
              );
              writeToTerminal(`✅ Updated package.json: "${pkg.scripts.dev}"\r\n`);
            } else {
              writeToTerminal(`✅ package.json already correct: "${pkg.scripts.dev}"\r\n`);
            }
          }
        }

        // In useWebContainerForGithub.ts, after mounting files:



        // Check if we need to install dependencies
        const packageJsonFile = files.find((f) => f.path === "package.json");
        if (!packageJsonFile?.content) {
          throw new Error("package.json not found");
        }

        const shouldInstall = await needsDependencyInstall(
          projectId,
          packageJsonFile.content
        );

        if (shouldInstall) {
          writeToTerminal("📦 Installing dependencies...\r\n");
          writeToTerminal("This may take a few minutes...\r\n");

          const exitCode = await webContainerService.installDependencies(
            (data) => {
              writeToTerminal(data);
            }
          );

          if (exitCode !== 0) {
            throw new Error(`npm install failed with code ${exitCode}`);
          }

          const hash = JSON.stringify(JSON.parse(packageJsonFile.content));
          localStorage.setItem(`${CACHE_KEY_PREFIX}${projectId}`, hash);
          writeToTerminal("✅ Dependencies installed\r\n");
        } else {
          writeToTerminal("✅ Using cached dependencies\r\n");
        }

        // Auto-start server if enabled
        setIsReady(true);
        console.log("WebContainer ready - waiting for terminal");

        setIsLoading(false);
      } catch (err) {
        console.error("❌ Setup error:", err);
        setError(err instanceof Error ? err.message : "Setup failed");
        writeToTerminal(
          `❌ Setup failed: ${err instanceof Error ? err.message : "Unknown error"}\r\n`
        );
        setIsLoading(false);
        hasInitialized.current = false;
      }
    }

    setupProject();
  }, [
    instance,
    files,
    repoFullName,
    currentBranch,
    autoStart,
    detectProjectType,
    convertToWebContainerFormat,
    needsDependencyInstall,
    writeToTerminal,
  ]);

  const writeFileSync = useCallback(
    async (path: string, content: string): Promise<void> => {
      await webContainerService.writeFile(path, content);
    },
    []
  );

  const startServer = useCallback(async () => {
    if (webContainerService.isServerRunning()) {
      console.log("⚠️ Server already running");
      return;
    }

    if(!terminalRef?.current){
      console.error("Terminal reference is not available.");
      setError("Terminal reference is not available.");
      return;
    }



    try {
      writeToTerminal("🎬 Starting dev server...\r\n");
      const detected = await webContainerService.detectStartCommand();
      const command = `${detected.command} ${detected.args.join(' ')}`;
      console.log(`Exec command: ${command}`);
      await terminalRef.current.runCommand(command);

    } catch (err) {
      console.error("Failed to start server:", err);
      setError(err instanceof Error ? err.message : "Failed to start server");
      writeToTerminal(
        `❌ Failed to start server: ${err instanceof Error ? err.message : "Unknown error"}\r\n`
      );
    }
  }, [writeToTerminal,terminalRef]);

  const restartServer = useCallback(async () => {
    try {
      writeToTerminal("🔄 Restarting server...\r\n");
      setIsServerRunning(false);
      setServerUrl(null);
      await webContainerService.restartDevServer((data) => {
        writeToTerminal(data);
      });
    } catch (err) {
      console.error("Failed to restart server:", err);
      setError(err instanceof Error ? err.message : "Failed to restart server");
      writeToTerminal(
        `❌ Failed to restart server: ${err instanceof Error ? err.message : "Unknown error"}\r\n`
      );
    }
  }, [writeToTerminal]);

  const stopServer = useCallback(() => {
    console.log("🛑 Stopping server...");
    webContainerService.stopDevServer();
    setIsServerRunning(false);
    setServerUrl(null);
    writeToTerminal("🛑 Server stopped\r\n");
  }, [writeToTerminal]);

  return {
    serverUrl,
    isLoading,
    error,
    instance,
    isServerRunning,
    isSupported,
    projectType,
    writeFileSync,
    startServer,
    restartServer,
    stopServer,
    isReady,
  };
};