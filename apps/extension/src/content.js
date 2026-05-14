// Content script — shortcut-driven clipping mode, source metadata, and media time.

const API_BASE = 'http://localhost:3080';
const WEB_BASE = 'http://localhost:3090';
const COMPOSER_ID = 'annotated-page-composer';
const OVERLAY_ID = 'annotated-clipping-overlay';
const RECORDING_BUBBLE_ID = 'annotated-recording-bubble';
const SHORT_CLIP_SECONDS = 90;
const RECORDING_FRAME_RATE = 24;
const RECORDING_WIDTH = 426;
const RECORDING_HEIGHT = 240;
const MAX_COMMENTARY_LENGTH = 360;
const ANNOTATION_TYPES = ['Opinion', 'Analysis', 'Fact Check', 'Context', 'Correction', 'Breaking'];
const VIDEO_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];
const AUDIO_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
];

let lastUrl = window.location.href;
let authToken = '';
let authUser = null;

// Load auth state on init
chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' }, (response) => {
  if (chrome.runtime.lastError) return;
  authToken = response?.token || '';
  authUser = response?.user || null;
  void refreshAuthUser();
});

// Listen for auth updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_CLIPPING') enterClippingMode();
  if (msg.type === 'EXIT_CLIPPING') exitClippingMode();
  if (msg.type === 'AUTH_UPDATED') {
    authUser = msg.user || null;
    chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' }, (response) => {
      if (chrome.runtime.lastError) return;
      authToken = response?.token || '';
      authUser = response?.user || null;
      void refreshAuthUser();
    });
  }
});

// Auth bridge: on localhost pages, listen for JWT handoff from web app
if (window.location.origin === WEB_BASE || window.location.origin === API_BASE) {
  window.postMessage({ type: 'ANNOTATED_EXTENSION_READY' }, window.location.origin);
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== 'ANNOTATED_AUTH_TOKEN' || !event.data.token) return;
    chrome.runtime.sendMessage({
      type: 'STORE_AUTH_TOKEN',
      token: event.data.token,
      user: event.data.user || null,
    });
    authToken = event.data.token;
    authUser = event.data.user || null;
  });
}
let clippingMode = false;
let activeClip = null;
let activeRange = null;
let selecting = false;
let selectionTimer = null;
let trackingFrame = null;
let selectedType = 'Opinion';
let mediaSession = null;
let activeAnchorElement = null;

function detectSourceType(url) {
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/i.test(url)) return 'youtube';
  if (/spotify\.com|podcasts\.apple\.com|overcast\.fm|pocketcasts|castbox|podbean|anchor\.fm|podcasts\.google/i.test(url)) return 'podcast';
  if (/\.mp3$|\.m4a$|\.wav$|\/audio\//i.test(url)) return 'podcast';
  return 'article';
}

function getPageInfo() {
  const canonical = document.querySelector('link[rel="canonical"]')?.href || window.location.href;
  const title = meta(['og:title', 'twitter:title']) || document.title.replace(/\s+-\s+YouTube$/, '');
  const siteName = meta(['og:site_name', 'application-name']) || window.location.hostname.replace(/^www\./, '');
  const publishedAt = meta(['article:published_time', 'datePublished', 'date', 'pubdate']);
  const author = meta(['author', 'article:author', 'parsely-author', 'byl']);
  const thumbnail = meta(['og:image', 'twitter:image']);

  return {
    type: 'PAGE_INFO',
    url: canonical,
    pageUrl: window.location.href,
    title,
    sourceType: detectSourceType(window.location.href),
    domain: new URL(canonical, window.location.href).hostname.replace(/^www\./, ''),
    siteName,
    author,
    publishedAt,
    thumbnail,
  };
}

