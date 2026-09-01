<?php

/**
 * DigitalOcean Spaces / S3-compatible storage helpers.
 *
 * Saved content stores object keys. Browser payloads resolve those keys through
 * the configured CDN base URL, while server-side image tools download objects
 * into request-scoped temporary files when GD needs a local path.
 */

function nightlatch_storage_settings()
{
    $config = function_exists('nightlatch_config') ? nightlatch_config() : array();
    $s3 = isset($config['s3']) && is_array($config['s3']) ? $config['s3'] : array();
    return array(
        'endpoint' => rtrim(isset($s3['s3_endpoint']) ? trim((string) $s3['s3_endpoint']) : '', '/'),
        'objectBaseUrl' => rtrim(isset($s3['s3_object_baseurl']) ? trim((string) $s3['s3_object_baseurl']) : '', '/'),
        'bucket' => isset($s3['s3_bucket']) ? trim((string) $s3['s3_bucket']) : '',
        'region' => isset($s3['s3_region']) ? trim((string) $s3['s3_region']) : '',
        'accessKey' => isset($s3['s3_key']) ? trim((string) $s3['s3_key']) : '',
        'secretKey' => isset($s3['s3_secret']) ? trim((string) $s3['s3_secret']) : '',
        'acl' => isset($s3['s3_acl']) ? trim((string) $s3['s3_acl']) : 'public-read',
    );
}

function nightlatch_require_storage_settings()
{
    $settings = nightlatch_storage_settings();
    foreach (array('endpoint', 'objectBaseUrl', 'bucket', 'region', 'accessKey', 'secretKey') as $key) {
        if ($settings[$key] === '' || strpos($settings[$key], 'replace-with-') === 0) {
            throw new RuntimeException('DigitalOcean Spaces storage is not configured. Complete the s3 settings in the private config.');
        }
    }
    $endpointHost = strtolower((string) parse_url($settings['endpoint'], PHP_URL_HOST));
    if (strtolower((string) parse_url($settings['endpoint'], PHP_URL_SCHEME)) !== 'https'
        || $endpointHost === '') {
        throw new RuntimeException('The configured S3 endpoint must be a complete HTTPS URL.');
    }
    if (strpos($endpointHost, '.cdn.digitaloceanspaces.com') !== false) {
        throw new RuntimeException('The configured S3 endpoint is a CDN URL. Use the regional Spaces origin endpoint for uploads.');
    }
    if (strtolower((string) parse_url($settings['objectBaseUrl'], PHP_URL_SCHEME)) !== 'https'
        || (string) parse_url($settings['objectBaseUrl'], PHP_URL_HOST) === '') {
        throw new RuntimeException('The configured S3 object base URL must be a complete HTTPS URL.');
    }
    if (!function_exists('curl_init')) throw new RuntimeException('DigitalOcean Spaces storage requires PHP cURL.');
    return $settings;
}

function nightlatch_storage_validate_key($key)
{
    $key = ltrim((string) $key, '/');
    if ($key === '' || strlen($key) > 900 || strpos($key, "\0") !== false || strpos('/' . $key . '/', '/../') !== false) {
        throw new RuntimeException('The stored asset key is invalid.');
    }
    if (!preg_match('#^(rooms|objects|sounds)/[A-Za-z0-9._~!$&\'()*+,;=:@%/-]+$#', $key)) {
        throw new RuntimeException('The stored asset key is invalid.');
    }
    return $key;
}

function nightlatch_storage_is_key($value)
{
    if (!is_string($value) || !preg_match('#^(rooms|objects|sounds)/#', $value)) return false;
    try {
        nightlatch_storage_validate_key($value);
        return true;
    } catch (Throwable $exception) {
        return false;
    }
}

function nightlatch_storage_encode_key($key)
{
    $segments = explode('/', nightlatch_storage_validate_key($key));
    foreach ($segments as $index => $segment) {
        $segments[$index] = rawurlencode(rawurldecode($segment));
    }
    return implode('/', $segments);
}

