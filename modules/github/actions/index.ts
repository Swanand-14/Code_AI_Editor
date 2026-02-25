"use server"

import { requireGitHubToken } from "../lib/github-token"
import { GitHubClient } from "../lib/github-client"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { success } from "zod"


interface FileChange {
  path: string
  type: 'modified' | 'created' | 'deleted'
  content?: string
  oldSha?: string
}

export async function fetchUserRepositories() {
  try {
    const token = await requireGitHubToken()
    const githubClient = new GitHubClient(token)
    const repos = await githubClient.getRepositories()
    return { success: true, data: repos }
  } catch (error: any) {
    console.error("Error fetching GitHub repositories:", error)
    return { success: false, error: error.message || "Unknown error" }
  }
}

export async function fetchRepositoryTree(owner: string, repo: string, branch?: string) {
  try {
    const token = await requireGitHubToken()
    const githubClient = new GitHubClient(token)
    const tree = await githubClient.getRepoTree(owner, repo, branch)
    return { success: true, data: tree }
  } catch (error: any) {
    console.error("Error fetching repository tree:", error)
    return { success: false, error: error.message || "Failed to fetch repository tree" }
  }
}

export async function fetchFileContent(owner: string, repo: string, path: string, branch?: string) {
  try {
    const token = await requireGitHubToken()
    const githubClient = new GitHubClient(token)
    const content = await githubClient.getFileContent(owner, repo, path, branch)
    return { success: true, data: content }
  } catch (error: any) {
    console.error("Error fetching file content:", error)
    return { success: false, error: error.message || "Failed to fetch file content" }
  }
}

export async function saveFileToGitHub(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string,
  branch?: string
) {
  try {
    const token = await requireGitHubToken()
    const githubClient = new GitHubClient(token)
    const result = await githubClient.updateFile(owner, repo, path, content, message, sha, branch)
    return { success: true, data: result }
  } catch (error: any) {
    console.error("Error saving file to GitHub:", error)
    return { success: false, error: error.message || "Failed to save file to GitHub" }
  }
}

export async function linkRepositoryToUser(repoFullName: string, repoId: number, defaultBranch: string) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      throw new Error("User not authenticated")
    }

    await prisma.gitHubRepository.upsert({
      where: {
        userId_repoFullName: {
          userId: session.user.id,
          repoFullName: repoFullName,
        },
      },
      create: {
        
        repoFullName: repoFullName,
        repoId: repoId,
        defaultBranch: defaultBranch,
        user:{
          connect:{
            id:session.user.id
          }
        }
      },
      update: {
        lastSyncedAt: new Date(),
      },
    })
    
    revalidatePath("/dashboard")
    return { success: true } // ✅ Added explicit return
  } catch (error: any) {
    console.error("Error linking repository to user:", error)
    return { success: false, error: error.message || "Failed to link repository" } // ✅ Fixed: was missing return
  }
}

export async function getUserLinkedRepos() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return { success: false, error: "Not authenticated" }
    }

    const repos = await prisma.gitHubRepository.findMany({
      where: { userId: session.user.id },
      orderBy: { lastSyncedAt: "desc" },
    })

    return { success: true, data: repos }
  } catch (error: any) {
    console.error("Error fetching linked repositories:", error)
    return { success: false, error: error.message || "Failed to fetch linked repositories" }
  }
}

export async function createFileInGitHub(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch?: string
) {
  try {
    const token = await requireGitHubToken()
    const githubClient = new GitHubClient(token)
    const result = await githubClient.createFile(owner, repo, path, content, message, branch)
    return { success: true, data: result }
  } catch (error: any) {
    console.error("Error creating file in GitHub:", error)
    return { success: false, error: error.message || "Failed to create file" }
  }
}

export async function createFolderInGitHub(
  owner: string,
  repo: string,
  path: string,
  message: string,
  branch?: string
) {
  try {
    const token = await requireGitHubToken()
    const githubClient = new GitHubClient(token)
    await githubClient.createDirectory(owner, repo, path, message, branch)
    return { success: true }
  } catch (error: any) {
    console.error("Error creating folder in GitHub:", error)
    return { success: false, error: error.message || "Failed to create folder" }
  }
}

