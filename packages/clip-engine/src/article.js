import { extractDomain } from '@annotated/shared';

export async function extractArticle(url) {
  if (!url) throw new Error('url required');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Article request failed: ${response.status}`);

  const html = await response.text();
  const title = matchMeta(html, /<title[^>]*>([^<]+)<\/title>/i);
  const description = matchMeta(html, /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const ogDescription = matchMeta(html, /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  const thumbnail = matchMeta(html, /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  const author = matchMeta(html, /<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    url,
    title: decode(title),
    description: decode(description || ogDescription),
    excerpt: decode(description || ogDescription || text.slice(0, 280)),
    content: decode(text),
    author: decode(author),
    thumbnail,
    domain: extractDomain(url),
    type: 'article',
  };
}

function matchMeta(html, pattern) {
  return html.match(pattern)?.[1]?.trim() || '';
}

function decode(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}
