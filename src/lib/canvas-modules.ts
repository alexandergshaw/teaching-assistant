/**
 * Client for the Canvas LMS Modules and Pages REST APIs.
 *
 * Lets the Course Content tab read a course's module structure (modules and the
 * ordered, typed items inside them) and its wiki pages, then edit them: rename
 * and reorder modules/items, toggle publish state, add/remove items, and edit a
 * page's HTML body.
 *
 * Page bodies are HTML and are passed through verbatim (no lossy text<->HTML
 * conversion) so formatting, links, images, and embeds survive a round trip.
 *
 * Server-only: credentials come from canvas-core (the instructor API token is
 * read from the environment and never exposed to the client).
 */

export * from "./canvas-modules/index";
