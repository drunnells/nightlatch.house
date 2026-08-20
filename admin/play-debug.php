<?php
require dirname(__DIR__) . '/app/bootstrap.php';
nightlatch_require_admin();

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$room = null;
$rooms = array();
$objects = array();
$error = '';
try {
    $stmt = nightlatch_db()->prepare('SELECT * FROM rooms WHERE id = ?');
    $stmt->execute(array($id));
    $row = $stmt->fetch();
    if (!$row) throw new RuntimeException('Save the room before opening the debugger.');
    $room = nightlatch_room_payload($row);
    $roomRows = nightlatch_db()->query('SELECT * FROM rooms ORDER BY title')->fetchAll();
    foreach ($roomRows as $roomRow) {
        $rooms[] = nightlatch_room_payload($roomRow);
    }
    $objectRows = nightlatch_db()->query('SELECT * FROM objects ORDER BY title')->fetchAll();
    foreach ($objectRows as $objectRow) {
        $objects[] = nightlatch_object_payload($objectRow);
    }
} catch (Throwable $exception) { $error = $exception->getMessage(); }

$pageTitle = 'Debug play · Nightlatch Room Forge';
require __DIR__ . '/_header.php';
?>
<?php if (!$room): ?>
<section class="page-wrap"><div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h2>Room unavailable</h2><p><?php echo nightlatch_h($error); ?></p><a class="btn-forge" href="index.php">Back to rooms</a></div></section>
<?php else: ?>
<div class="debug-shell" id="debug-player">
    <section class="debug-game">
        <div class="debug-topbar"><div><a id="debug-editor-link" href="room-edit.php?id=<?php echo (int) $room['id']; ?>"><i class="fa-solid fa-chevron-left"></i> Editor</a><span class="debug-badge"><i class="fa-solid fa-bug"></i> DEBUG PLAY</span></div><div><strong id="debug-room-title"><?php echo nightlatch_h($room['title']); ?></strong><code id="debug-room-slug"><?php echo nightlatch_h($room['slug']); ?></code></div><div class="debug-actions"><button id="back-room" class="btn-ghost" hidden><i class="fa-solid fa-arrow-left"></i> <span id="back-room-label">Back</span></button><button id="toggle-inventory" class="btn-ghost" aria-expanded="false"><i class="fa-solid fa-suitcase"></i> Inventory <span id="inventory-count">0</span></button><button id="reset-session" class="btn-ghost"><i class="fa-solid fa-rotate-left"></i> Reset state</button></div></div>
        <div class="play-stage">
            <div class="play-canvas" tabindex="-1" style="aspect-ratio:<?php echo (int) $room['data']['canvas']['width']; ?>/<?php echo (int) $room['data']['canvas']['height']; ?>">
                <img id="room-image" src="<?php echo nightlatch_h($room['backgroundAsset']); ?>" alt="<?php echo nightlatch_h($room['title']); ?>">
                <div id="overlay-layer"></div>
                <svg id="play-regions" viewBox="0 0 <?php echo (int) $room['data']['canvas']['width']; ?> <?php echo (int) $room['data']['canvas']['height']; ?>" preserveAspectRatio="none"></svg>
                <div class="player-message" id="player-message"></div>
                <div class="object-modal" id="object-modal" hidden role="dialog" aria-modal="true" aria-labelledby="object-modal-title">
                    <div class="object-modal-backdrop" data-close-object></div>
                    <section class="object-modal-card">
                        <header class="object-modal-header"><div><span class="eyebrow">Examining</span><h2 id="object-modal-title">Object</h2></div><button id="close-object" class="object-close" aria-label="Close object and return to room"><i class="fa-solid fa-xmark"></i><span>Close</span></button></header>
                        <div class="object-modal-body" id="object-modal-body">
                            <div class="object-play-canvas" id="object-play-canvas">
                                <img id="object-image" alt="">
                                <div id="object-overlay-layer"></div>
                                <svg id="object-play-regions" preserveAspectRatio="none" aria-label="Object interaction regions"></svg>
                                <div class="player-message" id="object-player-message"></div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
            <aside class="inventory-panel" id="inventory-panel" aria-hidden="true">
                <div class="inventory-heading"><div><span class="eyebrow">Carried objects</span><h2>Inventory</h2></div><button id="close-inventory" class="icon-button" aria-label="Close inventory"><i class="fa-solid fa-xmark"></i></button></div>
                <div id="inventory-objects"></div>
            </aside>
        </div>
        <div class="debug-logbar"><span><i class="fa-solid fa-terminal"></i> Event log</span><div id="event-log"><em>Session started. Click a highlighted region.</em></div></div>
    </section>
    <aside class="debug-console">
        <div class="console-heading"><div class="eyebrow">Runtime inspector</div><h2>Session state</h2><p>Edit values here to exercise both sides of a puzzle rule.</p></div>
        <label for="entry-region">Entered through</label><select id="entry-region"><option value="">No entry door (start room)</option></select>
        <div class="console-section"><div class="console-section-heading"><h3>Flags</h3><button class="icon-button gold" data-add-state="flags"><i class="fa-solid fa-plus"></i></button></div><div id="flags-state"></div></div>
        <div class="console-section"><div class="console-section-heading"><h3>Items</h3><button class="icon-button gold" data-add-state="items"><i class="fa-solid fa-plus"></i></button></div><p class="console-help">A portable object appears in inventory when its inventory key exists here.</p><div id="items-state"></div></div>
        <div class="console-section"><div class="console-section-heading"><h3>Unlocked doors</h3></div><div id="doors-state" class="token-list"></div></div>
        <div class="console-section legend"><h3>Region overlay</h3><p><span class="legend-swatch interaction"></span> Interaction</p><p><span class="legend-swatch door"></span> Door / exit</p><label class="check-row"><input type="checkbox" id="show-regions" checked><span>Show hit regions</span></label></div>
    </aside>
</div>
<script>window.NL_DEBUG_ROOM = <?php echo json_encode($room, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_DEBUG_ROOMS = <?php echo json_encode($rooms, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_DEBUG_OBJECTS = <?php echo json_encode($objects, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;</script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/room-rules.js')); ?>"></script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/play-debug.js')); ?>"></script>
<?php endif; ?>
<?php require __DIR__ . '/_footer.php'; ?>
