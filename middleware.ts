// import { NextRequest, NextResponse } from "next/server";
// import { getToken } from "next-auth/jwt";
// import { auth } from "./auth";
// import {
//   DEFAULT_LOGIN_REDIRECT,
//   authRoutes,
//   publicRoutes,
//   apiAuthPrefix,
// } from "@/routes";

// export async function middleware(req: NextRequest) {
//   const { nextUrl } = req;

//   // Always let NextAuth API routes through
//   if (nextUrl.pathname.startsWith(apiAuthPrefix)) {
//     return NextResponse.next();
//   }

  

//   const isLoggedIn = !!req.auth;
//   const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
//   const isAuthRoute = authRoutes.includes(nextUrl.pathname);

//   // If on an auth route (sign-in/sign-up) and already logged in → go to dashboard
//   if (isAuthRoute) {
//     if (isLoggedIn) {
//       return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
//     }
//     return NextResponse.next();
//   }

//   // If trying to access a protected route without being logged in → sign-in
//   if (!isLoggedIn && !isPublicRoute) {
//     const signInUrl = new URL("/auth/sign-in", nextUrl);
//     // Preserve the intended destination so we can redirect back after login
//     signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
//     return NextResponse.redirect(signInUrl);
//   }

//   return NextResponse.next();
// }

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import {
  DEFAULT_LOGIN_REDIRECT,
  authRoutes,
  publicRoutes,
  apiAuthPrefix,
} from "@/routes";

export default auth((req) => {
  const { nextUrl } = req;

  const isLoggedIn = !!req.auth;
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
  const isAuthRoute = authRoutes.includes(nextUrl.pathname);

  if (nextUrl.pathname.startsWith(apiAuthPrefix)) {
    return NextResponse.next();
  }

  // Already logged in → block auth pages
  if (isAuthRoute) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
    }
    return NextResponse.next();
  }

  // Not logged in → block protected routes
  if (!isLoggedIn && !isPublicRoute) {
    const signInUrl = new URL("/auth/sign-in", nextUrl);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and images
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};