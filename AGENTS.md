# Nightlatch House Agent Instructions

Nightlatch House is a PHP 7.x project for a point-and-click puzzle adventure inspired by classic room-based puzzle games. The project includes both an admin authoring/debugging interface and the player web client. The game is primarily HTML, CSS, and JavaScript, with graphics, animations, and sounds.

## Project Conventions

- Keep PHP compatible with PHP 7.x.
- Prefer simple, explicit PHP arrays for shared configuration structures.
- Keep browser-facing gameplay code in HTML, CSS, and JavaScript unless the project establishes a different structure later.
- Use Bootstrap, jQuery, and Font Awesome for the primary admin UI unless the project establishes a different admin stack later.
- Treat player and admin debug-play behavior as two presentations of the same game rules. Every gameplay feature or behavior change must be implemented and verified in both interfaces where applicable; authoring controls and runtime inspection may remain admin-only.
- Keep shared content loading in `app/play-catalog.php` and shared rule semantics in `assets/js/room-rules.js`. Do not create player-only or debugger-only condition, result, topology, object, inventory, automatic-behavior, description, overlay, or audio semantics.
- Keep the public player catalog projection in `nightlatch_public_play_catalog()` aligned with every runtime feature. Send only fields the player needs; never expose designer notes, generation prompts, overlay libraries, original upload metadata, or map-editor layout data to the public client.
- Searchable custom-picker selections and options must expose their complete label and secondary detail in a native hover tooltip when the visible text may be truncated.
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
- `s3_acl`

## Product Direction

- Nightlatch House will become a point-and-click puzzle adventure.
- The root `index.php` is the player web client shown when a visitor opens the domain. It opens on the outside-house entry screen; entering starts at the entry room of the one cluster marked as the starting cluster or resumes an existing anonymous browser run. Exiting the game must confirm, clear the complete run, stop playback, leave fullscreen, and return to that entry screen.
- The player client must remain polished and playable on mobile and desktop. Use the bottom-right narration tray for both transient rule messages and explicit room/object descriptions: transient text dismisses automatically, while Describe text remains until toggled closed or superseded by gameplay text without moving focus or shifting the viewport. Preserve the complete content image in the available viewport, center Describe along the artwork's top edge, and keep fullscreen at the top-left.
- Fullscreen is a display mode, not a reduced-control mode. Sound, description, inventory, menu, travel, object-close, and fullscreen-exit controls must remain available where applicable on desktop and mobile, including mobile landscape play.
- Present the player object viewer as one visual surface. Keep its authored inner canvas as the invisible interaction coordinate system, scale that canvas to the available viewer space, use lightweight overlays for the title and global controls, and place the close control directly on the object artwork.
- Player interaction regions are intentionally undiscoverable. They must remain visually transparent with no cursor, hover, focus, active-state, or native-tooltip reveal while retaining keyboard and touch activation; use accessible labels for assistive technology only.
- Use focused drawers or dialogs for player descriptions, inventory, objects, and game controls.
- Anonymous player progress currently persists in browser local storage, including current location, arrival context, flags, inventory, overlays, descriptions, unlocked doors, navigation history, and Gateway assignments. A future server-backed run may replace this without changing authored gameplay semantics.
- The admin tool should allow CRUD operations for rooms, inspectable objects, inventory metadata, and the data needed to assemble rooms into playable maps.
- Rooms are grouped into clusters. Connections inside a cluster are authored statically through the top-level Map editor.
- Every cluster has one entry room and a Gateway return behavior: either a persistent behind-you control or a selected Door / exit region in the entry room.
- Each cluster may select one saved sound-library asset as looping ambient audio and stores its playback volume from 0 to 100.
- A Gateway room owns a finite set of Gateway exit regions, an eligible pool of destination clusters, and a destination count. On first entry during a play-through, distinct clusters are randomly paired with shuffled Gateway exits and that assignment remains stable for the run.
- Static connections stay inside a cluster. Cross-cluster travel uses Gateway assignments to enter the selected cluster's entry room.
- A future server-backed player run should use an opaque browser/server token for anonymous play. Signed-in runs should attach to the player's Firebase identity without making assignments global to every run owned by that player.

