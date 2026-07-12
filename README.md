# CodeForge — Browser-Based Collaborative IDE

> A full-stack collaborative code editor that runs Node.js projects directly in the browser, with real-time multi-user editing, live cursor synchronization, and GitHub repository integration.

---

## Demo

### 📹 Demo Video
> *Coming soon — video demonstrating:*
> - Host creating a collaboration session
> - Guest joining and workspace snapshot initialization
> - Real-time cursor synchronization across users
> - File and folder CRUD synchronization
> - Recursive folder rename propagation
> - File deletion across all participants
> - WebContainer filesystem synchronization

### 🎞️ Demo GIF
> *Coming soon*

---

## Screenshots

| Landing Page | Editor |
|---|---|
| ![Landing](.github/screenshots/landing.png) | ![Editor](.github/screenshots/editor.png) |

| Collaboration | Terminal |
|---|---|
| ![Collaboration](.github/screenshots/collab.png) | ![Terminal](.github/screenshots/terminal.png) |

| GitHub Integration |
|---|
| ![GitHub](.github/screenshots/github.png) |

---

## Features

### Core IDE
- **Browser-based execution** — runs Node.js, React, Vue, Next.js, Svelte projects entirely in the browser via WebContainers (no server-side compute)
- **Integrated terminal** — full shell access inside the browser with hot-reload support
- **Monaco editor** — the same editor that powers VS Code, with syntax highlighting, language detection, and keyboard shortcuts
- **Project templates** — pre-configured starter templates for common frameworks
- **Autosave** — debounced autosave syncs editor state to the database periodically, with `beforeunload` safety net

### Real-Time Collaboration
- **Multi-user editing** — multiple users edit the same file simultaneously with full content synchronization
- **Live cursor synchronization** — remote cursors rendered as Monaco content widgets with per-user color assignment and 6-second stale cursor cleanup
- **Proximity warnings** — visual glyph indicators when collaborators are editing near the same lines
- **Presence panel** — shows active participants, their current file, and a live activity log
- **Follow mode** — follow another user's cursor across files in real time (Escape to stop)
- **Host-guest model** — session host controls the WebContainer runtime; guests sync through the host

### File System Synchronization
- **Full CRUD sync** — file and folder create, delete, and rename operations propagate to all participants in real time
- **Recursive folder rename** — renaming a folder correctly propagates path updates for all nested files and folders across every participant's file tree and WebContainer filesystem
- **FileWatcher** — polling-based WebContainer filesystem watcher (2s interval) detects terminal-driven changes (e.g. `touch`, `rm`, `mv`) and syncs them back to the UI and all participants
- **Duplicate prevention** — `manuallyCreatedFilesRef` guards against the FileWatcher double-firing on UI-triggered operations
- **WebContainer filesystem consistency** — structural operations (rename/delete/create) are applied to each participant's local WebContainer instance after receiving socket events

### GitHub Integration
- **Repository import** — load any GitHub repository directly into the editor with full file tree and content
- **Branch-aware workspace** — each branch maintains independent file state, open tabs, and change tracking
- **Staged changes** — modified, created, and deleted files are tracked separately for commit
- **Direct commits** — commit changes directly to GitHub from the editor with a commit message
- **Source control panel** — view diffs, stage files selectively, and discard individual file changes
- **Diff viewer** — inline diff view showing original vs modified content before committing

### Authentication & Sessions
- **NextAuth v5** — GitHub and Google OAuth with session management
- **Collaboration sessions** — shareable session links with expiry, host presence validation, and guest blocking until host joins
- **Multi-tab support** — a single user opening multiple tabs is handled correctly; "left session" only fires when all tabs are closed

---

## Tech Stack

