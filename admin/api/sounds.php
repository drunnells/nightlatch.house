<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
require_once dirname(dirname(__DIR__)) . '/app/sounds.php';
nightlatch_require_admin(true);

try {
    nightlatch_verify_csrf();
    $pdo = nightlatch_db();
    $adminId = (int) nightlatch_admin()['id'];

    if (isset($_FILES['sounds'])) {
        $files = $_FILES['sounds'];
        $names = is_array($files['name']) ? $files['name'] : array($files['name']);
        $tmpNames = is_array($files['tmp_name']) ? $files['tmp_name'] : array($files['tmp_name']);
        $sizes = is_array($files['size']) ? $files['size'] : array($files['size']);
        $errors = is_array($files['error']) ? $files['error'] : array($files['error']);
        if (!$names || count($names) > 50) {
            throw new RuntimeException('Choose between 1 and 50 sound files per upload.');
        }
        $directory = nightlatch_sound_upload_directory();
        if (!is_dir($directory) && !mkdir($directory, 0775, true)) {
            throw new RuntimeException('The sound upload directory could not be created.');
        }
        $storedPaths = array();
        $inserted = array();
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        try {
            $pdo->beginTransaction();
            $insert = $pdo->prepare('INSERT INTO sounds (name, slug, asset_path, mime_type, file_size, original_filename, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            foreach ($names as $index => $originalName) {
                if (!isset($errors[$index]) || $errors[$index] !== UPLOAD_ERR_OK) {
                    throw new RuntimeException('One of the selected sounds could not be uploaded.');
                }
                if ((int) $sizes[$index] > 25 * 1024 * 1024) {
                    throw new RuntimeException('Each sound must be 25 MB or smaller.');
                }
                $mime = $finfo->file($tmpNames[$index]);
                $extension = nightlatch_sound_extension_for_mime($mime);
                if ($extension === '') {
                    throw new RuntimeException('Sounds must be MP3, WAV, OGG, M4A, or WebM audio files.');
                }
                $filename = 'sound-' . date('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.' . $extension;
                $localPath = $directory . '/' . $filename;
                if (!move_uploaded_file($tmpNames[$index], $localPath)) {
                    throw new RuntimeException('A sound file could not be stored.');
                }
                $storedPaths[] = $localPath;
                $name = nightlatch_sound_name_from_filename($originalName);
                $slug = nightlatch_unique_sound_slug($pdo, $name);
                $assetPath = '../assets/sounds/uploads/' . $filename;
                $insert->execute(array($name, $slug, $assetPath, $mime, (int) $sizes[$index], substr((string) $originalName, 0, 255), $adminId, $adminId));
                $inserted[] = array('id' => (int) $pdo->lastInsertId(), 'name' => $name, 'slug' => $slug, 'assetUrl' => $assetPath);
            }
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            foreach ($storedPaths as $storedPath) {
                if (is_file($storedPath)) @unlink($storedPath);
            }
            throw $exception;
        }
        nightlatch_json(array('ok' => true, 'sounds' => $inserted));
    }

    $payload = nightlatch_input_json();
    $action = isset($payload['action']) ? $payload['action'] : '';
    $id = isset($payload['id']) ? (int) $payload['id'] : 0;
    if ($id < 1) throw new RuntimeException('Choose a saved sound.');

    if ($action === 'update') {
        $name = trim(isset($payload['name']) ? (string) $payload['name'] : '');
        if ($name === '' || strlen($name) > 160) throw new RuntimeException('Sound names must contain between 1 and 160 characters.');
        $stmt = $pdo->prepare('UPDATE sounds SET name = ?, updated_by = ? WHERE id = ?');
        $stmt->execute(array($name, $adminId, $id));
        nightlatch_json(array('ok' => true, 'name' => $name));
    }

    if ($action === 'delete') {
        $stmt = $pdo->prepare('SELECT * FROM sounds WHERE id = ?');
        $stmt->execute(array($id));
        $sound = $stmt->fetch();
        if (!$sound) throw new RuntimeException('That sound no longer exists.');
        $needle = '%"soundSlug":"' . $sound['slug'] . '"%';
        $roomReference = $pdo->prepare('SELECT title FROM rooms WHERE room_data LIKE ? LIMIT 1');
        $roomReference->execute(array($needle));
        $objectReference = $pdo->prepare('SELECT title FROM objects WHERE object_data LIKE ? LIMIT 1');
        $objectReference->execute(array($needle));
        $referencingRoom = $roomReference->fetch();
        $referencingObject = $objectReference->fetch();
        if ($referencingRoom || $referencingObject) {
            $title = $referencingRoom ? $referencingRoom['title'] : $referencingObject['title'];
            throw new RuntimeException('Remove this sound from the saved logic for “' . $title . '” before deleting it.');
        }
        $clusterReference = $pdo->prepare('SELECT name FROM room_clusters WHERE ambient_sound_id = ? LIMIT 1');
        $clusterReference->execute(array($id));
        $referencingCluster = $clusterReference->fetch();
        if ($referencingCluster) {
            throw new RuntimeException('Remove this sound from the ambient audio for cluster “' . $referencingCluster['name'] . '” before deleting it.');
        }
        $pdo->prepare('DELETE FROM sounds WHERE id = ?')->execute(array($id));
        $localPath = nightlatch_sound_local_path($sound['asset_path']);
        if ($localPath !== '' && is_file($localPath)) @unlink($localPath);
        nightlatch_json(array('ok' => true));
    }

    throw new RuntimeException('Unsupported sound library action.');
} catch (PDOException $exception) {
    nightlatch_json(array('ok' => false, 'error' => 'The sound library could not be updated. Confirm that database updates 004 and 005 have been applied.'), 500);
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}
