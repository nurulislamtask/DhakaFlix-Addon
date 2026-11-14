// Regular web API - makes direct HTTP calls with CORS proxy fallback
// This version is for regular web app use (may have CORS limitations)

const HTTP_SERVER_URL = import.meta.env.VITE_HTTP_SERVER_URL || 'http://cdn.dflix.live';
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || '8c4e4c4e4c4e4c4e4c4e4c4e4c4e4c4e';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const CORS_PROXY = import.meta.env.VITE_CORS_PROXY || '';

// Helper function to fetch with CORS proxy fallback
const fetchWithProxy = async (url, options = {}) => {
  try {
    // Try direct fetch first
    const response = await fetch(url, options);
    // Check if response is actually ok (some CORS errors return status 0)
    if (response.ok || response.status !== 0) {
      return response;
    }
    throw new Error(`Response status: ${response.status}`);
  } catch (error) {
    // If CORS error and proxy is configured, try with proxy
    const isCorsError = error.message.includes('CORS') || 
                       error.message.includes('Failed to fetch') || 
                       error.name === 'TypeError' ||
                       error.message.includes('NetworkError') ||
                       (error.message && error.message.includes('network'));
    
    if (isCorsError && CORS_PROXY) {
      console.log(`CORS error detected, trying with proxy: ${CORS_PROXY}`);
      
      // Try different proxy URL formats
      let proxiedUrl;
      if (CORS_PROXY.includes('allorigins.win')) {
        proxiedUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      } else if (CORS_PROXY.includes('corsproxy.io')) {
        proxiedUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      } else if (CORS_PROXY.endsWith('=') || CORS_PROXY.endsWith('?')) {
        proxiedUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
      } else {
        proxiedUrl = `${CORS_PROXY}${url}`;
      }
      
      console.log(`Trying proxy URL: ${proxiedUrl}`);
      
      const proxyOptions = { 
        ...options,
        mode: 'cors',
        credentials: 'omit'
      };
      
      try {
        const proxyResponse = await fetch(proxiedUrl, proxyOptions);
        if (!proxyResponse.ok) {
          throw new Error(`Proxy request failed: ${proxyResponse.status} ${proxyResponse.statusText}`);
        }
        console.log('Proxy request successful');
        return proxyResponse;
      } catch (proxyError) {
        console.error('Proxy request also failed:', proxyError);
        // Try public proxy services as fallback
        const publicProxies = [
          'https://api.allorigins.win/raw?url=',
          'https://corsproxy.io/?',
        ];
        
        for (const publicProxy of publicProxies) {
          try {
            const publicProxiedUrl = `${publicProxy}${encodeURIComponent(url)}`;
            console.log(`Trying public proxy: ${publicProxy}`);
            const publicProxyResponse = await fetch(publicProxiedUrl, proxyOptions);
            if (publicProxyResponse.ok) {
              console.log(`Public proxy ${publicProxy} worked!`);
              return publicProxyResponse;
            }
          } catch (publicProxyError) {
            console.log(`Public proxy ${publicProxy} failed:`, publicProxyError.message);
            continue;
          }
        }
        
        throw new Error(`All proxy attempts failed. Direct: ${error.message}, User proxy: ${proxyError.message}. The server may not allow CORS requests.`);
      }
    }
    throw error;
  }
};

// Helper function to parse directory listing HTML (browser version)
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

      const response = await fetchWithProxy(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.statusText}`);
      }

      const html = await response.text();
      
      if (!html || html.length === 0) {
        console.log('Received empty HTML response');
        return [];
      }

      console.log(`Received HTML (${html.length} bytes)`);
      
      const files = parseDirectoryListing(html, path);
      
      return files;
    } catch (error) {
      console.error('API Error:', error);
      const errorMsg = CORS_PROXY 
        ? `CORS error: The server at ${HTTP_SERVER_URL} may not allow cross-origin requests. A CORS proxy is configured but the request still failed. Please check your VITE_CORS_PROXY setting.`
        : `CORS error: The server at ${HTTP_SERVER_URL} may not allow cross-origin requests. Please configure CORS on the server or set VITE_CORS_PROXY in your .env file (e.g., VITE_CORS_PROXY=https://corsproxy.io/?=).`;
      
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch') || error.name === 'TypeError') {
        throw new Error(errorMsg);
      }
      throw error;
    }
  },

  getStreamUrl(filePath) {
    return HTTP_SERVER_URL + filePath;
  },

  async getFileInfo(filePath) {
    try {
      const url = HTTP_SERVER_URL + filePath;
      
      const response = await fetchWithProxy(url, {
        method: 'HEAD',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Accept': '*/*'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get file info: ${response.statusText}`);
      }

      const size = parseInt(response.headers.get('content-length') || '0');
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
      
      let response;
      let data;
      
      try {
        response = await fetch(searchUrl, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`OpenSubtitles API returned ${response.status}`);
        }
        
        data = await response.json();
      } catch (error) {
        console.log(`[API] Legacy API failed, trying alternative format...`);
        searchUrl = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(query)}`;
        try {
          response = await fetch(searchUrl, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            headers: {
              'Accept': 'application/json'
            }
          });
          
          if (!response.ok) {
            throw new Error(`OpenSubtitles API returned ${response.status}`);
          }
          
          data = await response.json();
        } catch (error2) {
          console.error(`[API] Both API attempts failed:`, error2.message);
          return [];
        }
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
    const corsProxy = import.meta.env.VITE_CORS_PROXY || '';
    if (corsProxy && (subtitleUrl.includes('opensubtitles.org') || subtitleUrl.includes('opensubtitles.com'))) {
      return `${corsProxy}${encodeURIComponent(subtitleUrl)}`;
    }
    return subtitleUrl;
  },

  async getDirectStreamUrl(filePath) {
    return HTTP_SERVER_URL + filePath;
  },

  async searchMedia(query, type = 'multi') {
    try {
      const cleanQuery = query.trim().replace(/\s*-\s*$/, '').trim();
      const timestamp = Date.now();
      
      let searchUrl;
      if (type === 'multi') {
        searchUrl = `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanQuery)}&language=en-US&_t=${timestamp}`;
      } else if (type === 'movie') {
        searchUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanQuery)}&language=en-US&_t=${timestamp}`;
      } else if (type === 'tv') {
        searchUrl = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanQuery)}&language=en-US&_t=${timestamp}`;
      } else {
        throw new Error('Invalid type. Use "movie", "tv", or "multi"');
      }
      
      console.log(`[API] Searching media: ${cleanQuery} (type: ${type})`);
      
      const response = await fetch(searchUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error(`[API] TMDB API error: ${response.statusText}`);
        return { results: [], total_results: 0 };
      }
      
      const data = await response.json();
      const results = (data.results || []).slice(0, 5).map(item => {
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
      const detailsUrl = `${TMDB_BASE_URL}/${endpoint}/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits,videos&_t=${Date.now()}`;
      
      console.log(`[API] Fetching media details: ${id} (type: ${type})`);
      
      const response = await fetch(detailsUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error(`[API] TMDB API error: ${response.statusText}`);
        throw new Error('Failed to fetch media details');
      }
      
      const data = await response.json();
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
