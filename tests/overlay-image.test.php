<?php

define('NIGHTLATCH_ROOT', dirname(__DIR__));
require dirname(__DIR__) . '/app/overlay-image.php';

$wide = nightlatch_overlay_template_spec(400, 100);
if ($wide['templateWidth'] !== 1024 || $wide['templateHeight'] !== 1024 || $wide['width'] !== 896 || $wide['height'] !== 224) {
    fwrite(STDERR, "Wide overlay template dimensions are incorrect.\n");
    exit(1);
}
if ($wide['x'] !== 64 || $wide['y'] !== 400 || $wide['outputWidth'] !== 400 || $wide['outputHeight'] !== 100) {
    fwrite(STDERR, "Wide overlay template placement is incorrect.\n");
    exit(1);
}

$tall = nightlatch_overlay_template_spec(80, 320);
if ($tall['width'] !== 224 || $tall['height'] !== 896 || $tall['x'] !== 400 || $tall['y'] !== 64) {
    fwrite(STDERR, "Tall overlay template placement is incorrect.\n");
    exit(1);
}

$large = nightlatch_overlay_template_spec(1600, 400);
if ($large['outputWidth'] !== 1024 || $large['outputHeight'] !== 256) {
    fwrite(STDERR, "Large overlay output was not capped at 1024 pixels wide.\n");
    exit(1);
}

$box = nightlatch_region_source_box(
    array('x' => 100, 'y' => 50, 'width' => 200, 'height' => 100),
    array('width' => 1000, 'height' => 500),
    2000,
    1000
);
if ($box !== array('x' => 200, 'y' => 100, 'width' => 400, 'height' => 200)) {
    fwrite(STDERR, "Region bounds were not mapped to source pixels correctly.\n");
    exit(1);
}

$localDemo = nightlatch_local_room_asset_path('../assets/graphics/rooms/demo-room.svg');
if ($localDemo !== realpath(dirname(__DIR__) . '/assets/graphics/rooms/demo-room.svg')) {
    fwrite(STDERR, "Local room asset path was not resolved correctly.\n");
    exit(1);
}

$localObjectDemo = nightlatch_local_content_asset_path('../assets/graphics/objects/demo-object.svg', 'objects');
if ($localObjectDemo !== realpath(dirname(__DIR__) . '/assets/graphics/objects/demo-object.svg')) {
    fwrite(STDERR, "Local object asset path was not resolved correctly.\n");
    exit(1);
}
try {
    nightlatch_local_content_asset_path('../assets/graphics/rooms/demo-room.svg', 'objects');
    fwrite(STDERR, "Cross-type object asset access was not rejected.\n");
    exit(1);
} catch (RuntimeException $exception) {
    // Expected.
}
try {
    nightlatch_local_room_asset_path('../assets/graphics/rooms/../../README.md');
    fwrite(STDERR, "Room asset traversal was not rejected.\n");
    exit(1);
} catch (RuntimeException $exception) {
    // Expected.
}

$prompt = nightlatch_overlay_edit_prompt('Turn on the lamp.', $wide);
if (strpos($prompt, 'USER REQUEST:') === false || strpos($prompt, 'Turn on the lamp.') === false || strpos($prompt, '1024 by 1024') === false) {
    fwrite(STDERR, "Overlay prompt is missing precision-edit instructions.\n");
    exit(1);
}

if (extension_loaded('gd')) {
    $source = imagecreatetruecolor(400, 100);
    $red = imagecolorallocate($source, 180, 20, 20);
    imagefill($source, 0, 0, $red);
    $templateBytes = nightlatch_create_overlay_template(
        $source,
        array('x' => 0, 'y' => 0, 'width' => 400, 'height' => 100),
        $wide
    );
    nightlatch_destroy_image($source);
    $templateInfo = getimagesizefromstring($templateBytes);
    if (!$templateInfo || $templateInfo[0] !== 1024 || $templateInfo[1] !== 1024) {
        fwrite(STDERR, "Overlay template PNG dimensions are incorrect.\n");
        exit(1);
    }
    $overlayBytes = nightlatch_extract_overlay_image($templateBytes, $wide);
    $overlayInfo = getimagesizefromstring($overlayBytes);
    if (!$overlayInfo || $overlayInfo[0] !== 400 || $overlayInfo[1] !== 100 || $overlayInfo[2] !== IMAGETYPE_JPEG) {
        fwrite(STDERR, "Extracted overlay JPEG dimensions are incorrect.\n");
        exit(1);
    }
}

fwrite(STDOUT, "overlay-image tests passed\n");
