# Nightlatch House Agent Instructions

Nightlatch House is a PHP 7.x project for a point-and-click puzzle adventure inspired by classic room-based puzzle games. The current phase focuses on authoring rooms, inspectable objects, inventory content, and their debug-play behavior. The game will be primarily HTML, CSS, and JavaScript, with graphics, animations, and sounds.

## Project Conventions

- Keep PHP compatible with PHP 7.x.
- Prefer simple, explicit PHP arrays for shared configuration structures.
- Keep browser-facing gameplay code in HTML, CSS, and JavaScript unless the project establishes a different structure later.
- Use Bootstrap, jQuery, and Font Awesome for the primary admin UI unless the project establishes a different admin stack later.
- Treat generated graphics, animation assets, and sound assets as first-class game content. Do not rename or reorganize them casually.
- Game design tooling may use generative AI providers, including Google Gemini and OpenAI.

## Communication and Guidance Maintenance

- After making project changes, post a quick user-facing update that summarizes what changed and what verification ran.
- Keep `AGENTS.md` current when product architecture, saved-data formats, workflows, or project conventions materially change.
- Keep this file concise and useful as present-tense guidance. Merge or remove stale and duplicate instructions instead of turning it into a change log.

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
- The current development focus is the admin room/object creator and its debug-play tooling, not the production player-facing game client.
- The admin tool should allow CRUD operations for rooms, inspectable objects, inventory metadata, and the data needed to assemble rooms into playable maps.
- Rooms are nodes in a house graph. Doors or other exits connect one room node to another room node.
- A generated map may differ for each play-through, but once a play session starts, that session's map must remain stable across multiple visits or browser sessions.
- The eventual game flow should create a player session, generate or assign a random room map from admin-created room data, persist that map for the session, and let the player continue playing against the same map.

## Identity and Authentication

- Admin accounts are stored in MySQL and authenticated by the PHP admin application.
- The admin interface should support adding and removing admin users without exposing password hashes or credentials.
- Use `scripts/create-admin.php` to bootstrap an admin account from the command line.
- Do not add player accounts to the admin authentication schema.
- If player accounts are needed, the intended direction is Firebase Authentication unless the project guidance changes.

## Interactive Content Authoring and Runtime Logic

- A room contains a background asset, canvas dimensions, and clickable rectangular regions expressed in the room canvas coordinate system.
- An object is first-class interactive content with close-up artwork, canvas dimensions, and clickable regions using the same declarative rule semantics as rooms.
- Objects may be room-bound or portable. Portable objects use a stable inventory key, appear in the debug inventory while owned, and can be examined from there.
- A successful room result may open an object viewer. In debug play, the viewer is a closable modal nested over the room canvas and sized to 80% of the displayed room image's width and height.
- A region may be an interaction or a door/exit.
- Version 2 region data stores a `logic` object containing ordered `IF` / `ELSE IF` branches and final `ELSE` results. The first matching branch runs.
- Conditions are recursive groups that match `all` (AND) or `any` (OR) child conditions. They may inspect string-valued flags or inventory ownership and may be nested at most three group levels deep.
- An empty condition group is an unconditional match. Blank condition keys must not pass at runtime.
- Branch results are ordered actions. Supported actions show player messages, show/replace or clear the region overlay, set or clear flags, grant or remove items, unlock a door, or open an object viewer.
- Overlay removal is explicit: `clear_overlay` deletes the current region-scoped overlay. A new overlay replaces the previous overlay for that region.
- Each `set_overlay` result owns its asset and optional generation prompt so overlays may be uploaded or generated independently in IF, ELSE IF, or ELSE branches.
- Each region keeps an `overlayLibrary` of up to 100 previously linked, uploaded, or generated overlays so authors can visually reuse the same artwork across branches without duplicating files.
- Inventory conditions and grant/remove results store stable inventory keys, but the editor authors them through a searchable picker of saved portable objects rather than free-text keys.
- Legacy `condition` / `success` / `failure` regions must be normalized into the branch format when loaded and written as version 2 data on the next save.
- Shared evaluation behavior belongs in `assets/js/room-rules.js`; shared admin rule-builder behavior belongs in `assets/js/logic-editor.js`; server-side shape and limit validation belongs in `app/interactive-logic.php`.
- Current region rules run when the player clicks a region. Future room-entry or state-change triggers should reuse the same evaluator instead of creating separate condition semantics.
- Door regions may point to another room node. A player may always leave through the door used to enter the room; other exits must be unlocked before use.
- Keep room and object rules declarative in saved content data so the editor debugger and eventual player can use the same semantics.
- The debug-play page is an authoring tool. It should fit the complete room into the available viewport, traverse configured room exits, provide a named return-to-previous-room control, and let designers inspect matched branches, condition traces, executed results, messages, overlays, flags, items, inventory objects, unlocked doors, entry-door behavior, and the event log.

