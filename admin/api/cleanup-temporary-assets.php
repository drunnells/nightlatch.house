<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
nightlatch_require_admin(true);

try {
    nightlatch_verify_csrf();
    if (isset($_POST['assets'])) {
        $assets = json_decode((string) $_POST['assets'], true);
    } else {
        $payload = nightlatch_input_json();
        $assets = isset($payload['assets']) ? $payload['assets'] : null;
    }
    if (!is_array($assets) || count($assets) < 1 || count($assets) > 250) {
        throw new RuntimeException('Choose between 1 and 250 temporary assets to clean up.');
    }

    $paths = array();
    $referencesByPath = array();
    $referencesByRelativePath = array();
    $invalidReferences = array();
    foreach ($assets as $reference) {
        if (!is_string($reference) || trim($reference) === '') continue;
        $path = nightlatch_local_temporary_asset_file($reference);
        if ($path === '') {
            $invalidReferences[] = $reference;
            continue;
        }
        $paths[] = $path;
        $referencesByPath[$path] = $reference;
        $relativePath = nightlatch_local_temporary_asset_relative_path($path);
        if ($relativePath !== '') $referencesByRelativePath[$relativePath] = $reference;
    }

    $report = nightlatch_delete_local_temporary_asset_files(
        $paths,
        nightlatch_database_local_asset_files(nightlatch_db())
    );
    $response = array();
    foreach ($report as $status => $statusPaths) {
        $response[$status] = array();
        foreach ($statusPaths as $path) {
            if (isset($referencesByPath[$path])) {
                $response[$status][] = $referencesByPath[$path];
            } elseif (isset($referencesByRelativePath[$path])) {
                $response[$status][] = $referencesByRelativePath[$path];
            } else {
                $response[$status][] = $path;
            }
        }
    }
    $response['invalid'] = array_merge($response['invalid'], $invalidReferences);

    nightlatch_json(array(
        'ok' => true,
        'cleanup' => $response,
    ));
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}