function meta(names) {
  for (const name of names) {
    const node = document.querySelector(`meta[name="${cssEscape(name)}"], meta[property="${cssEscape(name)}"], meta[itemprop="${cssEscape(name)}"]`);
    const value = node?.getAttribute('content')?.trim();
    if (value) return value;
  }
  return '';
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

function currentMedia() {
  const media = [...document.querySelectorAll('video, audio')]
    .filter((item) => Number.isFinite(item.currentTime) && item.readyState > 0)
    .sort((a, b) => mediaScore(b) - mediaScore(a))[0];
  if (!media) return null;

  const start = Math.max(0, Math.floor(media.currentTime || 0));
  return {
    element: media,
    start,
    end: start + SHORT_CLIP_SECONDS,
    isVideo: media.tagName.toLowerCase() === 'video',
    isPlaying: !media.paused && !media.ended,
  };
}

function mediaScore(media) {
  const rect = media.getBoundingClientRect();
  const area = Math.max(0, rect.width) * Math.max(0, rect.height);
  const playing = !media.paused && !media.ended ? 1_000_000 : 0;
  const viewport = rect.bottom > 0 && rect.top < window.innerHeight ? 100_000 : 0;
  return playing + viewport + area;
}

function clipFromSelection(openPanel = false) {
  const selection = window.getSelection();
  const text = selection?.toString().replace(/\s+/g, ' ').trim();
  if (!selection || !text || selection.rangeCount === 0) return null;

  const page = getPageInfo();
  const media = currentMedia();
  return {
    type: 'TEXT_SELECTED',
    text,
    url: page.url,
    pageUrl: page.pageUrl,
    title: page.title,
    sourceType: page.sourceType,
    domain: page.domain,
    siteName: page.siteName,
    author: page.author,
    publishedAt: page.publishedAt,
    thumbnail: page.thumbnail,
    clipStartSec: media?.start ?? null,
    clipEndSec: media?.end ?? null,
    selectedAt: Date.now(),
    openPanel,
  };
}

function clipFromMedia(openPanel = false) {
  const page = getPageInfo();
  const media = currentMedia();
  if (!media) return null;
  if (page.sourceType === 'article' && !media.isPlaying) return null;

  const sourceType = page.sourceType === 'article'
    ? (media.isVideo ? 'video' : 'podcast')
    : page.sourceType;

  return {
    type: 'TEXT_SELECTED',
    text: '',
    url: page.url,
    pageUrl: page.pageUrl,
    title: page.title,
    sourceType,
    domain: page.domain,
    siteName: page.siteName,
    author: page.author,
    publishedAt: page.publishedAt,
    thumbnail: page.thumbnail,
    clipStartSec: media.start,
    clipEndSec: media.end,
    selectedAt: Date.now(),
    openPanel,
  };
}

function enterClippingMode() {
  if (isAnnotatedAppPage()) return;

  if (mediaSession) {
    void stopMediaRecording('shortcut');
    return;
  }

  clippingMode = true;
  activeClip = null;
  activeRange = null;
  activeAnchorElement = null;
  document.documentElement.classList.add('annotated-clipping-mode');

  if (captureCurrentSelection()) return;

  const mediaClip = clipFromMedia(false);
  if (mediaClip) {
    const media = currentMedia();
    if (media) startMediaRecording(mediaClip, media);
  }
}

function exitClippingMode() {
  if (mediaSession) cancelMediaRecording();
  clippingMode = false;
  activeClip = null;
  activeRange = null;
  activeAnchorElement = null;
  window.clearTimeout(selectionTimer);
  if (trackingFrame) cancelAnimationFrame(trackingFrame);
  trackingFrame = null;
  document.documentElement.classList.remove('annotated-clipping-mode');
  document.documentElement.classList.remove('annotated-media-recording-mode');
  document.getElementById(OVERLAY_ID)?.remove();
  document.getElementById(COMPOSER_ID)?.remove();
  document.getElementById(RECORDING_BUBBLE_ID)?.remove();
  window.getSelection()?.removeAllRanges();
}

function cancelMediaRecording() {
  const session = mediaSession;
  if (!session) return;
  session.stopping = true;
  window.clearInterval(session.intervalId);
  if (session.drawFrame) cancelAnimationFrame(session.drawFrame);
  try {
    if (session.recorder && session.recorder.state !== 'inactive') session.recorder.stop();
  } catch {
    // best-effort cancellation
  }
  stopCaptureTracks(session);
  mediaSession = null;
  document.getElementById(RECORDING_BUBBLE_ID)?.remove();
  document.documentElement.classList.remove('annotated-media-recording-mode');
}

function startMediaRecording(clip, media) {
  activeRange = null;
  activeAnchorElement = media.element;
  document.getElementById(COMPOSER_ID)?.remove();
  document.getElementById(OVERLAY_ID)?.remove();
  document.documentElement.classList.add('annotated-media-recording-mode');

  mediaSession = {
    clip,
    element: media.element,
    startedAt: Date.now(),
    startSec: media.start,
    endSec: media.start,
    chunks: [],
    blob: null,
    mimeType: '',
    recorder: null,
    captureStream: null,
    outputStream: null,
    canvas: null,
    drawFrame: null,
    intervalId: null,
    stopping: false,
    captureError: '',
  };

  if (media.isVideo) startVideoCapture(mediaSession);
  else startAudioCapture(mediaSession);
  showRecordingBubble();
  mediaSession.intervalId = window.setInterval(updateRecordingBubble, 250);
  updateRecordingBubble();
}

function startVideoCapture(session) {
  try {
    const captureStream = session.element.captureStream?.() || session.element.mozCaptureStream?.();
    if (!captureStream) throw new Error('captureStream is unavailable for this video');

    session.captureStream = captureStream;
    const canvas = document.createElement('canvas');
    canvas.width = RECORDING_WIDTH;
    canvas.height = RECORDING_HEIGHT;
    session.canvas = canvas;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context || !canvas.captureStream) throw new Error('Canvas recording is unavailable');

    const outputStream = canvas.captureStream(RECORDING_FRAME_RATE);
    for (const track of captureStream.getAudioTracks()) outputStream.addTrack(track);
    session.outputStream = outputStream;

    const mimeType = pickVideoMimeType();
    const recorderOptions = {
      videoBitsPerSecond: 350_000,
      audioBitsPerSecond: 64_000,
    };
    if (mimeType) recorderOptions.mimeType = mimeType;
    const recorder = new MediaRecorder(outputStream, recorderOptions);
    session.mimeType = mimeType;
    session.recorder = recorder;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) session.chunks.push(event.data);
    });
    recorder.addEventListener('error', () => {
      session.captureError = 'Recording failed';
    });

    const draw = () => {
      if (mediaSession !== session || session.stopping) return;
      try {
        context.fillStyle = '#000';
        context.fillRect(0, 0, RECORDING_WIDTH, RECORDING_HEIGHT);
        context.drawImage(session.element, 0, 0, RECORDING_WIDTH, RECORDING_HEIGHT);
      } catch {
        session.captureError = 'Canvas capture failed';
      }
      session.drawFrame = requestAnimationFrame(draw);
    };

    draw();
    recorder.start(1000);
  } catch (error) {
    session.captureError = error.message || 'Recording unavailable';
    stopCaptureTracks(session);
  }
}

