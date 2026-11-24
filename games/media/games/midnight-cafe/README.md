# The Midnight Café — html-authoring playtest demo

A tiny hand-playable game exercising every feature of Dumpling's
`html-authoring` branch: link-tag content files, data-enter/exit/act,
layered actions, and {{ }} interpolation — all authored in HTML.

## Files

- `games/midnight-cafe.html` — the shell, with the `start` and
  `garden` situations authored inline as HTML.
- `game.js` (this folder) — the minimal game definition; everything
  interesting lives in the HTML.
- `content/chapter2.html` (this folder) — the `cellar` situation,
  fetched at boot via `<link rel="dumpling-content">`.

## Run it

Serve the repo's `games/` folder over http (the content fetch needs
http — `file://` will not work) and open `midnight-cafe.html`:

```bash
cd games
python3 -m http.server 8937
# open http://localhost:8937/midnight-cafe.html and click the title
```

## What to try (covers everything in the spec)

1. **Start** — `data-enter` bumps the Visits counter *before* the
   content prints, so "visit 1" is already in the text. The name
   `Mel & Co.` proves `{{ }}` HTML-escaping.
2. **order** — a `div.action` text response, with `{{ }}` inside it.
3. **wave** — a `data-action-*` code attribute calling an inline helper.
4. **look around** — the shared `data-actions="commonActions"` table.
5. **poke the barista** — declared as BOTH `div.action` and
   `data-action-poke`: the div wins, and the console logs the
   collision warning.
6. **garden** — `data-act` fallback answers the undeclared `./dance`
   action; `data-exit` sets a flag on the way out.
7. **cellar** — lives ONLY in the fetched content file. Its inline
   `<script>` runs (defines `cellarNote()`), its `data-enter` counts
   trips, and it shows `{{ }}` escaped vs `{{{ }}}` raw side by side.
   The note text changes depending on whether you visited the garden
   (proves the `data-exit` flag survived).

Building this demo caught a real crash — a situation with `data-act`
but zero declared actions threw and the fallback never ran — fixed on
this branch ("Fix act() crash when a situation has data-act but no
declared actions").
