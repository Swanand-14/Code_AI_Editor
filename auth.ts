
import NextAuth from "next-auth"
import authConfig from "./auth.config"
import { getUserById } from "./modules/auth/actions"
import { prisma } from "@/lib/db"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { UserRole } from "@prisma/client"

// export const { handlers, signIn, signOut, auth } = NextAuth({
//   callbacks: {
//     async signIn({ user, account }) {
//       // Allow all sign-ins
//       return true
//     },
    
//     async jwt({ token }) {
//       if (!token.sub) return token
      
//       try {
//         const existingUser = await prisma.user.findUnique({
//       where: { email: token.email! }
//     })
//         if (!existingUser) {
//           return token
//         }
        
//          token.sub = existingUser.id
//         token.name = existingUser.name
//         token.email = existingUser.email
//         token.role = existingUser.role
//       } catch (error) {
//         console.error("Error fetching user in JWT callback:", error)
//         return token
//         // Continue with token as-is if database fetch fails

//       }
      
//       return token
//     },
    
//     async session({ session, token }) {
//       console.log("Session callback - token:", JSON.stringify(token))
//       if (token.sub && session.user) {
//         session.user.id = token.sub
//       }
//       if (token.role && session.user) {
//         session.user.role = token.role as string
//       }
//       return session
//     }
//   },
//   secret: process.env.AUTH_SECRET,
//   session: {
//     strategy: "jwt",
//     maxAge: 30 * 24 * 60 * 60, // 30 days
//   },
//   ...authConfig
// })

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