| Category | Technologies |
|---|---|
| **Frontend** | Next.js 15, React 19, TypeScript, Monaco Editor |
| **Backend** | Next.js API Routes, Custom Node.js HTTP Server |
| **Collaboration** | Socket.IO (WebSockets) |
| **Runtime** | WebContainers API (@webcontainer/api) |
| **Authentication** | NextAuth v5 (GitHub OAuth, Google OAuth) |
| **Database** | MongoDB Atlas, Prisma ORM |
| **GitHub API** | Octokit REST |
| **State Management** | Zustand |
| **Caching / Queues** | Upstash Redis |
| **File Storage** | Vercel Blob |
| **AI** | Google Gemini API |
| **Styling** | Tailwind CSS, shadcn/ui |
| **Testing** | Vitest, Playwright |
| **CI/CD** | GitHub Actions, Docker |

---

## Architecture Overview

```
Browser
  │
  ├── Next.js 15 (App Router)
  │     ├── Server Components — page rendering, auth
  │     ├── API Routes — workspace CRUD, GitHub operations
  │     └── Custom HTTP Server — hosts both Next.js and Socket.IO on one port
  │
  ├── Socket.IO (WebSocket layer)
  │     ├── Editor change events (cursor:move, editor:change)
  │     ├── File action events (file:action — create/delete/rename)
  │     ├── Presence events (collab:join, collab:user-left)
  │     ├── WebContainer state sync (webcontainer:server-ready, webcontainer:terminal)
  │     └── Workspace snapshots (workspace:snapshot-requested/snapshot)
  │
  ├── WebContainers API
  │     ├── Node.js runtime running inside the browser (WASM-based)
  │     ├── Full filesystem access (fs.readFile, fs.writeFile, fs.rm, fs.mkdir)
  │     ├── Process spawning (npm install, dev server)
  │     └── Server-ready events → preview iframe URL
  │
  ├── GitHub API (Octokit)
  │     ├── Repository tree fetching
  │     ├── File content retrieval
  │     └── Direct commits (blob → tree → commit chain)
  │
  └── MongoDB Atlas (via Prisma)
        ├── User accounts and sessions
        ├── Playground workspaces and template data
        ├── Collaboration sessions and participants
        └── Workspace drafts (uncommitted change persistence)
```

### Key Architectural Decision — One Port, Two Protocols

Socket.IO is attached directly to the same Node.js HTTP server that serves Next.js. HTTP requests go to Next.js; WebSocket upgrade requests are intercepted by Socket.IO — both on port 3000. This avoids CORS complexity and works cleanly with Next.js's custom server mode.

```typescript
// server.ts
const httpServer = createServer(async (req, res) => {
  await handle(req, res, parsedUrl); // Next.js handles HTTP
});
const io = initSocketServer(httpServer); // Socket.IO handles WS upgrades
httpServer.listen(3000);
```

---

## Collaboration Workflow

### 1. Session Initialization

The host creates a session linked to a playground or GitHub repository. A shareable session ID is generated and stored in MongoDB. Guests cannot join until the host's socket is present in the room — this is enforced on the server before `socket.join()` is called.

```
Host joins → socket.join(sessionId) → room exists
Guest joins → server checks room for host socket → allowed or blocked
```

### 2. Workspace Snapshot (GitHub Collab)

When a guest joins a GitHub collab session, the clean GitHub tree is fetched first (committed state). The host then sends a snapshot of their current workspace — including modified, created, and deleted file sets — directly to the joining guest's socket. The guest applies this snapshot on top of the clean tree, arriving at the exact same state as the host.

```
Guest joins
  → fetch clean GitHub tree
  → request snapshot from host (via server relay)
  → host sends { files, modifiedFiles, createdFiles, deletedFiles }
  → guest applies snapshot → workspace matches host ✅
```

If the host is offline, the guest falls back to the clean GitHub tree with an 8-second timeout.

### 3. Editor Synchronization

Every keystroke emits a full-content `editor:change` event (Phase 1 — no operational transforms). The server broadcasts to all other participants in the session room. Receivers apply the new content to their local state and WebContainer filesystem simultaneously.

```
User types → emitEditorChange() → server → all others
  → updateFileContent() (Zustand)
  → webContainerInstance.fs.writeFile() (hot reload)
```

A `isRemoteChange` ref prevents Monaco's `onDidChangeCursorPosition` from emitting back to the server when content is being applied from a remote source.

