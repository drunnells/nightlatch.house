<?php

require dirname(__DIR__) . '/app/bootstrap.php';
require dirname(__DIR__) . '/app/content-variables.php';

$roomData = array(
    'version' => 2,
    'regions' => array(array(
        'id' => 'drawer',
        'name' => 'Desk drawer',
        'logic' => array(
            'branches' => array(array(
                'when' => array('type' => 'group', 'match' => 'all', 'children' => array(
                    array('type' => 'condition', 'source' => 'flag', 'key' => 'drawer_open', 'operator' => 'equals', 'value' => 'yes'),
                    array('type' => 'condition', 'source' => 'item', 'key' => 'desk_key', 'operator' => 'exists', 'value' => ''),
                )),
                'actions' => array(array('type' => 'set_flag', 'key' => 'drawer_open', 'value' => 'yes')),
            )),
            'elseActions' => array(array('type' => 'clear_flag', 'key' => 'temporary_hint')),
        ),
        'automaticBehaviors' => array(array(
            'id' => 'generator-response',
            'name' => 'Generator response',
            'trigger' => array('type' => 'state_change', 'source' => 'flag', 'key' => 'generator_power'),
            'logic' => array(
                'branches' => array(array(
                    'when' => array('type' => 'group', 'match' => 'all', 'children' => array(
                        array('type' => 'condition', 'source' => 'flag', 'key' => 'generator_power', 'operator' => 'equals', 'value' => 'on'),
                    )),
                    'actions' => array(array('type' => 'set_flag', 'key' => 'machinery_running', 'value' => 'yes')),
                )),
                'elseActions' => array(),
            ),
        )),
    )),
);
$objectData = array(
    'version' => 1,
    'regions' => array(array(
        'id' => 'catch',
        'name' => 'Hidden catch',
        'condition' => array('source' => 'flag', 'key' => 'drawer_open', 'operator' => 'exists'),
        'success' => array('setFlag' => array('key' => 'box_open', 'value' => 'yes')),
    )),
);

$catalog = array();
nightlatch_add_content_flags($catalog, 'room', array(
    'id' => 4, 'title' => 'Study', 'slug' => 'study', 'room_data' => json_encode($roomData),
), 'room_data');
nightlatch_add_content_flags($catalog, 'object', array(
    'id' => 9, 'title' => 'Puzzle Box', 'slug' => 'puzzle-box', 'object_data' => json_encode($objectData),
), 'object_data');

if (!isset($catalog['drawer_open'], $catalog['temporary_hint'], $catalog['box_open'], $catalog['generator_power'], $catalog['machinery_running'])) {
    fwrite(STDERR, "Flag catalog did not collect all saved flag names.\n");
    exit(1);
}
if (count($catalog['drawer_open']['references']) !== 2
    || $catalog['drawer_open']['references'][0]['regionName'] !== 'Desk drawer'
    || $catalog['drawer_open']['references'][1]['contentKind'] !== 'object') {
    fwrite(STDERR, "Flag catalog associations are incomplete.\n");
    exit(1);
}
if ($catalog['drawer_open']['references'][0]['usages'] !== array('condition', 'set')) {
    fwrite(STDERR, "Flag catalog usage roles are incomplete.\n");
    exit(1);
}
if ($catalog['generator_power']['references'][0]['usages'] !== array('trigger', 'condition')) {
    fwrite(STDERR, "Automatic behavior trigger usage is incomplete.\n");
    exit(1);
}

$flagsMarkup = file_get_contents(dirname(__DIR__) . '/admin/flags.php');
$headerMarkup = file_get_contents(dirname(__DIR__) . '/admin/_header.php');
if ($flagsMarkup === false || $headerMarkup === false
    || strpos($flagsMarkup, 'id="flag-catalog"') === false
    || strpos($flagsMarkup, "return 'Watches'") === false
    || strpos($headerMarkup, 'href="flags.php"') === false) {
    fwrite(STDERR, "Flags catalog navigation or markup is missing.\n");
    exit(1);
}

fwrite(STDOUT, "content-variable tests passed\n");
