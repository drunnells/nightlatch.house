<?php

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
$_SESSION['admin'] = array('id' => 1, 'display_name' => 'Test Admin');
$_GET = array();

ob_start();
include dirname(__DIR__) . '/admin/object-edit.php';
$html = ob_get_clean();

$requiredIds = array(
    'room-editor',
    'region-layer',
    'object-portable',
    'inventory-key',
    'save-room',
    'generate-overlay',
);
foreach ($requiredIds as $id) {
    if (strpos($html, 'id="' . $id . '"') === false) {
        fwrite(STDERR, 'Object editor is missing #' . $id . ".\n");
        exit(1);
    }
}
if (strpos($html, "kind: 'object'") === false || strpos($html, "assetType: 'objects'") === false) {
    fwrite(STDERR, "Object editor bootstrap context is incomplete.\n");
    exit(1);
}

fwrite(STDOUT, "object-editor render tests passed\n");
