<?php
require dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/content-variables.php';
nightlatch_require_admin();

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$object = array(
    'id' => 0,
    'title' => 'Untitled object',
    'slug' => '',
    'description' => '',
    'status' => 'development',
    'backgroundAsset' => '../assets/graphics/objects/demo-object.svg',
    'backgroundPrompt' => '',
    'portable' => false,
    'inventoryKey' => '',
    'data' => array(
        'version' => 2,
        'canvas' => array('width' => 1200, 'height' => 1200),
        'regions' => array(),
    ),
    'updatedAt' => null,
);
$error = '';
$objectOptions = array();
$flagOptions = array();
if ($id) {
    try {
        $stmt = nightlatch_db()->prepare('SELECT * FROM objects WHERE id = ?');
        $stmt->execute(array($id));
        $row = $stmt->fetch();
        if (!$row) {
            throw new RuntimeException('That object no longer exists.');
        }
        $object = nightlatch_object_payload($row);
    } catch (Throwable $exception) {
        $error = $exception->getMessage();
    }
}
try {
    $objectOptions = nightlatch_db()->query('SELECT title, slug, portable, inventory_key FROM objects ORDER BY title')->fetchAll();
} catch (Throwable $exception) {
    $objectOptions = array();
}
try {
    $flagOptions = nightlatch_flag_catalog();
} catch (Throwable $exception) {
    $flagOptions = array();
}

