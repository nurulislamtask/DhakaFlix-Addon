# Quick Start - Browser Extension (Bypass CORS)

This approach uses a browser extension background service worker to bypass CORS restrictions.

## Quick Setup

1. **Build the extension:**
   ```bash
   npm run build
   ```

2. **Load extension in Chrome/Edge:**
   - Open `chrome://extensions/` (or `edge://extensions/`)
   - Enable "Developer mode" (toggle top-right)
   - Click "Load unpacked"
   - Select the `dist` folder

3. **Open the extension:**
   - Click the extension icon in your browser toolbar
   - Or navigate to `chrome-extension://[extension-id]/index.html`

## How It Works

- **Background Service Worker** (`background.js`) makes HTTP requests without CORS restrictions
- **Frontend** sends messages to background script via `chrome.runtime.sendMessage`
- **Background script** fetches data and returns it to frontend
- **No backend server needed!**

## Files Created

- `manifest.json` - Extension manifest
- `public/background.js` - Background service worker
- `src/services/api-extension.js` - Extension API (bypasses CORS)
- `src/services/api-regular.js` - Regular API (for web app)
- `src/services/api.js` - Auto-detects and uses the right API

## Testing

1. Build: `npm run build`
2. Load extension in browser
3. Open extension popup/page
4. The app should work without CORS errors!

## Development

For development, you can still use `npm run dev` for the regular web version, or build and reload the extension after each change.

## Advantages Over Regular Web App

✅ **No CORS Issues** - Extension context bypasses CORS  
✅ **No Backend Required** - Everything in browser  
✅ **Works with Any Server** - Doesn't need CORS headers  
✅ **Better Performance** - Direct communication  

## Next Steps

See `EXTENSION_SETUP.md` for detailed instructions and troubleshooting.

