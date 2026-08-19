<?php
require dirname(__DIR__) . '/app/bootstrap.php';
nightlatch_require_admin();

$rooms = array();
$error = '';
try {
    $rooms = nightlatch_db()->query('SELECT id, title, slug, status, background_asset, updated_at FROM rooms ORDER BY updated_at DESC')->fetchAll();
} catch (Throwable $exception) {
    $error = 'Rooms could not be loaded. Confirm that database/updates/001_admin_room_creator.sql has been applied.';
}

$pageTitle = 'Rooms · Nightlatch Room Forge';
require __DIR__ . '/_header.php';
?>
<section class="page-wrap">
    <div class="page-heading">
        <div><div class="eyebrow">House inventory</div><h1>Rooms</h1><p>Build the nodes, puzzles, and locked passages that make up the house.</p></div>
        <a class="btn-forge" href="room-edit.php"><i class="fa-solid fa-plus"></i> Create room</a>
    </div>
    <?php if ($error): ?><div class="alert nl-alert"><?php echo nightlatch_h($error); ?></div><?php endif; ?>
    <div class="stats-grid">
        <div class="stat-card"><i class="fa-solid fa-cubes-stacked"></i><span><strong><?php echo count($rooms); ?></strong>Total rooms</span></div>
        <div class="stat-card"><i class="fa-solid fa-hammer"></i><span><strong><?php echo count(array_filter($rooms, function ($room) { return $room['status'] === 'development'; })); ?></strong>In development</span></div>
        <div class="stat-card"><i class="fa-solid fa-cloud-arrow-up"></i><span><strong><?php echo count(array_filter($rooms, function ($room) { return $room['status'] !== 'development'; })); ?></strong>Published</span></div>
    </div>
    <?php if (!$rooms && !$error): ?>
        <div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-door-closed"></i></div><h2>The halls are empty</h2><p>Create the first room and give the house somewhere to begin.</p><a class="btn-forge" href="room-edit.php">Create the first room</a></div>
    <?php elseif ($rooms): ?>
        <div class="room-grid">
            <?php foreach ($rooms as $room): ?>
                <article class="room-card">
                    <a class="room-thumb" href="room-edit.php?id=<?php echo (int) $room['id']; ?>"><?php if ($room['background_asset']): ?><img src="<?php echo nightlatch_h($room['background_asset']); ?>" alt=""><?php endif; ?><span class="status-badge status-<?php echo nightlatch_h($room['status']); ?>"><?php echo nightlatch_h($room['status']); ?></span></a>
                    <div class="room-card-body"><h2><?php echo nightlatch_h($room['title']); ?></h2><code><?php echo nightlatch_h($room['slug']); ?></code><p>Edited <?php echo nightlatch_h(date('M j, Y', strtotime($room['updated_at']))); ?></p><div class="room-actions"><a href="room-edit.php?id=<?php echo (int) $room['id']; ?>"><i class="fa-solid fa-pen"></i> Edit</a><a href="play-debug.php?id=<?php echo (int) $room['id']; ?>"><i class="fa-solid fa-bug"></i> Debug</a></div></div>
                </article>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</section>
<?php require __DIR__ . '/_footer.php'; ?>
