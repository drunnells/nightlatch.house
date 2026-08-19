<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
nightlatch_require_admin(true);

try {
    nightlatch_verify_csrf();
    $payload = nightlatch_input_json();
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

    $request = array(
        'contents' => array(array('parts' => array(array('text' => $prompt)))),
        'generationConfig' => array(
            'responseModalities' => array('IMAGE'),
            'responseFormat' => array('image' => array('aspectRatio' => '16:9', 'imageSize' => '2K')),
        ),
    );
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

    $mime = isset($imagePart['mimeType']) ? $imagePart['mimeType'] : 'image/png';
    $extension = $mime === 'image/jpeg' ? 'jpg' : ($mime === 'image/webp' ? 'webp' : 'png');
    $binary = base64_decode($imagePart['data'], true);
    if ($binary === false) {
        throw new RuntimeException('Gemini returned invalid image data.');
    }
    $directory = NIGHTLATCH_ROOT . '/assets/graphics/rooms/generated';
    if (!is_dir($directory) && !mkdir($directory, 0775, true)) {
        throw new RuntimeException('The generated asset directory could not be created.');
    }
    $name = date('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.' . $extension;
    if (file_put_contents($directory . '/' . $name, $binary, LOCK_EX) === false) {
        throw new RuntimeException('The generated image could not be stored.');
    }
    nightlatch_json(array('ok' => true, 'url' => '../assets/graphics/rooms/generated/' . $name));
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}

