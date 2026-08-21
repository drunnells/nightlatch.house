<?php

$root = dirname(__DIR__);
$sources = array(
    'page' => file_get_contents($root . '/admin/sounds.php'),
    'api' => file_get_contents($root . '/admin/api/sounds.php'),
    'script' => file_get_contents($root . '/assets/js/sounds.js'),
    'migration' => file_get_contents($root . '/database/updates/004_player_descriptions_and_sounds.sql'),
    'header' => file_get_contents($root . '/admin/_header.php'),
);
foreach ($sources as $source) {
    if ($source === false) {
        fwrite(STDERR, "A sound library source could not be read.\n");
        exit(1);
    }
}
$expectations = array(
    array('page', 'id="sound-upload"'),
    array('page', 'id="sound-preview-player"'),
    array('api', 'count($names) > 50'),
    array('script', "fetch('api/sounds.php'"),
    array('migration', 'CREATE TABLE sounds'),
    array('migration', 'ADD COLUMN player_description'),
    array('header', 'href="sounds.php"'),
);
foreach ($expectations as $expectation) {
    if (strpos($sources[$expectation[0]], $expectation[1]) === false) {
        fwrite(STDERR, "The sound library is missing a required authoring element.\n");
        exit(1);
    }
}

fwrite(STDOUT, "sounds-editor render tests passed\n");
