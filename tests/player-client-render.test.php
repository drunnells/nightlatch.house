<?php

$root = dirname(__DIR__);
require_once $root . '/app/play-catalog.php';

$rooms = array(
    array('id' => 1, 'title' => 'Wrong room'),
    array('id' => 2, 'title' => 'Start room'),
);
$clusters = array(
    array('id' => 10, 'entryRoomId' => 1, 'isStart' => false),
    array('id' => 20, 'entryRoomId' => 2, 'isStart' => true),
);
$startRoom = nightlatch_find_start_room($rooms, $clusters);
if (!$startRoom || (int) $startRoom['id'] !== 2) {
    fwrite(STDERR, "The player catalog did not select the starting cluster's entry room.\n");
    exit(1);
}
if (nightlatch_find_start_room($rooms, array()) !== null) {
    fwrite(STDERR, "A player start room was selected without a starting cluster.\n");
    exit(1);
}

$privateCatalog = array(
    'rooms' => array(array(
        'id' => 2,
        'title' => 'Start room',
        'slug' => 'start-room',
        'description' => 'Designer-only room notes',
        'playerDescription' => 'Player copy',
        'backgroundAsset' => 'rooms/start/backgrounds/test.jpg',
        'backgroundPrompt' => 'Private generation prompt',
        'data' => array('canvas' => array('width' => 1600, 'height' => 900), 'regions' => array(array(
            'id' => 'portrait',
            'overlayLibrary' => array(array('asset' => 'private-library.jpg', 'prompt' => 'Private library prompt')),
            'logic' => array('branches' => array(array('actions' => array(array(
                'type' => 'set_overlay',
                'asset' => 'rooms/start/overlays/runtime.jpg',
                'prompt' => 'Private action prompt',
            ))))),
        ))),
    )),
    'objects' => array(array(
        'id' => 5,
        'title' => 'Field journal',
        'slug' => 'field-journal',
        'description' => 'Designer-only object notes',
        'playerDescription' => 'A weathered journal.',
        'backgroundAsset' => 'objects/journal/backgrounds/test.jpg',
        'backgroundPrompt' => 'Private object prompt',
        'portable' => true,
        'inventoryKey' => 'field_journal',
        'data' => array(
            'canvas' => array('width' => 1200, 'height' => 1200),
            'regions' => array(),
            'book' => array(
                'enabled' => true,
                // Legacy authoring fields must not reach the public runtime catalog.
                'previousRegionId' => 'page-left',
                'nextRegionId' => 'page-right',
                'pageTurnSoundSlug' => 'paper-turn',
                'designerNote' => 'Private book note',
                'pages' => array(array('asset' => 'objects/journal/overlays/page-one.png', 'prompt' => 'Private generation prompt', 'caption' => 'Private page note')),
            ),
        ),
    )),
    'sounds' => array(array('id' => 1, 'name' => 'Knock', 'slug' => 'knock', 'assetUrl' => 'sound.mp3', 'originalFilename' => 'private.wav')),
    'topology' => array(
        'clusters' => array(array('id' => 20, 'name' => 'House', 'slug' => 'house', 'description' => 'Private cluster notes', 'entryRoomId' => 2, 'isStart' => true)),
        'nodes' => array(array('clusterId' => 20, 'roomId' => 2, 'x' => 440, 'y' => 180)),
        'connections' => array(),
        'gateways' => array(),
    ),
);
$publicCatalog = nightlatch_public_play_catalog($privateCatalog);
$publicRoom = $publicCatalog['rooms'][0];
$publicRegion = $publicRoom['data']['regions'][0];
$publicAction = $publicRegion['logic']['branches'][0]['actions'][0];
$publicBook = $publicCatalog['objects'][0]['data']['book'];
if (isset($publicRoom['description']) || isset($publicRoom['backgroundPrompt'])
    || isset($publicRegion['overlayLibrary']) || isset($publicAction['prompt'])
    || isset($publicCatalog['sounds'][0]['originalFilename'])
    || isset($publicCatalog['topology']['clusters'][0]['description'])
    || isset($publicCatalog['topology']['nodes'][0]['x'])
    || isset($publicCatalog['objects'][0]['description']) || isset($publicCatalog['objects'][0]['backgroundPrompt'])
    || isset($publicBook['designerNote']) || isset($publicBook['pages'][0]['caption']) || isset($publicBook['pages'][0]['prompt'])
    || isset($publicBook['previousRegionId']) || isset($publicBook['nextRegionId'])
    || $publicBook['pageTurnSoundSlug'] !== 'paper-turn'
    || $publicBook['pages'][0]['asset'] !== 'objects/journal/overlays/page-one.png'
    || $publicAction['asset'] !== 'rooms/start/overlays/runtime.jpg') {
    fwrite(STDERR, "The public play catalog leaked authoring metadata or removed runtime data.\n");
    exit(1);
}

