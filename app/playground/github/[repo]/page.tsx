import { Suspense } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { notFound } from "next/navigation"
import GitHubPlayground from "@/modules/github/components/github-playground"
import { Loader2 } from "lucide-react"

export default async function GitHubPlaygroundPage({
  params,
}: {
  params:Promise<{ repo: string }>
}) {
  const session = await auth()
  
  if (!session) {
    redirect("/auth/signin")
  }
  const resolvedParams = await params
  const repoFullName = decodeURIComponent(resolvedParams.repo)

  if (!repoFullName.includes("/")) {
    notFound()
  }

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