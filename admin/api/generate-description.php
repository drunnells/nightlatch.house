<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
require dirname(dirname(__DIR__)) . '/app/openai.php';
require dirname(dirname(__DIR__)) . '/app/image.php';
nightlatch_require_admin(true);

try {
    nightlatch_verify_csrf();
    $payload = nightlatch_input_json();
    $kind = isset($payload['kind']) ? $payload['kind'] : 'room';
    if (!is_string($kind) || !in_array($kind, array('room', 'object', 'book_page'), true)) {
        throw new RuntimeException('Unsupported description subject.');
    }
    $config = nightlatch_config();
    $openai = nightlatch_openai_description_settings(isset($config['ai']['openai']) ? $config['ai']['openai'] : array());
    $source = nightlatch_reference_image(isset($payload['backgroundAsset']) ? $payload['backgroundAsset'] : '', $kind === 'room' ? 'rooms' : 'objects');
    $options = nightlatch_generated_image_options();
    $image = nightlatch_mobile_jpeg($source['bytes'], $options['maximumWidth'], $options['jpegQuality']);
    $curl = curl_init('https://api.openai.com/v1/responses');
    curl_setopt_array($curl, array(
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_HTTPHEADER => array('Content-Type: application/json', 'Authorization: Bearer ' . $openai['api_key']),
        CURLOPT_POSTFIELDS => json_encode(nightlatch_openai_description_request($openai['model'], $image['bytes'], 'image/jpeg', $kind)),
    ));
    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    if ($raw === false) throw new RuntimeException('OpenAI could not be reached. Try again.');
    $response = json_decode($raw, true);
    if ($status >= 400) throw new RuntimeException(nightlatch_openai_description_error($status, $response));
    if (!is_array($response)) throw new RuntimeException('OpenAI returned an invalid response.');
    nightlatch_json(array('ok' => true, 'description' => nightlatch_openai_description_text($response)));
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}