export async function deleteFileFromGitHub(
  owner: string,
  repo: string,
  path: string,
  message: string,
  sha: string,
  branch?: string
) {
  try {
    const token = await requireGitHubToken()
    const githubClient = new GitHubClient(token)
    await githubClient.deleteFile(owner, repo, path, message, sha, branch)
    return { success: true }
  } catch (error: any) {
    console.error("Error deleting file from GitHub:", error)
    return { success: false, error: error.message || "Failed to delete file" }
  }
}

export async function deleteFolderFromGithub(owner:string,repo:string,folderPath:string,message:string,
  files:{path:string;sha:string}[],branch?:string
){
  try {
    const token = await requireGitHubToken()
    const githubClient = new GitHubClient(token);
    const filesTodelete = files.filter(file=>file.path.startsWith(folderPath+'/')||file.path === folderPath)
    if(filesTodelete.length === 0){ 
      return {success:false,error:"No files found in folder"}
    }

    await githubClient.deleteMultipleFiles(owner,repo,filesTodelete,message,branch)
    return {success:true,deleteCount:filesTodelete.length}
  } catch (error:any) {
    return {success:false,error:error.message || "Failed to delete folder"}
  }
}

interface CreateRepoParams {
  name:string,
  description:string,
  isPrivate:boolean,
  initializeWithReadme:boolean,
  addGitIgnore:boolean
}

interface FileToCommit{
  path:string,
  content:string
}


export async function createGitHubRepository(params:CreateRepoParams,files:FileToCommit[]){
  try {
    const session = await auth()
    if(!session?.user?.id){
      return {success:false,error:"Unauthenticated"}
    }
    const token = await requireGitHubToken()

    const githubClient = new GitHubClient(token)
    const result = await githubClient.createRepository(params,files)
    await linkRepositoryToUser(result.fullName,result.repoId,result.defaultBranch)

    return {
      success:true,
      data:result
    }

  } catch (error:any) {
    console.error("Error creating GitHub repository:",error)
    return {success:false,error:error.message || "Failed to create repository"}
    
  }
}


export async function saveWorkspaceDraft(draft: {
  repoFullName: string;
  branch: string;
  modifiedFiles: { path: string; content: string; sha: string }[];
  createdFiles: { path: string; content: string }[];
  deletedFiles: string[];
}) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    // Upsert draft (update if exists, create if not)
    await prisma.workspaceDraft.upsert({
      where: {
        userId_repoFullName_branch: {
          userId: session.user.id,
          repoFullName: draft.repoFullName,
          branch: draft.branch,
        },
      },
      create: {
        userId: session.user.id,
        repoFullName: draft.repoFullName,
        branch: draft.branch,
        modifiedFiles: draft.modifiedFiles,
        createdFiles: draft.createdFiles,
        deletedFiles: draft.deletedFiles,
        lastSaved: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
      update: {
        modifiedFiles: draft.modifiedFiles,
        createdFiles: draft.createdFiles,
        deletedFiles: draft.deletedFiles,
        lastSaved: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    console.log(`💾 [Draft] Saved: ${draft.repoFullName} (${draft.branch})`);
    return { success: true };
    
  } catch (error: any) {
    console.error('Error saving workspace draft:', error);
    return { success: false, error: error.message || 'Failed to save draft' };
  }
}

export async function loadWorkspaceDraft(repoFullName: string, branch: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    const draft = await prisma.workspaceDraft.findUnique({
      where: {
        userId_repoFullName_branch: {
          userId: session.user.id,
          repoFullName,
          branch,
        },
      },
    });

    if (!draft) {
      return { success: true, data: null };
    }

    console.log(`📂 [Draft] Loaded: ${repoFullName} (${branch})`);
    return { success: true, data: draft };
    
  } catch (error: any) {
    console.error('Error loading workspace draft:', error);
    return { success: false, error: error.message || 'Failed to load draft' };
  }
}

export async function deleteWorkspaceDraft(repoFullName: string, branch: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    await prisma.workspaceDraft.delete({
      where: {
        userId_repoFullName_branch: {
          userId: session.user.id,
          repoFullName,
          branch,
        },
      },
    });

    console.log(`🗑️ [Draft] Deleted: ${repoFullName} (${branch})`);
    return { success: true };
    
  } catch (error: any) {
    console.error('Error deleting workspace draft:', error);
    return { success: false, error: error.message || 'Failed to delete draft' };
  }
}

