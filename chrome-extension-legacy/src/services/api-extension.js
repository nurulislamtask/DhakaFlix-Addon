// Extension API - uses background service worker to bypass CORS
// This version is for browser extension use

const HTTP_SERVER_URL = import.meta.env.VITE_HTTP_SERVER_URL || 'http://cdn.dflix.live';
import { getTmdbKey } from './tmdbKey.js';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Check if we're running as an extension
const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

// Helper to send message to background script
const sendToBackground = (action, url, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!isExtension) {
      reject(new Error('Extension API not available. This code must run in a browser extension context.'));
      return;
    }

    chrome.runtime.sendMessage(
      { action, url, options },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || 'Unknown error'));
        }
      }
    );
  });
};

// Helper function to parse directory listing HTML (same as before)
const parseDirectoryListing = (html, currentPath) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const files = [];

  const pre = doc.querySelector('pre');
  if (!pre) {
    console.log('No <pre> tag found in HTML, trying alternative parsing...');
    const allLinks = doc.querySelectorAll('a');
    allLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href !== '../' && !href.startsWith('http')) {
        const name = link.textContent.trim();
        if (name && name !== '../') {
          const isDirectory = href.endsWith('/');
          const cleanName = name.replace(/\/$/, '');
          let filePath = currentPath === '/' ? `/${cleanName}` : `${currentPath}/${cleanName}`;
          files.push({
            name: cleanName,
            type: isDirectory ? 'directory' : 'file',
            size: 0,
            modified: null,
            path: filePath
          });
        }
      }
    });
    return files;
  }

  const preHTML = pre.innerHTML;
  const lines = preHTML.split('\n').filter(line => line.trim());
  
  lines.forEach((line) => {
    if (!line.trim() || line.includes('../') || line.includes('href="../"')) {
      return;
    }

    const linkMatch = line.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/);
    if (!linkMatch) {
      return;
    }

    let href = linkMatch[1];
    let name = linkMatch[2].trim();
    
    if (href === '../' || name === '../') {
      return;
    }

    try {
      href = decodeURIComponent(href);
      name = decodeURIComponent(name);
    } catch (e) {
      // If decoding fails, use original values
    }

    const isDirectory = href.endsWith('/') || name.endsWith('/');
    const cleanHref = href.replace(/\/$/, '');
    const cleanName = name.replace(/\/$/, '');

    const afterLink = line.replace(/<a[^>]*>.*?<\/a>/, '').trim();
    const parts = afterLink.split(/\s+/).filter(p => p && p !== '');
    
    let size = 0;
    let date = null;

    if (parts.length >= 2) {
      const dateStr = parts.slice(0, 2).join(' ');
      try {
        const dateMatch = dateStr.match(/(\d{2})-(\w{3})-(\d{4})\s+(\d{2}):(\d{2})/);
        if (dateMatch) {
          const [, day, month, year, hour, minute] = dateMatch;
          const monthMap = {
            'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
            'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
          };
          if (monthMap[month] !== undefined) {
            date = new Date(parseInt(year), monthMap[month], parseInt(day), parseInt(hour), parseInt(minute));
            if (isNaN(date.getTime())) {
              date = null;
            }
          }
        } else {
          date = new Date(dateStr);
          if (isNaN(date.getTime())) {
            date = null;
          }
        }
      } catch (e) {
        date = null;
      }

      if (parts.length >= 3) {
        const sizeStr = parts[parts.length - 1];
        if (sizeStr !== '-' && !isNaN(parseInt(sizeStr))) {
          size = parseInt(sizeStr);
        }
      } else if (parts.length === 2 && parts[1] !== '-') {
        const sizeStr = parts[1];
        if (!isNaN(parseInt(sizeStr))) {
          size = parseInt(sizeStr);
        }
      }
    }

    let filePath;
    if (currentPath === '/') {
      filePath = `/${cleanHref}`;
    } else {
      if (cleanHref.startsWith('/')) {
        filePath = cleanHref;
      } else {
        filePath = `${currentPath}/${cleanHref}`;
      }
    }

    files.push({
      name: cleanName,
      type: isDirectory ? 'directory' : 'file',
      size: size,
      modified: date ? date.toISOString() : null,
      path: filePath
    });
  });

  console.log(`Parsed ${files.length} files from directory listing`);
  return files;
};

