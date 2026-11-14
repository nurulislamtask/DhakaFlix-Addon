# FTP Streaming - Frontend Only Version

This is a frontend-only version of the FTP Streaming application that makes direct HTTP calls without requiring a backend server.

## Features

- ✅ Direct HTTP calls to file server (no backend proxy needed)
- ✅ Browser-based HTML directory parsing (using DOMParser)
- ✅ Direct API calls to TMDB (if CORS allows)
- ✅ Direct API calls to OpenSubtitles (may require CORS proxy)
- ✅ No Node.js backend required

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the root directory (copy from `.env.example` if it exists, or create manually):
   ```env
   VITE_HTTP_SERVER_URL=http://cdn.dflix.live
   VITE_TMDB_API_KEY=your_tmdb_api_key_here
   VITE_CORS_PROXY=  # Optional: for subtitle downloads if CORS blocks
   ```
   
   **Note**: Get your TMDB API key from https://www.themoviedb.org/settings/api

3. **Start the development server:**
   ```bash
   npm run dev
   ```

## Environment Variables

- `VITE_HTTP_SERVER_URL`: The base URL of your HTTP file server (default: `http://cdn.dflix.live`)
- `VITE_TMDB_API_KEY`: Your TMDB API key (get one from https://www.themoviedb.org/settings/api)
- `VITE_CORS_PROXY`: Optional CORS proxy URL for all HTTP requests if the server blocks CORS (e.g., `https://corsproxy.io/?` or `https://api.allorigins.win/raw?url=`)
  
  **Note**: If you get CORS errors, add this to your `.env` file. The proxy will be used automatically as a fallback when direct requests fail.

## CORS Considerations

This frontend-only version requires CORS to be enabled on:

1. **HTTP File Server**: Must allow cross-origin requests from your frontend domain
2. **TMDB API**: Usually supports CORS, but verify
3. **OpenSubtitles API**: May block CORS - use `VITE_CORS_PROXY` if needed

### If CORS blocks requests:

- **For file server**: Add `VITE_CORS_PROXY` to your `.env` file. The app will automatically use the proxy as a fallback when direct requests fail.
- **For OpenSubtitles**: The same `VITE_CORS_PROXY` will be used if needed.

**Example CORS Proxy Services:**
- `https://corsproxy.io/?` (add `=` at the end: `https://corsproxy.io/?=`)
- `https://api.allorigins.win/raw?url=`
- `https://cors-anywhere.herokuapp.com/` (may require authentication)

## Differences from Backend Version

- No Express.js server needed
- No JSDOM dependency (uses browser's DOMParser)
- Direct fetch calls to all APIs
- Simpler deployment (just static files)

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory and can be served by any static file server.

## Troubleshooting

### Posters not loading?

Movie posters come from TMDB and need a free TMDB API key (v3). Without one,
the file list and playback still work, but no poster image loads.
- **In the app:** paste your key in the header's "TMDB API key" box and press Save.
- **Or in `.env`:** copy `.env.example` to `.env` and set `VITE_TMDB_API_KEY`, then rebuild.
- Get a free key at https://www.themoviedb.org/settings/api (Settings → API).

### CORS Errors

If you see CORS errors in the browser console:
1. Check if the HTTP server allows CORS
2. For OpenSubtitles, configure `VITE_CORS_PROXY`
3. Consider using a CORS proxy service for blocked APIs

### Directory Listing Not Parsing

If directory listings aren't working:
1. Check the browser console for parsing errors
2. Verify the HTML structure matches the expected format
3. The parser expects nginx-style directory listings with `<pre>` tags