### 4. Cursor Synchronization

Cursor positions are debounced at 100ms and emitted as `cursor:move` events. The server rebroadcasts them as `collab:remote-cursor` (intentionally different event name — `cursor:move` is client→server only). Remote cursors are rendered as Monaco `IContentWidget` instances with per-user color assignment (8 colors, assigned by arrival order). Stale cursors are removed after 6 seconds of inactivity.

### 5. File Tree Synchronization

All structural file operations (create, delete, rename) are broadcast as `file:action` events with an `isFolder` flag to distinguish file vs folder operations. Recipients update their local Zustand store and WebContainer filesystem independently.

For **folder renames**, each nested file's path is updated individually. The old folder entry (`type: "dir"`) is removed and a new one is added. Recipients apply a recursive copy-then-delete on their WebContainer filesystem since WebContainers have no native rename API.

### 6. WebContainer Consistency (Normal Collab)

In normal collab, only the host runs a WebContainer instance. Guests sync file content to the host's WebContainer via `webcontainer:file-sync` socket events (server relays directly to host's socket ID). Structural operations received from guests are applied to the host's WebContainer in a `handleRemoteFileAction` handler, using refs to avoid stale closure issues with the WebContainer instance.

```typescript
// Stale closure fix — instance read at call time, not at closure creation time
const webContainerRef = useRef(webContainer);
useEffect(() => { webContainerRef.current = webContainer; }, [webContainer]);
```

### 7. WebContainer Consistency (GitHub Collab)

In GitHub collab, every participant runs their own WebContainer instance. When a file action is received, each user applies the change to their own local WebContainer filesystem directly — no relay through the host. This means zero latency for preview updates.

### 8. Multi-Tab Handling

Each socket connection has a unique ID. A user opening multiple tabs creates multiple socket connections but maps to a single participant entry in the server's `sessionParticipants` Map. The Map stores `socketIds` as a `Set`. The "user left" event only fires when the Set becomes empty — i.e., all tabs are closed.

### 9. Terminal-Driven File Changes (FileWatcher)

A polling-based FileWatcher (2-second interval) monitors the WebContainer filesystem for changes made via the terminal (e.g. `touch`, `rm`, `mv`). It compares current vs known filesystem state and fires callbacks for created, deleted, and renamed files/folders.

Rename detection matches a deleted file with a newly created file by comparing content. Folder rename detection matches by same parent directory and identical set of child filenames.

A `manuallyCreatedFilesRef` Set prevents double-firing when the UI triggers an operation that also changes the WebContainer filesystem — the watcher sees the change but ignores it because the path is in the ref.

---

## Engineering Challenges

### 1. Stale Closure — WebContainer Instance Not Available at Handler Registration

Socket event handlers are registered once when the socket connects. At that point, the WebContainer instance is `null` (still initializing). When a file action arrives later, the handler reads the stale `null` from its closure and skips the WebContainer sync.

**Solution:** A `useRef` is kept in sync with the latest WebContainer object via a separate `useEffect`. The handler reads from the ref at call time, not from the closure — always getting the current instance regardless of when the handler was registered.

### 2. Recursive Folder Rename Across All Participants

Renaming a folder requires updating every nested file's path in Zustand, removing the old folder entry, adding a new one, and performing a recursive copy-then-delete on the WebContainer filesystem (no native rename API). All of this must propagate correctly to every participant.

**Solution:** The sender broadcasts a single `file:action` rename event with `isFolder: true`. Recipients identify all files under the old path, update each one, manage folder entries explicitly, and apply the recursive WebContainer copy. An `isFolder` flag in the payload distinguishes folder operations from file operations without requiring separate event types.

### 3. FileWatcher Double-Firing

When the UI creates a file (e.g. via the file tree), it writes to the WebContainer filesystem. The FileWatcher detects this change and tries to create the file again — causing a duplicate tree entry.

