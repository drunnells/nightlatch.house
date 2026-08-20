<?php
require dirname(__DIR__) . '/app/bootstrap.php';
nightlatch_require_admin();

$objects = array();
$error = '';
try {
    $objects = nightlatch_db()->query('SELECT id, title, slug, status, background_asset, portable, inventory_key, updated_at FROM objects ORDER BY updated_at DESC')->fetchAll();
} catch (Throwable $exception) {
    $error = 'Objects could not be loaded. Confirm that database/updates/002_interactive_objects.sql has been applied.';
}

$pageTitle = 'Objects · Nightlatch Room Forge';
require __DIR__ . '/_header.php';
?>
<section class="page-wrap">
    <div class="page-heading">
        <div><div class="eyebrow">Interactive collection</div><h1>Objects</h1><p>Build close-up views for room fixtures, puzzle props, and portable inventory objects.</p></div>
        <a class="btn-forge" href="object-edit.php"><i class="fa-solid fa-plus"></i> Create object</a>
    </div>
    <?php if ($error): ?><div class="alert nl-alert"><?php echo nightlatch_h($error); ?></div><?php endif; ?>
    <div class="stats-grid">
        <div class="stat-card"><i class="fa-solid fa-magnifying-glass"></i><span><strong><?php echo count($objects); ?></strong>Total objects</span></div>
        <div class="stat-card"><i class="fa-solid fa-suitcase"></i><span><strong><?php echo count(array_filter($objects, function ($object) { return !empty($object['portable']); })); ?></strong>Portable</span></div>
        <div class="stat-card"><i class="fa-solid fa-house"></i><span><strong><?php echo count(array_filter($objects, function ($object) { return empty($object['portable']); })); ?></strong>Room-bound</span></div>
    </div>
    <?php if (!$objects && !$error): ?>
        <div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div><h2>Nothing to examine yet</h2><p>Create an object, then reference it from a room region.</p><a class="btn-forge" href="object-edit.php">Create the first object</a></div>
    <?php elseif ($objects): ?>
        <div class="room-grid">
            <?php foreach ($objects as $object): ?>
                <article class="room-card object-card">
                    <a class="room-thumb" href="object-edit.php?id=<?php echo (int) $object['id']; ?>"><?php if ($object['background_asset']): ?><img src="<?php echo nightlatch_h($object['background_asset']); ?>" alt=""><?php endif; ?><span class="status-badge status-<?php echo nightlatch_h($object['status']); ?>"><?php echo !empty($object['portable']) ? 'portable' : 'room-bound'; ?></span></a>
                    <div class="room-card-body"><h2><?php echo nightlatch_h($object['title']); ?></h2><code><?php echo nightlatch_h($object['slug']); ?></code><?php if ($object['inventory_key']): ?><p>Inventory key: <code><?php echo nightlatch_h($object['inventory_key']); ?></code></p><?php else: ?><p>Edited <?php echo nightlatch_h(date('M j, Y', strtotime($object['updated_at']))); ?></p><?php endif; ?><div class="room-actions"><a href="object-edit.php?id=<?php echo (int) $object['id']; ?>"><i class="fa-solid fa-pen"></i> Edit</a></div></div>
                </article>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</section>
<?php require __DIR__ . '/_footer.php'; ?>
