# Hot Reload Debugging Guide

## What Should Happen When You Type

1. **Editor detects change** → `onContentChange` callback fires
2. **UI updates immediately** → Editor shows your typed content (React state)
3. **WebContainer sync starts** → File is written to WebContainer filesystem
4. **File sync queued** → Change is also queued for debounced database save (500ms)
5. **Preview updates** → WebContainer hot-reload picks up the file change

## How to Debug

### Step 1: Open Browser Console
- Press `F12` or right-click → "Inspect"
- Go to "Console" tab
- Keep this open while editing files

### Step 2: Type in Editor
Start typing in the active file and watch the console for these logs:

#### Expected Log Sequence:
```
🔄 handleContentChange called with value length: 5
📄 Active file: {filename: "page", extension: "tsx", path: "login", id: "..."}
✏️ Updated UI for file [fileId]
🔍 File path resolution: {resolved: "login/page.tsx", fileName: "page", fileExt: "tsx", filePath: "login"}
📝 Starting sync for: login/page.tsx
⏳ Queued login/page.tsx for debounced database sync (500ms)
🚀 Writing login/page.tsx IMMEDIATELY to WebContainer for hot reload
💾 writeFile called for: login/page.tsx (content length: 5)
📁 Creating directory: login
✍️ Writing file: login/page.tsx
✅ Successfully wrote login/page.tsx to WebContainer filesystem
```

### Step 3: What Each Log Means

| Log | What It Means | If Missing |
|-----|---------------|-----------|
| `🔄 handleContentChange called` | Event handler fired | `onContentChange` callback not wired correctly |
| `📄 Active file` | Current file identified | File selection issue |
| `✏️ Updated UI` | React state updated | UI state not updating |
| `🔍 File path resolution` | File location found | `findFilePath()` broken or path not set on file |
| `📝 Starting sync` | About to write to WebContainer | File path resolution failed |
| `🚀 Writing...IMMEDIATELY` | Sending to WebContainer | WebContainer instance not ready |
| `💾 writeFile called` | WebContainer service called | `writeFileSync` not being invoked |
| `✅ Successfully wrote` | File successfully written | File write failed |

### Step 4: If Preview Doesn't Update

**Check these in order:**

1. **WebContainer Instance Available?**
   ```
   Search console for: "WebContainer instance not available yet"
   ```
   If you see this, the WebContainer hasn't finished initializing. Wait a moment and try again.

2. **File Path Resolved?**
   ```
   Search console for: "Could not find file path"
   ```
   If you see this, the file's `path` property might not be set correctly.

3. **Write to WebContainer Failed?**
   ```
   Search console for: "Error writing file"
   ```
   If you see this, check the error message for what went wrong.

4. **Check if Immediate Write is Happening?**
   ```
   Search console for: "💾 writeFile called"
   ```
   If this doesn't appear, the `writeFileSync` callback isn't being called.

## Common Issues

### Issue 1: "WebContainer instance not available yet"
**Solution**: The WebContainer is still initializing. Wait 2-3 seconds and try editing again.

### Issue 2: "Could not find file path for [filename]"
**Solution**: The file might not have its `path` property set in the template data. Check that `enrichTemplateWithPaths` is being called.

### Issue 3: Logs show successful write but preview doesn't update
**Possible Causes**:
- The WebContainer server might not have hot-reload configured
- The file path might be incorrect
- The server might not be watching for file changes
- Check if `npm run dev` or your dev server command supports file watching

## Testing Steps

1. Create a project with files in different folders (e.g., `login/page.tsx`, `dashboard/page.tsx`)
2. Open `login/page.tsx` in the editor
3. Type some text and watch the console
4. Verify the correct file path is being used
5. Check if the preview updates (either inline or in the new tab)

## Related Files

- `app/playground/[id]/page.tsx` - Main component with `handleContentChange`
- `modules/playground/services/file-sync-service.ts` - Handles debounced sync
- `modules/webContainers/services/webContainer-services.ts` - WebContainer filesystem operations
- `modules/playground/lib/index.ts` - `findFilePath()` function
