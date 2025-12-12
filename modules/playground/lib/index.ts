import { TemplateFile, TemplateFolder } from "./path-to-json";

export function findFilePath(
  file: TemplateFile,
  folder: TemplateFolder,
  pathSoFar: string[] = []
): string | null {
  for (const item of folder.items) {
    if ("folderName" in item) {
      const res = findFilePath(file, item, [...pathSoFar, item.folderName]);
      if (res) return res;
    } else {
      if (
        item.filename === file.filename &&
        item.fileExtension === file.fileExtension
      ) {
        const currentPath = [
          ...pathSoFar,
          item.filename + (item.fileExtension ? "." + item.fileExtension : ""),
        ].join("/");
        
        // 🔥 CRITICAL FIX: Must match BOTH filename AND path
        // Build the folder path from pathSoFar (excluding the filename itself)
        const currentFolderPath = pathSoFar.join("/");
        
        // If file has path property, verify it matches
        if (file.path !== undefined) {
          const normalizedFilePath = file.path.replace(/^\/+|\/+$/g, '');
          const normalizedFolderPath = currentFolderPath.replace(/^\/+|\/+$/g, '');
          
          // Only return if the folder paths match exactly
          if (normalizedFilePath === normalizedFolderPath) {
            return currentPath;
          }
        } else {
          // If no path specified, return first match (fallback for legacy code)
          return currentPath;
        }
      }
    }
  }
  return null;
}


export async function longPoll<T>(
  url: string,
  options: RequestInit,
  checkCondition: (response: T) => boolean,
  interval: number = 1000, // Poll every 1 second
  timeout: number = 10000 // Timeout after 10 seconds
): Promise<T> {
  const startTime = Date.now();

  while (true) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: T = await response.json();

      // Check if the condition is met
      if (checkCondition(data)) {
        return data;
      }

      // Check if the timeout has been reached
      if (Date.now() - startTime >= timeout) {
        throw new Error("Long polling timed out");
      }

      // Wait for the specified interval before the next poll
      await new Promise((resolve) => setTimeout(resolve, interval));
    } catch (error) {
      console.error("Error during long polling:", error);
      throw error;
    }
  }
}

  // Helper function to generate unique file ID
/**
 * Generates a unique file ID based on file location in folder structure
 * @param file The template file
 * @param rootFolder The root template folder containing all files
 * @returns A unique file identifier including full path
 */
export const generateFileId = (file: TemplateFile, rootFolder: TemplateFolder): string => {
  // 🔥 FIX: Use file.path if available (passed from explorer), otherwise find it
  // CRITICAL: Check if path is undefined, not falsy - empty string '' means root level
  let filePath = file.path;
  if (file.path === undefined) {
    // If no path provided, try to find it (will return first match)
    filePath = findFilePath(file, rootFolder)?.replace(/^\/+/, '') || '';
  } else {
    // 🔥 CRITICAL: If path is provided, verify it matches the file in folder structure
    // This ensures we get the correct file even if multiple have same name
    const normalizedPath = filePath.replace(/^\/+/, '');
    const verifiedPath = findFilePath(file, rootFolder, [], normalizedPath)?.replace(/^\/+/, '');
    if (verifiedPath) {
      filePath = verifiedPath;
    }
  }
  
  // Handle empty/undefined file extension
  const extension = file.fileExtension?.trim();
  const extensionSuffix = extension ? `.${extension}` : '';

  // Combine path and filename
  return filePath
    ? `${filePath}/${file.filename}${extensionSuffix}`
    : `${file.filename}${extensionSuffix}`;
}

/**
 * 🔥 FIX: Add path information to all files in the template structure
 * This ensures files with same name in different directories can be distinguished
 * @param folder The template folder to enrich
 * @param basePath The base path so far (used internally for recursion)
 * @returns The enriched template folder with path info added to each file
 */
export function enrichTemplateWithPaths(
  folder: TemplateFolder,
  basePath: string = ''
): TemplateFolder {
  return {
    ...folder,
    items: folder.items.map(item => {
      if ('folderName' in item) {
        // Recursively enrich folders
        const newPath = basePath ? `${basePath}/${item.folderName}` : item.folderName;
        return enrichTemplateWithPaths(item, newPath);
      } else {
        // Add path to files - but don't overwrite if already set
        // Only set path if it's undefined
        if (item.path === undefined) {
          return {
            ...item,
            path: basePath
          } as TemplateFile;
        }
        return item;
      }
    })
  };
}