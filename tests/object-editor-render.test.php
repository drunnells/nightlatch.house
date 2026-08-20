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
    'open-object-crop',
    'open-reference-picker',
    'object-crop-workspace',
    'reference-workspace',
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
if (strpos($html, 'js/object-image-tools.js') === false) {
    fwrite(STDERR, "Object image tools were not loaded by the editor.\n");
    exit(1);
}

if (class_exists('DOMDocument')) {
    libxml_use_internal_errors(true);
    $document = new DOMDocument();
    if (!$document->loadHTML($html)) {
        fwrite(STDERR, "Object editor HTML could not be parsed.\n");
        exit(1);
    }
    $seenIds = array();
    foreach ((new DOMXPath($document))->query('//*[@id]') as $element) {
        $elementId = $element->getAttribute('id');
        if (isset($seenIds[$elementId])) {
            fwrite(STDERR, 'Object editor contains duplicate #' . $elementId . ".\n");
            exit(1);
        }
        $seenIds[$elementId] = true;
    }
    libxml_clear_errors();
}

fwrite(STDOUT, "object-editor render tests passed\n");
