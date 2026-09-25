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
if ($generationConfig['imageConfig']['imageSize'] !== '1K') {
    fwrite(STDERR, "Unexpected Gemini image size.\n");
    exit(1);
}

$objectRequest = nightlatch_gemini_image_request('Create a puzzle box.', '1:1');
if ($objectRequest['generationConfig']['imageConfig']['aspectRatio'] !== '1:1') {
    fwrite(STDERR, "Object generation did not request a square image.\n");
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

$referencePrompt = nightlatch_gemini_object_reference_prompt('Make the painting frame slightly tarnished.');
if (strpos($referencePrompt, 'deliberately selected reference crop') === false
    || strpos($referencePrompt, 'Make the painting frame slightly tarnished.') === false
    || strpos($referencePrompt, 'END USER REQUEST') === false) {
    fwrite(STDERR, "Object reference prompt is incomplete.\n");
    exit(1);
}

$roomReference = nightlatch_gemini_image_edit_request(nightlatch_gemini_room_reference_prompt('Match the blue wallpaper.'), 'reference-bytes', 'image/png', '16:9');
if ($roomReference['generationConfig']['imageConfig']['aspectRatio'] !== '16:9'
    || base64_decode($roomReference['contents'][0]['parts'][1]['inlineData']['data']) !== 'reference-bytes'
    || strpos($roomReference['contents'][0]['parts'][0]['text'], 'Match the blue wallpaper.') === false) {
    throw new RuntimeException('Room references must preserve the author prompt, image, and landscape output.');
}
$descriptionRequest = nightlatch_gemini_room_description_request('room-bytes', 'image/jpeg');
if ($descriptionRequest['generationConfig']['responseModalities'] !== array('TEXT')
    || isset($descriptionRequest['generationConfig']['imageConfig'])
    || base64_decode($descriptionRequest['contents'][0]['parts'][1]['inlineData']['data']) !== 'room-bytes') {
    throw new RuntimeException('Room descriptions must send the artwork and request only text.');
}
$descriptionResponse = array('candidates' => array(array('finishReason' => 'STOP', 'content' => array('parts' => array(
    array('thought' => true, 'text' => 'Private reasoning must not appear.'),
    array('text' => "Moonlight falls across a dusty desk.\nA tall clock stands beside the door."),
)))));
if (nightlatch_gemini_room_description_text($descriptionResponse) !== 'Moonlight falls across a dusty desk. A tall clock stands beside the door.') {
    throw new RuntimeException('Descriptions must omit thought parts and normalize whitespace.');
}
$invalidResponses = array(array(), array('candidates' => array(array('finishReason' => 'SAFETY'))));
$tooLong = $descriptionResponse;
$tooLong['candidates'][0]['content']['parts'] = array(array('text' => str_repeat('word ', 41)));
$invalidResponses[] = $tooLong;
$truncated = $descriptionResponse;
$truncated['candidates'][0]['finishReason'] = 'MAX_TOKENS';
$invalidResponses[] = $truncated;
foreach ($invalidResponses as $invalid) {
    try {
        nightlatch_gemini_room_description_text($invalid);
    } catch (RuntimeException $exception) {
        continue;
    }
    throw new RuntimeException('Empty, blocked, truncated, and overlong descriptions must be rejected.');
}

fwrite(STDOUT, "gemini-request tests passed\n");
