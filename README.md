# Pedal & Pause

Florida e-bike trail guides, gear advice and rules for riders 55+. Live at **pedalpause.com**.

This is a plain static website: HTML, one stylesheet, one small script. There is no build step, so Cloudflare can serve the files exactly as they sit in this repo.

## Folder layout

| Folder / file | What it is |
|---|---|
| `index.html` | Home page |
| `trails/` | Trail guides (each guide is its own folder with an `index.html`) |
| `gear/` | Racks, trikes, dog gear |
| `ride-smart/` | Riding well after 55: rules, heat, etiquette (was `know-how/`; old links redirect) |
| `events/` | Events calendar. `events/events.json` holds the listings; `events/submit/` is the submission form |
| `functions/api/submit-event.js` | Receives event submissions and queues them for your review |
| `ride-smart/pinellas-trail-ebike-rules/rules.json` | **The** list of Pinellas Trail e-bike rules. The FAQ page and the question box both read from it |
| `functions/api/ask-rules.js` | The question box on the Pinellas rules page |
| `scripts/build-rules-page.mjs` | Rebuilds the Pinellas rules page from `rules.json` |
| `assets/js/rules-chat.js` | Runs the question box in the browser |
| `_redirects` | Sends old `/know-how/` links to `/ride-smart/` |
| `about/` | About page |
| `assets/css/site.css` | All styling |
| `assets/js/site.js` | Mobile menu |
| `assets/js/events.js` | Draws the calendar and the homepage events strip |
| `assets/js/submit.js` | Handles the submit-an-event form |
| `assets/img/` | Logo/favicon. Put your photos here. |
| `404.html` | "Page not found" page |
| `sitemap.xml`, `robots.txt` | For search engines |
| `_headers` | Security and caching settings Cloudflare reads |

## Connecting Cloudflare (one time, all in the browser)

1. Log in at **dash.cloudflare.com**.
2. In the left menu, open **Workers & Pages**, then click **Create**.
3. Choose the **Pages** tab, then **Connect to Git**. Authorize GitHub if asked, and pick the **pedalpause** repository.
4. On the build settings screen:
   - **Framework preset:** None
   - **Build command:** leave blank
   - **Build output directory:** leave blank (or `/`)
5. Click **Save and Deploy**. In a minute you'll get a `*.pages.dev` address to preview the site.
6. Open the new project, go to **Custom domains**, click **Set up a custom domain**, and enter `pedalpause.com`. Because the domain is already registered with Cloudflare, it sets up the DNS for you. Repeat for `www.pedalpause.com` if you want both.

After that, every change pushed to the `main` branch goes live automatically.

## Adding photos

Drop images in `assets/img/` (JPG or WebP, about 1600px wide is plenty). Card images on the home and section pages are currently color panels; they can be swapped for real trail photos.

## Adding an event

Open `events/events.json` and copy an existing entry. The fields:

- `start` / `end`: `"2026-11-21T11:00"` (24-hour clock, local time)
- For an event on several specific days, use `dates` instead: a list of `{ "start": ..., "end": ... }`
- For something every week, add `"repeat": "weekly"` and `"until": "2027-06-26"`
- `town` must be one of Clearwater, Dunedin, Palm Harbor or Tarpon Springs for the filter buttons to find it
- `link` should point to the organizer, so readers can confirm
- Change `"updated"` at the top to today's date

Past events drop off the page on their own. Save, commit, and Cloudflare publishes it.

## Turning on event submissions (one time)

The form saves submissions to a Cloudflare KV store for you to review. Nothing goes on the site until you add it to `events.json`.

1. In Cloudflare, go to **Storage & Databases > KV** and create a namespace called `pedalpause-event-submissions`.
2. Open **Workers & Pages > pedalpause > Settings > Bindings**, click **Add**, choose **KV namespace**.
3. Variable name: `EVENT_SUBMISSIONS`. Pick the namespace you just made. Save, for both Production and Preview.
4. Redeploy (or push any change).

To review submissions, open the namespace in **KV**. Each one is saved under a key starting with `pending:` and the event date. Submissions delete themselves after 120 days.

## Updating the Pinellas Trail e-bike rules

All the rules live in one file: `ride-smart/pinellas-trail-ebike-rules/rules.json`. The FAQ page and the question box both read from it, so they can't disagree.

1. Edit `rules.json`. Every rule needs:
   - `sources`: ids from the `sources` list at the top (add a new source there first if needed)
   - `last_verified`: the date you checked it, like `"2026-11-15"`
   - `status`: `"confirmed"` only if an official government page says it; `"reported"` if it rests on news coverage. Add a `status_note` saying which part came from the news.
2. Change `"updated"` at the top to today's date.
3. Rebuild the page: `node scripts/build-rules-page.mjs`. It refuses to build if a rule is missing a source or date.
4. Commit both `rules.json` and `index.html`. Cloudflare publishes it.

`node scripts/build-rules-page.mjs --check` tells you if someone edited `rules.json` without rebuilding the page.

Check every source at least once a month, and right after any county commission or city council e-bike vote.

## Turning on the rules question box (one time)

Until this is done the page works fine; the box just says it isn't switched on yet and points to the answers on the page.

1. **API key.** Create a key at console.anthropic.com and set a monthly spending limit there (a few dollars is plenty to start). In Cloudflare: **Workers & Pages > pedalpause > Settings > Variables and Secrets > Add**, type **Secret**, name `ANTHROPIC_API_KEY`. Do this for Production.
2. **Limits (recommended).** Create a KV namespace called `pedalpause-rules-chat`, then add it under **Settings > Bindings > KV namespace** with the variable name `RULES_CHAT_LIMITS`. This caps each visitor at 15 questions an hour and the whole site at 300 a day. Change the daily cap with a variable named `RULES_DAILY_CAP`.
3. **Bot check (recommended).** In Cloudflare, open **Turnstile**, add a widget for `pedalpause.com`, and copy the two keys:
   - Put the **site key** in `rules.json` under `"chat": { "turnstile_site_key": "..." }`, then rebuild the page.
   - Add the **secret key** as a Secret named `TURNSTILE_SECRET`.
4. Redeploy (or push any change).

The question box never makes up a source: the model only picks which rules it used, and the links, dates and phone numbers are filled in from `rules.json`. It does not store questions.
