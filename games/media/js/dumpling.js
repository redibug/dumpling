// ---------------------------------------------------------------------------
// DUMPLING game library.
//
// Dumpling is a fork of UNDUM (https://github.com/idmillington/undum)
// by Ian Millington. The game API is unchanged, so Undum documentation
// and tutorials still apply. The differences from upstream Undum:
//
//   * No jQuery dependency: the engine is pure modern vanilla
//     JavaScript (DOM APIs + Web Animations API).
//   * File renamed from undum.js to dumpling.js.
//
// This file needs to be supplemented with a game file (conventionally
// called "your-game-name.game.js" which will define the content of the
// game.
//
// Original Undum copyright (c) 2009-2010 Ian Millington, MIT License.
// Dumpling modifications are also released under the MIT License.
// ---------------------------------------------------------------------------

(function() {
    // -----------------------------------------------------------------------
    // Internal Infrastructure Implementations [NB: These have to be
    // at the top, because we use them below, but you can safely
    // ignore them and skip down to the next section.]
    // -----------------------------------------------------------------------

    // Feature detection

    const hasLocalStorage = function() {
        let hasStorage = false;
        try {
            hasStorage = ('localStorage' in window) &&
                window.localStorage !== null &&
                window.localStorage !== undefined;
        }
        catch (err) {
            // Firefox with the "Always Ask" cookie accept setting
            // will throw an error when attempting to access localStorage
            hasStorage = false;
        }
        return hasStorage;
    };

    const isMobileDevice = function() {
        return (navigator.userAgent.toLowerCase().search(
            /iphone|ipad|palm|blackberry|android/
        ) >= 0 || document.documentElement.clientWidth <= 640);
    };

    // Assertion

    class AssertionError extends Error {
        constructor(message) {
            super(message);
            this.name = "AssertionError";
        }
    }

    const assert = function(expression, message) {
        if (!expression) {
            throw new AssertionError(message);
        }
    };

    // -----------------------------------------------------------------------
    // Dumpling: vanilla DOM helpers (these replace jQuery)
    // -----------------------------------------------------------------------

    /* getElementById shorthand. Ids used by the engine are restricted
     * to [a-z0-9-], so this is always safe. */
    const $id = function(id) {
        return document.getElementById(id);
    };

    /* True if the node can be used as a query context (jQuery is
     * lenient about text nodes here, so are we). */
    const isQueryable = function(node) {
        return !!node && (node.nodeType === 1 ||
                          node.nodeType === 9 ||
                          node.nodeType === 11);
    };

    /* querySelector(All) shorthands. qsa returns a real array. */
    const qs = function(selector, context) {
        const ctx = context || document;
        if (!isQueryable(ctx)) return null;
        return ctx.querySelector(selector);
    };
    const qsa = function(selector, context) {
        const ctx = context || document;
        if (!isQueryable(ctx)) return [];
        return Array.prototype.slice.call(ctx.querySelectorAll(selector));
    };

    /* Document-relative top of a node, like jQuery's .offset().top.
     * Returns 0 for non-elements, matching jQuery's fallback. */
    const docTop = function(node) {
        if (node && typeof node.getBoundingClientRect === 'function') {
            return node.getBoundingClientRect().top + window.scrollY;
        }
        return 0;
    };

    /* Like jQuery's .attr(): returns undefined (not null) when the
     * attribute is missing, so option handling is unchanged. */
    const attr = function(element, name) {
        const value = element.getAttribute(name);
        return value === null ? undefined : value;
    };

    /* Content-box height of an element, like jQuery's .height(). */
    const elHeight = function(element) {
        const h = parseFloat(getComputedStyle(element).height);
        return isNaN(h) ? 0 : h;
    };

    /* True for text nodes containing only whitespace. */
    const isWhitespaceText = function(node) {
        return node.nodeType === 3 && !(/[^\t\n\f\r ]/.test(node.nodeValue));
    };

    /* Parses an HTML string into an array of nodes, like $(html).
     *
     * jQuery's HTML regex trims leading and trailing whitespace
     * before parsing, so a string like "\n  <h1>x</h1>\n  " parses to
     * just the <h1>. We match that: leading and trailing
     * whitespace-only text nodes are dropped. (This matters because
     * Undum games in the wild, including the official tutorial,
     * write content with leading whitespace, e.g. via .html().)
     *
     * Note: for exotic fragments jQuery also applies table-element
     * wrapping (its "wrapMap"); we don't. Write <table> wrappers
     * explicitly, as usual. */
    const parseHTML = function(html) {
        const template = document.createElement('template');
        template.innerHTML = html;
        const nodes = Array.prototype.slice.call(template.content.childNodes);
        while (nodes.length > 0 && isWhitespaceText(nodes[0])) {
            nodes.shift();
        }
        while (nodes.length > 0 &&
               isWhitespaceText(nodes[nodes.length - 1])) {
            nodes.pop();
        }
        return nodes;
    };

    /* Normalizes "Display Content" into an array of elements. Accepts
     * an HTML string, a single Element, or an array of Elements. */
    const asElements = function(content) {
        if (typeof content === 'string') return parseHTML(content);
        if (content instanceof Element) return [content];
        if (Array.isArray(content)) return content;
        return [];
    };

    /* Inserts nodes into a target, matching jQuery's append/prepend/
     * before/after/replaceWith. */
    const insertNodes = function(target, method, nodes) {
        switch (method) {
        case 'append':
            target.append.apply(target, nodes);
            break;
        case 'prepend':
            target.prepend.apply(target, nodes);
            break;
        case 'before':
            target.before.apply(target, nodes);
            break;
        case 'after':
            target.after.apply(target, nodes);
            break;
        case 'replaceWith':
            target.replaceWith.apply(target, nodes);
            break;
        }
    };

    /* jQuery's :visible check, close enough for our UI toggles. */
    const isVisible = function(element) {
        return getComputedStyle(element).display !== 'none';
    };

    /* Cache of default display values per tag name. */
    const defaultDisplays = {};
    /* The default display value for a tag (e.g. "block" for divs). */
    const defaultDisplay = function(tagName) {
        const tag = tagName.toLowerCase();
        if (!(tag in defaultDisplays)) {
            const probe = document.createElement(tag);
            document.body.appendChild(probe);
            defaultDisplays[tag] = getComputedStyle(probe).display;
            probe.remove();
        }
        return defaultDisplays[tag];
    };
    /* Show an element, overriding any stylesheet display:none.
     * Matches jQuery's .show(): plain style.display = '' is not
     * enough when the stylesheet hides the element. */
    const showElement = function(element) {
        element.style.display = '';
        if (getComputedStyle(element).display === 'none') {
            element.style.display = defaultDisplay(element.tagName);
        }
    };

    /* Fade/slide helpers built on the Web Animations API, replacing
     * jQuery's fadeIn/fadeOut/slideDown/slideUp/animate. */

    const fadeIn = function(element, ms, callback) {
        showElement(element);
        const anim = element.animate(
            [{opacity: 0}, {opacity: 1}], {duration: ms}
        );
        if (callback) anim.onfinish = callback;
    };

    const fadeOut = function(element, ms, callback) {
        const anim = element.animate(
            [{opacity: 1}, {opacity: 0}],
            {duration: ms, fill: 'forwards'}
        );
        anim.onfinish = function() {
            anim.cancel();
            element.style.display = 'none';
            if (callback) callback();
        };
    };

    const slideDown = function(element, ms, callback) {
        showElement(element);
        element.style.overflow = 'hidden';
        const targetHeight = element.scrollHeight;
        const anim = element.animate(
            [{height: '0px'}, {height: targetHeight + 'px'}],
            {duration: ms, easing: 'ease'}
        );
        anim.onfinish = function() {
            anim.cancel();
            element.style.height = '';
            element.style.overflow = '';
            if (callback) callback();
        };
    };

    /* Fades an element out, then collapses its height, then removes
     * it. Matches jQuery's .animate({opacity:0}).slideUp(cb) chain. */
    const fadeSlideUp = function(element, fadeMs, slideMs, callback) {
        const fade = element.animate(
            [{opacity: 1}, {opacity: 0}],
            {duration: fadeMs, fill: 'forwards'}
        );
        fade.onfinish = function() {
            // Hold the faded-out state as an inline style: cancelling
            // the animation would otherwise drop its fill and the
            // content would flash back to full opacity while shrinking.
            element.style.opacity = '0';
            fade.cancel();
            element.style.overflow = 'hidden';
            const startHeight = element.scrollHeight;
            const slide = element.animate(
                [{height: startHeight + 'px'}, {height: '0px'}],
                {duration: slideMs, easing: 'ease'}
            );
            slide.onfinish = function() {
                slide.cancel();
                element.remove();
                if (callback) callback();
            };
        };
    };

    /* Animates an element's width (used for quality progress bars). */
    const animateWidth = function(element, toPx, ms, callback) {
        const from = getComputedStyle(element).width;
        const anim = element.animate(
            [{width: from}, {width: toPx + 'px'}], {duration: ms}
        );
        if (callback) anim.onfinish = callback;
    };

    /* Animates an element's top offset (used for the mobile menu). */
    const animateTop = function(element, toPx, ms) {
        const from = getComputedStyle(element).top;
        element.animate(
            [{top: from}, {top: toPx + 'px'}],
            {duration: ms, fill: 'forwards'}
        );
    };

    /* Smooth scroll, replacing $("body, html").animate({scrollTop}). */
    const smoothScrollTo = function(y) {
        window.scrollTo({top: y, behavior: 'smooth'});
    };

    // -----------------------------------------------------------------------
    // Types for Author Use
    // -----------------------------------------------------------------------

    /* The game is split into situations, which respond to user
     * choices. Situation is the base type. It has three methods:
     * enter, act and exit, which you implement to perform any
     * processing and output any content. The default implementations
     * do nothing.
     *
     * You can either create your own type of Situation, and add
     * enter, act and/or exit functions to the prototype (see
     * SimpleSituation in this file for an example of that), or you
     * can give those functions in the opts parameter. The opts
     * parameter is an object. So you could write:
     *
     *    const situation = new Situation({
     *        enter: function(character, system, from) {
     *            ... your implementation ...
     *        }
     *    });
     *
     * If you pass in enter, act and/or exit through these options,
     * then they should have the same function signature as the full
     * function definitions, below.
     *
     * Note that SimpleSituation, a derived type of Situation, calls
     * passed in enter, act and exit functions AS WELL AS their normal
     * action. This is most often what you want: the normal behavior
     * plus a little extra custom behavior. If you want to override
     * the behavior of a SimpleSituation, you'll have to create a
     * derived type and set the enter, act and/or exit function on
     * their prototypes. In most cases, however, if you want to do
     * something completely different, it is better to derive your
     * type from this type: Situation, rather than one of its
     * children.
     *
     * In addition to enter, exit and act, the following options
     * related to implicit situation selection are available:
     *
     * optionText: a string or a function(character, system,
     *     situation) which should return the label to put in an
     *     option block where a link to this situation can be
     *     chosen. The situation passed in is the situation where the
     *     option block is being displayed.
     *
     * canView: a function(character, system, situation) which should
     *     return true if this situation should be visible in an
     *     option block in the given situation.
     *
     * canChoose: a function(character, system, situation) which should
     *     return true if this situation should appear clickable in an
     *     option block. Returning false allows you to present the
     *     option but prevent it being selected. You may want to
     *     indicate to the player that they need to collect some
     *     important object before the option is available, for
     *     example.
     *
     * tags: a list of tags for this situation, which can be used for
     *     implicit situation selection. The tags can also be given as
     *     space, tab or comma separated tags in a string. Note that,
     *     when calling `getSituationIdChoices`, tags are prefixed with
     *     a hash, but that should not be the case here. Just use the
     *     plain tag name.
     *
     * priority: a numeric priority value (default = 1). When
     *     selecting situations implicitly, higher priority situations
     *     are considered first.
     *
     * frequency: a numeric relative frequency (default = 1), so 100
     *     would be 100 times more frequent. When there are more
     *     options that can be displayed, situations will be selected
     *     randomly based on their frequency.
     *
     * displayOrder: a numeric ordering value (default = 1). When
     *     situations are selected implicitly, the results are ordered
     *     by increasing displayOrder.
     */
    class Situation {
        constructor(opts) {
            if (opts) {
                if (opts.enter) this._enter = opts.enter;
                if (opts.act) this._act = opts.act;
                if (opts.exit) this._exit = opts.exit;

                // Options related to this situation being automatically
                // selected and displayed in a list of options.
                this._optionText = opts.optionText;
                this._canView = opts.canView || true;
                this._canChoose = opts.canChoose || true;
                this._priority = (opts.priority !== undefined) ? opts.priority : 1;
                this._frequency =
                    (opts.frequency !== undefined) ? opts.frequency : 1;
                this._displayOrder =
                    (opts.displayOrder !== undefined) ? opts.displayOrder : 1;

                // Tag are not stored with an underscore, because they are
                // accessed directy. They should not be context sensitive
                // (use the canView function to do context sensitive
                // manipulation).
                if (opts.tags !== undefined) {
                    if (Array.isArray(opts.tags)) {
                        this.tags = opts.tags;
                    } else {
                        this.tags = opts.tags.split(/[ \t,]+/);
                    }
                } else {
                    this.tags = [];
                }
            } else {
                this._canView = true;
                this._canChoose = true;
                this._priority = 1;
                this._frequency = 1;
                this._displayOrder = 1;
                this.tags = [];
            }
        }
        /* A function that takes action when we enter a situation. The
         * last parameter indicates the situation we have just left: it
         * may be null if this is the starting situation. Unlike the
         * exit() method, this method cannot prevent the transition
         * happening: its return value is ignored. */
        enter(character, system, from) {
            if (this._enter) this._enter(character, system, from);
        }
        /* A function that takes action when we carry out some action in a
         * situation that isn't intended to lead to a new situation. */
        act(character, system, action) {
            if (this._act) this._act(character, system, action);
        }
        /* A function that takes action when we exit a situation. The last
         * parameter indicates the situation we are going to. */
        exit(character, system, to) {
            if (this._exit) this._exit(character, system, to);
        }
        /* Determines whether this situation should be contained within a
         * list of options generated automatically by the given
         * situation. */
        canView(character, system, situation) {
            if (typeof this._canView === 'function') {
                return this._canView(character, system, situation);
            } else {
                return this._canView;
            }
        }
        /* Determines whether this situation should be clickable within a
         * list of options generated automatically by the given situation. */
        canChoose(character, system, situation) {
            if (typeof this._canChoose === 'function') {
                return this._canChoose(character, system, situation);
            } else {
                return this._canChoose;
            }
        }
        /* Returns the text that should be used to display this situation
         * in an automatically generated list of choices. */
        optionText(character, system, situation) {
            if (typeof this._optionText === 'function') {
                return this._optionText(character, system, situation);
            } else {
                return this._optionText;
            }
        }
        /* Returns the priority, frequency and displayOrder for this situation,
         * when being selected using `system.getSituationIdChoices`. */
        choiceData(character, system, situation) {
            return {
                priority: this._priority,
                frequency: this._frequency,
                displayOrder: this._displayOrder
            };
        }
    }

    /* A simple situation has a block of content that it displays when
     * the situation is entered. The content must be valid "Display
     * Content" (see `System.prototype.write` for a definition). This
     * constructor has options that control its behavior:
     *
     * heading: The optional `heading` will be used as a section title
     *     before the content is displayed. The heading can be any
     *     HTML string, it doesn't need to be "Display Content". If
     *     the heading is not given, no heading will be displayed. If
     *     a heading is given, and no optionText is specified (see
     *     `Situation` for more information on `optionText`), then the
     *     heading will also be used for the situation's option text.
     *
     * actions: This should be an object mapping action Ids to a
     *     response. The response should either be "Display Content"
     *     to display if this action is carried out, or it should be a
     *     function(character, system, action) that will process the
     *     action.
     *
     * choices: A list of situation ids and tags that, if given, will
     *     be used to compile an implicit option block using
     *     `getSituationIdChoices` (see that function for more details
     *     of how this works). Tags in this list should be prefixed
     *     with a hash # symbol, to distinguish them from situation
     *     ids. If just a single tag or id is needed, it can be passed
     *     in as a string without wrapping into a list.
     *
     * minChoices: If `choices` is given, and an implicit choice block
     *     should be compiled, set this option to require at least
     *     this number of options to be displayed. See
     *     `getSituationIdChoices` for a description of the algorithm by
     *     which this happens. If you do not specify the `choices`
     *     option, then this option will be ignored.
     *
     * maxChoices: If `choices` is given, and an implicit choice block
     *     should be compiled, set this option to require no more than
     *     this number of options to be displayed. See
     *     `getSituationIdChoices` for a description of the algorithm
     *     by which this happens. If you do not specify the `choices`
     *     option, then this option will be ignored.
     *
     * The remaining options in the `opts` parameter are the same as for
     * the base Situation.
     */
    class SimpleSituation extends Situation {
        constructor(content, opts) {
            super(opts);
            this.content = content;
            this.heading = opts && opts.heading;
            this.actions = opts && opts.actions;

            this.choices = opts && opts.choices;
            this.minChoices = opts && opts.minChoices;
            this.maxChoices = opts && opts.maxChoices;
        }
        enter(character, system, from) {
            if (this.heading) {
                if (typeof this.heading === 'function') {
                    system.writeHeading(this.heading());
                } else {
                    system.writeHeading(this.heading);
                }
            }
            if (this._enter) this._enter(character, system, from);
            if (this.content) {
                if (typeof this.content === 'function') {
                    system.write(this.content());
                } else {
                    system.write(this.content);
                }
            }
            if (this.choices) {
                const choices = system.getSituationIdChoices(this.choices,
                                                             this.minChoices,
                                                             this.maxChoices);
                system.writeChoices(choices);
            }
        }
        act(character, system, action) {
            const response = this.actions[action];
            try {
                response(character, system, action);
            } catch (err) {
                if (response) system.write(response);
            }
            if (this._act) this._act(character, system, action);
        }
        optionText(character, system, sitn) {
            const parentResult = super.optionText(character, system, sitn);
            if (parentResult === undefined) {
                return this.heading;
            } else {
                return parentResult;
            }
        }
    }

    /* Instances of this class define the qualities that characters
     * may possess. The title should be a string, and can contain
     * HTML. Options are passed in in the opts parameter. The
     * following options are available.
     *
     * priority - A string used to sort qualities within their
     *     groups. When the system displays a list of qualities they
     *     will be sorted by this string. If you don't give a
     *     priority, then the title will be used, so you'll get
     *     alphabetic order. Normally you either don't give a
     *     priority, or else use a priority string containing 0-padded
     *     numbers (e.g. "00001").
     *
     * group - The Id of a group in which to display this
     *     parameter. The corresponding group must be defined in
     *     your `undum.game.qualityGroups` property.
     *
     * extraClasses - These classes will be attached to the <div> tag
     *     that surrounds the quality when it is displayed. A common
     *     use for this is to add icons representing the quality. In
     *     your CSS define a class for each icon, then pass those
     *     classes into the appropriate quality definitions.
     *
     * One key purpose of QualityDefinition is to format the quality
     * value for display. Quality values are always stored as numeric
     * values, but may be displayed in words or symbols. A number of
     * sub-types of QualityDefinition are given that format their
     * values in different ways.
     */
    class QualityDefinition {
        constructor(title, opts) {
            const myOpts = Object.assign({
                priority: title,
                group: null,
                extraClasses: null
            }, opts);
            this.title = title;
            this.priority = myOpts.priority;
            this.group = myOpts.group;
            this.extraClasses = myOpts.extraClasses;
        }
        /* Formats the value (which is always numeric) into the value to
         * be displayed. The result should be HTML (but no tags are
         * needed). If null is returned, then the quality definition will
         * not be displayed, so if you want an empty value return an empty
         * string. */
        format(character, value) {
            return value.toString();
        }
    }

    /* A quality that is always displayed as the nearest integer of
     * the current value, rounded down. Options (in the opts
     * parameter) are the same as for QualityDefinition. */
    class IntegerQuality extends QualityDefinition {
        format(character, value) {
            return Math.floor(value).toString();
        }
    }

    /* A quality that displays as an IntegerQuality, unless it is
     * zero, when it is omitted. Options (in the opts * parameter) are
     * the same as for QualityDefinition. */
    class NonZeroIntegerQuality extends IntegerQuality {
        format(character, value) {
            if (value === 0) {
                return null;
            } else {
                return super.format(character, value);
            }
        }
    }

    /* A quality that displays its full numeric value, including
     * decimal component. This is actually a trivial wrapper around
     * the QualityDefinition class, which formats in the same
     * way. Options (in the opts parameter) are the same as for
     * QualityDefinition. */
    class NumericQuality extends QualityDefinition {
        // Inherits everything; the default constructor passes
        // (title, opts) through to QualityDefinition.
    }

    /* A quality that displays its values as one of a set of
     * words. The quality value is first rounded down to the nearest
     * integer, then this value is used to select a word to
     * display. The offset parameter (optionally passed in as part of
     * the opts object) controls what number maps to what word.
     *
     * The following options (in the opts parameter) are available:
     *
     * offset - With offset=0 (the default), the quantity value of 0
     *     will map to the first word, and so on. If offset is
     *     non-zero then the value given will correspond to the first
     *     word in the list. So if offset=4, then the first word in
     *     the list will be used for value=4.
     *
     * useBonuses - If this is true (the default), then values outside
     *     the range of words will be construced from the word and a
     *     numeric bonus. So with offset=0 and five words, the last of
     *     which is 'amazing', a score of six would give 'amazing+1'.
     *     if this is false, then the bonus would be omitted, so
     *     anything beyond 'amazing' is still 'amazing'.
     *
     * Other options are the same as for QualityDefinition.
     */
    class WordScaleQuality extends QualityDefinition {
        constructor(title, values, opts) {
            const myOpts = Object.assign({
                offset: null,
                useBonuses: true
            }, opts);
            super(title, opts);
            this.values = values;
            this.offset = myOpts.offset;
            this.useBonuses = myOpts.useBonuses;
        }
        format(character, value) {
            let val = Math.floor(value - this.offset);
            let mod = "";
            if (val < 0) {
                mod = val.toString();
                val = 0;
            } else if (val >= this.values.length) {
                mod = "+" + (val - this.values.length + 1).toString();
                val = this.values.length - 1;
            }
            if (!this.useBonuses) mod = "";
            if (this.values[val] === null) return null;
            return this.values[val] + mod; // Type coercion
        }
    }

    /* A specialization of WordScaleQuality that uses the FUDGE RPG's
     * adjective scale (from 'terrible' at -3 to 'superb' at +3). The
     * options are as for WordScaleQuality. In particular you can use
     * the offset option to control where the scale starts. So you
     * could model a quality that everyone starts off as 'terrible'
     * (such as Nuclear Physics) with an offset of 0, while another that
     * is more common (such as Health) could have an offset of -5 so
     * everyone starts with 'great'.
     */
    class FudgeAdjectivesQuality extends WordScaleQuality {
        constructor(title, opts) {
            super(title, [
                "terrible".l(), "poor".l(), "mediocre".l(),
                "fair".l(), "good".l(), "great".l(), "superb".l()
            ], opts);
            if (!('offset' in opts)) this.offset = -3;
        }
    }

    /* An boolean quality that removes itself from the quality list if
     * it has a zero value. If it has a non-zero value, its value
     * field is usually left empty, but you can specify your own
     * string to display as the `onDisplay` parameter of the opts
     * object. Other options (in the opts parameter) are the same as
     * for QualityDefinition. */
    class OnOffQuality extends QualityDefinition {
        constructor(title, opts) {
            const myOpts = Object.assign({
                onDisplay: ""
            }, opts);
            super(title, opts);
            this.onDisplay = myOpts.onDisplay;
        }
        format(character, value) {
            if (value) return this.onDisplay;
            else return null;
        }
    }

    /* A boolean quality that has different output text for zero or
     * non-zero quality values. Unlike OnOffQuality, this definition
     * doesn't remove itself from the list when it is 0. The options
     * are as for QualityDefinition, with the addition of options
     * 'yesDisplay' and 'noDisplay', which contain the HTML fragments
     * used to display true and false values. If not given, these
     * default to 'yes' and 'no'.
     */
    class YesNoQuality extends QualityDefinition {
        constructor(title, opts) {
            const myOpts = Object.assign({
                yesDisplay: "yes".l(),
                noDisplay: "no".l()
            }, opts);
            super(title, opts);
            this.yesDisplay = myOpts.yesDisplay;
            this.noDisplay = myOpts.noDisplay;
        }
        format(character, value) {
            if (value) return this.yesDisplay;
            else return this.noDisplay;
        }
    }

    /* Defines a group of qualities that should be displayed together,
     * under the given optional title. These should be defined in the
     * `undum.game.qualityGroups` parameter. */
    class QualityGroup {
        constructor(title, opts) {
            const myOpts = Object.assign({
                priority: title,
                extraClasses: null
            }, opts);
            this.title = title;
            this.priority = myOpts.priority;
            this.extraClasses = myOpts.extraClasses;
        }
    }


    // -----------------------------------------------------------------------
    // Types Passed to Situations
    // -----------------------------------------------------------------------

    /* A system object is passed into the enter, act and exit
     * functions of each situation. It is used to interact with the
     * UI.
     */
    class System {
        constructor() {
            this.rnd = null;
            this.options = {
              all_links_once: true,
              mobile_hide_speed: 500,
              slide_up_speed: 500,
              fade_speed: 1500,
              progress_bar_speed: 1000
            }
            this.time = 0;
        }

        /* Removes all content from the page, clearing the main content area.
         *
         * If an elementSelector is given, then only that selector will be
         * cleared. Note that all content from the cleared element is removed,
         * but the element itself remains, ready to be filled again using
         * System.write.
         */
        clearContent(elementSelector) {
            let element = null;
            if (elementSelector) element = qs(elementSelector);
            if (!element) element = $id("content");
            element.replaceChildren();
        }

        /* Outputs regular content to the page. The content supplied must
         * be valid "Display Content".
         *
         * "Display Content" is any HTML string that begins with a HTML
         * start tag, ends with either an end or a closed tag, and is a
         * valid and self-contained snippet of HTML. Note that the string
         * doesn't have to consist of only one HTML tag. You could have
         * several paragraphs, for example, as long as the content starts
         * with the <p> of the first paragraph, and ends with the </p> of
         * the last. So "<p>Foo</p><img src='bar'>" is valid, but "foo<img
         * src='bar'>" is not.
         *
         * The content goes to the end of the page, unless you supply the
         * optional selector argument. If you do, the content appears
         * after the element that matches that selector.
         */
        write(content, elementSelector) {
            doWrite(content, elementSelector, 'append', 'after');
        }

        /* Outputs the given content in a heading on the page. The content
         * supplied must be valid "Display Content".
         *
         * The content goes to the end of the page, unless you supply the
         * optional selector argument. If you do, the content appears
         * after the element that matches that selector.
         */
        writeHeading(headingContent, elementSelector) {
            const heading = document.createElement("h1");
            heading.innerHTML = headingContent;
            doWrite(heading, elementSelector, 'append', 'after');
        }

        /* Outputs regular content to the page. The content supplied must
         * be valid "Display Content".
         *
         * The content goes to the beginning of the page, unless you
         * supply the optional selector argument. If you do, the content
         * appears after the element that matches that selector.
         */
        writeBefore(content, elementSelector) {
            doWrite(content, elementSelector, 'prepend', 'before');
        }

        /* Outputs regular content to the page. The content supplied must
         * be valid "Display Content".
         *
         * When a selector is not specified, this behaves identically to
         * System.prototype.write. If you supply a selector, the content
         * appears as a child node at the end of the content of the
         * element that matches that selector.
         */

        writeInto(content, elementSelector) {
            doWrite(content, elementSelector, 'append', 'append');
        }

        /* Replaces content with the content supplied, which must be valid
         * "Display Content".
         *
         * When a selector is not specified, this replaces the entire
         * content of the page. Otherwise, it replaces the element matched
         * with the selector. This replaces the entire element, including
         * the matched tags, so ideally the content supplied should fit
         * in its place in the DOM with the same kind of display element.
         */

        replaceWith(content, elementSelector) {
            doWrite(content, elementSelector, 'replaceWith', 'replaceWith');
        }

        /* Carries out the given situation change or action, as if it were
         * in a link that has been clicked. This allows you to do
         * procedural transitions. You might have an action that builds up
         * the character's strength, and depletes their magic. When the
         * magic is all gone, you can force a situation change by calling
         * this method. */
        doLink(code) {
            processLink(code);
        }

        /* Turns any links that target the given href into plain
         * text. This can be used to remove action options when an action
         * is no longer available. It is used automatically when you give
         * a link the 'once' class. */
        clearLinks(code) {
            qsa("a[href='" + code + "']").forEach(function(a) {
                const span = document.createElement("span");
                span.className = "ex_link";
                span.innerHTML = a.innerHTML;
                a.replaceWith(span);
            });
        }

        /* Given a list of situation ids, this outputs a standard option
         * block with the situation choices in the given order.
         *
         * The contents of each choice will be a link to the situation,
         * the text of the link will be given by the situation's
         * outputText property. Note that the canChoose function is
         * called, and if it returns false, then the text will appear, but
         * the link will not be clickable.
         *
         * Although canChoose is honored, canView and displayOrder are
         * not. If you need to honor these, you should either do so
         * manually, ot else use the `getSituationIdChoices` method to
         * return an ordered list of valid viewable situation ids.
         */
        writeChoices(listOfIds, elementSelector) {
            if (listOfIds.length === 0) return;

            const currentSituation = getCurrentSituation();
            const options = document.createElement("ul");
            options.className = "options";
            for (let i = 0; i < listOfIds.length; ++i) {
                const situationId = listOfIds[i];
                const situation = game.situations[situationId];
                assert(situation, "unknown_situation".l({id:situationId}));
                if (situation == currentSituation)
                {
                    continue;
                }

                let optionText = situation.optionText(character, this,
                                                      currentSituation);
                if (!optionText) optionText = "choice".l({number:i+1});
                const option = document.createElement("li");
                let a;
                if (situation.canChoose(character, this, currentSituation)) {
                    a = document.createElement("a");
                    a.setAttribute("href", situationId);
                } else {
                    a = document.createElement("span");
                }
                a.textContent = optionText;
                option.appendChild(a);
                options.appendChild(option);
            }
            doWrite(options, elementSelector, 'append', 'after');
        }

        /* Returns a list of situation ids to choose from, given a set of
         * specifications.
         *
         * This function is a complex and powerful way of compiling
         * implicit situation choices. You give it a list of situation ids
         * and situation tags (if a single id or tag is needed just that
         * string can be given, it doesn't need to be wrapped in a
         * list). Tags should be prefixed with a hash # to differentiate
         * them from situation ids. The function then considers all
         * matching situations in descending priority order, calling their
         * canView functions and filtering out any that should not be
         * shown, given the current state. Without additional parameters
         * the function returns a list of the situation ids at the highest
         * level of priority that has any valid results. So, for example,
         * if a tag #places matches three situations, one with priority 2,
         * and two with priority 3, and all of them can be viewed in the
         * current context, then only the two with priority 3 will be
         * returned. This allows you to have high-priority situations that
         * trump any lower situations when they are valid, such as
         * situations that force the player to go to one destination if
         * the player is out of money, for example.
         *
         * If a minChoices value is given, then the function will attempt
         * to return at least that many results. If not enough results are
         * available at the highest priority, then lower priorities will
         * be considered in turn, until enough situations are found. In
         * the example above, if we had a minChoices of three, then all
         * three situations would be returned, even though they have
         * different priorities. If you need to return all valid
         * situations, regardless of their priorities, set minChoices to a
         * large number, such as `Number.MAX_VALUE`, and leave maxChoices
         * undefined.
         *
         * If a maxChoices value is given, then the function will not
         * return any more than the given number of results. If there are
         * more than this number of results possible, then the highest
         * priority resuls will be guaranteed to be returned, but the
         * lowest priority group will have to fight it out for the
         * remaining places. In this case, a random sample is chosen,
         * taking into account the frequency of each situation. So a
         * situation with a frequency of 100 will be chosen 100 times more
         * often than a situation with a frequency of 1, if there is one
         * space available. Often these frequencies have to be taken as a
         * guideline, and the actual probabilities will only be
         * approximate. Consider three situations with frequencies of 1,
         * 1, 100, competing for two spaces. The 100-frequency situation
         * will be chosen almost every time, but for the other space, one
         * of the 1-frequency situations must be chosen. So the actual
         * probabilities will be roughly 50%, 50%, 100%. When selecting
         * more than one result, frequencies can only be a guide.
         *
         * Before this function returns its result, it sorts the
         * situations in increasing order of their displayOrder values.
         */
        getSituationIdChoices(listOfOrOneIdsOrTags, minChoices, maxChoices) {
            let datum;
            let i;

            // First check if we have a single string for the id or tag.
            if (typeof listOfOrOneIdsOrTags === 'string') {
                listOfOrOneIdsOrTags = [listOfOrOneIdsOrTags];
            }

            // First we build a list of all candidate ids.
            const allIds = {};
            for (i = 0; i < listOfOrOneIdsOrTags.length; ++i) {
                const tagOrId = listOfOrOneIdsOrTags[i];
                if (tagOrId.substr(0, 1) == '#') {
                    const ids = getSituationIdsWithTag(tagOrId.substr(1));
                    for (let j = 0; j < ids.length; ++j) {
                        allIds[ids[j]] = true;
                    }
                } else {
                    allIds[tagOrId] = true;
                }
            }

            // Filter out anything that can't be viewed right now.
            const currentSituation = getCurrentSituation();
            const viewableSituationData = [];
            for (let situationId in allIds) {
                const situation = game.situations[situationId];
                assert(situation, "unknown_situation".l({id:situationId}));

                if (situation.canView(character, system, currentSituation)) {
                    // While we're here, get the selection data.
                    const viewableSituationDatum =
                        situation.choiceData(character, system, currentSituation);
                    viewableSituationDatum.id = situationId;
                    viewableSituationData.push(viewableSituationDatum);
                }
            }

            // Then we sort in descending priority order.
            viewableSituationData.sort(function(a, b) {
                return b.priority - a.priority;
            });

            const committed = [];
            let candidatesAtLastPriority = [];
            let lastPriority;
            // In descending priority order.
            for (i = 0; i < viewableSituationData.length; ++i) {
                datum = viewableSituationData[i];
                if (datum.priority != lastPriority) {
                    if (lastPriority !== undefined) {
                        // We've dropped a priority group, see if we have enough
                        // situations so far, and stop if we do.
                        if (minChoices === undefined || i >= minChoices) break;
                    }
                    // Continue to acccumulate more options.
                    committed.push.apply(committed, candidatesAtLastPriority);
                    candidatesAtLastPriority = [];
                    lastPriority = datum.priority;
                }
                candidatesAtLastPriority.push(datum);
            }

            // So the values in committed we're committed to, because without
            // them we wouldn't hit our minimum. But those in
            // candidatesAtLastPriority might take us over our maximum, so
            // figure out how many we should choose.
            const totalChoices = committed.length + candidatesAtLastPriority.length;
            if (maxChoices === undefined || maxChoices >= totalChoices) {
                // We can use all the choices.
                committed.push.apply(committed, candidatesAtLastPriority);
            } else if (maxChoices >= committed.length) {
                // We can only use the commited ones.
                // NO-OP
            } else {
                // We have to sample the candidates, using their relative frequency.
                const candidatesToInclude = maxChoices - committed.length;
                for (i = 0; i < candidatesAtLastPriority.length; ++i) {
                    datum = candidatesAtLastPriority[i];
                    datum._frequencyValue = this.rnd.random() / datum.frequency;
                }
                candidatesAtLastPriority.sort(function(a, b) {
                    return a._frequencyValue - b._frequencyValue;
                });
                const chosen = candidatesAtLastPriority.slice(0, candidatesToInclude);
                committed.push.apply(committed, chosen);
            }

            // Now sort in ascending display order.
            committed.sort(function(a, b) {
                return a.displayOrder - b.displayOrder;
            });

            // And return as a list of ids only.
            const result = [];
            for (i = 0; i < committed.length; ++i) {
                result.push(committed[i].id);
            }
            return result;
        }

    /* Call this to change the character text: the text in the right
     * toolbar before the qualities list. This text is designed to be
     * a short description of the current state of your character. The
     * content you give should be "Display Content" (see
     * `System.prototype.write` for the definition).
     */
        setCharacterText(content) {
            const block = $id("character_text_content");
            const newContent = augmentLinks(content);
            const setContent = function() {
                block.replaceChildren();
                insertNodes(block, 'append', newContent);
            };
            if (interactive && isVisible(block)) {
                fadeOut(block, 250, function() {
                    setContent();
                    fadeIn(block, 750);
                });
                showHighlight($id("character_text"));
            } else {
                setContent();
            }
        }

    /* Call this to change the value of a character quality. Don't
     * directly change quality values, because that will not update
     * the UI. (You can change any data in the character's sandbox
     * directly, however, since that isn't displayed). */
        setQuality(quality, newValue) {
            const oldValue = character.qualities[quality];
            character.qualities[quality] = newValue;
            if (!interactive) return;

            // Work out how to display the values.
            let newDisplay;
            const qualityDefinition = game.qualities[quality];
            if (qualityDefinition) {
                newDisplay = qualityDefinition.format(character, newValue);
            } else {
                // We shouldn't display qualities that have no definition.
                return;
            }

            // Add the data block, if we need it.
            let qualityBlock = $id("q_"+quality);
            if (!qualityBlock) {
                if (newDisplay === null) return;
                qualityBlock = addQualityBlock(quality);
                fadeIn(qualityBlock, 500);
            } else {
                // Do nothing if there's nothing to do.
                if (oldValue == newValue) return;

                // Change the value.
                if (newDisplay === null) {
                    // Remove the block, and possibly the whole group, if
                    // it is the last quality in the group.
                    let toRemove = null;
                    const groupBlock = qualityBlock.closest('.quality_group');
                    if (qsa('.quality', groupBlock).length <= 1) {
                        toRemove = groupBlock;
                    } else {
                        toRemove = qualityBlock;
                    }

                    fadeOut(toRemove, 1000, function() {
                        toRemove.remove();
                    });
                } else {
                    const valBlock = qs("[data-attr='value']", qualityBlock);
                    fadeOut(valBlock, 250, function() {
                        valBlock.innerHTML = newDisplay;
                        fadeIn(valBlock, 750);
                    });
                }
            }
            showHighlight(qualityBlock);
        }

    /* Changes a quality to a new value, but also shows a progress bar
     * animation of the change. This probably only makes sense for
     * qualities that are numeric, especially ones that the player is
     * grinding to increase. The quality and newValue parameters are
     * as for setQuality. The progress bar is controlled by the
     * following options in the opts parameter:
     *
     * from - The proportion along the progress bar where the
     *     animation starts. Defaults to 0, valid range is 0-1.
     *
     * to - The proportion along the progress bar where the
     *     animation ends. Defaults to 1, valid range is 0-1.
     *
     * showValue - If true (the default) then the new value of the
     *     quality is displayed above the progress bar.
     *
     * displayValue - If this is given, and showValue is true, then
     *     the displayValue is used above the progress bar. If this
     *     isn't given, and showValue is true, then the display value
     *     will be calculated from the QualityDefinition, as
     *     normal. This option is useful for qualities that don't have
     *     a definition, because they don't normally appear in the UI.
     *
     * title - The title of the progress bar. If this is not given,
     *     then the title of the quality is used. As for displayValue
     *     this is primarily used when the progress bar doesn't have a
     *     QualityDefinition, and therefore doesn't have a title.
     *
     * leftLabel, rightLabel - Underneath the progress bar you can
     *     place two labels at the left and right extent of the
     *     track. These can help to give scale to the bar. So if the
     *     bar signifies going from 10.2 to 10.5, you might label the
     *     left and right extents with "10" and "11" respectively. If
     *     these are not given, then the labels will be omitted.
     */
        animateQuality(quality, newValue, opts) {
            let currentValue = character.qualities[quality];
            if (!currentValue) currentValue = 0;

            // Change the base UI.
            this.setQuality(quality, newValue);
            if (!interactive) return;

            // Overload default options.
            const myOpts = {
                from: 0,
                to: 1,
                title: null,
                showValue: true,
                displayValue: null,
                leftLabel: null,
                rightLabel: null
            };
            if (newValue < currentValue) {
                myOpts.from = 1;
                myOpts.to = 0;
            }
            Object.assign(myOpts, opts);

            // Run through the quality definition.
            const qualityDefinition = game.qualities[quality];
            if (qualityDefinition) {
                // Work out how to display the value
                if (myOpts.displayValue === null) {
                    myOpts.displayValue = qualityDefinition.format(
                        character, newValue
                    );
                }

                // Use the title.
                if (myOpts.title === null) {
                    myOpts.title = qualityDefinition.title;
                }
            }

            // Create the animated bar.
            const totalWidth = 496;
            const bar = qs("#ui_library #progress_bar").cloneNode(true);
            bar.removeAttribute("id");
            const widthElement = qs("[data-attr='width']", bar);
            widthElement.style.width = (myOpts.from*totalWidth) + 'px';

            // Configure its labels
            const titleLabel = qs("[data-attr='name']", bar);
            const valueLabel = qs("[data-attr='value']", bar);
            const leftLabel = qs("[data-attr='left_label']", bar);
            const rightLabel = qs("[data-attr='right_label']", bar);
            if (myOpts.title) {
                titleLabel.innerHTML = myOpts.title;
            } else {
                titleLabel.remove();
            }
            if (myOpts.showValue && myOpts.displayValue !== null) {
                valueLabel.innerHTML = myOpts.displayValue;
            } else {
                valueLabel.remove();
            }
            if (myOpts.leftLabel) {
                leftLabel.innerHTML = myOpts.leftLabel;
            } else {
                leftLabel.remove();
            }
            if (myOpts.rightLabel) {
                rightLabel.innerHTML = myOpts.rightLabel;
            } else {
                rightLabel.remove();
            }
            $id('content').appendChild(bar);

            // Start the animation
            const that = this;
            setTimeout(function() {
                animateWidth(widthElement, myOpts.to*totalWidth,
                             that.options.progress_bar_speed,
                             function() {
                        // After a moment to allow the bar to be read, we can
                        // remove it.
                        setTimeout(function() {
                            if (mobile) {
                                fadeOut(bar, that.options.mobile_hide_speed,
                                        function() {
                                            bar.remove();
                                        });
                            } else {
                                fadeSlideUp(bar, that.options.fade_speed,
                                            that.options.slide_up_speed);
                            }
                        }, 2000);
                    }
                );
            }, 500);
        }
    }

    /* The character that is passed into each situation is of this
     * form.
     *
     * The `qualities` data member maps the Ids of each quality to its
     * current value. When implementing enter, act or exit functions,
     * you should consider this to be read-only. Make all
     * modifications through `System.prototype.setQuality`, or
     * `System.prototype.animateQuality`. In your `init` function, you
     * can set these values directly.
     *
     * The `sandbox` data member is designed to allow your code to
     * track any data it needs to. The only proviso is that the data
     * structure should be serializable into JSON (this means it must
     * only consist of primitive types [objects, arrays, numbers,
     * booleans, strings], and it must not contain circular series of
     * references). The data in the sandbox is not displayed in the
     * UI, although you are free to use it to create suitable output
     * for the player..
     */
    class Character {
        constructor() {
            this.qualities = {};
            this.sandbox = {};
        }
    }

    /* The data structure holding the content for the game. By default
     * this holds nothing. It is this data structure that is populated
     * in the `.game.js` file. Each element in the structure is
     * commented, below.
     *
     * This should be static data that never changes through the
     * course of the game. It is never saved, so anything that might
     * change should be stored in the character.
     */
    const game = {

        // Situations

        /* An object mapping from the unique id of each situation, to
         * the situation object itself. This is the heart of the game
         * specification. */
        situations: {},

        /* The unique id of the situation to enter at the start of a
         * new game. */
        start: "start",

        // Quality display definitions

        /* An object mapping the unique id of each quality to its
         * QualityDefinition. You don't need definitions for every
         * quality, but only qualities in this mapping will be
         * displayed in the character box of the UI. */
        qualities: {},

        /* Qualities can have an optional group Id. This maps those
         * Ids to the group definitions that says how to format its
         * qualities.
         */
        qualityGroups: {},


        // Hooks

        /* This function is called at the start of the game. It is
         * normally overridden to provide initial character creation
         * (setting initial quality values, setting the
         * character-text. This is optional, however, as set-up
         * processing could also be done by the first situation's
         * enter function. If this function is given it should have
         * the signature function(character, system).
         */
        init: null,

        /* This function is called before entering any new
         * situation. It is called before the corresponding situation
         * has its `enter` method called. It can be used to implement
         * timed triggers, but is totally optional. If this function
         * is given it should have the signature:
         *
         * function(character, system, oldSituationId, newSituationId);
         */
        enter: null,

        /* Hook for when the situation has already been carried out
         * and printed. The signature is:
         *
         * function(character, system, oldSituationId, newSituationId);
         */
        afterEnter: null,

        /* This function is called before carrying out any action in
         * any situation. It is called before the corresponding
         * situation has its `act` method called. If this optional
         * function is given it should have the signature:
         *
         * function(character, system, situationId, actionId);
         *
         * If the function returns true, then it is indicating that it
         * has consumed the action, and the action will not be passed
         * on to the situation. Note that this is the only one of
         * these global handlers that can consume the event.
         */
        beforeAction: null,

        /* This function is called after carrying out any action in
         * any situation. It is called after the corresponding
         * situation has its `act` method called. If this optional
         * function is given it should have the signature:
         *
         * function(character, system, situationId, actionId);
         */
        afterAction: null,

        /* This function is called after leaving any situation. It is
         * called after the corresponding situation has its `exit`
         * method called. If this optional function is given it should
         * have the signature:
         *
         * function(character, system, oldSituationId, newSituationId);
         */
        exit: null
    };

    // =======================================================================

    // Code below doesn't form part of the public API for UNDUM, so
    // you shouldn't find you need to use it.

    // -----------------------------------------------------------------------
    // Internal Data
    // -----------------------------------------------------------------------

    /* The global system object. */
    const system = new System();

    /* This is the data on the player's progress that gets saved. */
    let progress = {
        // A random seed string, used internally to make random
        // sequences predictable.
        seed: null,
        // Keeps track of the links clicked, and when.
        sequence: [],
        // The time when the progress was saved.
        saveTime: null
    };

    /* The Id of the current situation the player is in. */
    let current = null;

    /* This is the current character. It should be reconstructable
     * from the above progress data. */
    let character = null;

    /* Tracks whether we're in interactive mode or batch mode. */
    let interactive = true;

    /* Tracks whether we're mobile or not. */
    let mobile = isMobileDevice();

    /* The system time when the game was initialized. */
    let startTime;

    /* The stack of links, resulting from the last action, still be to
     * resolved. */
    let linkStack = null;

    // -----------------------------------------------------------------------
    // Utility Functions
    // -----------------------------------------------------------------------

    const getCurrentSituation = function() {
        if (current) {
            return game.situations[current];
        } else {
            return null;
        }
    };

    const parse = function(str) {
        if (str === undefined) {
            return str;
        } else {
            return parseFloat(str);
        }
    };

    const parseList = function(str, canBeUndefined) {
        if (str === undefined) {
            if (canBeUndefined) {
                return undefined;
            } else {
                return [];
            }
        } else {
            return str.split(/[ ,\t]+/);
        }
    };

    const parseFn = function(str) {
        if (str === undefined) {
            return str;
        } else {
            const fstr = "(function(character, system, situation) {\n" +
                str + "\n})";
            const fn = eval(fstr);
            return fn;
        }
    };

    const loadHTMLSituations = function() {
        qsa("div.situation").forEach(function(situationElement) {
            const id = attr(situationElement, "id");
            assert(game.situations[id] === undefined,
                   "existing_situation".l({id:id}));

            const content = situationElement.innerHTML;
            const opts = {
                // Situation content
                optionText: attr(situationElement, "data-option-text"),
                canView: parseFn(attr(situationElement, "data-can-view")),
                canChoose: parseFn(attr(situationElement, "data-can-choose")),
                priority: parse(attr(situationElement, "data-priority")),
                frequency: parse(attr(situationElement, "data-frequency")),
                displayOrder: parse(attr(situationElement,
                                         "data-display-order")),
                tags: parseList(attr(situationElement, "data-tags"), false),
                // Simple Situation content.
                heading: attr(situationElement, "data-heading"),
                choices: parseList(attr(situationElement, "data-choices"),
                                   true),
                minChoices: parse(attr(situationElement, "data-min-choices")),
                maxChoices: parse(attr(situationElement, "data-max-choices"))
            };

            game.situations[id] = new SimpleSituation(content, opts);
        });
    };


    /* Outputs regular content to the page. Used by write and
     * writeBefore, the last two arguments control which DOM insertion
     * method is used to add the content.
     */
    const doWrite = function(content, selector, addMethod, appendMethod) {
        continueOutputTransaction();
        const output = augmentLinks(content);
        let element = null;
        if (selector) element = qs(selector);
        if (!element) {
            insertNodes($id('content'), addMethod, output);
        }
        else {
            insertNodes(element, appendMethod, output);
        }
        /* We want to scroll this new element to the bottom of the screen.
         * while still being visible. The easiest way is to find the
         * top edge of the *following* element and move that exactly
         * to the bottom (while still ensuring that this element is fully
         * visible.) */
        const lastOutput = output[output.length - 1];
        const nextel = lastOutput ? lastOutput.nextElementSibling : null;
        let scrollPoint;
        if (!nextel) {
            scrollPoint = elHeight($id('content')) +
                elHeight($id('title')) + 60;
        } else {
            scrollPoint = docTop(nextel) - window.innerHeight;
        }
        if (output.length) {
            const outputTop = docTop(output[0]);
            if (scrollPoint > outputTop)
                scrollPoint = outputTop;
        }
        /* We add a fifth of the window height to this point, so that the
         * element won't be placed too close to the bottom edge of the
         * viewport. If we overshoot the viewport, we'll just go down to
         * the bottom - desirable behaviour anyway, especially if we are
         * already there. */
        scrollStack[scrollStack.length-1] =
            (scrollPoint + (window.innerHeight * 0.2));
    };

    /* Gets the unique id used to identify saved games. */
    const getSaveId = function() {
        return 'undum_'+game.id+"_"+game.version;
    };

    /* Adds the quality blocks to the character tools. */
    const showQualities = function() {
        $id("qualities").replaceChildren();
        for (let qualityId in character.qualities) {
            addQualityBlock(qualityId);
        }
    };

    /* Fades in and out a highlight on the given element. */
    const showHighlight = function(domElement) {
        let highlight = qs(".highlight", domElement);
        if (!highlight) {
            highlight = document.createElement('div');
            highlight.className = 'highlight';
            domElement.appendChild(highlight);
        }
        fadeIn(highlight, 250);
        setTimeout(function() {
            fadeOut(highlight, 1000);
        }, 2000);
    };

    /* Finds the correct location and inserts a particular DOM element
     * fits into an existing list of DOM elements. This is done by
     * priority order, so all elements (existing and new) must have
     * their data-priority attribute set. */
    const insertAtCorrectPosition = function(parent, newItem) {
        const newPriority = newItem.getAttribute('data-priority');
        const children = parent.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (newPriority < child.getAttribute('data-priority')) {
                child.before(newItem);
                return;
            }
        }
        parent.appendChild(newItem);
    };

    /* Adds a new group to the correct location in the quality list. */
    const addGroupBlock = function(groupId) {
        const groupDefinition = game.qualityGroups[groupId];

        // Build the group div with appropriate heading.
        const groupBlock = qs("#ui_library #quality_group").cloneNode(true);
        groupBlock.setAttribute("id", "g_"+groupId);
        groupBlock.setAttribute("data-priority", groupDefinition.priority);

        const titleElement = qs("[data-attr='title']", groupBlock);
        if (groupDefinition.title) {
            titleElement.innerHTML = groupDefinition.title;
        } else {
            titleElement.remove();
        }

        if (groupDefinition.extraClasses) {
            for (let i = 0; i < groupDefinition.extraClasses.length; i++) {
                groupBlock.classList.add(groupDefinition.extraClasses[i]);
            }
        }

        // Add the block to the correct place.
        const qualities = $id("qualities");
        insertAtCorrectPosition(qualities, groupBlock);
        return groupBlock;
    };

    /* Adds a new quality to the correct location in the quality list. */
    const addQualityBlock = function(qualityId) {
        // Make sure we want to display this quality.
        const qualityDefinition = game.qualities[qualityId];
        if (!qualityDefinition) {
          throw new Error("Can't display a quality that hasn't been defined: "+
                          qualityId);
        }

        // Work out how the value should be displayed.
        const name = qualityDefinition.title;
        const val = qualityDefinition.format(
            character, character.qualities[qualityId]
        );
        if (val === null) return null;

        // Create the quality output.
        const qualityBlock = qs("#ui_library #quality").cloneNode(true);
        qualityBlock.setAttribute("id", "q_"+qualityId);
        qualityBlock.setAttribute("data-priority", qualityDefinition.priority);
        qs("[data-attr='name']", qualityBlock).innerHTML = name;
        qs("[data-attr='value']", qualityBlock).innerHTML = val;
        if (qualityDefinition.extraClasses) {
            for (let i = 0; i < qualityDefinition.extraClasses.length; i++) {
                qualityBlock.classList.add(qualityDefinition.extraClasses[i]);
            }
        }

        // Find or create the group block.
        let groupBlock;
        const groupId = qualityDefinition.group;
        if (groupId) {
            const group = game.qualityGroups[groupId];
            assert(group, "no_group_definition".l({id: groupId}));
            groupBlock = $id("g_"+groupId);
            if (!groupBlock) {
                groupBlock = addGroupBlock(groupId);
            }
        }

        // Position it correctly.
        const groupQualityList = qs(".qualities_in_group", groupBlock);
        insertAtCorrectPosition(groupQualityList, qualityBlock);
        return qualityBlock;
    };

    /* Output events are tracked, so we can make sure we scroll
     * correctly. We do this in a stack because one click might cause
     * a chain reaction. Of output events, only when we return to the
     * top level will we do the scroll.
     *
     * However, that leaves the question of where to scroll *to*.
     * (Remember that elements could be inserted anywhere in the
     * document.) Whenever we do a write(), we'll have to update the
     * top (last) stack element to that position.
     */
    const scrollStack = [];
    let pendingFirstWrite = false;
    const startOutputTransaction = function() {
        if (scrollStack.length === 0) {
            pendingFirstWrite = true;
        }
        // The default is "all the way down".
        scrollStack.push(
            elHeight($id('content')) + elHeight($id('title')) + 60
        );
    };
    const continueOutputTransaction = function() {
        if (pendingFirstWrite) {
            pendingFirstWrite = false;
            const separator = qs("#ui_library #turn_separator").cloneNode(true);
            separator.removeAttribute("id");
            $id('content').appendChild(separator);
        }
    };
    const endOutputTransaction = function() {
        let scrollPoint = scrollStack.pop();
        if (scrollStack.length === 0 && scrollPoint !== null) {
            if (interactive && !mobile) {
                smoothScrollTo(scrollPoint);
            }
            scrollPoint = null;
        }
    };

    /* This gets called when a link needs to be followed, regardless
     * of whether it was user action that initiated it. */
    const linkRe = /^([a-z0-9_-]+|\.)(\/([0-9a-z_-]+))?$/;
    const processLink = function(code) {
        // Check if we should do this now, or if processing is already
        // underway.
        if (linkStack !== null) {
            linkStack.push(code);
            return;
        }

        // Track where we're about to add new content.
        startOutputTransaction();

        // We're processing, so make the stack available.
        linkStack = [];

        // Handle each link in turn.
        processOneLink(code);
        while (linkStack.length > 0) {
            code = linkStack.shift();
            processOneLink(code);
        }

        // We're done, so remove the stack to prevent future pushes.
        linkStack = null;

        // Scroll to the top of the new content.
        endOutputTransaction();

        // We're able to save, if we weren't already.
        $id("save").disabled = false;
    };

    /* This gets called to actually do the work of processing a code.
     * When one doLink is called (or a link is clicked), this may set call
     * code that further calls doLink, and so on. This method processes
     * each one, and processLink manages this.
     */
    const processOneLink = function(code) {
        const match = code.match(linkRe);
        assert(match, "link_not_valid".l({link:code}));

        let situation = match[1];
        const action = match[3];

        // Change the situation
        if (situation !== '.') {
            if (situation !== current) {
                doTransitionTo(situation);
            }
        } else {
            // We should have an action if we have no situation change.
            assert(action, "link_no_action".l());
        }

        // Carry out the action
        if (action) {
            situation = getCurrentSituation();
            if (situation) {
                if (game.beforeAction) {
                    // Try the global act handler, and see if we need
                    // to notify the situation.
                    const consumed = game.beforeAction(
                        character, system, current, action
                    );
                    if (consumed !== true) {
                        situation.act(character, system, action);
                    }
                } else {
                    // We have no global act handler, always notify
                    // the situation.
                    situation.act(character, system, action);
                }
                if (game.afterAction) {
                    game.afterAction(character, system, current, action);
                }
            }
        }
    };

    /* This gets called when the user clicks a link to carry out an
     * action. */
    const processClick = function(code) {
        const now = (new Date()).getTime() * 0.001;
        system.time = now - startTime;
        progress.sequence.push({link:code, when:system.time});
        processLink(code);
    };

    /* Transitions between situations. */
    const doTransitionTo = function(newSituationId) {
        const oldSituationId = current;
        const oldSituation = getCurrentSituation();
        const newSituation = game.situations[newSituationId];

        assert(newSituation, "unknown_situation".l({id:newSituationId}));

        // We might not have an old situation if this is the start of
        // the game.
        if (oldSituation) {
            // Notify the exiting situation.
            oldSituation.exit(character, system, newSituationId);
            if (game.exit) {
                game.exit(character, system, oldSituationId, newSituationId);
            }

            const contentToHide = qsa('#content .transient, #content ul.options');
            qsa("#content a").forEach(function(link) {
                const href = link.getAttribute("href");
                if (href && href.match(/[?&]transient[=&]?/)) {
                    contentToHide.push(link);
                }
            });
            if (interactive) {
                if (mobile) {
                    contentToHide.forEach(function(element) {
                        fadeOut(element, system.options.mobile_hide_speed);
                    });
                } else {
                    // Get fade out speed of options, and slide up speed
                    // variables.
                    contentToHide.forEach(function(element) {
                        fadeSlideUp(element, system.options.fade_speed,
                                    system.options.slide_up_speed);
                    });
                }
            } else {
                contentToHide.forEach(function(element) {
                    element.remove();
                });
            }
            //  Remove links and transient sections.
            qsa('#content a').forEach(function(a) {
                const href = a.getAttribute("href");
                if (a.classList.contains('sticky') ||
                    (href && href.match(/[?&]sticky[=&]?/)))
                    return;
                const span = document.createElement("span");
                span.className = "ex_link";
                span.innerHTML = a.innerHTML;
                a.replaceWith(span);
            });
        }

        // Move the character.
        current = newSituationId;

        // Notify the incoming situation.
        if (game.enter) {
            game.enter(character, system, oldSituationId, newSituationId);
        }
        newSituation.enter(character, system, oldSituationId);

        // additional hook for when the situation text has already been printed
        if (game.afterEnter) {
            game.afterEnter(character, system, oldSituationId, newSituationId);
        }
    };

    /* Returns HTML from the given content with the non-raw links
     * wired up. */
    const augmentLinks = function(content) {
        const output = asElements(content);

        // Wire up the links for regular <a> tags.
        output.forEach(function(topElement) {
            qsa("a", topElement).forEach(function(a) {
                const href = a.getAttribute('href');
                if (!a.classList.contains("raw") ||
                    (href && href.match(/[?&]raw[=&]?/))) {
                    if (href && href.match(linkRe)) {
                        a.addEventListener('click', function(event) {
                            event.preventDefault();

                            // If we're a once-click, remove all matching
                            // links.
                            if (system.options.all_links_once === false
                                || (system.options.all_links_once === true
                                    && (a.classList.contains("once") ||
                                        href.match(/[?&]once[=&]?/)))) {
                                system.clearLinks(href);
                            }

                            processClick(href);
                            return false;
                        });
                    } else {
                        a.classList.add("raw");
                    }
                }
            });
        });

        return output;
    };

    /* Erases the character in local storage. This is permanent! */
    const doErase = function(force) {
        const saveId = getSaveId();
        if (localStorage[saveId]) {
            if (force || confirm("erase_message".l())) {
                delete localStorage[saveId];
                $id("erase").disabled = true;
                startGame();
            }
        }
    };

    /* Find and return a list of ids for all situations with the given tag. */
    const getSituationIdsWithTag = function(tag) {
        const result = [];
        for (let situationId in game.situations) {
            const situation = game.situations[situationId];

            for (let i = 0; i < situation.tags.length; ++i) {
                if (situation.tags[i] == tag) {
                    result.push(situationId);
                    break;
                }
            }
        }
        return result;
    };

    /* Set up the screen from scratch to reflect the current game
     * state. */
    const initGameDisplay = function() {
        // Transition into the first situation,
        $id("content").replaceChildren();

        const situation = getCurrentSituation();
        assert(situation, "no_current_situation".l());

        showQualities();
    };

    /* Clear the current game output and start again. */
    const startGame = function() {
        progress.seed = new Date().toString();

        character = new Character();
        system.rnd = new Random(progress.seed);
        progress.sequence = [{link:game.start, when:0}];

        // Empty the display
        $id("content").replaceChildren();

        // Start the game
        startTime = new Date().getTime() * 0.001;
        system.time = 0;
        if (game.init) game.init(character, system);
        showQualities();

        // Do the first state.
        doTransitionTo(game.start);
    };

    /* Saves the character to local storage. */
    const saveGame = function() {
        // Store when we're saving the game, to avoid exploits where a
        // player loads their file to gain extra time.
        const now = (new Date()).getTime() * 0.001;
        progress.saveTime = now - startTime;

        // Save the game.
        localStorage[getSaveId()] = JSON.stringify(progress);

        // Switch the button highlights.
        $id("erase").disabled = false;
        $id("save").disabled = true;
    };

    /* Loads the game from the given data */
    const loadGame = function(characterData) {
        progress = characterData;

        character = new Character();
        system.rnd = new Random(progress.seed);

        // Empty the display
        $id("content").replaceChildren();
        showQualities();

        // Now play through the actions so far:
        if (game.init) game.init(character, system);

        // Run through all the player's history.
        interactive = false;
        for (let i = 0; i < progress.sequence.length; i++) {
            const step = progress.sequence[i];
            // The action must be done at the recorded time.
            system.time = step.when;
            processLink(step.link);
        }
        interactive = true;

        // Reverse engineer the start time.
        const now = new Date().getTime() * 0.001;
        startTime = now - progress.saveTime;

        // Because we did the run through non-interactively, now we
        // need to update the UI.
        showQualities();
    };

    // -----------------------------------------------------------------------
    // Setup
    // -----------------------------------------------------------------------

    /* Export our API. */
    window.dumpling = {
        Situation: Situation,
        SimpleSituation: SimpleSituation,

        QualityDefinition: QualityDefinition,
        IntegerQuality: IntegerQuality,
        NonZeroIntegerQuality: NonZeroIntegerQuality,
        NumericQuality: NumericQuality,
        WordScaleQuality: WordScaleQuality,
        FudgeAdjectivesQuality: FudgeAdjectivesQuality,
        OnOffQuality: OnOffQuality,
        YesNoQuality: YesNoQuality,

        QualityGroup: QualityGroup,

        game: game,

        isInteractive: function() { return interactive; },

        // The dumpling set of translated strings.
        language: {}
    };
    // Alias for backwards compatibility with Undum games and docs.
    window.undum = window.dumpling;

    // -----------------------------------------------------------------------
    // Theme system
    // -----------------------------------------------------------------------

    /* Game authors pick a theme with `dumpling.theme = "name"`. Themes live
       in media/themes/<name>/, each with theme.css, theme-mobile.css, an
       img/ folder and an optional fonts/ folder. */
    const themeStylesheetBase = (function() {
        try {
            const src = document.currentScript && document.currentScript.src;
            const i = src ? src.lastIndexOf('/js/dumpling.js') : -1;
            if (i > 0) return src.slice(0, i) + '/themes/';
        } catch (e) {}
        return 'media/themes/';
    })();

    const applyThemeStylesheets = function(name) {
        const head = document.head ||
            document.getElementsByTagName('head')[0];
        qsa('link[data-dumpling-theme]').forEach(function(link) {
            link.remove();
        });
        const main = document.createElement('link');
        main.rel = 'stylesheet';
        main.media = 'screen';
        main.href = themeStylesheetBase + name + '/theme.css';
        main.setAttribute('data-dumpling-theme', name);
        const mobile = document.createElement('link');
        mobile.rel = 'stylesheet';
        mobile.media = 'only screen and (max-width: 640px)';
        mobile.href = themeStylesheetBase + name + '/theme-mobile.css';
        mobile.setAttribute('data-dumpling-theme', name);
        head.appendChild(main);
        head.appendChild(mobile);
    };

    let currentThemeName = 'strawberry-milk';
    Object.defineProperty(window.dumpling, 'theme', {
        enumerable: true,
        configurable: true,
        get: function() { return currentThemeName; },
        set: function(name) {
            if (typeof name !== 'string' || !name) return;
            currentThemeName = name;
            applyThemeStylesheets(name);
        }
    });
    // Load the default theme right away, so the page never flashes unstyled.
    applyThemeStylesheets(currentThemeName);

    /* Set up the game when everything is loaded. */
    document.addEventListener('DOMContentLoaded', function() {
        // Compile additional situations from HTML
        loadHTMLSituations();

        // Handle storage.
        if (hasLocalStorage()) {
            const erase = $id("erase");
            erase.addEventListener('click', function() {
                doErase();
            });
            const save = $id("save");
            save.addEventListener('click', saveGame);

            const storedCharacter = localStorage[getSaveId()];
            if (storedCharacter) {
                try {
                    loadGame(JSON.parse(storedCharacter));
                    save.disabled = true;
                    erase.disabled = false;
                } catch(err) {
                    doErase(true);
                }
            } else {
                save.disabled = true;
                erase.disabled = true;
                startGame();
            }
        } else {
            qs(".buttons").innerHTML = "<p>"+"no_local_storage".l()+"</p>";
            startGame();
        }

        // Display the "click to begin" message. (We do this in code
        // so that, if Javascript is off, it doesn't happen.)
        qsa(".click_message").forEach(function(element) {
            showElement(element);
        });

        // Show the game when we click on the title.
        $id("title").addEventListener('click', function() {
            qsa("#content_wrapper, #legal").forEach(function(element) {
                fadeIn(element, 500);
            });
            fadeIn($id("tools_wrapper"), 2000);
            $id("title").style.cursor = "default";
            qsa("#title .click_message").forEach(function(element) {
                fadeOut(element, 250);
            });
            if (mobile) {
                slideDown($id("toolbar"), 500);
                showElement($id("menu"));
            }
        }, {once: true});

        // Any point that an option list appears, its options are its
        // first links.
        document.body.addEventListener('click', function(event) {
            // Make option clicks pass through to their first link.
            const item = event.target.closest("ul.options li, #menu li");
            if (!item) return;
            const link = qs("a", item);
            if (link) {
                link.click();
            }
        });

        // Switch between the two UIs as we resize.
        const resize = function() {
            // Work out if we're mobile or not.
            const wasMobile = mobile;
            mobile = isMobileDevice();

            if (wasMobile != mobile) {
                const showing = !isVisible(qs(".click_message"));
                if (mobile) {
                    const menu = $id("menu");
                    if (showing) {
                        showElement($id("toolbar"));
                        showElement(menu);
                    }
                    menu.style.top = (-elHeight(menu)-52) + 'px';
                    // Go to the story view.
                    qsa("#character_panel, #info_panel").forEach(
                        function(element) {
                            element.style.display = 'none';
                        }
                    );
                } else {
                    // Use the full width version
                    $id("toolbar").style.display = 'none';
                    $id("menu").style.display = 'none';
                    if (showing) {
                        // Display the side bars
                        showElement($id("tools_wrapper"));
                    }
                    qsa("#character_panel, #info_panel").forEach(
                        function(element) {
                            element.style.display = '';
                        }
                    );
                }
                showElement($id("title"));
                if (showing) showElement($id("content_wrapper"));
            }
        };
        window.addEventListener('resize', resize);
        resize();

        // Handle display of the menu and resizing: used on mobile
        // devices and an small screens.
        initMenu();
    });

    const initMenu = function() {
        const menu = $id("menu");

        let menuVisible = false;
        const open = function() {
            animateTop(menu, 48, 500);
            menuVisible = true;
        };
        const close = function() {
            animateTop(menu, -elHeight(menu)-52, 250);
            menuVisible = false;
        };
        menu.style.top = (-elHeight(menu)-52) + 'px';

        // Slide up and down on clicks from the main button.
        $id("menu-button").addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            if (menuVisible) {
                close();
            } else {
                open();
            }
            return false;
        });

        // Register for clicks on the individual menu items: show the
        // relevant item.
        qsa("#menu a").forEach(function(menuLink) {
            menuLink.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                const target = qs(menuLink.getAttribute('href'));
                if (target && !isVisible(target)) {
                    // Fade out those we don't want. (Note: the
                    // original faded out every panel, including the
                    // target, before fading the target back in. We
                    // keep that behavior.)
                    qsa("#menu a").forEach(function(otherLink) {
                        const otherTarget =
                            qs(otherLink.getAttribute('href'));
                        if (otherTarget) fadeOut(otherTarget, 250);
                    });
                    // Fade in our target
                    setTimeout(function() { fadeIn(target, 500); }, 250);
                }
                close();
                return false;
            });
        });
    };

    // -----------------------------------------------------------------------
    // Contributed Code
    // -----------------------------------------------------------------------

    // Internationalization support based on the code provided by Oreolek.
    (function() {
        const codesToTry = {};
        /* Compiles a list of fallback languages to try if the given code
         * doesn't have the message we need. Caches it for future use. */
        const getCodesToTry = function(languageCode) {
            let codeArray = codesToTry[languageCode];
            if (codeArray) return codeArray;

            codeArray = [];
            if (languageCode in dumpling.language) {
                codeArray.push(languageCode);
            }
            const elements = languageCode.split('-');
            for (let i = elements.length-2; i > 0; i--) {
                const thisCode = elements.slice(0, i).join('-');
                if (thisCode in dumpling.language) {
                    codeArray.push(thisCode);
                }
            }
            codeArray.push("");
            codesToTry[languageCode] = codeArray;
            return codeArray;
        };
        const lookup = function(languageCode, message) {
            const languageData = dumpling.language[languageCode];
            if (!languageData) return null;
            return languageData[message];
        };
        const localize = function(languageCode, message) {
            let localized, thisCode;
            const languageCodes = getCodesToTry(languageCode);
            for (let i = 0; i < languageCodes.length; i++) {
                thisCode = languageCodes[i];
                localized = lookup(thisCode, message);
                if (localized) return localized;
            }
            return message;
        };

        // API
        String.prototype.l = function(args) {
            // Get lang attribute from html tag.
            const lang = document.documentElement.getAttribute("lang") || "";

            // Find the localized form.
            let localized = localize(lang, this);

            // Merge in any replacement content.
            if (args) {
                for (let name in args) {
                    localized = localized.replace(
                        new RegExp("\\{"+name+"\\}"), args[name]
                    );
                }
            }
            return localized;
        };
    })();

    // Random Number generation based on seedrandom.js code by David Bau.
    // Copyright 2010 David Bau, all rights reserved.
    //
    // Redistribution and use in source and binary forms, with or
    // without modification, are permitted provided that the following
    // conditions are met:
    //
    //   1. Redistributions of source code must retain the above
    //      copyright notice, this list of conditions and the
    //      following disclaimer.
    //
    //   2. Redistributions in binary form must reproduce the above
    //      copyright notice, this list of conditions and the
    //      following disclaimer in the documentation and/or other
    //      materials provided with the distribution.
    //
    //   3. Neither the name of this module nor the names of its
    //      contributors may be used to endorse or promote products
    //      derived from this software without specific prior written
    //      permission.
    //
    // THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND
    // CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
    // INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
    // MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
    // DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
    // CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
    // SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
    // NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
    // LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
    // HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
    // CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
    // OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
    // EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
    const Random = (function() {
        // Within this closure function the code is basically
        // David's. Undum's custom extensions are added as class
        // methods, below.
        const width = 256;
        const chunks = 6;
        const significanceExponent = 52;
        const startdenom = Math.pow(width, chunks);
        const significance = Math.pow(2, significanceExponent);
        const overflow = significance * 2;
        const diceRe = /^([1-9][0-9]*)?d([%FA]|[1-9][0-9]*)([-+][1-9][0-9]*)?$/;
        const aveMapping = [2,3,3,4,4,5];

        // Helper functions.
        const mixkey = function(seed, key) {
            seed += '';
            let smear = 0;
            for (let j = 0; j < seed.length; j++) {
                const lb = lowbits(j);
                smear ^= key[lb];
                key[lb] = lowbits(smear*19 + seed.charCodeAt(j));
            }
            seed = '';
            for (const k in key) {
                seed += String.fromCharCode(key[k]);
            }
            return seed;
        };
        const lowbits = function(n) {
            return n & (width - 1);
        };

        // Helper type.
        class ARC4 {
            constructor(key) {
                let t, u;
                const keylen = key.length;
                let i = 0, j = 0;
                this.i = 0;
                this.j = 0;
                this.m = 0;
                this.S = [];
                this.c = [];
                if (!keylen) { key = [keylen++]; }
                while (i < width) { this.S[i] = i++; }
                for (i = 0; i < width; i++) {
                    t = this.S[i];
                    j = lowbits(j + t + key[i % keylen]);
                    u = this.S[j];
                    this.S[i] = u;
                    this.S[j] = t;
                }
                this.g(width);
            }
            g(count) {
                const s = this.S;
                let i = lowbits(this.i + 1); let t = s[i];
                let j = lowbits(this.j + t); let u = s[j];
                s[i] = u;
                s[j] = t;
                let r = s[lowbits(t + u)];
                while (--count) {
                    i = lowbits(i + 1); t = s[i];
                    j = lowbits(j + t); u = s[j];
                    s[i] = u;
                    s[j] = t;
                    r = r * width + s[lowbits(t + u)];
                }
                this.i = i;
                this.j = j;
                return r;
            }
        }

        class Random {
            constructor(seed) {
                if (!seed) throw {
                    name: "RandomSeedError",
                    message: "random_seed_error".l()
                };
                const key = [];
                mixkey(seed, key);
                const arc4 = new ARC4(key);
                this.random = function() {
                    let n = arc4.g(chunks);
                    let d = startdenom;
                    let x = 0;
                    while (n < significance) {
                        n = (n + x) * width;
                        d *= width;
                        x = arc4.g(1);
                    }
                    while (n >= overflow) {
                        n /= 2;
                        d /= 2;
                        x >>>= 1;
                    }
                    return (n + x) / d;
                };
            }
            /* Returns a random floating point number between zero and
             * one. NB: The method below just throws an error, it will
             * be overridden in each Random object when the seed has
             * been correctly configured. */
            random() {
                throw {
                    name:"RandomError",
                    message: "random_error".l()
                };
            }
            /* Returns an integer between the given min and max values,
             * inclusive. */
            randomInt(min, max) {
                return min + Math.floor((max-min+1)*this.random());
            }
            /* Returns the result of rolling n dice with dx sides, and adding
             * plus. */
            dice(n, dx, plus) {
                let result = 0;
                for (let i = 0; i < n; i++) {
                    result += this.randomInt(1, dx);
                }
                if (plus) result += plus;
                return result;
            }
            /* Returns the result of rolling n averaging dice (i.e. 6 sided dice
             * with sides 2,3,3,4,4,5). And adding plus. */
            aveDice(n, plus) {
                let result = 0;
                for (let i = 0; i < n; i++) {
                    result += aveMapping[this.randomInt(0, 5)];
                }
                if (plus) result += plus;
                return result;
            }
            /* Returns a dice-roll result from the given string dice
             * specification. The specification should be of the form xdy+z,
             * where the x component and z component are optional. This rolls
             * x dice of with y sides, and adds z to the result, the z
             * component can also be negative: xdy-z. The y component can be
             * either a number of sides, or can be the special values 'F', for
             * a fudge die (with 3 sides, +,0,-), '%' for a 100 sided die, or
             * 'A' for an averaging die (with sides 2,3,3,4,4,5).
             */
            diceString(def) {
                const match = def.match(diceRe);
                if (!match) {
                    throw new Error(
                        "dice_string_error".l({string:def})
                    );
                }

                const num = match[1]?parseInt(match[1], 10):1;
                let sides;
                let bonus = match[3]?parseInt(match[3], 10):0;

                switch (match[2]) {
                case 'A':
                    return this.aveDice(num, bonus);
                case 'F':
                    sides = 3;
                    bonus -= num*2;
                    break;
                case '%':
                    sides = 100;
                    break;
                default:
                    sides = parseInt(match[2], 10);
                    break;
                }
                return this.dice(num, sides, bonus);
            }
        }

        return Random;
    })();

    // -----------------------------------------------------------------------
    // Default Messages
    // -----------------------------------------------------------------------
    const en = {
        terrible: "terrible",
        poor: "poor",
        mediocre: "mediocre",
        fair: "fair",
        good: "good",
        great: "great",
        superb: "superb",
        yes: "yes",
        no: "no",
        choice: "Choice {number}",
        no_group_definition: "Couldn't find a group definition for {id}.",
        link_not_valid: "The link '{link}' doesn't appear to be valid.",
        link_no_action: "A link with a situation of '.', must have an action.",
        unknown_situation: "You can't move to an unknown situation: {id}.",
        existing_situation: "You can't override situation {id} in HTML.",
        erase_message: "This will permanently delete this character and immediately return you to the start of the game. Are you sure?",
        no_current_situation: "I can't display, because we don't have a current situation.",
        no_local_storage: "No local storage available.",
        random_seed_error: "You must provide a valid random seed.",
        random_error: "Initialize the Random with a non-empty seed before use.",
        dice_string_error: "Couldn't interpret your dice string: '{string}'."
    };
    // Set this data as both the default fallback language, and the english
    // preferred language.
    dumpling.language[""] = en;
    dumpling.language["en"] = en;
}());
