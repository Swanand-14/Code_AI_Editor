import { Octokit } from "@octokit/rest"
import { throttling } from "@octokit/plugin-throttling"

const MyOctokit = Octokit.plugin(throttling);

export interface GitHubFile {
    name: string;
    path:string
    sha:string
    type: 'file' | 'dir' | 'symlink' | 'submodule';
    size:number
    content?:string
    url:string

}

export interface GitHubRepo{
    id:string;
    name:string;
    full_name:string;
    description:string | null;
    private:boolean;
    
    default_branch:string;
}

export class GitHubClient {
  private octokit: Octokit

  constructor(token: string) {
    this.octokit = new MyOctokit({
      auth: token,
      throttle: {
        onRateLimit: (retryAfter, options, octokit, retryCount) => {
          console.warn(`Rate limit hit for ${options.method} ${options.url}`)
          if (retryCount < 2) {
            console.log(`Retrying after ${retryAfter} seconds`)
            return true
          }
        },
        onSecondaryRateLimit: (retryAfter, options, octokit) => {
          console.warn(`Secondary rate limit hit for ${options.method} ${options.url}`)
        },
      },
    })
  }

    async getRepositories(): Promise<GitHubRepo[]> {
    try {
      const { data } = await this.octokit.repos.listForAuthenticatedUser({
        sort: "updated",
        per_page: 100,
      })

      return data.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        default_branch: repo.default_branch,
        updated_at: repo.updated_at,
      }))
    } catch (error: any) {
      throw new Error(`Failed to fetch repositories: ${error.message}`)
    }
  }
   async getRepoTree(owner: string, repo: string, branch?: string): Promise<GitHubFile[]> {
    try {
      // Get default branch if not provided
      if (!branch) {
        const { data: repoData } = await this.octokit.repos.get({ owner, repo })
        branch = repoData.default_branch
      }

      const { data } = await this.octokit.git.getTree({
        owner,
        repo,
        tree_sha: branch,
        recursive: "1", // Get full tree recursively
      })

      return data.tree
        .filter((item) => item.type === "blob" || item.type === "tree")
        .map((item) => ({
          name: item.path?.split("/").pop() || "",
          path: item.path || "",
          sha: item.sha || "",
          size: item.size || 0,
          url: item.url || "",
          type: item.type === "blob" ? "file" : "dir",
        }))
    } catch (error: any) {
      throw new Error(`Failed to fetch repository tree: ${error.message}`)
    }
  }

  // Get file content
  async getFileContent(owner: string, repo: string, path: string, branch?: string): Promise<string> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      })

      if (Array.isArray(data) || data.type !== "file") {
        throw new Error("Path is not a file")
      }

      // Decode base64 content
      return Buffer.from(data.content, "base64").toString("utf-8")
    } catch (error: any) {
      throw new Error(`Failed to fetch file content: ${error.message}`)
    }
  }
   async updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha?: string, // Required for updates
    branch?: string
  ): Promise<{ commit: string; content: { sha: string } }> {
    try {
      const { data } = await this.octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: Buffer.from(content).toString("base64"),
        sha, // Omit for new files
        branch,
      })

      return {
        commit: data.commit.sha!,
        content: { sha: data.content!.sha! },
      }
    } catch (error: any) {
      throw new Error(`Failed to update file: ${error.message}`)
    }
  }

    async createBranch(owner: string, repo: string, newBranch: string, fromBranch: string): Promise<void> {
    try {
      // Get the SHA of the branch to branch from
      const { data: ref } = await this.octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${fromBranch}`,
      })

      // Create new branch
      await this.octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${newBranch}`,
        sha: ref.object.sha,
      })
    } catch (error: any) {
      throw new Error(`Failed to create branch: ${error.message}`)
    }
  }

  

}
