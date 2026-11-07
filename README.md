# hendrik_tabletop

Social media posts for my tabletop apps, one folder per post. A script renders the images from an HTML template and posts them with their text to Mastodon at [@hendrik_tabletop@mastodon.social](https://mastodon.social/@hendrik_tabletop). Bluesky gets every post through the [Bridgy Fed](https://fed.brid.gy/) mirror. Instagram gets the same images by hand.

## Setup

Needs Node 22 or newer.

```sh
npm install
npx playwright install chromium
cp .env.example .env
```

In `.env`, set `MASTODON_INSTANCE` to the server alone (`https://mastodon.social`, no path, no trailing slash) and `MASTODON_TOKEN` to the access token of an application created under Preferences → Development, with the scopes `write:media` and `write:statuses` only. `.env` is git-ignored.

## A post

A post is a folder with a `post.md`: YAML frontmatter for the images, then one `## <Channel>` section per channel for the text.

```markdown
---
date: 2026-11-04
template: base
title: "How to: Install"
url: https://hennirocks.github.io/fantasy-city-warbands
slides:
  - text: |
      Fantasy City Warbands runs in your browser and installs like an app.
    alt: "Post headed How to: Install, explaining that the app installs from the browser."
  - text: |
      On Android, tap the menu and choose Install app.
    graphic: start.png
    frame: phone
    alt: "Install steps above a phone showing the app's start page."
hashtags: [TabletopGaming, Wargaming]
---

## Mastodon

How to install Fantasy City Warbands – no store, no account.

https://hennirocks.github.io/fantasy-city-warbands

## Instagram

How to install Fantasy City Warbands – no store, no account. Link in bio.
```

- `url` becomes the QR code on every slide.
- Each slide needs `alt` and either `text`, a `graphic` or both. A graphic is read from the folder's `originals/` and saved beside `post.md` as WebP, at most 1080 px wide; `originals/` is git-ignored. `frame: phone` draws a phone around it.
- `hashtags` are added below the Mastodon text.

Drafts live in `drafts/`, which is git-ignored, so a post is not public before it is ready. Published posts go into `posts/YYYY/YYYY-MM-DD-slug/`.

## Render

```sh
npm run render -- drafts/2026-11-04-how-to-install
```

Writes `1.jpg`, `2.jpg`, … (1080 × 1350, one per slide) into the folder. The run fails, and leaves the old images alone, if a headline does not fit on one line or a slide's content runs past the bottom edge.

`npm run render -- base` renders the template with its sample text to `out/base.jpg`.

## Post

```sh
npm run post -- drafts/2026-11-04-how-to-install --dry-run
npm run post -- drafts/2026-11-04-how-to-install
```

`--dry-run` prints the Mastodon text, its length and the images with their alt text, and posts nothing. Without it, the script uploads the images with their alt text, posts publicly and writes `published.json` with the status and image URLs. It refuses a folder that already has a Mastodon entry there, so a post goes out once.

The images must be rendered after the last change to `post.md`.

## Link page

`site/` is the link page at [tabletop.hennirocks.de](https://tabletop.hennirocks.de), for the bio links: one static HTML page, no build step. Open `site/index.html` in a browser to preview it. Every push to `main` that changes `site/` publishes the folder as it is to GitHub Pages (`.github/workflows/pages.yml`).

## Credits

- [Grenze Gotisch](https://github.com/Omnibus-Type/Grenze-Gotisch) and [Alegreya](https://github.com/huertatipografica/Alegreya), SIL Open Font License, see `OFL.txt` in each folder under `assets/fonts/`.
- The link page uses the same two fonts as WOFF2 copies under `site/fonts/`, each with its `OFL.txt`, and icons from [Simple Icons](https://simpleicons.org/), CC0.
- Background after an etching by Urs Graf, 1524, public domain, see [`assets/backgrounds/CREDITS.md`](assets/backgrounds/CREDITS.md).

## License

The code is MIT licensed, see [`LICENSE`](LICENSE). Fonts and backgrounds keep their own licenses.