$pageTitle = ($id ? 'Edit object' : 'Create object') . ' · Nightlatch Room Forge';
require __DIR__ . '/_header.php';
?>
<div class="editor-shell" id="room-editor" data-content-kind="object">
    <aside class="editor-rail">
        <a class="rail-back" href="objects.php"><i class="fa-solid fa-chevron-left"></i><span>Objects</span></a>
        <button class="rail-tool active" data-panel="regions"><i class="fa-solid fa-vector-square"></i><span>Regions</span></button>
        <button class="rail-tool" data-panel="assets"><i class="fa-regular fa-images"></i><span>Assets</span></button>
        <button class="rail-tool" data-panel="settings"><i class="fa-solid fa-sliders"></i><span>Object</span></button>
    </aside>

    <section class="editor-sidebar">
        <?php if ($error): ?><div class="nl-alert compact"><?php echo nightlatch_h($error); ?></div><?php endif; ?>
        <div class="editor-panel active" data-panel-content="regions">
            <div class="sidebar-heading"><div><span class="eyebrow">Interaction map</span><h2>Clickable regions</h2></div><button id="add-region" class="icon-button gold" title="Draw a region"><i class="fa-solid fa-plus"></i></button></div>
            <p class="hint">Choose “Draw region,” then drag a rectangle over the close-up object image.</p>
            <button class="draw-callout" id="draw-region"><i class="fa-solid fa-pen-ruler"></i><span><strong>Draw region</strong><small>Drag over the image</small></span></button>
            <div class="region-list" id="region-list"></div>
        </div>

        <div class="editor-panel" data-panel-content="assets">
            <div class="sidebar-heading"><div><span class="eyebrow">Object artwork</span><h2>Background</h2></div></div>
            <label class="upload-drop" for="asset-upload"><i class="fa-solid fa-cloud-arrow-up"></i><strong>Upload object image</strong><span>PNG, JPG or WebP · up to 12 MB</span><input id="asset-upload" type="file" accept="image/png,image/jpeg,image/webp"></label>
            <div class="or-divider"><span>or create with Gemini</span></div>
            <label for="gemini-prompt">Image prompt</label>
            <textarea id="gemini-prompt" rows="8" placeholder="A close-up of an ornate Victorian puzzle box, centered, straight-on view, dark point-and-click game artwork..."><?php echo nightlatch_h($object['backgroundPrompt']); ?></textarea>
            <div class="prompt-meta"><span><i class="fa-solid fa-wand-magic-sparkles"></i> Uses configured Gemini model</span><span id="prompt-count">0 / 2000</span></div>
            <button class="btn-forge btn-block" id="generate-image"><i class="fa-solid fa-sparkles"></i> Generate object image</button>
            <div class="generation-status" id="generation-status"></div>
            <div class="object-image-tools">
                <button type="button" class="btn-ghost btn-block" id="open-image-area-edit"><i class="fa-solid fa-wand-magic-sparkles"></i> Edit an image area</button>
                <button type="button" class="btn-ghost btn-block" id="open-object-crop"><i class="fa-solid fa-crop-simple"></i> Crop or lasso object</button>
                <div class="reference-source-card">
                    <div><span class="eyebrow">Optional Gemini reference</span><strong id="reference-source-title">No reference selected</strong><small id="reference-source-detail">Choose a saved room or object image, then mark the exact area to use.</small></div>
                    <canvas id="reference-crop-preview" width="240" height="140" hidden></canvas>
                    <div class="reference-source-actions"><button type="button" class="btn-ghost" id="open-reference-picker"><i class="fa-regular fa-images"></i> Choose reference</button><button type="button" class="icon-button danger" id="clear-reference" title="Clear reference" hidden><i class="fa-solid fa-xmark"></i></button></div>
                </div>
            </div>
        </div>

        <div class="editor-panel" data-panel-content="settings">
            <div class="sidebar-heading"><div><span class="eyebrow">Examineable content</span><h2>Object settings</h2></div></div>
            <label for="room-title">Object title</label><input id="room-title" value="<?php echo nightlatch_h($object['title']); ?>">
            <label for="room-slug">Stable slug</label><input id="room-slug" value="<?php echo nightlatch_h($object['slug']); ?>" placeholder="created-from-title"<?php echo $id ? ' readonly' : ''; ?>>
            <label for="room-description">Designer notes</label><textarea id="room-description" rows="5"><?php echo nightlatch_h($object['description']); ?></textarea>
            <label class="check-row portable-setting"><input id="object-portable" type="checkbox"<?php echo !empty($object['portable']) ? ' checked' : ''; ?>><span>Player can carry this object</span></label>
            <div id="inventory-key-fields"><label for="inventory-key">Inventory key</label><input id="inventory-key" value="<?php echo nightlatch_h($object['inventoryKey']); ?>" placeholder="defaults-to-object-slug"><p class="hint">Grant this key from a successful room or object region to put the object in the player inventory.</p></div>
            <label for="room-status">Lifecycle</label><select id="room-status"><option value="development"<?php echo $object['status'] === 'development' ? ' selected' : ''; ?>>Development · local draft</option><option value="staging" disabled<?php echo $object['status'] === 'staging' ? ' selected' : ''; ?>>Staging · S3 publishing required</option><option value="production" disabled<?php echo $object['status'] === 'production' ? ' selected' : ''; ?>>Production · S3 publishing required</option></select>
            <p class="hint">Room-bound objects open only from regions that reference them. Portable objects also appear in inventory while their inventory key is owned.</p>
            <?php if ($id): ?><button class="danger-button" id="delete-room"><i class="fa-solid fa-trash"></i> Delete object</button><?php endif; ?>
        </div>
    </section>

    <section class="editor-workspace">
        <div class="workspace-toolbar">
            <div><span class="save-indicator" id="save-indicator"><i class="fa-regular fa-circle-check"></i> Not saved</span></div>
            <div class="zoom-controls"><button id="zoom-out"><i class="fa-solid fa-minus"></i></button><span id="zoom-label">Fit</span><button id="zoom-in"><i class="fa-solid fa-plus"></i></button></div>
            <div><button class="btn-forge" id="save-room"><i class="fa-solid fa-floppy-disk"></i> Save object</button></div>
        </div>
        <div class="canvas-stage" id="canvas-stage">
            <div class="room-canvas" id="room-canvas">
                <img id="room-image" src="<?php echo nightlatch_h($object['backgroundAsset']); ?>" alt="Object close-up">
                <svg id="region-layer" viewBox="0 0 1200 1200" preserveAspectRatio="none" aria-label="Object interaction regions"></svg>
                <div class="draw-instruction" id="draw-instruction"><i class="fa-solid fa-crosshairs"></i> Drag to mark a clickable area · Esc to cancel</div>
            </div>
        </div>
    </section>

    <aside class="inspector" id="inspector">
        <div class="inspector-empty" id="inspector-empty"><i class="fa-solid fa-arrow-pointer"></i><h2>Select a region</h2><p>Choose a region on the object or draw a new one to configure its behavior.</p></div>
        <div class="inspector-content" id="inspector-content">
            <div class="inspector-heading"><div><span class="eyebrow">Selected region</span><h2 id="inspector-title">Region</h2></div><button id="delete-region" class="icon-button danger" title="Delete region"><i class="fa-solid fa-trash"></i></button></div>
            <label for="region-name">Name</label><input id="region-name" placeholder="Hidden latch">
            <input id="region-kind" type="hidden" value="interaction">
            <div class="region-logic-editor" id="region-logic-editor"></div>
            <div class="bounds-readout"><span>Position</span><code id="region-bounds">x 0 · y 0 · w 0 · h 0</code></div>
        </div>
    </aside>