function nightlatch_storage_key_from_reference($reference, $settings = null)
{
    $reference = trim((string) $reference);
    if ($reference === '') return '';
    if (nightlatch_storage_is_key($reference)) return nightlatch_storage_validate_key($reference);

    if ($settings === null) $settings = nightlatch_storage_settings();
    $base = isset($settings['objectBaseUrl']) ? rtrim((string) $settings['objectBaseUrl'], '/') : '';
    if ($base === '') return '';

    $referenceParts = parse_url($reference);
    $baseParts = parse_url($base);
    if (!is_array($referenceParts) || !is_array($baseParts)
        || empty($referenceParts['host']) || empty($baseParts['host'])
        || strtolower($referenceParts['host']) !== strtolower($baseParts['host'])) {
        return '';
    }
    $referencePath = isset($referenceParts['path']) ? rawurldecode($referenceParts['path']) : '';
    $basePath = isset($baseParts['path']) ? rtrim(rawurldecode($baseParts['path']), '/') : '';
    if ($basePath !== '' && strpos($referencePath, $basePath . '/') !== 0) return '';
    $key = ltrim(substr($referencePath, strlen($basePath)), '/');
    return nightlatch_storage_is_key($key) ? nightlatch_storage_validate_key($key) : '';
}

function nightlatch_storage_public_url($reference, $settings = null)
{
    $reference = trim((string) $reference);
    if ($reference === '' || !nightlatch_storage_is_key($reference)) return $reference;
    if ($settings === null) $settings = nightlatch_storage_settings();
    $base = isset($settings['objectBaseUrl']) ? rtrim((string) $settings['objectBaseUrl'], '/') : '';
    if ($base === '') {
        throw new RuntimeException('The S3 CDN base URL is not configured.');
    }
    return $base . '/' . nightlatch_storage_encode_key($reference);
}

function nightlatch_storage_request_target($key, $settings)
{
    $parts = parse_url($settings['endpoint']);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        throw new RuntimeException('The configured S3 endpoint is invalid.');
    }
    $host = $parts['host'];
    if (strpos(strtolower($host), strtolower($settings['bucket']) . '.') !== 0) {
        $host = $settings['bucket'] . '.' . $host;
    }
    $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';
    $hostHeader = $host . $port;
    $basePath = isset($parts['path']) ? '/' . trim($parts['path'], '/') : '';
    if ($basePath === '/') $basePath = '';
    $canonicalUri = $basePath . '/' . nightlatch_storage_encode_key($key);
    return array(
        'host' => $hostHeader,
        'canonicalUri' => $canonicalUri,
        'url' => $parts['scheme'] . '://' . $hostHeader . $canonicalUri,
    );
}

function nightlatch_storage_request($method, $key, $body, $contentType)
{
    $settings = nightlatch_require_storage_settings();
    $key = nightlatch_storage_validate_key($key);
    $method = strtoupper((string) $method);
    $body = (string) $body;
    $target = nightlatch_storage_request_target($key, $settings);
    $amzDate = gmdate('Ymd\THis\Z');
    $shortDate = substr($amzDate, 0, 8);
    $payloadHash = hash('sha256', $body);
    $headersToSign = array(
        'host' => $target['host'],
        'x-amz-content-sha256' => $payloadHash,
        'x-amz-date' => $amzDate,
    );
    if ($method === 'PUT' && $settings['acl'] !== '') {
        $headersToSign['x-amz-acl'] = $settings['acl'];
    }
    ksort($headersToSign);
    $canonicalHeaders = '';
    foreach ($headersToSign as $name => $value) {
        $canonicalHeaders .= $name . ':' . trim($value) . "\n";
    }
    $signedHeaders = implode(';', array_keys($headersToSign));
    $canonicalRequest = $method . "\n" . $target['canonicalUri'] . "\n\n"
        . $canonicalHeaders . "\n" . $signedHeaders . "\n" . $payloadHash;
    $scope = $shortDate . '/' . $settings['region'] . '/s3/aws4_request';
    $stringToSign = "AWS4-HMAC-SHA256\n" . $amzDate . "\n" . $scope . "\n" . hash('sha256', $canonicalRequest);
    $dateKey = hash_hmac('sha256', $shortDate, 'AWS4' . $settings['secretKey'], true);
    $regionKey = hash_hmac('sha256', $settings['region'], $dateKey, true);
    $serviceKey = hash_hmac('sha256', 's3', $regionKey, true);
    $signingKey = hash_hmac('sha256', 'aws4_request', $serviceKey, true);
    $signature = hash_hmac('sha256', $stringToSign, $signingKey);
    $authorization = 'AWS4-HMAC-SHA256 Credential=' . $settings['accessKey'] . '/' . $scope
        . ', SignedHeaders=' . $signedHeaders . ', Signature=' . $signature;

    $headers = array(
        'Authorization: ' . $authorization,
        'Host: ' . $target['host'],
        'x-amz-content-sha256: ' . $payloadHash,
        'x-amz-date: ' . $amzDate,
    );
    if ($method === 'PUT' && $settings['acl'] !== '') $headers[] = 'x-amz-acl: ' . $settings['acl'];
    if ($contentType !== '') $headers[] = 'Content-Type: ' . $contentType;

    $responseHeaders = array();
    $curl = curl_init($target['url']);
    curl_setopt_array($curl, array(
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 180,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_HEADERFUNCTION => function ($curlHandle, $headerLine) use (&$responseHeaders) {
            $length = strlen($headerLine);
            $separator = strpos($headerLine, ':');
            if ($separator === false) return $length;
            $name = strtolower(trim(substr($headerLine, 0, $separator)));
            $value = trim(substr($headerLine, $separator + 1));
            if ($name !== '') $responseHeaders[$name] = $value;
            return $length;
        },
    ));
    if ($method === 'PUT') curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
    $responseBody = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);
    if ($responseBody === false || $curlError !== '') {
        throw new RuntimeException('The asset storage service could not be reached.');
    }
    return array('status' => $status, 'body' => $responseBody, 'headers' => $responseHeaders);
}

