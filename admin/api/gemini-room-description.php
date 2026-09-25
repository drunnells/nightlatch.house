<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
require dirname(dirname(__DIR__)) . '/app/gemini.php';
require dirname(dirname(__DIR__)) . '/app/image.php';
nightlatch_require_admin(true);

try {
    nightlatch_verify_csrf();
    $payload = nightlatch_input_json();
    $source = nightlatch_reference_image(isset($payload['backgroundAsset']) ? $payload['backgroundAsset'] : '', 'rooms');
    $options = nightlatch_generated_image_options();
    $image = nightlatch_mobile_jpeg($source['bytes'], $options['maximumWidth'], $options['jpegQuality']);
    $config = nightlatch_config();
    $gemini = $config['ai']['google_gemini'];
    $apiKey = isset($gemini['api_key']) ? $gemini['api_key'] : '';
    $model = !empty($gemini['description_model']) ? $gemini['description_model'] : 'gemini-2.5-flash';
    if (!$apiKey || strpos($apiKey, 'replace-with-') === 0) {
        throw new RuntimeException('Configure the Gemini API key before generating a description.');
    }
    $curl = curl_init('https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent');
    curl_setopt_array($curl, array(
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_HTTPHEADER => array('Content-Type: application/json', 'x-goog-api-key: ' . $apiKey),
        CURLOPT_POSTFIELDS => json_encode(nightlatch_gemini_room_description_request($image['bytes'], 'image/jpeg')),
    ));
    $raw = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    if ($raw === false) throw new RuntimeException('Gemini could not be reached. Try again.');
    if ($status >= 400) throw new RuntimeException('Gemini could not generate the description. Check the configured description model and API access, then try again.');
    $response = json_decode($raw, true);
    if (!is_array($response)) throw new RuntimeException('Gemini returned an invalid response.');
    nightlatch_json(array('ok' => true, 'description' => nightlatch_gemini_room_description_text($response)));
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}
