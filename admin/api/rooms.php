<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
nightlatch_require_admin(true);

try {
    nightlatch_verify_csrf();
    $payload = nightlatch_input_json();
    $action = isset($payload['action']) ? $payload['action'] : 'save';
    $adminId = (int) nightlatch_admin()['id'];

    if ($action === 'delete') {
        $id = isset($payload['id']) ? (int) $payload['id'] : 0;
        nightlatch_db()->prepare('DELETE FROM rooms WHERE id = ?')->execute(array($id));
        nightlatch_json(array('ok' => true));
    }

    $title = trim(isset($payload['title']) ? $payload['title'] : '');
    $slug = nightlatch_slug(isset($payload['slug']) && $payload['slug'] ? $payload['slug'] : $title);
    $status = isset($payload['status']) ? $payload['status'] : 'development';
    if (!$title || !$slug) {
        nightlatch_json(array('ok' => false, 'error' => 'Room title and slug are required.'), 422);
    }
    if (!in_array($status, array('development', 'staging', 'production'), true)) {
        nightlatch_json(array('ok' => false, 'error' => 'Invalid room lifecycle status.'), 422);
    }
    if ($status !== 'development') {
        nightlatch_json(array('ok' => false, 'error' => 'Staging and production require the S3 publishing workflow. Save this room as development for now.'), 422);
    }

    $roomData = isset($payload['data']) && is_array($payload['data']) ? $payload['data'] : array();
    $roomJson = json_encode($roomData, JSON_UNESCAPED_SLASHES);
    $id = isset($payload['id']) ? (int) $payload['id'] : 0;
    $values = array(
        $title,
        $slug,
        isset($payload['description']) ? trim($payload['description']) : '',
        $status,
        isset($payload['backgroundAsset']) ? $payload['backgroundAsset'] : '',
        isset($payload['backgroundPrompt']) ? $payload['backgroundPrompt'] : '',
        $roomJson,
    );

    if ($id) {
        $values[] = $adminId;
        $values[] = $id;
        $stmt = nightlatch_db()->prepare('UPDATE rooms SET title = ?, slug = ?, description = ?, status = ?, background_asset = ?, background_prompt = ?, room_data = ?, updated_by = ? WHERE id = ?');
        $stmt->execute($values);
    } else {
        $values[] = $adminId;
        $values[] = $adminId;
        $stmt = nightlatch_db()->prepare('INSERT INTO rooms (title, slug, description, status, background_asset, background_prompt, room_data, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute($values);
        $id = (int) nightlatch_db()->lastInsertId();
    }

    nightlatch_json(array('ok' => true, 'id' => $id, 'slug' => $slug, 'savedAt' => date(DATE_ATOM)));
} catch (PDOException $exception) {
    $message = $exception->getCode() === '23000' ? 'That room slug is already in use.' : 'The room could not be saved.';
    nightlatch_json(array('ok' => false, 'error' => $message), 500);
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}
