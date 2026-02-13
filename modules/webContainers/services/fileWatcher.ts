

import { WebContainer } from "@webcontainer/api";

export class FileCreationWatcher {
  private knownFiles: Set<string> = new Set();
  private knownFolders: Set<string> = new Set();
  private pollInterval: NodeJS.Timeout | null = null;
  private fileContents: Map<string, string> = new Map();
  private isRunning = false;
   private onFileDeletedCallback?: (filePath: string, parentPath: string) => void;
  private onFolderDeletedCallback?: (folderPath: string, parentPath: string) => void;
  private onFileRenamedCallback?: (oldPath: string, newPath: string, parentPath: string) => void;
  /**
   * Initialize the watcher
   */
  async initialize(
    instance: WebContainer,
    onFileCreated: (filePath: string, parentPath: string) => void,
    onFolderCreated: (folderPath: string, parentPath: string) => void,
    excludePaths: string[] = ['node_modules', '.git', '.next', 'dist', 'build'],
     options?: {
      onFileDeleted?: (filePath: string, parentPath: string) => void;
      onFolderDeleted?: (folderPath: string, parentPath: string) => void;
      onFileRenamed?: (oldPath: string, newPath: string, parentPath: string) => void;
    }
  ) {
    console.log("🔍 [FileWatcher] Initializing file creation watcher...");
    this.onFileDeletedCallback = options?.onFileDeleted;
    this.onFolderDeletedCallback = options?.onFolderDeleted;
    this.onFileRenamedCallback = options?.onFileRenamed;
    
    // Initial scan to populate known files/folders
    await this.scanFilesystem(instance, '', excludePaths);
    console.log(`✅ [FileWatcher] Initial scan complete: ${this.knownFiles.size} files, ${this.knownFolders.size} folders`);
    
    // Start polling
    this.startPolling(instance, onFileCreated, onFolderCreated, excludePaths);
  }
  
  /**
   * Recursively scan the filesystem
   */
  private async scanFilesystem(
    instance: WebContainer,
    currentPath: string,
    excludePaths: string[]
  ): Promise<void> {
    try {
      const entries = await instance.fs.readdir(currentPath.startsWith('/') ? currentPath : `/${currentPath}`, {
        withFileTypes: true
      });
      
      for (const entry of entries) {
        const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        
        // Skip excluded paths
        if (excludePaths.some(exclude => fullPath.includes(exclude))) {
          continue;
        }
        
          if (entry.isDirectory()) {
          this.knownFolders.add(fullPath);
          
          await this.scanFilesystem(instance, fullPath, excludePaths);
        } else if (entry.isFile()) {
          this.knownFiles.add(fullPath);
         
          try {
            const content = await instance.fs.readFile(`/${fullPath}`, 'utf-8');
            this.fileContents.set(fullPath, content);
          } catch (err) {
            
          }
        }
      
      }
    } catch (error) {
      // Ignore errors (directory might not exist yet)
    }
  }
  
  /**
   * Start polling for new files/folders
   */
  private startPolling(
    instance: WebContainer,
    onFileCreated: (filePath: string, parentPath: string) => void,
    onFolderCreated: (folderPath: string, parentPath: string) => void,
    excludePaths: string[]
  ) {
    if (this.isRunning) {
      console.warn("⚠️ [FileWatcher] Already running");
      return;
    }
    
    this.isRunning = true;
    
    this.pollInterval = setInterval(async () => {
      await this.checkForChanges(instance, '', onFileCreated, onFolderCreated, excludePaths);
    }, 2000); // Check every 2 seconds
    
    console.log("✅ [FileWatcher] Polling started (every 2s)");
  }
  
