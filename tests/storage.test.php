<?php

require dirname(__DIR__) . '/app/bootstrap.php';

$settings = array(
    'endpoint' => 'https://nyc3.digitaloceanspaces.com',
    'objectBaseUrl' => 'https://nightlatch.nyc3.cdn.digitaloceanspaces.com',
    'bucket' => 'nightlatch',
    'region' => 'nyc3',
    'accessKey' => 'test-key',
    'secretKey' => 'test-secret',
    'acl' => 'public-read',
);
$key = 'rooms/foyer/backgrounds/20260825-abc123.jpg';
$url = 'https://nightlatch.nyc3.cdn.digitaloceanspaces.com/rooms/foyer/backgrounds/20260825-abc123.jpg';

if (nightlatch_storage_public_url($key, $settings) !== $url
    || nightlatch_storage_key_from_reference($url, $settings) !== $key
    || nightlatch_storage_key_from_reference('../assets/graphics/rooms/demo-room.svg', $settings) !== '') {
    fwrite(STDERR, "Storage keys and CDN URLs were not normalized correctly.\n");
    exit(1);
}

$target = nightlatch_storage_request_target($key, $settings);
if ($target['host'] !== 'nightlatch.nyc3.digitaloceanspaces.com'
    || $target['canonicalUri'] !== '/' . $key) {
    fwrite(STDERR, "The DigitalOcean Spaces request target is incorrect.\n");
    exit(1);
}

$data = array('regions' => array(array(
    'overlayLibrary' => array(array('asset' => 'rooms/foyer/overlays/one.png')),
    'logic' => array('branches' => array(array('actions' => array(
        array('type' => 'set_overlay', 'asset' => 'rooms/foyer/overlays/two.png'),
    )))),
)));
$keys = nightlatch_content_storage_keys($key, $data);
sort($keys);
$expected = array($key, 'rooms/foyer/overlays/one.png', 'rooms/foyer/overlays/two.png');
sort($expected);
if ($keys !== $expected) {
    fwrite(STDERR, "Saved content storage references were not collected correctly.\n");
    exit(1);
}

$localDemo = nightlatch_local_content_asset_file('../assets/graphics/rooms/demo-room.svg', 'rooms');
if ($localDemo !== NIGHTLATCH_ROOT . '/assets/graphics/rooms/demo-room.svg') {
    fwrite(STDERR, "Local editor asset resolution changed unexpectedly.\n");
    exit(1);
}

fwrite(STDOUT, "storage tests passed\n");