function startAudioCapture(session) {
  try {
    const captureStream = session.element.captureStream?.() || session.element.mozCaptureStream?.();
    if (!captureStream) throw new Error('captureStream is unavailable for this audio');

    session.captureStream = captureStream;
    const mimeType = pickAudioMimeType();
    const recorderOptions = {
      audioBitsPerSecond: 64_000,
    };
    if (mimeType) recorderOptions.mimeType = mimeType;

    const recorder = new MediaRecorder(captureStream, recorderOptions);
    session.mimeType = mimeType || 'audio/webm';
    session.recorder = recorder;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) session.chunks.push(event.data);
    });
    recorder.addEventListener('error', () => {
      session.captureError = 'Audio recording failed';
    });

    recorder.start(1000);
  } catch (error) {
    session.captureError = error.message || 'Audio recording unavailable';
    stopCaptureTracks(session);
  }
}

function pickVideoMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return VIDEO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function pickAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return AUDIO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function showRecordingBubble() {
  document.getElementById(RECORDING_BUBBLE_ID)?.remove();
  const bubble = document.createElement('section');
  bubble.id = RECORDING_BUBBLE_ID;
  bubble.className = 'annotated-recording-bubble';
  bubble.setAttribute('aria-label', 'Media clip recording');
  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '') || /Mac/i.test(navigator.userAgent || '');
  const sourceLabel = mediaSession?.clip?.sourceType === 'podcast' ? 'Podcast clip' : 'Video clip';
  bubble.innerHTML = `
    <div class="annotated-recording-bubble__head">
      <div class="annotated-recording-bubble__badge">
        <span class="annotated-recording-bubble__dot" aria-hidden="true"></span>
        <span class="annotated-recording-bubble__label">Recording</span>
      </div>
      <span class="annotated-recording-bubble__source">${sourceLabel}</span>
    </div>
    <div class="annotated-recording-bubble__timer-block">
      <span class="annotated-recording-bubble__time">${formatClock(SHORT_CLIP_SECONDS)}</span>
      <span class="annotated-recording-bubble__meta">remaining</span>
    </div>
    <div class="annotated-recording-bubble__wave" aria-hidden="true">
      ${[-1, -0.85, -0.7, -0.55, -0.4, -0.25, -0.1, -0.25, -0.4, -0.55, -0.7, -0.85, -1].map((delay) => `<i style="animation-delay:${delay}s"></i>`).join('')}
    </div>
    <div class="annotated-recording-bubble__footer">
      <div class="annotated-recording-bubble__hint">
        <span>or press</span>
        <span class="annotated-recording-bubble__keys" aria-label="${isMac ? 'Option Shift X' : 'Control Shift X'}">
          ${isMac
            ? '<span class="annotated-recording-bubble__key">⌥</span><span class="annotated-recording-bubble__key">⇧</span><span class="annotated-recording-bubble__key">X</span>'
            : '<span class="annotated-recording-bubble__key">Ctrl</span><span class="annotated-recording-bubble__key">⇧</span><span class="annotated-recording-bubble__key">X</span>'}
        </span>
      </div>
      <button class="annotated-recording-bubble__stop" type="button" aria-label="Stop recording">
        <span class="annotated-recording-bubble__stop-icon" aria-hidden="true"></span>
        <span>Stop</span>
      </button>
    </div>
    <p class="annotated-recording-bubble__note" hidden></p>
  `;
  bubble.addEventListener('mousedown', (event) => event.stopPropagation());
  bubble.querySelector('button').addEventListener('click', () => {
    void stopMediaRecording('button');
  });
  document.documentElement.append(bubble);
  positionRecordingBubble();
}