**Solution:** Before any UI-triggered file operation, the target path is added to a `manuallyCreatedFilesRef` Set with a 3-second TTL. The FileWatcher checks this Set before processing any detected change and skips paths that the UI already handled. For folder renames, all nested paths are tracked recursively.

### 4. FileWatcher Event Priority — Rename vs Delete+Create

A terminal folder rename (`mv a/ b/`) appears to the FileWatcher as: folder `a/` deleted, folder `b/` created, and all nested files deleted/created. Processing deletions before renames would incorrectly remove files from the tree before the rename is detected.

**Solution:** The detection order inside `checkForChanges` is strictly: (1) folder renames, (2) file renames, (3) deletions, (4) creations. Each step operates on mutable arrays. Once a rename is detected, the involved paths are spliced out of those arrays so subsequent steps never see them.

### 5. Guest Workspace Initialization

When a guest joins mid-session on a GitHub collab, the clean GitHub tree (committed state) doesn't reflect the host's uncommitted changes. The guest would be out of sync from the start.

**Solution:** Guests request a snapshot from the host immediately after joining. The host serializes their current Zustand workspace state (including `modifiedFiles`, `createdFiles`, `deletedFiles`, and file contents from open tabs) and sends it directly to the guest's socket. The guest applies the snapshot on top of the clean tree, arriving at the exact same working state as the host. An 8-second timeout with GitHub fallback handles the case where the host is unreachable.

### 6. Discard Propagation — Restoring vs Creating

When a host discards a folder rename (reverting `Pages1/` back to `Pages/`), it broadcasts file deletions for the new paths and file restores for the old paths. Guests must distinguish between "a new file was created" (mark as `A`) and "an original GitHub file was restored" (remove `D` marker, show as clean).

**Solution:** A `broadcastFileRestore` function sends `isRestore: true` and the original `sha` in the payload. The receiving `handleRemoteFileAction` checks this flag — restores call `addFileToTree` with the real sha and `unmarkFileDeleted`, rather than `markFileCreated`. A new `unmarkFileDeleted` action was added to the Zustand store to handle this case cleanly.

### 7. Triple Socket Connection Per User

Each major component (`CollabPlayground`, `CollabEditor`, `useCollabWebContainer`) was independently calling `useCollabSocket`, creating three simultaneous WebSocket connections per user — tripling server load and causing duplicate event handling.

**Solution:** `CollabPlayground` owns the single socket instance and passes it down via props. Child components receive the socket as a prop rather than creating their own connections.

### 8. Preventing Ghost Cursors

Remote cursors rendered in Monaco persist indefinitely if the user stops moving but stays connected (e.g. switches to another application). This leaves stale cursor decorations in other users' editors.

**Solution:** Every incoming `collab:remote-cursor` event resets a per-user `setTimeout` of 6 seconds. If no new cursor event arrives within that window, the cursor is removed from the Map and Monaco decorations are cleaned up. On disconnect, the cursor is removed immediately via the `collab:user-left` handler.

---

## Folder Structure

