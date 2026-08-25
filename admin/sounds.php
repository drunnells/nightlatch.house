<?php
require dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/sounds.php';
nightlatch_require_admin();

$sounds = array();
$error = '';
try {
    $sounds = nightlatch_sound_catalog(nightlatch_db());
} catch (Throwable $exception) {
    $error = 'Sounds could not be loaded. Confirm that database/updates/004_player_descriptions_and_sounds.sql has been applied.';
}

$totalBytes = 0;
foreach ($sounds as $sound) $totalBytes += $sound['fileSize'];
$pageTitle = 'Sounds · Nightlatch Room Forge';
require __DIR__ . '/_header.php';
?>
<section class="page-wrap">
    <div class="page-heading">
        <div><div class="eyebrow">Audio library</div><h1>Sounds</h1><p>Upload reusable effects and ambience, give them recognizable names, preview them, and select them from room or object results.</p></div>
    </div>
    <?php if ($error): ?><div class="alert nl-alert"><?php echo nightlatch_h($error); ?></div><?php endif; ?>
    <?php if (!$error): ?>
        <div class="sound-upload-panel">
            <label class="sound-upload-drop" for="sound-upload"><i class="fa-solid fa-file-audio"></i><span><strong>Choose sound files</strong><small>MP3, WAV, OGG, M4A, or WebM · up to 50 files · 25 MB each</small></span><input id="sound-upload" type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm,.mp3,.wav,.ogg,.m4a,.webm" multiple></label>
            <div><span id="sound-upload-selection">No files selected</span><button type="button" class="btn-forge" id="upload-sounds" disabled><i class="fa-solid fa-cloud-arrow-up"></i> Upload selected</button></div>
        </div>
        <div class="stats-grid sound-stats">
            <div class="stat-card"><i class="fa-solid fa-volume-high"></i><span><strong><?php echo count($sounds); ?></strong>Saved sounds</span></div>
            <div class="stat-card"><i class="fa-solid fa-cloud"></i><span><strong><?php echo nightlatch_h(number_format($totalBytes / 1048576, 1)); ?> MB</strong>Stored audio</span></div>
            <div class="stat-card"><i class="fa-solid fa-list-check"></i><span><strong>Searchable</strong>Rule picker</span></div>
        </div>
        <?php if ($sounds): ?>
            <div class="flag-search"><i class="fa-solid fa-magnifying-glass"></i><input id="sound-search" type="search" placeholder="Search sound names, slugs, or filenames"><span id="sound-search-count"><?php echo count($sounds); ?> sounds</span></div>
            <div class="sound-library" id="sound-library">
                <?php foreach ($sounds as $sound): ?>
                    <article class="sound-card" data-sound-id="<?php echo (int) $sound['id']; ?>" data-sound-url="<?php echo nightlatch_h($sound['assetUrl']); ?>" data-sound-search="<?php echo nightlatch_h(strtolower($sound['name'] . ' ' . $sound['slug'] . ' ' . $sound['originalFilename'])); ?>">
                        <button type="button" class="sound-preview" aria-label="Preview <?php echo nightlatch_h($sound['name']); ?>"><i class="fa-solid fa-play"></i></button>
                        <div class="sound-card-main"><input class="sound-name" value="<?php echo nightlatch_h($sound['name']); ?>" maxlength="160" aria-label="Sound name"><span><code><?php echo nightlatch_h($sound['slug']); ?></code> · <?php echo nightlatch_h($sound['mimeType']); ?> · <?php echo nightlatch_h(number_format($sound['fileSize'] / 1024, 1)); ?> KB</span><small><?php echo nightlatch_h($sound['originalFilename']); ?></small></div>
                        <div class="sound-card-actions"><button type="button" class="btn-ghost sound-save-name"><i class="fa-solid fa-floppy-disk"></i> Save name</button><button type="button" class="icon-button danger sound-delete" title="Delete sound"><i class="fa-solid fa-trash"></i></button></div>
                    </article>
                <?php endforeach; ?>
            </div>
            <div class="flag-no-results" id="sound-no-results" hidden><i class="fa-solid fa-volume-xmark"></i><p>No sounds match that search.</p></div>
        <?php else: ?>
            <div class="empty-state sound-empty"><div class="empty-icon"><i class="fa-solid fa-music"></i></div><h2>No sounds yet</h2><p>Upload one or many audio files. Their filenames become editable display names and stable slugs for interaction results.</p></div>
        <?php endif; ?>
        <audio id="sound-preview-player" preload="none"></audio>
    <?php endif; ?>
</section>
<script>window.NL_CSRF = <?php echo json_encode(nightlatch_csrf_token()); ?>;</script>
<?php if (!$error): ?><script src="<?php echo nightlatch_h(nightlatch_asset('js/sounds.js')); ?>"></script><?php endif; ?>
<?php require __DIR__ . '/_footer.php'; ?>