function updateRecordingBubble() {
  if (!mediaSession) return;

  const elapsed = Math.min(SHORT_CLIP_SECONDS, (Date.now() - mediaSession.startedAt) / 1000);
  const current = Number(mediaSession.element.currentTime);
  mediaSession.endSec = Number.isFinite(current) && current > mediaSession.startSec
    ? Math.min(current, mediaSession.startSec + SHORT_CLIP_SECONDS)
    : mediaSession.startSec + elapsed;

  const bubble = document.getElementById(RECORDING_BUBBLE_ID);
  if (bubble) {
    const remaining = Math.max(0, SHORT_CLIP_SECONDS - elapsed);
    const timer = bubble.querySelector('.annotated-recording-bubble__time');
    timer.textContent = formatClock(remaining);
    timer.classList.toggle('warn', remaining <= 10);
    const note = bubble.querySelector('.annotated-recording-bubble__note');
    if (mediaSession.captureError) {
      note.hidden = false;
      note.textContent = 'Recording fallback will use source timestamps.';
    }
  }

  positionRecordingBubble();
  if (elapsed >= SHORT_CLIP_SECONDS) void stopMediaRecording('timer');
}

function positionRecordingBubble() {
  const bubble = document.getElementById(RECORDING_BUBBLE_ID);
  if (!bubble) return;

  const margin = 14;
  const width = Math.min(440, window.innerWidth - margin * 2);
  const height = bubble.offsetHeight || 220;
  const left = Math.max(margin, (window.innerWidth - width) / 2);
  const top = Math.max(margin, (window.innerHeight - height) / 2);

  bubble.style.width = `${width}px`;
  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
}

