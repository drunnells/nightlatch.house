<?php

require_once __DIR__ . '/overlay-image.php';

/**
 * Build a source-pixel and output-pixel crop specification for an object image.
 */
function nightlatch_object_crop_spec($canvas, $selection, $sourceWidth, $sourceHeight, $maximumWidth)
{
    if (!isset($canvas['width'], $canvas['height']) || !is_numeric($canvas['width']) || !is_numeric($canvas['height'])) {
        throw new RuntimeException('The crop canvas dimensions are invalid.');
    }
    $canvasWidth = (float) $canvas['width'];
    $canvasHeight = (float) $canvas['height'];
    if ($canvasWidth <= 0 || $canvasHeight <= 0 || $sourceWidth < 1 || $sourceHeight < 1 || $maximumWidth < 1) {
        throw new RuntimeException('The crop dimensions must be positive.');
    }

    $mode = isset($selection['mode']) ? $selection['mode'] : 'rectangle';
    if (!in_array($mode, array('rectangle', 'lasso'), true)) {
        throw new RuntimeException('Choose a rectangle or lasso crop.');
    }

    $canvasPoints = array();
    if ($mode === 'rectangle') {
        if (!isset($selection['bounds']) || !is_array($selection['bounds'])) {
            throw new RuntimeException('Draw a rectangle around the object first.');
        }
        $box = nightlatch_region_source_box($selection['bounds'], $canvas, $sourceWidth, $sourceHeight);
    } else {
        $points = isset($selection['points']) && is_array($selection['points']) ? $selection['points'] : array();
        if (count($points) < 3 || count($points) > 200) {
            throw new RuntimeException('A lasso crop requires between 3 and 200 points.');
        }
        $sourcePoints = array();
        foreach ($points as $point) {
            if (!is_array($point) || !isset($point['x'], $point['y']) || !is_numeric($point['x']) || !is_numeric($point['y'])
                || !is_finite((float) $point['x']) || !is_finite((float) $point['y'])) {
                throw new RuntimeException('The lasso contains an invalid point.');
            }
            $x = max(0, min($canvasWidth, (float) $point['x']));
            $y = max(0, min($canvasHeight, (float) $point['y']));
            $canvasPoints[] = array('x' => $x, 'y' => $y);
            $sourcePoints[] = array(
                'x' => $x / $canvasWidth * $sourceWidth,
                'y' => $y / $canvasHeight * $sourceHeight,
            );
        }
        $xs = array_map(function ($point) { return $point['x']; }, $sourcePoints);
        $ys = array_map(function ($point) { return $point['y']; }, $sourcePoints);
        $left = max(0, min($sourceWidth - 1, (int) floor(min($xs))));
        $top = max(0, min($sourceHeight - 1, (int) floor(min($ys))));
        $right = max($left + 1, min($sourceWidth, (int) ceil(max($xs))));
        $bottom = max($top + 1, min($sourceHeight, (int) ceil(max($ys))));
        $box = array('x' => $left, 'y' => $top, 'width' => $right - $left, 'height' => $bottom - $top);
    }

    if ($box['width'] < 2 || $box['height'] < 2) {
        throw new RuntimeException('The crop selection is too small.');
    }
    $targetScale = min(1, $maximumWidth / $box['width'], $maximumWidth / $box['height']);
    $targetWidth = max(1, (int) round($box['width'] * $targetScale));
    $targetHeight = max(1, (int) round($box['height'] * $targetScale));
    $targetPoints = array();
    if ($mode === 'lasso') {
        foreach ($canvasPoints as $point) {
            $sourceX = $point['x'] / $canvasWidth * $sourceWidth;
            $sourceY = $point['y'] / $canvasHeight * $sourceHeight;
            $targetPoints[] = max(0, min($targetWidth - 1, (int) round(($sourceX - $box['x']) / $box['width'] * $targetWidth)));
            $targetPoints[] = max(0, min($targetHeight - 1, (int) round(($sourceY - $box['y']) / $box['height'] * $targetHeight)));
        }
    }

    return array(
        'mode' => $mode,
        'sourceBox' => $box,
        'width' => $targetWidth,
        'height' => $targetHeight,
        'points' => $targetPoints,
    );
}

/**
 * Crop an object image. Lasso pixels outside the polygon become transparent.
 */
function nightlatch_crop_object_image($sourceBytes, $canvas, $selection, $maximumWidth)
{
    if (!extension_loaded('gd')) {
        throw new RuntimeException('Object cropping requires the PHP GD extension on the web server.');
    }
    $source = imagecreatefromstring($sourceBytes);
    if (!$source) {
        throw new RuntimeException('The source image could not be read by PHP GD.');
    }

    $spec = nightlatch_object_crop_spec($canvas, $selection, imagesx($source), imagesy($source), $maximumWidth);
    $target = imagecreatetruecolor($spec['width'], $spec['height']);
    if (!$target) {
        nightlatch_destroy_image($source);
        throw new RuntimeException('The cropped object image could not be created.');
    }
    imagealphablending($target, false);
    imagesavealpha($target, true);
    $transparent = imagecolorallocatealpha($target, 0, 0, 0, 127);
    imagefill($target, 0, 0, $transparent);
    $box = $spec['sourceBox'];
    imagecopyresampled(
        $target,
        $source,
        0,
        0,
        $box['x'],
        $box['y'],
        $spec['width'],
        $spec['height'],
        $box['width'],
        $box['height']
    );

    $mask = null;
    try {
        if ($spec['mode'] === 'lasso') {
            $mask = imagecreatetruecolor($spec['width'], $spec['height']);
            if (!$mask) {
                throw new RuntimeException('The lasso mask could not be created.');
            }
            $outside = imagecolorallocate($mask, 0, 0, 0);
            $inside = imagecolorallocate($mask, 255, 255, 255);
            imagefill($mask, 0, 0, $outside);
            if (PHP_VERSION_ID >= 80100) {
                imagefilledpolygon($mask, $spec['points'], $inside);
            } else {
                imagefilledpolygon($mask, $spec['points'], (int) (count($spec['points']) / 2), $inside);
            }
            for ($y = 0; $y < $spec['height']; $y++) {
                for ($x = 0; $x < $spec['width']; $x++) {
                    if ((imagecolorat($mask, $x, $y) & 0x00ffffff) === 0) {
                        imagesetpixel($target, $x, $y, $transparent);
                    }
                }
            }
        }

        ob_start();
        $encoded = imagepng($target, null, 6);
        $bytes = ob_get_clean();
        if (!$encoded || $bytes === false || $bytes === '') {
            throw new RuntimeException('The cropped PNG could not be encoded.');
        }
    } finally {
        if ($mask) {
            nightlatch_destroy_image($mask);
        }
        nightlatch_destroy_image($target);
        nightlatch_destroy_image($source);
    }

    return array(
        'bytes' => $bytes,
        'width' => $spec['width'],
        'height' => $spec['height'],
        'sourceBox' => $spec['sourceBox'],
    );
}
