<?php

require dirname(__DIR__) . '/app/image.php';

$options = nightlatch_generated_image_options();
if ($options !== array('maximumWidth' => 1024, 'jpegQuality' => 80)) {
    fwrite(STDERR, "Generated image options are incorrect.\n");
    exit(1);
}

if (extension_loaded('gd')) {
    $source = imagecreatetruecolor(1600, 900);
    $color = imagecolorallocate($source, 42, 58, 61);
    imagefill($source, 0, 0, $color);
    ob_start();
    imagepng($source);
    $sourceBytes = ob_get_clean();
    nightlatch_destroy_image($source);

    $optimized = nightlatch_mobile_jpeg($sourceBytes, $options['maximumWidth'], $options['jpegQuality']);
    $info = getimagesizefromstring($optimized['bytes']);
    if (!$info || $info[0] !== 1024 || $info[1] !== 576 || $info[2] !== IMAGETYPE_JPEG) {
        fwrite(STDERR, "Mobile JPEG dimensions or format are incorrect.\n");
        exit(1);
    }
    if ($optimized['width'] !== 1024 || $optimized['height'] !== 576) {
        fwrite(STDERR, "Mobile JPEG metadata is incorrect.\n");
        exit(1);
    }
}

fwrite(STDOUT, "image tests passed\n");
