import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import { webContainerService } from "../services/webContainer-services";
import { WebContainer } from "@webcontainer/api";

// ─── TYPES ────────────

interface MockWebContainerFS {
  writeFile: Mock;
  readFile: Mock;
  mkdir: Mock;
  rm: Mock;
  readdir: Mock;
}

interface MockProcess {
  output: { pipeTo: Mock };
  exit: Promise<number>;
  kill: Mock;
}

interface MockWebContainerInstance {
  fs: MockWebContainerFS;
  on: Mock;
  teardown: Mock;
  spawn: Mock;
}

// ─── FACTORY ──────────

function createMockWebContainer(): MockWebContainerInstance {
  return {
    fs: {
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue("{}"),
      mkdir: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([]),
    },
    on: vi.fn(),
    teardown: vi.fn(),
    spawn: vi.fn().mockResolvedValue({
      output: { pipeTo: vi.fn() },
      exit: Promise.resolve(0),
      kill: vi.fn(),
    } as MockProcess),
  };
}

// ─── SINGLETON RESET ───

function resetWebContainerSingleton() {
  const service = webContainerService as any;
  const ServiceClass = service.constructor;

  ServiceClass.instance = null;
  ServiceClass.initializationPromise = null;

  service.devServerProcess = null;
  service.serverUrl = null;
  service.currentProjectId = null;
  service.sessionId = null;
  service.listeners.clear();
}

// ─── TESTS ─────────────

