<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
require_once dirname(dirname(__DIR__)) . '/app/interactive-logic.php';
require_once dirname(dirname(__DIR__)) . '/app/map-topology.php';
nightlatch_require_admin(true);

try {
    $saveCommitted = false;
    nightlatch_verify_csrf();
    $payload = nightlatch_input_json();
    $action = isset($payload['action']) ? $payload['action'] : 'save';
    $adminId = (int) nightlatch_admin()['id'];

    if ($action === 'delete') {
        $id = isset($payload['id']) ? (int) $payload['id'] : 0;
        $roomStmt = nightlatch_db()->prepare('SELECT background_asset, room_data FROM rooms WHERE id = ?');
        $roomStmt->execute(array($id));
        $roomRow = $roomStmt->fetch();
        $entryStmt = nightlatch_db()->prepare('SELECT name FROM room_clusters WHERE entry_room_id = ? LIMIT 1');
        $entryStmt->execute(array($id));
        $entryCluster = $entryStmt->fetch();
        if ($entryCluster) {
            nightlatch_json(array('ok' => false, 'error' => 'This room is the entry room for cluster “' . $entryCluster['name'] . '”. Choose a different entry room in Map before deleting it.'), 422);
        }
        $pdo = nightlatch_db();
        $pdo->prepare('DELETE FROM rooms WHERE id = ?')->execute(array($id));
        if ($roomRow) {
            nightlatch_delete_unreferenced_content_storage_keys($pdo, nightlatch_content_storage_keys(
                $roomRow['background_asset'],
                nightlatch_interactive_content_data($roomRow['room_data'])
            ));
        }
        nightlatch_json(array('ok' => true));
    }

    $title = trim(isset($payload['title']) ? $payload['title'] : '');
    $slug = nightlatch_slug(isset($payload['slug']) && $payload['slug'] ? $payload['slug'] : $title);
    if (!$title || !$slug) {
        nightlatch_json(array('ok' => false, 'error' => 'Room title and slug are required.'), 422);
    }
    $playerDescription = isset($payload['playerDescription']) ? $payload['playerDescription'] : '';
    nightlatch_logic_string($playerDescription, 8000, 'Player description');
    $playerDescription = trim((string) $playerDescription);

    $roomData = isset($payload['data']) && is_array($payload['data']) ? $payload['data'] : array();
    nightlatch_validate_interactive_data($roomData, 'room');
    $id = isset($payload['id']) ? (int) $payload['id'] : 0;
    $pdo = nightlatch_db();
    $existingRoom = null;
    if ($id) {
        $existingStmt = $pdo->prepare('SELECT background_asset, room_data FROM rooms WHERE id = ?');
        $existingStmt->execute(array($id));
        $existingRoom = $existingStmt->fetch();
    }
    $replacements = array();
    $localFiles = array();
    $promoted = nightlatch_promote_content_assets(
        isset($payload['backgroundAsset']) ? $payload['backgroundAsset'] : '',
        $roomData,
        'rooms',
        $slug,
        $replacements,
        $localFiles
    );
    $roomData = $promoted['data'];
    $roomJson = json_encode($roomData, JSON_UNESCAPED_SLASHES);
    $values = array(
        $title,
        $slug,
        isset($payload['description']) ? trim($payload['description']) : '',
        $playerDescription,
        $promoted['backgroundAsset'],
        isset($payload['backgroundPrompt']) ? $payload['backgroundPrompt'] : '',
        $roomJson,
    );

    $pdo->beginTransaction();
    if ($id) {
        $values[] = $adminId;
        $values[] = $id;
        $stmt = $pdo->prepare('UPDATE rooms SET title = ?, slug = ?, description = ?, player_description = ?, background_asset = ?, background_prompt = ?, room_data = ?, updated_by = ? WHERE id = ?');
        $stmt->execute($values);
    } else {
        $values[] = $adminId;
        $values[] = $adminId;
        $stmt = $pdo->prepare('INSERT INTO rooms (title, slug, description, player_description, background_asset, background_prompt, room_data, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute($values);
        $id = (int) $pdo->lastInsertId();
    }

    $gateway = isset($payload['gateway']) && is_array($payload['gateway']) ? $payload['gateway'] : array('enabled' => false);
    nightlatch_sync_room_topology($pdo, $id, $roomData, $gateway);
    $pdo->commit();
    $saveCommitted = true;

    $newKeys = nightlatch_content_storage_keys($promoted['backgroundAsset'], $roomData);
    if ($existingRoom) {
        $oldKeys = nightlatch_content_storage_keys($existingRoom['background_asset'], nightlatch_interactive_content_data($existingRoom['room_data']));
        nightlatch_delete_unreferenced_content_storage_keys($pdo, array_values(array_diff($oldKeys, $newKeys)));
    }
    nightlatch_cleanup_local_asset_files($localFiles);
    $assetReplacements = array();
    foreach ($replacements as $source => $key) $assetReplacements[$source] = nightlatch_storage_public_url($key);

    nightlatch_json(array(
        'ok' => true,
        'id' => $id,
        'slug' => $slug,
        'backgroundAsset' => nightlatch_storage_public_url($promoted['backgroundAsset']),
        'assetReplacements' => $assetReplacements,
        'savedAt' => date(DATE_ATOM),
    ));
} catch (PDOException $exception) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    if (!$saveCommitted && isset($replacements)) nightlatch_delete_storage_keys(array_values($replacements));
    $message = $exception->getCode() === '23000' ? 'That room slug is already in use.' : 'The room could not be saved.';
    nightlatch_json(array('ok' => false, 'error' => $message), 500);
} catch (Throwable $exception) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    if (!$saveCommitted && isset($replacements)) nightlatch_delete_storage_keys(array_values($replacements));
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}
