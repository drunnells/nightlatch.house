<?php

require dirname(__DIR__) . '/app/gemini.php';

$request = nightlatch_gemini_image_request('Create a dark Victorian room.');
$generationConfig = $request['generationConfig'];

if (isset($generationConfig['responseFormat'])) {
    fwrite(STDERR, "Gemini image options must not use responseFormat enum fields.\n");
    exit(1);
}
if ($generationConfig['imageConfig']['aspectRatio'] !== '16:9') {
    fwrite(STDERR, "Unexpected Gemini aspect ratio.\n");
    exit(1);
}
if ($generationConfig['imageConfig']['imageSize'] !== '2K') {
    fwrite(STDERR, "Unexpected Gemini image size.\n");
    exit(1);
}

fwrite(STDOUT, "gemini-request tests passed\n");

