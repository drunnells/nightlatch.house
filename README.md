# Nightlatch House

Nightlatch House is a PHP 7.x point-and-click puzzle project. The current first pass is the **Room Forge**, a dark admin interface for authoring rooms, drawing click regions, defining flag/item rules, and testing those rules in a debug player.

## Local setup

1. Copy `config/config.example.php` to the private `config/config.php` and fill in local MySQL and Gemini values.
2. Apply `database/updates/001_admin_room_creator.sql`, followed by `database/updates/002_interactive_objects.sql`, to the configured database.
3. Create the first admin account:

   ```bash
   php scripts/create-admin.php admin@example.com "Display Name" "a-long-temporary-password"
   ```

4. Serve this directory through PHP/Apache and open `/admin/login.php`.

The real `config/config.php` must remain private and untracked. Room uploads and Gemini-generated drafts are also ignored by git; the checked-in demo SVG is only an editor placeholder.

Region overlay generation requires PHP's GD extension. The web-server user must be able to write the `generated` and `uploads` directories under both `assets/graphics/rooms` and `assets/graphics/objects`.

Gemini-generated backgrounds and overlays are stored as progressive JPEGs at quality 80 with a maximum width of 1024 pixels. Uploaded assets retain their original format so transparent PNG overlays remain supported.

## First-pass room format

Each room is stored as a graph node with a lifecycle status (`development`, `staging`, or `production`), a background asset, its optional Gemini prompt, and versioned JSON room data. Click regions contain normalized image coordinates and declarative behavior:

- a condition against a string-valued flag, a collectable item, or an unconditional rule;
- success actions for a player message, overlay image, flag mutation, item grant, and door unlock;
- a fallback message when the condition fails;
- optional door metadata pointing at a target room node.

The debug player lets a designer change flags and items, choose the room's entry door, click hit regions, and inspect the event log. It enforces the initial navigation rule: the entry door is always a valid way back, while other doors must be unlocked before traversal.

## Interactive objects and inventory

Objects are first-class interactive content records with their own close-up artwork, canvas dimensions, and declarative regions. They use the same condition, message, flag, item-grant, and graphic-overlay semantics as room interactions. Room regions may select an object to examine when their rule passes; the debug player opens that object in an 80%-of-viewport viewer over the room, and closing it returns to the room.

An object may be room-bound or portable. Portable objects have a unique inventory key. When that key exists in the session's item state—whether entered in the debugger or granted by a successful region—the object appears in the debug inventory and can be opened from there. Object overlays, flags, granted items, and inventory persist for the life of the debug session and reset with the existing reset control.

The object authoring flow is available from **Objects** in the admin navigation. Create and save objects before selecting them from a room region. As with rooms, this first pass supports the `development` lifecycle while S3 publication remains future work.

The first pass intentionally saves rooms only in `development`. Staging and production controls remain visible but disabled until S3 publication and environment-specific database insertion are implemented, preventing a local-only draft from being mislabeled as published.

Player accounts are intentionally outside the admin schema so a future Firebase Auth integration can be introduced independently.
