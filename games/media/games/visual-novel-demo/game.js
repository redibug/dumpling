// Visual-novel theme demo: three beats, gradient stand-ins for scene art.
// Scene layers are CSS variables on the figure — swap the gradients for
// url(...) art in a real game; the theme's display:none rule is what
// keeps old scenes from ever loading.
dumpling.theme = "visual-novel";
dumpling.game.id = "visual-novel-demo-0001";
dumpling.game.version = "1.0";
dumpling.game.fadeSpeed = 100;
dumpling.game.slideUpSpeed = 100;

dumpling.game.situations = {
    library: new dumpling.SimpleSituation(
        `<figure class="scene" style="--vn-bg:linear-gradient(160deg, #2a1a3e, #120e1c); --vn-portrait:linear-gradient(180deg, #ff9ec4, #7a2a52)"></figure>
        <p>The academy library at dusk. Dust in the last light, and Alice
        not looking up from her book.</p>
        <p>“You’re late,” she says.</p>
        <p class="transient">You could <a href="garden">slip out to the garden</a>,
        or <a href="./apologise">apologise</a>.</p>`,
        {
            actions: {
                'apologise': `<p>“Sorry,” you say. She turns a page.
                “You’re still late. Sit down.”</p>
                <p class="transient">The garden is still out there, if you
                <a href="garden">go now</a>.</p>`
            }
        }
    ),
    garden: new dumpling.SimpleSituation(
        `<figure class="scene" style="--vn-bg:linear-gradient(160deg, #1e3a2a, #0c1a12); --vn-portrait:linear-gradient(180deg, #ffe08a, #b8742a)"></figure>
        <p>The garden at night. Fireflies stitching the dark, and someone
        already waiting on the bench.</p>
        <p>“Took you long enough,” says the second girl, smiling.</p>
        <p class="transient"><a href="library">Go back inside</a>, or
        <a href="ending">stay a while</a>.</p>`
    ),
    ending: new dumpling.SimpleSituation(
        `<figure class="scene" style="--vn-bg:linear-gradient(160deg, #3e1a2e, #160a14); --vn-portrait:linear-gradient(180deg, #c9a8ff, #5a2a8a)"></figure>
        <p>You stay. The fireflies keep their own time, and for once
        nobody is in a hurry.</p>
        <p class="transient">The demo ends here —
        <a href="library">start over</a>.</p>`
    )
};

dumpling.game.start = "library";
dumpling.game.qualities = {};
dumpling.game.qualityGroups = {};
dumpling.game.init = function(character, system) {
    system.setCharacterText("<p>A demo player, running late.</p>");
};
