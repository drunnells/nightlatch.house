<?php

/** Collect backgrounds, result overlays, overlay libraries, and book pages. */
function nightlatch_image_asset_references($value, &$references, $insideLibrary = false)
{
    if (!is_array($value)) return;
    foreach ($value as $key => $child) {
        if (($key === 'asset' && is_string($child)) || ($insideLibrary && is_int($key) && is_string($child))) {
            $references[$child] = true;
        } elseif (is_array($child)) {
            nightlatch_image_asset_references($child, $references, $insideLibrary || $key === 'overlayLibrary');
        }
    }
}

function nightlatch_image_asset_entries($rows, $assetType, $includeOverlays = false)
{
    $assets = array();
    foreach ($rows as $row) {
        $references = array();
        if (!empty($row['background_asset'])) $references[$row['background_asset']] = true;
        if ($includeOverlays && !empty($row['interaction_data'])) {
            nightlatch_image_asset_references(json_decode($row['interaction_data'], true), $references);
        }
        foreach ($references as $reference => $unused) {
            $path = parse_url($reference, PHP_URL_PATH);
            $extension = strtolower(pathinfo((string) $path, PATHINFO_EXTENSION));
            if (!in_array($extension, array('png', 'jpg', 'jpeg', 'webp'), true)) continue;
            $key = nightlatch_storage_key_from_reference($reference);
            if ($key !== '') {
                if (strpos($key, $assetType . '/') !== 0) continue;
            } elseif (nightlatch_local_content_asset_file($reference, $assetType) === '') {
                continue;
            }
            $background = $reference === $row['background_asset'];
            $assets[] = array(
                'title' => $row['title'],
                'slug' => $row['slug'],
                'assetType' => $assetType,
                'detail' => ($assetType === 'rooms' ? 'Room' : 'Object') . ' · ' . $row['slug'] . ' · '
                    . ($background ? 'Background' : 'Overlay / page · ' . basename((string) $path)),
                'backgroundAsset' => nightlatch_storage_public_url($reference),
            );
        }
    }
    return $assets;
}
