#!/usr/bin/env node
// Builds /ride-smart/pinellas-trail-ebike-rules/index.html from rules.json in the same folder.
//
//   node scripts/build-rules-page.mjs          write the page
//   node scripts/build-rules-page.mjs --check  exit 1 if the page is out of date
//
// The site header and footer are copied from the Florida e-bike rules article, so
// the new page always matches the rest of the site. No packages needed.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pageDir = join(root, 'ride-smart', 'pinellas-trail-ebike-rules');
const data = JSON.parse(readFileSync(join(pageDir, 'rules.json'), 'utf8'));
const shell = readFileSync(join(root, 'ride-smart', 'florida-ebike-rules', 'index.html'), 'utf8');

const URL_PATH = '/ride-smart/pinellas-trail-ebike-rules/';
const CANONICAL = 'https://pedalpause.com' + URL_PATH;
const TITLE = 'Pinellas Trail E-Bike Rules, Stretch by Stretch';
const DEK = 'Speed limits, e-bike classes, sidewalks and helmets from St. Pete to Tarpon Springs, with the source for every answer.';

// ---------- checks: refuse to build a page that can't back up its claims ----------
const problems = [];
for (const item of [...data.topics, ...data.segments]) {
  if (!item.sources?.length) problems.push(`${item.id}: no sources`);
  for (const s of item.sources || []) if (!data.sources[s]) problems.push(`${item.id}: unknown source "${s}"`);
  for (const a of item.managed_by || []) if (!data.agencies[a]) problems.push(`${item.id}: unknown agency "${a}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.last_verified || '')) problems.push(`${item.id}: missing last_verified date`);
  if (!['confirmed', 'reported'].includes(item.status)) problems.push(`${item.id}: status must be confirmed or reported`);
}
if (problems.length) {
  console.error('rules.json has problems:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const niceDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };

function sourceLine(item) {
  const links = item.sources.map((id) => {
    const s = data.sources[id];
    return `<a href="${esc(s.url)}" rel="noopener">${esc(s.publisher)}</a>`;
  });
  const badge = item.status === 'reported'
    ? ` <span class="rule-badge" title="${esc(item.status_note || 'Based at least in part on news reports, not an official rule page.')}">Partly from news reports</span>`
    : '';
  const note = item.status_note ? `<br><span class="rule-note">${esc(item.status_note)}</span>` : '';
  return `<p class="rule-src">Source: ${links.join(' · ')}. Checked ${esc(niceDate(item.last_verified))}.${badge}${note}</p>`;
}

const pick = (id) => data.topics.find((t) => t.id === id);

// ---------- page body ----------
const quick = [
  ['Speed limit', '20 mph on the trail, or lower where posted'],
  ['E-bike classes', 'Class 1, 2 and 3 allowed'],
  ['Helmets', 'Required under 16'],
  ['Sidewalks', 'Usually allowed; walk your bike in downtown Tarpon Springs'],
  ['Trail hours', '7 a.m. to sunset'],
  ['Managed by', data.agencies.county_parks.name + ', ' + data.agencies.county_parks.phone],
];

const faqHtml = data.topics.map((t) => `
<h3 id="${esc(t.id)}">${esc(t.question)}</h3>
<p>${esc(t.answer)}</p>
${sourceLine(t)}`).join('\n');

const segHtml = data.segments.map((s) => {
  const who = s.managed_by.map((a) => {
    const ag = data.agencies[a];
    return esc(ag.name) + (ag.phone ? `, ${esc(ag.phone)}` : '');
  }).join('; ');
  return `
<section class="facts segment" id="seg-${esc(s.id)}">
  <h3>${esc(s.name)}</h3>
  <p class="seg-where">${esc(s.where)}</p>
  <dl>
    <dt>Speed</dt><dd>${esc(s.speed)}</dd>
    <dt>E-bike classes</dt><dd>${esc(s.classes)}</dd>
    <dt>Sidewalks</dt><dd>${esc(s.sidewalks)}</dd>
    <dt>Helmets</dt><dd>${esc(s.helmet)}</dd>
    <dt>Who to ask</dt><dd>${who}</dd>
  </dl>
  ${s.notes ? `<p class="seg-notes">${esc(s.notes)}</p>` : ''}
  ${sourceLine(s)}
</section>`;
}).join('\n');

const agencyHtml = Object.values(data.agencies).map((a) => {
  const name = a.url ? `<a href="${esc(a.url)}" rel="noopener">${esc(a.name)}</a>` : esc(a.name);
  return `<li><strong>${name}</strong>${a.phone ? `, ${esc(a.phone)}` : ''}. ${esc(a.role)}.</li>`;
}).join('\n      ');

const sourcesHtml = Object.values(data.sources).map((s) =>
  `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.publisher)}: ${esc(s.title)}</a>${s.kind === 'news' ? ' (news report)' : s.kind === 'guide' ? ' (trail guide)' : ''}</li>`
).join('\n        ');

const segOptions = data.segments.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('\n          ');

const siteKey = data.chat?.turnstile_site_key || '';

const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: data.topics.map((t) => ({
    '@type': 'Question',
    name: t.question,
    acceptedAnswer: { '@type': 'Answer', text: t.answer },
  })),
};

const main = `<main id="main">
<div class="article-head">
  <div class="wrap">
    <div class="crumbs"><a href="/">Home</a> › <a href="/ride-smart/">Ride Smart</a></div>
    <span class="tag eyebrow" style="color:var(--coral)">Rules of the road</span>
    <h1>${esc(TITLE)}</h1>
    <p class="dek">${esc(DEK)}</p>
    <div class="byline">By <strong>Tim Street</strong> · Last checked ${esc(niceDate(data.updated))}</div>
  </div>
