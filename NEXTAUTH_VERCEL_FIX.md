# NextAuth v5 + Vercel Setup Guide

## Changes Made

### 1. **Removed PrismaAdapter** (`auth.ts`)
- **Why**: PrismaAdapter is designed for database session persistence, but you're using JWT-only strategy. This causes Prisma to create database connections on every authentication callback, which fails in Vercel's serverless environment.
- **Solution**: Switched to pure JWT strategy without the adapter. You can still access your database in callbacks (like `getUserById`), but only when needed.

### 2. **Added Error Handling in JWT Callback** (`auth.ts`)
- Wrapped `getUserById` in a try-catch block to prevent route crashes if database queries fail.
- The JWT callback is called on every request, so it must be resilient.

### 3. **Added Explicit URL Configuration** (`auth.config.ts`)
- Added `basePath: "/api/auth"` - explicitly tells NextAuth where the auth handlers are
- Added `baseUrl` - reads from `AUTH_URL` first (Vercel), falls back to `NEXTAUTH_URL`, then localhost
- This ensures Vercel correctly routes callbacks to `/api/auth/callback/google`, etc.

### 4. **Enhanced Route Handler** (`app/api/auth/[...nextauth]/route.ts`)
- Added `export const maxDuration = 60` - increases timeout for Vercel Functions (standard is 10s, production is up to 60s)
- This prevents timeouts if database queries take a moment

---

## Vercel Environment Variables (CRITICAL)

You **MUST** set these in your Vercel project settings:

### Required:
```
AUTH_SECRET=<32+ char random string>
AUTH_URL=https://codeforge.vercel.app  # Your actual domain, NO /api/auth
NEXTAUTH_URL=https://codeforge.vercel.app

GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>

GITHUB_ID=<your-github-app-id>
GITHUB_SECRET=<your-github-app-secret>
```

### Database (if you use it):
```
DATABASE_URL=<your-database-url>
```

### Important Notes:
- `AUTH_URL` should be **just the domain**, NOT including `/api/auth`
- Both `AUTH_URL` and `NEXTAUTH_URL` should point to your production domain on Vercel
- `AUTH_SECRET` must be the same value locally and on Vercel

---

## Local Development `.env` Example

```
# Based on your setup
AUTH_SECRET=your-secret-key-min-32-chars
NEXTAUTH_URL=http://localhost:3000
AUTH_URL=http://localhost:3000

GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

GITHUB_ID=xxx
GITHUB_SECRET=xxx

DATABASE_URL=your-database-url  # if using database
```

---

## Testing After Deployment

1. **Clear Browser Storage**: Delete cookies and local storage for your domain
2. **Test `/api/auth/providers`**:
   ```
   curl https://codeforge.vercel.app/api/auth/providers
   ```
   Should return JSON with "github" and "google" providers

3. **Test OAuth Flow**:
   - Click sign-in, try Google/GitHub OAuth
   - Check Vercel Function Logs for any errors:
     - Go to Vercel Dashboard → Project → Deployments → Function Logs

4. **Common Errors**:
   - **"Missing NEXTAUTH_SECRET"** → Not set in Vercel env vars
   - **"Invalid origin"** → AUTH_URL doesn't match your domain
   - **"Invalid client ID"** → Verify Google/GitHub credentials are correct

---

## Why Build Succeeded But Routes 404ed (Root Cause)

1. **Build Time**: NextAuth v5 route is built as `/api/auth/[...nextauth]` ✓
2. **Runtime (Vercel)**:
   - PrismaAdapter tried to instantiate on every request
   - Prisma connection pooling exhausted in serverless
   - Handler never executed, returned 404
   - Locally worked because persistent Node process reuses connections

---

## If You Still Get 404s

1. **Verify the route file exists**:
   ```bash
   git ls-files | grep api/auth
   ```
   Should show `app/api/auth/[...nextauth]/route.ts`

2. **Check Vercel function logs**:
   - Deployment might have failed silently
   - Look for build errors in deployment logs

3. **Clear Vercel cache**:
   - Vercel Dashboard → Settings → Git → Clear build cache
   - Redeploy

4. **Verify environment variables**:
   - Go to Vercel Dashboard → Project → Settings → Environment Variables
   - Ensure `AUTH_URL` and `AUTH_SECRET` are set
   - Redeploy after adding/changing env vars

---

## NextAuth v5 + Vercel Best Practices

✅ **DO**:
- Use JWT strategy for stateless authentication (perfect for serverless)
- Keep database queries in callbacks minimal
- Set explicit `AUTH_URL` for production

❌ **DON'T**:
- Mix PrismaAdapter with JWT-only strategy
- Do heavy database operations in JWT callback (called on every request)
- Forget to set `AUTH_URL` on Vercel

