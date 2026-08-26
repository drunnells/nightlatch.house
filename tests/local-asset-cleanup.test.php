<?php

require dirname(__DIR__) . '/app/bootstrap.php';

$directory = NIGHTLATCH_ROOT . '/assets/graphics/rooms/uploads';
$path = $directory . '/cleanup-test-' . bin2hex(random_bytes(6)) . '.png';
if (file_put_contents($path, 'temporary cleanup test', LOCK_EX) === false) {
    fwrite(STDERR, "The temporary cleanup fixture could not be created.\n");
    exit(1);
}
register_shutdown_function(function () use ($path) {
    if (is_file($path)) @unlink($path);
});

$url = '../assets/graphics/rooms/uploads/' . basename($path);
$realPath = realpath($path);
$relativePath = 'assets/graphics/rooms/uploads/' . basename($path);
if (nightlatch_local_temporary_asset_file($url) !== $realPath
    || nightlatch_local_temporary_asset_relative_path($path) !== $relativePath
    || nightlatch_local_temporary_asset_file('../assets/graphics/rooms/uploads/../demo-room.svg') !== '') {
    fwrite(STDERR, "Temporary asset paths were not constrained correctly.\n");
    exit(1);
}

$references = nightlatch_content_local_asset_files('', array(
    'regions' => array(),
    'book' => array('enabled' => true, 'pages' => array(array('asset' => $url))),
));
if (!isset($references[$realPath])) {
    fwrite(STDERR, "Saved local asset references were not collected.\n");
    exit(1);
}

$scanned = nightlatch_scan_local_temporary_assets();
if (!isset($scanned[$realPath]) || $scanned[$realPath]['relativePath'] !== $relativePath) {
    fwrite(STDERR, "Temporary assets were not scanned correctly.\n");
    exit(1);
}

$protected = nightlatch_delete_local_temporary_asset_files(array($path), $references, 0);
if (count($protected['referenced']) !== 1 || !is_file($path)) {
    fwrite(STDERR, "Referenced temporary assets were not protected.\n");
    exit(1);
}

$young = nightlatch_delete_local_temporary_asset_files(array($path), array(), 3600);
if (count($young['young']) !== 1 || !is_file($path)) {
    fwrite(STDERR, "Recent temporary assets were not protected.\n");
    exit(1);
}

if (!touch($path, time() - 7200)) {
    fwrite(STDERR, "The temporary cleanup fixture timestamp could not be changed.\n");
    exit(1);
}
clearstatcache(true, $path);
$deleted = nightlatch_delete_local_temporary_asset_files(array($path), array(), 3600);
if (count($deleted['deleted']) !== 1 || is_file($path)) {
    fwrite(STDERR, "Eligible temporary assets were not deleted.\n");
    exit(1);
}

fwrite(STDOUT, "local-asset-cleanup tests passed\n");
