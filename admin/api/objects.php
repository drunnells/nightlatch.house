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
        $objectStmt = nightlatch_db()->prepare('SELECT slug FROM objects WHERE id = ?');
        $objectStmt->execute(array($id));
        $objectRow = $objectStmt->fetch();
        if ($objectRow) {
            $referenceStmt = nightlatch_db()->prepare('SELECT title FROM rooms WHERE room_data LIKE ? LIMIT 1');
            $referenceStmt->execute(array('%"examineObject":"' . $objectRow['slug'] . '"%'));
            $referencingRoom = $referenceStmt->fetch();
            if ($referencingRoom) {
                nightlatch_json(array('ok' => false, 'error' => 'Remove this object from the “' . $referencingRoom['title'] . '” room regions before deleting it.'), 409);
            }
        }
        nightlatch_db()->prepare('DELETE FROM objects WHERE id = ?')->execute(array($id));
        nightlatch_json(array('ok' => true));
    }

    $title = trim(isset($payload['title']) ? $payload['title'] : '');
    $slug = nightlatch_slug(isset($payload['slug']) && $payload['slug'] ? $payload['slug'] : $title);
    $status = isset($payload['status']) ? $payload['status'] : 'development';
    $portable = !empty($payload['portable']);
    $inventoryKey = strtolower(trim(isset($payload['inventoryKey']) ? $payload['inventoryKey'] : ''));
    if (!$title || !$slug) {
        nightlatch_json(array('ok' => false, 'error' => 'Object title and slug are required.'), 422);
    }
    if (!in_array($status, array('development', 'staging', 'production'), true)) {
        nightlatch_json(array('ok' => false, 'error' => 'Invalid object lifecycle status.'), 422);
    }
    if ($status !== 'development') {
        nightlatch_json(array('ok' => false, 'error' => 'Staging and production require the S3 publishing workflow. Save this object as development for now.'), 422);
    }
    if ($portable && !$inventoryKey) {
        $inventoryKey = $slug;
    }
    if ($inventoryKey && (!preg_match('/^[a-z0-9_.:-]+$/', $inventoryKey) || strlen($inventoryKey) > 190)) {
        nightlatch_json(array('ok' => false, 'error' => 'Inventory keys may contain letters, numbers, underscores, periods, colons, and hyphens.'), 422);
    }
    if (!$portable) {
        $inventoryKey = null;
    }

    $objectData = isset($payload['data']) && is_array($payload['data']) ? $payload['data'] : array();
    $objectJson = json_encode($objectData, JSON_UNESCAPED_SLASHES);
    $id = isset($payload['id']) ? (int) $payload['id'] : 0;
    if ($id) {
        $existingStmt = nightlatch_db()->prepare('SELECT slug FROM objects WHERE id = ?');
        $existingStmt->execute(array($id));
        $existingObject = $existingStmt->fetch();
        if ($existingObject && $existingObject['slug'] !== $slug) {
            nightlatch_json(array('ok' => false, 'error' => 'Object slugs are stable after creation because room regions may reference them.'), 422);
        }
    }
    $values = array(
        $title,
        $slug,
        isset($payload['description']) ? trim($payload['description']) : '',
        $status,
        isset($payload['backgroundAsset']) ? $payload['backgroundAsset'] : '',
        isset($payload['backgroundPrompt']) ? $payload['backgroundPrompt'] : '',
        $portable ? 1 : 0,
        $inventoryKey,
        $objectJson,
    );

    if ($id) {
        $values[] = $adminId;
        $values[] = $id;
        $stmt = nightlatch_db()->prepare('UPDATE objects SET title = ?, slug = ?, description = ?, status = ?, background_asset = ?, background_prompt = ?, portable = ?, inventory_key = ?, object_data = ?, updated_by = ? WHERE id = ?');
        $stmt->execute($values);
    } else {
        $values[] = $adminId;
        $values[] = $adminId;
        $stmt = nightlatch_db()->prepare('INSERT INTO objects (title, slug, description, status, background_asset, background_prompt, portable, inventory_key, object_data, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute($values);
        $id = (int) nightlatch_db()->lastInsertId();
    }

    nightlatch_json(array(
        'ok' => true,
        'id' => $id,
        'slug' => $slug,
        'inventoryKey' => $inventoryKey ? $inventoryKey : '',
        'savedAt' => date(DATE_ATOM),
    ));
} catch (PDOException $exception) {
    $message = $exception->getCode() === '23000' ? 'That object slug or inventory key is already in use.' : 'The object could not be saved.';
    nightlatch_json(array('ok' => false, 'error' => $message), 500);
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}