</div>
<?php require __DIR__ . '/_image-area-editor.php'; ?>
<div class="image-workspace" id="object-crop-workspace" hidden role="dialog" aria-modal="true" aria-labelledby="object-crop-title">
    <div class="image-workspace-backdrop" data-close-image-workspace></div>
    <section class="image-workspace-card">
        <header class="image-workspace-header"><div><span class="eyebrow">Object extraction</span><h2 id="object-crop-title">Crop the current image</h2></div><button type="button" class="object-close" data-close-image-workspace><i class="fa-solid fa-xmark"></i><span>Close</span></button></header>
        <div class="image-workspace-toolbar"><div class="selection-modes"><button type="button" class="active" data-crop-mode="rectangle"><i class="fa-regular fa-square"></i> Rectangle</button><button type="button" data-crop-mode="lasso"><i class="fa-solid fa-draw-polygon"></i> Lasso</button></div><p id="crop-instruction">Drag a rectangle tightly around the object.</p></div>
        <div class="image-selection-stage"><div class="image-selection-canvas" id="object-crop-canvas"><img id="object-crop-image" alt="Object crop source"><svg id="object-crop-layer" preserveAspectRatio="none"></svg></div></div>
        <footer class="image-workspace-footer"><span id="crop-selection-status">No selection yet</span><div><button type="button" class="btn-ghost" id="reset-object-crop"><i class="fa-solid fa-rotate-left"></i> Reset</button><button type="button" class="btn-ghost" id="close-lasso" hidden><i class="fa-solid fa-link"></i> Close shape</button><button type="button" class="btn-forge" id="apply-object-crop"><i class="fa-solid fa-crop-simple"></i> Use cropped object</button></div></footer>
    </section>
</div>

<div class="image-workspace" id="reference-workspace" hidden role="dialog" aria-modal="true" aria-labelledby="reference-workspace-title">
    <div class="image-workspace-backdrop" data-close-reference-workspace></div>
    <section class="image-workspace-card reference-workspace-card">
        <header class="image-workspace-header"><div><span class="eyebrow">Gemini visual reference</span><h2 id="reference-workspace-title">Choose an image area</h2></div><button type="button" class="object-close" data-close-reference-workspace><i class="fa-solid fa-xmark"></i><span>Close</span></button></header>
        <div class="asset-library-view" id="asset-library-view">
            <div class="asset-search"><i class="fa-solid fa-magnifying-glass"></i><input id="asset-search" type="search" placeholder="Search saved rooms and objects"><span id="asset-search-count"></span></div>
            <div class="asset-thumbnail-grid" id="asset-thumbnail-grid"><p class="asset-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading saved images…</p></div>
        </div>
        <div class="reference-select-view" id="reference-select-view" hidden>
            <div class="image-workspace-toolbar"><button type="button" class="btn-ghost" id="back-to-assets"><i class="fa-solid fa-chevron-left"></i> Images</button><p><strong id="selected-reference-title"></strong> · Drag a rectangle around the exact reference area.</p></div>
            <div class="image-selection-stage"><div class="image-selection-canvas" id="reference-selection-canvas"><img id="reference-selection-image" alt="Reference selection source"><svg id="reference-selection-layer" preserveAspectRatio="none"></svg></div></div>
            <footer class="image-workspace-footer"><span id="reference-selection-status">No area selected</span><button type="button" class="btn-forge" id="use-reference-selection"><i class="fa-solid fa-check"></i> Use selected area</button></footer>
        </div>
    </section>
</div>
<script>window.NL_ROOM_BOOTSTRAP = <?php echo json_encode($object, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_EDITOR_OBJECTS = <?php echo json_encode($objectOptions, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_EDITOR_FLAGS = <?php echo json_encode($flagOptions, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_EDITOR_CONTEXT = { kind: 'object', apiUrl: 'api/objects.php', editUrl: 'object-edit.php', listUrl: 'objects.php', debugUrl: '', assetType: 'objects' }; window.NL_CSRF = <?php echo json_encode(nightlatch_csrf_token()); ?>;</script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/room-rules.js')); ?>"></script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/logic-editor.js')); ?>"></script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/room-editor.js')); ?>"></script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/object-image-tools.js')); ?>"></script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/image-area-editor.js')); ?>"></script>
<?php require __DIR__ . '/_footer.php'; ?>
