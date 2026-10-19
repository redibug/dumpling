# Dumpling 🥟

Dumpling is a game framework for building a sophisticated form of
hypertext interactive fiction. It is a fork of
[Undum](https://github.com/idmillington/undum) by Ian Millington,
with the jQuery dependency removed — the engine is now pure modern
vanilla JavaScript.

If "hypertext interactive fiction" means nothing to you, then let's go
back a few steps. Remember those Choose Your Own Adventure, or
Fighting Fantasy books? Where you got to choose what your character
does next? Well if you think of that in a web-page you have hypertext
interactive fiction, or HIF. Instead of turning to a particular page,
you click a link, and the next bit of content appears.

The problem is that those kinds of games are pretty limited. Every
time the player does something, the story could go in different
directions. So the author has to either write masses of branches, or
else the decisions you make as a player have to be relatively short
lived. If you played CYOA books you'll know that the wrong move either
ended the story pretty quickly, or else it didn't really matter what
you did because you'd end up at the same place.

To beat this limitation, Dumpling allows you to make the output
dynamic. It allows you to keep track of what has happened to the
character (any kinds of data, in fact), and to then change the text
that gets output accordingly. Effectively it is like writing a CYOA
page that is different each time you read it. This allows for far
richer and more rewarding game design.

Dumpling is a pure client-side library. It consists of a HTML file
and two Javascript files. The HTML file uses a nice bit of styling,
so there's a bunch of CSS and images in the default package too, but
that can be replaced if you want. To create your own game, you edit
the HTML file a little (mainly just changing the title and author),
and edit one of the Javascript files.

Because the game is written in Javascript, you get the full power of a
dynamic and efficient programming language. This isn't a CYOA
scripting system with limited functionality. You can take control of
anything you want. Or you can just keep things simple using a bunch of
simple functions provided by Dumpling.


## What changed from Undum

* **No jQuery.** The engine (`games/media/js/dumpling.js`) uses only
  modern DOM APIs and the Web Animations API. There is no
  `jquery-*.min.js` anymore.
* **Same game API.** `undum.game`, `undum.Situation`,
  `undum.SimpleSituation`, the quality types — everything your game
  code touches is unchanged. Undum documentation and tutorials still
  apply; only the script file name changed (`undum.js` →
  `dumpling.js`).
* **Same save format.** Saves are still keyed as
  `undum_<game-id>_<version>`, so games ported from Undum keep their
  players' saves.

Upstream Undum is unmaintained (its author retired from it in 2018).
Dumpling exists so the engine can keep evolving: modern browser APIs,
and room for features Undum never got.


## Compatibility

Dumpling targets modern HTML5 browsers (Chrome, Firefox, Safari,
Edge). It uses the Web Animations API for its fades and slides, so
very old browsers are not supported — but anything from the last
decade is fine.

The local storage system on some browsers does not work when loading a
page from your hard drive. To test your game when developing it, you
may want to start up a simple local webserver. For example:

    python3 -m http.server

then open `http://localhost:8000/games/tutorial.en.html`.


## Getting Started

1. Download Dumpling. Use the 'download zip' link on the GitHub page.

2. Unzip Dumpling somewhere on your hard-drive.

3. Open `games/tutorial.en.html` in your browser (via a local
   webserver, see above), and play through the tutorial.

4. Copy `games/tutorial.en.html` to a file that reflects your game name.

5. Edit your HTML file and add the title, author and description of
   the game you want to write. At the bottom of the file change the
   name of `tutorial.game.en.js` to something else (by convention
   *your-game-name*`.game.js`).

6. Copy `tutorial.game.en.js` to the file name you chose in the last
   step. Open it and begin creating your game.


Reference documentation for the game API, including full API details,
is the Undum documentation at
[http://idmillington.github.io/undum/](http://idmillington.github.io/undum/)
(also included in the repository under `docs/`). The API is unchanged
in Dumpling.

The source code for all the files is also heavily commented, so if you
get stuck, go in and read it.


## Deploying

To deploy your game, just upload your HTML file and the `media` folder
to your webserver. You can serve several games with the same look and
feel from the same directory. You need a different HTML file for each
game, and each one should load the correct `.game.js` file at the
end. Add any media you need for your game (images, audio, video), and
the remaining files will be reused.

For example, if you had 3 games: `episode1`, `episode2`, and
`christmas-special`. You'd have a directory structure:

    episode1.html
    episode2.html
    christmas-special.html
    media/
        css/ ...
        img/ ...
        js/
            dumpling.js
        games/
            episode1/
                episode1.game.js
                ... media for episode 1 ...
            episode2/
                episode2.game.js
                ... media for episode 1 ...
            christmas-special/
                christmas-special.game.js
                ... media for christmas special ...

This assumes you use the same directory lay out that I do. You are
welcome to change things around, of course, as long as you work and
change the references.


## About the names

The name `undum` came from a little project that preceded the Undum
code base. In 2008 Ian Millington put together a simple browser based
game. It was narrative, but used the grind-based mechanics of games
such as Farmville and Mafia Wars. Because of the grinding, he called
it Carborundum, which he found he couldn't type at speed, so it became
Undum.

`dumpling` takes the "dum" from "undum", and is small and cute. 🥟


## License

The code, documentation, styles, design and images are all distributed
under the MIT license. This permits you to modify and use them, even
for commercial use. A copy of the MIT license is found in the LICENSE
file. The original Undum copyright (Ian Millington) is retained, as
the license requires.
