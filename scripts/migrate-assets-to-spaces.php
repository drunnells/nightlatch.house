<?php

require dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/sounds.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This migration may only be run from the command line.\n");
    exit(1);
}

$pdo = null;
$localFiles = array();
$uploadedKeys = array();
$uploadedCount = 0;
$roomCount = 0;
$objectCount = 0;
$soundCount = 0;

try {
    nightlatch_require_storage_settings();
    $pdo = nightlatch_db();
    $pdo->beginTransaction();

    $roomUpdate = $pdo->prepare('UPDATE rooms SET background_asset = ?, room_data = ? WHERE id = ?');
    foreach ($pdo->query('SELECT id, slug, background_asset, room_data FROM rooms ORDER BY id')->fetchAll() as $row) {
        $data = nightlatch_interactive_content_data($row['room_data']);
        $replacements = array();
        $promoted = nightlatch_promote_content_assets($row['background_asset'], $data, 'rooms', $row['slug'], $replacements, $localFiles);
        $roomUpdate->execute(array(
            $promoted['backgroundAsset'],
            json_encode($promoted['data'], JSON_UNESCAPED_SLASHES),
            (int) $row['id'],
        ));
        $uploadedCount += count($replacements);
        $uploadedKeys = array_merge($uploadedKeys, array_values($replacements));
        $roomCount++;
    }

    $objectUpdate = $pdo->prepare('UPDATE objects SET background_asset = ?, object_data = ? WHERE id = ?');
    foreach ($pdo->query('SELECT id, slug, background_asset, object_data FROM objects ORDER BY id')->fetchAll() as $row) {
        $data = nightlatch_interactive_content_data($row['object_data']);
        $replacements = array();
        $promoted = nightlatch_promote_content_assets($row['background_asset'], $data, 'objects', $row['slug'], $replacements, $localFiles);
        $objectUpdate->execute(array(
            $promoted['backgroundAsset'],
            json_encode($promoted['data'], JSON_UNESCAPED_SLASHES),
            (int) $row['id'],
        ));
        $uploadedCount += count($replacements);
        $uploadedKeys = array_merge($uploadedKeys, array_values($replacements));
        $objectCount++;
    }

    $soundUpdate = $pdo->prepare('UPDATE sounds SET asset_path = ? WHERE id = ?');
    foreach ($pdo->query('SELECT id, slug, asset_path, mime_type, original_filename FROM sounds ORDER BY id')->fetchAll() as $row) {
        if (nightlatch_storage_key_from_reference($row['asset_path']) !== '') {
            $soundCount++;
            continue;
        }
        $localPath = nightlatch_sound_local_path($row['asset_path']);
        if ($localPath === '' || !is_file($localPath)) {
            throw new RuntimeException('The local file for sound “' . $row['slug'] . '” could not be found.');
        }
        $mime = trim((string) $row['mime_type']);
        if (nightlatch_sound_extension_for_mime($mime) === '') $mime = nightlatch_asset_mime_type($localPath);
        $sourceName = trim((string) $row['original_filename']);
        if ($sourceName === '') $sourceName = basename($localPath);
        $key = nightlatch_storage_unique_key('sounds', $row['slug'], 'files', $sourceName);
        $bytes = file_get_contents($localPath);
        if ($bytes === false) throw new RuntimeException('The local sound “' . $row['slug'] . '” could not be read.');
        nightlatch_storage_put_bytes($key, $bytes, $mime);
        $uploadedKeys[] = $key;
        $soundUpdate->execute(array($key, (int) $row['id']));
        $localFiles[$localPath] = true;
        $uploadedCount++;
        $soundCount++;
    }

    $pdo->commit();
    $cleanupReport = nightlatch_cleanup_local_asset_files($localFiles);
    $cleanupWarning = nightlatch_local_asset_cleanup_warning($cleanupReport);

    fwrite(STDOUT, "Spaces asset migration complete.\n");
    fwrite(STDOUT, "Rooms checked: {$roomCount}\n");
    fwrite(STDOUT, "Objects checked: {$objectCount}\n");
    fwrite(STDOUT, "Sounds checked: {$soundCount}\n");
    fwrite(STDOUT, "Local assets uploaded: {$uploadedCount}\n");
    fwrite(STDOUT, "Local source files deleted: " . count($cleanupReport['deleted']) . "\n");
    if ($cleanupWarning !== '') fwrite(STDERR, "Warning: {$cleanupWarning}\n");
} catch (Throwable $exception) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    nightlatch_delete_storage_keys($uploadedKeys);
    fwrite(STDERR, "Spaces asset migration failed: " . $exception->getMessage() . "\n");
    fwrite(STDERR, "Database changes were rolled back and local asset files were retained.\n");
    exit(1);
}
