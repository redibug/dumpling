# Dumpling themes

A theme is a folder in `media/themes/<name>/`:

- `theme.css` — main stylesheet (screen)
- `theme-mobile.css` — small-screen overrides
- `img/` — theme images, referenced from the CSS as `../img/...`
- `fonts/` — optional bundled fonts, referenced as `../fonts/...`

`media/img/` holds shared assets (like `external_link.png`) that every
theme can use via `../../img/...`.

Game authors pick a theme in their game file:

```js
dumpling.theme = "strawberry-milk";
```

The default is `strawberry-milk`. The engine injects the theme's
stylesheets as soon as the game sets the theme (or immediately at load
for the default), so the page never flashes unstyled. Setting
`dumpling.theme` again later swaps the stylesheets live.

Built-in themes:

- `strawberry-milk` — the cute default: soft pink CC0 paper,
  rounded UI, glowing links.
- `undum` — the original Undum look, preserved as-is.
