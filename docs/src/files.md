# Loading and Saving

# Loading and Saving

There is no API for you to manually access loading and saving
functionality. The load and save functions are triggered by the
buttons on the user interface. But the way loading and saving work
does have a big impact on the way you write your code.

Undum makes a big feature of the fact that you can scroll back through
the story you've helped create. To save your character's progress you
would have to save not only the current situation and the character's
qualities, but also all the text that has been generated up to that
point. This would not be a problem in a downloaded game, because your
hard-drive is plenty big enough. Unfortunately in a browser game,
there is a limit on how much data you can store. Worse, this data
limit is per-domain. So if you hosted 10 Undum games on a server, the
saved games from all ten would have to fit into the limited
space. This makes it impractical to save the complete text history.

Instead Undum saves all the actions you've taken as a player. It
doesn't save the character's qualities or any other information, just
the actions. It expects to be able to rebuild the complete text, and
the complete current state of the character, by playing back these
actions when the file is loaded. We call this determinism, because the
current state of the character and the content needs to be determined
from just the actions they take.

# Writing with Saving / Loading in Mind

This means that you must take care to write all your code in a way
that will generate *exactly* the same results if the game was played
again in the same way.

There are two major limitations to this, firstly it means you can't
use random events, and secondly you can't use timed events. Both of
these are such serious limitations that Undum provides ways around
them.

If you do not follow these restrictions, then it is likely that saved
games will not load correctly. A player may save their game at one
point and find most of their progress wiped out when they load it
again.

## Random Numbers

Undum provides your code with a random number generator in
`System.rng`, which is an object with the prototype `Random`. This
random number generator works with the loading and saving code to make
sure that, when you load a saved game, the exact same random number
requests will produce the exact same result. This means you get all
the benefits of randomness (i.e. two separate games may have different
results for the same action), but we can always replay a game
exactly. Dealing with random actions is a difficult issue in testing
any interactive fiction game. This approach solves that problem. You
should, therefore, *never* use Javascript's built-in random number
generate (`Math.random`), only ever use the one provided by Undum.

## Timing

Finally, Undum also provides your code timing information in
`System.time`, which is the number of seconds (and fractional seconds)
elapsed since the player began the game. You can use this timing
information to implement puzzles in your game (such as asking the
player to complete a series of tasks in a specified amount of
time). This timing system coordinates with the loading and saving
system to make sure that, when you save and load the game, the timing
picks up where it left off. Feel free to make decisions in your code
based on the current value of `System.time`, but never use
Javascript's `Date` object.

## Detecting Replay When Loading

If your game has elements that should not be triggered while Undum is
replaying a saved game, for example sound effects or popup notifications,
you can use `undum.isInteractive()` to test whether the game is being
played normally (returns `true`) or being loaded from a save game
(returns `false`).

## The Save URL

*Dumpling only.* A save is the page's own URL: there is no save
button, and nothing is stored anywhere else. After the `#`, the
hash holds three colon-separated parts:

    #<version>:<seed>:<tokens>

The version is your game's version string. If it doesn't match the
game being loaded, the player is warned that the save may be stale
and chooses whether to try it anyway. The seed is a short random
string that makes the game's random number generator replay
identically. The tokens are the player's actions, comma-separated.
Each token is either the index of the link that was clicked
(counting the live links on the page at that time) or a text input
value, percent-encoded. Which kind a token is follows from the
game state at that step, so tokens need no marker of their own.

A run of the same token repeated — the same link index over and
over, as when a player clicks through a long passage — is written
once as `token*count` and expanded back when the save is loaded.
The largest run written or expanded this way is set by
`dumpling.maxRunLength` (1000 by default). A typed answer can
never be mistaken for a run: asterisks in input values are
percent-encoded along with everything else unsafe, so a bare `*`
in a save only ever means a run.


