<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
require dirname(dirname(__DIR__)) . '/app/gemini.php';
require dirname(dirname(__DIR__)) . '/app/overlay-image.php';
nightlatch_require_admin(true);

try {
    $outputKind = defined('NIGHTLATCH_REGION_EDIT_OUTPUT') ? NIGHTLATCH_REGION_EDIT_OUTPUT : 'overlay';
    if (!in_array($outputKind, array('overlay', 'background'), true)) {
        throw new RuntimeException('The region edit output type is invalid.');
    }
    nightlatch_verify_csrf();
    if (!extension_loaded('gd')) {
        throw new RuntimeException('Region image editing requires the PHP GD extension on the web server.');
    }

    $payload = nightlatch_input_json();
    $assetType = isset($payload['assetType']) ? $payload['assetType'] : 'rooms';
    if (!in_array($assetType, array('rooms', 'objects'), true)) {
        throw new RuntimeException('The image asset type is invalid.');
    }
    $prompt = trim(isset($payload['prompt']) ? $payload['prompt'] : '');
    if (strlen($prompt) < 3 || strlen($prompt) > 2000) {
        throw new RuntimeException('Enter an image edit prompt between 3 and 2,000 characters.');
    }
    if (isset($payload['referenceOverlayAsset']) && !is_string($payload['referenceOverlayAsset'])) {
        throw new RuntimeException('The reference overlay path is invalid.');
    }
    $referenceOverlayAsset = trim(isset($payload['referenceOverlayAsset']) ? $payload['referenceOverlayAsset'] : '');
    if (strlen($referenceOverlayAsset) > 2048) {
        throw new RuntimeException('The reference overlay path is too long.');
    }
    if (isset($payload['referenceContext']) && !is_string($payload['referenceContext'])) {
        throw new RuntimeException('The reference image context is invalid.');
    }
    $referenceContext = trim(isset($payload['referenceContext']) ? $payload['referenceContext'] : 'overlay');
    if (!in_array($referenceContext, array('overlay', 'book_page_current', 'book_page_previous'), true)) {
        throw new RuntimeException('The reference image context is unsupported.');
    }
    if (!$referenceOverlayAsset && isset($payload['referenceContext'])) {
        throw new RuntimeException('A reference image context requires a reference image.');
    }
    if ($referenceOverlayAsset && $outputKind !== 'overlay') {
        throw new RuntimeException('An overlay reference may only be used to generate another overlay.');
    }
    if (!$referenceOverlayAsset && (!isset($payload['backgroundAsset'], $payload['bounds'], $payload['canvas']) || !is_array($payload['bounds']) || !is_array($payload['canvas']))) {
        throw new RuntimeException('Select a valid region before generating an image edit.');
    }

    $referenceKind = $referenceOverlayAsset ? $referenceContext : 'region';
    $sourceAsset = $referenceOverlayAsset ? $referenceOverlayAsset : $payload['backgroundAsset'];
    $backgroundPath = nightlatch_local_content_asset_path($sourceAsset, $assetType);
    $sourceInfo = getimagesize($backgroundPath);
    $supportedTypes = array(IMAGETYPE_PNG, IMAGETYPE_JPEG, IMAGETYPE_WEBP);
    if (!$sourceInfo || !in_array($sourceInfo[2], $supportedTypes, true)) {
        throw new RuntimeException(($referenceOverlayAsset ? 'The reference overlay' : 'The background') . ' must be a PNG, JPG, or WebP image.');
    }
    if ($sourceInfo[0] > 8192 || $sourceInfo[1] > 8192 || ($sourceInfo[0] * $sourceInfo[1]) > 50000000) {
        throw new RuntimeException(($referenceOverlayAsset ? 'The reference overlay' : 'The background') . ' is too large to prepare safely.');
    }
    $sourceBytes = file_get_contents($backgroundPath);
    $sourceImage = $sourceBytes !== false ? imagecreatefromstring($sourceBytes) : false;
    if (!$sourceImage) {
        throw new RuntimeException(($referenceOverlayAsset ? 'The reference overlay' : 'The background') . ' must be a PNG, JPG, or WebP image that PHP GD can read.');
    }

    $sourceBox = $referenceOverlayAsset
        ? array('x' => 0, 'y' => 0, 'width' => imagesx($sourceImage), 'height' => imagesy($sourceImage))
        : nightlatch_region_source_box($payload['bounds'], $payload['canvas'], imagesx($sourceImage), imagesy($sourceImage));
    $spec = nightlatch_overlay_template_spec($sourceBox['width'], $sourceBox['height']);
    try {
        $templateBytes = nightlatch_create_overlay_template($sourceImage, $sourceBox, $spec);
    } finally {
        nightlatch_destroy_image($sourceImage);
    }

    $config = nightlatch_config();
    $gemini = $config['ai']['google_gemini'];
    $apiKey = isset($gemini['api_key']) ? $gemini['api_key'] : '';
    $model = isset($gemini['model']) ? $gemini['model'] : '';
    if (!$apiKey || strpos($apiKey, 'replace-with-') === 0 || !$model || strpos($model, 'placeholder') !== false) {
        throw new RuntimeException('Add a Gemini API key and image-capable model to the private local config first.');
    }

    $fullPrompt = nightlatch_overlay_edit_prompt($prompt, $spec, $referenceKind);
    $request = nightlatch_gemini_image_edit_request($fullPrompt, $templateBytes, 'image/png');
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
        $detail = isset($response['error']['message']) ? $response['error']['message'] : 'Gemini rejected the overlay request.';
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
        throw new RuntimeException('Gemini returned no edited image. Try a more specific image edit prompt.');
    }

    $generatedBytes = base64_decode($imagePart['data'], true);
    if ($generatedBytes === false) {
        throw new RuntimeException('Gemini returned invalid edited image data.');
    }
    $overlayBytes = nightlatch_extract_overlay_image($generatedBytes, $spec);
    $outputBytes = $overlayBytes;
    $outputWidth = $spec['outputWidth'];
    $outputHeight = $spec['outputHeight'];
    $namePrefix = 'overlay-';
    if ($outputKind === 'background') {
        $composited = nightlatch_composite_region_edit($sourceBytes, $overlayBytes, $sourceBox);
        $outputBytes = $composited['bytes'];
        $outputWidth = $composited['width'];
        $outputHeight = $composited['height'];
        $namePrefix = 'image-edit-';
    }

    $directory = NIGHTLATCH_ROOT . '/assets/graphics/' . $assetType . '/generated';
    if (!is_dir($directory) && !mkdir($directory, 0775, true)) {
        throw new RuntimeException('The generated asset directory could not be created.');
    }
    if (!is_writable($directory)) {
        throw new RuntimeException('The generated asset directory is not writable by the web server.');
    }
    $name = $namePrefix . date('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.jpg';
    if (file_put_contents($directory . '/' . $name, $outputBytes, LOCK_EX) === false) {
        throw new RuntimeException($outputKind === 'background' ? 'The edited background could not be stored.' : 'The generated overlay could not be stored.');
    }

    nightlatch_json(array(
        'ok' => true,
        'url' => '../assets/graphics/' . $assetType . '/generated/' . $name,
        'width' => $outputWidth,
        'height' => $outputHeight,
        'bytes' => strlen($outputBytes),
        'outputKind' => $outputKind,
        'referenceKind' => $referenceKind,
    ));
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}
