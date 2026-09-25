<?php
require dirname(dirname(__DIR__)) . '/app/bootstrap.php';
require dirname(dirname(__DIR__)) . '/app/image-assets.php';
nightlatch_require_admin(true);

try {
    $includeOverlays = isset($_GET['includeOverlays']) && $_GET['includeOverlays'] === '1';
    $assets = array();
    foreach (array('rooms' => 'room_data', 'objects' => 'object_data') as $table => $dataColumn) {
        $columns = 'title, slug, background_asset' . ($includeOverlays ? ', ' . $dataColumn . ' AS interaction_data' : '');
        $rows = nightlatch_db()->query('SELECT ' . $columns . ' FROM ' . $table . ' ORDER BY updated_at DESC')->fetchAll();
        $assets = array_merge($assets, nightlatch_image_asset_entries($rows, $table, $includeOverlays));
    }
    nightlatch_json(array('ok' => true, 'assets' => $assets));
} catch (Throwable $exception) {
    nightlatch_json(array('ok' => false, 'error' => 'Image assets could not be loaded.'), 500);
}
