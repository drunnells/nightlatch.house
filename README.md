# Nightlatch House

Nightlatch House is a PHP 7.x point-and-click puzzle project. The current first pass is the **Room Forge**, a dark admin interface for authoring rooms, drawing click regions, defining flag/item rules, and testing those rules in a debug player.

## Local setup

1. Copy `config/config.example.php` to the private `config/config.php` and fill in local MySQL and Gemini values.
2. Apply `database/updates/001_admin_room_creator.sql` to the configured database.
3. Create the first admin account:

   ```bash
   php scripts/create-admin.php admin@example.com "Display Name" "a-long-temporary-password"
   ```

4. Serve this directory through PHP/Apache and open `/admin/login.php`.

The real `config/config.php` must remain private and untracked. Room uploads and Gemini-generated drafts are also ignored by git; the checked-in demo SVG is only an editor placeholder.

Region overlay generation requires PHP's GD extension. The web-server user must be able to write both `assets/graphics/rooms/generated` and `assets/graphics/rooms/uploads`.

Gemini-generated backgrounds and overlays are stored as progressive JPEGs at quality 80 with a maximum width of 1024 pixels. Uploaded assets retain their original format so transparent PNG overlays remain supported.

## First-pass room format

Each room is stored as a graph node with a lifecycle status (`development`, `staging`, or `production`), a background asset, its optional Gemini prompt, and versioned JSON room data. Click regions contain normalized image coordinates and declarative behavior:

- a condition against a string-valued flag, a collectable item, or an unconditional rule;
- success actions for a player message, overlay image, flag mutation, item grant, and door unlock;
- a fallback message when the condition fails;
- optional door metadata pointing at a target room node.

The debug player lets a designer change flags and items, choose the room's entry door, click hit regions, and inspect the event log. It enforces the initial navigation rule: the entry door is always a valid way back, while other doors must be unlocked before traversal.

The first pass intentionally saves rooms only in `development`. Staging and production controls remain visible but disabled until S3 publication and environment-specific database insertion are implemented, preventing a local-only draft from being mislabeled as published.

Player accounts are intentionally outside the admin schema so a future Firebase Auth integration can be introduced independently.
