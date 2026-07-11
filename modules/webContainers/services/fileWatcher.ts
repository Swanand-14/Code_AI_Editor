

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
  private onFolderRenamedCallback?: (oldPath: string, newPath: string, parentPath: string) => void;
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
      onFolderRenamed?: (oldPath: string, newPath: string, parentPath: string) => void;
    }
  ) {
    console.log("🔍 [FileWatcher] Initializing file creation watcher...");
    this.onFileDeletedCallback = options?.onFileDeleted;
    this.onFolderDeletedCallback = options?.onFolderDeleted;
    this.onFileRenamedCallback = options?.onFileRenamed;
    this.onFolderRenamedCallback = options?.onFolderRenamed;
    
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
    const deletedFiles = Array.from(this.knownFiles).filter(f => !currentFiles.has(f));
    const addedFiles = Array.from(currentFiles).filter(f => !this.knownFiles.has(f));
    const deletedFolders = Array.from(this.knownFolders).filter(f => !currentFolders.has(f));
    const addedFolders = Array.from(currentFolders).filter(f => !this.knownFolders.has(f));
    // Detect renamed folders - first
     if (this.onFolderRenamedCallback) {
      for (const deletedFolder of [...deletedFolders]) {
        const deletedChildren = deletedFiles
          .filter(f => f.startsWith(deletedFolder + '/'))
          .map(f => f.replace(deletedFolder + '/', ''));

        for (const newFolder of [...addedFolders]) {
          const newChildren = addedFiles
            .filter(f => f.startsWith(newFolder + '/'))
            .map(f => f.replace(newFolder + '/', ''));

          const deletedParent = deletedFolder.includes('/')
            ? deletedFolder.substring(0, deletedFolder.lastIndexOf('/'))
            : '';
          const newParent = newFolder.includes('/')
            ? newFolder.substring(0, newFolder.lastIndexOf('/'))
            : '';

          const sameParent = deletedParent === newParent;
          const sameChildren = deletedChildren.sort().join(',') === newChildren.sort().join(',');

          if (sameParent && sameChildren && deletedChildren.length > 0) {
            console.log(`📁 [FileWatcher] Folder renamed: ${deletedFolder} → ${newFolder}`);
            this.onFolderRenamedCallback(deletedFolder, newFolder, newParent);

            // consume folder from lists
            deletedFolders.splice(deletedFolders.indexOf(deletedFolder), 1);
            addedFolders.splice(addedFolders.indexOf(newFolder), 1);

            // consume all child files from lists
            addedFiles
              .filter(f => f.startsWith(newFolder + '/'))
              .forEach(f => {
                const idx = addedFiles.indexOf(f);
                if (idx > -1) addedFiles.splice(idx, 1);
              });
            deletedFiles
              .filter(f => f.startsWith(deletedFolder + '/'))
              .forEach(f => {
                const idx = deletedFiles.indexOf(f);
                if (idx > -1) deletedFiles.splice(idx, 1);
              });

            break;
          }
        }
      }
    }
    // Detect renamed files - second
    if (this.onFileRenamedCallback) {
      for (const deletedPath of [...deletedFiles]) {
        const deletedContent = this.fileContents.get(deletedPath);
        if (!deletedContent) continue;

        for (const newPath of [...addedFiles]) {
          const newContent = newFileContents.get(newPath);
          if (newContent === deletedContent) {
            console.log(`✏️ [FileWatcher] File renamed: ${deletedPath} → ${newPath}`);
            const parentPath = newPath.includes('/')
              ? newPath.substring(0, newPath.lastIndexOf('/'))
              : '';
            this.onFileRenamedCallback(deletedPath, newPath, parentPath);

            // consume from lists
            deletedFiles.splice(deletedFiles.indexOf(deletedPath), 1);
            addedFiles.splice(addedFiles.indexOf(newPath), 1);
            break;
          }
        }
      }
    }
    // Handle deleted files and folders
     if (this.onFileDeletedCallback) {
      for (const filePath of deletedFiles) {
        console.log(`🗑️ [FileWatcher] File deleted: ${filePath}`);
        const parentPath = filePath.includes('/')
          ? filePath.substring(0, filePath.lastIndexOf('/'))
          : '';
        this.onFileDeletedCallback(filePath, parentPath);
        this.fileContents.delete(filePath);
      }
    }

    if (this.onFolderDeletedCallback) {
      for (const folderPath of deletedFolders) {
        console.log(`🗑️ [FileWatcher] Folder deleted: ${folderPath}`);
        const parentPath = folderPath.includes('/')
          ? folderPath.substring(0, folderPath.lastIndexOf('/'))
          : '';
        this.onFolderDeletedCallback(folderPath, parentPath);
      }
    }








    // Handle added files and folders
    for (const filePath of addedFiles) {
      console.log(`📄 [FileWatcher] New file detected: ${filePath}`);
      const parentPath = filePath.includes('/')
        ? filePath.substring(0, filePath.lastIndexOf('/'))
        : '';
      onFileCreated(filePath, parentPath);
    }

    for (const folderPath of addedFolders) {
      console.log(`📁 [FileWatcher] New folder detected: ${folderPath}`);
      const parentPath = folderPath.includes('/')
        ? folderPath.substring(0, folderPath.lastIndexOf('/'))
        : '';
      onFolderCreated(folderPath, parentPath);
    }

    // update known state
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