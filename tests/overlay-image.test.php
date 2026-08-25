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

$referencePrompt = nightlatch_overlay_edit_prompt('Add a fine layer of dust.', $wide, 'overlay');
if (strpos($referencePrompt, 'existing region overlay') === false
    || strpos($referencePrompt, 'exact visual reference') === false
    || strpos($referencePrompt, 'Add a fine layer of dust.') === false) {
    fwrite(STDERR, "Existing-overlay edit prompt is missing reference-preservation instructions.\n");
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

    $background = imagecreatetruecolor(400, 100);
    $backgroundRed = imagecolorallocate($background, 180, 20, 20);
    imagefill($background, 0, 0, $backgroundRed);
    ob_start();
    imagepng($background);
    $backgroundBytes = ob_get_clean();
    nightlatch_destroy_image($background);

    $editedRegion = imagecreatetruecolor(100, 50);
    $regionBlue = imagecolorallocate($editedRegion, 20, 40, 190);
    imagefill($editedRegion, 0, 0, $regionBlue);
    ob_start();
    imagepng($editedRegion);
    $editedRegionBytes = ob_get_clean();
    nightlatch_destroy_image($editedRegion);

    $composited = nightlatch_composite_region_edit($backgroundBytes, $editedRegionBytes, array('x' => 120, 'y' => 25, 'width' => 100, 'height' => 50));
    $compositedInfo = getimagesizefromstring($composited['bytes']);
    $compositedImage = imagecreatefromstring($composited['bytes']);
    $outsideColor = imagecolorat($compositedImage, 30, 30);
    $insideColor = imagecolorat($compositedImage, 160, 50);
    $outsideRed = ($outsideColor >> 16) & 0xFF;
    $insideBlue = $insideColor & 0xFF;
    nightlatch_destroy_image($compositedImage);
    if (!$compositedInfo || $compositedInfo[0] !== 400 || $compositedInfo[1] !== 100 || $compositedInfo[2] !== IMAGETYPE_JPEG
        || $outsideRed < 130 || $insideBlue < 130) {
        fwrite(STDERR, "Edited region was not composited into a full JPEG background correctly.\n");
        exit(1);
    }

    $captureSource = imagecreatetruecolor(400, 200);
    imagealphablending($captureSource, false);
    imagesavealpha($captureSource, true);
    $captureTransparent = imagecolorallocatealpha($captureSource, 0, 0, 0, 127);
    imagefill($captureSource, 0, 0, $captureTransparent);
    $captureRed = imagecolorallocatealpha($captureSource, 210, 25, 20, 0);
    imagefilledrectangle($captureSource, 140, 70, 259, 129, $captureRed);
    ob_start();
    imagepng($captureSource);
    $captureSourceBytes = ob_get_clean();
    nightlatch_destroy_image($captureSource);

    $captured = nightlatch_capture_region_overlay(
        $captureSourceBytes,
        array('x' => 100, 'y' => 50, 'width' => 200, 'height' => 100),
        array('width' => 400, 'height' => 200)
    );
    $capturedInfo = getimagesizefromstring($captured['bytes']);
    $capturedImage = imagecreatefromstring($captured['bytes']);
    $capturedCorner = imagecolorat($capturedImage, 5, 5);
    $capturedCenter = imagecolorat($capturedImage, 100, 50);
    $capturedAlpha = ($capturedCorner >> 24) & 0x7F;
    $capturedRed = ($capturedCenter >> 16) & 0xFF;
    nightlatch_destroy_image($capturedImage);
    if (!$capturedInfo || $capturedInfo[0] !== 200 || $capturedInfo[1] !== 100 || $capturedInfo[2] !== IMAGETYPE_PNG
        || $captured['width'] !== 200 || $captured['height'] !== 100 || $capturedAlpha < 120 || $capturedRed < 180) {
        fwrite(STDERR, "Captured region overlays did not preserve their crop, format, or transparency.\n");
        exit(1);
    }

    $largeCaptureSource = imagecreatetruecolor(1200, 120);
    $largeCaptureBlue = imagecolorallocate($largeCaptureSource, 20, 50, 180);
    imagefill($largeCaptureSource, 0, 0, $largeCaptureBlue);
    ob_start();
    imagepng($largeCaptureSource);
    $largeCaptureSourceBytes = ob_get_clean();
    nightlatch_destroy_image($largeCaptureSource);
    $largeCaptured = nightlatch_capture_region_overlay(
        $largeCaptureSourceBytes,
        array('x' => 0, 'y' => 0, 'width' => 1200, 'height' => 120),
        array('width' => 1200, 'height' => 120)
    );
    if ($largeCaptured['width'] !== 1024 || $largeCaptured['height'] !== 102) {
        fwrite(STDERR, "Captured region overlays were not capped to the generated-image width limit.\n");
        exit(1);
    }
}

fwrite(STDOUT, "overlay-image tests passed\n");
