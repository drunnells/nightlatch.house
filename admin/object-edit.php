<?php
require dirname(__DIR__) . '/app/bootstrap.php';
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
        'version' => 1,
        'canvas' => array('width' => 1200, 'height' => 1200),
        'regions' => array(),
    ),
    'updatedAt' => null,
);
$error = '';
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
            <div class="section-rule"><span>IF</span></div>
            <label for="condition-source">Value source</label><select id="condition-source"><option value="flag">Flag</option><option value="item">Collectable item</option><option value="always">Always</option></select>
            <label for="condition-key">Flag or item key</label><input id="condition-key" placeholder="small_brass_key">
            <div class="two-cols"><div><label for="condition-operator">Check</label><select id="condition-operator"><option value="equals">Equals</option><option value="not_equals">Does not equal</option><option value="exists">Exists</option><option value="not_exists">Does not exist</option></select></div><div><label for="condition-value">Value</label><input id="condition-value" placeholder="1"></div></div>
            <div class="section-rule then"><span>THEN</span></div>
            <label for="success-message">Player message</label><textarea id="success-message" rows="3" placeholder="A hidden compartment clicks open."></textarea>
            <label for="overlay-asset">Graphic overlay URL</label><input id="overlay-asset" placeholder="../assets/graphics/objects/generated/compartment-open.jpg">
            <label class="mini-upload" for="overlay-upload"><i class="fa-solid fa-upload"></i> Upload overlay graphic<input id="overlay-upload" type="file" accept="image/png,image/jpeg,image/webp"></label>
            <button type="button" class="overlay-generator-toggle" id="toggle-overlay-generator" aria-expanded="false"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Generate overlay with Gemini</span><i class="fa-solid fa-chevron-down"></i></button>
            <div class="overlay-generator" id="overlay-generator">
                <p class="hint">Gemini receives the exact object crop inside a fixed template. Describe only what should change.</p>
                <label for="overlay-prompt">Overlay edit prompt</label>
                <textarea id="overlay-prompt" rows="4" maxlength="2000" placeholder="Show the small compartment open with a brass key inside."></textarea>
                <div class="prompt-meta"><span><i class="fa-solid fa-crop-simple"></i> Uses selected region</span><span id="overlay-prompt-count">0 / 2000</span></div>
                <button type="button" class="btn-forge btn-block" id="generate-overlay"><i class="fa-solid fa-sparkles"></i> Generate region overlay</button>
                <div class="generation-status" id="overlay-generation-status"></div>
                <img class="overlay-preview" id="overlay-preview" alt="Generated object region overlay preview">
            </div>
            <label for="set-flag-key">Set flag</label><div class="two-cols"><input id="set-flag-key" placeholder="puzzle_box"><input id="set-flag-value" placeholder="open"></div>
            <label for="grant-item">Grant item / inventory key</label><input id="grant-item" placeholder="small_brass_key">
            <div class="section-rule fallback"><span>OTHERWISE</span></div>
            <label for="failure-message">Player message</label><textarea id="failure-message" rows="3" placeholder="The latch refuses to move."></textarea>
            <div class="bounds-readout"><span>Position</span><code id="region-bounds">x 0 · y 0 · w 0 · h 0</code></div>
        </div>
    </aside>
</div>
<script>window.NL_ROOM_BOOTSTRAP = <?php echo json_encode($object, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_EDITOR_CONTEXT = { kind: 'object', apiUrl: 'api/objects.php', editUrl: 'object-edit.php', listUrl: 'objects.php', debugUrl: '', assetType: 'objects' }; window.NL_CSRF = <?php echo json_encode(nightlatch_csrf_token()); ?>;</script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/room-editor.js')); ?>"></script>
<?php require __DIR__ . '/_footer.php'; ?>