function nightlatch_storage_xml_error_value($body, $tag)
{
    $body = (string) $body;
    $tag = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $tag);
    if ($body === '' || $tag === '') return '';
    if (!preg_match('#<' . $tag . '>(.*?)</' . $tag . '>#s', $body, $matches)) return '';
    $value = html_entity_decode(strip_tags($matches[1]), ENT_QUOTES | ENT_XML1, 'UTF-8');
    $value = trim((string) preg_replace('/[\x00-\x1F\x7F]+/', ' ', $value));
    return strlen($value) > 500 ? substr($value, 0, 497) . '...' : $value;
}

function nightlatch_storage_result_description($result)
{
    $status = isset($result['status']) ? (int) $result['status'] : 0;
    $body = isset($result['body']) ? (string) $result['body'] : '';
    $headers = isset($result['headers']) && is_array($result['headers']) ? $result['headers'] : array();
    $code = nightlatch_storage_xml_error_value($body, 'Code');
    $message = nightlatch_storage_xml_error_value($body, 'Message');
    $requestId = nightlatch_storage_xml_error_value($body, 'RequestId');
    if ($requestId === '' && isset($headers['x-amz-request-id'])) $requestId = trim((string) $headers['x-amz-request-id']);

    $description = 'HTTP ' . $status;
    if ($code !== '') $description .= ', ' . $code;
    if ($message !== '') $description .= ': ' . $message;
    if ($requestId !== '') $description .= ' [request ID ' . $requestId . ']';
    return $description;
}

function nightlatch_storage_put_bytes($key, $bytes, $mimeType)
{
    $result = nightlatch_storage_request('PUT', $key, $bytes, $mimeType);
    if ($result['status'] < 200 || $result['status'] >= 300) {
        throw new RuntimeException('The asset could not be uploaded to DigitalOcean Spaces (' . nightlatch_storage_result_description($result) . ').');
    }
    return nightlatch_storage_validate_key($key);
}

function nightlatch_storage_get_bytes($key)
{
    $result = nightlatch_storage_request('GET', $key, '', '');
    if ($result['status'] < 200 || $result['status'] >= 300) {
        throw new RuntimeException('The saved asset could not be downloaded from DigitalOcean Spaces (' . nightlatch_storage_result_description($result) . ').');
    }
    return $result['body'];
}

function nightlatch_storage_delete($key)
{
    $result = nightlatch_storage_request('DELETE', $key, '', '');
    if (($result['status'] < 200 || $result['status'] >= 300) && $result['status'] !== 404) {
        throw new RuntimeException('The asset could not be deleted from DigitalOcean Spaces (' . nightlatch_storage_result_description($result) . ').');
    }
}

