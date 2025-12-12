// modules/playground/services/file-sync-service.ts
import { webContainerService } from "@/modules/webContainers/services/webContainer-services";

interface FileChange {
  path: string;
  content: string;
  timestamp: number;
}

/**
 * File Sync Service
 * Handles debounced file syncing to WebContainer
 * Prevents race conditions and unnecessary writes
 */
class FileSyncService {
  private pendingWrites: Map<string, FileChange> = new Map();
  private syncTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 500; // Wait 500ms after last change
  private isSyncing = false;
  private activeWrites: Set<string> = new Set(); // Track files currently being written

  /**
   * Queue a file change for syncing
   * Debounces multiple rapid changes to the same file
   */
  queueFileChange(path: string, content: string): void {
    console.log(`⏳ Queued ${path} for debounced sync`);
    
    // Skip if currently writing this file
    if (this.activeWrites.has(path)) {
      this.pendingWrites.set(path, {
        path,
        content,
        timestamp: Date.now(),
      });
      return;
    }

    // Clear existing timeout for this file
    const existingTimeout = this.syncTimeouts.get(path);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Store the change
    this.pendingWrites.set(path, {
      path,
      content,
      timestamp: Date.now(),
    });

    // Set new timeout
    const timeout = setTimeout(() => {
      this.syncFile(path);
    }, this.DEBOUNCE_MS);

    this.syncTimeouts.set(path, timeout);
  }

  /**
   * Sync a specific file to WebContainer
   */
  private async syncFile(path: string): Promise<void> {
    const change = this.pendingWrites.get(path);
    if (!change) return;

    this.activeWrites.add(path);
    try {
      await webContainerService.writeFile(path, change.content);
      console.log(`✅ Synced ${path} to WebContainer`);
      this.pendingWrites.delete(path);
      this.syncTimeouts.delete(path);
    } catch (error) {
      console.error(`❌ Failed to sync ${path}:`, error);
      // Keep in pending writes for retry
    } finally {
      this.activeWrites.delete(path);
    }
  }

  /**
   * Force immediate sync of a specific file
   * Used for manual save operations
   */
  async syncFileImmediate(path: string, content: string): Promise<void> {
    // Clear any pending debounced write
    const existingTimeout = this.syncTimeouts.get(path);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.syncTimeouts.delete(path);
    }

    // Remove from pending
    this.pendingWrites.delete(path);

    // Write immediately
    await webContainerService.writeFile(path, content);
    console.log(`✅ Immediately synced ${path}`);
  }

  /**
   * Force sync all pending changes
   */
  async syncAllPending(): Promise<void> {
    if (this.isSyncing) {
      console.log("⚠️ Sync already in progress");
      return;
    }

    this.isSyncing = true;

    try {
      // Clear all timeouts
      this.syncTimeouts.forEach((timeout) => clearTimeout(timeout));
      this.syncTimeouts.clear();

      // Sync all pending changes
      const syncPromises = Array.from(this.pendingWrites.values()).map(
        (change) => webContainerService.writeFile(change.path, change.content)
      );

      await Promise.all(syncPromises);
      
      console.log(`✅ Synced ${this.pendingWrites.size} files`);
      this.pendingWrites.clear();
    } catch (error) {
      console.error("❌ Failed to sync all files:", error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Check if there are pending changes
   */
  hasPendingChanges(): boolean {
    return this.pendingWrites.size > 0;
  }

  /**
   * Get list of files with pending changes
   */
  getPendingFiles(): string[] {
    return Array.from(this.pendingWrites.keys());
  }

  /**
   * Cancel all pending syncs (cleanup)
   */
  cancelAll(): void {
    this.syncTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.syncTimeouts.clear();
    this.pendingWrites.clear();
  }
}

export const fileSyncService = new FileSyncService();