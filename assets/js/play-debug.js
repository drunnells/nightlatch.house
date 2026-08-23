(function ($) {
    'use strict';

    var initialRoom = window.NL_DEBUG_ROOM;
    var room = initialRoom;
    var rooms = Array.isArray(window.NL_DEBUG_ROOMS) && window.NL_DEBUG_ROOMS.length ? window.NL_DEBUG_ROOMS : [initialRoom];
    var objects = Array.isArray(window.NL_DEBUG_OBJECTS) ? window.NL_DEBUG_OBJECTS : [];
    var sounds = Array.isArray(window.NL_DEBUG_SOUNDS) ? window.NL_DEBUG_SOUNDS : [];
    var topology = window.NL_DEBUG_TOPOLOGY || { clusters: [], nodes: [], connections: [], gateways: [] };
    var objectBySlug = {};
    var roomById = {};
    var roomBySlug = {};
    var clusterById = {};
    var clusterByRoomId = {};
    var connectionByExit = {};
    var gatewayByRoomId = {};
    var soundById = {};
    var soundBySlug = {};
    var regions = room.data.regions || [];
    var state;
    var activeObject = null;
    var navigationStack = [];
    var svg = document.getElementById('play-regions');
    var objectSvg = document.getElementById('object-play-regions');
    var playStage = document.querySelector('.play-stage');
    var playCanvas = document.querySelector('.play-canvas');
    var roomImage = document.getElementById('room-image');
    var objectModalBody = document.getElementById('object-modal-body');
    var objectCanvas = document.getElementById('object-play-canvas');
    var soundPlayer = document.getElementById('debug-sound-player');
    var ambientPlayer = document.getElementById('debug-ambient-player');
    var ambientPending = false;
    var automaticBehaviorEntries = [];
    var stateBehaviorIndex = { flag: {}, item: {} };
    var activationBehaviorIndex = {};
    var regionLabelsByStateKey = {};

    objects.forEach(function (object) { objectBySlug[object.slug] = object; });
    sounds.forEach(function (sound) {
        soundById[String(sound.id)] = sound;
        soundBySlug[sound.slug] = sound;
    });
    rooms.forEach(function (candidate) {
        roomById[String(candidate.id)] = candidate;
        roomBySlug[candidate.slug] = candidate;
    });
    (topology.clusters || []).forEach(function (cluster) { clusterById[String(cluster.id)] = cluster; });
    (topology.nodes || []).forEach(function (node) { clusterByRoomId[String(node.roomId)] = String(node.clusterId); });
    (topology.connections || []).forEach(function (connection) { connectionByExit[String(connection.sourceRoomId) + ':' + connection.sourceRegionId] = connection; });
    (topology.gateways || []).forEach(function (gateway) { gatewayByRoomId[String(gateway.roomId)] = gateway; });

    function regionStateKey(contentKind, content, region) {
        return contentKind + ':' + content.slug + ':' + region.id;
    }

    function automaticEntryKey(entry) {
        return entry.contentKind + ':' + entry.content.slug + ':' + entry.region.id + ':' + entry.behavior.id;
    }

    function indexContentBehaviors(contentKind, content) {
        (content.data.regions || []).forEach(function (region) {
            var stateKey = regionStateKey(contentKind, content, region);
            regionLabelsByStateKey[stateKey] = content.title + ' · ' + region.name;
            region.automaticBehaviors = window.NLRoomRules.normalizeAutomaticBehaviors(region);
            region.automaticBehaviors.forEach(function (behavior) {
                var entry = { contentKind: contentKind, content: content, region: region, behavior: behavior, stateKey: stateKey };
                entry.key = automaticEntryKey(entry);
                automaticBehaviorEntries.push(entry);
                var trigger = behavior.trigger || {};
                if (trigger.type === 'state_change' && trigger.key) {
                    var sourceIndex = stateBehaviorIndex[trigger.source] || stateBehaviorIndex.flag;
                    sourceIndex[trigger.key] = sourceIndex[trigger.key] || [];
                    sourceIndex[trigger.key].push(entry);
                } else if (trigger.type === 'room_enter' || trigger.type === 'object_open') {
                    var activationKey = trigger.type + ':' + contentKind + ':' + content.slug;
                    activationBehaviorIndex[activationKey] = activationBehaviorIndex[activationKey] || [];
                    activationBehaviorIndex[activationKey].push(entry);
                }
            });
        });
    }

    rooms.forEach(function (candidate) { indexContentBehaviors('room', candidate); });
    objects.forEach(function (candidate) { indexContentBehaviors('object', candidate); });

    function ensureGatewayAssignments(candidateRoom) {
        var gateway = gatewayByRoomId[String(candidateRoom.id)];
        if (!gateway || state.gatewayAssignments[String(candidateRoom.id)]) return;
        var assignments = window.NLRoomRules.assignGatewayDestinations(gateway, clusterById);
        Object.keys(assignments).forEach(function (regionId) { assignments[regionId].gatewayRoomId = String(candidateRoom.id); });
        state.gatewayAssignments[String(candidateRoom.id)] = assignments;
    }

    function gatewayAssignmentForExit(candidateRoom, regionId) {
        ensureGatewayAssignments(candidateRoom);
        var assignments = state.gatewayAssignments[String(candidateRoom.id)] || {};
        return assignments[String(regionId)] || null;
    }

    function activeGatewayReturnForRoom(candidateRoom, regionId) {
        var clusterId = clusterByRoomId[String(candidateRoom.id)];
        var cluster = clusterById[clusterId];
        if (!cluster || String(cluster.entryRoomId) !== String(candidateRoom.id)) return null;
        var assignment = state.clusterGatewayReturns[clusterId] || null;
        if (!assignment) return null;
        if (assignment.returnMode === 'door' && String(assignment.returnRegionId) === String(regionId)) return assignment;
        return null;
    }

    function fitRoomToStage() {
        var stageStyle = window.getComputedStyle(playStage);
        var availableWidth = playStage.clientWidth - parseFloat(stageStyle.paddingLeft) - parseFloat(stageStyle.paddingRight);
        var availableHeight = playStage.clientHeight - parseFloat(stageStyle.paddingTop) - parseFloat(stageStyle.paddingBottom);
        if (availableWidth <= 0 || availableHeight <= 0) return;

        var roomWidth = room.data.canvas.width;
        var roomHeight = room.data.canvas.height;
        var fitScale = Math.min(availableWidth / roomWidth, availableHeight / roomHeight, 1);
        playCanvas.style.width = Math.floor(roomWidth * fitScale) + 'px';
        playCanvas.style.height = Math.floor(roomHeight * fitScale) + 'px';
    }

    function fitObjectToModal() {
        if (!activeObject || !objectModalBody.clientWidth || !objectModalBody.clientHeight) return;
        var style = window.getComputedStyle(objectModalBody);
        var availableWidth = objectModalBody.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        var availableHeight = objectModalBody.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        var width = activeObject.data.canvas.width;
        var height = activeObject.data.canvas.height;
        var fitScale = Math.min(availableWidth / width, availableHeight / height, 1);
        objectCanvas.style.width = Math.floor(width * fitScale) + 'px';
        objectCanvas.style.height = Math.floor(height * fitScale) + 'px';
    }

    function reset() {
        state = { flags: {}, items: {}, unlockedDoors: {}, overlays: {}, descriptions: {}, gatewayAssignments: {}, clusterGatewayReturns: {} };
        rooms.forEach(function (candidate) {
            (candidate.data.regions || []).forEach(function (region) {
                if (region.kind === 'door' && region.door && region.door.unlocked) state.unlockedDoors[regionStateKey('room', candidate, region)] = true;
            });
        });
        navigationStack = [];
        soundPlayer.pause();
        soundPlayer.removeAttribute('src');
        stopAmbientSound();
        document.getElementById('room-description-card').hidden = true;
        document.getElementById('object-description-card').hidden = true;
        $('#toggle-room-description, #toggle-object-description').attr('aria-expanded', 'false');
        closeObject(false);
        closeInventory();
        $('#event-log').html('<em>Session reset. Click a highlighted region.</em>');
        setActiveRoom(initialRoom, '');
        $('.player-message').removeClass('visible');
    }

    function esc(value) { return $('<div>').text(value === undefined || value === null ? '' : value).html(); }

    function contentDescription(kind, content) {
        if (!content) return '';
        var key = window.NLRoomRules.descriptionKey(kind, content.slug);
        return Object.prototype.hasOwnProperty.call(state.descriptions, key) ? state.descriptions[key] : (content.playerDescription || '');
    }

    function renderDescriptions() {
        $('#room-player-description').text(contentDescription('room', room) || 'No player description has been authored for this room.');
        $('#object-player-description').text(contentDescription('object', activeObject) || 'No player description has been authored for this object.');
    }

    function setDescriptionOpen(kind, open) {
        var isObjectDescription = kind === 'object';
        var card = document.getElementById(isObjectDescription ? 'object-description-card' : 'room-description-card');
        var button = $(isObjectDescription ? '#toggle-object-description' : '#toggle-room-description');
        if (isObjectDescription && !activeObject) return;
        renderDescriptions();
        card.hidden = !open;
        button.attr('aria-expanded', open ? 'true' : 'false');
    }

    function playEvaluationSounds(evaluation) {
        (evaluation && evaluation.effects && evaluation.effects.sounds || []).forEach(function (slug) {
            var sound = soundBySlug[slug];
            if (!sound || !sound.assetUrl) {
                logEvent('Sound: ' + slug, false, 'The selected sound is unavailable in this debugger.', 'audio');
                return;
            }
            soundPlayer.pause();
            soundPlayer.src = sound.assetUrl;
            soundPlayer.currentTime = 0;
            soundPlayer.play().catch(function () {
                logEvent('Sound: ' + sound.name, false, 'The browser could not play this sound.', 'audio');
            });
        });
    }

    function stopAmbientSound() {
        ambientPending = false;
        ambientPlayer.pause();
        ambientPlayer.removeAttribute('src');
        ambientPlayer.removeAttribute('data-sound-id');
    }

    function tryPlayAmbientSound() {
        if (!ambientPlayer.getAttribute('src')) return;
        var expectedSoundId = ambientPlayer.getAttribute('data-sound-id');
        var playPromise;
        try {
            playPromise = ambientPlayer.play();
        } catch (_error) {
            ambientPending = true;
            return;
        }
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.then(function () {
                if (ambientPlayer.getAttribute('data-sound-id') === expectedSoundId) ambientPending = false;
            }).catch(function () {
                if (ambientPlayer.getAttribute('data-sound-id') === expectedSoundId) ambientPending = true;
            });
        } else {
            ambientPending = false;
        }
    }

    function syncAmbientSound(candidateRoom) {
        var clusterId = clusterByRoomId[String(candidateRoom.id)];
        var cluster = clusterById[clusterId] || null;
        var soundId = cluster && cluster.ambientSoundId ? String(cluster.ambientSoundId) : '';
        var sound = soundId ? soundById[soundId] : null;
        if (!sound || !sound.assetUrl) {
            stopAmbientSound();
            return;
        }
        var volume = parseInt(cluster.ambientVolume, 10);
        if (isNaN(volume)) volume = 35;
        ambientPlayer.volume = Math.max(0, Math.min(100, volume)) / 100;
        ambientPlayer.loop = true;
        if (ambientPlayer.getAttribute('data-sound-id') !== soundId) {
            ambientPlayer.pause();
            ambientPlayer.src = sound.assetUrl;
            ambientPlayer.setAttribute('data-sound-id', soundId);
            ambientPlayer.currentTime = 0;
        }
        if (ambientPlayer.paused) tryPlayAmbientSound();
    }

    function resumePendingAmbientSound() {
        if (ambientPending && ambientPlayer.getAttribute('src')) tryPlayAmbientSound();
    }

    function resolveRoomTarget(target) {
        var key = String(target === undefined || target === null ? '' : target).trim();
        return key ? (roomById[key] || roomBySlug[key] || null) : null;
    }

    function sameRoom(first, second) {
        return !!first && !!second && (String(first.id) === String(second.id) || first.slug === second.slug);
    }

    function returnDoorId(nextRoom, previousRoom) {
        var door = (nextRoom.data.regions || []).find(function (region) {
            return region.kind === 'door' && region.door && sameRoom(resolveRoomTarget(region.door.targetRoom), previousRoom);
        });
        return door ? door.id : '';
    }

    function populateEntryDoors(entryRegionId) {
        var html = '<option value="">No entry door (start room)</option>';
        regions.filter(function (region) { return region.kind === 'door'; }).forEach(function (region) {
            html += '<option value="' + esc(region.id) + '">' + esc(region.name) + '</option>';
        });
        $('#entry-region').html(html).val(entryRegionId || '');
    }

    function updateBackButton() {
        var previousVisit = navigationStack.length ? navigationStack[navigationStack.length - 1] : null;
        var previous = previousVisit ? previousVisit.room : null;
        var showBehind = !!previous && previousVisit.returnMode === 'behind';
        $('#back-room').prop('hidden', !showBehind);
        $('#back-room-label').text(showBehind ? 'Behind you: ' + previous.title : 'Behind you');
    }

    function renderGatewayReturnActions() {
        var clusterId = clusterByRoomId[String(room.id)];
        var cluster = clusterById[clusterId];
        var assignment = cluster ? state.clusterGatewayReturns[clusterId] : null;
        if (!cluster || String(cluster.entryRoomId) !== String(room.id) || !assignment || assignment.returnMode !== 'behind') {
            $('#gateway-return-actions').empty();
            return;
        }
        var gatewayRoom = roomById[String(assignment.gatewayRoomId)];
        $('#gateway-return-actions').html('<button type="button" class="btn-ghost gateway-return-button"><i class="fa-solid fa-shuffle"></i> Gateway: ' + esc(gatewayRoom ? gatewayRoom.title : 'Return') + '</button>');
    }

    function setActiveRoom(nextRoom, entryRegionId) {
        if (!nextRoom) return;
        room = nextRoom;
        regions = room.data.regions || [];
        syncAmbientSound(room);
        ensureGatewayAssignments(room);
        closeObject(false);
        closeInventory();
        setDescriptionOpen('room', false);
        $('#debug-room-title').text(room.title);
        $('#debug-room-slug').text(room.slug);
        $('#debug-editor-link').attr('href', 'room-edit.php?id=' + room.id);
        roomImage.setAttribute('src', room.backgroundAsset);
        roomImage.setAttribute('alt', room.title);
        svg.setAttribute('viewBox', '0 0 ' + room.data.canvas.width + ' ' + room.data.canvas.height);
        playCanvas.style.aspectRatio = room.data.canvas.width + ' / ' + room.data.canvas.height;
        populateEntryDoors(entryRegionId);
        updateBackButton();
        renderGatewayReturnActions();
        renderAll();
        runActivationBehaviors('room_enter', 'room', room);
        renderAll();
        fitRoomToStage();
    }

    function navigateToRoom(nextRoom, message, navigation) {
        navigation = navigation || {};
        var previousRoom = room;
        navigationStack.push({ room: previousRoom, entryRegionId: $('#entry-region').val() || '', returnMode: navigation.returnMode || 'behind' });
        if (navigation.gatewayAssignment) {
            state.clusterGatewayReturns[String(navigation.gatewayAssignment.clusterId)] = navigation.gatewayAssignment;
        }
        setActiveRoom(nextRoom, navigation.targetRegionId || returnDoorId(nextRoom, previousRoom));
        showMessage(message || ('Entered ' + nextRoom.title + '.'));
        playCanvas.focus();
    }

    function returnToPreviousRoom() {
        if (!navigationStack.length) return;
        var departedRoom = room;
        var previous = navigationStack.pop();
        setActiveRoom(previous.room, previous.entryRegionId);
        var message = 'Turned back to ' + previous.room.title + ' from ' + departedRoom.title + '.';
        showMessage(message);
        logEvent('Behind you: ' + previous.room.title, true, message, 'navigation');
        playCanvas.focus();
    }

    function returnThroughGateway() {
        var clusterId = clusterByRoomId[String(room.id)];
        var assignment = state.clusterGatewayReturns[clusterId];
        var gatewayRoom = assignment ? roomById[String(assignment.gatewayRoomId)] : null;
        if (!assignment || !gatewayRoom) return;
        var message = 'Returned through the Gateway to ' + gatewayRoom.title + '.';
        logEvent('Gateway return', true, message, 'navigation');
        navigateToRoom(gatewayRoom, message, { returnMode: 'door', targetRegionId: assignment.gatewayRegionId || '' });
    }

    function renderRegionSvg(target, targetRegions) {
        target.innerHTML = '';
        targetRegions.forEach(function (region) {
            var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', region.bounds.x);
            rect.setAttribute('y', region.bounds.y);
            rect.setAttribute('width', region.bounds.width);
            rect.setAttribute('height', region.bounds.height);
            rect.setAttribute('class', 'play-region ' + region.kind);
            rect.setAttribute('data-id', region.id);
            var title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = region.name;
            rect.appendChild(title);
            target.appendChild(rect);
        });
        target.classList.toggle('regions-hidden', !$('#show-regions').prop('checked'));
    }

    function renderRegions() {
        renderRegionSvg(svg, regions);
        if (activeObject) renderRegionSvg(objectSvg, activeObject.data.regions || []);
    }

    function stateRows(type) {
        var html = '';
        Object.keys(state[type]).forEach(function (key) {
            html += '<div class="state-row"><input class="state-key" value="' + esc(key) + '" data-original="' + esc(key) + '"><input class="state-value" value="' + esc(state[type][key]) + '" data-key="' + esc(key) + '"><button class="icon-button danger state-delete" data-key="' + esc(key) + '"><i class="fa-solid fa-xmark"></i></button></div>';
        });
        return html || '<p class="empty-mini">No ' + type + ' set</p>';
    }

    function renderState() {
        $('#flags-state').html(stateRows('flags'));
        $('#items-state').html(stateRows('items'));
        var doors = Object.keys(state.unlockedDoors).filter(function (key) { return state.unlockedDoors[key]; });
        $('#doors-state').html(doors.length ? doors.map(function (id) {
            var region = findRoomRegion(id);
            return '<span>' + esc(regionLabelsByStateKey[id] || (region ? region.name : id)) + '</span>';
        }).join('') : '<p class="empty-mini">No extra doors unlocked</p>');
        renderGatewayAssignments();
    }

    function renderGatewayAssignments() {
        var html = '';
        Object.keys(state.gatewayAssignments || {}).forEach(function (gatewayRoomId) {
            var gatewayRoom = roomById[gatewayRoomId];
            var assignments = state.gatewayAssignments[gatewayRoomId] || {};
            Object.keys(assignments).forEach(function (regionId) {
                var assignment = assignments[regionId];
                var door = gatewayRoom ? (gatewayRoom.data.regions || []).find(function (region) { return String(region.id) === String(regionId); }) : null;
                var cluster = clusterById[String(assignment.clusterId)];
                html += '<div><strong>' + esc(gatewayRoom ? gatewayRoom.title : gatewayRoomId) + ' · ' + esc(door ? door.name : regionId) + '</strong><span><i class="fa-solid fa-arrow-right"></i> ' + esc(cluster ? cluster.name : assignment.clusterId) + '</span></div>';
            });
        });
        $('#gateway-assignments').html(html || '<p class="empty-mini">No Gateway room has been entered yet.</p>');
    }

    function overlayImage(region, url, canvas) {
        var bounds = region.bounds;
        return '<img src="' + esc(url) + '" style="left:' + (bounds.x / canvas.width * 100) + '%;top:' + (bounds.y / canvas.height * 100) + '%;width:' + (bounds.width / canvas.width * 100) + '%;height:' + (bounds.height / canvas.height * 100) + '%" alt="">';
    }

    function renderRoomOverlays() {
        var html = '';
        regions.forEach(function (region) {
            var url = state.overlays[regionStateKey('room', room, region)] || state.overlays[region.id];
            if (url) html += overlayImage(region, url, room.data.canvas);
        });
        $('#overlay-layer').html(html);
    }

    function objectOverlayKey(object, region) {
        return 'object:' + object.slug + ':' + region.id;
    }

    function renderObjectOverlays() {
        if (!activeObject) {
            $('#object-overlay-layer').empty();
            return;
        }
        var html = '';
        (activeObject.data.regions || []).forEach(function (region) {
            var url = state.overlays[objectOverlayKey(activeObject, region)];
            if (url) html += overlayImage(region, url, activeObject.data.canvas);
        });
        $('#object-overlay-layer').html(html);
    }

    function ownedObjects() {
        return window.NLRoomRules.ownedObjects(objects, state);
    }

    function renderInventory() {
        var owned = ownedObjects();
        $('#inventory-count').text(owned.length);
        if (!owned.length) {
            $('#inventory-objects').html('<div class="inventory-empty"><i class="fa-solid fa-suitcase"></i><p>No portable objects are currently owned.</p><small>Add an object inventory key under Items or grant it from a region.</small></div>');
            return;
        }
        var html = '';
        owned.forEach(function (object) {
            html += '<button class="inventory-object" data-object-slug="' + esc(object.slug) + '"><span class="inventory-thumb"><img src="' + esc(object.backgroundAsset) + '" alt=""></span><span><strong>' + esc(object.title) + '</strong><small>' + esc(object.inventoryKey) + '</small></span><i class="fa-solid fa-magnifying-glass"></i></button>';
        });
        $('#inventory-objects').html(html);
    }

    function renderAll() {
        renderRegions();
        renderState();
        renderRoomOverlays();
        renderObjectOverlays();
        renderInventory();
        renderDescriptions();
    }

    function findRoomRegion(id) {
        return regions.find(function (region) { return region.id === id; });
    }

    function showMessage(message) {
        var target = activeObject ? $('#object-player-message') : $('#player-message');
        $('.player-message').not(target).removeClass('visible');
        target.text(message).addClass('visible');
        window.clearTimeout(window.nlMessageTimer);
        window.nlMessageTimer = window.setTimeout(function () { target.removeClass('visible'); }, 3600);
    }

    function logicDetail(evaluation) {
        if (!evaluation || !evaluation.testedBranches) return '';
        var parts = [];
        evaluation.testedBranches.forEach(function (branch) {
            if (!branch.trace.length) {
                parts.push(branch.branchLabel + ': always');
                return;
            }
            branch.trace.forEach(function (condition) {
                var comparison = condition.operator === 'exists' ? 'exists' : condition.operator === 'not_exists' ? 'does not exist' : condition.operator.replace('_', ' ') + ' “' + condition.value + '”';
                parts.push((condition.passed ? '✓ ' : '✕ ') + branch.branchLabel + ' · ' + condition.source + ' ' + condition.key + ' ' + comparison);
            });
        });
        if (evaluation.effects && evaluation.effects.applied.length) {
            parts.push('Ran: ' + evaluation.effects.applied.map(function (type) { return type.replace(/_/g, ' '); }).join(', '));
        }
        return parts.join(' · ');
    }

    function logEvent(name, pass, message, context, evaluation) {
        var now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        var prefix = context ? '<small>[' + esc(context) + ']</small> ' : '';
        var statusClass = evaluation && evaluation.branchIndex < 0 ? 'else' : (pass ? 'pass' : 'fail');
        var statusText = evaluation ? evaluation.branchLabel : (pass ? 'passed' : 'blocked');
        var detail = logicDetail(evaluation);
        $('#event-log').prepend('<p><time>' + now + '</time>' + prefix + '<strong>' + esc(name) + '</strong><span class="' + statusClass + '">' + esc(statusText) + '</span> ' + esc(message) + (detail ? '<small class="logic-detail">' + esc(detail) + '</small>' : '') + '</p>');
    }

    function behaviorIsActive(entry) {
        if (entry.contentKind === 'room') return !activeObject && !!room && String(room.id) === String(entry.content.id);
        return !!activeObject && activeObject.slug === entry.content.slug;
    }

    function behaviorActionOptions(entry) {
        return {
            regionId: entry.region.id,
            regionKind: entry.region.kind,
            overlayKey: entry.stateKey,
            doorKey: entry.stateKey
        };
    }

    function automaticEventMessage(event) {
        if (event.type === 'room_enter') return 'Room-entry trigger fired.';
        if (event.type === 'object_open') return 'Object-open trigger fired.';
        var label = event.source === 'item' ? 'Item' : 'Flag';
        var message = event.exists
            ? label + ' “' + event.key + '” changed to “' + event.value + '”.'
            : label + ' “' + event.key + '” was cleared.';
        if (event.cause) message += ' Caused by ' + event.cause + '.';
        return message;
    }

    function automaticTransaction() {
        return { queue: [], seen: {}, runs: 0, maximumRuns: 100, stopped: false };
    }

    function enqueueStateChanges(transaction, changes, cause) {
        (changes || []).forEach(function (change) {
            transaction.queue.push({
                type: 'state_change',
                source: change.source,
                key: change.key,
                previousExists: change.previousExists,
                previousValue: change.previousValue,
                exists: change.exists,
                value: change.value,
                cause: cause || ''
            });
        });
    }

    function executeAutomaticBehavior(entry, event, transaction) {
        var eventSignature = event.type === 'state_change'
            ? event.source + ':' + event.key + ':' + (event.exists ? String(event.value) : '<cleared>')
            : event.type;
        var signature = entry.key + '|' + eventSignature;
        if (transaction.seen[signature]) return;
        if (transaction.runs >= transaction.maximumRuns) {
            if (!transaction.stopped) {
                transaction.stopped = true;
                logEvent('Automatic behavior limit', false, 'Stopped after ' + transaction.maximumRuns + ' chained behavior runs. Check for a state-change cycle.', 'runtime');
            }
            return;
        }
        transaction.seen[signature] = true;
        transaction.runs += 1;

        var evaluation = window.NLRoomRules.runLogic(entry.behavior.logic, state, behaviorActionOptions(entry));
        var isActive = behaviorIsActive(entry);
        var eventMessage = automaticEventMessage(event);
        if (evaluation.effects.message) eventMessage += ' ' + evaluation.effects.message;
        logEvent(entry.region.name + ' · ' + entry.behavior.name, evaluation.conditionMatched, eventMessage, entry.content.title + ' · automatic', evaluation);
        if (isActive) {
            playEvaluationSounds(evaluation);
            if (evaluation.effects.message) showMessage(evaluation.effects.message);
            if (evaluation.effects.examineObjects.length) openObject(evaluation.effects.examineObjects[0], 'automatic behavior');
        }
        enqueueStateChanges(transaction, evaluation.effects.changes, entry.behavior.name);
    }

    function drainAutomaticStateQueue(transaction) {
        while (transaction.queue.length && !transaction.stopped) {
            var event = transaction.queue.shift();
            var sourceIndex = stateBehaviorIndex[event.source] || {};
            (sourceIndex[event.key] || []).forEach(function (entry) {
                executeAutomaticBehavior(entry, event, transaction);
            });
        }
    }

    function dispatchStateChanges(changes, cause) {
        if (!changes || !changes.length) return;
        var transaction = automaticTransaction();
        enqueueStateChanges(transaction, changes, cause);
        drainAutomaticStateQueue(transaction);
    }

    function runActivationBehaviors(triggerType, contentKind, content) {
        if (!content) return;
        var key = triggerType + ':' + contentKind + ':' + content.slug;
        var entries = activationBehaviorIndex[key] || [];
        if (!entries.length) return;
        var transaction = automaticTransaction();
        var event = { type: triggerType, cause: content.title };
        entries.forEach(function (entry) { executeAutomaticBehavior(entry, event, transaction); });
        drainAutomaticStateQueue(transaction);
    }

    function openObject(slug, source) {
        var object = objectBySlug[slug];
        if (!object) return false;
        activeObject = object;
        closeInventory();
        setDescriptionOpen('object', false);
        $('#object-modal-title').text(object.title);
        $('#object-image').attr('src', object.backgroundAsset).attr('alt', object.title);
        objectSvg.setAttribute('viewBox', '0 0 ' + object.data.canvas.width + ' ' + object.data.canvas.height);
        objectCanvas.style.aspectRatio = object.data.canvas.width + ' / ' + object.data.canvas.height;
        renderRegionSvg(objectSvg, object.data.regions || []);
        renderObjectOverlays();
        renderDescriptions();
        document.getElementById('object-modal').hidden = false;
        document.body.classList.add('object-modal-open');
        runActivationBehaviors('object_open', 'object', object);
        renderAll();
        window.requestAnimationFrame(function () {
            fitObjectToModal();
            document.getElementById('close-object').focus();
        });
        if (source) logEvent(object.title, true, 'Opened object viewer from ' + source + '.', 'viewer');
        return true;
    }

    function closeObject(logClose) {
        if (!activeObject) return;
        var title = activeObject.title;
        activeObject = null;
        document.getElementById('object-modal').hidden = true;
        document.getElementById('object-description-card').hidden = true;
        $('#toggle-object-description').attr('aria-expanded', 'false');
        document.body.classList.remove('object-modal-open');
        $('#object-player-message').removeClass('visible');
        playCanvas.focus();
        if (logClose !== false) logEvent(title, true, 'Closed object viewer and returned to the room.', 'viewer');
    }

    function openInventory() {
        $('#inventory-panel').addClass('visible').attr('aria-hidden', 'false');
        $('#toggle-inventory').attr('aria-expanded', 'true');
    }

    function closeInventory() {
        $('#inventory-panel').removeClass('visible').attr('aria-hidden', 'true');
        $('#toggle-inventory').attr('aria-expanded', 'false');
    }

    function clickRoomRegion(region) {
        var stateKey = regionStateKey('room', room, region);
        var evaluation = window.NLRoomRules.runRegion(region, state, { regionId: region.id, regionKind: region.kind, overlayKey: stateKey, doorKey: stateKey });
        playEvaluationSounds(evaluation);
        dispatchStateChanges(evaluation.effects.changes, room.title + ' · ' + region.name);
        var pass = evaluation.conditionMatched;
        var message = evaluation.effects.message || (pass ? 'The interaction succeeds.' : (evaluation.actions.length ? 'The alternate result runs.' : 'Nothing happens.'));
        var destination = null;
        var navigation = null;
        if (region.kind === 'door') {
            var gatewayAssignment = gatewayAssignmentForExit(room, region.id);
            var gatewayReturn = activeGatewayReturnForRoom(room, region.id);
            var canExit = !!gatewayReturn || window.NLRoomRules.canExit(region, state, $('#entry-region').val(), stateKey);
            if (!canExit) {
                pass = false;
                if (!evaluation.effects.message) message = 'This door has not been unlocked. You can only leave through the door you entered.';
            } else {
                if (gatewayReturn) {
                    destination = roomById[String(gatewayReturn.gatewayRoomId)] || null;
                    navigation = { returnMode: 'door', targetRegionId: gatewayReturn.gatewayRegionId || '' };
                } else if (gatewayAssignment) {
                    destination = roomById[String(gatewayAssignment.entryRoomId)] || null;
                    navigation = { returnMode: gatewayAssignment.returnMode || 'behind', targetRegionId: gatewayAssignment.returnRegionId || '', gatewayAssignment: gatewayAssignment };
                } else {
                    var connection = connectionByExit[String(room.id) + ':' + region.id] || null;
                    destination = connection ? roomById[String(connection.targetRoomId)] : resolveRoomTarget(region.door && region.door.targetRoom);
                    navigation = connection ? { returnMode: connection.returnMode || 'behind', targetRegionId: connection.targetRegionId || '' } : { returnMode: 'behind', targetRegionId: '' };
                }
                if (!destination) {
                    pass = false;
                    message = evaluation.effects.message || ((region.door && region.door.targetRoom) ? 'The target room “' + region.door.targetRoom + '” is unavailable.' : 'This exit does not have an active destination.');
                } else {
                    pass = true;
                    message = evaluation.effects.message || (gatewayAssignment ? 'The Gateway opens into ' + destination.title + '.' : ('Enter ' + destination.title + '.'));
                }
            }
        }

        renderAll();
        var openedObject = false;
        if (evaluation.effects.examineObjects.length) {
            var objectSlug = evaluation.effects.examineObjects[0];
            openedObject = openObject(objectSlug, 'room region');
            if (!openedObject) {
                message = 'The referenced object “' + objectSlug + '” is unavailable in this debugger.';
                pass = false;
            }
        }
        showMessage(message);
        logEvent(region.name, pass, message, room.title, evaluation);
        if (destination && pass && !openedObject) navigateToRoom(destination, message, navigation);
    }

    function clickObjectRegion(region) {
        if (!activeObject) return;
        var object = activeObject;
        var evaluation = window.NLRoomRules.runRegion(region, state, { regionId: region.id, overlayKey: objectOverlayKey(object, region) });
        playEvaluationSounds(evaluation);
        dispatchStateChanges(evaluation.effects.changes, object.title + ' · ' + region.name);
        var pass = evaluation.conditionMatched;
        var message = evaluation.effects.message || (pass ? 'The interaction succeeds.' : (evaluation.actions.length ? 'The alternate result runs.' : 'Nothing happens.'));
        renderAll();
        showMessage(message);
        logEvent(region.name, pass, message, object.title, evaluation);
    }

    $(svg).on('click', '.play-region', function () { clickRoomRegion(findRoomRegion($(this).attr('data-id'))); });
    $(objectSvg).on('click', '.play-region', function () {
        if (!activeObject) return;
        var id = $(this).attr('data-id');
        var region = (activeObject.data.regions || []).find(function (candidate) { return candidate.id === id; });
        if (region) clickObjectRegion(region);
    });
    $('#show-regions').on('change', renderRegions);
    $('#reset-session').on('click', reset);
    $('#back-room').on('click', returnToPreviousRoom);
    $('#gateway-return-actions').on('click', '.gateway-return-button', returnThroughGateway);
    $('#toggle-inventory').on('click', function () { $('#inventory-panel').hasClass('visible') ? closeInventory() : openInventory(); });
    $('#close-inventory').on('click', closeInventory);
    $('#inventory-objects').on('click', '.inventory-object', function () { openObject($(this).attr('data-object-slug'), 'inventory'); });
    $('#close-object, [data-close-object]').on('click', function () { closeObject(true); });
    $('#toggle-room-description').on('click', function () { setDescriptionOpen('room', $(this).attr('aria-expanded') !== 'true'); });
    $('#toggle-object-description').on('click', function () { setDescriptionOpen('object', $(this).attr('aria-expanded') !== 'true'); });
    $('[data-close-description]').on('click', function () { setDescriptionOpen($(this).attr('data-close-description'), false); });
    $(document).on('keydown', function (event) {
        resumePendingAmbientSound();
        if (event.key !== 'Escape') return;
        if (activeObject) closeObject(true); else closeInventory();
    });
    document.addEventListener('pointerdown', resumePendingAmbientSound, true);

    function manualStateChange(type, key, exists, value) {
        var bucket = state[type];
        var previousExists = Object.prototype.hasOwnProperty.call(bucket, key);
        var previousValue = bucket[key];
        if (exists) bucket[key] = value; else delete bucket[key];
        var changed = previousExists !== exists || (exists && String(previousValue) !== String(value));
        if (changed) {
            dispatchStateChanges([{
                source: type === 'items' ? 'item' : 'flag',
                key: key,
                previousExists: previousExists,
                previousValue: previousValue,
                exists: exists,
                value: value
            }], 'debug state editor');
        }
        renderAll();
    }

    $('[data-add-state]').on('click', function () {
        var type = $(this).data('add-state');
        var base = type === 'flags' ? 'new_flag' : 'new_item';
        var key = base;
        var n = 2;
        while (Object.prototype.hasOwnProperty.call(state[type], key)) key = base + '_' + n++;
        manualStateChange(type, key, true, type === 'items' ? '1' : '');
    });
    $('.debug-console').on('change', '.state-value', function () {
        var type = $(this).closest('.console-section').find('h3').text().toLowerCase();
        manualStateChange(type, $(this).data('key'), true, $(this).val());
    }).on('change', '.state-key', function () {
        var type = $(this).closest('.console-section').find('h3').text().toLowerCase();
        var oldKey = $(this).data('original');
        var newKey = $(this).val().trim();
        if (newKey && newKey !== oldKey) {
            var value = state[type][oldKey];
            var previousNewExists = Object.prototype.hasOwnProperty.call(state[type], newKey);
            var previousNewValue = state[type][newKey];
            delete state[type][oldKey];
            state[type][newKey] = value;
            var renameChanges = [{
                source: type === 'items' ? 'item' : 'flag', key: oldKey,
                previousExists: true, previousValue: value, exists: false, value: undefined
            }, {
                source: type === 'items' ? 'item' : 'flag', key: newKey,
                previousExists: previousNewExists, previousValue: previousNewValue, exists: true, value: value
            }].filter(function (change) {
                return change.previousExists !== change.exists || (change.exists && String(change.previousValue) !== String(change.value));
            });
            dispatchStateChanges(renameChanges, 'debug state rename');
            renderAll();
        }
    }).on('click', '.state-delete', function () {
        var type = $(this).closest('.console-section').find('h3').text().toLowerCase();
        manualStateChange(type, $(this).data('key'), false, undefined);
    });

    roomImage.addEventListener('load', fitRoomToStage);
    fitRoomToStage();
    if (window.ResizeObserver) {
        new ResizeObserver(fitRoomToStage).observe(playStage);
        new ResizeObserver(fitObjectToModal).observe(objectModalBody);
    } else {
        window.addEventListener('resize', function () { fitRoomToStage(); fitObjectToModal(); });
    }
    reset();
})(jQuery);