function nightlatch_local_content_asset_file($assetUrl, $assetType)
{
    if (!in_array($assetType, array('rooms', 'objects'), true)) {
        throw new RuntimeException('The image asset type is invalid.');
    }
    if (!is_string($assetUrl)) {
        throw new RuntimeException('The background asset is invalid.');
    }
    $urlPath = parse_url($assetUrl, PHP_URL_PATH);
    if (!is_string($urlPath) || $urlPath === '') return '';
    $urlPath = str_replace('\\', '/', rawurldecode($urlPath));
    $marker = '/assets/graphics/' . $assetType . '/';
    $searchPath = '/' . ltrim($urlPath, '/');
    $position = strpos($searchPath, $marker);
    if ($position === false) return '';
    $relative = substr($searchPath, $position + strlen($marker));
    if ($relative === '' || strpos('/' . $relative . '/', '/../') !== false || strpos($relative, "\0") !== false) {
        throw new RuntimeException('The background path is invalid.');
    }
    $assetRoot = realpath(NIGHTLATCH_ROOT . '/assets/graphics/' . $assetType);
    if (!$assetRoot) throw new RuntimeException('The asset directory could not be found on this server.');
    $candidate = realpath($assetRoot . '/' . $relative);
    if (!$candidate || strpos($candidate, $assetRoot . DIRECTORY_SEPARATOR) !== 0 || !is_file($candidate)) return '';
    return $candidate;
}

function nightlatch_local_content_asset_path($assetUrl, $assetType)
{
    $localPath = nightlatch_local_content_asset_file($assetUrl, $assetType);
    if ($localPath !== '') return $localPath;

    $key = nightlatch_storage_key_from_reference($assetUrl);
    $requiredPrefix = $assetType . '/';
    if ($key === '' || strpos($key, $requiredPrefix) !== 0) {
        throw new RuntimeException('The background must be a saved ' . rtrim($assetType, 's') . ' image.');
    }
    $bytes = nightlatch_storage_get_bytes($key);
    if ($bytes === '' || strlen($bytes) > 30 * 1024 * 1024) {
        throw new RuntimeException('The saved image is empty or too large to edit safely.');
    }
    $temporaryPath = tempnam(sys_get_temp_dir(), 'nightlatch-image-');
    if ($temporaryPath === false || file_put_contents($temporaryPath, $bytes, LOCK_EX) === false) {
        throw new RuntimeException('A temporary image file could not be prepared.');
    }
    register_shutdown_function(function () use ($temporaryPath) {
        if (is_file($temporaryPath)) @unlink($temporaryPath);
    });
    return $temporaryPath;
}

function nightlatch_local_temporary_asset_directories()
{
    return array(
        'assets/graphics/rooms/uploads' => NIGHTLATCH_ROOT . '/assets/graphics/rooms/uploads',
        'assets/graphics/rooms/generated' => NIGHTLATCH_ROOT . '/assets/graphics/rooms/generated',
        'assets/graphics/objects/uploads' => NIGHTLATCH_ROOT . '/assets/graphics/objects/uploads',
        'assets/graphics/objects/generated' => NIGHTLATCH_ROOT . '/assets/graphics/objects/generated',
        'assets/sounds/uploads' => NIGHTLATCH_ROOT . '/assets/sounds/uploads',
    );
}

function nightlatch_local_temporary_asset_relative_path($path)
{
    $realPath = realpath((string) $path);
    if ($realPath === false || !is_file($realPath)) return '';
    foreach (nightlatch_local_temporary_asset_directories() as $relativeDirectory => $directory) {
        $realDirectory = realpath($directory);
        if ($realDirectory === false || strpos($realPath, $realDirectory . DIRECTORY_SEPARATOR) !== 0) continue;
        $relative = ltrim(substr($realPath, strlen($realDirectory)), DIRECTORY_SEPARATOR);
        if ($relative === '' || basename($relative) === '.gitkeep') return '';
        return $relativeDirectory . '/' . str_replace(DIRECTORY_SEPARATOR, '/', $relative);
    }
    return '';
}

