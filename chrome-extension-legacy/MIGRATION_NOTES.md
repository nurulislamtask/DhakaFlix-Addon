# Migration to Frontend-Only Architecture

## What Changed

### 1. API Service (`src/services/api.js`)
- **Before**: Made calls to `/api/*` endpoints proxied through backend
- **After**: Makes direct HTTP calls to:
  - HTTP file server (for directory listings and file streaming)
  - TMDB API (for media metadata)
  - OpenSubtitles API (for subtitles)

### 2. Directory Listing Parsing
- **Before**: Backend used JSDOM (Node.js library) to parse HTML
- **After**: Frontend uses browser's native `DOMParser` to parse HTML directory listings

### 3. File Streaming
- **Before**: Backend proxied file streams with range request handling
- **After**: Browser makes direct requests to HTTP server (browsers handle range requests automatically)

### 4. Configuration
- **Before**: Backend read from `.env` file
- **After**: Frontend reads from `.env` file with `VITE_` prefix (Vite requirement)

### 5. Vite Config
- **Before**: Had proxy configuration pointing to `http://localhost:5000`
- **After**: No proxy needed - removed proxy configuration

## Key Functions Updated

### `api.listFiles(path)`
- Now fetches HTML directly from HTTP server
- Parses HTML using `DOMParser` in browser
- Returns same data structure as before

### `api.getStreamUrl(filePath)`
- Returns direct URL to file on HTTP server
- No backend proxy needed

### `api.getFileInfo(filePath)`
- Uses HEAD request directly to HTTP server
- Gets file size from `Content-Length` header

### `api.getDirectStreamUrl(filePath)`
- Changed from async to sync (just returns URL)
- Updated MediaPlayer to handle this change

### `api.searchSubtitles(query, language)`
- Makes direct fetch to OpenSubtitles API
- May fail due to CORS - use `VITE_CORS_PROXY` if needed

### `api.searchMedia(query, type)` & `api.getMediaDetails(id, type)`
- Makes direct fetch to TMDB API
- Requires `VITE_TMDB_API_KEY` in environment

## Testing Checklist

1. **Directory Listing**
   - [ ] Navigate to root directory
   - [ ] Navigate to subdirectories
   - [ ] Verify files and folders display correctly

2. **File Streaming**
   - [ ] Play a video file
   - [ ] Test seeking (range requests)
   - [ ] Test different video formats (MP4, MKV, etc.)

3. **File Info**
   - [ ] Check file sizes display correctly
   - [ ] Verify file names are correct

4. **Media Metadata (TMDB)**
   - [ ] Search for movies/series
   - [ ] Verify metadata displays in player
   - [ ] Check if API key is working

5. **Subtitles**
   - [ ] Search for subtitles
   - [ ] Load subtitles from URL
   - [ ] Upload subtitle file
   - [ ] If CORS blocks, configure CORS proxy

6. **CORS Issues**
   - [ ] Check browser console for CORS errors
   - [ ] Verify HTTP server allows CORS
   - [ ] Test with CORS proxy if needed

## Known Limitations

1. **CORS Restrictions**: 
   - Some APIs may block direct browser access
   - Solution: Use CORS proxy or keep minimal backend for those endpoints

2. **API Keys Exposed**:
   - TMDB API key will be visible in frontend code
   - This is acceptable for public API keys (TMDB allows this)

3. **Subtitle Downloads**:
   - OpenSubtitles may block CORS
   - Use `VITE_CORS_PROXY` environment variable if needed

## Rollback Plan

If you need to go back to the backend version:
1. The original `client` folder is unchanged
2. Just use the original setup with backend server
3. No changes were made to the original codebase