describe("WebContainerService - Core Methods (Minimal Testing)", () => {
  let mockWc: MockWebContainerInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    resetWebContainerSingleton();
    mockWc = createMockWebContainer();
    (WebContainer.boot as Mock).mockResolvedValue(mockWc);
  });

  afterEach(() => {
    resetWebContainerSingleton();
    vi.clearAllMocks();
  });

  // ─── 1. getInstance() 

  describe("getInstance", () => {
    it("should initialize WebContainer on first call", async () => {
      const instance = await webContainerService.getInstance();
      expect(instance).toBe(mockWc);
    });

    it("should return same instance on subsequent calls (singleton)", async () => {
      const instance1 = await webContainerService.getInstance();
      const instance2 = await webContainerService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should handle boot errors gracefully", async () => {
      const error = new Error("Boot failed");
      resetWebContainerSingleton();
      (WebContainer.boot as Mock).mockRejectedValueOnce(error);

      await expect(webContainerService.getInstance()).rejects.toThrow("Boot failed");
    });
  });

  // ─── 2. installDependencies()

  describe("installDependencies", () => {
    beforeEach(async () => {
      await webContainerService.getInstance();
    });

    it("should spawn npm install process", async () => {
      const exitCode = await webContainerService.installDependencies();
      expect(mockWc.spawn).toHaveBeenCalledWith("npm", ["install"]);
      expect(exitCode).toBe(0);
    });

    it("should emit package-json-changed event after successful install", async () => {
      mockWc.fs.readFile.mockResolvedValueOnce('{"name":"test"}');
      const listener = vi.fn();
      webContainerService.on("package-json-changed", listener);

      await webContainerService.installDependencies();

      expect(listener).toHaveBeenCalled();
    });

    it("should handle npm install failure", async () => {
      const failProcess: MockProcess = {
        output: { pipeTo: vi.fn() },
        exit: Promise.resolve(1),
        kill: vi.fn(),
      };
      mockWc.spawn.mockResolvedValueOnce(failProcess);

      const exitCode = await webContainerService.installDependencies();
      expect(exitCode).toBe(1);
    });
  });

  // ─── 3. detectStartCommand()─

  describe("detectStartCommand", () => {
    beforeEach(async () => {
      await webContainerService.getInstance();
    });

    it("should detect Next.js project and return 'npm run dev'", async () => {
      const packageJson = {
        name: "next-app",
        dependencies: { next: "^15.0.0", react: "^19.0.0" },
        scripts: { dev: "next dev" },
      };
      mockWc.fs.readFile.mockResolvedValueOnce(JSON.stringify(packageJson));

      const command = await webContainerService.detectStartCommand();
      expect(command.command).toBe("npm");
      expect(command.args).toEqual(["run", "dev"]);
    });

    it("should detect React (Vite) project", async () => {
      const packageJson = {
        name: "react-vite-app",
        dependencies: { vite: "^5.0.0", react: "^19.0.0" },
        scripts: { dev: "vite" },
      };
      mockWc.fs.readFile.mockResolvedValueOnce(JSON.stringify(packageJson));

      const command = await webContainerService.detectStartCommand();
      expect(command.command).toBe("npm");
      expect(command.args).toEqual(["run", "dev"]);
    });
  });

  // ─── 4. startDevServer() ──

  describe("startDevServer", () => {
    beforeEach(async () => {
      await webContainerService.getInstance();
    });

    it("should spawn dev server with detected command", async () => {
      const mockProcess: MockProcess = {
        output: { pipeTo: vi.fn() },
        exit: Promise.resolve(0),
        kill: vi.fn(),
      };
      mockWc.spawn.mockResolvedValueOnce(mockProcess);

      await webContainerService.startDevServer("npm", ["run", "dev"]);

      expect(mockWc.spawn).toHaveBeenCalledWith("npm", ["run", "dev"]);
    });

    it("should not start if server already running", async () => {
  const mockProcess: MockProcess = {
    output: { pipeTo: vi.fn() },
    exit: new Promise(() => {}), 
    kill: vi.fn(),
  };
  mockWc.spawn.mockResolvedValue(mockProcess);

  await webContainerService.startDevServer("npm", ["run", "dev"]);
  const firstCallCount = mockWc.spawn.mock.calls.length;

  await webContainerService.startDevServer("npm", ["run", "dev"]);
  const secondCallCount = mockWc.spawn.mock.calls.length;

  expect(secondCallCount).toBe(firstCallCount);
});
  });

  // ─── 5. Event System ─

  describe("Event System (on/off)", () => {
    it("should register event listeners", () => {
      const listener = vi.fn();
      webContainerService.on("server-ready", listener);

      const listeners = (webContainerService as any).listeners.get("server-ready");
      expect(listeners).toBeDefined();
      expect(listeners?.has(listener)).toBe(true);
    });

    it("should unregister listeners with off()", () => {
      const listener = vi.fn();
      webContainerService.on("server-ready", listener);
      webContainerService.off("server-ready", listener);

      const listeners = (webContainerService as any).listeners.get("server-ready");
      expect(listeners?.has(listener)).toBe(false);
    });
  });

  // ─── 6. writeFile() ──

  describe("writeFile", () => {
    beforeEach(async () => {
      await webContainerService.getInstance();
    });

    it("should write file to WebContainer filesystem with correct path and content", async () => {
      const content = "console.log('hello');";
      await webContainerService.writeFile("src/index.ts", content);

      expect(mockWc.fs.mkdir).toHaveBeenCalledWith("/src", { recursive: true });
      expect(mockWc.fs.writeFile).toHaveBeenCalledWith("/src/index.ts", content);
    });
  });

  // ─── 7. setCurrentProject()──

  describe("setCurrentProject", () => {
    beforeEach(async () => {
      await webContainerService.getInstance();
    });

    it("should track current project ID", async () => {
      await webContainerService.setCurrentProject("project-123");
      expect(webContainerService.getCurrentProjectId()).toBe("project-123");
    });
  });

  // ─── 8. isServerRunning() ─

  describe("isServerRunning", () => {
    it("should return false when server is not running", () => {
      expect(webContainerService.isServerRunning()).toBe(false);
    });
  });

  // ─── 9. stopDevServer() ───

  describe("stopDevServer", () => {
    beforeEach(async () => {
      await webContainerService.getInstance();
    });

    it("should not throw when stopping server that isn't running", () => {
      expect(() => webContainerService.stopDevServer()).not.toThrow();
    });
  });

  // ─── 10. restartDevServer()

  describe("restartDevServer", () => {
    beforeEach(async () => {
      await webContainerService.getInstance();
    });

    it("should handle restart gracefully", async () => {
      const mockProcess: MockProcess = {
        output: { pipeTo: vi.fn() },
        exit: Promise.resolve(0),
        kill: vi.fn(),
      };
      mockWc.spawn.mockResolvedValue(mockProcess);

      await expect(webContainerService.restartDevServer()).resolves.not.toThrow();
    });
  });

  // ─── 11. directoryExists() 

  describe("directoryExists", () => {
    beforeEach(async () => {
      await webContainerService.getInstance();
    });

    it("should return true if directory exists", async () => {
      mockWc.fs.readdir.mockResolvedValueOnce([]);

      const exists = await webContainerService.directoryExists("src");
      expect(exists).toBe(true);
    });

    it("should return false if directory does not exist", async () => {
      mockWc.fs.readdir.mockRejectedValueOnce(new Error("Not found"));

      const exists = await webContainerService.directoryExists("nonexistent");
      expect(exists).toBe(false);
    });
  });

  // ─── 12. fileExists() 

  describe("fileExists", () => {
    beforeEach(async () => {
      await webContainerService.getInstance();
    });

    it("should return true if file exists", async () => {
      mockWc.fs.readFile.mockResolvedValueOnce("file content");

      const exists = await webContainerService.fileExists("package.json");
      expect(exists).toBe(true);
    });

    it("should return false if file does not exist", async () => {
      mockWc.fs.readFile.mockRejectedValueOnce(new Error("Not found"));

      const exists = await webContainerService.fileExists("nonexistent.txt");
      expect(exists).toBe(false);
    });
  });
});