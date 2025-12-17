"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { webContainerService } from "../services/webContainer-services";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import { transformToWebContainerFormat } from "./transformer";
import * as pako from 'pako';
import untar from 'js-untar';

interface UseWebContainerProps {
  templateData: TemplateFolder | null;
  autoStart?: boolean;
  projectId?: string;
  terminalRef?: React.RefObject<any>;
}

interface UseWebContainerReturn {
  serverUrl: string | null;
  isLoading: boolean;
  error: string | null;
  instance: any | null;
  isServerRunning: boolean;
  writeFileSync: (path: string, content: string) => Promise<void>;
  startServer: () => Promise<void>;
  restartServer: () => Promise<void>;
  stopServer: () => void;
}

const BASE_TEMPLATES: Record<string, string> = {
  "nextjs-13-tailwind": "https://3muhlv9g2rrmsaat.public.blob.vercel-storage.com/nextjs-13-tailwind-v2.tar.gz",
};

export const useWebContainer = ({
  templateData,
  autoStart = true,
  projectId,terminalRef
}: UseWebContainerProps): UseWebContainerReturn => {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<any | null>(null);
  const [isServerRunning, setIsServerRunning] = useState(false);
  
  const hasInitialized = useRef(false);
  const currentProjectRef = useRef<string | null>(null);
  const CACHE_KEY_PREFIX = 'wc-deps-';
  const writeToTerminal = useCallback((data:string)=>{
    if(terminalRef?.current?.writeToTerminal){
      terminalRef.current.writeToTerminal(data);
    }
  },[terminalRef])

  // Initialize WebContainer instance (once)
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        writeToTerminal("🔄 Initializing WebContainer...\r\n");
        const wc = await webContainerService.getInstance();
        if (mounted) {
          setInstance(wc);
          setIsLoading(false);
          writeToTerminal("✅ WebContainer initialized\r\n");
        }
      } catch (err) {
        console.error("Failed to initialize WebContainer:", err);
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to initialize");
          setIsLoading(false);
          writeToTerminal(`❌ Failed to initialize: ${err instanceof Error ? err.message : "Unknown error"}\r\n`);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, [writeToTerminal]);

  // Setup server listener (once only)
  useEffect(() => {
    const handleServerReady = ({ url }: { port: number; url: string }) => {
      console.log("🎯 Server ready:", url);
      setServerUrl(url);
      setIsServerRunning(true);
    };

    webContainerService.on("server-ready", handleServerReady);

    return () => {
      webContainerService.off("server-ready", handleServerReady);
    };
  }, []);

  const detectTemplateType = useCallback((packageJsonContent: string): string | null => {
    try {
      const pkg = JSON.parse(packageJsonContent);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      const nextVersion = deps['next'];
      const hasTailwind = deps['tailwindcss'];

      if (nextVersion && hasTailwind) {
        const versionMatch = nextVersion.match(/(\^|~)?(\d+)/);
        if (versionMatch && versionMatch[2] === '13') {
          console.log('✅ Detected Next.js 13 + Tailwind');
          return 'nextjs-13-tailwind';
        }
      }

      console.log('ℹ️ No matching base template found');
      return null;
    } catch (error) {
      console.error('Error detecting template type:', error);
      return null;
    }
  }, []);

  const installFromTarball = useCallback(async (
    instance: any,
    tarballUrl: string
  ): Promise<boolean> => {
    try {
      console.log("📥 Downloading base template from Vercel Blob...");
      
      const response = await fetch(tarballUrl);
      
      if (!response.ok) throw new Error('Failed to download tarball');
      
      const arrayBuffer = await response.arrayBuffer();
      const gzippedData = new Uint8Array(arrayBuffer);
      
      console.log(`📦 Downloaded ${(gzippedData.length / 1024 / 1024).toFixed(2)} MB`);
      
      console.log("🔓 Decompressing gzip...");
      const tarData = pako.inflate(gzippedData);
      console.log(`📂 Decompressed to ${(tarData.length / 1024 / 1024).toFixed(2)} MB`);
      
      console.log("📜 Extracting tar archive with js-untar...");
      const extractedFiles = await untar(tarData.buffer);
      
      console.log(`📂 Found ${extractedFiles.length} files`);
      
      const dirsToCreate = new Set<string>();
      const filesToWrite: Array<{ path: string; data: Uint8Array }> = [];
      
      for (const file of extractedFiles) {
        let cleanPath = file.name
          .replace(/^\.\//, '')
          .replace(/^node_modules\//, '')
          .replace(/\/$/, '');
        
        if (!cleanPath) continue;
        
        const fullPath = `/node_modules/${cleanPath}`;
        
        const pathParts = fullPath.split('/');
        for (let i = 1; i < pathParts.length - 1; i++) {
          dirsToCreate.add(pathParts.slice(0, i + 1).join('/'));
        }
        
        if (file.type === '0' || file.type === '\0') {
          filesToWrite.push({
            path: fullPath,
            data: new Uint8Array(file.buffer)
          });
        }
      }
      
      console.log(`📂 Creating ${dirsToCreate.size} directories...`);
      
      const sortedDirs = Array.from(dirsToCreate).sort((a, b) => a.length - b.length);
      for (const dir of sortedDirs) {
        try {
          await instance.fs.mkdir(dir, { recursive: true });
        } catch (e) {
          // Directory might exist
        }
      }
      
      console.log("✅ Directory structure created");
      console.log(`📝 Writing ${filesToWrite.length} files...`);
      
      let fileCount = 0;
      for (const { path, data } of filesToWrite) {
        try {
          await instance.fs.writeFile(path, data);
          
          if (path.includes('/.bin/')) {
            try {
              await instance.fs.chmod(path, 0o755);
            } catch (e) {
              // chmod might not be supported
            }
          }
          
          fileCount++;
          
          if (fileCount % 1000 === 0) {
            console.log(`📝 Wrote ${fileCount}/${filesToWrite.length} files...`);
          }
        } catch (e) {
          if (fileCount < 10) {
            console.warn(`Failed to write ${path}:`, e);
          }
        }
      }
      
      console.log(`✅ Extracted ${fileCount} files from tarball`);
      
      console.log("🔍 Verifying critical files...");
      const criticalFiles = [
        '/node_modules/next/package.json',
        '/node_modules/next/dist/client/components/react-dev-overlay/internal/components/LeftRightDialogHeader/index.js'
      ];
      
      for (const file of criticalFiles) {
        try {
          await instance.fs.readFile(file, 'utf-8');
          console.log(`✅ Found: ${file}`);
        } catch (e) {
          console.error(`❌ Missing critical file: ${file}`);
          return false;
        }
      }
      
      try {
        const binFiles = await instance.fs.readdir('/node_modules/.bin');
        console.log(`📂 .bin directory: ${binFiles.length} files`);
        
        if (binFiles.length === 0) {
          console.log('🔧 Running npm rebuild...');
          const rebuildProcess = await instance.spawn('npm', ['rebuild']);
          await rebuildProcess.exit;
        }
      } catch (e) {
        console.error('Error with .bin directory:', e);
      }
      
      console.log('🔍 Detecting Next.js version...');
      try {
        const nextPkgJson = await instance.fs.readFile('/node_modules/next/package.json', 'utf-8');
        const nextPkg = JSON.parse(nextPkgJson);
        const actualNextVersion = nextPkg.version;
        const majorVersion = parseInt(actualNextVersion.split('.')[0]);
        
        console.log(`📦 Next.js version: ${actualNextVersion}`);
        
        const userPkgJson = await instance.fs.readFile('/package.json', 'utf-8');
        const userPkg = JSON.parse(userPkgJson);
        
        if (userPkg.scripts?.dev) {
          if (majorVersion >= 16) {
            userPkg.scripts.dev = 'next dev --webpack';
          } else if (majorVersion === 15) {
            userPkg.scripts.dev = 'next dev --experimental-webpack';
          } else {
            userPkg.scripts.dev = 'next dev';
          }
          
          await instance.fs.writeFile('/package.json', JSON.stringify(userPkg, null, 2));
          console.log(`✅ Updated package.json: "${userPkg.scripts.dev}"`);
        }
      } catch (e) {
        console.error('Failed to detect Next.js version:', e);
      }
      
      try {
        await instance.fs.readdir('/node_modules');
        console.log("✅ node_modules verified");
        return true;
      } catch (e) {
        console.error("❌ node_modules not found");
        return false;
      }
      
    } catch (error) {
      console.error("❌ Failed to install from tarball:", error);
      return false;
    }
  }, []);

  const getPackageJsonHash = useCallback((packageJsonContent: string): string => {
    try {
      const pkg = JSON.parse(packageJsonContent);
      const deps = JSON.stringify({
        dependencies: pkg.dependencies || {},
        devDependencies: pkg.devDependencies || {},
      });
      return deps;
    } catch (error) {
      return packageJsonContent;
    }
  }, []);

  const needsDependencyInstall = useCallback(async (
    instance: any,
    projectId: string,
    packageJsonContent: string
  ): Promise<boolean> => {
    try {
      const nodeModulesExists = await webContainerService.directoryExists("node_modules");
      if (!nodeModulesExists) {
        console.log("node_modules not found - need to install");
        return true;
      }
      
      const currentHash = getPackageJsonHash(packageJsonContent);
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
  }, [getPackageJsonHash]);

  // Handle project switching and mounting
  useEffect(() => {
    if (!instance || !templateData || !projectId) return;

    async function setupProject() {
      try {
        // Check if we're switching projects
        if (currentProjectRef.current !== projectId) {
          console.log(`🔄 Project switch detected: ${currentProjectRef.current} → ${projectId}`);
          
          setIsLoading(true);
          setServerUrl(null);
          setIsServerRunning(false);
          
          await webContainerService.setCurrentProject(projectId);
          
          hasInitialized.current = false;
          currentProjectRef.current = projectId;
        }

        // Skip if already initialized for this project
        if (hasInitialized.current && currentProjectRef.current === projectId) {
          console.log("✅ Project already initialized, skipping");
          return;
        }

        console.log(`📁 Mounting project: ${projectId}`);
        hasInitialized.current = true;

        // Mount files
        const files = transformToWebContainerFormat(templateData);
        await instance.mount(files);
        console.log("✅ Files mounted");

        // Find package.json
        let packageJsonContent = "";
        const findPackageJson = (items: any[]): string | null => {
          for (const item of items) {
            if ("folderName" in item && item.items) {
              const found = findPackageJson(item.items);
              if (found) return found;
            } else if (item.filename === "package" && item.fileExtension === "json") {
              return item.content;
            }
          }
          return null;
        };
        
        packageJsonContent = findPackageJson(templateData.items) ?? "";
        
        // 🔥 FIX: Only modify Next.js projects - check if next is actually in dependencies
        if (packageJsonContent) {
          try {
            const pkg = JSON.parse(packageJsonContent);
            const nextVersion = pkg.dependencies?.next || pkg.devDependencies?.next || '';
            
            // Only modify if this is actually a Next.js project
            if (nextVersion && pkg.scripts && pkg.scripts.dev) {
              const majorVersion = parseInt(nextVersion.match(/\d+/)?.[0] || '13');
              
              console.log(`📦 Detected Next.js version: ${nextVersion} (major: ${majorVersion})`);
              
              if (majorVersion >= 15) {
                pkg.scripts.dev = 'next dev --experimental-webpack';
                console.log('🔧 Using --experimental-webpack flag for Next.js 15+');
              } else {
                pkg.scripts.dev = 'next dev';
                console.log('🔧 Using plain "next dev" for Next.js 13-14');
              }
              
              const modifiedPackageJson = JSON.stringify(pkg, null, 2);
              await instance.fs.writeFile('/package.json', modifiedPackageJson);
              console.log(`✅ Updated package.json: "${pkg.scripts.dev}"`);
            } else if (!nextVersion) {
              console.log('ℹ️ Not a Next.js project, preserving original dev script');
            }
          } catch (e) {
            console.warn("Could not modify package.json:", e);
          }
        }
        
        const shouldInstall = await needsDependencyInstall(instance, projectId, packageJsonContent);
        
        if (shouldInstall) {
          const templateType = detectTemplateType(packageJsonContent);
          let installedFromTarball = false;
          
          if (templateType && BASE_TEMPLATES[templateType]) {
            console.log(`Detected base template: ${templateType}`);
            installedFromTarball = await installFromTarball(instance, BASE_TEMPLATES[templateType]);
          }
          
          if (!installedFromTarball) {
            console.log("📦 Installing dependencies via npm...");
            // 🔥 FIX: Now includes automatic npm rebuild
            const exitCode = await webContainerService.installDependencies();
            
            if (exitCode !== 0) {
              throw new Error(`npm install failed with code ${exitCode}`);
            }
          }
          
          const hash = getPackageJsonHash(packageJsonContent);
          localStorage.setItem(`${CACHE_KEY_PREFIX}${projectId}`, hash);
          console.log("✅ Dependencies installed and cached");
        } else {
          console.log("Skipping npm install - using cached dependencies");
        }

        // Auto-start server
        if (autoStart) {
          console.log("🚀 Auto-starting server...");
          await startServer();
        }

        setIsLoading(false);
      } catch (err) {
        console.error("❌ Setup error:", err);
        setError(err instanceof Error ? err.message : "Setup failed");
        setIsLoading(false);
        hasInitialized.current = false;
      }
    }

    setupProject();
  }, [instance, templateData, projectId, autoStart, needsDependencyInstall, getPackageJsonHash, detectTemplateType, installFromTarball]);

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

    try {
      console.log("🎬 Starting dev server...");
      await webContainerService.startDevServer();
      setIsServerRunning(true);
    } catch (err) {
      console.error("Failed to start server:", err);
      setError(err instanceof Error ? err.message : "Failed to start server");
    }
  }, []);

  const restartServer = useCallback(async () => {
    try {
      console.log("🔄 Restarting server...");
      setIsServerRunning(false);
      setServerUrl(null);
      await webContainerService.restartDevServer();
    } catch (err) {
      console.error("Failed to restart server:", err);
      setError(err instanceof Error ? err.message : "Failed to restart server");
    }
  }, []);

  const stopServer = useCallback(() => {
    console.log("🛑 Stopping server...");
    webContainerService.stopDevServer();
    setIsServerRunning(false);
    setServerUrl(null);
  }, []);

  return {
    serverUrl,
    isLoading,
    error,
    instance,
    isServerRunning,
    writeFileSync,
    startServer,
    restartServer,
    stopServer,
  };
};