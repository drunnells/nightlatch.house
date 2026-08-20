# Nightlatch House Agent Instructions

Nightlatch House is a PHP 7.x project for a point-and-click puzzle adventure inspired by classic room-based puzzle games. The first phase focuses on tooling and data structures for creating rooms. The game will be primarily HTML, CSS, and JavaScript, with graphics, animations, and sounds.

## Project Conventions

- Keep PHP compatible with PHP 7.x.
- Prefer simple, explicit PHP arrays for shared configuration structures.
- Keep browser-facing gameplay code in HTML, CSS, and JavaScript unless the project establishes a different structure later.
- Use Bootstrap, jQuery, and Font Awesome for the primary admin UI unless the project establishes a different admin stack later.
- Treat generated graphics, animation assets, and sound assets as first-class game content. Do not rename or reorganize them casually.
- Game design tooling may use generative AI providers, including Google Gemini and OpenAI.

## Configuration Rules

- The real local config file is `config/config.php`. It is always off-limits to agents.
- Never open, read, print, inspect, summarize, grep, search, parse, lint, diff, copy, or cat `config/config.php`.
- Never request the contents of `config/config.php` from the user.
- Never include secrets, API keys, passwords, database credentials, or copied config values in chat, commits, logs, tests, or generated docs.
- Use `config/config.example.php` as the only source for the expected config shape. That example file may be inspected and edited because it must contain placeholders only.
- If implementation work requires a setting that is missing from the example config, update `config/config.example.php` with a safe placeholder and document the required key there.
- Runtime code may load `config/config.php`, but agent work must treat that file as private and opaque.
- If debugging configuration behavior, inspect loader code and the example config only. Ask the user to verify private local values themselves when needed.
- Environment names are `dev` for development and `prod` for production. Do not invent additional environment names without updating the project guidance.
- Keep the real config file and all environment-specific files out of git. If a change adds a local-only, generated, secret-bearing, or environment-specific file, update `.gitignore` in the same change.

## Initial Config Shape

The initial config template includes:

- Environment name and debug flags.
- MySQL connection settings.
- Google Gemini API settings.
- OpenAI API settings.
- S3 connection and publishing settings.
- Game asset paths for graphics, animations, and sounds.

The S3 config shape currently includes:

- `s3_endpoint`
- `s3_object_baseurl`
- `s3_bucket`
- `s3_region`
- `s3_key`
- `s3_secret`

## Product Direction

- Nightlatch House will become a point-and-click puzzle adventure.
- The current development focus is the admin room creator and its debug-play tooling, not the production player-facing game client.
- The admin tool should allow CRUD operations for rooms and the data needed to assemble them into playable maps.
- Rooms are nodes in a house graph. Doors or other exits connect one room node to another room node.
- A generated map may differ for each play-through, but once a play session starts, that session's map must remain stable across multiple visits or browser sessions.
- The eventual game flow should create a player session, generate or assign a random room map from admin-created room data, persist that map for the session, and let the player continue playing against the same map.

## Identity and Authentication

- Admin accounts are stored in MySQL and authenticated by the PHP admin application.
- The admin interface should support adding and removing admin users without exposing password hashes or credentials.
- Use `scripts/create-admin.php` to bootstrap an admin account from the command line.
- Do not add player accounts to the admin authentication schema.
- If player accounts are needed, the intended direction is Firebase Authentication unless the project guidance changes.

## Room Authoring and Runtime Logic

- A room contains a background asset, canvas dimensions, and clickable rectangular regions expressed in the room canvas coordinate system.
- A region may be an interaction or a door/exit.
- Region conditions may inspect string-valued flags or collectable-item ownership, or may always pass.
- Successful region actions may show a player message, set a flag, grant an item, unlock a door, or display a graphic overlay.
- Regions may define a fallback player message when their condition does not pass.
- Door regions may point to another room node. A player may always leave through the door used to enter the room; other exits must be unlocked before use.
- Keep room rules declarative in saved room data. Shared evaluation behavior belongs in browser-side rule helpers so the editor debugger and eventual player can use the same semantics.
- The debug-play page is an authoring tool. It should fit the complete room into the available viewport and let designers inspect messages, overlays, flags, items, unlocked doors, entry-door behavior, and an event log.

## Generated Image Workflow

- Room backgrounds may be uploaded or generated with the configured Google Gemini image model.
- A region overlay may be uploaded or generated from an image-editing prompt.
- Generated region overlays use the exact selected room crop as a reference image inside a fixed 1024-by-1024 template. Validate the returned template dimensions before extracting the edited region.
- Overlay prompt instructions should ask the model to preserve the source crop's position, scale, perspective, framing, style, and template alignment while changing only the requested content.
- Generated backgrounds request Gemini's 1K output tier.
- Store generated backgrounds and generated overlays as progressive JPEG files at quality 80 with a maximum width of 1024 pixels, preserving aspect ratio.
- Generated overlays must be scaled to the selected region's pixel dimensions, subject to the 1024-pixel maximum width.
- Do not automatically convert uploaded assets to JPEG. Preserve their accepted PNG, JPG, or WebP format so uploaded overlays may retain transparency.
- PHP's GD extension is required for generated-image resizing, template composition, overlay extraction, and JPEG encoding.
- Keep generated image sizing and quality values centralized in `app/image.php` rather than duplicating magic numbers.

## Local Asset Storage

- Draft room backgrounds and overlays live under `assets/graphics/rooms`.
- The web-server user must have write access to `assets/graphics/rooms/generated` and `assets/graphics/rooms/uploads`.
- Keep generated and uploaded room files out of git while retaining the tracked `.gitkeep` files.
- Do not solve write-permission problems with world-writable permissions. Prefer an appropriate web-server group, group write access, setgid directories, and the required SELinux writable-content context where applicable.
- Treat uploaded image paths as untrusted input. Validate MIME types, constrain local path resolution to the room asset directory, and reject traversal outside it.

## Room Content Lifecycle

- During admin editing, room files and draft assets may be stored locally on the server.
- A finished room should be published to S3 before it is considered available outside local development.
- S3 is expected to contain both development and production published room assets/configurations.
- Room publishing status should be treated as data, likely stored in the database.
- Use these initial room statuses:
  - `development`: local server only; editable draft state.
  - `staging`: published to S3, available for development testing, and inserted into the dev database.
  - `production`: published to S3 and available to real players by being inserted into the production database.

## Database Updates

- When code changes require database changes, add a plain `.sql` migration/update file to the database updates folder rather than applying undocumented schema edits.
- Migration files should be small, explicit, and ordered so a human can review and apply them.
- Include only the SQL needed for the feature or fix. Avoid mixing unrelated schema or data changes.
- The database updates folder must not be web-accessible. Add or maintain an `.htaccess` rule that prevents direct access to that folder before placing SQL files there.
- Do not put credentials, API keys, production data dumps, or environment-specific values in SQL migration files.

## Verification

- Never include `config/config.php` in broad lint, search, or test commands.
- Lint changed PHP files directly, or enumerate PHP files while explicitly excluding `config/config.php`.
- Run the relevant focused tests after changes:
  - `php tests/gemini-request.test.php`
  - `php tests/image.test.php`
  - `php tests/overlay-image.test.php`
  - `node tests/room-rules.test.js`
- Run `node --check` on changed browser JavaScript files.
- Run `git diff --check` before handing off changes.
- Do not make a live Gemini generation request during routine verification because it consumes external API usage. Use the request-builder and image-processing tests unless the user explicitly asks for a live generation test.
