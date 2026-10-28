// Cloudflare Pages Function: POST /api/ask-rules
// Answers rider questions about Pinellas Trail e-bike rules, using ONLY the facts in
// /ride-smart/pinellas-trail-ebike-rules/rules.json (the same file the FAQ page is built from).
//
// Trust rules built into this file:
//   - The model sees nothing but rules.json, and is told to say "not covered" rather than guess.
//   - Source links, "last checked" dates and agency phone numbers are added HERE from rules.json,
//     never written by the model, so the model can't invent a citation.
//   - If anything fails, the reply points riders to the FAQ page and the managing agency.
//
// One-time setup in the Cloudflare dashboard (see README, "Turning on the rules question box"):
//   Settings > Variables and Secrets:  ANTHROPIC_API_KEY (secret, required)
//                                      TURNSTILE_SECRET  (secret, recommended)
//                                      RULES_MODEL       (optional, default below)
//                                      RULES_DAILY_CAP   (optional, default 300 questions/day)
//   Settings > Bindings > KV namespace: RULES_CHAT_LIMITS (recommended; per-visitor and daily limits)

const RULES_PATH = '/ride-smart/pinellas-trail-ebike-rules/rules.json';
const PAGE_PATH = '/ride-smart/pinellas-trail-ebike-rules/';
const DEFAULT_MODEL = 'claude-haiku-5-5';
const MAX_QUESTION = 400;
const PER_VISITOR_PER_HOUR = 15;

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fallback(rules, message) {
  const parks = rules?.agencies?.county_parks;
  return {
    ok: false,
    error: message,
    help: `Every answer we have is written out on ${PAGE_PATH}` +
      (parks ? `, or call ${parks.name} at ${parks.phone}.` : '.'),
  };
}

async function loadRules(env, request) {
  const res = await env.ASSETS.fetch(new URL(RULES_PATH, request.url));
  if (!res.ok) throw new Error('rules.json not found');
  return res.json();
}

async function checkTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // not switched on yet
  if (!token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const out = await res.json().catch(() => ({}));
  return out.success === true;
}

// Rough limits using KV. KV isn't instant across locations, so these are a brake, not a wall.
async function overLimit(env, ip) {
  const kv = env.RULES_CHAT_LIMITS;
  if (!kv) return null;
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const hour = now.toISOString().slice(0, 13);
  const cap = Number(env.RULES_DAILY_CAP) || 300;
  const dayKey = `day:${day}`;
  const ipKey = `ip:${hour}:${ip || 'unknown'}`;
  const [dayCount, ipCount] = await Promise.all([kv.get(dayKey), kv.get(ipKey)]).then((v) => v.map((n) => Number(n) || 0));
  if (dayCount >= cap) return 'The question box has hit its limit for today.';
  if (ipCount >= PER_VISITOR_PER_HOUR) return 'You\'ve asked a lot of questions this hour. Please try again a little later.';
  await Promise.all([
    kv.put(dayKey, String(dayCount + 1), { expirationTtl: 60 * 60 * 48 }),
    kv.put(ipKey, String(ipCount + 1), { expirationTtl: 60 * 60 * 2 }),
  ]);
  return null;
}

