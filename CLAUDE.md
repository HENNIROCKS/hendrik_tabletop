# CLAUDE.md – hendrik_tabletop

Teaser für Social Media, aus einer Datei je Post: Ein Skript rendert das Bild
aus einem von zwei bis drei Templates und postet Bild und Text auf Mastodon,
von dort gespiegelt nach Bluesky; Instagram bekommt dasselbe Bild von Hand.
Dazu kommt eine eigene Linkseite statt Linktree.
Gedacht für jede App, nicht nur Fantasy City Warbands.

## Kanäle

- Mastodon: `https://mastodon.social/@hendrik_tabletop` – erster Kanal, hier
  wird gepostet.
- Bluesky: das von Bridgy Fed gespiegelte Konto des Mastodon-Kontos, kein
  eigenes. Bekommt jeden Mastodon-Post ohne eigenen Aufruf.
- Instagram: `https://www.instagram.com/hendrik_tabletop/` – von Hand,
  mit Kommentaren.

Ein Bild für alle Kanäle, ein eigener Text je Kanal.

## Sprache

Posts, Templates, Code, Kommentare, README und Commits sind englisch.

## Grenzen

- Das Repo wird öffentlich. Tokens stehen nie darin: sie stehen lokal in
  einer `.env`, die in `.gitignore` steht.
- Entwürfe bleiben lokal in einem ignorierten Ordner, bis sie fertig sind –
  ein gepushter Post ist vor seinem Datum öffentlich lesbar.
- Ins Repo kommen nur Schriften mit freier Lizenz (mit Lizenzdatei), eigene
  oder gemeinfreie Hintergründe mit Quelle in `CREDITS.md` und Screenshots
  der Apps – keine Bilder aus Regelbüchern.
