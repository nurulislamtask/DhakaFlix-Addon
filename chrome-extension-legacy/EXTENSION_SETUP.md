# Browser Extension Setup - Bypass CORS

This version uses a browser extension background service worker to bypass CORS restrictions.

## How It Works

1. **Background Service Worker**: Makes HTTP requests from the extension context (no CORS restrictions)
2. **Message Passing**: Frontend sends messages to background script, which fetches data and returns it
3. **No Backend Needed**: Everything runs in the browser extension

## Setup Instructions

### 1. Build the Extension

```bash
npm run build
```

### 2. Load Extension in Browser

#### Chrome/Edge:
1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist` folder from the build

#### Firefox:
1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from the `dist` folder

### 3. Update API Import

In your React components, you need to conditionally use the extension API:

**Option A: Auto-detect (Recommended)**

Create `src/services/api.js` that detects extension context:

```javascript
// Auto-detect and use extension API if available
const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

if (isExtension) {
  // Use extension API (bypasses CORS)
  export { api } from './api-extension.js';
} else {
  // Use regular API (may have CORS issues)
  export { api } from './api-regular.js';
}
```

**Option B: Manual Switch**

Just import the extension API directly:
```javascript
import { api } from './services/api-extension';
```

### 4. Copy Background Script

Make sure `public/background.js` is copied to `dist/background.js` during build.

Update `vite.config.js`:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync } from 'fs'
import { join } from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'copy-background',
      closeBundle() {
        copyFileSync(
          join(__dirname, 'public/background.js'),
          join(__dirname, 'dist/background.js')
        )
      }
    }
  ],
  // ... rest of config
})
```

## Manifest Configuration

The `manifest.json` includes:
- **host_permissions**: Allows extension to access your HTTP server and APIs
- **background**: Service worker that handles requests
- **permissions**: Storage and background access

## Advantages

✅ **No CORS Issues**: Extension context bypasses CORS  
✅ **No Backend Required**: Everything runs in browser  
✅ **Works Offline**: Can cache responses  
✅ **Better Performance**: Direct communication with background script  

## Limitations

⚠️ **Extension Required**: Users must install the extension  
⚠️ **Browser-Specific**: Different setup for Chrome vs Firefox  
⚠️ **Distribution**: Can't just share a URL, need to distribute extension  

## Development

For development, you can:
1. Build and load extension in browser
2. Or use the regular web version (with CORS limitations)

## Production

1. Build the extension: `npm run build`
2. Test in browser
3. Package for Chrome Web Store / Firefox Add-ons (optional)
4. Or distribute the `dist` folder for manual installation

