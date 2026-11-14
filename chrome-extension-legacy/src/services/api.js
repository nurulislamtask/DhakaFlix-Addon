// Auto-detect extension context and use appropriate API
// Extension API bypasses CORS, regular API may have CORS limitations

// Import both APIs
import { api as extensionApi } from './api-extension.js';
import { api as regularApi } from './api-regular.js';

// Check if running in extension context
// eslint-disable-next-line no-undef
const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

// Export the appropriate API based on context
export const api = isExtension ? extensionApi : regularApi;

// Log which API is being used
if (isExtension) {
  console.log('✓ Running in extension context - CORS bypass enabled');
} else {
  console.log('⚠ Running as web app - CORS restrictions may apply');
}
