<?php
require dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/content-variables.php';
nightlatch_require_admin();

$flags = array();
$error = '';
try {
    $flags = nightlatch_flag_catalog();
} catch (Throwable $exception) {
    $error = 'Flags could not be cataloged. Confirm that the room and object database updates have been applied.';
}

$referenceCount = 0;
foreach ($flags as $flag) $referenceCount += count($flag['references']);
$pageTitle = 'Flags · Nightlatch Room Forge';
require __DIR__ . '/_header.php';
?>
<section class="page-wrap">
    <div class="page-heading">
        <div><div class="eyebrow">Shared runtime state</div><h1>Flags</h1><p>Find reusable flag names and every saved room or object region that reads, sets, or clears them.</p></div>
    </div>
    <?php if ($error): ?><div class="alert nl-alert"><?php echo nightlatch_h($error); ?></div><?php endif; ?>
    <div class="stats-grid flag-stats">
        <div class="stat-card"><i class="fa-solid fa-flag"></i><span><strong><?php echo count($flags); ?></strong>Unique flags</span></div>
        <div class="stat-card"><i class="fa-solid fa-link"></i><span><strong><?php echo $referenceCount; ?></strong>Region associations</span></div>
        <div class="stat-card"><i class="fa-solid fa-code-branch"></i><span><strong>Live</strong>Derived from saved logic</span></div>
    </div>
    <?php if ($flags): ?>
        <div class="flag-search"><i class="fa-solid fa-magnifying-glass"></i><input id="flag-catalog-search" type="search" placeholder="Search flags, rooms, objects, or regions"><span id="flag-catalog-count"><?php echo count($flags); ?> flags</span></div>
        <div class="flag-catalog" id="flag-catalog">
            <?php foreach ($flags as $flag): ?>
                <?php
                $searchParts = array($flag['key']);
                foreach ($flag['references'] as $reference) {
                    $searchParts[] = $reference['contentTitle'];
                    $searchParts[] = $reference['contentSlug'];
                    $searchParts[] = $reference['regionName'];
                }
                ?>
                <article class="flag-card" data-flag-search="<?php echo nightlatch_h(strtolower(implode(' ', $searchParts))); ?>">
                    <header><div><i class="fa-solid fa-flag"></i><code><?php echo nightlatch_h($flag['key']); ?></code></div><span><?php echo count($flag['references']); ?> association<?php echo count($flag['references']) === 1 ? '' : 's'; ?></span></header>
                    <div class="flag-references">
                        <?php foreach ($flag['references'] as $reference): ?>
                            <?php
                            $isRoom = $reference['contentKind'] === 'room';
                            $editUrl = $isRoom ? 'room-edit.php?id=' . $reference['contentId'] : 'object-edit.php?id=' . $reference['contentId'];
                            $usageLabels = array_map(function ($usage) {
                                return $usage === 'condition' ? 'Reads' : ($usage === 'set' ? 'Sets' : 'Clears');
                            }, $reference['usages']);
                            ?>
                            <a href="<?php echo nightlatch_h($editUrl); ?>"><i class="fa-solid <?php echo $isRoom ? 'fa-door-open' : 'fa-magnifying-glass'; ?>"></i><span><strong><?php echo nightlatch_h($reference['contentTitle']); ?></strong><small><?php echo $isRoom ? 'Room' : 'Object'; ?> · <?php echo nightlatch_h($reference['regionName']); ?> · <?php echo nightlatch_h(implode(', ', $usageLabels)); ?></small></span><i class="fa-solid fa-chevron-right"></i></a>
                        <?php endforeach; ?>
                    </div>
                </article>
            <?php endforeach; ?>
        </div>
        <div class="flag-no-results" id="flag-no-results" hidden><i class="fa-solid fa-flag"></i><p>No saved flags match that search.</p></div>
    <?php elseif (!$error): ?>
        <div class="empty-state"><div class="empty-icon"><i class="fa-regular fa-flag"></i></div><h2>No flags yet</h2><p>Add a flag condition or a set/clear flag result to a room or object region, then save it.</p></div>
    <?php endif; ?>
</section>
<?php if ($flags): ?><script src="<?php echo nightlatch_h(nightlatch_asset('js/flags.js')); ?>"></script><?php endif; ?>
<?php require __DIR__ . '/_footer.php'; ?>