function nightlatch_local_temporary_asset_file($reference)
{
    if (!is_string($reference) || trim($reference) === '') return '';
    $urlPath = parse_url($reference, PHP_URL_PATH);
    if (!is_string($urlPath) || $urlPath === '') return '';
    $urlPath = '/' . ltrim(str_replace('\\', '/', rawurldecode($urlPath)), '/');
    foreach (nightlatch_local_temporary_asset_directories() as $relativeDirectory => $directory) {
        $marker = '/' . $relativeDirectory . '/';
        $position = strpos($urlPath, $marker);
        if ($position === false) continue;
        $relative = substr($urlPath, $position + strlen($marker));
        if ($relative === '' || strpos('/' . $relative . '/', '/../') !== false || strpos($relative, "\0") !== false) return '';
        $root = realpath($directory);
        if ($root === false) return '';
        $candidatePath = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
        if (!file_exists($candidatePath)) return $candidatePath;
        $candidate = realpath($candidatePath);
        if ($candidate === false || strpos($candidate, $root . DIRECTORY_SEPARATOR) !== 0 || !is_file($candidate)) return '';
        return $candidate;
    }
    return '';
}

function nightlatch_collect_interactive_local_asset_files($value, &$files, $insideOverlayLibrary = false)
{
    if (!is_array($value)) return;
    foreach ($value as $key => $child) {
        $isOverlayLibrary = $insideOverlayLibrary || $key === 'overlayLibrary';
        if (($key === 'asset' && is_string($child)) || ($insideOverlayLibrary && is_int($key) && is_string($child))) {
            $path = nightlatch_local_temporary_asset_file($child);
            if ($path !== '') $files[$path] = true;
        } elseif (is_array($child)) {
            nightlatch_collect_interactive_local_asset_files($child, $files, $isOverlayLibrary);
        }
    }
}

function nightlatch_content_local_asset_files($backgroundAsset, $data)
{
    $files = array();
    $backgroundPath = nightlatch_local_temporary_asset_file($backgroundAsset);
    if ($backgroundPath !== '') $files[$backgroundPath] = true;
    nightlatch_collect_interactive_local_asset_files($data, $files);
    return $files;
}

function nightlatch_database_local_asset_files(PDO $pdo)
{
    $files = array();
    foreach ($pdo->query('SELECT background_asset, room_data FROM rooms')->fetchAll() as $row) {
        $files += nightlatch_content_local_asset_files(
            $row['background_asset'],
            nightlatch_interactive_content_data($row['room_data'])
        );
    }
    foreach ($pdo->query('SELECT background_asset, object_data FROM objects')->fetchAll() as $row) {
        $files += nightlatch_content_local_asset_files(
            $row['background_asset'],
            nightlatch_interactive_content_data($row['object_data'])
        );
    }
    foreach ($pdo->query('SELECT asset_path FROM sounds')->fetchAll() as $row) {
        $path = nightlatch_local_temporary_asset_file($row['asset_path']);
        if ($path !== '') $files[$path] = true;
    }
    return $files;
}

function nightlatch_scan_local_temporary_assets()
{
    $files = array();
    foreach (nightlatch_local_temporary_asset_directories() as $directory) {
        if (!is_dir($directory)) continue;
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $file) {
            if (!$file->isFile() || $file->isLink() || $file->getFilename() === '.gitkeep') continue;
            $path = $file->getRealPath();
            $relativePath = nightlatch_local_temporary_asset_relative_path($path);
            if ($path === false || $relativePath === '') continue;
            $files[$path] = array(
                'path' => $path,
                'relativePath' => $relativePath,
                'size' => (int) $file->getSize(),
                'modifiedAt' => (int) $file->getMTime(),
            );
        }
    }
    ksort($files);
    return $files;
}

function nightlatch_delete_local_temporary_asset_files($paths, $referencedFiles = array(), $minimumAgeSeconds = 0)
{
    $report = array(
        'deleted' => array(),
        'missing' => array(),
        'referenced' => array(),
        'young' => array(),
        'invalid' => array(),
        'failed' => array(),
    );
    $minimumAgeSeconds = max(0, (int) $minimumAgeSeconds);
    foreach (array_values(array_unique($paths)) as $path) {
        $path = (string) $path;
        if (!is_file($path)) {
            $report['missing'][] = $path;
            continue;
        }
        $realPath = realpath($path);
        $relativePath = nightlatch_local_temporary_asset_relative_path($realPath);
        if ($realPath === false || $relativePath === '') {
            $report['invalid'][] = $path;
            continue;
        }
        if (isset($referencedFiles[$realPath])) {
            $report['referenced'][] = $relativePath;
            continue;
        }
        $modifiedAt = filemtime($realPath);
        if ($minimumAgeSeconds > 0 && $modifiedAt !== false && time() - $modifiedAt < $minimumAgeSeconds) {
            $report['young'][] = $relativePath;
            continue;
        }
        if (@unlink($realPath)) {
            $report['deleted'][] = $relativePath;
        } else {
            $report['failed'][] = $relativePath;
        }
    }
    return $report;
}

