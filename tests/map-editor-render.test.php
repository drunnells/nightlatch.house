<?php

$root = dirname(__DIR__);
$files = array(
    'map' => file_get_contents($root . '/admin/map.php'),
    'room' => file_get_contents($root . '/admin/room-edit.php'),
    'header' => file_get_contents($root . '/admin/_header.php'),
    'mapJs' => file_get_contents($root . '/assets/js/map-editor.js'),
    'debugJs' => file_get_contents($root . '/assets/js/play-debug.js'),
    'migration' => file_get_contents($root . '/database/updates/003_room_clusters_and_gateways.sql'),
    'ambientMigration' => file_get_contents($root . '/database/updates/005_cluster_ambient_audio.sql'),
);
foreach ($files as $name => $contents) {
    if ($contents === false) {
        fwrite(STDERR, "Could not read the {$name} map artifact.\n");
        exit(1);
    }
}

$expectations = array(
    array('header', 'href="map.php"', 'Map navigation is missing.'),
    array('map', 'id="map-stage"', 'The draggable map stage is missing.'),
    array('map', 'id="gateway-fields"', 'The Map Gateway editor is missing.'),
    array('map', 'id="cluster-ambient-sound-picker"', 'The cluster ambient sound picker is missing.'),
    array('map', 'id="cluster-ambient-volume"', 'The cluster ambient volume control is missing.'),
    array('map', 'window.NL_MAP_SOUNDS', 'The Map sound catalog bootstrap is missing.'),
    array('mapJs', "on('drop', '.map-node'", 'Door-to-room drag/drop wiring is missing.'),
    array('mapJs', 'map-create-reverse', 'Paired reverse-exit authoring is missing.'),
    array('room', 'id="target-room-picker"', 'The searchable room target picker is missing.'),
    array('room', 'id="room-gateway-status"', 'Room Gateway validation status is missing.'),
    array('debugJs', 'ensureGatewayAssignments', 'Debug Gateway assignment behavior is missing.'),
    array('debugJs', 'Behind you:', 'The behind-you return label is missing.'),
    array('debugJs', 'syncAmbientSound', 'Debug cluster ambience behavior is missing.'),
    array('migration', 'CREATE TABLE room_clusters', 'The cluster migration is missing.'),
    array('migration', 'CREATE TABLE room_gateway_candidates', 'The Gateway candidate migration is missing.'),
    array('ambientMigration', 'ambient_sound_id', 'The cluster ambient sound migration is missing.'),
    array('ambientMigration', 'ambient_volume', 'The cluster ambient volume migration is missing.'),
);
foreach ($expectations as $expectation) {
    if (strpos($files[$expectation[0]], $expectation[1]) === false) {
        fwrite(STDERR, $expectation[2] . "\n");
        exit(1);
    }
}

fwrite(STDOUT, "map-editor render tests passed\n");
