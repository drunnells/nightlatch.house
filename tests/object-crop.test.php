<?php

define('NIGHTLATCH_ROOT', dirname(__DIR__));
require dirname(__DIR__) . '/app/object-crop.php';

$rectangle = nightlatch_object_crop_spec(
    array('width' => 1000, 'height' => 500),
    array('mode' => 'rectangle', 'bounds' => array('x' => 100, 'y' => 50, 'width' => 400, 'height' => 200)),
    2000,
    1000,
    1024
);
if ($rectangle['sourceBox'] !== array('x' => 200, 'y' => 100, 'width' => 800, 'height' => 400)
    || $rectangle['width'] !== 800 || $rectangle['height'] !== 400) {
    fwrite(STDERR, "Rectangle crop mapping is incorrect.\n");
    exit(1);
}

$tall = nightlatch_object_crop_spec(
    array('width' => 100, 'height' => 2000),
    array('mode' => 'rectangle', 'bounds' => array('x' => 0, 'y' => 0, 'width' => 100, 'height' => 2000)),
    100,
    2000,
    1024
);
if ($tall['width'] !== 51 || $tall['height'] !== 1024) {
    fwrite(STDERR, "Tall crops were not constrained to the shared maximum dimension.\n");
    exit(1);
}

$lasso = nightlatch_object_crop_spec(
    array('width' => 100, 'height' => 100),
    array('mode' => 'lasso', 'points' => array(
        array('x' => 10, 'y' => 10),
        array('x' => 90, 'y' => 10),
        array('x' => 50, 'y' => 90),
    )),
    100,
    100,
    1024
);
if ($lasso['sourceBox'] !== array('x' => 10, 'y' => 10, 'width' => 80, 'height' => 80) || count($lasso['points']) !== 6) {
    fwrite(STDERR, "Lasso crop mapping is incorrect.\n");
    exit(1);
}

if (extension_loaded('gd')) {
    $source = imagecreatetruecolor(100, 100);
    $red = imagecolorallocate($source, 190, 30, 30);
    imagefill($source, 0, 0, $red);
    ob_start();
    imagepng($source);
    $sourceBytes = ob_get_clean();
    nightlatch_destroy_image($source);

    $result = nightlatch_crop_object_image(
        $sourceBytes,
        array('width' => 100, 'height' => 100),
        array('mode' => 'lasso', 'points' => array(
            array('x' => 10, 'y' => 10),
            array('x' => 90, 'y' => 10),
            array('x' => 50, 'y' => 90),
        )),
        1024
    );
    $cropped = imagecreatefromstring($result['bytes']);
    if (!$cropped || imagesx($cropped) !== 80 || imagesy($cropped) !== 80) {
        fwrite(STDERR, "Lasso crop output dimensions are incorrect.\n");
        exit(1);
    }
    $cornerAlpha = (imagecolorat($cropped, 0, 79) >> 24) & 0x7f;
    $centerAlpha = (imagecolorat($cropped, 40, 35) >> 24) & 0x7f;
    nightlatch_destroy_image($cropped);
    if ($cornerAlpha !== 127 || $centerAlpha === 127) {
        fwrite(STDERR, "Lasso crop transparency is incorrect.\n");
        exit(1);
    }
}

fwrite(STDOUT, "object-crop tests passed\n");
