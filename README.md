# Pedal & Pause

Florida e-bike trail guides, gear advice and rules for riders 55+. Live at **pedalpause.com**.

This is a plain static website: HTML, one stylesheet, one small script. There is no build step, so Cloudflare can serve the files exactly as they sit in this repo.

## Folder layout

| Folder / file | What it is |
|---|---|
| `index.html` | Home page |
| `trails/` | Trail guides (each guide is its own folder with an `index.html`) |
| `gear/` | Racks, trikes, dog gear |
| `know-how/` | Rules and how-to explainers |
| `about/` | About page |
| `assets/css/site.css` | All styling |
| `assets/js/site.js` | Mobile menu |
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
