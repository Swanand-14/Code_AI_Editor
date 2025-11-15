import { auth } from "@/auth"
import { prisma } from "@/lib/db"

export async function getGitHubToken(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null

  // Fetch the GitHub account for this user
  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "github",
    },
    select: {
      access_token: true,
    },
  })

  return account?.access_token || null
}

export async function requireGitHubToken(): Promise<string> {
  const token = await getGitHubToken()
  if (!token) {
    throw new Error("GitHub not connected. Please sign in with GitHub.")
  }
  return token
}