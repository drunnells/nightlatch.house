<?php

/**
 * Shared authored-content catalog for the player client and admin debug player.
 */

require_once __DIR__ . '/map-topology.php';
require_once __DIR__ . '/sounds.php';

function nightlatch_load_play_catalog(PDO $pdo)
{
    $loadedTopology = nightlatch_load_topology($pdo, true);
    nightlatch_apply_topology_to_rooms(
        $loadedTopology['rooms'],
        $loadedTopology['connections'],
        $loadedTopology['gateways']
    );

    $objects = array();
    foreach ($pdo->query('SELECT * FROM objects ORDER BY title')->fetchAll() as $row) {
        $objects[] = nightlatch_object_payload($row);
    }

    try {
        $sounds = nightlatch_sound_catalog($pdo);
    } catch (Throwable $ignored) {
        // Authored content remains playable without a sound library.
        $sounds = array();
    }

    return array(
        'rooms' => $loadedTopology['rooms'],
        'objects' => $objects,
        'sounds' => $sounds,
        'topology' => array(
            'clusters' => $loadedTopology['clusters'],
            'nodes' => $loadedTopology['nodes'],
            'connections' => $loadedTopology['connections'],
            'gateways' => $loadedTopology['gateways'],
        ),
    );
}

function nightlatch_find_start_room($rooms, $clusters)
{
    $startRoomId = '';
    foreach ($clusters as $cluster) {
        if (!empty($cluster['isStart'])) {
            $startRoomId = isset($cluster['entryRoomId']) ? (string) $cluster['entryRoomId'] : '';
            break;
        }
    }
    if ($startRoomId === '') {
        return null;
    }
    foreach ($rooms as $room) {
        if (isset($room['id']) && (string) $room['id'] === $startRoomId) {
            return $room;
        }
    }
    return null;
}

function nightlatch_player_runtime_data($value)
{
    if (!is_array($value)) {
        return $value;
    }
    $result = array();
    foreach ($value as $key => $child) {
        if ($key === 'overlayLibrary' || $key === 'prompt') {
            continue;
        }
        if ($key === 'book' && is_array($child)) {
            if (empty($child['enabled'])) continue;
            $pages = array();
            foreach (isset($child['pages']) && is_array($child['pages']) ? $child['pages'] : array() as $page) {
                if (is_array($page) && isset($page['asset'])) $pages[] = array('asset' => $page['asset']);
            }
            $result[$key] = array(
                'enabled' => true,
                'pageTurnSoundSlug' => isset($child['pageTurnSoundSlug']) ? (string) $child['pageTurnSoundSlug'] : '',
                'pages' => $pages,
            );
            continue;
        }
        $result[$key] = is_array($child) ? nightlatch_player_runtime_data($child) : $child;
    }
    return $result;
}

function nightlatch_play_catalog_fields($source, $fields)
{
    $result = array();
    foreach ($fields as $field) {
        if (array_key_exists($field, $source)) {
            $result[$field] = $source[$field];
        }
    }
    return $result;
}

function nightlatch_public_play_catalog($catalog)
{
    $publicRooms = array();
    foreach (isset($catalog['rooms']) && is_array($catalog['rooms']) ? $catalog['rooms'] : array() as $room) {
        $publicRoom = nightlatch_play_catalog_fields($room, array(
            'id', 'title', 'slug', 'playerDescription', 'backgroundAsset', 'data'
        ));
        $publicRoom['data'] = nightlatch_player_runtime_data(isset($publicRoom['data']) ? $publicRoom['data'] : array());
        $publicRooms[] = $publicRoom;
    }

    $publicObjects = array();
    foreach (isset($catalog['objects']) && is_array($catalog['objects']) ? $catalog['objects'] : array() as $object) {
        $publicObject = nightlatch_play_catalog_fields($object, array(
            'id', 'title', 'slug', 'playerDescription', 'backgroundAsset', 'portable', 'inventoryKey', 'data'
        ));
        $publicObject['data'] = nightlatch_player_runtime_data(isset($publicObject['data']) ? $publicObject['data'] : array());
        $publicObjects[] = $publicObject;
    }

    $publicSounds = array();
    foreach (isset($catalog['sounds']) && is_array($catalog['sounds']) ? $catalog['sounds'] : array() as $sound) {
        $publicSounds[] = nightlatch_play_catalog_fields($sound, array('id', 'name', 'slug', 'assetUrl'));
    }

    $topology = isset($catalog['topology']) && is_array($catalog['topology']) ? $catalog['topology'] : array();
    $publicClusters = array();
    foreach (isset($topology['clusters']) && is_array($topology['clusters']) ? $topology['clusters'] : array() as $cluster) {
        $publicClusters[] = nightlatch_play_catalog_fields($cluster, array(
            'id', 'name', 'slug', 'ambientSoundId', 'ambientVolume', 'entryRoomId',
            'gatewayReturnMode', 'gatewayReturnRegionId', 'isStart'
        ));
    }
    $publicNodes = array();
    foreach (isset($topology['nodes']) && is_array($topology['nodes']) ? $topology['nodes'] : array() as $node) {
        $publicNodes[] = nightlatch_play_catalog_fields($node, array('clusterId', 'roomId'));
    }
    $publicConnections = array();
    foreach (isset($topology['connections']) && is_array($topology['connections']) ? $topology['connections'] : array() as $connection) {
        $publicConnections[] = nightlatch_play_catalog_fields($connection, array(
            'sourceRoomId', 'sourceRegionId', 'targetRoomId', 'returnMode', 'targetRegionId'
        ));
    }
    $publicGateways = array();
    foreach (isset($topology['gateways']) && is_array($topology['gateways']) ? $topology['gateways'] : array() as $gateway) {
        $publicGateways[] = nightlatch_play_catalog_fields($gateway, array(
            'roomId', 'destinationCount', 'exitRegionIds', 'candidateClusterIds'
        ));
    }

    return array(
        'rooms' => $publicRooms,
        'objects' => $publicObjects,
        'sounds' => $publicSounds,
        'topology' => array(
            'clusters' => $publicClusters,
            'nodes' => $publicNodes,
            'connections' => $publicConnections,
            'gateways' => $publicGateways,
        ),
    );
}