async function stopMediaRecording(reason) {
  const session = mediaSession;
  if (!session || session.stopping) return;
  session.stopping = true;
  window.clearInterval(session.intervalId);

  const bubble = document.getElementById(RECORDING_BUBBLE_ID);
  bubble?.querySelector('button')?.setAttribute('disabled', 'true');
  bubble?.classList.add('finished');
  const label = bubble?.querySelector('.annotated-recording-bubble__label');
  if (label) label.textContent = 'Preparing clip...';

  const elapsed = Math.min(SHORT_CLIP_SECONDS, (Date.now() - session.startedAt) / 1000);
  const current = Number(session.element.currentTime);
  const endSec = Number.isFinite(current) && current > session.startSec
    ? Math.min(current, session.startSec + SHORT_CLIP_SECONDS)
    : session.startSec + elapsed;

  await stopVideoCapture(session);
  stopCaptureTracks(session);

  const clip = {
    ...session.clip,
    clipStartSec: session.startSec,
    clipEndSec: Math.max(session.startSec + 1, endSec),
    mediaDurationS: Math.max(1, Math.min(SHORT_CLIP_SECONDS, endSec - session.startSec)),
    recordingBlob: session.blob,
    recordingMimeType: session.mimeType || session.blob?.type || (session.clip.sourceType === 'podcast' ? 'audio/webm' : 'video/webm'),
    recordingError: session.captureError,
    stoppedBy: reason,
  };

  mediaSession = null;
  activeClip = clip;
  activeRange = null;
  activeAnchorElement = session.element;
  document.documentElement.classList.remove('annotated-media-recording-mode');
  document.getElementById(RECORDING_BUBBLE_ID)?.remove();

  const rect = session.element.getBoundingClientRect();
  showComposer(rect && rect.width ? rect : centerRect());
}

async function stopVideoCapture(session) {
  if (session.drawFrame) cancelAnimationFrame(session.drawFrame);
  const fallbackType = session.mimeType || (session.clip.sourceType === 'podcast' ? 'audio/webm' : 'video/webm');
  if (!session.recorder || session.recorder.state === 'inactive') {
    if (session.chunks.length) session.blob = new Blob(session.chunks, { type: fallbackType });
    return;
  }

  await new Promise((resolve) => {
    const done = () => {
      if (session.chunks.length) session.blob = new Blob(session.chunks, { type: fallbackType });
      resolve();
    };
    session.recorder.addEventListener('stop', done, { once: true });
    try {
      session.recorder.requestData();
      session.recorder.stop();
    } catch {
      done();
    }
  });
}

function isAnnotatedAppPage() {
  const hostname = window.location.hostname.replace(/^www\./, '');
  return window.location.origin === WEB_BASE
    || window.location.origin === API_BASE
    || hostname === 'annotated.com';
}

function stopCaptureTracks(session) {
  for (const stream of [session.captureStream, session.outputStream]) {
    for (const track of stream?.getTracks?.() || []) track.stop();
  }
}

