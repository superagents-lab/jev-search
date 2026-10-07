import { createFileRoute } from '@tanstack/react-router';
import { rssXml } from '@/lib/changelog';

export const Route = createFileRoute('/changelog/rss.xml')({
  server: {
    handlers: {
      GET: () =>
        new Response(rssXml(), {
          headers: { 'Cache-Control': 'public, max-age=3600', 'Content-Type': 'application/rss+xml; charset=utf-8' },
        }),
    },
  },
});
