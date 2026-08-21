<?php
require dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/map-topology.php';
require_once dirname(__DIR__) . '/app/sounds.php';
nightlatch_require_admin();

$topology = array('rooms' => array(), 'clusters' => array(), 'nodes' => array(), 'connections' => array(), 'gateways' => array());
$sounds = array();
$error = '';
$soundError = '';
try {
    $topology = nightlatch_load_topology(nightlatch_db(), true);
} catch (Throwable $exception) {
    $error = 'The map data could not be loaded. Apply database updates 003 and 005, then reload this page.';
    try {
        $roomRows = nightlatch_db()->query('SELECT * FROM rooms ORDER BY title')->fetchAll();
        foreach ($roomRows as $row) {
            $topology['rooms'][] = nightlatch_room_payload($row);
        }
    } catch (Throwable $ignored) {
        // The Rooms page provides the base-schema troubleshooting path.
    }
}
try {
    $sounds = nightlatch_sound_catalog(nightlatch_db());
} catch (Throwable $exception) {
    $soundError = 'Ambient sounds could not be loaded. Apply database update 004, then reload this page.';
}

$pageTitle = 'Map · Nightlatch Room Forge';
require __DIR__ . '/_header.php';
?>
<div class="map-shell" id="map-editor">
    <aside class="map-sidebar">
        <div class="map-panel-heading"><div><span class="eyebrow">House graph</span><h1>Clusters</h1></div><button type="button" class="icon-button gold" id="add-cluster" title="Create cluster"><i class="fa-solid fa-plus"></i></button></div>
        <?php if ($error): ?><div class="nl-alert compact"><?php echo nightlatch_h($error); ?></div><?php endif; ?>
        <?php if ($soundError): ?><div class="nl-alert compact"><?php echo nightlatch_h($soundError); ?></div><?php endif; ?>
        <div id="cluster-list" class="cluster-list"></div>
        <section id="cluster-settings" class="map-settings" hidden>
            <div class="map-section-heading"><h2>Cluster settings</h2><button type="button" class="icon-button danger" id="delete-cluster" title="Delete cluster"><i class="fa-solid fa-trash"></i></button></div>
            <label for="cluster-name">Name</label><input id="cluster-name" placeholder="East Wing">
            <label for="cluster-slug">Slug</label><input id="cluster-slug" placeholder="east-wing">
            <label for="cluster-description">Designer notes</label><textarea id="cluster-description" rows="3"></textarea>
            <label for="cluster-ambient-sound">Ambient sound</label>
            <div class="logic-inventory-picker map-sound-picker" id="cluster-ambient-sound-picker">
                <input type="hidden" id="cluster-ambient-sound" value="">
                <button type="button" class="logic-picker-toggle" id="cluster-ambient-sound-toggle" aria-haspopup="listbox" aria-expanded="false"><span><strong id="cluster-ambient-sound-name">No ambient sound</strong><small id="cluster-ambient-sound-detail">Silence in this cluster</small></span><i class="fa-solid fa-chevron-down"></i></button>
                <div class="logic-picker-menu">
                    <label class="logic-picker-search" for="cluster-ambient-sound-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="cluster-ambient-sound-search" placeholder="Search sounds by name or slug"></label>
                    <div class="logic-picker-options" id="cluster-ambient-sound-options" role="listbox"></div>
                </div>
            </div>
            <label class="map-volume-label" for="cluster-ambient-volume"><span>Ambient volume</span><output id="cluster-ambient-volume-value" for="cluster-ambient-volume">35%</output></label>
            <input type="range" id="cluster-ambient-volume" min="0" max="100" step="1" value="35">
            <p class="hint">The selected sound loops while the player explores this cluster. Sound effects continue on their own audio channel.</p>
            <label class="check-row map-check"><input type="checkbox" id="cluster-start"><span>Starting cluster</span></label>
            <label for="cluster-entry-room">Entry room</label><select id="cluster-entry-room"></select>
            <label for="cluster-return-mode">Gateway return</label><select id="cluster-return-mode"><option value="behind">Behind-you control</option><option value="door">Entry-room door region</option></select>
            <div id="cluster-return-door-fields"><label for="cluster-return-door">Return door region</label><select id="cluster-return-door"></select></div>
            <p class="hint">A Gateway destination always enters this room. Its return is either a persistent behind-you control or the selected visible door.</p>
            <div class="map-add-room"><label for="unassigned-room">Add room to cluster</label><div><select id="unassigned-room"></select><button type="button" class="btn-ghost" id="add-room-to-cluster"><i class="fa-solid fa-plus"></i> Add</button></div></div>
        </section>
    </aside>

    <section class="map-workspace">
        <div class="map-toolbar">
            <div><span class="save-indicator" id="map-save-indicator"><i class="fa-regular fa-circle-check"></i> Map loaded</span></div>
            <div class="map-legend"><span><i class="fa-solid fa-arrow-right"></i> Static exit</span><span><i class="fa-solid fa-shuffle"></i> Gateway exit</span></div>
            <button type="button" class="btn-forge" id="save-map"<?php echo $error ? ' disabled' : ''; ?>><i class="fa-solid fa-floppy-disk"></i> Save map</button>
        </div>
        <div class="map-empty" id="map-empty"><i class="fa-solid fa-circle-nodes"></i><h2>Create or select a cluster</h2><p>Arrange rooms and drag a Door / exit handle onto another room to connect them.</p></div>
        <div class="map-stage-wrap" id="map-stage-wrap" hidden>
            <div class="map-stage" id="map-stage">
                <svg id="map-connections" aria-label="Room connections"><defs><marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs></svg>
                <div id="map-nodes"></div>
            </div>
        </div>
    </section>

    <aside class="map-inspector">
        <div class="inspector-empty" id="map-inspector-empty"><i class="fa-solid fa-arrow-pointer"></i><h2>Select a room</h2><p>Choose a node to configure its Gateway behavior and connection return modes.</p></div>
        <div id="map-room-settings" hidden>
            <div class="inspector-heading"><div><span class="eyebrow">Selected node</span><h2 id="map-room-title">Room</h2></div><a class="icon-button" id="map-edit-room" href="#" title="Open room editor"><i class="fa-solid fa-pen"></i></a></div>
            <p id="map-room-cluster" class="map-room-meta"></p>
            <button type="button" class="btn-ghost btn-block" id="remove-room-from-cluster"><i class="fa-solid fa-link-slash"></i> Remove from cluster</button>
            <section class="map-inspector-section">
                <h3>Static connections</h3>
                <p class="hint">Drag a door handle on the map to a destination room. Configure how the player returns here.</p>
                <div id="map-room-connections"></div>
            </section>
            <section class="map-inspector-section gateway-editor">
                <label class="check-row map-check"><input type="checkbox" id="gateway-enabled"><span><strong>Gateway room</strong><small>Randomly maps selected exits to cluster entry rooms.</small></span></label>
                <div id="gateway-fields" hidden>
                    <label for="gateway-count">Destination clusters selected</label><input type="number" id="gateway-count" min="1" max="100" value="1">
                    <h3>Gateway exits</h3><div id="gateway-exits" class="map-check-list"></div>
                    <h3>Eligible clusters</h3><div id="gateway-candidates" class="map-check-list"></div>
                    <div id="gateway-status" class="gateway-status"></div>
                </div>
            </section>
        </div>
    </aside>
</div>
<script>window.NL_MAP_BOOTSTRAP = <?php echo json_encode($topology, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_MAP_SOUNDS = <?php echo json_encode($sounds, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>; window.NL_CSRF = <?php echo json_encode(nightlatch_csrf_token()); ?>;</script>
<script src="<?php echo nightlatch_h(nightlatch_asset('js/map-editor.js')); ?>"></script>
<?php require __DIR__ . '/_footer.php'; ?>