  /**
   * Check for new files/folders
   */
private async checkForChanges(
    instance: WebContainer,
    currentPath: string,
    onFileCreated: (filePath: string, parentPath: string) => void,
    onFolderCreated: (folderPath: string, parentPath: string) => void,
    excludePaths: string[]
  ): Promise<void> {
    try {
      const currentFiles = new Set<string>();
      const currentFolders = new Set<string>();
      const newFileContents = new Map<string, string>();
      
      // Scan current state
      await this.scanCurrentState(instance, currentPath, excludePaths, currentFiles, currentFolders, newFileContents);
      
      // 🔥 NEW: Detect deletions (files that were known but are now missing)
      if (this.onFileDeletedCallback) {
        for (const knownFile of this.knownFiles) {
          if (!currentFiles.has(knownFile)) {
            console.log(`🗑️ [FileWatcher] File deleted: ${knownFile}`);
            const parentPath = knownFile.includes('/') ? knownFile.substring(0, knownFile.lastIndexOf('/')) : '';
            this.onFileDeletedCallback(knownFile, parentPath);
            this.fileContents.delete(knownFile);
          }
        }
      }
      
      if (this.onFolderDeletedCallback) {
        for (const knownFolder of this.knownFolders) {
          if (!currentFolders.has(knownFolder)) {
            console.log(`🗑️ [FileWatcher] Folder deleted: ${knownFolder}`);
            const parentPath = knownFolder.includes('/') ? knownFolder.substring(0, knownFolder.lastIndexOf('/')) : '';
            this.onFolderDeletedCallback(knownFolder, parentPath);
          }
        }
      }
      
      // 🔥 NEW: Detect renames (file with same content but different path)
      if (this.onFileRenamedCallback) {
        const deletedFiles = Array.from(this.knownFiles).filter(f => !currentFiles.has(f));
        const newFiles = Array.from(currentFiles).filter(f => !this.knownFiles.has(f));
        
        for (const deletedPath of deletedFiles) {
          const deletedContent = this.fileContents.get(deletedPath);
          if (deletedContent) {
            // Look for a new file with the same content
            for (const newPath of newFiles) {
              const newContent = newFileContents.get(newPath);
              if (newContent === deletedContent) {
                console.log(`✏️ [FileWatcher] File renamed: ${deletedPath} → ${newPath}`);
                const parentPath = newPath.includes('/') ? newPath.substring(0, newPath.lastIndexOf('/')) : '';
                this.onFileRenamedCallback(deletedPath, newPath, parentPath);
                
                // Remove from lists so we don't trigger create/delete callbacks
                const newIdx = newFiles.indexOf(newPath);
                if (newIdx > -1) newFiles.splice(newIdx, 1);
                const delIdx = deletedFiles.indexOf(deletedPath);
                if (delIdx > -1) deletedFiles.splice(delIdx, 1);
                break;
              }
            }
          }
        }
      }
      
      // Detect new files
      for (const filePath of currentFiles) {
        if (!this.knownFiles.has(filePath)) {
          console.log(`📄 [FileWatcher] New file detected: ${filePath}`);
          const parentPath = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
          onFileCreated(filePath, parentPath);
        }
      }
      
      // Detect new folders
      for (const folderPath of currentFolders) {
        if (!this.knownFolders.has(folderPath)) {
          console.log(`📁 [FileWatcher] New folder detected: ${folderPath}`);
          const parentPath = folderPath.includes('/') ? folderPath.substring(0, folderPath.lastIndexOf('/')) : '';
          onFolderCreated(folderPath, parentPath);
        }
      }
      
      // Update known state
      this.knownFiles = currentFiles;
      this.knownFolders = currentFolders;
      this.fileContents = newFileContents;
      
    } catch (error) {
      // Ignore errors
    }
  }

  private async scanCurrentState(
    instance: WebContainer,
    currentPath: string,
    excludePaths: string[],
    files: Set<string>,
    folders: Set<string>,
    fileContents: Map<string, string>
  ): Promise<void> {
    try {
      const entries = await instance.fs.readdir(currentPath.startsWith('/') ? currentPath : `/${currentPath}`, {
        withFileTypes: true
      });
      
      for (const entry of entries) {
        const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        
        // Skip excluded paths
        if (excludePaths.some(exclude => fullPath.includes(exclude))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          folders.add(fullPath);
          // Recursively scan subdirectories
          await this.scanCurrentState(instance, fullPath, excludePaths, files, folders, fileContents);
        } else if (entry.isFile()) {
          files.add(fullPath);
          // Store file content for rename detection
          try {
            const content = await instance.fs.readFile(`/${fullPath}`, 'utf-8');
            fileContents.set(fullPath, content);
          } catch (err) {
            // Binary file or read error, skip content tracking
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }
  
  /**
   * Stop the watcher
   */
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.isRunning = false;
      console.log("🛑 [FileWatcher] Polling stopped");
    }
  }
  
  /**
   * Reset the watcher (clear known files/folders)
   */
  reset() {
    this.knownFiles.clear();
    this.knownFolders.clear();
    this.fileContents.clear(); 
    console.log("🔄 [FileWatcher] Reset");
  }
}

// Export singleton instance
export const fileCreationWatcher = new FileCreationWatcher();