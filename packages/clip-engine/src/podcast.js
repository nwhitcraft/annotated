import { execFile } from 'child_process';
import { promisify } from 'util';
import { formatTimestamp, validateClipRange } from '@annotated/shared';

const run = promisify(execFile);

export async function extractPodcastClip({ url, start = 0, end = 90, outFile }) {
  if (!url) throw new Error('url required');
  if (!outFile) throw new Error('outFile required');

  const range = validateClipRange(start, end);

  if (!range.valid) throw new Error(range.error);

  try {
    await run('yt-dlp', [
      '-x',
      '--audio-format',
      'mp3',
      '--download-sections',
      `*${formatTimestamp(range.start)}-${formatTimestamp(range.end)}`,
      '-o',
      outFile,
      '--force-overwrite',
      url,
    ], { timeout: 120000 });
  } catch {
    await run('ffmpeg', [
      '-i',
      url,
      '-ss',
      String(range.start),
      '-t',
      String(range.duration),
      '-c:a',
      'libmp3lame',
      '-q:a',
      '4',
      '-y',
      outFile,
    ], { timeout: 120000 });
  }

  return {
    startSec: range.start,
    endSec: range.end,
    duration: range.duration,
    type: 'podcast',
  };
}
