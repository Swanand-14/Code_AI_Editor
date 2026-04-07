
import NextAuth from "next-auth"
import authConfig from "./auth.config"
import { getUserById } from "./modules/auth/actions"
import { prisma } from "@/lib/db"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { UserRole } from "@prisma/client"


export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async jwt({ token, user, account }) {
      // First sign in — user and account are available
      if (user) {
        token.sub = user.id  // ← use database ID directly
        token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub
        session.user.role = token.role as UserRole
      }
      return session
    },
    async signIn({ user, account, profile }) {
      console.log("✅ SignIn:", user?.email, account?.provider)
      return true
    }
  },
  ...authConfig
})
