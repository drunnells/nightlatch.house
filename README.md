# Nightlatch House

Nightlatch House is a PHP 7.x point-and-click puzzle project. The current first pass is the **Room Forge**, a dark admin interface for authoring rooms, drawing click regions, defining flag/item rules, and testing those rules in a debug player.

## Local setup

1. Copy `config/config.example.php` to the private `config/config.php` and fill in local MySQL and Gemini values.
2. Apply `database/updates/001_admin_room_creator.sql`, `database/updates/002_interactive_objects.sql`, `database/updates/003_room_clusters_and_gateways.sql`, and `database/updates/004_player_descriptions_and_sounds.sql` in order to the configured database.
3. Create the first admin account:

   ```bash
   php scripts/create-admin.php admin@example.com "Display Name" "a-long-temporary-password"
   ```

4. Serve this directory through PHP/Apache and open `/admin/login.php`.

The real `config/config.php` must remain private and untracked. Room uploads and Gemini-generated drafts are also ignored by git; the checked-in demo SVG is only an editor placeholder.

Region overlay generation requires PHP's GD extension. The web-server user must be able to write the `generated` and `uploads` directories under both `assets/graphics/rooms` and `assets/graphics/objects`, plus `assets/sounds/uploads`.

Gemini-generated backgrounds and overlays are stored as progressive JPEGs at quality 80 with a maximum width of 1024 pixels. Uploaded assets retain their original format so transparent PNG overlays remain supported.

## First-pass room format

Each room is stored as a graph node with a lifecycle status (`development`, `staging`, or `production`), a background asset, its optional Gemini prompt, and versioned JSON room data. Click regions contain normalized image coordinates and declarative behavior:

- ordered `IF` / `ELSE IF` branches, with a final `ELSE` branch;
- nested condition groups that match `ALL` (AND) or `ANY` (OR) flag and inventory checks;
- ordered results for messages, overlays, flags, inventory, door unlocking, object examination, player-description changes, and sound playback;
- compatibility door metadata mirrored from the canonical cluster map.

The first matching branch runs. An empty condition group is an unconditional branch. Overlay results may show or replace an overlay, upload or generate branch-specific artwork, reuse a visual from that region's overlay library, or explicitly remove the region's existing overlay. Inventory checks, flag keys, and object-examination targets use searchable pickers while continuing to save stable keys/slugs. New flag names can be created from the picker, and the top-level **Flags** catalog shows every saved room/object region that reads, sets, or clears each flag. Legacy single-condition `condition` / `success` / `failure` data is normalized into the branch format when opened and is written as version 2 room or object data on the next save.

## Clusters, connections, and Gateways

The top-level **Map** tab is the source of truth for authored room topology. Rooms are arranged into clusters and connected by dragging saved Door / exit regions onto destination room nodes. Static connections remain inside one cluster and specify one of three return behaviors: a paired destination door, a contextual behind-you control, or an explicit one-way passage. Every cluster identifies an entry room and the return behavior used when a Gateway enters that cluster.

A room may be marked as a **Gateway room**. Its selected Gateway exit regions do not have static room targets. Instead, the author chooses an eligible pool of destination clusters and the number of distinct destinations to select. The runtime shuffles both the chosen clusters and available exits on first entry to the Gateway room, then keeps those assignments stable for that play session. The editor refuses to save a Gateway with fewer eligible clusters or Gateway Door / exit regions than its configured destination count.

The Room editor uses the same topology through a searchable target picker labeled by room and cluster. Direct room targets remain available for static exits in the same cluster; cross-cluster exits must be configured as Gateways.

The debug player lets a designer change flags and items, choose the room's arrival door, traverse canonical connections, use named behind-you and Gateway returns, and inspect the event log. It displays randomized Gateway assignments in the runtime inspector and preserves them until **Reset state**, which starts a fresh debug session and rerolls the assignments.

Rooms and objects keep player-facing descriptions separate from private designer notes. In debug play, an eye control reveals the current description. Interaction results may replace a selected room or object's description for the current session, allowing state changes such as lighting a fireplace to change what the player reads.

The top-level **Sounds** tab stores reusable MP3, WAV, OGG, M4A, and WebM audio. Authors may upload up to 50 files at once, rename and preview them, then select their stable slugs from a **Play sound** result in either room or object logic. Uploaded audio lives under `assets/sounds/uploads` and is ignored by git apart from its tracked `.gitkeep`.

## Interactive objects and inventory

Objects are first-class interactive content records with their own close-up artwork, canvas dimensions, and declarative regions. They use the same condition, message, flag, item-grant, and graphic-overlay semantics as room interactions. Room regions may select an object to examine when their rule passes; the debug player opens that object in an 80%-of-room-image viewer, and closing it returns to the room.

An object may be room-bound or portable. Portable objects have a unique inventory key. When that key exists in the session's item state—whether entered in the debugger or granted by a successful region—the object appears in the debug inventory and can be opened from there. Object overlays, flags, granted items, and inventory persist for the life of the debug session and reset with the existing reset control.

The object authoring flow is available from **Objects** in the admin navigation. Create and save objects before selecting them from a room region. As with rooms, this first pass supports the `development` lifecycle while S3 publication remains future work.

Both room and object **Assets** panels can make a precision edit to a selected rectangular area of the current raster image. Gemini edits the selected crop, the server composites it into a new full-image candidate, and the modal lets the author compare the candidate with the original. Cancel leaves the draft unchanged. **Apply to draft** selects the candidate, and the editor's normal Save control persists the new background reference without overwriting the previous file.

### Object image authoring

The object editor's **Assets** panel provides two additional workflows:

- **Crop or lasso object** opens the current object image in a selection workspace. Rectangle selections make a conventional crop. Lasso selections are built point by point and produce a PNG with transparency outside the closed polygon. Existing interaction regions inside the crop are transformed to the new canvas; regions entirely outside it are removed.
- **Choose reference** opens a searchable thumbnail library of saved raster room and object backgrounds. After choosing an image, drag a rectangle around the exact detail to use. The server securely extracts that crop and sends it to Gemini with the next object-generation prompt as an inline visual reference. The reference remains selected for additional variants until it is cleared or the editor page is reloaded.

The debug object viewer is nested inside the rendered room canvas. Its backdrop covers the room, and its modal occupies 80% of the room image's displayed width and height rather than 80% of the browser window.

The first pass intentionally saves rooms only in `development`. Staging and production controls remain visible but disabled until S3 publication and environment-specific database insertion are implemented, preventing a local-only draft from being mislabeled as published.

Player accounts are intentionally outside the admin schema so a future Firebase Auth integration can be introduced independently.