function createOverlay(rect) {
  document.getElementById(OVERLAY_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="annotated-pane annotated-pane-top"></div>
    <div class="annotated-pane annotated-pane-right"></div>
    <div class="annotated-pane annotated-pane-bottom"></div>
    <div class="annotated-pane annotated-pane-left"></div>
  `;
  document.documentElement.append(overlay);
  setPaneStyles(rect);
}

function setPaneStyles(rect) {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  overlay.classList.add('has-selection');

  const top = overlay.querySelector('.annotated-pane-top');
  const right = overlay.querySelector('.annotated-pane-right');
  const bottom = overlay.querySelector('.annotated-pane-bottom');
  const left = overlay.querySelector('.annotated-pane-left');
  const pad = 8;
  const x = Math.max(0, rect.left - pad);
  const y = Math.max(0, rect.top - pad);
  const width = Math.min(window.innerWidth - x, rect.width + pad * 2);
  const height = Math.min(window.innerHeight - y, rect.height + pad * 2);

  top.style.cssText = `left:0;top:0;width:100%;height:${y}px`;
  right.style.cssText = `left:${x + width}px;top:${y}px;width:${Math.max(0, window.innerWidth - x - width)}px;height:${height}px`;
  bottom.style.cssText = `left:0;top:${y + height}px;width:100%;height:${Math.max(0, window.innerHeight - y - height)}px`;
  left.style.cssText = `left:0;top:${y}px;width:${x}px;height:${height}px`;
}

function scheduleSelectionCapture() {
  if (!clippingMode) return;
  window.clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(captureCompletedSelection, 120);
}

function captureCurrentSelection() {
  if (!clippingMode) return false;
  const clip = clipFromSelection(false);
  if (!clip) return false;

  const selection = window.getSelection();
  activeRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const rect = getSelectionRect();
  if (!rect) return false;

  activeClip = clip;
  activeAnchorElement = null;
  showComposer(rect);
  return true;
}

function captureCompletedSelection() {
  if (!clippingMode) return;
  captureCurrentSelection();
}

function getSelectionRect() {
  const selection = window.getSelection();
  const range = activeRange || (selection?.rangeCount ? selection.getRangeAt(0) : null);
  if (!range) return null;

  return rectFromRange(range);
}

function rectFromRange(range) {
  const rects = [...range.getClientRects()]
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

function showComposer(rect) {
  if (!activeClip) return;

  createOverlay(rect);
  document.getElementById(COMPOSER_ID)?.remove();
  const composer = document.createElement('section');
  composer.id = COMPOSER_ID;
  composer.className = 'quote-annotation-bubble annotated-page-composer';
  composer.setAttribute('aria-label', 'Quote annotation');
  composer.style.visibility = 'hidden';
  composer.innerHTML = `
    ${mediaComposerSummary(activeClip)}
    <div class="quote-annotation-bubble__tags" role="radiogroup" aria-label="Annotation type">
      ${ANNOTATION_TYPES.map((t) => `<button type="button" class="quote-annotation-bubble__tag${t === selectedType ? ' quote-annotation-bubble__tag--active' : ''}" data-type="${t}">${t}</button>`).join('')}
    </div>
    <textarea
      id="annotated-page-commentary"
      class="quote-annotation-bubble__textarea"
      rows="4"
      maxlength="${MAX_COMMENTARY_LENGTH}"
      placeholder="Write your take…"
    ></textarea>
    <div class="quote-annotation-bubble__actions">
      <span class="quote-annotation-bubble__counter">0/${MAX_COMMENTARY_LENGTH}</span>
      <button class="quote-annotation-bubble__button" type="button">Annotate</button>
    </div>
  `;

  composer.addEventListener('mousedown', (event) => event.stopPropagation());

  // Tag selection
  for (const tagBtn of composer.querySelectorAll('.quote-annotation-bubble__tag')) {
    tagBtn.addEventListener('click', () => {
      selectedType = tagBtn.getAttribute('data-type');
      for (const b of composer.querySelectorAll('.quote-annotation-bubble__tag')) {
        b.classList.toggle('quote-annotation-bubble__tag--active', b === tagBtn);
      }
    });
  }

  const textarea = composer.querySelector('textarea');
  const counter = composer.querySelector('.quote-annotation-bubble__counter');
  textarea.addEventListener('input', () => {
    counter.textContent = `${textarea.value.length}/${MAX_COMMENTARY_LENGTH}`;
  });

  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      postAnnotation(composer, 'published');
    }
  });

  composer.querySelector('.quote-annotation-bubble__button').addEventListener('click', () => postAnnotation(composer, 'published'));

  document.documentElement.append(composer);
  positionComposer(composer, rect);
  composer.style.visibility = '';
  textarea.focus();
}

async function refreshAuthUser() {
  if (!authToken) return;
  try {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const user = await response.json().catch(() => ({}));
    if (!response.ok || user.error) throw new Error(user.error || 'Auth refresh failed');
    authUser = { ...authUser, ...user };
  } catch {
    // Keep cached auth state when the API is unavailable.
  }
}

function mediaComposerSummary(clip) {
  if (!isMediaClip(clip)) return '';
  const duration = clip.mediaDurationS || Math.max(0, (clip.clipEndSec || 0) - (clip.clipStartSec || 0));
  const label = clip.sourceType === 'podcast' ? 'Audio clip attached' : 'Video clip attached';
  const fallback = clip.recordingError ? '<span class="quote-annotation-bubble__clip-warning">timestamp fallback</span>' : '';
  return `
    <div class="quote-annotation-bubble__clip">
      <span>${label}</span>
      <span>${formatClock(duration)}</span>
      ${fallback}
    </div>
  `;
}

function positionComposer(composer, rect) {
  const margin = 18;
  const gap = 16;
  const width = Math.min(620, window.innerWidth - margin * 2);
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left + rect.width / 2 - width / 2));

  composer.style.width = `${width}px`;
  composer.style.maxHeight = '';

  const measuredHeight = Math.min(composer.offsetHeight || 224, window.innerHeight - margin * 2);
  const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
  const spaceAbove = rect.top - gap - margin;
  const placeBelow = spaceBelow >= measuredHeight || spaceBelow >= spaceAbove;
  const availableSpace = Math.max(140, placeBelow ? spaceBelow : spaceAbove);
  const height = Math.min(measuredHeight, availableSpace);
  const top = placeBelow
    ? Math.min(rect.bottom + gap, window.innerHeight - height - margin)
    : Math.max(margin, rect.top - height - gap);

  composer.style.left = `${left}px`;
  composer.style.top = `${top}px`;
  composer.style.maxHeight = `${availableSpace}px`;
}

function updateAnchoredUi() {
  trackingFrame = null;
  if (mediaSession) {
    positionRecordingBubble();
    return;
  }
  if (!clippingMode || !activeClip) return;

  const rect = activeRange
    ? rectFromRange(activeRange)
    : activeAnchorElement?.getBoundingClientRect();
  if (!rect) return;

  setPaneStyles(rect);
  const composer = document.getElementById(COMPOSER_ID);
  if (composer) positionComposer(composer, rect);
}

function scheduleAnchoredUiUpdate() {
  if (!clippingMode || (!activeRange && !activeAnchorElement && !mediaSession) || trackingFrame) return;
  trackingFrame = requestAnimationFrame(updateAnchoredUi);
}

async function postAnnotation(composer, status = 'published') {
  const textarea = composer.querySelector('textarea');
  const button = composer.querySelector('.quote-annotation-bubble__button');
  const commentary = textarea.value.trim();
  if (!commentary || !activeClip) return;
  if (commentary.length > MAX_COMMENTARY_LENGTH) return;

  button.disabled = true;
  button.textContent = 'Posting';

  try {
    await ensureUser();
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const response = await fetch(`${API_BASE}/api/annotations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: authUser?.id || 'demo-user',
        source_url: activeClip.url,
        source_title: activeClip.title || '',
        source_type: activeClip.sourceType || 'article',
        source_domain: activeClip.domain || '',
        source_site_name: activeClip.siteName || null,
        source_author: activeClip.author || null,
        source_published_at: activeClip.publishedAt || null,
        source_thumbnail: activeClip.thumbnail || null,
        clip_text: activeClip.text || null,
        clip_start_sec: activeClip.clipStartSec ?? null,
        clip_end_sec: activeClip.clipEndSec ?? null,
        clip_media_path: null,
        commentary,
        annotation_type: selectedType,
        status,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.id) throw new Error(data.error || 'Post failed');

    if (isMediaClip(activeClip)) {
      button.textContent = 'Attaching clip';
      try {
        await attachMediaClip(data.id, activeClip);
      } catch {
        button.textContent = 'Posted without clip';
        safeSend({ type: 'ANNOTATION_POSTED', page: getPageInfo() });
        window.setTimeout(exitClippingMode, 1200);
        return;
      }
    }

    button.textContent = 'Posted';
    safeSend({ type: 'ANNOTATION_POSTED', page: getPageInfo() });
    window.setTimeout(exitClippingMode, 600);
  } catch {
    button.disabled = false;
    button.textContent = 'Error - try again';
  }
}

