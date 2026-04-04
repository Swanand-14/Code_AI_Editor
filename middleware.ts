// import NextAuth from "next-auth";
// import {
// DEFAULT_LOGIN_REDIRECT,
// authRoutes,
// publicRoutes,protectedRoutes,
// apiAuthPrefix
// } from "@/routes"
// import authConfig from "./auth.config";
// const {auth} = NextAuth(authConfig)

// export default auth((req)=>{
//     const {nextUrl} = req;
//     const isLoggedIn = !!req.auth
//     const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix);
//     const isPublicRoutes = publicRoutes.includes(nextUrl.pathname)
//     const isAuthRoute = authRoutes.includes(nextUrl.pathname)
//     console.log({ 
//     path: nextUrl.pathname, 
//     isLoggedIn, 
//     isAuthRoute, 
//     isPublicRoutes 
//   });

//     if(isApiAuthRoute){
//         return null;
//     }
//     if(isAuthRoute){
//         if(isLoggedIn){
//             return Response.redirect(new URL(DEFAULT_LOGIN_REDIRECT,nextUrl));
//         }
//         return null;
//     }
//     if(!isLoggedIn && !isPublicRoutes){
//         return Response.redirect(new URL("/auth/sign-in",nextUrl))
//     }
//     return null;
// });

// export const config = {
//     matcher:["/((?!api|_next/static|_next/image|favicon.ico).*)",]
// }

import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_LOGIN_REDIRECT,
  authRoutes,
  publicRoutes,
  apiAuthPrefix
} from "@/routes";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;

  const token = await getToken({ 
    req, 
    secret: process.env.AUTH_SECRET 
  });

  const isLoggedIn = !!token;
  const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix);
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
  const isAuthRoute = authRoutes.includes(nextUrl.pathname);

  if (isApiAuthRoute) return null;

  if (isAuthRoute) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
    }
    return null;
  }

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/auth/sign-in", nextUrl));
  }

  return null;
}


export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)",]
}