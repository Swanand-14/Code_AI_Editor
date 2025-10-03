// import NextAuth from "next-auth"
// import {PrismaAdapter} from '@auth/prisma-adapter'
// import { prisma } from "./lib/db"
// import authConfig from "./auth.config"
// import { getUserById } from "./modules/auth/actions"
 
// export const { handlers, signIn, signOut, auth } = NextAuth({
//   callbacks:{
//    async signIn({user,account}){
    

//     return true;
//    },
//    async jwt({token}){
//     if(!token.sub)return token;
//     const existingUser = await getUserById(token.sub);
//     if(!existingUser){
//         return token;
//     }
//     token.name = existingUser.name;
//     token.email = existingUser.email;
//     token.role = existingUser.role
//     return token;
    
//    },
//    async session({session,token}){
//     if(token.sub && session.user){
//         session.user.id = token.sub
//     }
//     if(token.sub && session.user){
//         session.user.role = token.role
//     }
//     return session
//    }
//   },
//   secret:process.env.AUTH_SECRET,
//   adapter:PrismaAdapter(prisma),
//   ...authConfig
  
// })
import NextAuth from "next-auth"
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from "./lib/db"
import authConfig from "./auth.config"
import { getUserById } from "./modules/auth/actions"

export const { handlers, signIn, signOut, auth } = NextAuth({
  callbacks: {
    async signIn({ user, account }) {
      // Allow all sign-ins
      return true
    },
    
    async jwt({ token }) {
      if (!token.sub) return token
      
      const existingUser = await getUserById(token.sub)
      if (!existingUser) {
        return token
      }
      
      token.name = existingUser.name
      token.email = existingUser.email
      token.role = existingUser.role
      return token
    },
    
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub
      }
      if (token.role && session.user) {
        session.user.role = token.role as string
      }
      return session
    }
  },
  secret: process.env.AUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt" // Use JWT strategy for better compatibility
  },
  ...authConfig
})