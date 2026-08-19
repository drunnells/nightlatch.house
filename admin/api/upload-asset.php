<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
nightlatch_require_admin(true);

try {
    nightlatch_verify_csrf();
    if (!isset($_FILES['asset']) || $_FILES['asset']['error'] !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Choose an image to upload.');
    }
    if ($_FILES['asset']['size'] > 12 * 1024 * 1024) {
        throw new RuntimeException('The image must be 12 MB or smaller.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($_FILES['asset']['tmp_name']);
    $extensions = array('image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp');
    if (!isset($extensions[$mime])) {
        throw new RuntimeException('Only PNG, JPG, and WebP images are supported.');
    }

    $name = date('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.' . $extensions[$mime];
    $directory = NIGHTLATCH_ROOT . '/assets/graphics/rooms/uploads';
    if (!is_dir($directory) && !mkdir($directory, 0775, true)) {
        throw new RuntimeException('The upload directory could not be created.');
    }
    if (!move_uploaded_file($_FILES['asset']['tmp_name'], $directory . '/' . $name)) {
        throw new RuntimeException('The image could not be stored.');
    }
    nightlatch_json(array('ok' => true, 'url' => '../assets/graphics/rooms/uploads/' . $name));
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}

