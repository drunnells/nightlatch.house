<?php
require __DIR__ . '/app/bootstrap.php';
require_once __DIR__ . '/app/play-catalog.php';

$catalog = null;
$startRoom = null;
try {
    $catalog = nightlatch_public_play_catalog(nightlatch_load_play_catalog(nightlatch_db()));
    $startRoom = nightlatch_find_start_room($catalog['rooms'], $catalog['topology']['clusters']);
    if (!$startRoom) {
        throw new RuntimeException('No playable start room is configured.');
    }
} catch (Throwable $ignored) {
    http_response_code(503);
    $catalog = null;
    $startRoom = null;
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#080b0c">
    <meta name="description" content="Enter Nightlatch House, a point-and-click puzzle adventure.">
    <title>Nightlatch House</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
    <link rel="stylesheet" href="<?php echo nightlatch_h(nightlatch_asset('css/player.css', 'assets/')); ?>">
</head>
<body class="player-body">
<?php if (!$catalog || !$startRoom): ?>
<main class="player-unavailable">
    <div class="unavailable-mark" aria-hidden="true"><i class="fa-solid fa-key"></i></div>
    <p class="unavailable-kicker">Nightlatch House</p>
    <h1>The house is not ready to open.</h1>
    <p>The first room is still being prepared. Please return soon.</p>
</main>
<?php else: ?>
<div class="player-app" id="player-app">
    <header class="player-header">
        <div class="player-brand" aria-label="Nightlatch House">
            <span class="player-brand-mark" aria-hidden="true"><i class="fa-solid fa-key"></i></span>
            <span><strong>NIGHTLATCH</strong><small>HOUSE</small></span>
        </div>
        <div class="player-location" aria-live="polite">
            <span>Current room</span>
            <h1 id="player-room-title"><?php echo nightlatch_h($startRoom['title']); ?></h1>
        </div>
        <nav class="player-header-actions" aria-label="Game controls">
            <button type="button" class="player-icon-button" id="toggle-sound" aria-label="Mute sound" aria-pressed="false" title="Mute sound">
                <i class="fa-solid fa-volume-high" aria-hidden="true"></i>
            </button>
            <button type="button" class="player-icon-button" id="toggle-room-description" aria-label="Read room description" aria-expanded="false" title="Look around">
                <i class="fa-regular fa-eye" aria-hidden="true"></i>
            </button>
            <button type="button" class="player-icon-button inventory-toggle" id="toggle-inventory" aria-label="Open inventory" aria-expanded="false" title="Inventory">
                <i class="fa-solid fa-suitcase" aria-hidden="true"></i>
                <span id="inventory-count" aria-label="0 items">0</span>
            </button>
            <button type="button" class="player-icon-button" id="open-game-menu" aria-label="Open game menu" aria-expanded="false" title="Menu">
                <i class="fa-solid fa-bars" aria-hidden="true"></i>
            </button>
        </nav>
    </header>

    <button type="button" class="immersive-exit" id="exit-immersive" aria-label="Restore game controls" title="Restore game controls">
        <i class="fa-solid fa-compress" aria-hidden="true"></i>
    </button>

    <main class="player-main">
        <section class="player-stage" id="player-stage" aria-label="Current room">
            <div class="room-canvas" id="room-canvas" tabindex="-1" style="aspect-ratio:<?php echo (int) $startRoom['data']['canvas']['width']; ?>/<?php echo (int) $startRoom['data']['canvas']['height']; ?>">
                <img id="room-image" src="<?php echo nightlatch_h($startRoom['backgroundAsset']); ?>" alt="<?php echo nightlatch_h($startRoom['title']); ?>">
                <div class="content-overlay-layer" id="room-overlay-layer" aria-hidden="true"></div>
                <svg class="interaction-layer" id="room-regions" viewBox="0 0 <?php echo (int) $startRoom['data']['canvas']['width']; ?> <?php echo (int) $startRoom['data']['canvas']['height']; ?>" preserveAspectRatio="none" aria-label="Room interactions"></svg>
            </div>
            <p class="player-touch-hint" id="player-touch-hint"><i class="fa-regular fa-hand-pointer" aria-hidden="true"></i> Explore the room</p>
        </section>

        <section class="player-message-tray" id="player-message" aria-live="polite" aria-atomic="true" aria-hidden="true">
            <div class="message-glyph" aria-hidden="true"><i class="fa-solid fa-quote-left"></i></div>
            <div class="message-copy">
                <span id="player-message-context">Room</span>
                <p id="player-message-text"></p>
            </div>
        </section>
    </main>

    <footer class="player-travel-bar">
        <div class="travel-actions" id="travel-actions">
            <button type="button" class="travel-button" id="back-room" hidden>
                <i class="fa-solid fa-arrow-turn-up fa-rotate-270" aria-hidden="true"></i>
                <span><small>Return</small><strong id="back-room-label">Behind you</strong></span>
            </button>
            <div id="gateway-return-actions"></div>
        </div>
        <p class="player-hint"><span class="hint-dot"></span> Select details in the scene to investigate.</p>
        <button type="button" class="mobile-inventory-button" id="mobile-inventory" aria-label="Open inventory">
            <i class="fa-solid fa-suitcase" aria-hidden="true"></i><span>Inventory</span><b id="mobile-inventory-count">0</b>
        </button>
    </footer>

    <div class="panel-scrim" id="panel-scrim" hidden></div>

    <aside class="player-drawer inventory-drawer" id="inventory-panel" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="inventory-title">
        <header class="drawer-header">
            <div><span class="drawer-kicker">What you carry</span><h2 id="inventory-title">Inventory</h2></div>
            <button type="button" class="drawer-close" id="close-inventory" aria-label="Close inventory"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </header>
        <div class="drawer-body" id="inventory-objects"></div>
    </aside>

    <aside class="player-drawer description-drawer" id="room-description-panel" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="room-description-title">
        <header class="drawer-header">
            <div><span class="drawer-kicker">Look around</span><h2 id="room-description-title">Room</h2></div>
            <button type="button" class="drawer-close" id="close-room-description" aria-label="Close room description"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </header>
        <div class="drawer-body description-copy"><p id="room-player-description"></p></div>
    </aside>

    <div class="object-viewer" id="object-modal" hidden role="dialog" aria-modal="true" aria-labelledby="object-modal-title">
        <div class="object-viewer-backdrop" data-close-object></div>
        <section class="object-viewer-card">
            <header class="object-viewer-header">
                <div><span class="drawer-kicker">Examining</span><h2 id="object-modal-title">Object</h2></div>
                <div class="object-viewer-actions">
                    <button type="button" class="player-icon-button" id="toggle-object-description" aria-label="Read object description" aria-expanded="false" title="Read description"><i class="fa-regular fa-eye" aria-hidden="true"></i></button>
                    <button type="button" class="object-close" id="close-object" aria-label="Close object"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Close</span></button>
                </div>
            </header>
            <div class="object-viewer-body" id="object-modal-body">
                <div class="object-canvas" id="object-canvas">
                    <img id="object-image" alt="">
                    <div class="content-overlay-layer" id="object-overlay-layer" aria-hidden="true"></div>
                    <svg class="interaction-layer" id="object-regions" preserveAspectRatio="none" aria-label="Object interactions"></svg>
                </div>
                <aside class="object-description" id="object-description-panel" hidden>
                    <header><span>Description</span><button type="button" id="close-object-description" aria-label="Close object description"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header>
                    <p id="object-player-description"></p>
                </aside>
            </div>
            <section class="player-message-tray object-message-tray" id="object-player-message" aria-live="polite" aria-atomic="true" aria-hidden="true">
                <div class="message-glyph" aria-hidden="true"><i class="fa-solid fa-quote-left"></i></div>
                <div class="message-copy">
                    <span id="object-player-message-context">Object</span>
                    <p id="object-player-message-text"></p>
                </div>
            </section>
        </section>
    </div>

    <div class="game-dialog" id="game-menu" hidden role="dialog" aria-modal="true" aria-labelledby="game-menu-title">
        <div class="game-dialog-backdrop" data-close-menu></div>
        <section class="game-dialog-card">
            <header><span class="player-brand-mark" aria-hidden="true"><i class="fa-solid fa-key"></i></span><div><span class="drawer-kicker">Nightlatch House</span><h2 id="game-menu-title">Game menu</h2></div></header>
            <div class="game-menu-actions" id="game-menu-actions">
                <button type="button" id="continue-game"><i class="fa-solid fa-play" aria-hidden="true"></i><span><strong>Continue</strong><small>Return to the house</small></span></button>
                <button type="button" id="toggle-immersive" aria-pressed="false"><i class="fa-solid fa-expand" aria-hidden="true"></i><span><strong id="immersive-menu-label">Expand room</strong><small id="immersive-menu-detail">Hide controls and use the available screen</small></span></button>
                <button type="button" id="request-new-game"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span><strong>Start over</strong><small>Clear this saved run</small></span></button>
            </div>
            <div class="new-game-confirm" id="new-game-confirm" hidden>
                <h3>Begin again?</h3>
                <p>Your current room, inventory, and puzzle progress on this device will be cleared.</p>
                <div><button type="button" id="cancel-new-game">Keep playing</button><button type="button" class="confirm-reset" id="start-new-game">Start over</button></div>
            </div>
        </section>
    </div>
</div>

<audio id="player-sound" preload="none"></audio>
<audio id="player-ambient" preload="auto" loop></audio>
<script>
window.NL_PLAYER_START_ROOM = <?php echo json_encode($startRoom, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
window.NL_PLAYER_ROOMS = <?php echo json_encode($catalog['rooms'], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
window.NL_PLAYER_OBJECTS = <?php echo json_encode($catalog['objects'], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
window.NL_PLAYER_SOUNDS = <?php echo json_encode($catalog['sounds'], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
window.NL_PLAYER_TOPOLOGY = <?php echo json_encode($catalog['topology'], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
</script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/room-rules.js', 'assets/')); ?>"></script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/play-player.js', 'assets/')); ?>"></script>
<?php endif; ?>
</body>
</html>
