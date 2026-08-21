<?php

/**
 * Shared loading, validation, and persistence for the authored room graph.
 * Room artwork and interaction rules remain in room_data; connections and
 * cluster/Gateway metadata live in dedicated topology tables.
 */

function nightlatch_topology_id($value)
{
    if ($value === null || is_array($value) || is_object($value)) {
        return '';
    }
    return trim((string) $value);
}

function nightlatch_topology_slug($value)
{
    if (function_exists('nightlatch_slug')) {
        return nightlatch_slug($value);
    }
    $value = strtolower(trim((string) $value));
    $value = preg_replace('/[^a-z0-9]+/', '-', $value);
    return trim($value, '-');
}

function nightlatch_topology_room_data($room)
{
    if (isset($room['data']) && is_array($room['data'])) {
        return $room['data'];
    }
    if (isset($room['room_data']) && is_string($room['room_data'])) {
        $data = json_decode($room['room_data'], true);
        return is_array($data) ? $data : array();
    }
    return array();
}

function nightlatch_topology_room_regions($room)
{
    $data = nightlatch_topology_room_data($room);
    return isset($data['regions']) && is_array($data['regions']) ? $data['regions'] : array();
}

function nightlatch_topology_room_index($rooms)
{
    $index = array();
    foreach ($rooms as $room) {
        $roomId = nightlatch_topology_id(isset($room['id']) ? $room['id'] : '');
        if ($roomId === '') {
            continue;
        }
        $doors = array();
        foreach (nightlatch_topology_room_regions($room) as $region) {
            if (!is_array($region) || (isset($region['kind']) ? $region['kind'] : 'interaction') !== 'door') {
                continue;
            }
            $regionId = nightlatch_topology_id(isset($region['id']) ? $region['id'] : '');
            if ($regionId !== '') {
                $doors[$regionId] = isset($region['name']) ? (string) $region['name'] : $regionId;
            }
        }
        $index[$roomId] = array(
            'id' => $roomId,
            'title' => isset($room['title']) ? (string) $room['title'] : $roomId,
            'slug' => isset($room['slug']) ? (string) $room['slug'] : '',
            'doors' => $doors,
        );
    }
    return $index;
}