function buildSystemPrompt(rules) {
  // Only the facts the model needs. Agencies/sources are passed so it can pick ids, not write links.
  const facts = {
    area: rules.area,
    updated: rules.updated,
    not_covered: rules.not_covered,
    agencies: Object.fromEntries(Object.entries(rules.agencies).map(([id, a]) => [id, { name: a.name, role: a.role }])),
    source_ids: Object.fromEntries(Object.entries(rules.sources).map(([id, s]) => [id, `${s.publisher}: ${s.title}`])),
    topics: rules.topics.map(({ id, question, answer, sources, status, status_note }) => ({ id, question, answer, sources, status, status_note })),
    segments: rules.segments,
  };
  return `You answer questions from e-bike riders about rules on the Pinellas Trail in Pinellas County, Florida, for the website Pedal & Pause. Many readers are 55 or older.

You may use ONLY the facts in the RULES DATA below. Do not use anything else you know about Florida law, e-bikes, other trails or other counties, even if you are confident. If the data doesn't answer the question, or only answers part of it, say plainly what the data doesn't cover and set "covered" to false for anything you can't answer. Never guess, never fill gaps, never soften a rule into something it doesn't say.

How to answer:
- Plain, friendly sentences. Short: usually 2 to 4 sentences, never more than 6.
- Lead with the direct answer (yes, no, the number).
- If the rule differs by stretch of trail, name the stretch.
- Mention news reports only when a topic or segment you actually relied on has status "reported", and say which part of the answer came from them. If everything you relied on has status "confirmed", do not mention news reports at all, and do not pull in reported stretches the rider didn't ask about just to add a warning.
- Posted signs always win. Mention that when the question is about speed or where to ride.
- Do not include links, phone numbers, or dates in the answer; the website adds those from the data.
- Questions unrelated to e-bike or trail rules: set covered to false and say this box only answers Pinellas Trail e-bike rule questions.
- This is not legal advice. Don't give legal opinions about a specific ticket, crash or dispute; say to talk to a lawyer or the agency.

Always reply by calling the give_answer tool. In its id lists, include only ids that appear in the data and that you actually used.

RULES DATA:
${JSON.stringify(facts)}`;
}

// The model must answer through this tool, so the reply always arrives as a ready-made
// object instead of text we'd have to pick apart.
const ANSWER_TOOL = {
  name: 'give_answer',
  description: 'Give the rider your answer, plus the ids of the rules data you used.',
  input_schema: {
    type: 'object',
    properties: {
      covered: { type: 'boolean', description: 'false if the rules data does not answer the question' },
      answer: { type: 'string', description: 'Plain-language answer, 2 to 6 sentences, no links, phone numbers or dates' },
      topic_ids: { type: 'array', items: { type: 'string' } },
      segment_ids: { type: 'array', items: { type: 'string' } },
      source_ids: { type: 'array', items: { type: 'string' } },
      agency_ids: { type: 'array', items: { type: 'string' } },
    },
    required: ['covered', 'answer', 'topic_ids', 'segment_ids', 'source_ids', 'agency_ids'],
  },
};

// Older text-style replies still work, in case a model ignores the tool.
function parseModelJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

// If the model fails but the rider picked a stretch, show that stretch's rules word for word.
function stretchFallback(rules, segment) {
  return {
    ok: true,
    covered: true,
    fallback: true,
    answer: `We couldn't write a custom answer just now, so here are the rules for ${segment.name}.\n\n` +
      `Speed: ${segment.speed}\nE-bike classes: ${segment.classes}\nSidewalks: ${segment.sidewalks}\nHelmets: ${segment.helmet}` +
      (segment.notes ? `\n\n${segment.notes}` : ''),
    reported: segment.status === 'reported',
    last_verified: segment.last_verified,
    sources: segment.sources.map((id) => ({ title: `${rules.sources[id].publisher}: ${rules.sources[id].title}`, url: rules.sources[id].url, kind: rules.sources[id].kind })),
    agencies: segment.managed_by.map((id) => ({ name: rules.agencies[id].name, phone: rules.agencies[id].phone, url: rules.agencies[id].url })),
    links: [{ label: segment.name, href: `${PAGE_PATH}#seg-${segment.id}` }],
    disclaimer: rules.disclaimer,
  };
}

