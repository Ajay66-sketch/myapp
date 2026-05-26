// src/middleware/cacheControl.js
// CDN Cache-Control headers configuration for static vs dynamic assets

function cacheControlMiddleware(req, res, next) {
  const url = req.originalUrl;

  // Static assets CDN caching (1 year)
  if (
    url.startsWith('/static/') ||
    url.endsWith('.png') ||
    url.endsWith('.jpg') ||
    url.endsWith('.jpeg') ||
    url.endsWith('.css') ||
    url.endsWith('.js') ||
    url.endsWith('.ico')
  ) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    // Dynamic APIs - strictly no caching for security and data freshness
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
}

module.exports = cacheControlMiddleware;
