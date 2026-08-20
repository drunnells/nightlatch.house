<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
require dirname(dirname(__DIR__)) . '/app/gemini.php';
require dirname(dirname(__DIR__)) . '/app/image.php';
nightlatch_require_admin(true);

try {
    nightlatch_verify_csrf();
    $payload = nightlatch_input_json();
    $assetType = isset($payload['assetType']) ? $payload['assetType'] : 'rooms';
    if (!in_array($assetType, array('rooms', 'objects'), true)) {
        throw new RuntimeException('The image asset type is invalid.');
    }
    $prompt = trim(isset($payload['prompt']) ? $payload['prompt'] : '');
    if (strlen($prompt) < 12 || strlen($prompt) > 2000) {
        throw new RuntimeException('Enter an image prompt between 12 and 2,000 characters.');
    }

    $config = nightlatch_config();
    $gemini = $config['ai']['google_gemini'];
    $apiKey = isset($gemini['api_key']) ? $gemini['api_key'] : '';
    $model = isset($gemini['model']) ? $gemini['model'] : '';
    if (!$apiKey || strpos($apiKey, 'replace-with-') === 0 || !$model || strpos($model, 'placeholder') !== false) {
        throw new RuntimeException('Add a Gemini API key and image-capable model to the private local config first.');
    }

    $request = nightlatch_gemini_image_request($prompt);
    $url = 'https://generativelanguage.googleapis.com/v1/models/' . rawurlencode($model) . ':generateContent';
    $curl = curl_init($url);
    curl_setopt_array($curl, array(
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 180,
        CURLOPT_HTTPHEADER => array('Content-Type: application/json', 'x-goog-api-key: ' . $apiKey),
        CURLOPT_POSTFIELDS => json_encode($request),
    ));
    $raw = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);
    if ($raw === false || $curlError) {
        throw new RuntimeException('Gemini could not be reached: ' . $curlError);
    }
    $response = json_decode($raw, true);
    if ($status >= 400) {
        $detail = isset($response['error']['message']) ? $response['error']['message'] : 'Gemini rejected the request.';
        throw new RuntimeException($detail);
    }

    $parts = isset($response['candidates'][0]['content']['parts']) ? $response['candidates'][0]['content']['parts'] : array();
    $imagePart = null;
    foreach ($parts as $part) {
        if (isset($part['inlineData']['data'])) {
            $imagePart = $part['inlineData'];
            break;
        }
    }
    if (!$imagePart) {
        throw new RuntimeException('Gemini returned no image. Try a more visual prompt or a configured image model.');
    }

    $binary = base64_decode($imagePart['data'], true);
    if ($binary === false) {
        throw new RuntimeException('Gemini returned invalid image data.');
    }
    $imageOptions = nightlatch_generated_image_options();
    $optimized = nightlatch_mobile_jpeg($binary, $imageOptions['maximumWidth'], $imageOptions['jpegQuality']);
    $directory = NIGHTLATCH_ROOT . '/assets/graphics/' . $assetType . '/generated';
    if (!is_dir($directory) && !mkdir($directory, 0775, true)) {
        throw new RuntimeException('The generated asset directory could not be created.');
    }
    $name = date('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.jpg';
    if (file_put_contents($directory . '/' . $name, $optimized['bytes'], LOCK_EX) === false) {
        throw new RuntimeException('The generated image could not be stored.');
    }
    nightlatch_json(array(
        'ok' => true,
        'url' => '../assets/graphics/' . $assetType . '/generated/' . $name,
        'width' => $optimized['width'],
        'height' => $optimized['height'],
        'bytes' => strlen($optimized['bytes']),
    ));
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}
