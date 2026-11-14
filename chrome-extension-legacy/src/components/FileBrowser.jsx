import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../services/api';
import { favoritesService, watchLaterService } from '../services/storage';

// Helper function to decode HTML entities
const decodeHtmlEntities = (str) => {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
};

// Extract full filename from path (handles truncated names)
const getFullFileName = (file) => {
  // If name looks truncated (ends with .. or &gt;), extract from path
  if (file.name && (file.name.endsWith('..') || file.name.endsWith('&gt;') || file.name.includes('..&gt;'))) {
    if (file.path) {
      const pathParts = file.path.split('/');
      const fullName = pathParts[pathParts.length - 1];
      return decodeHtmlEntities(fullName);
    }
  }
  return decodeHtmlEntities(file.name || '');
};

// Extract file extension from path
const getFileExtension = (file) => {
  const fileName = file.path ? file.path.split('/').pop() : file.name;
  const ext = fileName.toLowerCase().split('.').pop();
  return ext;
};

// Get folder icon based on folder name
const getFolderIcon = (folderName) => {
  const name = folderName.toLowerCase();
  
  // Movie subcategories (check these first before generic 'movie')
  if (name.includes('english') && name.includes('dubbed')) {
    return '🌎';
  } else if (name.includes('english') && name.includes('movie')) {
    return '🇬🇧';
  } else if (name.includes('foreign') && name.includes('movie')) {
    return '🌍';
  } else if (name.includes('hindi') && name.includes('movie')) {
    return '🇮🇳';
  } else if (name.includes('bangla') || name.includes('bengali')) {
    return '🇧🇩';
  } else if (name.includes('south indian') || name.includes('south indian')) {
    return '🎭';
  } else if (name.includes('movie')) {
    return '🎬';
  } 
  // TV Series
  else if (name.includes('tv series') || name.includes('tv-series')) {
    if (name.includes('anime')) {
      return '🎌';
    } else if (name.includes('dubbed')) {
      return '🌍';
    } else if (name.includes('hindi')) {
      return '🇮🇳';
    }
    return '📺';
  } 
  // Other categories
  else if (name.includes('e-book') || name.includes('ebook')) {
    return '📚';
  } else if (name.includes('software') || name.includes('app')) {
    return '💻';
  } else if (name.includes('tutorial') || name.includes('tutorials')) {
    return '🎓';
  } else if (name.includes('new')) {
    return '🆕';
  }
  
  // Default folder icon
  return '📁';
};

