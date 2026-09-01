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

$errorResult = array(
    'status' => 403,
    'body' => '<Error><Code>SignatureDoesNotMatch</Code><Message>The request signature does not match.</Message><RequestId>safe-request-id</RequestId><AWSAccessKeyId>must-not-appear</AWSAccessKeyId></Error>',
    'headers' => array(),
);
$errorDescription = nightlatch_storage_result_description($errorResult);
if ($errorDescription !== 'HTTP 403, SignatureDoesNotMatch: The request signature does not match. [request ID safe-request-id]'
    || strpos($errorDescription, 'must-not-appear') !== false) {
    fwrite(STDERR, "Storage errors were not summarized safely.\n");
    exit(1);
}

$data = array('regions' => array(array(
    'overlayLibrary' => array(array('asset' => 'rooms/foyer/overlays/one.png')),
    'logic' => array('branches' => array(array('actions' => array(
        array('type' => 'set_overlay', 'asset' => 'rooms/foyer/overlays/two.png'),
    )))),
)), 'book' => array(
    'enabled' => true,
    'pages' => array(array('asset' => 'rooms/foyer/overlays/book-page.png')),
));
$keys = nightlatch_content_storage_keys($key, $data);
sort($keys);
$expected = array($key, 'rooms/foyer/overlays/book-page.png', 'rooms/foyer/overlays/one.png', 'rooms/foyer/overlays/two.png');
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
if (nightlatch_asset_mime_type($localDemo) !== 'image/svg+xml') {
    fwrite(STDERR, "Default SVG room artwork was not normalized for storage.\n");
    exit(1);
}

if (extension_loaded('gd')) {
    $generatedJpeg = tempnam(sys_get_temp_dir(), 'nightlatch-storage-jpeg-');
    $image = imagecreatetruecolor(2, 2);
    imagefill($image, 0, 0, imagecolorallocate($image, 40, 60, 80));
    imageinterlace($image, true);
    imagejpeg($image, $generatedJpeg, 80);
    $generatedMime = nightlatch_asset_mime_type($generatedJpeg);
    @unlink($generatedJpeg);
    if ($generatedMime !== 'image/jpeg') {
        fwrite(STDERR, "Generated progressive JPEG assets were not normalized for storage.\n");
        exit(1);
    }
}

fwrite(STDOUT, "storage tests passed\n");