function nightlatch_validate_topology($topology, $rooms, $sounds = null)
{
    if (!is_array($topology)) {
        throw new RuntimeException('Map topology must be an object.');
    }
    $roomIndex = nightlatch_topology_room_index($rooms);
    $clusters = isset($topology['clusters']) && is_array($topology['clusters']) ? $topology['clusters'] : array();
    $nodes = isset($topology['nodes']) && is_array($topology['nodes']) ? $topology['nodes'] : array();
    $connections = isset($topology['connections']) && is_array($topology['connections']) ? $topology['connections'] : array();
    $gateways = isset($topology['gateways']) && is_array($topology['gateways']) ? $topology['gateways'] : array();
    $soundIndex = null;
    if (is_array($sounds)) {
        $soundIndex = array();
        foreach ($sounds as $sound) {
            if (!is_array($sound)) continue;
            $soundId = nightlatch_topology_id(isset($sound['id']) ? $sound['id'] : '');
            if ($soundId !== '') $soundIndex[$soundId] = true;
        }
    }

    if (count($clusters) > 250 || count($nodes) > 2000 || count($connections) > 5000 || count($gateways) > 250) {
        throw new RuntimeException('The map exceeds the supported authoring limits.');
    }

    $clusterIndex = array();
    $clusterSlugIndex = array();
    $startCount = 0;
    foreach ($clusters as $cluster) {
        if (!is_array($cluster)) {
            throw new RuntimeException('Every cluster must be an object.');
        }
        $clusterId = nightlatch_topology_id(isset($cluster['id']) ? $cluster['id'] : '');
        $name = trim(isset($cluster['name']) ? (string) $cluster['name'] : '');
        $slug = nightlatch_topology_slug(isset($cluster['slug']) && $cluster['slug'] !== '' ? $cluster['slug'] : $name);
        if ($clusterId === '' || $name === '' || $slug === '') {
            throw new RuntimeException('Every cluster needs a name, slug, and stable map identifier.');
        }
        if (isset($clusterIndex[$clusterId])) {
            throw new RuntimeException('Cluster identifiers must be unique.');
        }
        if (isset($clusterSlugIndex[$slug])) {
            throw new RuntimeException('Cluster slugs must be unique.');
        }
        if (strlen($name) > 160 || strlen($slug) > 190) {
            throw new RuntimeException('A cluster name or slug is too long.');
        }
        $ambientSoundId = nightlatch_topology_id(isset($cluster['ambientSoundId']) ? $cluster['ambientSoundId'] : '');
        if ($ambientSoundId !== '' && (!ctype_digit($ambientSoundId) || (int) $ambientSoundId < 1)) {
            throw new RuntimeException('Cluster “' . $name . '” has an invalid ambient sound.');
        }
        if ($ambientSoundId !== '' && is_array($soundIndex) && !isset($soundIndex[$ambientSoundId])) {
            throw new RuntimeException('The ambient sound selected for cluster “' . $name . '” no longer exists.');
        }
        $ambientVolumeValue = isset($cluster['ambientVolume']) ? $cluster['ambientVolume'] : 35;
        $ambientVolume = filter_var($ambientVolumeValue, FILTER_VALIDATE_INT);
        if ($ambientVolume === false || $ambientVolume < 0 || $ambientVolume > 100) {
            throw new RuntimeException('The ambient volume for cluster “' . $name . '” must be between 0 and 100.');
        }
        $returnMode = isset($cluster['gatewayReturnMode']) ? $cluster['gatewayReturnMode'] : 'behind';
        if (!in_array($returnMode, array('behind', 'door'), true)) {
            throw new RuntimeException('A cluster Gateway return must use a door region or a behind-you control.');
        }
        if (!empty($cluster['isStart'])) {
            $startCount++;
        }
        $clusterIndex[$clusterId] = array(
            'id' => $clusterId,
            'name' => $name,
            'slug' => $slug,
            'description' => isset($cluster['description']) ? trim((string) $cluster['description']) : '',
            'ambientSoundId' => $ambientSoundId,
            'ambientVolume' => (int) $ambientVolume,
            'entryRoomId' => nightlatch_topology_id(isset($cluster['entryRoomId']) ? $cluster['entryRoomId'] : ''),
            'gatewayReturnMode' => $returnMode,
            'gatewayReturnRegionId' => nightlatch_topology_id(isset($cluster['gatewayReturnRegionId']) ? $cluster['gatewayReturnRegionId'] : ''),
            'isStart' => !empty($cluster['isStart']),
        );
        $clusterSlugIndex[$slug] = true;
    }
    if ($clusters && $startCount !== 1) {
        throw new RuntimeException('Exactly one cluster must be marked as the starting cluster.');
    }

    $roomCluster = array();
    $normalizedNodes = array();
    foreach ($nodes as $node) {
        if (!is_array($node)) {
            throw new RuntimeException('Every map node must be an object.');
        }
        $roomId = nightlatch_topology_id(isset($node['roomId']) ? $node['roomId'] : '');
        $clusterId = nightlatch_topology_id(isset($node['clusterId']) ? $node['clusterId'] : '');
        if (!isset($roomIndex[$roomId])) {
            throw new RuntimeException('A map node refers to a room that no longer exists.');
        }
        if (!isset($clusterIndex[$clusterId])) {
            throw new RuntimeException('A map node refers to a cluster that no longer exists.');
        }
        if (isset($roomCluster[$roomId])) {
            throw new RuntimeException('A room may belong to only one cluster.');
        }
        $roomCluster[$roomId] = $clusterId;
        $normalizedNodes[] = array(
            'roomId' => $roomId,
            'clusterId' => $clusterId,
            'x' => max(0, min(10000, (int) (isset($node['x']) ? $node['x'] : 80))),
            'y' => max(0, min(10000, (int) (isset($node['y']) ? $node['y'] : 80))),
        );
    }

    $gatewayReturnEndpoints = array();
    foreach ($clusterIndex as $cluster) {
        $clusterId = $cluster['id'];
        $entryRoomId = $cluster['entryRoomId'];
        if ($entryRoomId === '' || !isset($roomIndex[$entryRoomId])) {
            throw new RuntimeException('Cluster “' . $cluster['name'] . '” needs an entry room.');
        }
        if (!isset($roomCluster[$entryRoomId]) || $roomCluster[$entryRoomId] !== $clusterId) {
            throw new RuntimeException('The entry room for cluster “' . $cluster['name'] . '” must belong to that cluster.');
        }
        if ($cluster['gatewayReturnMode'] === 'door') {
            $returnRegionId = $cluster['gatewayReturnRegionId'];
            if ($returnRegionId === '' || !isset($roomIndex[$entryRoomId]['doors'][$returnRegionId])) {
                throw new RuntimeException('Cluster “' . $cluster['name'] . '” needs a valid entry-room door for its Gateway return.');
            }
            $gatewayReturnEndpoints[$entryRoomId . ':' . $returnRegionId] = $cluster['name'];
        }
    }

    $normalizedConnections = array();
    $connectionSources = array();
    foreach ($connections as $connection) {
        if (!is_array($connection)) {
            throw new RuntimeException('Every room connection must be an object.');
        }
        $sourceRoomId = nightlatch_topology_id(isset($connection['sourceRoomId']) ? $connection['sourceRoomId'] : '');
        $sourceRegionId = nightlatch_topology_id(isset($connection['sourceRegionId']) ? $connection['sourceRegionId'] : '');
        $targetRoomId = nightlatch_topology_id(isset($connection['targetRoomId']) ? $connection['targetRoomId'] : '');
        $returnMode = isset($connection['returnMode']) ? $connection['returnMode'] : 'behind';
        $targetRegionId = nightlatch_topology_id(isset($connection['targetRegionId']) ? $connection['targetRegionId'] : '');
        if (!isset($roomIndex[$sourceRoomId], $roomIndex[$targetRoomId])) {
            throw new RuntimeException('A room connection refers to a room that no longer exists.');
        }
        if ($sourceRoomId === $targetRoomId) {
            throw new RuntimeException('A room door cannot connect back to the same room.');
        }
        if ($sourceRegionId === '' || !isset($roomIndex[$sourceRoomId]['doors'][$sourceRegionId])) {
            throw new RuntimeException('A room connection must start from a saved Door / exit region.');
        }
        if (!isset($roomCluster[$sourceRoomId], $roomCluster[$targetRoomId]) || $roomCluster[$sourceRoomId] !== $roomCluster[$targetRoomId]) {
            throw new RuntimeException('Static room connections must stay inside one cluster. Use a Gateway to connect clusters.');
        }
        if (!in_array($returnMode, array('behind', 'door', 'one_way'), true)) {
            throw new RuntimeException('A room connection has an invalid return behavior.');
        }
        if ($returnMode === 'door') {
            if ($targetRegionId === '' || !isset($roomIndex[$targetRoomId]['doors'][$targetRegionId])) {
                throw new RuntimeException('A paired room connection needs a valid door region in the destination room.');
            }
        } else {
            $targetRegionId = '';
        }
        $sourceKey = $sourceRoomId . ':' . $sourceRegionId;
        if (isset($gatewayReturnEndpoints[$sourceKey])) {
            throw new RuntimeException('The Gateway return door for cluster “' . $gatewayReturnEndpoints[$sourceKey] . '” must be reserved for returning to its assigned Gateway.');
        }
        if (isset($connectionSources[$sourceKey])) {
            throw new RuntimeException('A Door / exit region may have only one destination.');
        }
        $connectionSources[$sourceKey] = true;
        $normalizedConnections[] = array(
            'id' => isset($connection['id']) ? (int) $connection['id'] : 0,
            'sourceRoomId' => $sourceRoomId,
            'sourceRegionId' => $sourceRegionId,
            'targetRoomId' => $targetRoomId,
            'returnMode' => $returnMode,
            'targetRegionId' => $targetRegionId,
        );
    }
    $normalizedConnectionBySource = array();
    foreach ($normalizedConnections as $connection) {
        $normalizedConnectionBySource[$connection['sourceRoomId'] . ':' . $connection['sourceRegionId']] = $connection;
    }
    foreach ($normalizedConnections as $connection) {
        if ($connection['returnMode'] !== 'door') {
            continue;
        }
        $reverseKey = $connection['targetRoomId'] . ':' . $connection['targetRegionId'];
        $reverse = isset($normalizedConnectionBySource[$reverseKey]) ? $normalizedConnectionBySource[$reverseKey] : null;
        if (!$reverse || $reverse['returnMode'] !== 'door'
            || $reverse['targetRoomId'] !== $connection['sourceRoomId']
            || $reverse['targetRegionId'] !== $connection['sourceRegionId']) {
            throw new RuntimeException('Paired door connections must include matching exits in both rooms.');
        }
    }

    $normalizedGateways = array();
    $gatewayRooms = array();
    foreach ($gateways as $gateway) {
        if (!is_array($gateway)) {
            throw new RuntimeException('Every Gateway definition must be an object.');
        }
        $roomId = nightlatch_topology_id(isset($gateway['roomId']) ? $gateway['roomId'] : '');
        if (!isset($roomIndex[$roomId]) || !isset($roomCluster[$roomId])) {
            throw new RuntimeException('A Gateway room must be a saved room assigned to a cluster.');
        }
        if (isset($gatewayRooms[$roomId])) {
            throw new RuntimeException('A room may have only one Gateway definition.');
        }
        $gatewayRooms[$roomId] = true;
        $destinationCount = (int) (isset($gateway['destinationCount']) ? $gateway['destinationCount'] : 0);
        $exitRegionIds = array_values(array_unique(array_filter(array_map('nightlatch_topology_id', isset($gateway['exitRegionIds']) && is_array($gateway['exitRegionIds']) ? $gateway['exitRegionIds'] : array()))));
        $candidateClusterIds = array_values(array_unique(array_filter(array_map('nightlatch_topology_id', isset($gateway['candidateClusterIds']) && is_array($gateway['candidateClusterIds']) ? $gateway['candidateClusterIds'] : array()))));
        if ($destinationCount < 1 || $destinationCount > 100) {
            throw new RuntimeException('A Gateway must select between 1 and 100 destination clusters.');
        }
        foreach ($exitRegionIds as $regionId) {
            if (!isset($roomIndex[$roomId]['doors'][$regionId])) {
                throw new RuntimeException('Every Gateway exit must still be a Door / exit region in its room.');
            }
            if (isset($connectionSources[$roomId . ':' . $regionId])) {
                throw new RuntimeException('A Gateway exit cannot also have a static room destination.');
            }
            if (isset($gatewayReturnEndpoints[$roomId . ':' . $regionId])) {
                throw new RuntimeException('A cluster Gateway return door cannot also be an outbound Gateway exit.');
            }
        }
        foreach ($candidateClusterIds as $candidateClusterId) {
            if (!isset($clusterIndex[$candidateClusterId])) {
                throw new RuntimeException('A Gateway candidate refers to a cluster that no longer exists.');
            }
            if ($candidateClusterId === $roomCluster[$roomId]) {
                throw new RuntimeException('A Gateway cannot select its own cluster as a destination.');
            }
        }
        if ($destinationCount > count($exitRegionIds)) {
            throw new RuntimeException('Gateway room “' . $roomIndex[$roomId]['title'] . '” needs at least ' . $destinationCount . ' Gateway Door / exit regions.');
        }
        if ($destinationCount > count($candidateClusterIds)) {
            throw new RuntimeException('Gateway room “' . $roomIndex[$roomId]['title'] . '” needs at least ' . $destinationCount . ' eligible destination clusters.');
        }
        $normalizedGateways[] = array(
            'roomId' => $roomId,
            'destinationCount' => $destinationCount,
            'exitRegionIds' => $exitRegionIds,
            'candidateClusterIds' => $candidateClusterIds,
        );
    }

    return array(
        'clusters' => array_values($clusterIndex),
        'nodes' => $normalizedNodes,
        'connections' => $normalizedConnections,
        'gateways' => $normalizedGateways,
    );
}

