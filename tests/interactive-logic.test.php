<?php

require dirname(__DIR__) . '/app/interactive-logic.php';

$expression = array(
    'type' => 'group',
    'match' => 'all',
    'children' => array(
        array('type' => 'condition', 'source' => 'item', 'key' => 'blue_key', 'operator' => 'exists', 'value' => ''),
        array('type' => 'condition', 'source' => 'item', 'key' => 'red_key', 'operator' => 'exists', 'value' => ''),
        array('type' => 'condition', 'source' => 'flag', 'key' => 'ritual_ready', 'operator' => 'equals', 'value' => 'yes'),
    ),
);
$data = array(
    'version' => 2,
    'canvas' => array('width' => 1600, 'height' => 900),
    'regions' => array(array(
        'id' => 'painting',
        'kind' => 'interaction',
        'overlayLibrary' => array(
            array('asset' => '../painting-open.png', 'prompt' => 'Open the painting.', 'source' => 'generated'),
        ),
        'logic' => array(
            'version' => 1,
            'branches' => array(array(
                'id' => 'ready',
                'when' => $expression,
                'actions' => array(
                    array('id' => 'overlay', 'type' => 'set_overlay', 'asset' => '../painting-open.png', 'prompt' => ''),
                    array('id' => 'flag', 'type' => 'set_flag', 'key' => 'painting_open', 'value' => 'yes'),
                    array('id' => 'description', 'type' => 'set_description', 'targetKind' => 'room', 'targetSlug' => 'foyer', 'text' => 'Firelight warms the room.'),
                    array('id' => 'sound', 'type' => 'play_sound', 'soundSlug' => 'fireplace-lighting'),
                ),
            )),
            'elseActions' => array(array('id' => 'clear', 'type' => 'clear_overlay')),
        ),
    )),
);

nightlatch_validate_interactive_data($data, 'room');

$invalid = $data;
$invalid['regions'][0]['logic']['branches'][0]['actions'][] = array('type' => 'set_description', 'targetKind' => 'painting', 'targetSlug' => 'foyer', 'text' => 'Invalid target.');
try {
    nightlatch_validate_interactive_data($invalid, 'room');
    fwrite(STDERR, "A description result accepted an invalid content type.\n");
    exit(1);
} catch (RuntimeException $exception) {
    // Expected.
}

$invalid = $data;
$invalid['regions'][0]['logic']['branches'][0]['when']['match'] = 'sometimes';
try {
    nightlatch_validate_interactive_data($invalid, 'room');
    fwrite(STDERR, "Invalid condition matching was accepted.\n");
    exit(1);
} catch (RuntimeException $exception) {
    // Expected.
}

$invalid = $data;
$invalid['regions'][0]['logic']['branches'][0]['actions'][] = array('type' => 'unlock_door');
try {
    nightlatch_validate_interactive_data($invalid, 'room');
    fwrite(STDERR, "A non-door region accepted unlock-door logic.\n");
    exit(1);
} catch (RuntimeException $exception) {
    // Expected.
}

$invalid = $data;
$invalid['regions'][0]['logic']['branches'][0]['actions'][] = array('type' => 'examine_object', 'objectSlug' => 'box');
try {
    nightlatch_validate_interactive_data($invalid, 'object');
    fwrite(STDERR, "Object logic accepted an examine-object result.\n");
    exit(1);
} catch (RuntimeException $exception) {
    // Expected.
}

$invalid = $data;
$invalid['regions'][0]['overlayLibrary'] = array_fill(0, 101, array('asset' => '../overlay.png'));
try {
    nightlatch_validate_interactive_data($invalid, 'room');
    fwrite(STDERR, "An oversized region overlay library was accepted.\n");
    exit(1);
} catch (RuntimeException $exception) {
    // Expected.
}

$legacy = array('version' => 1, 'regions' => array(array('condition' => array('source' => 'always'))));
nightlatch_validate_interactive_data($legacy, 'room');

try {
    nightlatch_validate_interactive_data(array('version' => 2, 'regions' => array(array('kind' => 'interaction'))), 'room');
    fwrite(STDERR, "Version 2 data without branch logic was accepted.\n");
    exit(1);
} catch (RuntimeException $exception) {
    // Expected.
}

fwrite(STDOUT, "interactive-logic tests passed\n");