## Narrative Planning Source

- The current Obsidian Narrative Canvas project is `/Users/drunnells/Documents/Obsidian/NH - Master Story Map-2026-08-22 201543/NH - Master Story Map-2026-08-22 201543.ncanvas`.
- Read the saved `.ncanvas` file directly when current story-map context is needed; an additional JSON export is unnecessary. Its serialized canvas data is nested under `project`, including `project.nodes` and `project.nodeTypes`.
- Treat Narrative Canvas as planning input only. There is no automatic synchronization into the game, so transferring approved story, room, object, puzzle, or topology information remains a deliberate manual implementation step.
- Read-only inspection is safe while Obsidian is open. Do not edit the `.ncanvas` file behind Obsidian because its autosave and external-change protection may create conflicts; make narrative changes through Narrative Canvas unless the user explicitly coordinates an offline file repair.
- Narrative Canvas display labels and serialized identifiers differ for custom types. Use exact internal type IDs and `customFields` keys from `project.nodeTypes`; do not infer storage keys from author-facing labels.

## Identity and Authentication

- Admin accounts are stored in MySQL and authenticated by the PHP admin application.
- The admin interface should support adding and removing admin users without exposing password hashes or credentials.
- Use `scripts/create-admin.php` to bootstrap an admin account from the command line.
- Do not add player accounts to the admin authentication schema.
- If player accounts are needed, the intended direction is Firebase Authentication unless the project guidance changes.
- Persist procedural topology against a saved game run rather than directly against a player identity so one account may own multiple games with different Gateway assignments.

## Interactive Content Authoring and Runtime Logic