function nightlatch_load_topology(PDO $pdo, $includeLegacyConnections)
{
    $roomRows = $pdo->query('SELECT * FROM rooms ORDER BY title')->fetchAll();
    $rooms = array();
    foreach ($roomRows as $row) {
        $rooms[] = nightlatch_room_payload($row);
    }

    $clusters = array();
    foreach ($pdo->query('SELECT * FROM room_clusters ORDER BY name')->fetchAll() as $row) {
        $clusters[] = array(
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'slug' => $row['slug'],
            'description' => $row['description'],
            'ambientSoundId' => isset($row['ambient_sound_id']) && $row['ambient_sound_id'] !== null ? (int) $row['ambient_sound_id'] : '',
            'ambientVolume' => isset($row['ambient_volume']) ? (int) $row['ambient_volume'] : 35,
            'entryRoomId' => (int) $row['entry_room_id'],
            'gatewayReturnMode' => $row['gateway_return_mode'],
            'gatewayReturnRegionId' => $row['gateway_return_region_id'],
            'isStart' => !empty($row['is_start']),
        );
    }

    $nodes = array();
    foreach ($pdo->query('SELECT cluster_id, room_id, position_x, position_y FROM room_cluster_nodes')->fetchAll() as $row) {
        $nodes[] = array('clusterId' => (int) $row['cluster_id'], 'roomId' => (int) $row['room_id'], 'x' => (int) $row['position_x'], 'y' => (int) $row['position_y']);
    }

    $connections = array();
    $connectionSources = array();
    foreach ($pdo->query('SELECT * FROM room_connections ORDER BY id')->fetchAll() as $row) {
        $connection = array(
            'id' => (int) $row['id'],
            'sourceRoomId' => (int) $row['source_room_id'],
            'sourceRegionId' => $row['source_region_id'],
            'targetRoomId' => (int) $row['target_room_id'],
            'returnMode' => $row['return_mode'],
            'targetRegionId' => $row['target_region_id'],
        );
        $connections[] = $connection;
        $connectionSources[$connection['sourceRoomId'] . ':' . $connection['sourceRegionId']] = true;
    }

    if ($includeLegacyConnections) {
        $roomById = array();
        $roomBySlug = array();
        $clusterByRoom = array();
        foreach ($rooms as $room) {
            $roomById[(string) $room['id']] = $room;
            $roomBySlug[$room['slug']] = $room;
        }
        foreach ($nodes as $node) {
            $clusterByRoom[(string) $node['roomId']] = (string) $node['clusterId'];
        }
        foreach ($rooms as $room) {
            foreach (nightlatch_topology_room_regions($room) as $region) {
                if (!is_array($region) || (isset($region['kind']) ? $region['kind'] : '') !== 'door') {
                    continue;
                }
                $regionId = nightlatch_topology_id(isset($region['id']) ? $region['id'] : '');
                $sourceKey = $room['id'] . ':' . $regionId;
                $target = isset($region['door']['targetRoom']) ? nightlatch_topology_id($region['door']['targetRoom']) : '';
                if ($regionId === '' || $target === '' || isset($connectionSources[$sourceKey])) {
                    continue;
                }
                $targetRoom = isset($roomById[$target]) ? $roomById[$target] : (isset($roomBySlug[$target]) ? $roomBySlug[$target] : null);
                if (!$targetRoom) {
                    continue;
                }
                $connections[] = array(
                    'id' => 0,
                    'sourceRoomId' => (int) $room['id'],
                    'sourceRegionId' => $regionId,
                    'targetRoomId' => (int) $targetRoom['id'],
                    'returnMode' => isset($region['door']['returnMode']) ? $region['door']['returnMode'] : 'behind',
                    'targetRegionId' => isset($region['door']['targetRegionId']) ? $region['door']['targetRegionId'] : '',
                    'legacy' => true,
                );
            }
        }
    }

    $gatewaysByRoom = array();
    foreach ($pdo->query('SELECT room_id, destination_count FROM room_gateways')->fetchAll() as $row) {
        $gatewaysByRoom[(string) $row['room_id']] = array(
            'roomId' => (int) $row['room_id'],
            'destinationCount' => (int) $row['destination_count'],
            'exitRegionIds' => array(),
            'candidateClusterIds' => array(),
        );
    }
    foreach ($pdo->query('SELECT gateway_room_id, region_id FROM room_gateway_exits ORDER BY region_id')->fetchAll() as $row) {
        if (isset($gatewaysByRoom[(string) $row['gateway_room_id']])) {
            $gatewaysByRoom[(string) $row['gateway_room_id']]['exitRegionIds'][] = $row['region_id'];
        }
    }
    foreach ($pdo->query('SELECT gateway_room_id, cluster_id FROM room_gateway_candidates ORDER BY cluster_id')->fetchAll() as $row) {
        if (isset($gatewaysByRoom[(string) $row['gateway_room_id']])) {
            $gatewaysByRoom[(string) $row['gateway_room_id']]['candidateClusterIds'][] = (int) $row['cluster_id'];
        }
    }

    return array(
        'rooms' => $rooms,
        'clusters' => $clusters,
        'nodes' => $nodes,
        'connections' => $connections,
        'gateways' => array_values($gatewaysByRoom),
    );
}

