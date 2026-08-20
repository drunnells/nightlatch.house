<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
require dirname(dirname(__DIR__)) . '/app/object-crop.php';
nightlatch_require_admin(true);

try {
    nightlatch_verify_csrf();
    $payload = nightlatch_input_json();
    if (!isset($payload['backgroundAsset'], $payload['canvas'], $payload['selection'])
        || !is_array($payload['canvas']) || !is_array($payload['selection'])) {
        throw new RuntimeException('Choose an object image and draw a crop selection first.');
    }
    $backgroundPath = nightlatch_local_content_asset_path($payload['backgroundAsset'], 'objects');
    $sourceInfo = getimagesize($backgroundPath);
    $supportedTypes = array(IMAGETYPE_PNG, IMAGETYPE_JPEG, IMAGETYPE_WEBP);
    if (!$sourceInfo || !in_array($sourceInfo[2], $supportedTypes, true)) {
        throw new RuntimeException('The object image must be a PNG, JPG, or WebP image.');
    }
    if ($sourceInfo[0] > 8192 || $sourceInfo[1] > 8192 || ($sourceInfo[0] * $sourceInfo[1]) > 50000000) {
        throw new RuntimeException('The object image is too large to crop safely.');
    }
    $sourceBytes = file_get_contents($backgroundPath);
    if ($sourceBytes === false) {
        throw new RuntimeException('The object image could not be read.');
    }
    $options = nightlatch_generated_image_options();
    $result = nightlatch_crop_object_image($sourceBytes, $payload['canvas'], $payload['selection'], $options['maximumWidth']);

    $directory = NIGHTLATCH_ROOT . '/assets/graphics/objects/generated';
    if (!is_dir($directory) && !mkdir($directory, 0775, true)) {
        throw new RuntimeException('The generated object asset directory could not be created.');
    }
    if (!is_writable($directory)) {
        throw new RuntimeException('The generated object asset directory is not writable by the web server.');
    }
    $name = 'crop-' . date('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.png';
    if (file_put_contents($directory . '/' . $name, $result['bytes'], LOCK_EX) === false) {
        throw new RuntimeException('The cropped object image could not be stored.');
    }

    nightlatch_json(array(
        'ok' => true,
        'url' => '../assets/graphics/objects/generated/' . $name,
        'width' => $result['width'],
        'height' => $result['height'],
        'bytes' => strlen($result['bytes']),
    ));
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}
