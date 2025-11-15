"use client"
import React, { useEffect, useState } from "react"
import { fetchUserRepositories, linkRepositoryToUser } from "../actions"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { Search, GitBranch, Lock, Globe, Loader2, AlertCircle } from "lucide-react"
import { signIn } from "next-auth/react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface Repository {
  id: number
  name: string
  full_name: string
  description: string | null
  private: boolean
  default_branch: string
  updated_at: string
}

export function RepositoryBrowser() {
  const [repos, setRepos] = useState<Repository[]>([])
  const [filteredRepos, setFilteredRepos] = useState<Repository[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [linkingRepo, setLinkingRepo] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    loadRepositories()
  }, [])

  useEffect(() => {
    if (searchTerm) {
      setFilteredRepos(
        repos.filter(
          (repo) =>
            repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            repo.description?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    } else {
      setFilteredRepos(repos)
    }
  }, [searchTerm, repos])

  async function loadRepositories() {
    setIsLoading(true)
    setError(null)
    
    const result = await fetchUserRepositories()
    
    if (result.success) {
      setRepos(result.data)
      setFilteredRepos(result.data)
    } else {
      setError(result.error || "Failed to load repositories")
      
      // Check if error is about GitHub not being connected
      if (result.error?.includes("GitHub not connected") || result.error?.includes("not connected")) {
        // Don't show toast here, we'll show the alert in UI
      } else {
        toast.error(result.error || "Failed to load repositories")
      }
    }
    
    setIsLoading(false)
  }

  async function handleOpenRepository(repo: Repository) {
    setLinkingRepo(repo.id)
    const result = await linkRepositoryToUser(repo.full_name, repo.id, repo.default_branch)
    
    if (result.success) {
      toast.success(`Opened ${repo.name}`)
      router.push(`/playground/github/${encodeURIComponent(repo.full_name)}`)
    } else {
      toast.error(result.error || "Failed to open repository")
    }
    
    setLinkingRepo(null)
  }

  async function handleConnectGitHub() {
    await signIn("github", { 
      callbackUrl: window.location.pathname 
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  // Show GitHub connection prompt if not connected
  if (error && (error.includes("GitHub not connected") || error.includes("not connected"))) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Connect your GitHub account to access your repositories
          </AlertDescription>
        </Alert>
        <Button onClick={handleConnectGitHub} size="lg">
          <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
          </svg>
          Connect GitHub Account
        </Button>
      </div>
    )
  }

  // Show other errors
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={loadRepositories} variant="outline">
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search repositories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
      </div>

      <div className="grid gap-4">
        {filteredRepos.map((repo) => (
          <Card key={repo.id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{repo.name}</h3>
                  {repo.private ? (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {repo.description && (
                  <p className="text-sm text-muted-foreground">{repo.description}</p>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  <span>{repo.default_branch}</span>
                  <span>•</span>
                  <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                </div>
              </div>

              <Button
                onClick={() => handleOpenRepository(repo)}
                disabled={linkingRepo === repo.id}
                size="sm"
              >
                {linkingRepo === repo.id ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Opening...
                  </>
                ) : (
                  "Open"
                )}
              </Button>
            </div>
          </Card>
        ))}

        {filteredRepos.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No repositories found</p>
            {searchTerm && <p className="text-sm mt-2">Try a different search term</p>}
          </div>
        )}
      </div>
    </div>
  )
}