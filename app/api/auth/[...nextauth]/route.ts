
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
//export const maxDuration = 60 // Increase timeout for Vercel

import { handlers } from "@/auth"

// Export NextAuth handlers
export const { GET, POST } = handlers