function nightlatch_asset_mime_type($path)
{
    // Generated backgrounds are progressive JPEGs. Some MIME databases label
    // them image/pjpeg even though they are ordinary JPEG files, so identify
    // supported raster assets from their image data before asking finfo about
    // SVG and audio assets.
    $imageInfo = @getimagesize($path);
    if (is_array($imageInfo) && isset($imageInfo[2])) {
        $rasterMimeTypes = array(
            IMAGETYPE_PNG => 'image/png',
            IMAGETYPE_JPEG => 'image/jpeg',
            IMAGETYPE_WEBP => 'image/webp',
        );
        $imageType = (int) $imageInfo[2];
        if (isset($rasterMimeTypes[$imageType])) return $rasterMimeTypes[$imageType];
    }
    // The default editor artwork is SVG. Some production MIME databases report
    // SVG files as plain text, so recognize SVG markup directly and keep its
    // stored content type consistent.
    $svgSource = @file_get_contents($path, false, null, 0, 65536);
    if (is_string($svgSource) && preg_match('/<svg(?:\\s|>)/i', $svgSource)) return 'image/svg+xml';
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string) $finfo->file($path);
    $allowed = array(
        'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
        'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
        'audio/ogg', 'application/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/webm',
    );
    if (!in_array($mime, $allowed, true)) throw new RuntimeException('The local asset type is not supported for storage.');
    return $mime;
}

function nightlatch_storage_unique_key($root, $slug, $category, $sourcePath)
{
    $extension = strtolower(pathinfo($sourcePath, PATHINFO_EXTENSION));
    if ($extension === 'jpeg') $extension = 'jpg';
    if (!preg_match('/^[a-z0-9]{2,5}$/', $extension)) $extension = 'bin';
    return nightlatch_storage_validate_key(
        $root . '/' . nightlatch_slug($slug) . '/' . $category . '/'
        . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.' . $extension
    );
}

function nightlatch_promote_content_reference($reference, $assetType, $slug, $category, &$replacements, &$localFiles)
{
    $reference = trim((string) $reference);
    if ($reference === '') return '';
    if (isset($replacements[$reference])) return $replacements[$reference];
    $key = nightlatch_storage_key_from_reference($reference);
    if ($key !== '') {
        if (strpos($key, $assetType . '/') !== 0) throw new RuntimeException('The saved image belongs to a different content type.');
        return $key;
    }
    $localPath = nightlatch_local_content_asset_file($reference, $assetType);
    if ($localPath === '') throw new RuntimeException('Every saved image must be a local editor asset or a configured Spaces asset.');
    $mime = nightlatch_asset_mime_type($localPath);
    if (strpos($mime, 'image/') !== 0) throw new RuntimeException('Room and object graphics must be image files.');
    $bytes = file_get_contents($localPath);
    if ($bytes === false) throw new RuntimeException('A local image could not be read for upload.');
    $key = nightlatch_storage_unique_key($assetType, $slug, $category, $localPath);
    nightlatch_storage_put_bytes($key, $bytes, $mime);
    $replacements[$reference] = $key;
    $localFiles[$localPath] = true;
    return $key;
}

function nightlatch_transform_interactive_assets($value, $assetType, $slug, &$replacements, &$localFiles, $insideOverlayLibrary = false)
{
    if (!is_array($value)) return $value;
    $result = array();
    foreach ($value as $key => $child) {
        $isOverlayLibrary = $insideOverlayLibrary || $key === 'overlayLibrary';
        if (($key === 'asset' && is_string($child)) || ($insideOverlayLibrary && is_int($key) && is_string($child))) {
            $result[$key] = nightlatch_promote_content_reference($child, $assetType, $slug, 'overlays', $replacements, $localFiles);
        } elseif (is_array($child)) {
            $result[$key] = nightlatch_transform_interactive_assets($child, $assetType, $slug, $replacements, $localFiles, $isOverlayLibrary);
        } else {
            $result[$key] = $child;
        }
    }
    return $result;
}