async function attachMediaClip(annotationId, clip) {
  if (clip.sourceType === 'podcast') {
    try {
      await attachSourceClip(annotationId, clip);
      return;
    } catch (sourceError) {
      if (!clip.recordingBlob?.size) throw sourceError;
    }
  }

  if (clip.recordingBlob?.size) {
    const form = new FormData();
    form.append('clip', clip.recordingBlob, `annotated-${annotationId}.webm`);
    form.append('start', String(clip.clipStartSec ?? 0));
    form.append('end', String(clip.clipEndSec ?? 0));
    form.append('duration', String(clip.mediaDurationS ?? 0));
    form.append('source_type', clip.sourceType || 'video');
    const headers = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    await fetchWithRetry(() => fetch(`${API_BASE}/api/annotations/${encodeURIComponent(annotationId)}/clip-upload`, {
      method: 'POST',
      headers,
      body: form,
    }));
    return;
  }

  await attachSourceClip(annotationId, clip);
}

async function attachSourceClip(annotationId, clip) {
  await fetchWithRetry(() => fetch(`${API_BASE}/api/annotations/${encodeURIComponent(annotationId)}/source-clip`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      url: clip.pageUrl || clip.url,
      start: clip.clipStartSec,
      end: clip.clipEndSec,
      source_type: clip.sourceType,
    }),
  }));
}

