import { execFile } from 'child_process';
import { promisify } from 'util';
import { formatTimestamp, validateClipRange } from '@annotated/shared';

const run = promisify(execFile);

export async function extractYouTubeClip({ url, start = 0, end = 90, outFile }) {
  if (!url) throw new Error('url required');
  if (!outFile) throw new Error('outFile required');

  const range = validateClipRange(start, end);
  if (!range.valid) throw new Error(range.error);

  const { stdout: info } = await run('yt-dlp', [
    '--no-download',
    '--print',
    'title',
    '--print',
    'thumbnail',
    '-f',
    'best[height<=240]',
    url,
  ], { timeout: 30000 });
  const [title = '', thumbnail = ''] = info.trim().split('\n');

  await run('yt-dlp', [
    '-f',
    'bestvideo[height<=240]+bestaudio/best[height<=240]',
    '--download-sections',
    `*${formatTimestamp(range.start)}-${formatTimestamp(range.end)}`,
    '-o',
    outFile,
    '--force-overwrite',
    url,
  ], { timeout: 120000 });

  return {
    title,
    thumbnail,
    startSec: range.start,
    endSec: range.end,
    duration: range.duration,
    type: 'youtube',
  };
}
