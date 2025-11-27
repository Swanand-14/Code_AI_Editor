import { TemplateFile, TemplateFolder } from "./path-to-json"

export interface FileToCommit {
  path: string
  content: string
}

/**
 * Recursively converts template structure to flat file list
 * for GitHub repository creation
 */
export function convertTemplateToFiles(
  template: TemplateFolder | TemplateFile,
  basePath: string = ""
): FileToCommit[] {
  const files: FileToCommit[] = []

  // Check if it's a folder
  if ("folderName" in template) {
    const folder = template as TemplateFolder
    const folderPath = basePath 
      ? `${basePath}/${folder.folderName}` 
      : folder.folderName

    // Recursively process all items in the folder
    folder.items.forEach((item) => {
      files.push(...convertTemplateToFiles(item, folderPath))
    })
  } else {
    // It's a file
    const file = template as TemplateFile
    const fileName = `${file.filename}.${file.fileExtension}`
    const filePath = basePath ? `${basePath}/${fileName}` : fileName

    files.push({
      path: filePath,
      content: file.content || "",
    })
  }

  return files
}

/**
 * Validate repository name according to GitHub rules
 */
export function validateRepoName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Repository name cannot be empty" }
  }

  if (name.length > 100) {
    return { valid: false, error: "Repository name must be 100 characters or less" }
  }

  // GitHub repository name rules:
  // - Can contain alphanumeric characters, hyphens, underscores, and periods
  // - Cannot start with a period or hyphen
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
  
  if (!validPattern.test(name)) {
    return {
      valid: false,
      error: "Repository name can only contain alphanumeric characters, hyphens, underscores, and periods",
    }
  }

  // Reserved names
  const reserved = [".", "..", ".git"]
  if (reserved.includes(name.toLowerCase())) {
    return { valid: false, error: "This name is reserved" }
  }

  return { valid: true }
}

/**
 * Generate a safe repository name from playground name
 */
export function sanitizeRepoName(playgroundName: string): string {
  return playgroundName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-") // Replace invalid chars with hyphens
    .replace(/^[.-]+/, "") // Remove leading periods and hyphens
    .replace(/\.{2,}/g, ".") // Replace multiple periods with single
    .replace(/-{2,}/g, "-") // Replace multiple hyphens with single
    .substring(0, 100) // Limit length
}