export async function onRequestPost({ request, env }) {
  let rules;
  try {
    rules = await loadRules(env, request);
  } catch {
    return reply(503, fallback(null, 'The question box is unavailable right now.'));
  }

  let body;
  try { body = await request.json(); } catch {
    return reply(400, fallback(rules, 'We couldn\'t read that question. Please try again.'));
  }
  const question = String(body.question || '').trim();
  const segmentId = String(body.segment || '').trim();
  if (!question) return reply(400, fallback(rules, 'Please type a question.'));
  if (question.length > MAX_QUESTION) return reply(400, fallback(rules, 'Please shorten your question a little.'));
  const segment = rules.segments.find((s) => s.id === segmentId);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await checkTurnstile(env, body.turnstileToken, ip))) {
    return reply(403, fallback(rules, 'We couldn\'t confirm you\'re a person. Please reload the page and try again.'));
  }
  const limited = await overLimit(env, ip);
  if (limited) return reply(429, fallback(rules, limited));

  if (!env.ANTHROPIC_API_KEY) {
    return reply(503, fallback(rules, 'The question box isn\'t switched on yet.'));
  }

  const userText = segment ? `I'm riding: ${segment.name}.\n\n${question}` : question;

  let parsed = null;
  try {
    const res = await fetch((env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.RULES_MODEL || DEFAULT_MODEL,
        max_tokens: 1500,
        system: buildSystemPrompt(rules),
        tools: [ANSWER_TOOL],
        tool_choice: { type: 'tool', name: 'give_answer' },
        messages: [{ role: 'user', content: userText }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`model error ${res.status} ${detail.slice(0, 300)}`);
    }
    const out = await res.json();
    const tool = (out.content || []).find((c) => c.type === 'tool_use' && c.name === 'give_answer');
    if (tool && tool.input) {
      parsed = tool.input;
    } else {
      const text = (out.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      parsed = parseModelJson(text);
    }
    if (!parsed) console.log('ask-rules unreadable reply, stop_reason:', out.stop_reason);
  } catch (err) {
    console.log('ask-rules model call failed:', err && err.message);
  }

  if (!parsed || typeof parsed.answer !== 'string' || !parsed.answer.trim()) {
    if (segment) return reply(200, stretchFallback(rules, segment));
    return reply(502, fallback(rules, 'We couldn\'t get an answer just now.'));
  }

  // Everything below comes from rules.json, not from the model.
  const known = (ids, table) => [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && table[id]))];
  const topicTable = Object.fromEntries(rules.topics.map((t) => [t.id, t]));
  const segTable = Object.fromEntries(rules.segments.map((s) => [s.id, s]));
  const topics = known(parsed.topic_ids, topicTable).map((id) => topicTable[id]);
  const segments = known(parsed.segment_ids, segTable).map((id) => segTable[id]);
  if (segment && !segments.includes(segment)) segments.push(segment);

  // Sources: whatever the model cited that exists, plus the sources behind the topics/stretches it used.
  const sourceIds = new Set(known(parsed.source_ids, rules.sources));
  for (const item of [...topics, ...segments]) item.sources.forEach((s) => sourceIds.add(s));
  const covered = parsed.covered !== false && sourceIds.size > 0;

  const agencyIds = new Set(known(parsed.agency_ids, rules.agencies));
  segments.forEach((s) => s.managed_by.forEach((a) => agencyIds.add(a)));
  if (!agencyIds.size || !covered) agencyIds.add('county_parks');

  const reported = [...topics, ...segments].some((i) => i.status === 'reported');
  const dates = [...topics, ...segments].map((i) => i.last_verified).sort();

  return reply(200, {
    ok: true,
    covered,
    answer: parsed.answer.trim().slice(0, 1500),
    reported,
    last_verified: dates[0] || rules.updated,
    sources: [...sourceIds].map((id) => ({ title: `${rules.sources[id].publisher}: ${rules.sources[id].title}`, url: rules.sources[id].url, kind: rules.sources[id].kind })),
    agencies: [...agencyIds].map((id) => {
      const a = rules.agencies[id];
      return { name: a.name, phone: a.phone, url: a.url };
    }),
    links: [...topics.map((t) => ({ label: t.question, href: `${PAGE_PATH}#${t.id}` })),
      ...segments.map((s) => ({ label: s.name, href: `${PAGE_PATH}#seg-${s.id}` }))],
    disclaimer: rules.disclaimer,
  });
}

export function onRequest() {
  return reply(405, { error: 'Use the question box on pedalpause.com' + PAGE_PATH });
}
