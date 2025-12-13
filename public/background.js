// Background service worker for browser extension
// This bypasses CORS restrictions by making requests from the extension context

const HTTP_SERVER_URL = 'http://cdn.dflix.live'; // Can be made configurable

// Listen for messages from the content script/page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetch') {
    handleFetch(request.url, request.options)
      .then(response => {
        // Convert Response to a serializable format
        return response.text().then(text => ({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          text: text
        }));
      })
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    // Return true to indicate we'll send a response asynchronously
    return true;
  }
  
  if (request.action === 'fetchHead') {
    handleFetchHead(request.url)
      .then(response => {
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        };
      })
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  }

  // Handle opening the app in a new tab
  if (request.action === 'openApp') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    sendResponse({ success: true });
    return true;
  }
});

// Listen for extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Open the app in a new tab (full page, not popup)
  chrome.tabs.create({ 
    url: chrome.runtime.getURL('index.html'),
    active: true  // Make it the active tab
  });
});

async function handleFetch(url, options = {}) {
  try {
    // Extension background scripts can make cross-origin requests without CORS
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      // Don't need mode: 'cors' in extension context
    });
    
    return response;
  } catch (error) {
    console.error('Background fetch error:', error);
    throw error;
  }
}

async function handleFetchHead(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
    });
    
    return response;
  } catch (error) {
    console.error('Background HEAD fetch error:', error);
    throw error;
  }
}