- A room contains a background asset, canvas dimensions, and clickable rectangular regions expressed in the room canvas coordinate system.
- An object is first-class interactive content with close-up artwork, canvas dimensions, and clickable regions using the same declarative rule semantics as rooms.
- Rooms and objects store a player-facing description separately from designer notes. Debug play hides that description behind an eye control, and session results may replace a selected room or object's description by stable slug.
- Objects may be room-bound or portable. Portable objects use a stable inventory key, appear in the debug inventory while owned, and can be examined from there.
- A successful room result may open an object viewer. In debug play, the viewer is a closable modal nested over the room canvas and sized to 80% of the displayed room image's width and height.
- A region may be an interaction or a door/exit.
- Version 2 region data stores a `logic` object containing ordered `IF` / `ELSE IF` branches and final `ELSE` results. The first matching branch runs.
- `logic` remains the region's player-click behavior. A region may also store up to 25 independent `automaticBehaviors`, each with its own name, trigger, and the same ordered branch logic.
- Automatic behaviors may watch an actual change to one flag or inventory item. Room regions may also run when their room is entered, and object regions may run when their object viewer opens.
- State-change results are coalesced per action list, unchanged values emit no event, and chained automatic behaviors run through a guarded deterministic queue. A remote behavior applies overlays and door state to its owning room/object-qualified region key.
- Persistent automatic results may run for inactive content, but messages, sounds, and object viewers are presented only when the behavior's owning room or object is active.
- Conditions are recursive groups that match `all` (AND) or `any` (OR) child conditions. They may inspect string-valued flags or inventory ownership and may be nested at most three group levels deep.
- An empty condition group is an unconditional match. Blank condition keys must not pass at runtime.
- Branch results are ordered actions. Supported actions show player messages, show/replace or clear the region overlay, set or clear flags, grant or remove items, unlock a door, open an object viewer, replace a selected room/object player description, or play a selected saved sound.
- Overlay removal is explicit: `clear_overlay` deletes the current region-scoped overlay. A new overlay replaces the previous overlay for that region.
- Each `set_overlay` result owns its asset and optional generation prompt so overlays may be uploaded or generated independently in IF, ELSE IF, or ELSE branches.
- Each region keeps an `overlayLibrary` of up to 100 previously captured, linked, uploaded, generated, or Gemini-edited overlays so authors can visually reuse the same artwork across branches without duplicating files.
- Authors may capture a selected region's current pixels into its `overlayLibrary` before editing the background. Captures are stored as PNG files with transparency preserved and remain reusable after the source image changes.
- Inventory conditions and grant/remove results store stable inventory keys, but the editor authors them through a searchable picker of saved portable objects rather than free-text keys.
- Flag keys and object-examination targets use the same searchable picker pattern. New flag keys may be created from the flag picker; saved flag names and their room/object region associations are derived from content JSON in `app/content-variables.php` and shown in the top-level Flags catalog.
- Legacy `condition` / `success` / `failure` regions must be normalized into the branch format when loaded and written as version 2 data on the next save.
- Shared evaluation behavior belongs in `assets/js/room-rules.js`; shared admin rule-builder behavior belongs in `assets/js/logic-editor.js`; server-side shape and limit validation belongs in `app/interactive-logic.php`.
- Shared region movement and resize constraints belong in `assets/js/region-bounds.js`; room and object editors must keep edited bounds inside the content canvas.
- Click and automatic behaviors reuse the evaluator in `assets/js/room-rules.js`; do not create separate condition or result semantics for new trigger types.
- Canonical room topology is stored separately from room interaction JSON. Legacy `door.targetRoom` values may be imported, and canonical topology is mirrored back into door metadata for compatibility.
- Static door connections identify a source room/region, destination room, and return behavior. Returns may use a paired destination door, a contextual behind-you control, or an explicit one-way connection.
- Gateway exits have no static target. They resolve through the current run's saved Gateway assignment and enter the destination cluster's configured entry room.
- A player may always use the paired door or behind-you path through which they arrived unless the connection is one-way; other exits must be unlocked before use.
- Keep room and object rules declarative in saved content data so the editor debugger and eventual player can use the same semantics.
- The debug-play page is an authoring tool. It should fit the complete room into the available viewport, keep transient player messages in the desktop runtime inspector instead of over interaction canvases, traverse canonical static connections, present named behind-you and Gateway return controls, keep randomized Gateway assignments stable until reset, and let designers inspect matched branches, condition traces, executed results, messages, overlays, flags, items, inventory objects, unlocked doors, arrival behavior, Gateway assignments, and the event log.
- Debug-play ambience uses a dedicated looping audio player so interaction sound effects do not interrupt it. It continues between rooms in the same cluster and changes or stops when the active cluster changes.
- The player client and debug-play page must load the same authored catalog through `app/play-catalog.php`. The player uses `assets/js/play-player.js` for presentation and anonymous-run persistence while reusing `assets/js/room-rules.js` for evaluation; the debugger keeps its author-only state controls and event trace.

## Generated Image Workflow