// Clean a file/folder name down to the bare title + year for poster lookups.
// e.g. "18th Rose (2026) 720p NF [Dual Audio]" -> { title: "18th Rose", year: 2026 }
// The full cleaned title is used — never truncated to a few words, so long
// titles like "10 Things I Hate About You" survive intact.
const extractMediaName = (file) => {
  const rawName = file.path ? file.path.split('/').pop() : file.name;
  let name = decodeHtmlEntities(rawName || '');
  // Strip the video file extension.
  name = name.replace(/\.(mkv|mp4|avi|mov|webm|m4v|wmv|flv|ts|mts|mpg|mpeg|3gp)$/i, '');

  const cleanTail = (s) => {
    let t = s;
    // Cut any bracketed tag tail: "[Dual Audio]", "(Dual Audio)", "[Hindi]", ...
    t = t.replace(/[\[(].*$/, '');
    // Season / episode markers.
    t = t.replace(/\bS\d{1,2}E\d{1,3}\b/gi, ' ');
    t = t.replace(/\bSeason\s*\d+.*$/gi, ' ');
    t = t.replace(/\bEpisode\s*\d+.*$/gi, ' ');
    // Quality / codec / source / language / release tags.
    t = t.replace(/\b(2160p|1080p|720p|480p|360p|4K|UHD|BluRay|Blu-Ray|BRRip|BDRip|WEB-?DL|WEBRip|HDRip|HDTV|DVDRip|DVDScr|x26[45]|H\.?26[45]|HEVC|AAC|AC3|DD5\.1|DTS|NF|AMZN|Netflix|Amazon|Dual[\s-]?Audio|Multi[\s-]?Audio|Hindi|Bangla|Bengali|English|Dubbed|ESub|Subbed|Proper|Repack|Extended|Unrated|Remastered|Complete)\b/gi, ' ');
    // Separators become spaces; drop leftover dashes and collapse whitespace.
    t = t.replace(/[._]+/g, ' ').replace(/\s+-\s*/g, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/^[-–—\s]+|[-–—\s]+$/g, '').trim();
    return t;
  };

  // Year: first 19xx/20xx occurrence, in parens or bare.
  const yearMatch = name.match(/(19|20)\d{2}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : undefined;
  // Everything before the year is the title; tags after it are dropped.
  let title = yearMatch ? cleanTail(name.slice(0, yearMatch.index)) : cleanTail(name);
  if (!title || title.length < 2) {
    // Year was part of the title itself (e.g. "2001: A Space Odyssey") —
    // fall back to cleaning the whole name without cutting at the year.
    title = cleanTail(name);
  }
  return { title: title || rawName, year };
};

const FileBrowser = ({ onFileSelect, currentPath, onPathChange, searchQuery = '', onSearchChange, isHomepage = false, onFavoritesChange, onWatchLaterChange }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mediaMetadata, setMediaMetadata] = useState({}); // Store metadata by file path
  const [loadingMetadata, setLoadingMetadata] = useState(new Set());
  const [mediaDetails, setMediaDetails] = useState(null); // Full media details for the directory
  const [folderPosters, setFolderPosters] = useState({}); // Poster URL by folder path
  const [failedPosters, setFailedPosters] = useState(new Set()); // File paths whose poster image failed to load
  const folderPosterCache = useRef({}); // path -> poster URL (or null when none found); looked up once
  const [favorites, setFavorites] = useState(new Set());
  const [watchLater, setWatchLater] = useState(new Set());

  useEffect(() => {
    loadFiles(currentPath);
    // Clear search when path changes
    if (onSearchChange) {
      onSearchChange('');
    }
    // Load favorites and watch later status
    const favs = favoritesService.getAll();
    const wl = watchLaterService.getAll();
    setFavorites(new Set(favs.map(f => f.path)));
    setWatchLater(new Set(wl.map(f => f.path)));
  }, [currentPath]);

  const loadFiles = async (path) => {
    setLoading(true);
    setError(null);
    setMediaDetails(null);
    setFailedPosters(new Set());
    try {
      const fileList = await api.listFiles(path);
      console.log('Loaded files:', fileList);
      setFiles(fileList);
      
      // Load metadata for media files
      const mediaFiles = fileList.filter(f => f.type === 'file' && isMediaFile(f));
      mediaFiles.forEach(file => {
        loadMediaMetadata(file);
      });
    } catch (err) {
      const errorMessage = err.message || 'Failed to load files';
      setError(errorMessage);
      console.error('Error loading files:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load metadata for a media file
  const loadMediaMetadata = async (file) => {
    const filePath = file.path;
    if (mediaMetadata[filePath] || loadingMetadata.has(filePath)) return;
    
    setLoadingMetadata(prev => new Set(prev).add(filePath));
    
    try {
      const { title: mediaName, year } = extractMediaName(file);
      if (!mediaName || mediaName.length < 3) {
        setLoadingMetadata(prev => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
        return;
      }

      const searchResults = await api.searchMedia(mediaName, 'multi', year);
      if (searchResults.results && searchResults.results.length > 0) {
        const firstResult = searchResults.results[0];
        setMediaMetadata(prev => ({
          ...prev,
          [filePath]: firstResult
        }));
      }
    } catch (err) {
      console.error('Error loading metadata for', file.name, err);
    } finally {
      setLoadingMetadata(prev => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
    }
  };

  const handleFileClick = (file) => {
    if (file.type === 'directory') {
      onPathChange(file.path);
    } else {
      onFileSelect(file);
    }
  };

  const handleBack = () => {
    if (currentPath === '/') return;
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    onPathChange(parentPath);
  };

  // Build breadcrumb path segments
  const getBreadcrumbs = () => {
    if (currentPath === '/') return [{ name: 'Home', path: '/' }];
    
    const segments = currentPath.split('/').filter(segment => segment.length > 0);
    const breadcrumbs = [{ name: 'Home', path: '/' }];
    
    let path = '';
    segments.forEach(segment => {
      path += '/' + segment;
      breadcrumbs.push({ name: decodeHtmlEntities(segment), path });
    });
    
    return breadcrumbs;
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const isMediaFile = (file) => {
    // Use path to determine file type if available
    const ext = getFileExtension(file);
    const videoExts = ['mp4', 'webm', 'ogg', 'ogv', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v', '3gp', 'ts', 'mts', 'mpg', 'mpeg'];
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'oga', 'opus', 'wma'];
    return videoExts.includes(ext) || audioExts.includes(ext);
  };

  // Filter files based on search query
  const filterFiles = (fileList, query) => {
    if (!query.trim()) return fileList;
    
    const lowerQuery = query.toLowerCase().trim();
    return fileList.filter(file => {
      const fileName = getFullFileName(file).toLowerCase();
      const metadata = mediaMetadata[file.path];
      const metadataTitle = metadata?.title?.toLowerCase() || '';
      
      // Search in filename and metadata title
      return fileName.includes(lowerQuery) || metadataTitle.includes(lowerQuery);
    });
  };

  // Separate files into directories and media files, with search filtering
  const { directories, mediaFiles, otherFiles } = useMemo(() => {
    const dirs = [];
    const media = [];
    const other = [];
    
    let filteredFiles = files;
    if (searchQuery.trim()) {
      filteredFiles = filterFiles(files, searchQuery);
    }
    
    filteredFiles.forEach(file => {
      if (file.type === 'directory') {
        dirs.push(file);
      } else if (isMediaFile(file)) {
        media.push(file);
      } else {
        other.push(file);
      }
    });
    
    return { directories: dirs, mediaFiles: media, otherFiles: other };
  }, [files, searchQuery, mediaMetadata]);

  // Re-check media details when metadata changes
  useEffect(() => {
    const mediaFiles = files.filter(f => f.type === 'file' && isMediaFile(f));
    if (mediaFiles.length > 0 && Object.keys(mediaMetadata).length > 0) {
      // Check if all media files belong to the same movie/series
      const metadataList = mediaFiles
        .map(file => mediaMetadata[file.path])
        .filter(m => m && m.id);

      if (metadataList.length > 0) {
        const firstMediaId = metadataList[0].id;
        const firstMediaType = metadataList[0].mediaType;
        const allSameMedia = metadataList.every(m => m.id === firstMediaId && m.mediaType === firstMediaType);

        if (allSameMedia && firstMediaId) {
          // Load full details
          api.getMediaDetails(firstMediaId, firstMediaType)
            .then(details => setMediaDetails(details))
            .catch(err => console.error('Error loading media details:', err));
        }
      }
    }
  }, [mediaMetadata, files]);

  // Folder posters: look each folder name up on TMDB once (max 3 lookups at
  // a time) and show the poster instead of only an emoji icon. Results are
  // cached by path in folderPosterCache, so a folder is never looked up
  // twice and no request fires per render.
  useEffect(() => {
    if (!directories.length) return;
    const queue = directories.filter(d => !(d.path in folderPosterCache.current));
    if (!queue.length) return;
    let cancelled = false;

    const loadOne = async (dir) => {
      // Mark in the cache up-front so a re-render cannot queue it again.
      folderPosterCache.current[dir.path] = null;
      const { title, year } = extractMediaName(dir);
      if (!title || title.length < 3) return;
      try {
        const res = await api.searchMedia(title, 'multi', year);
        const poster = res.results?.[0]?.posterPath || null;
        folderPosterCache.current[dir.path] = poster;
        if (poster && !cancelled) {
          setFolderPosters(prev => (prev[dir.path] === poster ? prev : { ...prev, [dir.path]: poster }));
        }
      } catch (err) {
        console.error('Error loading folder poster for', dir.name, err);
      }
    };

    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (!cancelled && queue.length) {
        const dir = queue.shift();
        if (dir) await loadOne(dir);
      }
    });
    Promise.all(workers).catch(() => {});
    return () => { cancelled = true; };
  }, [directories]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0f1419]">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-[#00A8E1] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white/70 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0f1419] p-6">
        <div className="text-center text-[#00A8E1] text-base mb-4">Error: {error}</div>
        <button 
          onClick={() => loadFiles(currentPath)}
          className="px-6 py-2.5 bg-[#00A8E1] text-white rounded hover:bg-[#0099d1] active:scale-95 transition-colors font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`w-full ${isHomepage ? 'flex-auto' : 'h-full'} flex flex-col bg-[#0f1419] text-white ${isHomepage ? '' : 'overflow-hidden'}`}>
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-white/5 bg-[#1a2332]/50 flex-shrink-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            {currentPath !== '/' && (
              <button 
                onClick={handleBack} 
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded transition-all active:scale-95 flex items-center gap-2 font-medium"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                Back
              </button>
            )}
            
            {/* Breadcrumb Navigation */}
            {currentPath !== '/' && (
            <div className="flex items-center gap-2 text-sm text-white/70 flex-wrap flex-1">
              {getBreadcrumbs().map((crumb, index, array) => (
                <React.Fragment key={crumb.path}>
                  {index > 0 && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  )}
                  {index === array.length - 1 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{crumb.name}</span>
                      {/* Favorite and Watch Later Buttons for current directory */}
                      {currentPath !== '/' && (
                        <div className="flex items-center gap-2 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const breadcrumbs = getBreadcrumbs();
                              const currentDir = {
                                type: 'directory',
                                path: currentPath,
                                name: breadcrumbs[breadcrumbs.length - 1].name
                              };
                              favoritesService.toggle(currentDir);
                              setFavorites(new Set(favoritesService.getAll().map(f => f.path)));
                              if (onFavoritesChange) onFavoritesChange();
                            }}
                            className={`p-1.5 rounded-full transition-colors ${
                              favorites.has(currentPath)
                                ? 'bg-[#00A8E1] text-white'
                                : 'bg-white/10 hover:bg-white/20 text-white/70 hover:text-white'
                            }`}
                            aria-label={favorites.has(currentPath) ? 'Remove from favorites' : 'Add to favorites'}
                            title={favorites.has(currentPath) ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill={favorites.has(currentPath) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const breadcrumbs = getBreadcrumbs();
                              const currentDir = {
                                type: 'directory',
                                path: currentPath,
                                name: breadcrumbs[breadcrumbs.length - 1].name
                              };
                              watchLaterService.toggle(currentDir);
                              setWatchLater(new Set(watchLaterService.getAll().map(f => f.path)));
                              if (onWatchLaterChange) onWatchLaterChange();
                            }}
                            className={`p-1.5 rounded-full transition-colors ${
                              watchLater.has(currentPath)
                                ? 'bg-[#00A8E1] text-white'
                                : 'bg-white/10 hover:bg-white/20 text-white/70 hover:text-white'
                            }`}
                            aria-label={watchLater.has(currentPath) ? 'Remove from watch later' : 'Add to watch later'}
                            title={watchLater.has(currentPath) ? 'Remove from watch later' : 'Add to watch later'}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/>
                              <polyline points="12 6 12 12 16 14"/>
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => onPathChange(crumb.path)}
                      className="hover:text-white transition-colors truncate max-w-[200px]"
                      title={crumb.name}
                    >
                      {crumb.name}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </div>
            )}
          </div>
          {searchQuery && (
            <div className="text-white/60 text-xs sm:text-sm">
              {directories.length + mediaFiles.length + otherFiles.length} result{(directories.length + mediaFiles.length + otherFiles.length) !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        
        {/* Content */}
        <div className={isHomepage ? 'flex-auto' : 'flex-1 overflow-y-auto'}>
          {/* Media Details Section - Show when all files belong to same media */}
          {mediaDetails && mediaFiles.length > 0 && (
            <div className="relative">
              {/* Backdrop */}
              {mediaDetails.backdropPath && (
                <div className="absolute inset-0 opacity-20">
                  <img
                    src={mediaDetails.backdropPath}
                    alt={mediaDetails.title}
                    className="w-full h-96 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-[#0f1419] to-transparent" />
                </div>
              )}
              
              <div className="relative z-10 px-4 sm:px-6 md:px-8 lg:px-12 py-6 sm:py-8">
                <div className="max-w-7xl mx-auto">
                  <div className="flex flex-col md:flex-row gap-6 md:gap-8 mb-6">
                    {/* Poster - Clickable to play first media file */}
                    {mediaDetails.posterPath && (
                      <div 
                        className="cursor-pointer group flex-shrink-0 mx-auto md:mx-0"
                        onClick={() => {
                          // Play the first media file
                          const firstMediaFile = mediaFiles[0];
                          if (firstMediaFile) {
                            onFileSelect(firstMediaFile);
                          }
                        }}
                      >
                        <div className="relative">
                          <img
                            src={mediaDetails.posterPath}
                            alt={mediaDetails.title}
                            className="w-32 sm:w-40 md:w-48 h-auto rounded-lg shadow-2xl transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-[#00A8E1]/0 group-hover:bg-[#00A8E1]/20 rounded-lg flex items-center justify-center transition-colors">
                            <div className="w-16 h-16 bg-[#00A8E1] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-white ml-1">
                                <polygon points="8 5 8 19 19 12 8 5"/>
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Info */}
                    <div className="flex-1">
                      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
                        {mediaDetails.title}
                      </h1>
                      
                      {mediaDetails.originalTitle && mediaDetails.originalTitle !== mediaDetails.title && (
                        <p className="text-lg text-white/70 mb-4">{mediaDetails.originalTitle}</p>
                      )}

                      {mediaDetails.tagline && (
                        <p className="text-lg italic text-white/60 mb-4">"{mediaDetails.tagline}"</p>
                      )}
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm sm:text-base text-white/80 mb-4">
                        {mediaDetails.releaseDate && (
                          <span>{new Date(mediaDetails.releaseDate).getFullYear()}</span>
                        )}
                        {mediaDetails.runtime && (
                          <>
                            <span>•</span>
                            <span>{Math.floor(mediaDetails.runtime / 60)}h {mediaDetails.runtime % 60}m</span>
                          </>
                        )}
                        {mediaDetails.rating > 0 && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <span>⭐</span>
                              <span className="font-semibold">{mediaDetails.rating.toFixed(1)}</span>
                              {mediaDetails.voteCount > 0 && (
                                <span className="text-white/60">({mediaDetails.voteCount.toLocaleString()})</span>
                              )}
                            </span>
                          </>
                        )}
      </div>
      
                      {mediaDetails.genres && mediaDetails.genres.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {mediaDetails.genres.map((genre, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 bg-[#00A8E1]/20 text-[#00A8E1] rounded-full text-sm border border-[#00A8E1]/30"
                            >
                              {genre}
                            </span>
                          ))}
                        </div>
                      )}

                      {mediaDetails.overview && (
                        <div className="mb-4">
                          <h2 className="text-xl font-semibold text-white mb-2">Overview</h2>
                          <p className="text-white/80 leading-relaxed">{mediaDetails.overview}</p>
                        </div>
                      )}

                      {/* Additional Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        {mediaDetails.status && (
                          <div>
                            <span className="text-white/60">Status: </span>
                            <span className="text-white/80">{mediaDetails.status}</span>
                          </div>
                        )}
                        {mediaDetails.mediaType === 'tv' && mediaDetails.numberOfSeasons && (
                          <div>
                            <span className="text-white/60">Seasons: </span>
                            <span className="text-white/80">{mediaDetails.numberOfSeasons}</span>
                          </div>
                        )}
                        {mediaDetails.mediaType === 'tv' && mediaDetails.numberOfEpisodes && (
                          <div>
                            <span className="text-white/60">Episodes: </span>
                            <span className="text-white/80">{mediaDetails.numberOfEpisodes}</span>
                          </div>
                        )}
                        {mediaDetails.budget && mediaDetails.budget > 0 && (
                          <div>
                            <span className="text-white/60">Budget: </span>
                            <span className="text-white/80">${mediaDetails.budget.toLocaleString()}</span>
                          </div>
                        )}
                        {mediaDetails.revenue && mediaDetails.revenue > 0 && (
                          <div>
                            <span className="text-white/60">Revenue: </span>
                            <span className="text-white/80">${mediaDetails.revenue.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Files Section - Between details and cast */}
          <div className="px-4 sm:px-6 md:px-8 lg:px-12 py-6 sm:py-8 border-t border-white/10">
            <div className="max-w-7xl mx-auto space-y-8">
              {/* Directories Section */}
              {directories.length > 0 && (
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">Folders</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                    {directories.map((dir, index) => {
                      const dirPoster = folderPosters[dir.path];
                      const dirName = getFullFileName(dir);
                      return (
                      <div
                        key={index}
                        className="group cursor-pointer"
                        onClick={() => handleFileClick(dir)}
                      >
                        <div className="relative aspect-[2/3] bg-gradient-to-br from-[#1a2332] to-[#0f1419] rounded-lg overflow-hidden border border-white/10 hover:border-[#00A8E1]/50 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-[#00A8E1]/20">
                          {dirPoster ? (
                            <img
                              src={dirPoster}
                              alt={dirName}
                              loading="lazy"
                              className="w-full h-full object-cover"
                              onError={() => {
                                // Broken poster URL: drop back to the emoji icon.
                                folderPosterCache.current[dir.path] = null;
                                setFolderPosters(prev => {
                                  if (!(dir.path in prev)) return prev;
                                  const next = { ...prev };
                                  delete next[dir.path];
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-6xl sm:text-7xl md:text-8xl opacity-80 group-hover:opacity-100 transition-opacity filter drop-shadow-lg">
                                {getFolderIcon(dirName)}
                              </span>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                            <p className="text-xs text-white font-medium truncate">{dirName}</p>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Media Files Section */}
              {mediaFiles.length > 0 && (
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">Movies & TV</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                    {mediaFiles.map((file, index) => {
                      const metadata = mediaMetadata[file.path];
                      const isLoadingMeta = loadingMetadata.has(file.path);
                      const posterFailed = failedPosters.has(file.path);
                      const posterUrl = posterFailed ? null : metadata?.posterPath;
                      const fileName = getFullFileName(file);
                      
                      return (
                        <div
                          key={index}
                          className="group cursor-pointer"
                          onClick={() => handleFileClick(file)}
                        >
                          <div className="relative aspect-[2/3] bg-gradient-to-br from-[#1a2332] to-[#0f1419] rounded-lg overflow-hidden border border-white/10 hover:border-[#00A8E1]/50 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-[#00A8E1]/20">
                            {/* Poster Image */}
                            {posterUrl ? (
                              <img
                                src={posterUrl}
                                alt={fileName}
                                className="w-full h-full object-cover"
                                onError={() => {
                                  // Broken poster URL: show the title text
                                  // instead of hiding the image (blank card).
                                  setFailedPosters(prev => {
                                    if (prev.has(file.path)) return prev;
                                    const next = new Set(prev);
                                    next.add(file.path);
                                    return next;
                                  });
                                }}
                              />
                            ) : isLoadingMeta ? (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-8 h-8 border-2 border-[#00A8E1] border-t-transparent rounded-full animate-spin"></div>
                              </div>
                            ) : (
                              <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
                                <p className="text-sm font-bold leading-snug text-white/90 line-clamp-4">{fileName}</p>
                              </div>
                            )}
                            
                            {/* Gradient Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                            
                            {/* Info Overlay on Hover - Show filename and size */}
                            <div className="absolute bottom-0 left-0 right-0 p-3 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-gradient-to-t from-black/95 to-transparent">
                              <h3 className="text-sm font-semibold text-white mb-1 line-clamp-2">{fileName}</h3>
                              <div className="text-xs text-white/70">
                                {formatSize(file.size)}
                              </div>
                            </div>
                            
                            {/* Play Button Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                              <div className="w-16 h-16 bg-[#00A8E1] rounded-full flex items-center justify-center shadow-xl transform scale-75 group-hover:scale-100 transition-transform duration-300">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-white ml-1">
                                  <polygon points="8 5 8 19 19 12 8 5"/>
                                </svg>
                              </div>
                            </div>
                            
                            {/* Quality Badge */}
                            {file.name.match(/1080p|720p|480p|2160p|4K/i) && (
                              <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/70 text-white text-xs font-semibold rounded">
                                {file.name.match(/2160p|4K/i) ? '4K' : file.name.match(/1080p/i) ? 'HD' : file.name.match(/720p/i) ? 'HD' : 'SD'}
                              </div>
                            )}
                          </div>
                          
                          {/* Title below card (mobile) - Show filename and size */}
                          <div className="mt-2 px-1 sm:hidden">
                            <p className="text-xs text-white/80 font-medium truncate">{fileName}</p>
                            <p className="text-xs text-white/50">{formatSize(file.size)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Other Files Section */}
              {otherFiles.length > 0 && (
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">Other Files</h2>
                  <div className="space-y-1">
                    {otherFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center p-3 bg-white/5 hover:bg-white/10 rounded cursor-pointer transition-all group"
                        onClick={() => handleFileClick(file)}
                      >
                        <div className="text-xl mr-3 text-white/60 group-hover:text-white/80">
                          📄
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white/90 truncate">{getFullFileName(file)}</div>
                          <div className="text-xs text-white/50">{formatSize(file.size)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {files.length === 0 && !loading && (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <p className="text-white/60 text-base">No files found</p>
                  </div>
                </div>
              )}
              
              {/* No Search Results */}
              {searchQuery && directories.length === 0 && mediaFiles.length === 0 && otherFiles.length === 0 && !loading && (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <svg 
                      className="w-16 h-16 text-white/20 mx-auto mb-4" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="text-white/60 text-base mb-2">No results found for "{searchQuery}"</p>
                    <p className="text-white/40 text-sm">Try a different search term</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cast Section */}
          {mediaDetails && mediaDetails.cast && mediaDetails.cast.length > 0 && (
            <div className="px-4 sm:px-6 md:px-8 lg:px-12 py-6 sm:py-8 border-t border-white/10">
              <div className="max-w-7xl mx-auto">
                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Cast</h2>
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {mediaDetails.cast.map((actor, idx) => (
                    <div key={idx} className="flex-shrink-0 text-center w-24 sm:w-28">
                      {actor.profilePath ? (
                        <img
                          src={actor.profilePath}
                          alt={actor.name}
                          className="w-20 sm:w-24 h-20 sm:w-24 rounded-full object-cover mb-2 mx-auto"
                        />
                      ) : (
                        <div className="w-20 sm:w-24 h-20 sm:w-24 rounded-full bg-white/10 mb-2 mx-auto flex items-center justify-center">
                          <span className="text-white/50 text-xs">No Image</span>
                        </div>
                      )}
                      <p className="text-sm text-white font-medium truncate">{actor.name}</p>
                      <p className="text-xs text-white/60 truncate">{actor.character}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Crew Section */}
          {mediaDetails && mediaDetails.crew && mediaDetails.crew.length > 0 && (
            <div className="px-4 sm:px-6 md:px-8 lg:px-12 py-6 sm:py-8 border-t border-white/10">
              <div className="max-w-7xl mx-auto">
                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Crew</h2>
                <div className="flex flex-wrap gap-4">
                  {mediaDetails.crew.map((member, idx) => (
                    <div key={idx} className="text-sm text-white/80">
                      <span className="font-medium">{member.name}</span>
                      <span className="text-white/60"> - {member.job}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

export default FileBrowser;
