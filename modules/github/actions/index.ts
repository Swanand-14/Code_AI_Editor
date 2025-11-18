"use server"

import { requireGitHubToken } from "../lib/github-token"
import { GitHubClient } from "../lib/github-client"
import { prisma } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { success } from "zod"

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
        userId: session.user.id,
        repoFullName: repoFullName,
        repoId: repoId,
        defaultBranch: defaultBranch,
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