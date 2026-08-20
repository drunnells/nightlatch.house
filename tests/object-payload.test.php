<?php

require dirname(__DIR__) . '/app/bootstrap.php';

$payload = nightlatch_object_payload(array(
    'id' => '7',
    'title' => 'Puzzle Box',
    'slug' => 'puzzle-box',
    'description' => 'A portable puzzle.',
    'status' => 'development',
    'background_asset' => '../assets/graphics/objects/demo-object.svg',
    'background_prompt' => '',
    'portable' => '1',
    'inventory_key' => 'puzzle_box',
    'object_data' => '{"version":1,"canvas":{"width":900,"height":700},"regions":[]}',
    'updated_at' => '2026-08-19 12:00:00',
));

if ($payload['id'] !== 7 || $payload['portable'] !== true || $payload['inventoryKey'] !== 'puzzle_box') {
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

fwrite(STDOUT, "object-payload tests passed\n");
