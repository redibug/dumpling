# Dumpling themes

A theme is a folder in `media/themes/<name>/`:

- `css/theme.css` — main stylesheet (screen)
- `css/theme-mobile.css` — small-screen overrides
- `img/` — theme images, referenced from the CSS as `../img/...`
- `fonts/` — optional bundled fonts, referenced from the CSS as `../fonts/...`

The CSS lives in its own `css/` folder so the relative `../img/` and
`../fonts/` URIs work the same way they did in the original Undum
layout. `media/img/` holds shared assets (like `external_link.png`)
that every theme can use via `../../img/...`.

Game authors declare a theme in the shell HTML, with real
`<link>` tags in the `<head>`:

```html
<link rel="stylesheet" media="screen" href="media/themes/dumpling/css/theme.css" data-dumpling-theme="dumpling">
<link rel="stylesheet" media="only screen and (max-width: 640px)" href="media/themes/dumpling/css/theme-mobile.css" data-dumpling-theme="dumpling">
```

Declaring the theme in the HTML keeps the page styled from the
very first paint: a head stylesheet is render-blocking, while a
stylesheet added by script can only arrive after the script
does — which flashes the unstyled page on slow loads.

The declaration is the whole mechanism. The engine never
injects, swaps, or removes theme stylesheets, and there is no
JavaScript theme setting: to give a game a different theme,
change the links in its shell.

Built-in themes:

- `dumpling` — the default: muted pink CC0 paper, rounded UI,
  jirai-kei vibes.
- `undum` — the original Undum look, preserved as-is.
