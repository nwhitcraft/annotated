// Article extraction via @mozilla/readability + jsdom
// Extracts readable content, metadata, and allows text selection for clipping

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

/**
 * Extract article content + metadata from a URL
 * @param {string} url - Article URL
 * @returns {{ url, title, byline, excerpt, content, textContent, siteName, thumbnail, domain, type }}
 */
export async function extractArticle(url) {
  if (!url) throw new Error('URL is required');

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // Extract with Readability
  const reader = new Readability(doc);
  const article = reader.parse();

  if (!article) {
    // Fallback: extract basic metadata even if Readability can't parse
    return extractBasicMeta(html, url);
  }

  // Extract og:image for thumbnail
  const ogImage = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image');
  const domain = new URL(url).hostname.replace(/^www\./, '');

  return {
    url,
    title: article.title || '',
    byline: article.byline || '',
    excerpt: article.excerpt || '',
    content: article.content || '',        // HTML content
    textContent: article.textContent || '', // Plain text
    siteName: article.siteName || domain,
    thumbnail: ogImage || '',
    domain,
    type: 'article',
  };
}

/**
 * Validate and constrain a text clip from an article
 * Max ~280 chars (roughly 1-2 sentences)
 */
export function constrainTextClip(text, maxChars = 280) {
  if (!text) return { valid: false, error: 'No text provided' };
  const trimmed = text.trim();
  if (trimmed.length === 0) return { valid: false, error: 'Empty text' };
  if (trimmed.length > maxChars) {
    return {
      valid: true,
      text: trimmed.slice(0, maxChars).replace(/\s+\S*$/, '') + '…',
      truncated: true,
      original_length: trimmed.length,
    };
  }
  return { valid: true, text: trimmed, truncated: false };
}

// Helpers

function extractMeta(html, property) {
  // Try property= first (og:), then name= (twitter:)
  const propMatch = html.match(
    new RegExp(`<meta[^>]*(?:property|name)=["']${escapeRegex(property)}["'][^>]*content=["']([^"']+)["']`, 'i')
  );
  if (propMatch) return propMatch[1];

  // Reversed attribute order
  const revMatch = html.match(
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escapeRegex(property)}["']`, 'i')
  );
  return revMatch?.[1] || '';
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBasicMeta(html, url) {
  const domain = new URL(url).hostname.replace(/^www\./, '');
  return {
    url,
    title: extractMeta(html, 'og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '',
    byline: extractMeta(html, 'author') || '',
    excerpt: extractMeta(html, 'og:description') || extractMeta(html, 'description') || '',
    content: '',
    textContent: '',
    siteName: extractMeta(html, 'og:site_name') || domain,
    thumbnail: extractMeta(html, 'og:image') || '',
    domain,
    type: 'article',
  };
}