$files = array(
    'index' => file_get_contents($root . '/index.php'),
    'catalog' => file_get_contents($root . '/app/play-catalog.php'),
    'playerJs' => file_get_contents($root . '/assets/js/play-player.js'),
    'debugJs' => file_get_contents($root . '/assets/js/play-debug.js'),
    'playerCss' => file_get_contents($root . '/assets/css/player.css'),
    'debug' => file_get_contents($root . '/admin/play-debug.php'),
);
foreach ($files as $name => $contents) {
    if ($contents === false) {
        fwrite(STDERR, "Could not read the {$name} player-client artifact.\n");
        exit(1);
    }
}

$expectations = array(
    array('index', 'nightlatch_find_start_room', 'The root player does not load the authored start room.'),
    array('index', 'id="player-stage"', 'The player stage is missing.'),
    array('index', 'id="player-entry"', 'The outside-house player entry screen is missing.'),
    array('index', 'id="enter-house"', 'The player entry screen has no enter/resume action.'),
    array('index', 'id="player-message"', 'The room message tray is missing.'),
    array('index', 'id="object-player-message"', 'The object message tray is missing.'),
    array('index', 'id="inventory-panel"', 'The player inventory is missing.'),
    array('index', 'id="toggle-menu-fullscreen"', 'The game menu is missing the fullscreen control.'),
    array('index', 'id="toggle-room-description"', 'The room artwork has no visible description control.'),
    array('index', 'id="toggle-room-fullscreen"', 'The room canvas has no visible fullscreen control.'),
    array('index', 'id="toggle-object-description"', 'The object artwork has no visible description control.'),
    array('index', 'id="toggle-object-fullscreen"', 'The object canvas has no visible fullscreen control.'),
    array('index', 'id="close-object"', 'The object artwork has no visible close control.'),
    array('index', 'id="object-book-controls"', 'The object artwork has no built-in book controls.'),
    array('index', 'id="book-open"', 'The book viewer has no Open control.'),
    array('index', 'id="book-next"', 'The book viewer has no Next Page control.'),
    array('index', 'id="book-previous"', 'The book viewer has no Previous Page control.'),
    array('index', 'id="book-close"', 'The book viewer has no Close control.'),
    array('index', 'id="request-exit-game"', 'The game menu has no exit-and-reset action.'),
    array('index', 'id="exit-game-confirm"', 'The destructive game exit is missing confirmation.'),
    array('index', 'id="toggle-object-sound"', 'The object viewer does not retain sound controls.'),
    array('index', 'id="toggle-object-inventory"', 'The object viewer does not retain inventory controls.'),
    array('index', 'id="open-object-game-menu"', 'The object viewer does not retain game-menu controls.'),
    array('index', "nightlatch_asset('js/room-rules.js'", 'The player does not load the shared rule evaluator.'),
    array('catalog', 'nightlatch_load_topology', 'The shared play catalog does not load canonical topology.'),
    array('catalog', 'nightlatch_apply_topology_to_rooms', 'The shared play catalog does not mirror canonical topology into room data.'),
    array('catalog', 'nightlatch_public_play_catalog', 'The public play catalog projection is missing.'),
    array('debug', 'app/play-catalog.php', 'Debug play does not use the shared play catalog.'),
    array('playerJs', 'window.NLRoomRules.runRegion', 'The player does not evaluate shared room rules.'),
    array('playerJs', 'window.NLRoomRules.regionAcceptsPlayerClick', 'The player does not ignore passive automatic-only regions.'),
    array('playerJs', "' passive'", 'The player does not mark automatic-only regions as passive.'),
    array('playerJs', 'window.NLRoomRules.useBookControl', 'The player is missing shared built-in book navigation.'),
    array('playerJs', 'window.NLRoomRules.bookControlState', 'The player does not derive book control availability from shared state.'),
    array('playerJs', 'window.NLRoomRules.bookPage', 'The player does not render book page overlays.'),
    array('playerJs', 'if (result.soundSlug) playSoundSlug(result.soundSlug)', 'The player does not play the per-book page flip sound.'),
    array('debugJs', 'window.NLRoomRules.useBookControl', 'Debug play is missing shared built-in book navigation.'),
    array('debugJs', 'window.NLRoomRules.bookControlState', 'Debug play does not derive book control availability from shared state.'),
    array('debugJs', 'window.NLRoomRules.bookPage', 'Debug play does not render book page overlays.'),
    array('debugJs', 'window.NLRoomRules.regionAcceptsPlayerClick', 'Debug play does not ignore passive automatic-only regions.'),
    array('debugJs', 'if (result.soundSlug) playSoundSlug(result.soundSlug)', 'Debug play does not play the per-book page flip sound.'),
    array('playerJs', 'runActivationBehaviors', 'The player is missing automatic activation behaviors.'),
    array('playerJs', 'maximumRuns: 100', 'The player is missing the guarded automatic-behavior queue.'),
    array('playerJs', 'assignGatewayDestinations', 'The player is missing stable Gateway assignment behavior.'),
    array('playerJs', 'window.NLRoomRules.canExit', 'The player is missing authored door access behavior.'),
    array('playerJs', 'syncAmbientSound', 'The player is missing cluster ambience behavior.'),
    array('playerJs', 'requestFullscreen', 'The player does not request native fullscreen.'),
    array('playerJs', 'setMessageAsDescription', 'Explicit descriptions do not reuse the narration trays.'),
    array('playerJs', "contains('fullscreen-mode') ? Infinity : 1", 'Desktop fullscreen does not allow the room image to use the available display.'),
    array('playerJs', 'MESSAGE_DISPLAY_MS = 4200', 'Transient player text has no timed slide-out lifecycle.'),
    array('playerJs', 'exitGameToEntry', 'The player has no exit-to-entry reset lifecycle.'),
    array('playerJs', 'showEntryScreen', 'The player does not return to the outside-house entry screen.'),
    array('playerJs', 'window.localStorage.setItem(RUN_STORAGE_KEY', 'The anonymous player run is not persisted.'),
    array('playerCss', '.player-main', 'The player layout styles are missing.'),
    array('playerCss', '.player-message-tray', 'Player messages are not styled outside the interaction canvas.'),
    array('playerCss', '.player-message-tray.has-message', 'Player message visibility does not preserve the desktop layout.'),
    array('playerCss', '.player-app.fullscreen-mode', 'The player has no desktop/mobile fullscreen layout.'),
    array('playerCss', '.player-app.fullscreen-mode .player-header-actions .inventory-toggle', 'Fullscreen mode does not retain the complete controls.'),
    array('playerCss', '.canvas-context-toolbar', 'The scene-specific controls are not positioned on the artwork.'),
    array('playerCss', '.canvas-description-button {', 'The description control has no centered artwork position.'),
    array('playerCss', 'left: 50%', 'The description control is not centered over the artwork.'),
    array('playerCss', '.canvas-action-button', 'The artwork controls are not styled.'),
    array('playerCss', '.canvas-object-close', 'The object close affordance is not positioned on its artwork.'),
    array('playerCss', '.play-region.passive', 'Passive player regions can still block overlapping clickable regions.'),
    array('playerCss', '.object-viewer-body { position: absolute; inset: 0;', 'The object viewer is not presented as one visual surface.'),
    array('playerCss', '.player-message-tray.description-message', 'Explicit descriptions have no persistent bottom-right narration presentation.'),
    array('playerCss', '@media (max-width: 760px)', 'The player has no mobile layout.'),
    array('playerCss', '(max-height: 560px) and (orientation: landscape)', 'The player has no compact mobile landscape layout.'),
    array('playerCss', 'height: 100dvh', 'The player does not account for mobile viewport height.'),
);
foreach ($expectations as $expectation) {
    if (strpos($files[$expectation[0]], $expectation[1]) === false) {
        fwrite(STDERR, $expectation[2] . "\n");
        exit(1);
    }
}