async function fetchWithRetry(makeRequest, attempts = 2) {
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await makeRequest();
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || `Request failed: ${response.status}`);
      return data;
    } catch (error) {
      lastError = error;
      if (index + 1 < attempts) await delay(500 * (index + 1));
    }
  }
  throw lastError || new Error('Request failed');
}

function authHeaders(base = {}) {
  const headers = { ...base };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isMediaClip(clip) {
  return ['youtube', 'podcast', 'video'].includes(clip?.sourceType);
}

function centerRect() {
  return {
    left: Math.round(window.innerWidth * 0.18),
    top: Math.round(window.innerHeight * 0.26),
    width: Math.round(window.innerWidth * 0.64),
    height: Math.max(80, Math.round(window.innerHeight * 0.18)),
  };
}

function formatClock(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const secs = value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function safeSend(message) {
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError;
  });
}

function detectPage() {
  safeSend(getPageInfo());
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && clippingMode) {
    exitClippingMode();
    return;
  }

  if (!event.repeat && isClippingShortcut(event)) {
    event.preventDefault();
    event.stopPropagation();
    enterClippingMode();
  }

  if (clippingMode && event.key.startsWith('Arrow')) {
    scheduleSelectionCapture();
  }
}, true);

window.addEventListener('keyup', (event) => {
  if (!clippingMode) return;
  if (event.key === 'Shift' || event.key.startsWith('Arrow')) scheduleSelectionCapture();
}, true);

document.addEventListener('mousedown', (event) => {
  if (!clippingMode) return;
  if (mediaSession) return;
  const composer = document.getElementById(COMPOSER_ID);
  if (composer?.contains(event.target)) return;
  if (composer && !composer.contains(event.target)) {
    exitClippingMode();
    return;
  }
  selecting = true;
  document.getElementById(COMPOSER_ID)?.remove();
  document.getElementById(OVERLAY_ID)?.remove();
}, true);

document.addEventListener('mouseup', () => {
  if (!clippingMode || !selecting) return;
  selecting = false;
  scheduleSelectionCapture();
}, true);

window.addEventListener('scroll', scheduleAnchoredUiUpdate, true);
window.addEventListener('resize', scheduleAnchoredUiUpdate);

detectPage();

const startObserver = () => {
  const target = document.body || document.documentElement;
  if (!target) return;

  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      exitClippingMode();
      detectPage();
    }
  });
  observer.observe(target, { childList: true, subtree: true });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver, { once: true });
} else {
  startObserver();
}

function isClippingShortcut(event) {
  return event.shiftKey
    && event.code === 'KeyX'
    && (event.metaKey || event.ctrlKey || event.altKey);
}

async function ensureUser() {
  // If authenticated via OAuth, user already exists in DB
  if (authUser?.id) return;
  // Fallback: create demo user for unauthenticated usage
  await fetch(`${API_BASE}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'demo',
      display_name: 'Demo User',
      provider: 'local',
      provider_id: 'demo-user',
    }),
  });
}
