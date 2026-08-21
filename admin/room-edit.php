<?php
require dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/content-variables.php';
require_once dirname(__DIR__) . '/app/map-topology.php';
require_once dirname(__DIR__) . '/app/sounds.php';
nightlatch_require_admin();

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$room = array(
    'id' => 0,
    'title' => 'Untitled room',
    'slug' => '',
    'description' => '',
    'playerDescription' => '',
    'status' => 'development',
    'backgroundAsset' => '../assets/graphics/rooms/demo-room.svg',
    'backgroundPrompt' => '',
    'data' => array(
        'version' => 2,
        'canvas' => array('width' => 1600, 'height' => 900),
        'regions' => array(),
    ),
    'updatedAt' => null,
);
$error = '';
$objectOptions = array();
$flagOptions = array();
$roomOptions = array();
$soundOptions = array();
$clusterOptions = array();
$roomClusterId = 0;
$roomGateway = array('enabled' => false, 'roomId' => $id, 'destinationCount' => 1, 'exitRegionIds' => array(), 'candidateClusterIds' => array());
if ($id) {
    try {
        $stmt = nightlatch_db()->prepare('SELECT * FROM rooms WHERE id = ?');
        $stmt->execute(array($id));
        $row = $stmt->fetch();
        if (!$row) {
            throw new RuntimeException('That room no longer exists.');
        }
        $room = nightlatch_room_payload($row);
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
try {
    $soundOptions = nightlatch_sound_catalog(nightlatch_db());
} catch (Throwable $exception) {
    $soundOptions = array();
}
try {
    $topology = nightlatch_load_topology(nightlatch_db(), true);
    nightlatch_apply_topology_to_rooms($topology['rooms'], $topology['connections'], $topology['gateways']);
    $clusterById = array();
    foreach ($topology['clusters'] as $cluster) {
        $clusterById[(string) $cluster['id']] = $cluster;
        $clusterOptions[] = $cluster;
    }
    $clusterByRoom = array();
    foreach ($topology['nodes'] as $node) {
        $clusterByRoom[(string) $node['roomId']] = (int) $node['clusterId'];
    }
    foreach ($topology['rooms'] as $topologyRoom) {
        $clusterId = isset($clusterByRoom[(string) $topologyRoom['id']]) ? $clusterByRoom[(string) $topologyRoom['id']] : 0;
        $roomOptions[] = array(
            'id' => $topologyRoom['id'],
            'title' => $topologyRoom['title'],
            'slug' => $topologyRoom['slug'],
            'clusterId' => $clusterId,
            'clusterName' => $clusterId && isset($clusterById[(string) $clusterId]) ? $clusterById[(string) $clusterId]['name'] : 'Unassigned',
        );
        if ($id && (int) $topologyRoom['id'] === $id) {
            $room['data'] = $topologyRoom['data'];
        }
    }
    if ($id && isset($clusterByRoom[(string) $id])) {
        $roomClusterId = $clusterByRoom[(string) $id];
    }
    foreach ($topology['gateways'] as $gateway) {
        if ($id && (int) $gateway['roomId'] === $id) {
            $roomGateway = $gateway;
            $roomGateway['enabled'] = true;
            break;
        }
    }
} catch (Throwable $exception) {
    $roomOptions = array();
    $clusterOptions = array();
}

$pageTitle = ($id ? 'Edit room' : 'Create room') . ' · Nightlatch Room Forge';
require __DIR__ . '/_header.php';
?>
<div class="editor-shell" id="room-editor">
    <aside class="editor-rail">
        <a class="rail-back" href="index.php"><i class="fa-solid fa-chevron-left"></i><span>Rooms</span></a>
        <button class="rail-tool active" data-panel="regions"><i class="fa-solid fa-vector-square"></i><span>Regions</span></button>
        <button class="rail-tool" data-panel="assets"><i class="fa-regular fa-images"></i><span>Assets</span></button>
        <button class="rail-tool" data-panel="settings"><i class="fa-solid fa-sliders"></i><span>Room</span></button>
        <a class="rail-tool rail-bottom" id="debug-link" href="<?php echo $id ? 'play-debug.php?id=' . $id : '#'; ?>"><i class="fa-solid fa-bug"></i><span>Debug</span></a>
    </aside>

    <section class="editor-sidebar">
        <?php if ($error): ?><div class="nl-alert compact"><?php echo nightlatch_h($error); ?></div><?php endif; ?>
        <div class="editor-panel active" data-panel-content="regions">
            <div class="sidebar-heading"><div><span class="eyebrow">Interaction map</span><h2>Clickable regions</h2></div><button id="add-region" class="icon-button gold" title="Draw a region"><i class="fa-solid fa-plus"></i></button></div>
            <p class="hint">Choose “Draw region,” then drag a rectangle over the room image.</p>
            <button class="draw-callout" id="draw-region"><i class="fa-solid fa-pen-ruler"></i><span><strong>Draw region</strong><small>Drag over the image</small></span></button>
            <div class="region-list" id="region-list"></div>
        </div>

        <div class="editor-panel" data-panel-content="assets">
            <div class="sidebar-heading"><div><span class="eyebrow">Room artwork</span><h2>Background</h2></div></div>
            <label class="upload-drop" for="asset-upload"><i class="fa-solid fa-cloud-arrow-up"></i><strong>Upload room image</strong><span>PNG, JPG or WebP · up to 12 MB</span><input id="asset-upload" type="file" accept="image/png,image/jpeg,image/webp"></label>
            <button type="button" class="btn-ghost btn-block image-area-edit-launch" id="open-image-area-edit"><i class="fa-solid fa-wand-magic-sparkles"></i> Edit an image area</button>
            <div class="or-divider"><span>or create with Gemini</span></div>
            <label for="gemini-prompt">Image prompt</label>
            <textarea id="gemini-prompt" rows="8" placeholder="A moody Victorian conservatory at midnight, point-and-click game background, straight-on view, no people..."><?php echo nightlatch_h($room['backgroundPrompt']); ?></textarea>
            <div class="prompt-meta"><span><i class="fa-solid fa-wand-magic-sparkles"></i> Uses configured Gemini model</span><span id="prompt-count">0 / 2000</span></div>
            <button class="btn-forge btn-block" id="generate-image"><i class="fa-solid fa-sparkles"></i> Generate background</button>
            <div class="generation-status" id="generation-status"></div>
        </div>

        <div class="editor-panel" data-panel-content="settings">
            <div class="sidebar-heading"><div><span class="eyebrow">Node details</span><h2>Room settings</h2></div></div>
            <label for="room-title">Room title</label><input id="room-title" value="<?php echo nightlatch_h($room['title']); ?>">
            <label for="room-slug">Slug</label><input id="room-slug" value="<?php echo nightlatch_h($room['slug']); ?>" placeholder="created-from-title">
            <label for="player-description">Player description</label><textarea id="player-description" rows="5" placeholder="A dark, lonely room."><?php echo nightlatch_h($room['playerDescription']); ?></textarea><p class="hint">Hidden during play until the player chooses the eye control. Results may replace this text for the current session.</p>
            <label for="room-description">Designer notes</label><textarea id="room-description" rows="6"><?php echo nightlatch_h($room['description']); ?></textarea>
            <label for="room-status">Lifecycle</label><select id="room-status"><option value="development"<?php echo $room['status'] === 'development' ? ' selected' : ''; ?>>Development · local draft</option><option value="staging" disabled<?php echo $room['status'] === 'staging' ? ' selected' : ''; ?>>Staging · S3 publishing required</option><option value="production" disabled<?php echo $room['status'] === 'production' ? ' selected' : ''; ?>>Production · S3 publishing required</option></select>
            <p class="hint">This first pass authors local development rooms. Staging and production will be enabled with the S3 publishing workflow.</p>
            <div class="node-note"><i class="fa-solid fa-circle-nodes"></i><p><strong>Cluster membership and connections live in the Map tab.</strong> This room is <?php echo $roomClusterId ? 'assigned to a cluster' : 'currently unassigned'; ?>.</p></div>
            <div class="gateway-room-settings" id="gateway-room-settings">
                <label class="check-row map-check"><input type="checkbox" id="room-gateway-enabled"<?php echo !$roomClusterId ? ' disabled' : ''; ?>><span><strong>Gateway room</strong><small>Assign selected door regions to random cluster entry rooms for each play session.</small></span></label>
                <div id="room-gateway-fields" hidden>
                    <label for="room-gateway-count">Destination clusters selected</label><input type="number" id="room-gateway-count" min="1" max="100" value="1">
                    <h3>Gateway exits</h3><div id="room-gateway-exits" class="map-check-list"></div>
                    <h3>Eligible clusters</h3><div id="room-gateway-candidates" class="map-check-list"></div>
                    <div id="room-gateway-status" class="gateway-status"></div>
                </div>
                <?php if (!$roomClusterId): ?><p class="hint">Save the room, then assign it to a cluster from <a href="map.php">Map</a> before enabling Gateway behavior.</p><?php endif; ?>
            </div>
            <?php if ($id): ?><button class="danger-button" id="delete-room"><i class="fa-solid fa-trash"></i> Delete room</button><?php endif; ?>
        </div>
    </section>

    <section class="editor-workspace">
        <div class="workspace-toolbar">
            <div><span class="save-indicator" id="save-indicator"><i class="fa-regular fa-circle-check"></i> Not saved</span></div>
            <div class="zoom-controls"><button id="zoom-out"><i class="fa-solid fa-minus"></i></button><span id="zoom-label">Fit</span><button id="zoom-in"><i class="fa-solid fa-plus"></i></button></div>
            <div><button class="btn-ghost" id="preview-room"><i class="fa-solid fa-play"></i> Debug play</button><button class="btn-forge" id="save-room"><i class="fa-solid fa-floppy-disk"></i> Save room</button></div>
        </div>
        <div class="canvas-stage" id="canvas-stage">
            <div class="room-canvas" id="room-canvas">
                <img id="room-image" src="<?php echo nightlatch_h($room['backgroundAsset']); ?>" alt="Room background">
                <svg id="region-layer" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-label="Room interaction regions"></svg>
                <div class="draw-instruction" id="draw-instruction"><i class="fa-solid fa-crosshairs"></i> Drag to mark a clickable area · Esc to cancel</div>
            </div>
        </div>
    </section>

    <aside class="inspector" id="inspector">
        <div class="inspector-empty" id="inspector-empty"><i class="fa-solid fa-arrow-pointer"></i><h2>Select a region</h2><p>Choose a region on the canvas or draw a new one to configure its behavior.</p></div>
        <div class="inspector-content" id="inspector-content">
            <div class="inspector-heading"><div><span class="eyebrow">Selected region</span><h2 id="inspector-title">Region</h2></div><button id="delete-region" class="icon-button danger" title="Delete region"><i class="fa-solid fa-trash"></i></button></div>
            <label for="region-name">Name</label><input id="region-name" placeholder="Locked cabinet">
            <label for="region-kind">Region type</label><select id="region-kind"><option value="interaction">Interaction</option><option value="door">Door / exit</option></select>
            <div class="region-logic-editor" id="region-logic-editor"></div>
            <div id="door-fields">
                <label class="check-row map-check" id="door-gateway-row"><input id="door-gateway-exit" type="checkbox"><span><strong>Gateway exit</strong><small>This door receives a random eligible cluster instead of a static room.</small></span></label>
                <div id="door-reserved-return" class="node-note" hidden><i class="fa-solid fa-rotate-left"></i><p><strong>Reserved Gateway return.</strong> This door returns the player from this cluster to its assigned Gateway and cannot have another destination.</p></div>
                <div id="static-door-fields"><label>Target room</label><input id="target-room" type="hidden"><div id="target-room-picker" class="logic-inventory-picker room-target-picker"></div></div>
                <label class="check-row"><input id="door-unlocked" type="checkbox"><span>Door starts unlocked</span></label><p class="hint">A behind-you return, paired door, or one-way behavior can be configured from the Map tab.</p>
            </div>
            <div class="bounds-readout"><span>Position</span><code id="region-bounds">x 0 · y 0 · w 0 · h 0</code></div>
        </div>
    </aside>
</div>
<?php require __DIR__ . '/_image-area-editor.php'; ?>
<script>window.NL_ROOM_BOOTSTRAP = <?php echo json_encode($room, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_EDITOR_OBJECTS = <?php echo json_encode($objectOptions, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_EDITOR_FLAGS = <?php echo json_encode($flagOptions, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_EDITOR_ROOMS = <?php echo json_encode($roomOptions, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_EDITOR_SOUNDS = <?php echo json_encode($soundOptions, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_EDITOR_CLUSTERS = <?php echo json_encode($clusterOptions, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_EDITOR_GATEWAY = <?php echo json_encode($roomGateway, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_EDITOR_ROOM_CLUSTER_ID = <?php echo json_encode($roomClusterId); ?>; window.NL_EDITOR_CONTEXT = { kind: 'room', apiUrl: 'api/rooms.php', editUrl: 'room-edit.php', listUrl: 'index.php', debugUrl: 'play-debug.php', assetType: 'rooms' }; window.NL_CSRF = <?php echo json_encode(nightlatch_csrf_token()); ?>;</script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/room-rules.js')); ?>"></script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/logic-editor.js')); ?>"></script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/room-editor.js')); ?>"></script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/image-area-editor.js')); ?>"></script>
<?php require __DIR__ . '/_footer.php'; ?>