</div>
<div class="wrap">
  <article class="prose">

<div class="note"><strong>Before you ride:</strong> ${esc(data.disclaimer)}</div>

<p>Florida lets every agency that runs a path write its own e-bike rules, which is how a single ride on the Pinellas Trail can cross more than one set of them. The trail itself follows one set of county rules from end to end. The differences show up when you step off it: onto a city sidewalk, a waterfront path or a downtown street on the way to lunch. This page covers both, and every answer links to where it came from. Where an answer rests on a news report instead of an official rule page, we say so.</p>

<section class="facts">
  <h2>The short version</h2>
  <dl>
${quick.map(([k, v]) => `    <dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('\n')}
  </dl>
</section>

<section class="rules-chat" id="ask" aria-labelledby="ask-title" data-endpoint="/api/ask-rules"${siteKey ? ` data-sitekey="${esc(siteKey)}"` : ''}>
  <h2 id="ask-title">Ask about your ride</h2>
  <p>Type a question about the stretch you're riding. Answers come only from the rules on this page, with the source and the date we last checked it. If we don't have the answer, it will tell you who to call instead of guessing.</p>
  <form class="rules-chat-form" novalidate>
    <label for="rc-segment">Where are you riding? <span class="hint-inline">(optional)</span></label>
    <select id="rc-segment" name="segment">
      <option value="">Anywhere on the trail</option>
          ${segOptions}
    </select>
    <label for="rc-question">Your question</label>
    <textarea id="rc-question" name="question" maxlength="400" rows="3" placeholder="Can I ride my Class 3 from Dunedin to the Sponge Docks?"></textarea>
    <div class="rc-examples" aria-label="Example questions">
      <button type="button" class="chip" data-q="What's the speed limit on the trail?">Speed limit?</button>
      <button type="button" class="chip" data-q="Is my Class 3 e-bike allowed on the Pinellas Trail?">Class 3 allowed?</button>
      <button type="button" class="chip" data-q="Can I ride my e-bike on the sidewalk in Tarpon Springs?">Sidewalks in Tarpon?</button>
      <button type="button" class="chip" data-q="Do I need a helmet?">Helmet?</button>
    </div>
    ${siteKey ? '<div class="cf-turnstile" data-sitekey="' + esc(siteKey) + '" data-size="flexible"></div>' : ''}
    <button type="submit" class="btn">Ask</button>
  </form>
  <div class="rules-chat-answer" aria-live="polite"></div>
  <noscript><p>The question box needs JavaScript. Every answer it can give is written out below.</p></noscript>
</section>

<h2 id="questions">Common questions</h2>
${faqHtml}

<h2 id="stretches">Stretch by stretch</h2>
<p>Here's what changes, and what doesn't, from the south end of the trail to the north.</p>
${segHtml}

<h2 id="not-covered">What this page doesn't cover</h2>
<ul>
${data.not_covered.map((n) => `  <li>${esc(n)}</li>`).join('\n')}
</ul>

<h2 id="who-to-call">Who to call</h2>
<ul>
      ${agencyHtml}
</ul>

    <div class="sources">
      <h2>Sources</h2>
      <ul>
        ${sourcesHtml}
      </ul>
      <p class="updated">Last checked ${esc(niceDate(data.updated))}. Rules and trail conditions change; if you spot something out of date, <a href="/contact/">let us know</a>.</p>
    </div>
  </article>
</div>
</main>`;

// ---------- assemble with the site's own header and footer ----------
const bodyStart = shell.indexOf('<body>');
const mainStart = shell.indexOf('<main id="main">');
const mainEnd = shell.indexOf('</main>');
const scriptTag = '<script src="/assets/js/site.js" defer></script>';
if (bodyStart < 0 || mainStart < 0 || mainEnd < 0 || !shell.includes(scriptTag)) {
  console.error('Could not find the header/footer markers in ride-smart/florida-ebike-rules/index.html');
  process.exit(1);
}
const header = shell.slice(bodyStart, mainStart);
let footer = shell.slice(mainEnd + '</main>'.length);
footer = footer.replace(scriptTag, scriptTag + '\n<script src="/assets/js/rules-chat.js" defer></script>' +
  (siteKey ? '\n<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''));

const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- Generated by scripts/build-rules-page.mjs from rules.json. Edit rules.json, not this file. -->
<title>${esc(TITLE)} | Pedal &amp; Pause</title>
<meta name="description" content="${esc(DEK)}">
<link rel="canonical" href="${CANONICAL}">
<meta property="og:title" content="${esc(TITLE)}">
<meta property="og:description" content="${esc(DEK)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${CANONICAL}">
<meta property="og:site_name" content="Pedal &amp; Pause">
<meta name="theme-color" content="#fbf8f2">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,600&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css">
<script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, '\\u003c')}</script>
</head>
`;

const html = head + header + main + footer;
const outPath = join(pageDir, 'index.html');

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(outPath, 'utf8'); } catch {}
  if (current !== html) {
    console.error('index.html is out of date. Run: node scripts/build-rules-page.mjs');
    process.exit(1);
  }
  console.log('index.html is up to date.');
} else {
  writeFileSync(outPath, html);
  console.log(`Wrote ${outPath} (${data.topics.length} questions, ${data.segments.length} stretches).`);
}
