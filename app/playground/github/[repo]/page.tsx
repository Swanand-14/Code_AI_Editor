import { Suspense } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import GitHubPlayground from "@/modules/github/components/github-playground"
import { Loader2 } from "lucide-react"

export default async function GitHubPlaygroundPage({
  params,
}: {
  params: { repo: string }
}) {
  const session = await auth()
  
  if (!session) {
    redirect("/auth/signin")
  }

  const repoFullName = decodeURIComponent(params.repo)

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <GitHubPlayground repoFullName={repoFullName} />
    </Suspense>
  )
}