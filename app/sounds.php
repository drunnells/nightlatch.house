<?php

/**
 * Shared metadata and upload helpers for authored sound effects.
 */

function nightlatch_sound_payload($row)
{
    return array(
        'id' => (int) $row['id'],
        'name' => isset($row['name']) ? (string) $row['name'] : '',
        'slug' => isset($row['slug']) ? (string) $row['slug'] : '',
        'assetUrl' => isset($row['asset_path']) ? (string) $row['asset_path'] : '',
        'mimeType' => isset($row['mime_type']) ? (string) $row['mime_type'] : '',
        'fileSize' => isset($row['file_size']) ? (int) $row['file_size'] : 0,
        'originalFilename' => isset($row['original_filename']) ? (string) $row['original_filename'] : '',
        'updatedAt' => isset($row['updated_at']) ? $row['updated_at'] : null,
    );
}

function nightlatch_sound_catalog(PDO $pdo)
{
    $sounds = array();
    foreach ($pdo->query('SELECT * FROM sounds ORDER BY name, id')->fetchAll() as $row) {
        $sounds[] = nightlatch_sound_payload($row);
    }
    return $sounds;
}

function nightlatch_sound_name_from_filename($filename)
{
    $filename = pathinfo((string) $filename, PATHINFO_FILENAME);
    $name = trim(preg_replace('/[\s_-]+/', ' ', $filename));
    $name = $name !== '' ? ucwords($name) : 'Untitled sound';
    return substr($name, 0, 160);
}

function nightlatch_sound_extension_for_mime($mime)
{
    $extensions = array(
        'audio/mpeg' => 'mp3',
        'audio/wav' => 'wav',
        'audio/x-wav' => 'wav',
        'audio/wave' => 'wav',
        'audio/vnd.wave' => 'wav',
        'audio/ogg' => 'ogg',
        'application/ogg' => 'ogg',
        'audio/mp4' => 'm4a',
        'audio/x-m4a' => 'm4a',
        'audio/webm' => 'webm',
    );
    return isset($extensions[$mime]) ? $extensions[$mime] : '';
}

function nightlatch_unique_sound_slug(PDO $pdo, $name)
{
    $base = nightlatch_slug($name);
    if ($base === '') $base = 'sound';
    $base = rtrim(substr($base, 0, 180), '-');
    $slug = $base;
    $suffix = 2;
    $stmt = $pdo->prepare('SELECT id FROM sounds WHERE slug = ? LIMIT 1');
    while (true) {
        $stmt->execute(array($slug));
        if (!$stmt->fetch()) return $slug;
        $slug = $base . '-' . $suffix;
        $suffix++;
    }
}

function nightlatch_sound_upload_directory()
{
    return NIGHTLATCH_ROOT . '/assets/sounds/uploads';
}

function nightlatch_sound_local_path($assetPath)
{
    $prefix = '../assets/sounds/uploads/';
    $assetPath = (string) $assetPath;
    if (strpos($assetPath, $prefix) !== 0) return '';
    $filename = substr($assetPath, strlen($prefix));
    if ($filename === '' || basename($filename) !== $filename) return '';
    return nightlatch_sound_upload_directory() . '/' . $filename;
}
