export async function extractTweet(url) {
  if (!url) throw new Error('url required');

  const endpoint = new URL('https://publish.twitter.com/oembed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('omit_script', 'true');
  endpoint.searchParams.set('dnt', 'true');

  const response = await fetch(endpoint);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.errors?.[0]?.message || `Twitter oEmbed failed: ${response.status}`);
  }

  return {
    type: 'twitter',
    url,
    title: data.author_name ? `Post by ${data.author_name}` : 'X/Twitter post',
    author: data.author_name || '',
    authorUrl: data.author_url || '',
    html: data.html || '',
    thumbnail: data.thumbnail_url || '',
    provider: data.provider_name || 'X',
  };
}
