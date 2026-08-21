(function ($) {
    'use strict';

    var state = JSON.parse(JSON.stringify(window.NL_MAP_BOOTSTRAP || { rooms: [], clusters: [], nodes: [], connections: [], gateways: [] }));
    state.rooms = Array.isArray(state.rooms) ? state.rooms : [];
    state.clusters = Array.isArray(state.clusters) ? state.clusters : [];
    state.nodes = Array.isArray(state.nodes) ? state.nodes : [];
    state.connections = Array.isArray(state.connections) ? state.connections : [];
    state.gateways = Array.isArray(state.gateways) ? state.gateways : [];
    var sounds = Array.isArray(window.NL_MAP_SOUNDS) ? window.NL_MAP_SOUNDS : [];
    var soundById = {};
    sounds.forEach(function (sound) { soundById[String(sound.id)] = sound; });
    state.clusters.forEach(function (cluster) {
        if (cluster.ambientSoundId === undefined || cluster.ambientSoundId === null) cluster.ambientSoundId = '';
        if (cluster.ambientVolume === undefined || cluster.ambientVolume === null) cluster.ambientVolume = 35;
    });
    var activeClusterId = state.clusters.length ? String(state.clusters[0].id) : '';
    var selectedRoomId = '';
    var draggedExit = null;
    var nodeDrag = null;
    var dirty = false;

    function esc(value) { return $('<div>').text(value === undefined || value === null ? '' : value).html(); }
    function id(value) { return String(value === undefined || value === null ? '' : value); }
    function slug(value) { return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
    function roomById(roomId) { return state.rooms.find(function (room) { return id(room.id) === id(roomId); }) || null; }
    function clusterById(clusterId) { return state.clusters.find(function (cluster) { return id(cluster.id) === id(clusterId); }) || null; }
    function activeCluster() { return clusterById(activeClusterId); }
    function nodeForRoom(roomId) { return state.nodes.find(function (node) { return id(node.roomId) === id(roomId); }) || null; }
    function clusterForRoom(roomId) { var node = nodeForRoom(roomId); return node ? clusterById(node.clusterId) : null; }
    function roomDoors(room) {
        return room && room.data && Array.isArray(room.data.regions) ? room.data.regions.filter(function (region) { return region.kind === 'door'; }) : [];
    }
    function doorById(room, regionId) { return roomDoors(room).find(function (door) { return id(door.id) === id(regionId); }) || null; }
    function gatewayForRoom(roomId) { return state.gateways.find(function (gateway) { return id(gateway.roomId) === id(roomId); }) || null; }
    function connectionForExit(roomId, regionId) {
        return state.connections.find(function (connection) { return id(connection.sourceRoomId) === id(roomId) && id(connection.sourceRegionId) === id(regionId); }) || null;
    }
    function isGatewayExit(roomId, regionId) {
        var gateway = gatewayForRoom(roomId);
        return !!gateway && (gateway.exitRegionIds || []).some(function (candidate) { return id(candidate) === id(regionId); });
    }
    function isGatewayReturnDoor(roomId, regionId) {
        var cluster = clusterForRoom(roomId);
        return !!cluster && cluster.gatewayReturnMode === 'door' && id(cluster.entryRoomId) === id(roomId) && id(cluster.gatewayReturnRegionId) === id(regionId);
    }
    function markDirty() {
        dirty = true;
        $('#map-save-indicator').html('<i class="fa-solid fa-circle"></i> Unsaved map changes').addClass('dirty');
    }
    function toast(message, error) {
        $('#toast').text(message).toggleClass('error', !!error).addClass('visible');
        window.clearTimeout(window.nlToastTimer);
        window.nlToastTimer = window.setTimeout(function () { $('#toast').removeClass('visible'); }, 3400);
    }

    function clusterNodes(clusterId) {
        return state.nodes.filter(function (node) { return id(node.clusterId) === id(clusterId); });
    }

    function renderAmbientSoundOptions(query) {
        var cluster = activeCluster();
        if (!cluster) return;
        query = String(query || '').trim().toLowerCase();
        var selectedId = id(cluster.ambientSoundId);
        var html = '<button type="button" class="logic-picker-option map-sound-option" data-sound-id=""><span><strong>No ambient sound</strong><small>Silence in this cluster</small></span>' + (!selectedId ? '<i class="fa-solid fa-check"></i>' : '') + '</button>';
        var matches = sounds.filter(function (sound) {
            return !query || String(sound.name + ' ' + sound.slug + ' ' + (sound.originalFilename || '')).toLowerCase().indexOf(query) !== -1;
        });
        matches.forEach(function (sound) {
            html += '<button type="button" class="logic-picker-option map-sound-option" data-sound-id="' + esc(sound.id) + '"><span><strong>' + esc(sound.name) + '</strong><small>' + esc(sound.slug) + '</small></span>' + (selectedId === id(sound.id) ? '<i class="fa-solid fa-check"></i>' : '') + '</button>';
        });
        if (!matches.length) html += '<p class="logic-picker-empty">' + (sounds.length ? 'No sounds match that search.' : 'Upload sounds from the Sounds tab first.') + '</p>';
        $('#cluster-ambient-sound-options').html(html);
    }

    function renderAmbientSoundPicker() {
        var cluster = activeCluster();
        if (!cluster) return;
        var sound = soundById[id(cluster.ambientSoundId)] || null;
        var selectedId = id(cluster.ambientSoundId);
        $('#cluster-ambient-sound').val(selectedId);
        $('#cluster-ambient-sound-name').text(sound ? sound.name : (selectedId ? 'Unavailable sound' : 'No ambient sound'));
        $('#cluster-ambient-sound-detail').text(sound ? sound.slug : (selectedId ? 'Saved sound #' + selectedId : 'Silence in this cluster'));
        $('#cluster-ambient-sound-search').val('');
        $('#cluster-ambient-sound-picker').removeClass('open');
        $('#cluster-ambient-sound-toggle').attr('aria-expanded', 'false');
        renderAmbientSoundOptions('');
    }

    function renderClusterList() {
        var html = '';
        state.clusters.forEach(function (cluster) {
            var count = clusterNodes(cluster.id).length;
            html += '<button type="button" class="cluster-list-item' + (id(cluster.id) === activeClusterId ? ' active' : '') + '" data-cluster-id="' + esc(cluster.id) + '">' +
                '<span><strong>' + esc(cluster.name) + '</strong><small>' + count + ' room' + (count === 1 ? '' : 's') + (cluster.isStart ? ' · start' : '') + '</small></span><i class="fa-solid fa-chevron-right"></i></button>';
        });
        $('#cluster-list').html(html || '<div class="map-mini-empty"><i class="fa-solid fa-layer-group"></i><p>No clusters yet</p></div>');
    }

    function renderClusterSettings() {
        var cluster = activeCluster();
        $('#cluster-settings').prop('hidden', !cluster);
        $('#map-empty').prop('hidden', !!cluster);
        $('#map-stage-wrap').prop('hidden', !cluster);
        if (!cluster) return;
        $('#cluster-name').val(cluster.name);
        $('#cluster-slug').val(cluster.slug);
        $('#cluster-description').val(cluster.description || '');
        renderAmbientSoundPicker();
        var ambientVolume = Math.max(0, Math.min(100, parseInt(cluster.ambientVolume, 10)));
        if (isNaN(ambientVolume)) ambientVolume = 35;
        cluster.ambientVolume = ambientVolume;
        $('#cluster-ambient-volume').val(ambientVolume);
        $('#cluster-ambient-volume-value').text(ambientVolume + '%');
        $('#cluster-start').prop('checked', !!cluster.isStart);
        $('#cluster-return-mode').val(cluster.gatewayReturnMode || 'behind');
        var nodes = clusterNodes(cluster.id);
        var roomOptions = '<option value="">Choose entry room</option>';
        nodes.forEach(function (node) {
            var room = roomById(node.roomId);
            if (room) roomOptions += '<option value="' + esc(room.id) + '">' + esc(room.title) + '</option>';
        });
        $('#cluster-entry-room').html(roomOptions).val(id(cluster.entryRoomId));
        renderClusterReturnDoors();
        var assigned = {};
        state.nodes.forEach(function (node) { assigned[id(node.roomId)] = true; });
        var available = state.rooms.filter(function (room) { return !assigned[id(room.id)]; });
        $('#unassigned-room').html('<option value="">Choose unassigned room</option>' + available.map(function (room) {
            return '<option value="' + esc(room.id) + '">' + esc(room.title) + ' · ' + esc(room.slug) + '</option>';
        }).join(''));
    }

    function renderClusterReturnDoors() {
        var cluster = activeCluster();
        if (!cluster) return;
        var room = roomById(cluster.entryRoomId);
        var options = '<option value="">Choose return door</option>';
        roomDoors(room).forEach(function (door) { options += '<option value="' + esc(door.id) + '">' + esc(door.name) + '</option>'; });
        $('#cluster-return-door').html(options).val(cluster.gatewayReturnRegionId || '');
        $('#cluster-return-door-fields').toggle((cluster.gatewayReturnMode || 'behind') === 'door');
    }

    function nodeHtml(node) {
        var room = roomById(node.roomId);
        if (!room) return '';
        var cluster = activeCluster();
        var gateway = gatewayForRoom(room.id);
        var badges = '';
        if (cluster && id(cluster.entryRoomId) === id(room.id)) badges += '<span class="map-node-badge entry">Entry</span>';
        if (gateway) badges += '<span class="map-node-badge gateway">Gateway</span>';
        var doors = roomDoors(room);
        var doorHtml = doors.length ? '' : '<p class="map-node-no-doors">No Door / exit regions</p>';
        doors.forEach(function (door) {
            var connection = connectionForExit(room.id, door.id);
            var target = connection ? roomById(connection.targetRoomId) : null;
            var gatewayExit = isGatewayExit(room.id, door.id);
            var gatewayReturn = isGatewayReturnDoor(room.id, door.id);
            doorHtml += '<button type="button" draggable="' + (gatewayReturn ? 'false' : 'true') + '" class="map-door-handle' + (gatewayExit ? ' gateway' : '') + (gatewayReturn ? ' gateway-return' : '') + '" data-room-id="' + esc(room.id) + '" data-region-id="' + esc(door.id) + '" title="' + (gatewayReturn ? 'Reserved cluster Gateway return' : 'Drag this exit onto another room') + '">' +
                '<i class="fa-solid ' + (gatewayReturn ? 'fa-rotate-left' : (gatewayExit ? 'fa-shuffle' : 'fa-arrow-right-from-bracket')) + '"></i><span><strong>' + esc(door.name) + '</strong><small>' + (gatewayReturn ? 'Reserved Gateway return' : (gatewayExit ? 'Dynamic Gateway exit' : (target ? 'To ' + esc(target.title) : 'Drag to connect'))) + '</small></span></button>';
        });
        return '<article class="map-node' + (id(room.id) === selectedRoomId ? ' selected' : '') + '" data-room-id="' + esc(room.id) + '" style="left:' + Number(node.x || 0) + 'px;top:' + Number(node.y || 0) + 'px">' +
            '<header class="map-node-drag"><span><strong>' + esc(room.title) + '</strong><small>' + esc(room.slug) + '</small></span><span class="map-node-badges">' + badges + '</span><i class="fa-solid fa-grip"></i></header><div class="map-node-doors">' + doorHtml + '</div></article>';
    }

    function renderNodes() {
        var cluster = activeCluster();
        if (!cluster) return;
        $('#map-nodes').html(clusterNodes(cluster.id).map(nodeHtml).join(''));
        window.requestAnimationFrame(renderArrows);
    }

    function renderArrows() {
        var cluster = activeCluster();
        var svg = document.getElementById('map-connections');
        if (!cluster || !svg) return;
        $(svg).find('.map-connection-line').remove();
        var stageRect = document.getElementById('map-stage').getBoundingClientRect();
        state.connections.forEach(function (connection) {
            var sourceNode = nodeForRoom(connection.sourceRoomId);
            var targetNode = nodeForRoom(connection.targetRoomId);
            if (!sourceNode || !targetNode || id(sourceNode.clusterId) !== activeClusterId || id(targetNode.clusterId) !== activeClusterId) return;
            var handle = document.querySelector('.map-door-handle[data-room-id="' + CSS.escape(id(connection.sourceRoomId)) + '"][data-region-id="' + CSS.escape(id(connection.sourceRegionId)) + '"]');
            var target = document.querySelector('.map-node[data-room-id="' + CSS.escape(id(connection.targetRoomId)) + '"]');
            if (!handle || !target) return;
            var handleRect = handle.getBoundingClientRect();
            var targetRect = target.getBoundingClientRect();
            var startX = handleRect.right - stageRect.left;
            var startY = handleRect.top + handleRect.height / 2 - stageRect.top;
            var endX = targetRect.left - stageRect.left;
            var endY = targetRect.top + Math.min(55, targetRect.height / 2) - stageRect.top;
            if (endX < startX) endX = targetRect.right - stageRect.left;
            var bend = Math.max(60, Math.abs(endX - startX) * 0.45);
            var direction = endX >= startX ? 1 : -1;
            var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M ' + startX + ' ' + startY + ' C ' + (startX + bend * direction) + ' ' + startY + ', ' + (endX - bend * direction) + ' ' + endY + ', ' + endX + ' ' + endY);
            path.setAttribute('class', 'map-connection-line');
            path.setAttribute('marker-end', 'url(#map-arrow)');
            svg.appendChild(path);
        });
    }

    function renderConnectionInspector(room) {
        var connections = state.connections.filter(function (connection) { return id(connection.sourceRoomId) === id(room.id); });
        var html = '';
        connections.forEach(function (connection) {
            var sourceDoor = doorById(room, connection.sourceRegionId);
            var targetRoom = roomById(connection.targetRoomId);
            if (!sourceDoor || !targetRoom) return;
            var doorOptions = '<option value="">Choose destination door</option>' + roomDoors(targetRoom).map(function (door) {
                var reserved = isGatewayReturnDoor(targetRoom.id, door.id) || isGatewayExit(targetRoom.id, door.id);
                return '<option value="' + esc(door.id) + '"' + (id(door.id) === id(connection.targetRegionId) ? ' selected' : '') + (reserved ? ' disabled' : '') + '>' + esc(door.name) + (reserved ? ' · reserved' : '') + '</option>';
            }).join('');
            html += '<div class="map-connection-card" data-source-region-id="' + esc(connection.sourceRegionId) + '"><div><strong>' + esc(sourceDoor.name) + '</strong><span><i class="fa-solid fa-arrow-right"></i> ' + esc(targetRoom.title) + '</span><button type="button" class="icon-button danger map-delete-connection" title="Remove connection"><i class="fa-solid fa-xmark"></i></button></div>' +
                '<label>Return behavior</label><select class="map-return-mode"><option value="behind"' + (connection.returnMode === 'behind' ? ' selected' : '') + '>Behind-you control</option><option value="door"' + (connection.returnMode === 'door' ? ' selected' : '') + '>Paired destination door</option><option value="one_way"' + (connection.returnMode === 'one_way' ? ' selected' : '') + '>One-way</option></select>' +
                '<div class="map-target-door"' + (connection.returnMode === 'door' ? '' : ' hidden') + '><label>Destination door</label><select class="map-target-region">' + doorOptions + '</select><button type="button" class="btn-ghost btn-block map-create-reverse"><i class="fa-solid fa-right-left"></i> Create matching reverse exit</button></div></div>';
        });
        $('#map-room-connections').html(html || '<p class="empty-mini">No static connections from this room.</p>');
    }

    function renderGatewayEditor(room) {
        var gateway = gatewayForRoom(room.id);
        $('#gateway-enabled').prop('checked', !!gateway);
        $('#gateway-fields').prop('hidden', !gateway);
        if (!gateway) return;
        gateway.exitRegionIds = Array.isArray(gateway.exitRegionIds) ? gateway.exitRegionIds : [];
        gateway.candidateClusterIds = Array.isArray(gateway.candidateClusterIds) ? gateway.candidateClusterIds : [];
        $('#gateway-count').val(gateway.destinationCount || 1);
        var exitHtml = '';
        roomDoors(room).forEach(function (door) {
            var checked = gateway.exitRegionIds.some(function (regionId) { return id(regionId) === id(door.id); });
            var reserved = isGatewayReturnDoor(room.id, door.id);
            exitHtml += '<label><input type="checkbox" class="gateway-exit-option" value="' + esc(door.id) + '"' + (checked ? ' checked' : '') + (reserved ? ' disabled' : '') + '><span><strong>' + esc(door.name) + '</strong><small>' + (reserved ? 'Reserved cluster Gateway return' : (connectionForExit(room.id, door.id) ? 'Currently has a static destination' : 'Available door region')) + '</small></span></label>';
        });
        $('#gateway-exits').html(exitHtml || '<p class="empty-mini">Create Door / exit regions in the room editor first.</p>');
        var ownCluster = clusterForRoom(room.id);
        var candidateHtml = '';
        state.clusters.forEach(function (cluster) {
            if (ownCluster && id(cluster.id) === id(ownCluster.id)) return;
            var checked = gateway.candidateClusterIds.some(function (clusterId) { return id(clusterId) === id(cluster.id); });
            candidateHtml += '<label><input type="checkbox" class="gateway-candidate-option" value="' + esc(cluster.id) + '"' + (checked ? ' checked' : '') + '><span><strong>' + esc(cluster.name) + '</strong><small>Entry: ' + esc((roomById(cluster.entryRoomId) || {}).title || 'not set') + '</small></span></label>';
        });
        $('#gateway-candidates').html(candidateHtml || '<p class="empty-mini">Create at least one other cluster.</p>');
        renderGatewayStatus(room, gateway);
    }

    function renderGatewayStatus(room, gateway) {
        var count = Math.max(1, parseInt(gateway.destinationCount, 10) || 1);
        var exitCount = (gateway.exitRegionIds || []).length;
        var candidateCount = (gateway.candidateClusterIds || []).length;
        var valid = exitCount >= count && candidateCount >= count;
        var message = valid
            ? '<i class="fa-solid fa-circle-check"></i><span>Ready: ' + count + ' distinct clusters will be assigned to ' + count + ' shuffled exits.</span>'
            : '<i class="fa-solid fa-triangle-exclamation"></i><span>Cannot save: choose at least ' + count + ' Gateway exits and ' + count + ' eligible clusters. Currently ' + exitCount + ' exits and ' + candidateCount + ' clusters are selected.</span>';
        $('#gateway-status').toggleClass('valid', valid).html(message);
    }

    function renderRoomInspector() {
        var room = roomById(selectedRoomId);
        $('#map-inspector-empty').toggle(!room);
        $('#map-room-settings').prop('hidden', !room);
        if (!room) return;
        var cluster = clusterForRoom(room.id);
        $('#map-room-title').text(room.title);
        $('#map-room-cluster').text((cluster ? cluster.name : 'Unassigned') + ' · ' + room.slug);
        $('#map-edit-room').attr('href', 'room-edit.php?id=' + room.id);
        renderConnectionInspector(room);
        renderGatewayEditor(room);
    }

    function renderAll() {
        renderClusterList();
        renderClusterSettings();
        renderNodes();
        renderRoomInspector();
    }

    function addConnection(sourceRoomId, sourceRegionId, targetRoomId) {
        if (id(sourceRoomId) === id(targetRoomId)) {
            toast('Choose a different destination room.', true);
            return;
        }
        if (isGatewayExit(sourceRoomId, sourceRegionId)) {
            toast('That door is a Gateway exit. Remove it from the Gateway before assigning a static room.', true);
            return;
        }
        if (isGatewayReturnDoor(sourceRoomId, sourceRegionId)) {
            toast('That door is reserved as the cluster Gateway return.', true);
            return;
        }
        var sourceNode = nodeForRoom(sourceRoomId);
        var targetNode = nodeForRoom(targetRoomId);
        if (!sourceNode || !targetNode || id(sourceNode.clusterId) !== id(targetNode.clusterId)) {
            toast('Static exits may connect only rooms in the same cluster.', true);
            return;
        }
        var existing = connectionForExit(sourceRoomId, sourceRegionId);
        if (existing) {
            removeMatchingReverse(existing);
            existing.targetRoomId = targetRoomId;
            existing.returnMode = 'behind';
            existing.targetRegionId = '';
        } else {
            state.connections.push({ id: 0, sourceRoomId: sourceRoomId, sourceRegionId: sourceRegionId, targetRoomId: targetRoomId, returnMode: 'behind', targetRegionId: '' });
        }
        selectedRoomId = id(sourceRoomId);
        markDirty();
        renderNodes();
        renderRoomInspector();
    }

    function removeMatchingReverse(connection) {
        if (!connection || connection.returnMode !== 'door' || !connection.targetRegionId) return;
        state.connections = state.connections.filter(function (candidate) {
            return !(id(candidate.sourceRoomId) === id(connection.targetRoomId)
                && id(candidate.sourceRegionId) === id(connection.targetRegionId)
                && id(candidate.targetRoomId) === id(connection.sourceRoomId)
                && id(candidate.targetRegionId) === id(connection.sourceRegionId)
                && candidate.returnMode === 'door');
        });
    }

    function ensureMatchingReverse(connection) {
        if (!connection || connection.returnMode !== 'door' || !connection.targetRegionId) return false;
        if (isGatewayExit(connection.targetRoomId, connection.targetRegionId) || isGatewayReturnDoor(connection.targetRoomId, connection.targetRegionId)) {
            toast('The destination door is reserved for Gateway travel.', true);
            return false;
        }
        var conflict = connectionForExit(connection.targetRoomId, connection.targetRegionId);
        if (conflict && (id(conflict.targetRoomId) !== id(connection.sourceRoomId) || id(conflict.targetRegionId) !== id(connection.sourceRegionId) || conflict.returnMode !== 'door')) {
            toast('The destination door already has another connection.', true);
            return false;
        }
        if (!conflict) state.connections.push({ id: 0, sourceRoomId: connection.targetRoomId, sourceRegionId: connection.targetRegionId, targetRoomId: connection.sourceRoomId, returnMode: 'door', targetRegionId: connection.sourceRegionId });
        return true;
    }

    $('#cluster-list').on('click', '.cluster-list-item', function () {
        activeClusterId = id($(this).data('cluster-id'));
        selectedRoomId = '';
        renderAll();
    });

    $('#add-cluster').on('click', function () {
        var sequence = state.clusters.length + 1;
        var name = 'New cluster ' + sequence;
        var cluster = { id: 'new-' + Date.now().toString(36), name: name, slug: slug(name), description: '', ambientSoundId: '', ambientVolume: 35, entryRoomId: '', gatewayReturnMode: 'behind', gatewayReturnRegionId: '', isStart: state.clusters.length === 0 };
        state.clusters.push(cluster);
        activeClusterId = id(cluster.id);
        selectedRoomId = '';
        markDirty();
        renderAll();
        $('#cluster-name').focus().select();
    });

    $('#delete-cluster').on('click', function () {
        var cluster = activeCluster();
        if (!cluster || !window.confirm('Delete this cluster and remove its rooms and connections from the map? Room content will not be deleted.')) return;
        var removedRooms = {};
        clusterNodes(cluster.id).forEach(function (node) { removedRooms[id(node.roomId)] = true; });
        state.nodes = state.nodes.filter(function (node) { return id(node.clusterId) !== id(cluster.id); });
        state.connections = state.connections.filter(function (connection) { return !removedRooms[id(connection.sourceRoomId)] && !removedRooms[id(connection.targetRoomId)]; });
        state.gateways = state.gateways.filter(function (gateway) {
            gateway.candidateClusterIds = (gateway.candidateClusterIds || []).filter(function (clusterId) { return id(clusterId) !== id(cluster.id); });
            return !removedRooms[id(gateway.roomId)];
        });
        state.clusters = state.clusters.filter(function (candidate) { return id(candidate.id) !== id(cluster.id); });
        if (state.clusters.length && !state.clusters.some(function (candidate) { return candidate.isStart; })) state.clusters[0].isStart = true;
        activeClusterId = state.clusters.length ? id(state.clusters[0].id) : '';
        selectedRoomId = '';
        markDirty();
        renderAll();
    });

    $('#cluster-name, #cluster-slug, #cluster-description').on('input', function () {
        var cluster = activeCluster();
        if (!cluster) return;
        cluster.name = $('#cluster-name').val().trim();
        cluster.slug = $('#cluster-slug').val().trim();
        cluster.description = $('#cluster-description').val();
        markDirty();
        renderClusterList();
    });
    $('#cluster-name').on('change', function () {
        var cluster = activeCluster();
        if (cluster && !cluster.slug) { cluster.slug = slug(cluster.name); $('#cluster-slug').val(cluster.slug); }
    });
    $('#cluster-ambient-sound-toggle').on('click', function () {
        var picker = $('#cluster-ambient-sound-picker');
        var open = !picker.hasClass('open');
        picker.toggleClass('open', open);
        $(this).attr('aria-expanded', open ? 'true' : 'false');
        if (open) {
            $('#cluster-ambient-sound-search').val('');
            renderAmbientSoundOptions('');
            $('#cluster-ambient-sound-search').focus();
        }
    });
    $('#cluster-ambient-sound-search').on('input', function () { renderAmbientSoundOptions($(this).val()); });
    $('#cluster-ambient-sound-options').on('click', '.map-sound-option', function () {
        var cluster = activeCluster();
        if (!cluster) return;
        cluster.ambientSoundId = id($(this).data('sound-id'));
        markDirty();
        renderAmbientSoundPicker();
    });
    $('#cluster-ambient-volume').on('input change', function () {
        var cluster = activeCluster();
        if (!cluster) return;
        var volume = Math.max(0, Math.min(100, parseInt($(this).val(), 10) || 0));
        cluster.ambientVolume = volume;
        $('#cluster-ambient-volume-value').text(volume + '%');
        markDirty();
    });
    $(document).on('click', function (event) {
        if ($(event.target).closest('#cluster-ambient-sound-picker').length) return;
        $('#cluster-ambient-sound-picker').removeClass('open');
        $('#cluster-ambient-sound-toggle').attr('aria-expanded', 'false');
    });
    $('#cluster-start').on('change', function () {
        var cluster = activeCluster();
        if (!cluster) return;
        if (this.checked) state.clusters.forEach(function (candidate) { candidate.isStart = id(candidate.id) === id(cluster.id); });
        else cluster.isStart = false;
        markDirty(); renderClusterList();
    });
    $('#cluster-entry-room').on('change', function () {
        var cluster = activeCluster(); if (!cluster) return;
        cluster.entryRoomId = $(this).val(); cluster.gatewayReturnRegionId = '';
        markDirty(); renderClusterReturnDoors(); renderNodes(); renderRoomInspector();
    });
    $('#cluster-return-mode').on('change', function () {
        var cluster = activeCluster(); if (!cluster) return;
        cluster.gatewayReturnMode = $(this).val(); if (cluster.gatewayReturnMode !== 'door') cluster.gatewayReturnRegionId = '';
        markDirty(); renderClusterReturnDoors();
    });
    $('#cluster-return-door').on('change', function () {
        var cluster = activeCluster(); if (!cluster) return;
        cluster.gatewayReturnRegionId = $(this).val();
        if (cluster.gatewayReturnRegionId) {
            var connection = connectionForExit(cluster.entryRoomId, cluster.gatewayReturnRegionId);
            removeMatchingReverse(connection);
            state.connections = state.connections.filter(function (candidate) { return !(id(candidate.sourceRoomId) === id(cluster.entryRoomId) && id(candidate.sourceRegionId) === id(cluster.gatewayReturnRegionId)); });
            var gateway = gatewayForRoom(cluster.entryRoomId);
            if (gateway) gateway.exitRegionIds = (gateway.exitRegionIds || []).filter(function (regionId) { return id(regionId) !== id(cluster.gatewayReturnRegionId); });
        }
        markDirty(); renderNodes(); renderRoomInspector();
    });

    $('#add-room-to-cluster').on('click', function () {
        var cluster = activeCluster(); var roomId = $('#unassigned-room').val();
        if (!cluster || !roomId) return;
        var count = clusterNodes(cluster.id).length;
        state.nodes.push({ clusterId: cluster.id, roomId: roomId, x: 70 + (count % 3) * 300, y: 70 + Math.floor(count / 3) * 260 });
        if (!cluster.entryRoomId) cluster.entryRoomId = roomId;
        selectedRoomId = id(roomId);
        markDirty(); renderAll();
    });

    $('#map-nodes').on('click', '.map-node', function (event) {
        if ($(event.target).closest('.map-door-handle').length) return;
        selectedRoomId = id($(this).data('room-id'));
        renderNodes(); renderRoomInspector();
    });
    $('#map-nodes').on('dragstart', '.map-door-handle', function (event) {
        draggedExit = { roomId: id($(this).data('room-id')), regionId: id($(this).data('region-id')) };
        event.originalEvent.dataTransfer.effectAllowed = 'link';
        event.originalEvent.dataTransfer.setData('text/plain', draggedExit.roomId + ':' + draggedExit.regionId);
        $(this).addClass('dragging');
    }).on('dragend', '.map-door-handle', function () { $(this).removeClass('dragging'); draggedExit = null; });
    $('#map-nodes').on('dragover', '.map-node', function (event) { if (draggedExit) { event.preventDefault(); $(this).addClass('drop-target'); } });
    $('#map-nodes').on('dragleave', '.map-node', function () { $(this).removeClass('drop-target'); });
    $('#map-nodes').on('drop', '.map-node', function (event) {
        event.preventDefault(); $(this).removeClass('drop-target');
        if (draggedExit) addConnection(draggedExit.roomId, draggedExit.regionId, id($(this).data('room-id')));
    });

    $('#map-nodes').on('pointerdown', '.map-node-drag', function (event) {
        if (event.button !== 0) return;
        var card = $(this).closest('.map-node');
        var node = nodeForRoom(card.data('room-id'));
        if (!node) return;
        nodeDrag = { node: node, startX: event.clientX, startY: event.clientY, nodeX: Number(node.x || 0), nodeY: Number(node.y || 0) };
        this.setPointerCapture(event.pointerId);
        card.addClass('moving');
        event.preventDefault();
    });
    $(document).on('pointermove', function (event) {
        if (!nodeDrag) return;
        nodeDrag.node.x = Math.max(10, Math.min(9700, Math.round(nodeDrag.nodeX + event.clientX - nodeDrag.startX)));
        nodeDrag.node.y = Math.max(10, Math.min(9700, Math.round(nodeDrag.nodeY + event.clientY - nodeDrag.startY)));
        var card = $('.map-node[data-room-id="' + CSS.escape(id(nodeDrag.node.roomId)) + '"]');
        card.css({ left: nodeDrag.node.x + 'px', top: nodeDrag.node.y + 'px' });
        renderArrows();
    }).on('pointerup pointercancel', function () {
        if (!nodeDrag) return;
        $('.map-node.moving').removeClass('moving');
        nodeDrag = null; markDirty();
    });

    $('#remove-room-from-cluster').on('click', function () {
        var room = roomById(selectedRoomId); var cluster = activeCluster();
        if (!room || !cluster || !window.confirm('Remove this room and its connections from the cluster map? Room content will not be deleted.')) return;
        state.nodes = state.nodes.filter(function (node) { return id(node.roomId) !== id(room.id); });
        state.connections = state.connections.filter(function (connection) { return id(connection.sourceRoomId) !== id(room.id) && id(connection.targetRoomId) !== id(room.id); });
        state.gateways = state.gateways.filter(function (gateway) { return id(gateway.roomId) !== id(room.id); });
        if (id(cluster.entryRoomId) === id(room.id)) { cluster.entryRoomId = ''; cluster.gatewayReturnRegionId = ''; }
        selectedRoomId = ''; markDirty(); renderAll();
    });

    $('#map-room-connections').on('click', '.map-delete-connection', function () {
        var regionId = id($(this).closest('.map-connection-card').data('source-region-id'));
        removeMatchingReverse(connectionForExit(selectedRoomId, regionId));
        state.connections = state.connections.filter(function (connection) { return !(id(connection.sourceRoomId) === selectedRoomId && id(connection.sourceRegionId) === regionId); });
        markDirty(); renderNodes(); renderRoomInspector();
    }).on('change', '.map-return-mode', function () {
        var card = $(this).closest('.map-connection-card'); var connection = connectionForExit(selectedRoomId, card.data('source-region-id'));
        if (!connection) return;
        removeMatchingReverse(connection);
        connection.returnMode = $(this).val(); if (connection.returnMode !== 'door') connection.targetRegionId = '';
        markDirty(); renderRoomInspector();
    }).on('change', '.map-target-region', function () {
        var card = $(this).closest('.map-connection-card'); var connection = connectionForExit(selectedRoomId, card.data('source-region-id'));
        if (connection) {
            removeMatchingReverse(connection);
            connection.targetRegionId = $(this).val();
            if (connection.targetRegionId && !ensureMatchingReverse(connection)) connection.targetRegionId = '';
            markDirty(); renderNodes(); renderRoomInspector();
        }
    }).on('click', '.map-create-reverse', function () {
        var card = $(this).closest('.map-connection-card'); var connection = connectionForExit(selectedRoomId, card.data('source-region-id'));
        if (!connection || connection.returnMode !== 'door' || !connection.targetRegionId) { toast('Choose a destination door first.', true); return; }
        if (ensureMatchingReverse(connection)) { markDirty(); renderNodes(); renderRoomInspector(); toast('Matching reverse exit is ready'); }
    });

    $('#gateway-enabled').on('change', function () {
        var room = roomById(selectedRoomId); if (!room) return;
        if (this.checked && !gatewayForRoom(room.id)) state.gateways.push({ roomId: room.id, destinationCount: 1, exitRegionIds: [], candidateClusterIds: [] });
        if (!this.checked) state.gateways = state.gateways.filter(function (gateway) { return id(gateway.roomId) !== id(room.id); });
        markDirty(); renderNodes(); renderRoomInspector();
    });
    $('#gateway-count').on('input change', function () {
        var room = roomById(selectedRoomId); var gateway = room && gatewayForRoom(room.id); if (!gateway) return;
        gateway.destinationCount = Math.max(1, parseInt($(this).val(), 10) || 1); markDirty(); renderGatewayStatus(room, gateway);
    });
    $('#gateway-exits').on('change', '.gateway-exit-option', function () {
        var room = roomById(selectedRoomId); var gateway = room && gatewayForRoom(room.id); if (!gateway) return;
        var regionId = id($(this).val());
        if (this.checked) {
            gateway.exitRegionIds = (gateway.exitRegionIds || []).filter(function (candidate) { return id(candidate) !== regionId; });
            gateway.exitRegionIds.push(regionId);
            removeMatchingReverse(connectionForExit(room.id, regionId));
            state.connections = state.connections.filter(function (connection) { return !(id(connection.sourceRoomId) === id(room.id) && id(connection.sourceRegionId) === regionId); });
        } else gateway.exitRegionIds = (gateway.exitRegionIds || []).filter(function (candidate) { return id(candidate) !== regionId; });
        markDirty(); renderNodes(); renderRoomInspector();
    });
    $('#gateway-candidates').on('change', '.gateway-candidate-option', function () {
        var room = roomById(selectedRoomId); var gateway = room && gatewayForRoom(room.id); if (!gateway) return;
        var clusterId = id($(this).val());
        if (this.checked) { gateway.candidateClusterIds = (gateway.candidateClusterIds || []).filter(function (candidate) { return id(candidate) !== clusterId; }); gateway.candidateClusterIds.push(clusterId); }
        else gateway.candidateClusterIds = (gateway.candidateClusterIds || []).filter(function (candidate) { return id(candidate) !== clusterId; });
        markDirty(); renderGatewayStatus(room, gateway);
    });

    $('#save-map').on('click', function () {
        var button = $(this).prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Saving');
        var activeSlug = activeCluster() ? activeCluster().slug : '';
        fetch('api/map.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
            body: JSON.stringify({ topology: { clusters: state.clusters, nodes: state.nodes, connections: state.connections, gateways: state.gateways } })
        }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error || 'The map could not be saved.');
            state = result.topology;
            var active = state.clusters.find(function (cluster) { return cluster.slug === activeSlug; }) || state.clusters[0];
            activeClusterId = active ? id(active.id) : '';
            dirty = false;
            $('#map-save-indicator').html('<i class="fa-regular fa-circle-check"></i> Saved just now').removeClass('dirty');
            renderAll(); toast('Map saved');
        }).catch(function (error) { toast(error.message, true); }).finally(function () {
            button.prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> Save map');
        });
    });

    window.addEventListener('resize', renderArrows);
    window.addEventListener('beforeunload', function (event) { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
    renderAll();
})(jQuery);
