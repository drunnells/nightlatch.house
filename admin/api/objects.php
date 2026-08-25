<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
require_once dirname(dirname(__DIR__)) . '/app/interactive-logic.php';
nightlatch_require_admin(true);

try {
    $saveCommitted = false;
    nightlatch_verify_csrf();
    $payload = nightlatch_input_json();
    $action = isset($payload['action']) ? $payload['action'] : 'save';
    $adminId = (int) nightlatch_admin()['id'];

    if ($action === 'delete') {
        $id = isset($payload['id']) ? (int) $payload['id'] : 0;
        $objectStmt = nightlatch_db()->prepare('SELECT slug, background_asset, object_data FROM objects WHERE id = ?');
        $objectStmt->execute(array($id));
        $objectRow = $objectStmt->fetch();
        if ($objectRow) {
            $referenceStmt = nightlatch_db()->prepare('SELECT title FROM rooms WHERE room_data LIKE ? OR room_data LIKE ? LIMIT 1');
            $referenceStmt->execute(array('%"examineObject":"' . $objectRow['slug'] . '"%', '%"objectSlug":"' . $objectRow['slug'] . '"%'));
            $referencingRoom = $referenceStmt->fetch();
            if ($referencingRoom) {
                nightlatch_json(array('ok' => false, 'error' => 'Remove this object from the “' . $referencingRoom['title'] . '” room regions before deleting it.'), 409);
            }
        }
        $pdo = nightlatch_db();
        $pdo->prepare('DELETE FROM objects WHERE id = ?')->execute(array($id));
        if ($objectRow) {
            nightlatch_delete_unreferenced_content_storage_keys($pdo, nightlatch_content_storage_keys(
                $objectRow['background_asset'],
                nightlatch_interactive_content_data($objectRow['object_data'])
            ));
        }
        nightlatch_json(array('ok' => true));
    }

    $title = trim(isset($payload['title']) ? $payload['title'] : '');
    $slug = nightlatch_slug(isset($payload['slug']) && $payload['slug'] ? $payload['slug'] : $title);
    $portable = !empty($payload['portable']);
    $inventoryKey = strtolower(trim(isset($payload['inventoryKey']) ? $payload['inventoryKey'] : ''));
    if (!$title || !$slug) {
        nightlatch_json(array('ok' => false, 'error' => 'Object title and slug are required.'), 422);
    }
    $playerDescription = isset($payload['playerDescription']) ? $payload['playerDescription'] : '';
    nightlatch_logic_string($playerDescription, 8000, 'Player description');
    $playerDescription = trim((string) $playerDescription);
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
    nightlatch_validate_interactive_data($objectData, 'object');
    $id = isset($payload['id']) ? (int) $payload['id'] : 0;
    $pdo = nightlatch_db();
    $existingObject = null;
    if ($id) {
        $existingStmt = $pdo->prepare('SELECT slug, background_asset, object_data FROM objects WHERE id = ?');
        $existingStmt->execute(array($id));
        $existingObject = $existingStmt->fetch();
        if ($existingObject && $existingObject['slug'] !== $slug) {
            nightlatch_json(array('ok' => false, 'error' => 'Object slugs are stable after creation because room regions may reference them.'), 422);
        }
    }
    $replacements = array();
    $localFiles = array();
    $promoted = nightlatch_promote_content_assets(
        isset($payload['backgroundAsset']) ? $payload['backgroundAsset'] : '',
        $objectData,
        'objects',
        $slug,
        $replacements,
        $localFiles
    );
    $objectData = $promoted['data'];
    $objectJson = json_encode($objectData, JSON_UNESCAPED_SLASHES);
    $values = array(
        $title,
        $slug,
        isset($payload['description']) ? trim($payload['description']) : '',
        $playerDescription,
        $promoted['backgroundAsset'],
        isset($payload['backgroundPrompt']) ? $payload['backgroundPrompt'] : '',
        $portable ? 1 : 0,
        $inventoryKey,
        $objectJson,
    );

    $pdo->beginTransaction();
    if ($id) {
        $values[] = $adminId;
        $values[] = $id;
        $stmt = $pdo->prepare('UPDATE objects SET title = ?, slug = ?, description = ?, player_description = ?, background_asset = ?, background_prompt = ?, portable = ?, inventory_key = ?, object_data = ?, updated_by = ? WHERE id = ?');
        $stmt->execute($values);
    } else {
        $values[] = $adminId;
        $values[] = $adminId;
        $stmt = $pdo->prepare('INSERT INTO objects (title, slug, description, player_description, background_asset, background_prompt, portable, inventory_key, object_data, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute($values);
        $id = (int) $pdo->lastInsertId();
    }
    $pdo->commit();
    $saveCommitted = true;

    $newKeys = nightlatch_content_storage_keys($promoted['backgroundAsset'], $objectData);
    if ($existingObject) {
        $oldKeys = nightlatch_content_storage_keys($existingObject['background_asset'], nightlatch_interactive_content_data($existingObject['object_data']));
        nightlatch_delete_unreferenced_content_storage_keys($pdo, array_values(array_diff($oldKeys, $newKeys)));
    }
    $cleanupReport = nightlatch_cleanup_local_asset_files($localFiles);
    $cleanupWarning = nightlatch_local_asset_cleanup_warning($cleanupReport);
    if ($cleanupWarning !== '') error_log('Nightlatch object save cleanup warning: ' . $cleanupWarning);
    $assetReplacements = array();
    foreach ($replacements as $source => $key) $assetReplacements[$source] = nightlatch_storage_public_url($key);

    nightlatch_json(array(
        'ok' => true,
        'id' => $id,
        'slug' => $slug,
        'inventoryKey' => $inventoryKey ? $inventoryKey : '',
        'backgroundAsset' => nightlatch_storage_public_url($promoted['backgroundAsset']),
        'assetReplacements' => $assetReplacements,
        'cleanupWarning' => $cleanupWarning,
        'savedAt' => date(DATE_ATOM),
    ));
} catch (PDOException $exception) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    if (!$saveCommitted && isset($replacements)) nightlatch_delete_storage_keys(array_values($replacements));
    $message = $exception->getCode() === '23000' ? 'That object slug or inventory key is already in use.' : 'The object could not be saved.';
    nightlatch_json(array('ok' => false, 'error' => $message), 500);
} catch (Throwable $exception) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    if (!$saveCommitted && isset($replacements)) nightlatch_delete_storage_keys(array_values($replacements));
    nightlatch_json(array('ok' => false, 'error' => $exception->getMessage()), 400);
}
