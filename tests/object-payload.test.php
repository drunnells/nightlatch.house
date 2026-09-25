<?php

require dirname(__DIR__) . '/app/bootstrap.php';

$payload = nightlatch_object_payload(array(
    'id' => '7',
    'title' => 'Puzzle Box',
    'slug' => 'puzzle-box',
    'description' => 'A portable puzzle.',
    'player_description' => 'An ornate box with a stubborn lid.',
    'background_asset' => '../assets/graphics/objects/demo-object.svg',
    'background_prompt' => '',
    'portable' => '1',
    'inventory_key' => 'puzzle_box',
    'object_data' => '{"version":1,"canvas":{"width":900,"height":700},"regions":[]}',
    'updated_at' => '2026-08-19 12:00:00',
));

if ($payload['id'] !== 7 || $payload['portable'] !== true || $payload['inventoryKey'] !== 'puzzle_box'
    || $payload['playerDescription'] !== 'An ornate box with a stubborn lid.') {
    fwrite(STDERR, "Object metadata was not normalized correctly.\n");
    exit(1);
}
if ($payload['data']['canvas'] !== array('width' => 900, 'height' => 700) || $payload['data']['regions'] !== array()) {
    fwrite(STDERR, "Object interaction data was not decoded correctly.\n");
    exit(1);
}

$defaults = nightlatch_interactive_content_data('{}');
if ($defaults['version'] !== 1 || $defaults['canvas'] !== array('width' => 1600, 'height' => 900) || $defaults['regions'] !== array()) {
    fwrite(STDERR, "Interactive content defaults are incorrect.\n");
    exit(1);
}

$bookData = array('version' => 2, 'book' => array('enabled' => true, 'pages' => array(
    array('asset' => '../assets/graphics/objects/demo-object.svg', 'prompt' => 'Author prompt', 'playerDescription' => 'A map marks a winding trail.'),
    array('asset' => '../assets/graphics/objects/demo-object.svg'),
)));
$loaded = nightlatch_resolve_interactive_asset_urls(nightlatch_interactive_content_data(json_encode($bookData)));
if ($loaded['book']['pages'][0]['playerDescription'] !== 'A map marks a winding trail.'
    || $loaded['book']['pages'][0]['prompt'] !== 'Author prompt' || count($loaded['book']['pages']) !== 2) {
    throw new RuntimeException('Loading saved book JSON must preserve page descriptions, prompts, and legacy pages.');
}

fwrite(STDOUT, "object-payload tests passed\n");