if (strpos($files['index'], 'dismiss-player-message') !== false
    || strpos($files['index'], 'dismiss-object-player-message') !== false) {
    fwrite(STDERR, "Player narration must not expose controls that resize the interaction area.\n");
    exit(1);
}
if (strpos($files['playerJs'], "createElementNS('http://www.w3.org/2000/svg', 'title')") !== false
    || strpos($files['playerCss'], 'fill: rgba(115, 157, 149') !== false
    || strpos($files['playerCss'], 'fill: rgba(201, 173, 101') !== false) {
    fwrite(STDERR, "Player interaction regions must not reveal themselves visually or through native tooltips.\n");
    exit(1);
}

if (strpos($files['index'], 'room-description-panel') !== false
    || strpos($files['index'], 'object-description-panel') !== false
    || strpos($files['index'], 'aria-controls="player-message"') === false
    || strpos($files['index'], 'aria-controls="object-player-message"') === false) {
    fwrite(STDERR, "Explicit descriptions must reuse the bottom-right narration trays without a separate panel.\n");
    exit(1);
}

$roomCanvasPosition = strpos($files['index'], 'id="room-canvas"');
$roomDescriptionControlPosition = strpos($files['index'], 'id="toggle-room-description"');
$roomTouchHintPosition = strpos($files['index'], 'id="player-touch-hint"');
$objectCanvasPosition = strpos($files['index'], 'id="object-canvas"');
$objectDescriptionControlPosition = strpos($files['index'], 'id="toggle-object-description"');
$objectCloseControlPosition = strpos($files['index'], 'id="close-object"');
$objectMessagePosition = strpos($files['index'], 'id="object-player-message"');
if ($roomCanvasPosition === false || $roomDescriptionControlPosition === false || $roomTouchHintPosition === false
    || $objectCanvasPosition === false || $objectDescriptionControlPosition === false || $objectCloseControlPosition === false || $objectMessagePosition === false
    || $roomDescriptionControlPosition <= $roomCanvasPosition || $roomDescriptionControlPosition >= $roomTouchHintPosition
    || $objectDescriptionControlPosition <= $objectCanvasPosition || $objectDescriptionControlPosition >= $objectMessagePosition
    || $objectCloseControlPosition <= $objectCanvasPosition || $objectCloseControlPosition >= $objectMessagePosition) {
    fwrite(STDERR, "Room and object context controls must remain directly on their interaction artwork.\n");
    exit(1);
}

$roomMessagePosition = strpos($files['index'], 'id="player-message"');
$roomCanvasClosePosition = strpos($files['index'], '</section>', strpos($files['index'], 'id="player-stage"'));
$objectBodyClosePosition = strpos($files['index'], '</div>', strpos($files['index'], 'id="object-modal-body"'));
if ($roomMessagePosition === false || $roomCanvasClosePosition === false || $roomMessagePosition < $roomCanvasClosePosition
    || $objectMessagePosition === false || $objectBodyClosePosition === false || $objectMessagePosition < $objectBodyClosePosition) {
    fwrite(STDERR, "Player messages must remain outside room and object interaction canvases.\n");
    exit(1);
}

fwrite(STDOUT, "player-client render tests passed\n");
