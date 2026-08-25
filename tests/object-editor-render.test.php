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
    'region-move-handle',
    'region-resize-handle',
    'capture-region-overlay',
    'captured-overlay-summary',
    'object-portable',
    'inventory-key',
    'player-description',
    'save-room',
    'region-logic-editor',
    'open-object-crop',
    'open-reference-picker',
    'object-crop-workspace',
    'reference-workspace',
    'open-image-area-edit',
    'image-edit-workspace',
    'image-edit-selection-layer',
    'generate-image-area-edit',
    'apply-image-area-edit',
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
if (strpos($html, 'js/object-image-tools.js') === false
    || strpos($html, 'js/image-area-editor.js') === false
    || strpos($html, 'js/room-rules.js') === false
    || strpos($html, 'js/logic-editor.js') === false) {
    fwrite(STDERR, "Object editor scripts were not loaded completely.\n");
    exit(1);
}

$styles = file_get_contents(dirname(__DIR__) . '/assets/css/admin.css');
$editorScript = file_get_contents(dirname(__DIR__) . '/assets/js/room-editor.js');
$logicScript = file_get_contents(dirname(__DIR__) . '/assets/js/logic-editor.js');
$imageEditScript = file_get_contents(dirname(__DIR__) . '/assets/js/image-area-editor.js');
$objectEditorMarkup = file_get_contents(dirname(__DIR__) . '/admin/object-edit.php');
if ($styles === false || $editorScript === false || $logicScript === false || $imageEditScript === false || $objectEditorMarkup === false) {
    fwrite(STDERR, "Object editor layout assets could not be read.\n");
    exit(1);
}
if (strpos($logicScript, 'logic-add-branch') === false
    || strpos($logicScript, 'logic-add-group') === false
    || strpos($logicScript, 'logic-generate-overlay') === false
    || strpos($logicScript, 'logic-inventory-picker') === false
    || strpos($logicScript, "searchPicker('flag'") === false
    || strpos($logicScript, "searchPicker('object'") === false
    || strpos($logicScript, "searchPicker('description_target'") === false
    || strpos($logicScript, "searchPicker('sound'") === false
    || strpos($logicScript, 'logic-add-behavior') === false
    || strpos($logicScript, 'logic-trigger-type') === false
    || strpos($logicScript, 'overlay-library-toggle') === false) {
    fwrite(STDERR, "Object editor is missing multi-branch logic controls.\n");
    exit(1);
}
if (strpos($objectEditorMarkup, 'json_encode($objectOptions') === false
    || strpos($objectEditorMarkup, 'window.NL_EDITOR_FLAGS') === false
    || strpos($objectEditorMarkup, 'window.NL_EDITOR_SOUNDS') === false
    || strpos($editorScript, 'fresh.automaticBehaviors') === false
    || strpos($editorScript, 'fresh.overlayLibrary') === false
    || strpos($editorScript, 'window.NLImageAreaEditorBridge') === false
    || strpos($imageEditScript, "fetch('api/gemini-edit-background-region.php'") === false
    || strpos($imageEditScript, 'data-cancel-image-edit') === false) {
    fwrite(STDERR, "Object editor is missing inventory object choices.\n");
    exit(1);
}
if (strpos($objectEditorMarkup, "nightlatch_asset('js/region-bounds.js')") === false
    || strpos($editorScript, "beginRegionTransform('move'") === false
    || strpos($editorScript, "beginRegionTransform('resize'") === false
    || strpos($styles, '.region-transform-handle.move') === false
    || strpos($styles, '.region-transform-handle.resize') === false) {
    fwrite(STDERR, "Object editor is missing region move or resize controls.\n");
    exit(1);
}
$captureEndpoint = file_get_contents(dirname(__DIR__) . '/admin/api/capture-region-overlay.php');
if ($captureEndpoint === false
    || strpos($captureEndpoint, 'nightlatch_capture_region_overlay') === false
    || strpos($editorScript, "fetch('api/capture-region-overlay.php'") === false
    || strpos($editorScript, "source: 'captured'") === false
    || strpos($logicScript, "entry.source === 'captured'") === false
    || strpos($styles, '.region-overlay-capture') === false) {
    fwrite(STDERR, "Object editor is missing current-region overlay capture.\n");
    exit(1);
}
$roomEditorMarkup = file_get_contents(dirname(__DIR__) . '/admin/room-edit.php');
if ($roomEditorMarkup === false
    || strpos($roomEditorMarkup, 'id="region-logic-editor"') === false
    || strpos($roomEditorMarkup, 'id="region-move-handle"') === false
    || strpos($roomEditorMarkup, 'id="region-resize-handle"') === false
    || strpos($roomEditorMarkup, 'id="capture-region-overlay"') === false
    || strpos($roomEditorMarkup, 'id="captured-overlay-summary"') === false
    || strpos($roomEditorMarkup, "nightlatch_asset('js/region-bounds.js')") === false
    || strpos($roomEditorMarkup, 'window.NL_EDITOR_OBJECTS') === false
    || strpos($roomEditorMarkup, "nightlatch_asset('js/logic-editor.js')") === false
    || strpos($roomEditorMarkup, "nightlatch_asset('js/image-area-editor.js')") === false) {
    fwrite(STDERR, "Room editor is missing the shared multi-branch rule builder.\n");
    exit(1);
}
if (strpos($styles, 'grid-template-rows: minmax(0, 1fr)') === false
    || strpos($styles, '.editor-sidebar, .inspector { min-height: 0;') === false
    || strpos($styles, '.editor-workspace { min-width: 0; min-height: 0; overflow: hidden;') === false) {
    fwrite(STDERR, "Object editor columns are not constrained to the viewport.\n");
    exit(1);
}
if (strpos($editorScript, "image.addEventListener('load', scheduleZoom)") === false
    || strpos($editorScript, 'new ResizeObserver(scheduleZoom).observe(canvasStage)') === false) {
    fwrite(STDERR, "Object editor does not refit the image after layout and image changes.\n");
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
