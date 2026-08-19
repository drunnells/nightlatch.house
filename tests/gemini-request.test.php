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

$editRequest = nightlatch_gemini_image_edit_request('Turn on the lamp.', 'png-bytes', 'image/png');
$editParts = $editRequest['contents'][0]['parts'];
if ($editParts[0]['text'] !== 'Turn on the lamp.') {
    fwrite(STDERR, "Unexpected Gemini edit prompt.\n");
    exit(1);
}
if ($editParts[1]['inlineData']['mimeType'] !== 'image/png' || base64_decode($editParts[1]['inlineData']['data']) !== 'png-bytes') {
    fwrite(STDERR, "Gemini edit request did not include the reference image.\n");
    exit(1);
}
if ($editRequest['generationConfig']['imageConfig']['aspectRatio'] !== '1:1' || $editRequest['generationConfig']['imageConfig']['imageSize'] !== '1K') {
    fwrite(STDERR, "Unexpected Gemini edit output dimensions.\n");
    exit(1);
}

fwrite(STDOUT, "gemini-request tests passed\n");
