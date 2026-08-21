<?php

require dirname(__DIR__) . '/app/map-topology.php';

function topology_room($id, $title, $slug, $doorIds)
{
    $regions = array();
    foreach ($doorIds as $doorId) {
        $regions[] = array('id' => $doorId, 'name' => ucwords(str_replace('-', ' ', $doorId)), 'kind' => 'door');
    }
    return array('id' => $id, 'title' => $title, 'slug' => $slug, 'data' => array('version' => 2, 'regions' => $regions));
}

function topology_rejects($topology, $rooms, $message, $sounds = null)
{
    try {
        nightlatch_validate_topology($topology, $rooms, $sounds);
        fwrite(STDERR, $message . "\n");
        exit(1);
    } catch (RuntimeException $exception) {
        // Expected.
    }
}

$rooms = array(
    topology_room(1, 'Foyer', 'foyer', array('foyer-east', 'foyer-gateway-a', 'foyer-gateway-b')),
    topology_room(2, 'Library', 'library', array('library-west')),
    topology_room(3, 'Conservatory', 'conservatory', array('conservatory-return')),
    topology_room(4, 'Cellar', 'cellar', array('cellar-return')),
    topology_room(5, 'Palm Hall', 'palm-hall', array('palm-west')),
);
$sounds = array(array('id' => 9, 'name' => 'Cold wind'));

$topology = array(
    'clusters' => array(
        array('id' => 'cluster-main', 'name' => 'Main House', 'slug' => 'main-house', 'ambientSoundId' => 9, 'ambientVolume' => 42, 'entryRoomId' => 1, 'gatewayReturnMode' => 'behind', 'gatewayReturnRegionId' => '', 'isStart' => true),
        array('id' => 'cluster-glass', 'name' => 'Glass Wing', 'slug' => 'glass-wing', 'entryRoomId' => 3, 'gatewayReturnMode' => 'door', 'gatewayReturnRegionId' => 'conservatory-return', 'isStart' => false),
        array('id' => 'cluster-cellar', 'name' => 'Cellar', 'slug' => 'cellar', 'entryRoomId' => 4, 'gatewayReturnMode' => 'behind', 'gatewayReturnRegionId' => '', 'isStart' => false),
    ),
    'nodes' => array(
        array('clusterId' => 'cluster-main', 'roomId' => 1, 'x' => 40, 'y' => 40),
        array('clusterId' => 'cluster-main', 'roomId' => 2, 'x' => 360, 'y' => 40),
        array('clusterId' => 'cluster-glass', 'roomId' => 3, 'x' => 40, 'y' => 40),
        array('clusterId' => 'cluster-cellar', 'roomId' => 4, 'x' => 40, 'y' => 40),
        array('clusterId' => 'cluster-glass', 'roomId' => 5, 'x' => 360, 'y' => 40),
    ),
    'connections' => array(
        array('sourceRoomId' => 1, 'sourceRegionId' => 'foyer-east', 'targetRoomId' => 2, 'returnMode' => 'door', 'targetRegionId' => 'library-west'),
        array('sourceRoomId' => 2, 'sourceRegionId' => 'library-west', 'targetRoomId' => 1, 'returnMode' => 'door', 'targetRegionId' => 'foyer-east'),
    ),
    'gateways' => array(
        array('roomId' => 1, 'destinationCount' => 2, 'exitRegionIds' => array('foyer-gateway-a', 'foyer-gateway-b'), 'candidateClusterIds' => array('cluster-glass', 'cluster-cellar')),
    ),
);

$normalized = nightlatch_validate_topology($topology, $rooms, $sounds);
if (count($normalized['clusters']) !== 3 || count($normalized['connections']) !== 2 || $normalized['gateways'][0]['destinationCount'] !== 2) {
    fwrite(STDERR, "Valid map topology was not normalized correctly.\n");
    exit(1);
}
if ($normalized['clusters'][0]['ambientSoundId'] !== '9' || $normalized['clusters'][0]['ambientVolume'] !== 42 || $normalized['clusters'][1]['ambientVolume'] !== 35) {
    fwrite(STDERR, "Cluster ambient audio was not normalized correctly.\n");
    exit(1);
}

$savedTopology = $topology;
$savedClusterIds = array('cluster-main' => 1, 'cluster-glass' => 2, 'cluster-cellar' => 3);
foreach ($savedTopology['clusters'] as &$cluster) {
    $cluster['id'] = $savedClusterIds[$cluster['id']];
}
unset($cluster);
foreach ($savedTopology['nodes'] as &$node) {
    $node['clusterId'] = $savedClusterIds[$node['clusterId']];
}
unset($node);
$savedTopology['gateways'][0]['candidateClusterIds'] = array(2, 3);
$savedNormalized = nightlatch_validate_topology($savedTopology, $rooms, $sounds);
if ($savedNormalized['clusters'][0]['id'] !== '1' || $savedNormalized['nodes'][0]['clusterId'] !== '1') {
    fwrite(STDERR, "Saved numeric cluster identifiers were not normalized correctly.\n");
    exit(1);
}

$invalid = $topology;
$invalid['clusters'][1]['entryRoomId'] = 2;
topology_rejects($invalid, $rooms, 'A cluster accepted an entry room from another cluster.');

$invalid = $topology;
$invalid['clusters'][0]['ambientSoundId'] = 99;
topology_rejects($invalid, $rooms, 'A cluster accepted an ambient sound that no longer exists.', $sounds);

$invalid = $topology;
$invalid['clusters'][0]['ambientVolume'] = 101;
topology_rejects($invalid, $rooms, 'A cluster accepted ambient volume above 100.', $sounds);

$invalid = $topology;
$invalid['connections'][0]['targetRoomId'] = 3;
topology_rejects($invalid, $rooms, 'A static connection was allowed to cross clusters.');

$invalid = $topology;
array_pop($invalid['connections']);
topology_rejects($invalid, $rooms, 'A paired door connection was accepted without its reverse exit.');

$invalid = $topology;
$invalid['gateways'][0]['exitRegionIds'] = array('foyer-gateway-a');
topology_rejects($invalid, $rooms, 'A Gateway accepted fewer exits than destinations.');

$invalid = $topology;
$invalid['connections'][] = array('sourceRoomId' => 1, 'sourceRegionId' => 'foyer-gateway-a', 'targetRoomId' => 2, 'returnMode' => 'behind', 'targetRegionId' => '');
topology_rejects($invalid, $rooms, 'A Gateway exit also accepted a static destination.');

$invalid = $topology;
$invalid['clusters'][1]['gatewayReturnRegionId'] = 'missing-door';
topology_rejects($invalid, $rooms, 'A cluster accepted a missing Gateway return door.');

$invalid = $topology;
$invalid['connections'][] = array('sourceRoomId' => 3, 'sourceRegionId' => 'conservatory-return', 'targetRoomId' => 5, 'returnMode' => 'one_way', 'targetRegionId' => '');
topology_rejects($invalid, $rooms, 'A cluster Gateway return door also accepted a static destination.');

$hydratedRooms = $rooms;
nightlatch_apply_topology_to_rooms($hydratedRooms, $topology['connections'], $topology['gateways']);
if ($hydratedRooms[0]['data']['regions'][0]['door']['targetRoom'] !== '2'
    || $hydratedRooms[0]['data']['regions'][1]['door']['connectionMode'] !== 'gateway') {
    fwrite(STDERR, "Canonical topology was not applied to compatibility door metadata.\n");
    exit(1);
}

fwrite(STDOUT, "map-topology tests passed\n");
