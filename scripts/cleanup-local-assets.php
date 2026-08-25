<?php

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This cleanup may only be run from the command line.\n");
    exit(1);
}

$delete = false;
$minimumAge = 24 * 60 * 60;
$showHelp = false;
foreach (array_slice($argv, 1) as $argument) {
    if ($argument === '--delete') {
        $delete = true;
    } elseif ($argument === '--help' || $argument === '-h') {
        $showHelp = true;
    } elseif (strpos($argument, '--min-age=') === 0) {
        $value = substr($argument, strlen('--min-age='));
        if ($value === '' || !ctype_digit($value)) {
            fwrite(STDERR, "--min-age must be a non-negative number of seconds.\n");
            exit(1);
        }
        $minimumAge = (int) $value;
    } else {
        fwrite(STDERR, "Unknown option: {$argument}\nRun with --help for usage.\n");
        exit(1);
    }
}

if ($showHelp) {
    fwrite(STDOUT, "Usage: php scripts/cleanup-local-assets.php [--delete] [--min-age=SECONDS]\n\n");
    fwrite(STDOUT, "Audits temporary room, object, overlay, and legacy sound files against saved\n");
    fwrite(STDOUT, "database references. The default is a dry run and a 24-hour safety age.\n\n");
    fwrite(STDOUT, "  --delete           Delete eligible unreferenced files.\n");
    fwrite(STDOUT, "  --min-age=SECONDS  Protect newer files (default: 86400). Use 0 only when\n");
    fwrite(STDOUT, "                     every admin has closed or saved their editor drafts.\n");
    exit(0);
}

require dirname(__DIR__) . '/app/bootstrap.php';

function nightlatch_cleanup_format_bytes($bytes)
{
    $bytes = (int) $bytes;
    if ($bytes < 1024) return $bytes . ' B';
    if ($bytes < 1024 * 1024) return round($bytes / 1024, 1) . ' KB';
    if ($bytes < 1024 * 1024 * 1024) return round($bytes / (1024 * 1024), 1) . ' MB';
    return round($bytes / (1024 * 1024 * 1024), 2) . ' GB';
}

try {
    nightlatch_require_storage_settings();
    $referencedFiles = nightlatch_database_local_asset_files(nightlatch_db());
    $scannedFiles = nightlatch_scan_local_temporary_assets();
    $eligible = array();
    $protected = array();
    $young = array();
    $eligibleBytes = 0;

    foreach ($scannedFiles as $path => $file) {
        if (isset($referencedFiles[$path])) {
            $protected[] = $file;
        } elseif ($minimumAge > 0 && time() - $file['modifiedAt'] < $minimumAge) {
            $young[] = $file;
        } else {
            $eligible[] = $file;
            $eligibleBytes += $file['size'];
        }
    }
    $missingReferences = array_diff_key($referencedFiles, $scannedFiles);

    fwrite(STDOUT, "Nightlatch local asset cleanup " . ($delete ? '(delete mode)' : '(dry run)') . "\n");
    fwrite(STDOUT, "Safety age: {$minimumAge} seconds\n");
    fwrite(STDOUT, "Temporary files scanned: " . count($scannedFiles) . "\n");
    fwrite(STDOUT, "Saved local references protected: " . count($protected) . "\n");
    fwrite(STDOUT, "Saved local references with missing files: " . count($missingReferences) . "\n");
    fwrite(STDOUT, "Newer draft files protected: " . count($young) . "\n");
    fwrite(STDOUT, "Eligible unreferenced files: " . count($eligible) . ' (' . nightlatch_cleanup_format_bytes($eligibleBytes) . ")\n");

    if ($protected) {
        fwrite(STDOUT, "\nSaved content still using local files:\n");
        foreach ($protected as $file) fwrite(STDOUT, "  PROTECTED  " . $file['relativePath'] . "\n");
    }
    if ($missingReferences) {
        fwrite(STDOUT, "\nWarning: saved content points to missing local files:\n");
        foreach (array_keys($missingReferences) as $path) {
            $displayPath = strpos($path, NIGHTLATCH_ROOT . DIRECTORY_SEPARATOR) === 0
                ? substr($path, strlen(NIGHTLATCH_ROOT) + 1)
                : $path;
            fwrite(STDOUT, "  MISSING    " . str_replace(DIRECTORY_SEPARATOR, '/', $displayPath) . "\n");
        }
    }
    if ($young) {
        fwrite(STDOUT, "\nRecent unsaved-draft candidates:\n");
        foreach ($young as $file) fwrite(STDOUT, "  TOO NEW    " . $file['relativePath'] . "\n");
    }
    if ($eligible) {
        fwrite(STDOUT, "\nUnreferenced cleanup candidates:\n");
        foreach ($eligible as $file) fwrite(STDOUT, "  " . ($delete ? 'DELETE' : 'WOULD DELETE') . '  ' . $file['relativePath'] . "\n");
    }

    if (!$delete) {
        fwrite(STDOUT, "\nDry run complete. Add --delete to remove only the eligible files listed above.\n");
        exit(0);
    }

    $paths = array();
    foreach ($eligible as $file) $paths[] = $file['path'];
    $report = nightlatch_delete_local_temporary_asset_files($paths, $referencedFiles, $minimumAge);
    fwrite(STDOUT, "\nFiles deleted: " . count($report['deleted']) . "\n");
    if ($report['young']) fwrite(STDOUT, "Files protected because they changed during cleanup: " . count($report['young']) . "\n");
    if ($report['referenced']) fwrite(STDOUT, "Files protected because they became referenced: " . count($report['referenced']) . "\n");
    if ($report['failed'] || $report['invalid']) {
        foreach (array_merge($report['failed'], $report['invalid']) as $path) fwrite(STDERR, "  FAILED  {$path}\n");
        throw new RuntimeException('One or more eligible files could not be removed.');
    }
    fwrite(STDOUT, "Local asset cleanup complete.\n");
} catch (Throwable $exception) {
    fwrite(STDERR, "Local asset cleanup failed: " . $exception->getMessage() . "\n");
    exit(1);
}