## Generated Image Workflow

- Room backgrounds and object close-up images may be uploaded or generated with the configured Google Gemini image model.
- Object artwork may be cropped with a rectangle or point-by-point lasso. Lasso output is a transparent PNG outside the selected polygon, and existing object region bounds must be remapped or removed when they fall outside the crop.
- Object generation may use a rectangular reference crop selected from a searchable thumbnail library of saved local raster room and object images. Validate and extract the selected reference area on the server before sending it to Gemini.
- A branch-specific region overlay may be uploaded or generated from an image-editing prompt.
- Generated region overlays use the exact selected room or object crop as a reference image inside a fixed 1024-by-1024 template. Validate the returned template dimensions before extracting the edited region.
- Overlay prompt instructions should ask the model to preserve the source crop's position, scale, perspective, framing, style, and template alignment while changing only the requested content.
- Generated backgrounds request Gemini's 1K output tier.
- Store generated backgrounds and generated overlays as progressive JPEG files at quality 80 with a maximum width of 1024 pixels, preserving aspect ratio.
- Generated overlays must be scaled to the selected region's pixel dimensions, subject to the 1024-pixel maximum width.
- Do not automatically convert uploaded assets to JPEG. Preserve their accepted PNG, JPG, or WebP format so uploaded overlays may retain transparency.
- PHP's GD extension is required for generated-image resizing, template composition, overlay extraction, and JPEG encoding.
- Keep generated image sizing and quality values centralized in `app/image.php` rather than duplicating magic numbers.

## Local Asset Storage

- Draft room backgrounds and overlays live under `assets/graphics/rooms`; object images and overlays live under `assets/graphics/objects`.
- The web-server user must have write access to the `generated` and `uploads` directories under both asset roots.
- Keep generated and uploaded room/object files out of git while retaining the tracked `.gitkeep` files.
- Do not solve write-permission problems with world-writable permissions. Prefer an appropriate web-server group, group write access, setgid directories, and the required SELinux writable-content context where applicable.
- Treat uploaded and selected image paths as untrusted input. Validate MIME types, constrain local path resolution to the applicable room/object asset directory, and reject traversal outside it.

## Interactive Content Lifecycle

- During admin editing, room/object files and draft assets may be stored locally on the server.
- Finished interactive content should be published to S3 before it is considered available outside local development.
- S3 is expected to contain both development and production published room assets/configurations.
- Publishing status should be treated as data stored with each room or object.
- Use these initial content statuses:
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
  - `php tests/object-payload.test.php`
  - `php tests/object-editor-render.test.php`
  - `php tests/object-crop.test.php`
  - `php tests/debug-object-layout.test.php`
  - `php tests/interactive-logic.test.php`
  - `node tests/room-rules.test.js`
- Run `node --check` on changed browser JavaScript files.
- Run `git diff --check` before handing off changes.
- Do not make a live Gemini generation request during routine verification because it consumes external API usage. Use the request-builder and image-processing tests unless the user explicitly asks for a live generation test.