function nightlatch_promote_content_assets($backgroundAsset, $data, $assetType, $slug, &$replacements, &$localFiles)
{
    $backgroundKey = nightlatch_promote_content_reference($backgroundAsset, $assetType, $slug, 'backgrounds', $replacements, $localFiles);
    $storedData = nightlatch_transform_interactive_assets($data, $assetType, $slug, $replacements, $localFiles);
    return array('backgroundAsset' => $backgroundKey, 'data' => $storedData);
}

function nightlatch_resolve_interactive_asset_urls($value, $insideOverlayLibrary = false)
{
    if (!is_array($value)) return $value;
    $result = array();
    foreach ($value as $key => $child) {
        $isOverlayLibrary = $insideOverlayLibrary || $key === 'overlayLibrary';
        if (($key === 'asset' && is_string($child)) || ($insideOverlayLibrary && is_int($key) && is_string($child))) {
            $result[$key] = nightlatch_storage_public_url($child);
        } elseif (is_array($child)) {
            $result[$key] = nightlatch_resolve_interactive_asset_urls($child, $isOverlayLibrary);
        } else {
            $result[$key] = $child;
        }
    }
    return $result;
}

function nightlatch_collect_interactive_storage_keys($value, &$keys, $insideOverlayLibrary = false)
{
    if (!is_array($value)) return;
    foreach ($value as $key => $child) {
        $isOverlayLibrary = $insideOverlayLibrary || $key === 'overlayLibrary';
        if (($key === 'asset' && is_string($child)) || ($insideOverlayLibrary && is_int($key) && is_string($child))) {
            $storedKey = nightlatch_storage_key_from_reference($child);
            if ($storedKey !== '') $keys[$storedKey] = true;
        } elseif (is_array($child)) {
            nightlatch_collect_interactive_storage_keys($child, $keys, $isOverlayLibrary);
        }
    }
}

function nightlatch_content_storage_keys($backgroundAsset, $data)
{
    $keys = array();
    $backgroundKey = nightlatch_storage_key_from_reference($backgroundAsset);
    if ($backgroundKey !== '') $keys[$backgroundKey] = true;
    nightlatch_collect_interactive_storage_keys($data, $keys);
    return array_keys($keys);
}

function nightlatch_cleanup_local_asset_files($localFiles)
{
    return nightlatch_delete_local_temporary_asset_files(array_keys($localFiles));
}

function nightlatch_local_asset_cleanup_warning($report)
{
    $failed = isset($report['failed']) ? count($report['failed']) : 0;
    $invalid = isset($report['invalid']) ? count($report['invalid']) : 0;
    $count = $failed + $invalid;
    if (!$count) return '';
    return $count . ' temporary local asset' . ($count === 1 ? '' : 's')
        . ' could not be removed. Check file permissions and run the local asset cleanup command.';
}

function nightlatch_delete_storage_keys($keys)
{
    foreach (array_unique($keys) as $key) {
        try {
            nightlatch_storage_delete($key);
        } catch (Throwable $exception) {
            error_log('Nightlatch asset cleanup failed for a saved storage key.');
        }
    }
}

function nightlatch_delete_unreferenced_content_storage_keys(PDO $pdo, $candidateKeys)
{
    $candidateKeys = array_values(array_unique($candidateKeys));
    if (!$candidateKeys) return;
    $referenced = array();
    try {
        foreach ($pdo->query('SELECT background_asset, room_data FROM rooms')->fetchAll() as $row) {
            foreach (nightlatch_content_storage_keys($row['background_asset'], nightlatch_interactive_content_data($row['room_data'])) as $key) {
                $referenced[$key] = true;
            }
        }
        foreach ($pdo->query('SELECT background_asset, object_data FROM objects')->fetchAll() as $row) {
            foreach (nightlatch_content_storage_keys($row['background_asset'], nightlatch_interactive_content_data($row['object_data'])) as $key) {
                $referenced[$key] = true;
            }
        }
    } catch (Throwable $exception) {
        error_log('Nightlatch skipped asset cleanup because saved references could not be checked.');
        return;
    }
    $unused = array();
    foreach ($candidateKeys as $key) {
        if (!isset($referenced[$key])) $unused[] = $key;
    }
    nightlatch_delete_storage_keys($unused);
}