function nightlatch_apply_topology_to_rooms(&$rooms, $connections, $gateways)
{
    $connectionsBySource = array();
    foreach ($connections as $connection) {
        $connectionsBySource[(string) $connection['sourceRoomId'] . ':' . $connection['sourceRegionId']] = $connection;
    }
    $gatewayExits = array();
    foreach ($gateways as $gateway) {
        foreach ($gateway['exitRegionIds'] as $regionId) {
            $gatewayExits[(string) $gateway['roomId'] . ':' . $regionId] = true;
        }
    }
    foreach ($rooms as &$room) {
        if (!isset($room['data']['regions']) || !is_array($room['data']['regions'])) {
            continue;
        }
        foreach ($room['data']['regions'] as &$region) {
            if (!is_array($region) || (isset($region['kind']) ? $region['kind'] : '') !== 'door') {
                continue;
            }
            if (!isset($region['door']) || !is_array($region['door'])) {
                $region['door'] = array();
            }
            $key = (string) $room['id'] . ':' . (isset($region['id']) ? $region['id'] : '');
            if (isset($gatewayExits[$key])) {
                $region['door']['connectionMode'] = 'gateway';
                $region['door']['targetRoom'] = '';
                continue;
            }
            $region['door']['connectionMode'] = 'static';
            if (isset($connectionsBySource[$key])) {
                $connection = $connectionsBySource[$key];
                $region['door']['targetRoom'] = (string) $connection['targetRoomId'];
                $region['door']['returnMode'] = $connection['returnMode'];
                $region['door']['targetRegionId'] = $connection['targetRegionId'];
            } else {
                $region['door']['targetRoom'] = '';
                $region['door']['returnMode'] = 'behind';
                $region['door']['targetRegionId'] = '';
            }
        }
        unset($region);
    }
    unset($room);
}

