# hendrik_tabletop

Social media posts for my tabletop apps, one folder per post. A script renders the images from an HTML template and posts them with their text to Mastodon at [@hendrik_tabletop@mastodon.social](https://mastodon.social/@hendrik_tabletop). Bluesky gets every post through the [Bridgy Fed](https://fed.brid.gy/) mirror. The script then posts the same images and text to Pixelfed at [@hendrik_tabletop@pixelfed.social](https://pixelfed.social/hendrik_tabletop). Instagram gets the same images by hand.

## Setup

Needs Node 22 or newer.

```sh
npm install
npx playwright install chromium
cp .env.example .env
```

In `.env`, set `MASTODON_INSTANCE` to the server alone (`https://mastodon.social`, no path, no trailing slash) and `MASTODON_TOKEN` to the access token of an application created under Preferences → Development, with the scopes `write:media` and `write:statuses` only. Set `PIXELFED_INSTANCE` (`https://pixelfed.social`) and `PIXELFED_TOKEN` the same way. Where the instance turns off personal access tokens, create an OAuth client under Settings → Developers with the scopes `read` and `write` (Pixelfed needs `read` to check an upload) and exchange an authorization code for a token at `/oauth/token`; such a token expires, after a year on pixelfed.social. `.env` is git-ignored.

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
      Android: Open the link in Chrome, tap the menu :more_vert: and then Install app :install_mobile:
    graphic: fcw-start.png
    frame: phone
    toolbar: chrome
    alt: "Install steps above a phone showing the app's start page, Chrome's menu open."
hashtags: [TabletopGaming, Wargaming]
---

## Mastodon

How to install Fantasy City Warbands – no store, no account.

https://hennirocks.github.io/fantasy-city-warbands

## Instagram

How to install Fantasy City Warbands – no store, no account. Link in bio.
```

- `title` is one line; a line break in it (`"Your Fantasy City\nwarbands"`) sets a second one.
- `url` becomes the QR code on every slide.
- Each slide needs `alt` and either `text`, a `graphic` or both. A graphic is read from the folder's `originals/` and saved beside `post.md` as WebP, at most 1080 px wide; `originals/` is git-ignored. `frame: phone` draws a phone around it.
- A graphic the folder does not have is taken from `assets/screenshots/`, the screenshots more than one post shows. It is copied into the post once, so replacing a screenshot there leaves earlier posts as they were.
- `toolbar: safari` draws Safari's toolbar over the phone, `toolbar: chrome` Chrome's address bar with its menu open; both need `frame: phone`. The phone is then drawn larger and cut off at the image's bottom edge.
- `card: <image>` lays a single card, cut from a screenshot, tilted over the phone; it needs `frame: phone` and no `toolbar`, is read like a graphic, and phone and card are cut off at the image's bottom edge.
- `width: <px>` draws the phone at that width and cuts it off at the image's bottom edge, for a screenshot that needs to show larger than the whole phone fits; it needs `frame: phone` and goes with neither `toolbar` nor `card`, which set their own width.
- `side: |` sets paragraphs beside the phone, which then stands at the image's left edge with its right edge at 452 px, cut off at the bottom and, once `width` exceeds 452 px, on the left; it needs `frame: phone` and `width`. The text starts level with the phone's top, and its last paragraph stands at the bottom edge. The run fails if it does not fit.
- In `text` or `side`, a block that starts with `# ` is a heading, and a block of lines that start with `- ` is a list, one item per line; an item indented by two spaces belongs to the one above, as on the app's What's new page. A list takes the whole width.
- `:name:` in a slide's `text` or `side` is the icon of that name from `assets/icons/`, kept on one line with the word before it. `**words**` are set semibold. The icons are [Material Symbols](https://fonts.google.com/icons) (Apache 2.0); `node icons.mjs <name> …` fetches more.
- `hashtags` are added below the Mastodon text, which Pixelfed gets too; there is no `## Pixelfed` section.

Drafts live in `drafts/`, which is git-ignored, so a post is not public before it is ready. Published posts go into `posts/YYYY/YYYY-MM-DD-slug/`.

## Render

```sh
npm run render -- drafts/2026-11-04-how-to-install
```

Writes `1.jpg`, `2.jpg`, … (1080 × 1350, one per slide) into the folder. The run fails, and leaves the old images alone, if a line of the headline does not fit or a slide's content runs past the bottom edge.

`npm run render -- base` renders the template with its sample text to `out/base.jpg`.

## Post

```sh
npm run post -- drafts/2026-11-04-how-to-install --dry-run
npm run post -- drafts/2026-11-04-how-to-install
```

`--dry-run` prints the channels the post goes to, the Mastodon text, its length and the images with their alt text, and posts nothing. Without it, the script uploads the images with their alt text and posts publicly, first to Mastodon, then to Pixelfed with the same text, and writes each channel's status and image URLs to `published.json` as soon as that channel is done. A channel already in `published.json` is skipped, so a post goes out once on each: after a failure, running it again posts only to the channels still missing. A folder on both is refused.

The images must be rendered after the last change to `post.md`.

Mastodon takes four images per post, Pixelfed twenty. A channel gets the first ones its instance takes, so a post with more slides shows only its first four on Mastodon and, through the mirror, on Bluesky; `--dry-run` says so. A post with more slides than the most any channel takes is refused.

```sh
npm run publish
```

Picks what goes out, in a terminal: it lists every folder in `drafts/` that is not on both channels yet, with the channels still missing for one already partly out, what keeps one from going out and a warning when the date in its images is not today. The numbers typed pick the posts; each is shown as `--dry-run` shows it, and its images open in Preview unless declined. Then it asks twice – `y`, and the number of posts picked – and anything else posts nothing. The posts go out one after the other; if one fails, the run stops and names those already out. Each one posted moves to `posts/YYYY/`, and so does a draft already on both channels when a run starts, such as one posted with `npm run post`.

## Update posts

"Latest updates" is a recurring post of text only, set like the app's What's new page: a heading with the day, each game a list item with its entries beneath, the whole width. Every post has the same headline, `Latest updates`, and its QR code and link go to What's new. One post a week, on Saturdays, covers every day since the last one, one slide per day and at most four.

```sh
npm run updates
```

writes `drafts/<today>-latest-updates/post.md` from the app's `docs/whats-new.md` (read from `../fantasy-city-warbands`, or `--app <folder>`) for every day after the last `latest-updates` post in `posts/`, or after `--since YYYY-MM-DD`. It drops entries that only say a game's tile has a link, unless that is all a game has that day, and warns when a day has more than 8 entries or the post more than 4 days. Shortening stays by hand, in the slides and in their `alt`:

- Only what a player notices at the table; no more than 8 entries a slide and two lines an entry.
- Keep the old value as "(was …)", exactly as What's new has it.
- The Mastodon text is `Latest updates to Fantasy City Warbands: <games>.`, the link, and the line on the early version; it stays under 500 characters.

Before posting, check that the update is live.

## Link page

`site/` is the link page at [tabletop.hennirocks.de](https://tabletop.hennirocks.de), for the bio links: one static HTML page, no build step. Open `site/index.html` in a browser to preview it. Every push to `main` that changes `site/` publishes the folder as it is to GitHub Pages (`.github/workflows/pages.yml`).

## Credits

- [Grenze Gotisch](https://github.com/Omnibus-Type/Grenze-Gotisch) and [Alegreya](https://github.com/huertatipografica/Alegreya), SIL Open Font License, see `OFL.txt` in each folder under `assets/fonts/`.
- The link page uses the same two fonts as WOFF2 copies under `site/fonts/`, each with its `OFL.txt`, and icons from [Simple Icons](https://simpleicons.org/), CC0.
- Background after an etching by Urs Graf, 1524, public domain, see [`assets/backgrounds/CREDITS.md`](assets/backgrounds/CREDITS.md).

## License

The code is MIT licensed, see [`LICENSE`](LICENSE). Fonts and backgrounds keep their own licenses.
