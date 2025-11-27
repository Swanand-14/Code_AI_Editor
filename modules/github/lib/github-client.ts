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
      if (error.status === 422) {
      throw new Error(`Branch "${newBranch}" already exists`)
    } else if (error.status === 404) {
      throw new Error(`Branch "${fromBranch}" not found`)
    }
    throw new Error(`Failed to create branch: ${error.message}`)

     
    }
  }

  async pathExists(owner:string,repo:string,path:string,branch?:string):Promise<boolean>{
      try {
        await this.octokit.repos.getContent({
          owner,repo,path,ref:branch
        })
        return true
      } catch (error:any) {
        if(error.status === 404){
          return false
        }
        throw error
      }
  }

  async createFile(owner:string,repo:string,path:string,content:string,message:string,branch?:string):Promise<{commit:string,content:{sha:string}}>{
    try {
      const exists = await this.pathExists(owner,repo,path,branch)
      if(exists){
        throw new Error("File already exists")
      }

      const {data} = await this.octokit.repos.createOrUpdateFileContents({
        owner,repo,path,message,content:Buffer.from(content).toString("base64"),branch
      })

      return {
        commit:data.commit.sha!,
        content:{sha:data.content!.sha!}

      }
    } catch (error:any) {
      throw new Error(`Failed to create a file: ${error.message}`)
    }
  }

  async createDirectory(owner:string,repo:string,path:string,message:string,branch?:string):Promise<void>{
    try {
      const gitKeepPath = `${path}/.gitkeep`
      await this.octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path:gitKeepPath,
        message,
        content:Buffer.from("").toString("base64"),
        branch
      })
    } catch (error:any) {
      throw new Error(`Failed to create a directory: ${error.message}`)
    }
  }

  async deleteFile(
  owner: string,
  repo: string,
  path: string,
  message: string,
  sha: string,
  branch?: string
): Promise<void> {
  try {
    await this.octokit.repos.deleteFile({
      owner,
      repo,
      path,
      message,
      sha,
      branch,
    })
  } catch (error: any) {
    throw new Error(`Failed to delete file: ${error.message}`)
  }
}

async deleteMultipleFiles(owner:string,repo:string,files:{path:string,sha:string}[],message:string,branch?:string):Promise<void>{
  try {
    const {data:refData} = await this.octokit.git.getRef({owner,repo,ref:`heads/${branch || 'main'}`})
    const latestCommitSha = refData.object.sha
    const {data:commitData} = await this.octokit.git.getCommit({
      owner,repo,commit_sha:latestCommitSha
    })
    const baseTreeSha = commitData.tree.sha
    const {data:newTree} = await this.octokit.git.createTree({
      owner,repo,base_tree:baseTreeSha,
      tree:files.map(file=>({
        path:file.path,
        mode:'100644' as any,
        type:'blob' as any,
        sha:null
      }))
    })

    const {data:newCommit} = await this.octokit.git.createCommit({
      owner,repo,message,tree:newTree.sha,parents:[latestCommitSha],
    })

    await this.octokit.git.updateRef({
      owner,repo,
      ref:`heads/${branch||'main'}`,
      sha:newCommit.sha
    })
  } catch (error:any) {
    throw new Error(`Failed to delete multiple files : ${error.message}`)
  }
}

async createRepository(params:CreateRepoParams,files:FileToCommit[]){
  try {
    const {data:user} = await this.octokit.users.getAuthenticated()
    const {data:repo} = await this.octokit.repos.createForAuthenticatedUser({
      name:params.name,
      description:params.description,
      private:params.isPrivate,
      auto_init:true
    })
    await new Promise(resolve => setTimeout(resolve, 2000))


    let sha:string
    try {
      const {data:ref} = await this.octokit.git.getRef({
        owner:user.login,
        repo:repo.name,
        ref:"heads/main"
      })
      sha = ref.object.sha
    } catch{
      const readMeContent = params.initializeWithReadme?
      `#${params.name}\n\n${params.description || "No description provided"}`:"#Intial Commit"

      const {data:readmeBlob} = await this.octokit.git.createBlob({
        owner:user.login,
        repo:params.name,
        content:Buffer.from(readMeContent).toString("base64"),
        encoding:"base64"
      })

      const {data:initialTree} = await this.octokit.git.createTree({
        owner:user.login,
        repo:params.name,
        tree:[
          {
            path:"README.md",
            mode:"100644",
            type:"blob",
            sha:readmeBlob.sha
          }
        ]
      })

      const {data:InitialCommit} = await this.octokit.git.createCommit({
        owner:user.login,
        repo:params.name,
        message:"Initial commit",
        tree:initialTree.sha
      })

      await this.octokit.git.createRef({
        owner:user.login,
        repo:params.name,
        ref:"refs/heads/main",
        sha:InitialCommit.sha
      })

      sha = InitialCommit.sha

    }

    const blobs = await Promise.all(
      files.map(async(file)=>{
        const {data:blob} = await this.octokit.git.createBlob({
          owner:user.login,
          repo:params.name,
          content:Buffer.from(file.content).toString("base64"),
          encoding:"base64"
        })

        return {
          path:file.path,
          mode:"100644" as const,
          type:"blob" as const,
          sha:blob.sha
        }
      })
    )

    if(params.addGitIgnore){
      const gitIgnoreContent = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Environment variables
.env
.env.local
.env.*.local

# Build output
dist/
build/
out/
.next/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Testing
coverage/
.nyc_output/

# Temporary files
*.tmp
.cache/`

const {data:gitignoreBlob} = await this.octokit.git.createBlob({
  owner:user.login,
  repo:params.name,
  content:Buffer.from(gitIgnoreContent).toString("base64"),
  encoding:"base64"
})
blobs.push({
  path:".gitignore",
  mode:"100644",
  type:"blob",
  sha:gitignoreBlob.sha
})
    }

  const {data:newTree} = await this.octokit.git.createTree({
    owner:user.login,
    repo:params.name,
    base_tree:sha,
    tree:blobs
  })

  const {data:finalCommit} = await this.octokit.git.createCommit({
    owner:user.login,
    repo:params.name,
    message:"Add playground files",
    tree:newTree.sha,
    parents:[sha],
  })

  await this.octokit.git.updateRef({
    owner:user.login,
    repo:params.name,
    ref:"heads/main",
    sha:finalCommit.sha
  })

  await this.octokit.repos.get({
    owner:user.login,
    repo:repo.name
  })

  return {
    fullName:`${user.login}/${params.name}`,
    url:repo.html_url,
    owner:user.login,
    name:params.name,
    repoId:repo.id,
    defaultBranch:"main"
  }
  } catch (error:any) {
    throw new Error(`Failed to create repository: ${error.message}`)
    
  }
}


  

}




