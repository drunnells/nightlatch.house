<?php

define('NIGHTLATCH_ROOT', dirname(__DIR__));
function nightlatch_config() {
    return array('s3' => array('s3_object_baseurl' => 'https://assets.example.test', 's3_bucket' => 'test'));
}
require NIGHTLATCH_ROOT . '/app/storage.php';
require NIGHTLATCH_ROOT . '/app/image-assets.php';
require NIGHTLATCH_ROOT . '/app/image.php';

$background = 'rooms/study/backgrounds/room.jpg';
$overlay = 'rooms/study/overlays/lamp.png';
$page = 'rooms/study/overlays/page.webp';
$row = array('title' => 'Study', 'slug' => 'study', 'background_asset' => $background, 'interaction_data' => json_encode(array(
    'regions' => array(array(
        'overlayLibrary' => array($overlay, array('asset' => $overlay)),
        'logic' => array('branches' => array(array('actions' => array(array('type' => 'set_overlay', 'asset' => $overlay))))),
    )),
    'book' => array('pages' => array(array('asset' => $page))),
    'backgroundPrompt' => 'Never expose this prompt.',
)));
$assets = nightlatch_image_asset_entries(array($row), 'rooms', true);
if (count($assets) !== 3 || count(nightlatch_image_asset_entries(array($row), 'rooms')) !== 1) {
    throw new RuntimeException('The library must include unique backgrounds, overlays, and pages only when requested.');
}
if ($assets[2]['backgroundAsset'] !== 'https://assets.example.test/' . $page
    || strpos(json_encode($assets), 'Never expose') !== false) {
    throw new RuntimeException('The library must resolve asset URLs without exposing author prompts.');
}
foreach (array('objects/box/backgrounds/box.jpg', 'https://untrusted.example/image.png', 'rooms/study/demo.svg') as $invalid) {
    $bad = $row;
    $bad['background_asset'] = $invalid;
    if (nightlatch_image_asset_entries(array($bad), 'rooms')) throw new RuntimeException('Invalid asset entered the library.');
}

$path = NIGHTLATCH_ROOT . '/assets/graphics/rooms/uploads/reference-test-' . bin2hex(random_bytes(6)) . '.png';
$reference = '../assets/graphics/rooms/uploads/' . basename($path);
try {
    file_put_contents($path, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1kAAAAASUVORK5CYII='));
    $image = nightlatch_reference_image($reference, 'rooms');
    if ($image['width'] !== 1 || $image['height'] !== 1 || $image['mimeType'] !== 'image/png') {
        throw new RuntimeException('Uploaded reference metadata is incorrect.');
    }
    file_put_contents($path, 'not an image');
    try {
        nightlatch_reference_image($reference, 'rooms');
        throw new LogicException('Fake raster image was accepted.');
    } catch (RuntimeException $expected) {}
    try {
        nightlatch_reference_image('../assets/graphics/rooms/../objects/demo-object.svg', 'rooms');
        throw new LogicException('Traversal was accepted.');
    } catch (RuntimeException $expected) {}
} finally {
    if (is_file($path)) unlink($path);
}
fwrite(STDOUT, "image-assets tests passed\n");