export const api = {
  async listFiles(path = '/') {
    try {
      let url = HTTP_SERVER_URL;
      if (path !== '/') {
        url += path;
        if (!path.endsWith('/')) {
          url += '/';
        }
      } else {
        url += '/';
      }

      console.log(`Fetching directory listing from: ${url}`);

      // Use extension background script to fetch (bypasses CORS)
      const responseData = await sendToBackground('fetch', url, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!responseData.ok) {
        throw new Error(`Failed to list files: ${responseData.statusText}`);
      }

      const html = responseData.text;
      
      if (!html || html.length === 0) {
        console.log('Received empty HTML response');
        return [];
      }

      console.log(`Received HTML (${html.length} bytes)`);
      
      const files = parseDirectoryListing(html, path);
      
      return files;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  getStreamUrl(filePath) {
    // Direct stream URL - extension can access it directly
    return HTTP_SERVER_URL + filePath;
  },

  async getFileInfo(filePath) {
    try {
      const url = HTTP_SERVER_URL + filePath;
      
      // Use extension background script for HEAD request
      const responseData = await sendToBackground('fetchHead', url);

      if (!responseData.ok) {
        throw new Error(`Failed to get file info: ${responseData.statusText}`);
      }

      const size = parseInt(responseData.headers['content-length'] || '0');
      const name = filePath.split('/').pop();
      
      return {
        name: name,
        size: size,
        modified: null,
        path: filePath
      };
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  async searchSubtitles(query, language = 'en') {
    try {
      let searchUrl = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(query)}/sublanguageid-${language}`;
      
      console.log(`[API] Searching subtitles: ${query} (${language})`);
      
      let responseData;
      
      try {
        responseData = await sendToBackground('fetch', searchUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
      } catch (error) {
        console.log(`[API] Legacy API failed, trying alternative format...`);
        searchUrl = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(query)}`;
        try {
          responseData = await sendToBackground('fetch', searchUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          });
        } catch (error2) {
          console.error(`[API] Both API attempts failed:`, error2.message);
          return [];
        }
      }
      
      // Parse JSON from text
      let data;
      try {
        data = JSON.parse(responseData.text);
      } catch (e) {
        console.error('Failed to parse subtitle response:', e);
        return [];
      }
      
      let subtitles = [];
      if (Array.isArray(data)) {
        subtitles = data;
      } else if (data && data.data && Array.isArray(data.data)) {
        subtitles = data.data;
      } else if (data && data.subtitles && Array.isArray(data.subtitles)) {
        subtitles = data.subtitles;
      }
      
      const formattedSubtitles = subtitles.map(sub => ({
        id: sub.IDSubtitleFile || sub.id,
        name: sub.SubFileName || sub.filename || sub.name,
        language: sub.LanguageName || sub.language || language,
        downloadUrl: sub.SubDownloadLink || sub.download_url || sub.url,
        format: sub.SubFormat || sub.format || 'srt',
        rating: sub.SubRating || sub.rating || '0',
        downloads: sub.SubDownloadsCnt || sub.downloads || 0
      })).filter(sub => sub.downloadUrl);

      console.log(`[API] Found ${formattedSubtitles.length} subtitles`);
      return formattedSubtitles;
    } catch (error) {
      console.error('[API] Error searching subtitles:', error);
      return [];
    }
  },

  getSubtitleDownloadUrl(subtitleUrl) {
    // Extension can access directly, no proxy needed
    return subtitleUrl;
  },

  async getDirectStreamUrl(filePath) {
    return HTTP_SERVER_URL + filePath;
  },

  async searchMedia(query, type = 'multi', year) {
    try {
      const cleanQuery = query.trim().replace(/\s*-\s*$/, '').trim();
      const apiKey = getTmdbKey();
      if (!apiKey) {
        console.warn('[API] TMDB API key missing - posters cannot load. Add your free key in the app settings (header) or set VITE_TMDB_API_KEY in .env. Get one at themoviedb.org -> Settings -> API.');
        return { results: [], total_results: 0 };
      }
      const timestamp = Date.now();
      const yearParam = year && type !== 'multi' ? `&year=${encodeURIComponent(year)}` : '';
      
      let searchUrl;
      if (type === 'multi') {
        searchUrl = `${TMDB_BASE_URL}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(cleanQuery)}${yearParam}&language=en-US&_t=${timestamp}`;
      } else if (type === 'movie') {
        searchUrl = `${TMDB_BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(cleanQuery)}${yearParam}&language=en-US&_t=${timestamp}`;
      } else if (type === 'tv') {
        searchUrl = `${TMDB_BASE_URL}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(cleanQuery)}${yearParam}&language=en-US&_t=${timestamp}`;
      } else {
        throw new Error('Invalid type. Use "movie", "tv", or "multi"');
      }
      
      console.log(`[API] Searching media: ${cleanQuery} (type: ${type})`);
      
      const responseData = await sendToBackground('fetch', searchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!responseData.ok) {
        console.error(`[API] TMDB API error: ${responseData.statusText}`);
        return { results: [], total_results: 0 };
      }
      
      const data = JSON.parse(responseData.text);
      let results = (data.results || []).map(item => {
        const isMovie = item.media_type === 'movie' || type === 'movie';
        
        return {
          id: item.id,
          title: item.title || item.name,
          originalTitle: item.original_title || item.original_name,
          overview: item.overview || '',
          releaseDate: item.release_date || item.first_air_date,
          rating: item.vote_average || 0,
          voteCount: item.vote_count || 0,
          posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
          backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
          mediaType: item.media_type || (isMovie ? 'movie' : 'tv'),
          genreIds: item.genre_ids || []
        };
      });

      if (year) {
        const y = String(year);
        results.sort((a, b) => ((a.releaseDate || '').startsWith(y) ? 0 : 1) - ((b.releaseDate || '').startsWith(y) ? 0 : 1));
      }
      results = results.slice(0, 5);
      
      console.log(`[API] Found ${results.length} media results`);
      return { results, total_results: data.total_results || 0 };
    } catch (error) {
      console.error('[API] Error searching media:', error);
      return { results: [], total_results: 0 };
    }
  },

  async getMediaDetails(id, type = 'movie') {
    try {
      const endpoint = type === 'tv' ? 'tv' : 'movie';
      const apiKey = getTmdbKey();
      if (!apiKey) {
        throw new Error('TMDB API key missing - add your free TMDB API key in the app settings (header) or set VITE_TMDB_API_KEY in .env to load posters. Get one at themoviedb.org -> Settings -> API.');
      }
      const detailsUrl = `${TMDB_BASE_URL}/${endpoint}/${id}?api_key=${apiKey}&language=en-US&append_to_response=credits,videos&_t=${Date.now()}`;
      
      console.log(`[API] Fetching media details: ${id} (type: ${type})`);
      
      const responseData = await sendToBackground('fetch', detailsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!responseData.ok) {
        console.error(`[API] TMDB API error: ${responseData.statusText}`);
        throw new Error('Failed to fetch media details');
      }
      
      const data = JSON.parse(responseData.text);
      const details = {
        id: data.id,
        title: data.title || data.name,
        originalTitle: data.original_title || data.original_name,
        overview: data.overview || '',
        releaseDate: data.release_date || data.first_air_date,
        rating: data.vote_average || 0,
        voteCount: data.vote_count || 0,
        popularity: data.popularity || 0,
        posterPath: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
        backdropPath: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : null,
        genres: (data.genres || []).map(g => g.name),
        runtime: data.runtime || data.episode_run_time?.[0] || null,
        tagline: data.tagline || '',
        status: data.status || '',
        mediaType: type,
        numberOfSeasons: data.number_of_seasons || null,
        numberOfEpisodes: data.number_of_episodes || null,
        budget: data.budget || null,
        revenue: data.revenue || null,
        cast: (data.credits?.cast || []).slice(0, 10).map(actor => ({
          name: actor.name,
          character: actor.character,
          profilePath: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : null
        })),
        crew: (data.credits?.crew || []).slice(0, 5).map(member => ({
          name: member.name,
          job: member.job
        })),
        trailers: (data.videos?.results || [])
          .filter(v => v.type === 'Trailer' && v.site === 'YouTube')
          .slice(0, 3)
          .map(v => ({
            key: v.key,
            name: v.name,
            type: v.type
          }))
      };
      
      console.log(`[API] Fetched media details for: ${details.title}`);
      return details;
    } catch (error) {
      console.error('[API] Error fetching media details:', error);
      throw error;
    }
  }
};

