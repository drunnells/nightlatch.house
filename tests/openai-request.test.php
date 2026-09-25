<?php
require dirname(__DIR__) . '/app/openai.php';

function check($condition, $message) {
    if (!$condition) throw new RuntimeException($message);
}
function rejected($callback, $message) {
    try { $callback(); } catch (RuntimeException $expected) { return; }
    throw new RuntimeException($message);
}
$settings = nightlatch_openai_description_settings(array('api_key' => 'test-only-key', 'model' => 'configured-vision-model'));
check($settings['model'] === 'configured-vision-model', 'Respect the configured model.');
foreach (array(array(), array('api_key' => 'replace-with-openai-api-key'), array('api_key' => 'test-only-key'), array('api_key' => 'test-only-key', 'model' => 'openai-placeholder-model')) as $invalid) {
    rejected(function () use ($invalid) { nightlatch_openai_description_settings($invalid); }, 'Reject missing and placeholder settings.');
}
$request = nightlatch_openai_room_description_request($settings['model'], 'room-bytes', 'image/jpeg');
check($request['model'] === 'configured-vision-model', 'Request must use the configured model.');
check($request['input'][0]['content'][1]['image_url'] === 'data:image/jpeg;base64,' . base64_encode('room-bytes'), 'Attach actual image bytes.');
check($request['input'][0]['content'][1]['type'] === 'input_image' && $request['input'][0]['content'][0]['type'] === 'input_text', 'Use Responses content types.');
check($request['store'] === false && !isset($request['tools']), 'Descriptions must not enable image generation or response storage.');
check(strpos($request['instructions'], 'at most 40 words') !== false, 'Keep player descriptions short.');
check(strpos(json_encode($request), 'test-only-key') === false, 'Keep credentials out of the request body.');

$response = array('status' => 'completed', 'output' => array(
    array('type' => 'reasoning', 'summary' => array(array('text' => 'Never show this.'))),
    array('type' => 'message', 'role' => 'assistant', 'content' => array(
        array('type' => 'output_text', 'text' => "Moonlight falls across a dusty desk.\n"),
        array('type' => 'output_text', 'text' => 'A tall clock stands beside the door.'),
    )),
));
check(nightlatch_openai_room_description_text($response) === 'Moonlight falls across a dusty desk. A tall clock stands beside the door.', 'Only return assistant text with normalized whitespace.');
foreach (array('incomplete', 'failed', 'queued', 'in_progress') as $status) {
    $invalid = $response;
    $invalid['status'] = $status;
    rejected(function () use ($invalid) { nightlatch_openai_room_description_text($invalid); }, 'Reject partial responses.');
}
foreach (array(
    array(),
    array(array('type' => 'refusal', 'refusal' => 'Cannot describe.')),
    array(array('type' => 'output_text', 'text' => str_repeat('word ', 41))),
    array(array('type' => 'output_text', 'text' => '   ')),
    array(array('type' => 'output_text', 'text' => "\xFF")),
) as $content) {
    $invalid = $response;
    $invalid['output'][1]['content'] = $content;
    rejected(function () use ($invalid) { nightlatch_openai_room_description_text($invalid); }, 'Reject empty, refused, overlong, and malformed descriptions.');
}
foreach (array(400 => 'image inputs', 401 => 'ai.openai.api_key', 403 => 'permissions', 404 => 'configured model', 429 => 'rate limiting', 500 => 'temporarily unavailable') as $status => $expected) {
    $message = nightlatch_openai_description_error($status, array('error' => array('message' => 'test-only-key must never be reflected')));
    check(strpos($message, $expected) !== false && strpos($message, 'test-only-key') === false, 'Return a useful, secret-free API error.');
}
check(strpos(nightlatch_openai_description_error(429, array('error' => array('code' => 'insufficient_quota'))), 'quota is exhausted') !== false, 'Distinguish exhausted quota from rate limits.');
check(strpos(nightlatch_openai_description_error(502, null), 'temporarily unavailable') !== false, 'Handle non-JSON provider errors.');
fwrite(STDOUT, "openai-request tests passed\n");