export async function commitAllChangesToGitHub(
  owner: string,
  repo: string,
  changes: FileChange[],
  message: string,
  branch: string = 'main'
) {
  try {
    console.log(`📦 [Commit] Starting batch commit: ${changes.length} changes to ${owner}/${repo}@${branch}`)

    const token = await requireGitHubToken()
    const githubClient = new GitHubClient(token)

    // ✅ STEP 1: Deduplicate changes — if a file appears multiple times, keep last entry
    const deduplicatedMap = new Map<string, FileChange>()
    for (const change of changes) {
      deduplicatedMap.set(change.path, change)
    }
    const deduplicatedChanges = Array.from(deduplicatedMap.values())
    console.log(`📦 [Commit] After dedup: ${deduplicatedChanges.length} unique files (was ${changes.length})`)

    // ✅ STEP 2: Get branch → extract BOTH SHAs correctly
    // getBranch returns: { commit: { sha: "COMMIT_SHA", commit: { tree: { sha: "TREE_SHA" } } } }
    const branchData = await githubClient.getBranch(owner, repo, branch)

    // ── This is the commit SHA — used for parents[] ──
    const currentCommitSha = branchData.commit.sha

    // ── This is the TREE SHA — used for base_tree ──
    // branchData.commit.sha          = commit object SHA  ← WRONG for base_tree
    // branchData.commit.commit.tree.sha = actual tree SHA ← CORRECT for base_tree
    const baseTreeSha = branchData.commit.commit.tree.sha

    console.log(`📍 [Commit] Commit SHA : ${currentCommitSha.substring(0, 7)}`)
    console.log(`🌳 [Commit] Tree SHA   : ${baseTreeSha.substring(0, 7)}`)

    if (!baseTreeSha) {
      throw new Error('Could not get base tree SHA from branch data. Branch data: ' + JSON.stringify(branchData.commit.commit))
    }

    // ✅ STEP 3: Fetch base tree entries for proper tree reconstruction
    console.log(`📂 [Commit] Fetching base tree entries...`)
    const baseTreeEntries = await githubClient.getTreeEntries(owner, repo, baseTreeSha)
    console.log(`📂 [Commit] Base tree has ${baseTreeEntries.length} entries`)
    const blobEntries = baseTreeEntries.filter((entry: any) => entry.type === 'blob')
console.log(`📂 [Commit] Blob entries: ${blobEntries.length}`)

    // Create a map of existing files for easy lookup
    const existingEntries = new Map<string, any>()
    for (const entry of blobEntries) {
      existingEntries.set(entry.path, entry)
    }

    // Get paths of deleted files
    const deletedPaths = new Set(
      deduplicatedChanges
        .filter(c => c.type === 'deleted')
        .map(c => c.path)
    )

    console.log(`🗑️ [Commit] Deleting ${deletedPaths.size} files`)

    // ✅ STEP 4: Create blobs for modified/created files (sequentially to avoid rate limits)
    const filesToUpload = deduplicatedChanges.filter(
      c => c.type !== 'deleted' && c.content !== undefined
    )

    console.log(`📄 [Commit] Creating ${filesToUpload.length} blobs...`)

    const blobMap = new Map<string, string>()

    // Create blobs one at a time to avoid duplicate/race conditions
    for (const change of filesToUpload) {
      // Use base64 encoding — safe for all file types
      const contentBase64 = Buffer.from(change.content!, 'utf-8').toString('base64')
      const blob = await githubClient.createBlob(owner, repo, contentBase64, 'base64')
      console.log(`📄 [Commit] Created blob for ${change.path} → ${blob.sha.substring(0, 7)}`)
      blobMap.set(change.path, blob.sha)
    }

    // ✅ STEP 5: Build complete tree by merging base tree with changes
    const treeEntries: Array<{
      path: string
      mode: '100644' | '100755' | '040000'
      type: 'blob' | 'tree' | 'commit'
      sha: string
    }> = []

    // Add all existing entries that aren't being deleted
    for (const [path, entry] of existingEntries) {
      if (!deletedPaths.has(path)) {
        // Check if this file is being modified
        if (blobMap.has(path)) {
          treeEntries.push({
            path,
            mode: '100644',
            type: 'blob',
            sha: blobMap.get(path)!,
          })
          blobMap.delete(path) // Mark as processed
        } else {
          // Keep original entry
          treeEntries.push({
            path,
            mode: '100644',
            type: 'blob',
            sha: entry.sha,
          })
        }
      }
    }

    // Add newly created files (those not in existing entries)
    for (const [path, sha] of blobMap) {
      console.log(`📄 [Commit] Adding new file: ${path}`)
      treeEntries.push({
        path,
        mode: '100644',
        type: 'blob',
        sha,
      })
    }

    console.log(`🌳 [Commit] Building complete tree with ${treeEntries.length} entries`)

    // ✅ STEP 6: Create tree (without base_tree to avoid BadObjectState errors)
    const tree = await githubClient.createTreeDirect(owner, repo, treeEntries)

    console.log(`🌳 [Commit] Created new tree: ${tree.sha.substring(0, 7)}`)

    // ✅ STEP 5: Create commit
    const commit = await githubClient.createCommit(owner, repo, {
      message,
      tree: tree.sha,
      parents: [currentCommitSha],
    })

    console.log(`✅ [Commit] Created commit: ${commit.sha.substring(0, 7)}`)

    // ✅ STEP 6: Update the branch ref
    await githubClient.updateRef(owner, repo, `heads/${branch}`, commit.sha)

    console.log(`🎯 [Commit] Branch "${branch}" updated successfully`)

    // ✅ STEP 7: Fetch updated file tree for store re-initialization
    const updatedTree = await githubClient.getRepoTree(owner, repo, branch)

    const filesWithContent = await Promise.all(
      updatedTree.map(async (file: any) => {
        if (file.type === 'file') {
          try {
            const content = await githubClient.getFileContent(owner, repo, file.path, branch)
            return { ...file, content }
          } catch {
            return file
          }
        }
        return file
      })
    )

    console.log(`✅ [Commit] Done! ${deduplicatedChanges.length} files committed.`)

    return {
      success: true,
      commitSha: commit.sha,
      updatedFiles: filesWithContent,
      changesCount: deduplicatedChanges.length,
    }

  } catch (error: any) {
    console.error('❌ [Commit] Error:', error)
    console.error('❌ [Commit] Stack:', error.stack)

    // Return friendly messages for known GitHub API errors
    if (error.message?.includes('BadObjectState') || error.status === 422) {
      return {
        success: false,
        error: 'Git error: invalid tree SHA. This usually means base_tree is wrong. Check server logs.',
      }
    }
    if (error.message?.includes('409') || error.status === 409) {
      return {
        success: false,
        error: 'Branch conflict — someone else pushed. Please refresh and try again.',
      }
    }
    if (error.message?.includes('401') || error.status === 401) {
      return {
        success: false,
        error: 'GitHub auth failed. Please reconnect your account.',
      }
    }
    if (error.message?.includes('404') || error.status === 404) {
      return {
        success: false,
        error: `Branch "${branch}" not found. Try refreshing.`,
      }
    }

    return {
      success: false,
      error: error.message || 'Failed to commit changes to GitHub',
    }
  }
}