function nightlatch_mirror_topology_to_room_data(PDO $pdo, $connections, $gateways, $adminId)
{
    $connectionBySource = array();
    foreach ($connections as $connection) {
        $connectionBySource[(string) $connection['sourceRoomId'] . ':' . $connection['sourceRegionId']] = $connection;
    }
    $gatewayExits = array();
    foreach ($gateways as $gateway) {
        foreach ($gateway['exitRegionIds'] as $regionId) {
            $gatewayExits[(string) $gateway['roomId'] . ':' . $regionId] = true;
        }
    }
    $update = $pdo->prepare('UPDATE rooms SET room_data = ?, updated_by = ? WHERE id = ?');
    foreach ($pdo->query('SELECT id, room_data FROM rooms')->fetchAll() as $row) {
        $data = json_decode($row['room_data'], true);
        if (!is_array($data) || !isset($data['regions']) || !is_array($data['regions'])) {
            continue;
        }
        $changed = false;
        foreach ($data['regions'] as &$region) {
            if (!is_array($region) || (isset($region['kind']) ? $region['kind'] : '') !== 'door') {
                continue;
            }
            if (!isset($region['door']) || !is_array($region['door'])) {
                $region['door'] = array();
            }
            $key = (string) $row['id'] . ':' . (isset($region['id']) ? $region['id'] : '');
            $before = json_encode($region['door']);
            if (isset($gatewayExits[$key])) {
                $region['door']['connectionMode'] = 'gateway';
                $region['door']['targetRoom'] = '';
                $region['door']['returnMode'] = 'behind';
                $region['door']['targetRegionId'] = '';
            } elseif (isset($connectionBySource[$key])) {
                $connection = $connectionBySource[$key];
                $region['door']['connectionMode'] = 'static';
                $region['door']['targetRoom'] = (string) $connection['targetRoomId'];
                $region['door']['returnMode'] = $connection['returnMode'];
                $region['door']['targetRegionId'] = $connection['targetRegionId'];
            } else {
                $region['door']['connectionMode'] = 'static';
                $region['door']['targetRoom'] = '';
                $region['door']['returnMode'] = 'behind';
                $region['door']['targetRegionId'] = '';
            }
            if ($before !== json_encode($region['door'])) {
                $changed = true;
            }
        }
        unset($region);
        if ($changed) {
            $update->execute(array(json_encode($data, JSON_UNESCAPED_SLASHES), $adminId, (int) $row['id']));
        }
    }
}

