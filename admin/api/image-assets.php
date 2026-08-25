<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
nightlatch_require_admin(true);

try {
    $assets = array();
    $roomRows = nightlatch_db()->query("SELECT title, slug, background_asset, updated_at FROM rooms WHERE background_asset IS NOT NULL AND background_asset <> '' ORDER BY updated_at DESC")->fetchAll();
    foreach ($roomRows as $row) {
        $path = parse_url($row['background_asset'], PHP_URL_PATH);
        $extension = strtolower(pathinfo((string) $path, PATHINFO_EXTENSION));
        $storageKey = nightlatch_storage_key_from_reference($row['background_asset']);
        if (($storageKey === '' && strpos('/' . ltrim((string) $path, '/'), '/assets/graphics/rooms/') === false)
            || !in_array($extension, array('png', 'jpg', 'jpeg', 'webp'), true)) {
            continue;
        }
        $assets[] = array(
            'title' => $row['title'],
            'slug' => $row['slug'],
            'assetType' => 'rooms',
            'backgroundAsset' => nightlatch_storage_public_url($row['background_asset']),
        );
    }

    $objectRows = nightlatch_db()->query("SELECT title, slug, background_asset, updated_at FROM objects WHERE background_asset IS NOT NULL AND background_asset <> '' ORDER BY updated_at DESC")->fetchAll();
    foreach ($objectRows as $row) {
        $path = parse_url($row['background_asset'], PHP_URL_PATH);
        $extension = strtolower(pathinfo((string) $path, PATHINFO_EXTENSION));
        $storageKey = nightlatch_storage_key_from_reference($row['background_asset']);
        if (($storageKey === '' && strpos('/' . ltrim((string) $path, '/'), '/assets/graphics/objects/') === false)
            || !in_array($extension, array('png', 'jpg', 'jpeg', 'webp'), true)) {
            continue;
        }
        $assets[] = array(
            'title' => $row['title'],
            'slug' => $row['slug'],
            'assetType' => 'objects',
            'backgroundAsset' => nightlatch_storage_public_url($row['background_asset']),
        );
    }

    nightlatch_json(array('ok' => true, 'assets' => $assets));
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => 'Image assets could not be loaded.'), 500);
}