```
.
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth pages
│   ├── playground/               # Solo playground routes
│   │   └── [id]/
│   ├── collab/                   # Collaboration routes
│   │   └── [sessionId]/
│   └── api/                      # API routes
│
├── modules/
│   ├── auth/                     # NextAuth config, actions
│   ├── playground/
│   │   ├── components/           # Editor, file tree, loader
│   │   ├── hooks/
│   │   │   ├── useFileExplorer.ts    # Zustand store — file tree + CRUD
│   │   │   ├── usePlayground.ts
│   │   │   └── useAiSuggestions.ts
│   │   └── lib/                  # Path utilities, file ID generation
│   │
│   ├── collaboration/
│   │   ├── components/           # CollabPlayground, CollabEditor, ParticipantsPanel
│   │   ├── hooks/
│   │   │   ├── useCollabSocket.ts        # WebSocket connection + emit helpers
│   │   │   ├── useCollabParticipants.ts  # Participant list + activity logs
│   │   │   ├── useCollabWorkspace.ts     # GitHub collab file sync
│   │   │   ├── useRemoteCursors.ts       # Remote cursor state + cleanup
│   │   │   └── useProximityWarnings.ts   # Proximity glyph warnings
│   │   └── workspaces/           # Collab workspace DB actions
│   │
│   ├── github/
│   │   ├── actions/              # fetchRepositoryTree, commitAllChanges
│   │   ├── components/           # GitHubFileTree, SourceControlPanel, DiffViewer
│   │   └── hooks/
│   │       ├── Usegitworkspace.ts    # Zustand store — GitHub file state
│   │       ├── useRestoreDraft.ts
│   │       └── useWorkspaceAutoSave.ts
│   │
│   └── webContainers/
│       ├── services/
│       │   ├── webContainer-services.ts  # Singleton WebContainer instance
│       │   └── fileWatcher.ts            # Polling-based filesystem watcher
│       ├── hooks/
│       │   ├── useWebContainer.ts            # Solo playground WC hook
│       │   ├── useCollabWebContainer.ts      # Collab WC hook (host/guest split)
│       │   └── useWebContainerForGithub.ts   # GitHub collab WC hook
│       └── components/
│           ├── WebContainerPreview.tsx   # Preview iframe + terminal layout
│           └── terminal.tsx              # xterm.js terminal component
│
├── lib/
│   ├── db.ts                     # Prisma client singleton
│   └── socket/
│       └── server.ts             # Socket.IO server — all event handlers
│
├── prisma/
│   └── schema.prisma
│
├── server.ts                     # Custom Node.js HTTP server entry point
│
└── __tests__/                    # Vitest unit tests
    ├── useFileExplorer.test.ts
    ├── useGitWorkspace.test.ts
    └── collab/
```

---

## Installation

### Prerequisites

- Node.js 20+
- MongoDB Atlas account
- GitHub OAuth App
- Google OAuth credentials (optional)

### Setup

```bash
# Clone the repository
git clone https://github.com/Swanand-14/Code_AI_Editor.git
cd Code_AI_Editor

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Fill in required values (see Environment Variables section)

# Push database schema
npx prisma db push

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`.

> **Note:** WebContainers require specific HTTP headers (`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`). These are configured automatically in `next.config.js`.

---

## Environment Variables

```env
# Database
DATABASE_URL=mongodb+srv://...

# NextAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_ACCESS_TOKEN=          # Personal access token for GitHub API operations

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Upstash Redis (rate limiting / caching)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Vercel Blob (file storage)
BLOB_READ_WRITE_TOKEN=

# Gemini API (AI suggestions)
GEMINI_API_KEY=
```

---

## Testing

```bash
# Unit tests (Vitest)
npm run test

# End-to-end tests (Playwright)
npm run test:e2e
```

Unit tests cover:
- `useFileExplorer` Zustand store — all CRUD operations and edge cases
- `useGitWorkspace` Zustand store — branch switching, change tracking, discard logic
- Socket.IO collaboration logic — using a shared `fakeSocket` EventEmitter utility
- GitHub Integration Module — Octokit operations with mocked responses

E2E tests cover:
- Multi-user Socket.IO sync (WebContainer boot + file sync smoke tests)
- Authentication flow via GitHub OAuth with `storageState` cookie capture

---

## Future Improvements

- **CRDT / Operational Transforms** — replace full-content sync with delta-based conflict resolution (e.g. Yjs) to handle concurrent edits correctly
- **Shared terminal** — broadcast terminal I/O so all participants see the same shell session, not just terminal output
- **Voice collaboration** — WebRTC-based voice channels tied to collaboration sessions
- **Collaborative debugging** — shared breakpoints and step-through debugging via the Chrome DevTools Protocol
- **Deployment from editor** — one-click deploy to Vercel or Railway directly from the session
- **Persistent terminal history** — replay full terminal history for late-joining users beyond the current 1000-line server-side buffer
- **Granular presence** — show which specific line each collaborator is viewing, not just which file
- **Session recording** — record and replay collaboration sessions for async code review

---

## License

MIT License

Copyright (c) 2025 Swanand

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
