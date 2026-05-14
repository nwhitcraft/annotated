const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

export async function sendClaimNotificationEmail(claim) {
  const to = process.env.CLAIMS_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'dreamteamai71@gmail.com';
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CLAIMS_FROM_EMAIL || 'Annotated Reports <reports@annotated.com>';

  if (!to || !apiKey) {
    return {
      status: 'not_configured',
      error: 'Set RESEND_API_KEY and CLAIMS_NOTIFY_EMAIL to email report notifications.',
    };
  }

  const adminUrl = `${(process.env.FRONTEND_URL || 'http://localhost:3090').replace(/\/$/, '')}/admin/claims`;
  const subject = `[Annotated report] ${claim.reason_code} on ${claim.source_title || claim.annotation_id}`;
  const text = [
    'A new Annotated report has been filed.',
    '',
    `Report ID: ${claim.id}`,
    `Annotation ID: ${claim.annotation_id}`,
    `Reporter: ${claim.claimant_email}`,
    `Reason: ${claim.reason_code}`,
    `Annotation owner: ${claim.display_name || claim.username || claim.user_id || 'Unknown'}${claim.username ? ` (@${claim.username})` : ''}`,
    `Source: ${claim.source_title || 'Untitled source'}`,
    claim.source_url || '',
    '',
    'Report description:',
    claim.description,
    '',
    'Annotation commentary:',
    claim.commentary || '',
    '',
    'Ban/removal note:',
    'Any account action should apply to the annotation owner above, not the reporter who filed this report.',
    '',
    `Review reports: ${adminUrl}`,
  ].join('\n');

  const html = text
    .split('\n')
    .map((line) => line ? escapeHtml(line) : '<br>')
    .join('<br>');

  const response = await fetch(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `claim-${claim.id}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
      reply_to: claim.claimant_email,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      status: 'failed',
      error: data.message || data.error || `Email provider returned ${response.status}`,
    };
  }

  return { status: 'sent', provider_id: data.id || null };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
