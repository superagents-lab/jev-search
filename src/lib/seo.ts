/** Hosted demo origin. Self-hosters replace this and the copy in `public/robots.txt`; the sitemap and changelog feed use it. */
export const SITE_ORIGIN = 'https://jev.s1.dev';
export const HOME_CANONICAL = `${SITE_ORIGIN}/`;
export const SITEMAP_URL = `${SITE_ORIGIN}/sitemap.xml`;
// Social networks cache the card by URL; bump the version whenever the image changes.
export const SHARE_IMAGE = `${SITE_ORIGIN}/og-home.png?v=3`;

/** Result URLs are queries, not documents. Allow crawling so the directive is visible. */
export const SEARCH_ROBOTS = 'noindex, follow';
