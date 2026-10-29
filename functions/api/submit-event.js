// Cloudflare Pages Function: POST /api/submit-event
// Saves event submissions to a KV namespace for review. Nothing here publishes
// anything; approved events are added to /events/events.json by hand.
//
// One-time setup in the Cloudflare dashboard (see README):
//   Workers & Pages > pedalpause > Settings > Bindings > Add > KV namespace
//   Variable name: EVENT_SUBMISSIONS
//   Workers & Pages > pedalpause > Settings > Variables > Add variable
//   Variable name: ZAPIER_WEBHOOK_URL (the Zapier Catch Hook URL; kept as a
//   secret variable, not in this repo, because the repo is public).
//   When set, each saved submission is also POSTed to that webhook so a
//   Zap can file it in a spreadsheet for review. The webhook send never
//   blocks or fails the submission: KV remains the backup.

const LIMITS = {
  title: 120, date: 10, start: 5, end: 5, repeat: 20, town: 40, where: 200,
  cost: 80, link: 300, about: 1500, name: 80, email: 120, organizer: 3,
};
const REQUIRED = ['title', 'date', 'town', 'where', 'link', 'email'];

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPost({ request, env }) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(400, { error: 'We couldn\'t read that form. Please try again.' });
  }

  // Honeypot: real people never see this field.
  if ((form.get('website') || '').toString().trim() !== '') {
    return reply(200, { ok: true });
  }

  const entry = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    const v = (form.get(key) || '').toString().trim();
    if (v.length > max) return reply(400, { error: 'One of the answers is too long. Please shorten it.' });
    entry[key] = v;
  }
  const missing = REQUIRED.filter((k) => !entry[k]);
  if (missing.length) return reply(400, { error: 'Please fill in the required boxes.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return reply(400, { error: 'Please check the date.' });
  if (!/^https?:\/\//i.test(entry.link)) return reply(400, { error: 'The link should start with http:// or https://' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)) return reply(400, { error: 'Please check your email address.' });

  if (!env.EVENT_SUBMISSIONS) {
    return reply(503, { error: 'Submissions aren\'t switched on yet. Please check back soon.' });
  }

  entry.received = new Date().toISOString();
  entry.status = 'pending';
  const key = `pending:${entry.date}:${crypto.randomUUID()}`;
  // Keep submissions 120 days, long enough to review and long past most events.
  await env.EVENT_SUBMISSIONS.put(key, JSON.stringify(entry), { expirationTtl: 60 * 60 * 24 * 120 });

  // Also file a copy via Zapier for the weekly spreadsheet review, if the
  // webhook is configured. A webhook failure must not fail the submission.
  if (env.ZAPIER_WEBHOOK_URL) {
    try {
      await fetch(env.ZAPIER_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // KV already saved the submission; ignore webhook errors.
    }
  }

  return reply(200, { ok: true });
}

export function onRequest() {
  return reply(405, { error: 'Use the form on pedalpause.com/events/submit/.' });
}