- Room backgrounds and object close-up images may be uploaded or generated with the configured Google Gemini image model.
- Object artwork may be cropped with a rectangle or point-by-point lasso. Lasso output is a transparent PNG outside the selected polygon, and existing object region bounds must be remapped or removed when they fall outside the crop.
- Object generation may use a rectangular reference crop selected from a searchable thumbnail library of saved raster room and object images. Validate and extract the selected reference area on the server before sending it to Gemini.
- A branch-specific region overlay may be uploaded or generated from an image-editing prompt.
- A saved region overlay may be selected as Gemini's exact reference for another edit. Preserve the original library entry, assign the new result to the active overlay action, and add that result to the same region library for reuse or further editing.
- Authors may select a rectangular area of a room or object background, describe a precision edit, and review a full-image candidate. Cancel must leave the draft unchanged; Apply changes only the draft background reference, and the normal content Save persists it.
- Generated region overlays use either the exact selected room/object crop or the entire chosen saved overlay as a reference image inside a fixed 1024-by-1024 template. Validate the returned template dimensions before extracting the edited region.
- Overlay prompt instructions should ask the model to preserve the source crop's position, scale, perspective, framing, style, and template alignment while changing only the requested content.
- Generated backgrounds request Gemini's 1K output tier.
- Store generated backgrounds and generated overlays as progressive JPEG files at quality 80 with a maximum width of 1024 pixels, preserving aspect ratio.
- Generated overlays must be scaled to the selected region's pixel dimensions, subject to the 1024-pixel maximum width.
- Precision background edits composite the generated region back into the source and store a new progressive JPEG using the same generated-image width and quality limits. Do not overwrite the prior source file in place.
- Do not automatically convert uploaded assets to JPEG. Preserve their accepted PNG, JPG, or WebP format so uploaded overlays may retain transparency.
- PHP's GD extension is required for generated-image resizing, template composition, overlay extraction, and JPEG encoding.
- Keep generated image sizing and quality values centralized in `app/image.php` rather than duplicating magic numbers.

## Asset Storage

- Local room/object uploads and generated graphics are temporary editor files under `assets/graphics/rooms` and `assets/graphics/objects` until their owning content is saved.
- Saving a room or object uploads its background and every referenced overlay to the configured DigitalOcean Spaces bucket, stores canonical object keys in MySQL/content JSON, and removes promoted temporary files after the database commit succeeds.
- Sound-library uploads go directly to Spaces. Their names, stable slugs, MIME types, object keys, and original metadata are stored in MySQL.
- Browser payloads resolve stored object keys through `s3_object_baseurl`. Server-side GD/Gemini operations download saved images into request-scoped temporary files and remove them after the request.
- Use `php scripts/test-spaces.php` for a non-mutating signed-access diagnostic; add `--write` to test a disposable upload, download, and deletion without touching the database.
- Editor sessions track newly created local graphics and remove discarded candidates on cancel, save, or page exit. Use `php scripts/cleanup-local-assets.php` for a database-aware dry run of crash leftovers older than 24 hours, then add `--delete` to remove only the reported unreferenced files.
- The web-server user must have write access to the `generated` and `uploads` directories under both image asset roots and to the PHP temporary directory.
- Keep generated and uploaded room/object temporary files and legacy uploaded sounds out of git while retaining the tracked `.gitkeep` files.
- Do not solve write-permission problems with world-writable permissions. Prefer an appropriate web-server group, group write access, setgid directories, and the required SELinux writable-content context where applicable.
- Treat uploaded files, object keys, and selected image paths as untrusted input. Validate MIME types, constrain local paths and storage prefixes to the applicable content type, and reject traversal or arbitrary remote URLs.

## Interactive Content Lifecycle

- Room and object records do not carry development/staging/production lifecycle states. `dev` and `prod` describe application environments rather than individual content records.
- The shared dev admin and database are the active authoring environment. A future production authoring or dev-to-prod synchronization workflow should be designed only when the production client requires it.

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
  - `php tests/player-client-render.test.php`
  - `php tests/interactive-logic.test.php`
  - `php tests/content-variables.test.php`
  - `php tests/map-topology.test.php`
  - `php tests/map-editor-render.test.php`
  - `php tests/local-asset-cleanup.test.php`
  - `php tests/sound-library.test.php`
  - `php tests/storage.test.php`
  - `php tests/sounds-editor-render.test.php`
  - `node tests/room-rules.test.js`
  - `node tests/region-bounds.test.js`
- Run `node --check` on changed browser JavaScript files.
- Run `git diff --check` before handing off changes.
- Do not make a live Gemini generation request during routine verification because it consumes external API usage. Use the request-builder and image-processing tests unless the user explicitly asks for a live generation test.