function nightlatch_persist_topology(PDO $pdo, $topology, $adminId)
{
    $roomRows = $pdo->query('SELECT * FROM rooms ORDER BY title')->fetchAll();
    $rooms = array();
    foreach ($roomRows as $row) {
        $rooms[] = nightlatch_room_payload($row);
    }
    $soundRows = $pdo->query('SELECT id FROM sounds')->fetchAll();
    $topology = nightlatch_validate_topology($topology, $rooms, $soundRows);
    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) {
        $pdo->beginTransaction();
    }
    try {
        $existingIds = array();
        foreach ($pdo->query('SELECT id FROM room_clusters')->fetchAll() as $row) {
            $existingIds[(string) $row['id']] = true;
        }
        $clusterIdMap = array();
        $keptIds = array();
        foreach ($topology['clusters'] as $cluster) {
            $clientId = (string) $cluster['id'];
            if (isset($existingIds[$clientId])) {
                $stmt = $pdo->prepare('UPDATE room_clusters SET name = ?, slug = ?, description = ?, ambient_sound_id = ?, ambient_volume = ?, entry_room_id = ?, gateway_return_mode = ?, gateway_return_region_id = ?, is_start = ?, updated_by = ? WHERE id = ?');
                $stmt->execute(array($cluster['name'], $cluster['slug'], $cluster['description'], $cluster['ambientSoundId'] !== '' ? (int) $cluster['ambientSoundId'] : null, $cluster['ambientVolume'], (int) $cluster['entryRoomId'], $cluster['gatewayReturnMode'], $cluster['gatewayReturnRegionId'] ?: null, $cluster['isStart'] ? 1 : 0, $adminId, (int) $clientId));
                $databaseId = (int) $clientId;
            } else {
                $stmt = $pdo->prepare('INSERT INTO room_clusters (name, slug, description, ambient_sound_id, ambient_volume, entry_room_id, gateway_return_mode, gateway_return_region_id, is_start, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $stmt->execute(array($cluster['name'], $cluster['slug'], $cluster['description'], $cluster['ambientSoundId'] !== '' ? (int) $cluster['ambientSoundId'] : null, $cluster['ambientVolume'], (int) $cluster['entryRoomId'], $cluster['gatewayReturnMode'], $cluster['gatewayReturnRegionId'] ?: null, $cluster['isStart'] ? 1 : 0, $adminId, $adminId));
                $databaseId = (int) $pdo->lastInsertId();
            }
            $clusterIdMap[$clientId] = $databaseId;
            $keptIds[(string) $databaseId] = true;
        }

        $pdo->exec('DELETE FROM room_gateway_candidates');
        $pdo->exec('DELETE FROM room_gateway_exits');
        $pdo->exec('DELETE FROM room_gateways');
        $pdo->exec('DELETE FROM room_connections');
        $pdo->exec('DELETE FROM room_cluster_nodes');
        $deleteCluster = $pdo->prepare('DELETE FROM room_clusters WHERE id = ?');
        foreach ($existingIds as $existingId => $_unused) {
            if (!isset($keptIds[$existingId])) {
                $deleteCluster->execute(array((int) $existingId));
            }
        }

        $nodeStmt = $pdo->prepare('INSERT INTO room_cluster_nodes (cluster_id, room_id, position_x, position_y) VALUES (?, ?, ?, ?)');
        foreach ($topology['nodes'] as $node) {
            $nodeStmt->execute(array($clusterIdMap[(string) $node['clusterId']], (int) $node['roomId'], $node['x'], $node['y']));
        }
        $connectionStmt = $pdo->prepare('INSERT INTO room_connections (source_room_id, source_region_id, target_room_id, return_mode, target_region_id) VALUES (?, ?, ?, ?, ?)');
        foreach ($topology['connections'] as $connection) {
            $connectionStmt->execute(array((int) $connection['sourceRoomId'], $connection['sourceRegionId'], (int) $connection['targetRoomId'], $connection['returnMode'], $connection['targetRegionId'] ?: null));
        }
        $gatewayStmt = $pdo->prepare('INSERT INTO room_gateways (room_id, destination_count) VALUES (?, ?)');
        $exitStmt = $pdo->prepare('INSERT INTO room_gateway_exits (gateway_room_id, region_id) VALUES (?, ?)');
        $candidateStmt = $pdo->prepare('INSERT INTO room_gateway_candidates (gateway_room_id, cluster_id) VALUES (?, ?)');
        foreach ($topology['gateways'] as $gateway) {
            $gatewayStmt->execute(array((int) $gateway['roomId'], $gateway['destinationCount']));
            foreach ($gateway['exitRegionIds'] as $regionId) {
                $exitStmt->execute(array((int) $gateway['roomId'], $regionId));
            }
            foreach ($gateway['candidateClusterIds'] as $clusterId) {
                $candidateStmt->execute(array((int) $gateway['roomId'], $clusterIdMap[(string) $clusterId]));
            }
        }
        $persistedGateways = array();
        foreach ($topology['gateways'] as $gateway) {
            $persisted = $gateway;
            $persisted['candidateClusterIds'] = array_map(function ($clusterId) use ($clusterIdMap) { return $clusterIdMap[(string) $clusterId]; }, $gateway['candidateClusterIds']);
            $persistedGateways[] = $persisted;
        }
        nightlatch_mirror_topology_to_room_data($pdo, $topology['connections'], $persistedGateways, $adminId);
        if ($ownsTransaction) {
            $pdo->commit();
        }
    } catch (Throwable $exception) {
        if ($ownsTransaction && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
    return nightlatch_load_topology($pdo, false);
}

function nightlatch_delete_room_connection_with_pair(PDO $pdo, $sourceRoomId, $sourceRegionId)
{
    $stmt = $pdo->prepare('SELECT * FROM room_connections WHERE source_room_id = ? AND source_region_id = ?');
    $stmt->execute(array((int) $sourceRoomId, $sourceRegionId));
    $connection = $stmt->fetch();
    if ($connection && $connection['return_mode'] === 'door' && $connection['target_region_id']) {
        $deleteReverse = $pdo->prepare('DELETE FROM room_connections WHERE source_room_id = ? AND source_region_id = ? AND target_room_id = ? AND target_region_id = ? AND return_mode = ?');
        $deleteReverse->execute(array((int) $connection['target_room_id'], $connection['target_region_id'], (int) $sourceRoomId, $sourceRegionId, 'door'));
    }
    $delete = $pdo->prepare('DELETE FROM room_connections WHERE source_room_id = ? AND source_region_id = ?');
    $delete->execute(array((int) $sourceRoomId, $sourceRegionId));
}

function nightlatch_sync_room_topology(PDO $pdo, $roomId, $roomData, $gateway)
{
    $roomId = (int) $roomId;
    $gateway = is_array($gateway) ? $gateway : array('enabled' => false);
    $gatewayEnabled = !empty($gateway['enabled']);
    $exitIds = $gatewayEnabled && isset($gateway['exitRegionIds']) && is_array($gateway['exitRegionIds']) ? array_values(array_unique(array_map('nightlatch_topology_id', $gateway['exitRegionIds']))) : array();
    $exitMap = array_fill_keys($exitIds, true);

    $roomRows = $pdo->query('SELECT * FROM rooms ORDER BY title')->fetchAll();
    $rooms = array();
    $targetById = array();
    $targetBySlug = array();
    foreach ($roomRows as $row) {
        $payload = nightlatch_room_payload($row);
        $rooms[] = $payload;
        $targetById[(string) $payload['id']] = $payload;
        $targetBySlug[$payload['slug']] = $payload;
    }

    $existingConnections = array();
    $existingStmt = $pdo->prepare('SELECT * FROM room_connections WHERE source_room_id = ?');
    $existingStmt->execute(array($roomId));
    foreach ($existingStmt->fetchAll() as $row) {
        $existingConnections[$row['source_region_id']] = $row;
    }

    $validDoorIds = array();
    $upsert = $pdo->prepare('INSERT INTO room_connections (source_room_id, source_region_id, target_room_id, return_mode, target_region_id) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE target_room_id = VALUES(target_room_id), return_mode = VALUES(return_mode), target_region_id = VALUES(target_region_id)');
    foreach (isset($roomData['regions']) && is_array($roomData['regions']) ? $roomData['regions'] : array() as $region) {
        if (!is_array($region) || (isset($region['kind']) ? $region['kind'] : '') !== 'door') {
            continue;
        }
        $regionId = nightlatch_topology_id(isset($region['id']) ? $region['id'] : '');
        if ($regionId === '') {
            continue;
        }
        $validDoorIds[$regionId] = true;
        if (isset($exitMap[$regionId])) {
            nightlatch_delete_room_connection_with_pair($pdo, $roomId, $regionId);
            continue;
        }
        $target = isset($region['door']['targetRoom']) ? nightlatch_topology_id($region['door']['targetRoom']) : '';
        if ($target === '') {
            nightlatch_delete_room_connection_with_pair($pdo, $roomId, $regionId);
            continue;
        }
        $targetRoom = isset($targetById[$target]) ? $targetById[$target] : (isset($targetBySlug[$target]) ? $targetBySlug[$target] : null);
        if (!$targetRoom) {
            throw new RuntimeException('Door “' . (isset($region['name']) ? $region['name'] : $regionId) . '” points to a room that no longer exists.');
        }
        $existing = isset($existingConnections[$regionId]) ? $existingConnections[$regionId] : null;
        $returnMode = $existing && (int) $existing['target_room_id'] === (int) $targetRoom['id'] ? $existing['return_mode'] : 'behind';
        $targetRegionId = $returnMode === 'door' && $existing ? $existing['target_region_id'] : null;
        $upsert->execute(array($roomId, $regionId, (int) $targetRoom['id'], $returnMode, $targetRegionId));
    }
    foreach ($existingConnections as $regionId => $_connection) {
        if (!isset($validDoorIds[$regionId])) {
            nightlatch_delete_room_connection_with_pair($pdo, $roomId, $regionId);
        }
    }

    $deleteGateway = $pdo->prepare('DELETE FROM room_gateways WHERE room_id = ?');
    if (!$gatewayEnabled) {
        $deleteGateway->execute(array($roomId));
    } else {
        $destinationCount = (int) (isset($gateway['destinationCount']) ? $gateway['destinationCount'] : 0);
        $stmt = $pdo->prepare('INSERT INTO room_gateways (room_id, destination_count) VALUES (?, ?) ON DUPLICATE KEY UPDATE destination_count = VALUES(destination_count)');
        $stmt->execute(array($roomId, $destinationCount));
        $pdo->prepare('DELETE FROM room_gateway_exits WHERE gateway_room_id = ?')->execute(array($roomId));
        $pdo->prepare('DELETE FROM room_gateway_candidates WHERE gateway_room_id = ?')->execute(array($roomId));
        $exitStmt = $pdo->prepare('INSERT INTO room_gateway_exits (gateway_room_id, region_id) VALUES (?, ?)');
        foreach ($exitIds as $regionId) {
            $exitStmt->execute(array($roomId, $regionId));
        }
        $candidateStmt = $pdo->prepare('INSERT INTO room_gateway_candidates (gateway_room_id, cluster_id) VALUES (?, ?)');
        $candidateIds = isset($gateway['candidateClusterIds']) && is_array($gateway['candidateClusterIds']) ? array_values(array_unique(array_map('intval', $gateway['candidateClusterIds']))) : array();
        foreach ($candidateIds as $clusterId) {
            if ($clusterId > 0) {
                $candidateStmt->execute(array($roomId, $clusterId));
            }
        }
    }

    $saved = nightlatch_load_topology($pdo, false);
    nightlatch_validate_topology($saved, $saved['rooms']);
    return $saved;
}
