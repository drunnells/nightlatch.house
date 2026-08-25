<?php

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This diagnostic may only be run from the command line.\n");
    exit(1);
}

$arguments = array_slice($argv, 1);
$writeTest = in_array('--write', $arguments, true);
$showHelp = in_array('--help', $arguments, true) || in_array('-h', $arguments, true);
foreach ($arguments as $argument) {
    if (!in_array($argument, array('--write', '--help', '-h'), true)) {
        fwrite(STDERR, "Unknown option: {$argument}\nRun with --help for usage.\n");
        exit(1);
    }
}

if ($showHelp) {
    fwrite(STDOUT, "Usage: php scripts/test-spaces.php [--write]\n\n");
    fwrite(STDOUT, "Without --write, validates the safe configuration shape and makes one signed GET\n");
    fwrite(STDOUT, "request for a random nonexistent key. No object or database record is created.\n\n");
    fwrite(STDOUT, "With --write, also uploads, downloads, verifies, and deletes a small disposable\n");
    fwrite(STDOUT, "text object. No database records are read or changed.\n");
    exit(0);
}

require dirname(__DIR__) . '/app/bootstrap.php';

function nightlatch_spaces_diagnostic_status($label, $result)
{
    fwrite(STDOUT, $label . ': ' . nightlatch_storage_result_description($result) . "\n");
}

function nightlatch_spaces_diagnostic_failed($result)
{
    return $result['status'] < 200 || $result['status'] >= 300;
}

$testKey = '';
$uploaded = false;

try {
    $settings = nightlatch_require_storage_settings();
    $endpointHost = (string) parse_url($settings['endpoint'], PHP_URL_HOST);
    $publicHost = (string) parse_url($settings['objectBaseUrl'], PHP_URL_HOST);
    $testKey = 'sounds/diagnostics/spaces-test-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(8)) . '.txt';
    $target = nightlatch_storage_request_target($testKey, $settings);

    fwrite(STDOUT, "Nightlatch Spaces diagnostic\n");
    fwrite(STDOUT, "Local UTC time: " . gmdate('Y-m-d H:i:s') . " UTC\n");
    fwrite(STDOUT, "Environment: " . (string) nightlatch_config()['environment']['name'] . "\n");
    fwrite(STDOUT, "Origin endpoint host: {$endpointHost}\n");
    fwrite(STDOUT, "Signed request host: " . $target['host'] . "\n");
    fwrite(STDOUT, "Public asset host: {$publicHost}\n");
    fwrite(STDOUT, "Bucket: " . $settings['bucket'] . "\n");
    fwrite(STDOUT, "Signing region: " . $settings['region'] . "\n");
    fwrite(STDOUT, "Upload ACL: " . ($settings['acl'] === '' ? '(none)' : $settings['acl']) . "\n");
    fwrite(STDOUT, "Access key: configured (" . strlen($settings['accessKey']) . " characters)\n");
    fwrite(STDOUT, "Secret key: configured (" . strlen($settings['secretKey']) . " characters)\n");

    $warnings = array();
    if (strpos(strtolower($endpointHost), strtolower($settings['region'])) === false) {
        $warnings[] = 'The signing region does not appear in the origin endpoint hostname.';
    }
    if (strpos(strtolower($publicHost), strtolower($settings['bucket']) . '.') !== 0) {
        $warnings[] = 'The public asset hostname does not begin with the configured bucket name.';
    }
    if (strpos(strtolower($publicHost), '.cdn.digitaloceanspaces.com') === false) {
        $warnings[] = 'The public asset URL is not a standard DigitalOcean Spaces CDN hostname.';
    }
    foreach ($warnings as $warning) fwrite(STDOUT, "Warning: {$warning}\n");

    fwrite(STDOUT, "\nTesting signed access without creating an object...\n");
    $missingResult = nightlatch_storage_request('GET', $testKey, '', '');
    nightlatch_spaces_diagnostic_status('Signed GET', $missingResult);
    if ($missingResult['status'] !== 404) {
        throw new RuntimeException(
            'Expected HTTP 404 NoSuchKey for the random test key, but Spaces returned '
            . nightlatch_storage_result_description($missingResult) . '.'
        );
    }
    fwrite(STDOUT, "Signed request authentication and read access succeeded.\n");

    if (!$writeTest) {
        fwrite(STDOUT, "\nRead-only diagnostic complete. Run again with --write to test upload and deletion.\n");
        exit(0);
    }

    $payload = "Nightlatch Spaces diagnostic " . gmdate('c') . "\n";
    fwrite(STDOUT, "\nTesting a disposable upload...\n");
    $putResult = nightlatch_storage_request('PUT', $testKey, $payload, 'text/plain');
    nightlatch_spaces_diagnostic_status('PUT', $putResult);
    if (nightlatch_spaces_diagnostic_failed($putResult)) {
        throw new RuntimeException('Disposable upload failed: ' . nightlatch_storage_result_description($putResult) . '.');
    }
    $uploaded = true;

    $getResult = nightlatch_storage_request('GET', $testKey, '', '');
    nightlatch_spaces_diagnostic_status('GET', $getResult);
    if (nightlatch_spaces_diagnostic_failed($getResult)) {
        throw new RuntimeException('Uploaded-object download failed: ' . nightlatch_storage_result_description($getResult) . '.');
    }
    if (!hash_equals(hash('sha256', $payload), hash('sha256', $getResult['body']))) {
        throw new RuntimeException('The downloaded disposable object did not match the uploaded bytes.');
    }
    fwrite(STDOUT, "Downloaded bytes matched the upload.\n");

    $deleteResult = nightlatch_storage_request('DELETE', $testKey, '', '');
    nightlatch_spaces_diagnostic_status('DELETE', $deleteResult);
    if (nightlatch_spaces_diagnostic_failed($deleteResult) && $deleteResult['status'] !== 404) {
        throw new RuntimeException('Disposable-object cleanup failed: ' . nightlatch_storage_result_description($deleteResult) . '.');
    }
    $uploaded = false;

    fwrite(STDOUT, "\nSpaces write diagnostic passed; the disposable object was deleted.\n");
} catch (Throwable $exception) {
    if ($uploaded && $testKey !== '') {
        try {
            nightlatch_storage_delete($testKey);
            fwrite(STDERR, "The disposable test object was deleted during cleanup.\n");
        } catch (Throwable $cleanupException) {
            fwrite(STDERR, "Warning: the disposable test object could not be deleted. Key: {$testKey}\n");
        }
    }
    fwrite(STDERR, "Spaces diagnostic failed: " . $exception->getMessage() . "\n");
    exit(1);
}
