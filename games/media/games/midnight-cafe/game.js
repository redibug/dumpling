// Minimal game definition for the html-authoring demo.
// Everything interesting lives in the HTML; this is just the shell.

dumpling.theme = "dumpling";

dumpling.game.id = "html-authoring-demo-001";
dumpling.game.version = "1.0";

dumpling.game.start = "start";

dumpling.game.qualities = {
    visits: new dumpling.IntegerQuality(
        "Visits", {priority:"0001", group:"stats"}
    )
};

dumpling.game.qualityGroups = {
    stats: new dumpling.QualityGroup(null, {priority:"0001"})
};

dumpling.game.init = function(character, system) {
    character.qualities.visits = 0;
    // The & exercises {{ }} HTML-escaping in the demo text.
    character.sandbox.name = "Mel & Co.";
};
