<?php

/**
 * Shared GD helpers for mobile-sized generated interactive artwork.
 */

function nightlatch_generated_image_options()
{
    return array(
        'maximumWidth' => 1024,
        'jpegQuality' => 80,
    );
}

function nightlatch_destroy_image($image)
{
    if (PHP_VERSION_ID < 80000 && is_resource($image)) {
        imagedestroy($image);
    }
}

function nightlatch_encode_jpeg_image($image, $quality)
{
    imageinterlace($image, true);
    ob_start();
    $encoded = imagejpeg($image, null, $quality);
    $bytes = ob_get_clean();
    if (!$encoded || $bytes === false || $bytes === '') {
        throw new RuntimeException('The optimized JPEG could not be encoded.');
    }
    return $bytes;
}

function nightlatch_mobile_jpeg($sourceBytes, $maximumWidth, $quality)
{
    if (!extension_loaded('gd')) {
        throw new RuntimeException('Generated image optimization requires the PHP GD extension on the web server.');
    }
    if ($maximumWidth < 1 || $quality < 1 || $quality > 100) {
        throw new RuntimeException('The generated image optimization settings are invalid.');
    }

    $source = imagecreatefromstring($sourceBytes);
    if (!$source) {
        throw new RuntimeException('The generated image could not be read by PHP GD.');
    }

    $sourceWidth = imagesx($source);
    $sourceHeight = imagesy($source);
    $targetWidth = min($sourceWidth, (int) $maximumWidth);
    $targetHeight = max(1, (int) round($sourceHeight * ($targetWidth / $sourceWidth)));
    $target = imagecreatetruecolor($targetWidth, $targetHeight);
    if (!$target) {
        nightlatch_destroy_image($source);
        throw new RuntimeException('The generated image could not be resized.');
    }

    $matte = imagecolorallocate($target, 8, 11, 12);
    imagefill($target, 0, 0, $matte);
    imagecopyresampled(
        $target,
        $source,
        0,
        0,
        0,
        0,
        $targetWidth,
        $targetHeight,
        $sourceWidth,
        $sourceHeight
    );

    try {
        $bytes = nightlatch_encode_jpeg_image($target, $quality);
    } finally {
        nightlatch_destroy_image($target);
        nightlatch_destroy_image($source);
    }

    return array(
        'bytes' => $bytes,
        'width' => $targetWidth,
        'height' => $targetHeight,
    );
}
