# visual-novel theme

A Dumpling theme that turns the engine into a visual novel, theme-only
— no engine changes. Pick it with `dumpling.theme = "visual-novel";`

## What you get

- Only the newest beat is visible, in a message box anchored to the
  bottom of the screen.
- A **Log** button expands that box upward into the full history.
- Backgrounds and character portraits per situation, as CSS
  backgrounds — so old scenes are never loaded (see below).
- Back / Erase survive in a slim top bar.

## Shell snippet (the one thing the theme cannot do alone)

A theme cannot add elements, so the log toggle lives in the author's
shell HTML, inside `#tools_wrapper`:

```html
<div id="tools_wrapper">
  <div id="info_panel" class="tools left">
    <h1>Title</h1><p>Blurb</p>
    <div class="buttons">
      <button id="back">Back</button><button id="erase">Erase</button>
    </div>
  </div>
  <div id="vn-logbar">
    <input type="checkbox" id="vn-log-toggle">
    <label for="vn-log-toggle">Log</label>
  </div>
  <div id="character_panel" class="tools right">…</div>
</div>
```

Do **not** build the toggle from anchor links or `:target` — the URL
hash is the save file, and any `#` navigation overwrites it.

## Authoring a scene

Open each situation with a `<figure class="scene">` whose layers are
CSS variables:

```html
<figure class="scene"
  style="--vn-bg:url(media/scenes/library.jpg);
         --vn-portrait:url(media/portraits/alice.png)"></figure>
<p>“You’re late,” Alice says, not looking up from her book.</p>
```

Rules that keep the trick working:

1. **Use CSS backgrounds, never `<img>` for scenes.** Browsers do not
   fetch background images for `display:none` elements, and every old
   figure is `display:none` — in story mode and in log mode alike
   (log mode shows only the last figure as the backdrop). An `<img>`
   would fetch eagerly, always, defeating the whole design.
2. **The scene figure must be the last `<figure>` in the document at
   that point.** The backdrop selector is `figure.scene:last-of-type`;
   a non-scene figure written after a scene figure in the same beat
   would steal that slot and hide the backdrop.
3. **Keep the figure empty** (no caption text) — it is a backdrop, not
   a picture in the text flow.

## How the current beat is found

The engine writes turns as a flat stream of siblings in `#content`,
cloning an `<hr>` in as the first write of each turn. It also does
the theme a favour on every transition: it freezes the old
situation's links into plain `<span class="ex_link">` elements —
every link except `.sticky` ones. So the current situation is the
one group in the document that still holds live links, and the
theme anchors on that fact. The anchor is the last `<hr>` that
comes before an element containing a live (non-sticky, non-raw)
link, and everything not after that `<hr>` is `display:none`:

```css
#content:has(> hr) > *:not(hr:nth-last-child(1 of hr:not(:has(a:not(.sticky,.raw))~hr), hr:first-of-type)~*) {
  display: none;
}
```

(The `hr:first-of-type` in the candidate list is a sentinel —
see the last bullet below.)

The hiding is inverted on purpose — elements after the anchor are
never force-shown, they are simply not targeted, so nothing hidden
by the engine or another rule can be revealed by accident. Things
worth knowing:

- Groups are per **situation**, not per click. An action response
  lands after a newer `<hr>` inside the same group, so it stays
  visible alongside its situation instead of replacing it. The
  choice list is pinned under the newest prose with flex `order`,
  since action responses append after it in the DOM.
- The **first** situation has no separator at all: the initial
  transition does not go through `processLink`, so
  `startOutputTransaction` never runs for it. The `:has(> hr)`
  guard covers that — while `#content` contains no `<hr>`, the
  rule stays off and the whole first beat shows.
- If no live link exists anywhere (an open text input has swapped
  the links for spans, or a room whose exits are all sticky), the
  anchor falls back to the last `<hr>` — plain per-turn behaviour.
- While you are still in the **first** situation, action clicks
  degrade to per-turn too. The first situation's group starts at
  the very top of `#content`, so every `<hr>` in the document
  follows one of its own live links and the real candidate set is
  empty. CSS cannot gate the rule on "a candidate exists" — that
  would take `:has()` wrapped around the anchor, and `:has()` may
  not be nested — so the candidate list admits `hr:first-of-type`
  as a sentinel. It is only ever picked when no real candidate
  exists, and it keeps the message box working (showing the latest
  turn) instead of letting the inverted rule hide everything. From
  the first transition onward, groups are per-situation as
  designed.
- A sticky action link clicked from an old (hidden) group writes
  its response into that old group, so it stays hidden until
  log mode.

## Caveats (all theme-level, none blockers)

- The title splash hides after the title click, keyed off the engine
  setting `.click_message` to `display:none` inline. If that signal
  ever changes, the title stays at the top instead — the game still
  works, it just looks less like a VN.
- Log mode opens at the top of the history; CSS alone cannot scroll
  it to the bottom.
- A very long beat scrolls inside the message box rather than
  paginating like a native VN.
- Modern browsers only: `:has()` and `:nth-last-child(of)` (2023+).
- `#legal` is hidden by this theme — put credits on the title splash.

## Demo

`games/visual-novel-demo.html` (from the repo root's `games/`
folder) is a three-beat toy using gradient stand-ins for scene art,
so it runs with no image files at all. Click the title, read, choose,
hit Log, and watch old beats come back without any old scene art
loading — that last part is the design working, not a bug.
