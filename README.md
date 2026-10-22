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
