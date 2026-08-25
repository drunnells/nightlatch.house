<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
require dirname(dirname(__DIR__)) . '/app/overlay-image.php';
nightlatch_require_admin(true);

try {
    nightlatch_verify_csrf();
    if (!extension_loaded('gd')) {
        throw new RuntimeException('Capturing a region overlay requires the PHP GD extension on the web server.');
    }

    $payload = nightlatch_input_json();
    $assetType = isset($payload['assetType']) ? $payload['assetType'] : 'rooms';
    if (!in_array($assetType, array('rooms', 'objects'), true)) {
        throw new RuntimeException('The image asset type is invalid.');
    }
    if (!isset($payload['backgroundAsset'], $payload['bounds'], $payload['canvas'])
        || !is_array($payload['bounds']) || !is_array($payload['canvas'])) {
        throw new RuntimeException('Select a valid region before capturing an overlay.');
    }

    $backgroundPath = nightlatch_local_content_asset_path($payload['backgroundAsset'], $assetType);
    $sourceInfo = getimagesize($backgroundPath);
    $supportedTypes = array(IMAGETYPE_PNG, IMAGETYPE_JPEG, IMAGETYPE_WEBP);
    if (!$sourceInfo || !in_array($sourceInfo[2], $supportedTypes, true)) {
        throw new RuntimeException('The background must be a PNG, JPG, or WebP image.');
    }
    if ($sourceInfo[0] > 8192 || $sourceInfo[1] > 8192 || ($sourceInfo[0] * $sourceInfo[1]) > 50000000) {
        throw new RuntimeException('The background is too large to capture safely.');
    }
    $sourceBytes = file_get_contents($backgroundPath);
    if ($sourceBytes === false) {
        throw new RuntimeException('The background image could not be read.');
    }
    $capture = nightlatch_capture_region_overlay($sourceBytes, $payload['bounds'], $payload['canvas']);

    $directory = NIGHTLATCH_ROOT . '/assets/graphics/' . $assetType . '/generated';
    if (!is_dir($directory) && !mkdir($directory, 0775, true)) {
        throw new RuntimeException('The generated asset directory could not be created.');
    }
    if (!is_writable($directory)) {
        throw new RuntimeException('The generated asset directory is not writable by the web server.');
    }
    $name = 'region-snapshot-' . date('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.png';
    if (file_put_contents($directory . '/' . $name, $capture['bytes'], LOCK_EX) === false) {
        throw new RuntimeException('The captured region overlay could not be stored.');
    }

    nightlatch_json(array(
        'ok' => true,
        'url' => '../assets/graphics/' . $assetType . '/generated/' . $name,
        'width' => $capture['width'],
        'height' => $capture['height'],
        'bytes' => strlen($capture['bytes']),
    ));
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}
