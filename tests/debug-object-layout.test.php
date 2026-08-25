<?php

$debugMarkup = file_get_contents(dirname(__DIR__) . '/admin/play-debug.php');
$styles = file_get_contents(dirname(__DIR__) . '/assets/css/admin.css');
if ($debugMarkup === false || $styles === false) {
    fwrite(STDERR, "Debug object layout sources could not be read.\n");
    exit(1);
}

$playCanvasPosition = strpos($debugMarkup, '<div class="play-canvas"');
$objectModalPosition = strpos($debugMarkup, '<div class="object-modal"');
$inventoryPosition = strpos($debugMarkup, '<aside class="inventory-panel"');
$debugConsolePosition = strpos($debugMarkup, '<aside class="debug-console">');
$roomMessagePosition = strpos($debugMarkup, 'id="player-message"');
$objectMessagePosition = strpos($debugMarkup, 'id="object-player-message"');
if ($playCanvasPosition === false || $objectModalPosition === false || $inventoryPosition === false
    || !($playCanvasPosition < $objectModalPosition && $objectModalPosition < $inventoryPosition)) {
    fwrite(STDERR, "The object modal is not nested with the room play canvas.\n");
    exit(1);
}
if ($debugConsolePosition === false || $roomMessagePosition === false || $objectMessagePosition === false
    || $roomMessagePosition < $debugConsolePosition || $objectMessagePosition < $debugConsolePosition) {
    fwrite(STDERR, "Player messages must render in the debug console instead of over a play canvas.\n");
    exit(1);
}
if (strpos($styles, '.object-modal { position: absolute;') === false
    || strpos($styles, '.object-modal-card { position: relative; z-index: 1; width: 80%; height: 80%;') === false) {
    fwrite(STDERR, "The object modal is not sized relative to the room canvas.\n");
    exit(1);
}
$debugScript = file_get_contents(dirname(__DIR__) . '/assets/js/play-debug.js');
if (strpos($debugMarkup, 'id="back-room"') === false
    || strpos($debugMarkup, 'id="toggle-room-description"') === false
    || strpos($debugMarkup, 'id="toggle-object-description"') === false
    || strpos($debugMarkup, 'id="debug-ambient-player"') === false
    || strpos($debugMarkup, 'window.NL_DEBUG_SOUNDS') === false
    || strpos($debugMarkup, 'window.NL_DEBUG_ROOMS') === false
    || $debugScript === false
    || strpos($debugScript, 'navigateToRoom') === false
    || strpos($debugScript, 'returnToPreviousRoom') === false
    || strpos($debugScript, 'playEvaluationSounds') === false
    || strpos($debugScript, 'dispatchStateChanges') === false
    || strpos($debugScript, 'runActivationBehaviors') === false
    || strpos($debugScript, 'maximumRuns: 100') === false
    || strpos($debugScript, 'syncAmbientSound') === false
    || strpos($debugScript, 'renderDescriptions') === false
    || strpos($debugScript, 'syncPlayerMessagePanel') === false
    || strpos($styles, '.player-message { display: none;') === false
    || strpos($styles, 'pointer-events: none;') === false) {
    fwrite(STDERR, "Debug room traversal and return navigation are incomplete.\n");
    exit(1);
}

fwrite(STDOUT, "debug-object layout tests passed\n");
