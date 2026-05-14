/**
 * Seed the database with realistic demo data.
 * Run: node packages/api/src/seed.js
 * Safe to re-run — uses INSERT OR IGNORE.
 */
import db from './db.js';

console.log('Seeding database...');

// --- Users ---
const users = [
  { id: 'hZTIgPwtkZPF', username: 'mayadesai', display_name: 'Maya Desai', avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=80', bio: 'Editor, policy reader, and collector of sentences that explain more than they should.', provider: 'google', provider_id: 'demo-google-1', email: 'maya@annotated.com' },
  { id: 'jonah', username: 'jonahlee', display_name: 'Jonah Lee', avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=96&q=80', bio: 'Writing about memory, attention, and the technologies that keep both under pressure.', provider: 'twitter', provider_id: 'demo-twitter-jonah', email: null },
  { id: 'leila', username: 'leilahaddad', display_name: 'Leila Haddad', avatar_url: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=96&q=80', bio: 'Foreign policy notes, energy maps, and the occasional sentence worth arguing with.', provider: 'twitter', provider_id: 'demo-twitter-leila', email: null },
  { id: 'david', username: 'davidng', display_name: 'David Ng', avatar_url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=96&q=80', bio: 'Economics editor watching AI discourse become labor discourse in real time.', provider: 'google', provider_id: 'demo-google-david', email: 'david@annotated.com' },
  { id: 'rachel', username: 'rachelkim', display_name: 'Rachel Kim', avatar_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=96&q=80', bio: 'Covering macro at the intersection of policy and markets.', provider: 'google', provider_id: 'demo-google-rachel', email: 'rachel@annotated.com' },
  { id: 'marco', username: 'marcosilva', display_name: 'Marco Silva', avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=96&q=80', bio: 'Science writer. Climate data and the stories it tells.', provider: 'twitter', provider_id: 'demo-twitter-marco', email: null },
  { id: 'ina', username: 'inamorales', display_name: 'Ina Morales', avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=96&q=80', bio: 'Product person turned media critic. Interested in how platforms shape taste.', provider: 'google', provider_id: 'demo-google-ina', email: 'ina@annotated.com' },
];

const insertUser = db.prepare(`INSERT OR IGNORE INTO users (id, username, display_name, avatar_url, bio, provider, provider_id, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
for (const u of users) {
  insertUser.run(u.id, u.username, u.display_name, u.avatar_url, u.bio, u.provider, u.provider_id, u.email);
}
console.log(`  ✓ ${users.length} users`);

// --- Annotations ---
const annotations = [
  {
    id: 'I6KyT-Ah5Wna', user_id: 'hZTIgPwtkZPF',
    source_url: 'https://www.ft.com/content/global-economy-resilience',
    source_title: 'Why the global economy keeps defying the pessimists',
    source_type: 'article', source_domain: 'ft.com',
    source_thumbnail: 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=480&q=80',
    clip_text: 'The resilience of consumer spending, the adaptability of businesses and the gradual easing of inflationary pressures have combined to produce outcomes that many forecasters did not anticipate.',
    commentary: 'Pessimism sells, but it is not a strategy. The real story is adaptation: boring, decentralized and unglamorous.',
    like_count: 42, comment_count: 3, pin_count: 8,
    created_at: '2026-05-10 07:08:15',
  },
  {
    id: 'forgetting-thread', user_id: 'jonah',
    source_url: 'https://aeon.co/essays/the-case-for-forgetting',
    source_title: 'The case for forgetting in a world that never stops recording',
    source_type: 'article', source_domain: 'aeon.co',
    source_thumbnail: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=480&q=80',
    clip_text: 'Memory, we think, makes us who we are. But forgetting is also an essential part of the human condition, shaping our health, our relationships and even our capacity for creativity.',
    commentary: 'We romanticize memory and pathologize forgetting. But forgetting is not failure, it is a form of self-preservation.',
    like_count: 35, comment_count: 2, pin_count: 6,
    created_at: '2026-05-10 04:42:00',
  },
  {
    id: 'minerals-map', user_id: 'leila',
    source_url: 'https://www.foreignaffairs.com/critical-minerals',
    source_title: 'The new geopolitics of critical minerals',
    source_type: 'article', source_domain: 'foreignaffairs.com',
    source_thumbnail: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=480&q=80',
    clip_text: 'Control over lithium, cobalt and rare earths is the defining resource competition of the 21st century.',
    commentary: 'Energy security was yesterday. The mineral map will redraw the alliances of tomorrow.',
    like_count: 28, comment_count: 1, pin_count: 4,
    created_at: '2026-05-09 15:30:00',
  },
  {
    id: 'ai-not-obsolete', user_id: 'david',
    source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    source_title: 'AI will not make us obsolete — The Economist',
    source_type: 'youtube', source_domain: 'youtube.com',
    source_thumbnail: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=480&q=80',
    clip_text: null,
    clip_start_sec: 312, clip_end_sec: 371,
    commentary: 'The question is not man or machine. It is which humans we choose to become.',
    like_count: 31, comment_count: 2, pin_count: 7,
    created_at: '2026-05-09 12:05:00',
  },
  {
    id: 'podcast-signal', user_id: 'rachel',
    source_url: 'https://podcasts.apple.com/us/podcast/the-daily/id1200361736',
    source_title: 'The Daily: What the jobs report really means',
    source_type: 'podcast', source_domain: 'podcasts.apple.com',
    source_thumbnail: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=480&q=80',
    clip_text: null,
    clip_start_sec: 480, clip_end_sec: 555,
    commentary: 'The headline number is noise. The composition of who is getting hired — and where — tells the real story about where this economy is going.',
    like_count: 19, comment_count: 1, pin_count: 3,
    created_at: '2026-05-09 08:15:00',
  },
  {
    id: 'climate-silence', user_id: 'marco',
    source_url: 'https://www.theatlantic.com/science/climate-reporting-gap/',
    source_title: 'The climate story the media refuses to tell',
    source_type: 'article', source_domain: 'theatlantic.com',
    source_thumbnail: 'https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?auto=format&fit=crop&w=480&q=80',
    clip_text: 'The most consequential environmental story of the decade is being covered like a weather report — episodic, localized, and stripped of its structural causes.',
    commentary: 'We have the data. We have the models. What we lack is a media ecosystem willing to hold attention on a slow-moving crisis. Annotation is an act of attention.',
    like_count: 24, comment_count: 2, pin_count: 5,
    created_at: '2026-05-08 22:00:00',
  },
  {
    id: 'platform-taste', user_id: 'ina',
    source_url: 'https://www.youtube.com/watch?v=abc123',
    source_title: 'How TikTok Broke the Taste Economy — Bon Appétit',
    source_type: 'youtube', source_domain: 'youtube.com',
    source_thumbnail: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=480&q=80',
    clip_text: null,
    clip_start_sec: 145, clip_end_sec: 220,
    commentary: 'The algorithm does not curate taste. It manufactures the illusion of discovery while flattening everything into the same dopamine shape.',
    like_count: 38, comment_count: 4, pin_count: 9,
    created_at: '2026-05-08 18:30:00',
  },
];

const insertAnnotation = db.prepare(`INSERT OR IGNORE INTO annotations (id, user_id, source_url, source_title, source_type, source_domain, source_thumbnail, clip_text, clip_start_sec, clip_end_sec, clip_media_path, commentary, like_count, comment_count, pin_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
for (const a of annotations) {
  insertAnnotation.run(
    a.id, a.user_id, a.source_url, a.source_title, a.source_type, a.source_domain,
    a.source_thumbnail || null, a.clip_text || null, a.clip_start_sec || null,
    a.clip_end_sec || null, a.clip_media_path || null, a.commentary,
    a.like_count || 0, a.comment_count || 0, a.pin_count || 0, a.created_at,
  );
}
console.log(`  ✓ ${annotations.length} annotations`);

// --- Comments ---
const comments = [
  // On "Pessimism sells" (I6KyT-Ah5Wna)
  { id: 'c-econ-1', annotation_id: 'I6KyT-Ah5Wna', user_id: 'rachel', body: 'The adaptation point is exactly what gets missed in daily coverage. It is not dramatic enough to trend, but it compounds.', parent_id: null, created_at: '2026-05-10 08:04:00' },
  { id: 'c-econ-2', annotation_id: 'I6KyT-Ah5Wna', user_id: 'marco', body: 'Right. We keep looking for a single heroic intervention when the story is thousands of small adjustments.', parent_id: 'c-econ-1', created_at: '2026-05-10 08:12:00' },
  { id: 'c-econ-3', annotation_id: 'I6KyT-Ah5Wna', user_id: 'hZTIgPwtkZPF', body: 'And that is why the source quote matters. It grounds the optimism in boring operating reality.', parent_id: 'c-econ-2', created_at: '2026-05-10 08:16:00' },

  // On "Forgetting" (forgetting-thread)
  { id: 'c-forget-1', annotation_id: 'forgetting-thread', user_id: 'ina', body: 'This is also a good example of why annotations need the clip attached. The take is stronger because you can inspect the report.', parent_id: null, created_at: '2026-05-10 08:37:00' },
  { id: 'c-forget-2', annotation_id: 'forgetting-thread', user_id: 'david', body: 'The relationship between forgetting and creativity is worth a whole thread. Not everything worth remembering is worth keeping.', parent_id: null, created_at: '2026-05-10 09:02:00' },

  // On "Minerals map" (minerals-map)
  { id: 'c-mineral-1', annotation_id: 'minerals-map', user_id: 'jonah', body: 'The Congo cobalt supply chain alone is a masterclass in how resource geography shapes power.', parent_id: null, created_at: '2026-05-09 16:15:00' },

  // On "AI not obsolete" (ai-not-obsolete)
  { id: 'c-ai-1', annotation_id: 'ai-not-obsolete', user_id: 'hZTIgPwtkZPF', body: 'This is one of the better takes on AI and labor I have seen. The framing matters.', parent_id: null, created_at: '2026-05-09 13:00:00' },
  { id: 'c-ai-2', annotation_id: 'ai-not-obsolete', user_id: 'rachel', body: 'Agreed, but the "which humans" question lands differently depending on where you sit in the income distribution.', parent_id: 'c-ai-1', created_at: '2026-05-09 13:20:00' },

  // On "Podcast signal" (podcast-signal)
  { id: 'c-pod-1', annotation_id: 'podcast-signal', user_id: 'marco', body: 'The composition point is key. The headline jobs number tells you almost nothing about economic health.', parent_id: null, created_at: '2026-05-09 09:00:00' },

  // On "Climate silence" (climate-silence)
  { id: 'c-climate-1', annotation_id: 'climate-silence', user_id: 'leila', body: 'This pairs well with the Foreign Affairs piece on minerals. The resource and climate stories are the same story.', parent_id: null, created_at: '2026-05-09 00:15:00' },
  { id: 'c-climate-2', annotation_id: 'climate-silence', user_id: 'ina', body: '"Annotation is an act of attention." That line is doing a lot of work and it earns it.', parent_id: null, created_at: '2026-05-09 01:00:00' },

  // On "Platform taste" (platform-taste)
  { id: 'c-taste-1', annotation_id: 'platform-taste', user_id: 'jonah', body: 'The dopamine shape metaphor is exactly right. Every feed starts to look the same because the optimization target is the same.', parent_id: null, created_at: '2026-05-08 19:00:00' },
  { id: 'c-taste-2', annotation_id: 'platform-taste', user_id: 'david', body: 'And yet the platforms would argue they are giving people what they want. The problem is "want" measured in milliseconds.', parent_id: 'c-taste-1', created_at: '2026-05-08 19:30:00' },
  { id: 'c-taste-3', annotation_id: 'platform-taste', user_id: 'hZTIgPwtkZPF', body: 'This is why annotation platforms matter. The act of clipping and writing is slower than liking, and that slowness is the whole point.', parent_id: null, created_at: '2026-05-08 20:00:00' },
  { id: 'c-taste-4', annotation_id: 'platform-taste', user_id: 'rachel', body: 'I would push back slightly — curation at scale always homogenizes, whether the curator is an algorithm or an editor. The question is transparency.', parent_id: 'c-taste-3', created_at: '2026-05-08 20:30:00' },
];

const insertComment = db.prepare(`INSERT OR IGNORE INTO comments (id, annotation_id, user_id, body, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
for (const c of comments) {
  insertComment.run(c.id, c.annotation_id, c.user_id, c.body, c.parent_id, c.created_at);
}
console.log(`  ✓ ${comments.length} comments`);

// --- Follows ---
const follows = [
  ['hZTIgPwtkZPF', 'jonah'],
  ['hZTIgPwtkZPF', 'leila'],
  ['hZTIgPwtkZPF', 'david'],
  ['jonah', 'hZTIgPwtkZPF'],
  ['jonah', 'leila'],
  ['leila', 'hZTIgPwtkZPF'],
  ['leila', 'david'],
  ['david', 'hZTIgPwtkZPF'],
  ['david', 'rachel'],
  ['rachel', 'hZTIgPwtkZPF'],
  ['rachel', 'marco'],
  ['marco', 'hZTIgPwtkZPF'],
  ['marco', 'ina'],
  ['ina', 'hZTIgPwtkZPF'],
  ['ina', 'jonah'],
];

const insertFollow = db.prepare(`INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)`);
for (const [a, b] of follows) {
  insertFollow.run(a, b);
}
console.log(`  ✓ ${follows.length} follows`);

// --- Likes ---
const likes = [
  ['hZTIgPwtkZPF', 'forgetting-thread'],
  ['hZTIgPwtkZPF', 'platform-taste'],
  ['jonah', 'I6KyT-Ah5Wna'],
  ['jonah', 'minerals-map'],
  ['jonah', 'platform-taste'],
  ['leila', 'I6KyT-Ah5Wna'],
  ['leila', 'climate-silence'],
  ['david', 'I6KyT-Ah5Wna'],
  ['david', 'forgetting-thread'],
  ['david', 'platform-taste'],
  ['rachel', 'I6KyT-Ah5Wna'],
  ['rachel', 'ai-not-obsolete'],
  ['marco', 'minerals-map'],
  ['marco', 'podcast-signal'],
  ['ina', 'I6KyT-Ah5Wna'],
  ['ina', 'forgetting-thread'],
  ['ina', 'climate-silence'],
];

const insertLike = db.prepare(`INSERT OR IGNORE INTO likes (user_id, annotation_id) VALUES (?, ?)`);
for (const [u, a] of likes) {
  insertLike.run(u, a);
}
console.log(`  ✓ ${likes.length} likes`);

console.log('Done. Database seeded.');
