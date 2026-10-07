import { createFileRoute } from '@tanstack/react-router';
import { sitemapXml } from '@/lib/changelog';

/** Generated from the changelog so every entry is listed with its date; replaces the static public/sitemap.xml. */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () =>
        new Response(sitemapXml(), {
          headers: { 'Cache-Control': 'public, max-age=3600', 'Content-Type': 'application/xml; charset=utf-8' },
        }),
    },
  },
});
