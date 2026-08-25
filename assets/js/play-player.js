(function () {
    'use strict';

    var startRoom = window.NL_PLAYER_START_ROOM;
    var rooms = Array.isArray(window.NL_PLAYER_ROOMS) ? window.NL_PLAYER_ROOMS : [];
    var objects = Array.isArray(window.NL_PLAYER_OBJECTS) ? window.NL_PLAYER_OBJECTS : [];
    var sounds = Array.isArray(window.NL_PLAYER_SOUNDS) ? window.NL_PLAYER_SOUNDS : [];
    var topology = window.NL_PLAYER_TOPOLOGY || { clusters: [], nodes: [], connections: [], gateways: [] };
    if (!startRoom || !window.NLRoomRules) return;

    var RUN_STORAGE_KEY = 'nightlatch.player.run.v1';
    var SOUND_STORAGE_KEY = 'nightlatch.player.sound-muted.v1';
    var roomById = {};
    var roomBySlug = {};
    var objectBySlug = {};
    var clusterById = {};
    var clusterByRoomId = {};
    var connectionByExit = {};
    var gatewayByRoomId = {};
    var soundById = {};
    var soundBySlug = {};
    var automaticBehaviorEntries = [];
    var stateBehaviorIndex = { flag: {}, item: {} };
    var activationBehaviorIndex = {};

    var room = startRoom;
    var regions = room.data.regions || [];
    var state = null;
    var currentEntryRegionId = '';
    var activeObject = null;
    var navigationStack = [];
    var activeDrawer = null;
    var drawerTrigger = null;
    var objectTrigger = null;
    var menuTrigger = null;
    var ambientPending = false;
    var soundMuted = false;
    var saveTimer = null;
    var nativeFullscreenEntered = false;

    var playerApp = document.getElementById('player-app');
    var playerStage = document.getElementById('player-stage');
    var roomCanvas = document.getElementById('room-canvas');
    var roomImage = document.getElementById('room-image');
    var roomSvg = document.getElementById('room-regions');
    var objectModal = document.getElementById('object-modal');
    var objectModalBody = document.getElementById('object-modal-body');
    var objectCanvas = document.getElementById('object-canvas');
    var objectImage = document.getElementById('object-image');
    var objectSvg = document.getElementById('object-regions');
    var soundPlayer = document.getElementById('player-sound');
    var ambientPlayer = document.getElementById('player-ambient');
    var gameMenu = document.getElementById('game-menu');

    function byId(id) { return document.getElementById(id); }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function copyBucket(value) {
        var result = {};
        if (!isPlainObject(value)) return result;
        Object.keys(value).forEach(function (key) { result[key] = value[key]; });
        return result;
    }

    function regionStateKey(contentKind, content, region) {
        return contentKind + ':' + content.slug + ':' + region.id;
    }

    function objectOverlayKey(object, region) {
        return regionStateKey('object', object, region);
    }

    rooms.forEach(function (candidate) {
        roomById[String(candidate.id)] = candidate;
        roomBySlug[candidate.slug] = candidate;
    });
    objects.forEach(function (object) { objectBySlug[object.slug] = object; });
    sounds.forEach(function (sound) {
        soundById[String(sound.id)] = sound;
        soundBySlug[sound.slug] = sound;
    });
    (topology.clusters || []).forEach(function (cluster) { clusterById[String(cluster.id)] = cluster; });
    (topology.nodes || []).forEach(function (node) { clusterByRoomId[String(node.roomId)] = String(node.clusterId); });
    (topology.connections || []).forEach(function (connection) {
        connectionByExit[String(connection.sourceRoomId) + ':' + connection.sourceRegionId] = connection;
    });
    (topology.gateways || []).forEach(function (gateway) { gatewayByRoomId[String(gateway.roomId)] = gateway; });

    function automaticEntryKey(entry) {
        return entry.contentKind + ':' + entry.content.slug + ':' + entry.region.id + ':' + entry.behavior.id;
    }

    function indexContentBehaviors(contentKind, content) {
        (content.data.regions || []).forEach(function (region) {
            var stateKey = regionStateKey(contentKind, content, region);
            region.automaticBehaviors = window.NLRoomRules.normalizeAutomaticBehaviors(region);
            region.automaticBehaviors.forEach(function (behavior) {
                var entry = {
                    contentKind: contentKind,
                    content: content,
                    region: region,
                    behavior: behavior,
                    stateKey: stateKey
                };
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

    function emptyState() {
        return {
            flags: {},
            items: {},
            unlockedDoors: {},
            overlays: {},
            descriptions: {},
            gatewayAssignments: {},
            clusterGatewayReturns: {}
        };
    }

    function addInitiallyUnlockedDoors(targetState) {
        rooms.forEach(function (candidate) {
            (candidate.data.regions || []).forEach(function (region) {
                if (region.kind === 'door' && region.door && region.door.unlocked) {
                    targetState.unlockedDoors[regionStateKey('room', candidate, region)] = true;
                }
            });
        });
    }

    function normalizedSavedState(savedState) {
        var result = emptyState();
        if (!isPlainObject(savedState)) return result;
        result.flags = copyBucket(savedState.flags);
        result.items = copyBucket(savedState.items);
        result.unlockedDoors = copyBucket(savedState.unlockedDoors);
        result.overlays = copyBucket(savedState.overlays);
        result.descriptions = copyBucket(savedState.descriptions);
        result.gatewayAssignments = copyBucket(savedState.gatewayAssignments);
        result.clusterGatewayReturns = copyBucket(savedState.clusterGatewayReturns);
        return result;
    }

    function loadSavedRun() {
        try {
            var raw = window.localStorage.getItem(RUN_STORAGE_KEY);
            if (!raw) return null;
            var saved = JSON.parse(raw);
            var savedRoom = saved && roomById[String(saved.currentRoomId || '')];
            if (!savedRoom || !isPlainObject(saved.state)) return null;
            var savedStack = Array.isArray(saved.navigationStack) ? saved.navigationStack : [];
            return {
                room: savedRoom,
                entryRegionId: String(saved.entryRegionId || ''),
                state: normalizedSavedState(saved.state),
                navigationStack: savedStack.map(function (visit) {
                    var visitRoom = visit && roomById[String(visit.roomId || '')];
                    if (!visitRoom) return null;
                    return {
                        room: visitRoom,
                        entryRegionId: String(visit.entryRegionId || ''),
                        returnMode: visit.returnMode === 'one_way' || visit.returnMode === 'door' ? visit.returnMode : 'behind'
                    };
                }).filter(function (visit) { return !!visit; })
            };
        } catch (_error) {
            return null;
        }
    }

    function saveRun() {
        if (!state || !room) return;
        try {
            window.localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify({
                version: 1,
                currentRoomId: String(room.id),
                entryRegionId: currentEntryRegionId,
                navigationStack: navigationStack.map(function (visit) {
                    return {
                        roomId: String(visit.room.id),
                        entryRegionId: visit.entryRegionId || '',
                        returnMode: visit.returnMode || 'behind'
                    };
                }),
                state: state
            }));
        } catch (_error) {
            // A private browsing or storage quota restriction must not stop play.
        }
    }

    function scheduleSave() {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(saveRun, 40);
    }

    function contentDescription(kind, content) {
        if (!content) return '';
        var key = window.NLRoomRules.descriptionKey(kind, content.slug);
        return Object.prototype.hasOwnProperty.call(state.descriptions, key)
            ? state.descriptions[key]
            : (content.playerDescription || '');
    }

    function renderDescriptions() {
        byId('room-description-title').textContent = room.title;
        byId('room-player-description').textContent = contentDescription('room', room) || 'There is nothing more to notice here.';
        byId('object-player-description').textContent = contentDescription('object', activeObject) || 'There is nothing more to notice about it.';
    }

    function ensureGatewayAssignments(candidateRoom) {
        var gateway = gatewayByRoomId[String(candidateRoom.id)];
        if (!gateway || state.gatewayAssignments[String(candidateRoom.id)]) return;
        var assignments = window.NLRoomRules.assignGatewayDestinations(gateway, clusterById);
        Object.keys(assignments).forEach(function (regionId) {
            assignments[regionId].gatewayRoomId = String(candidateRoom.id);
        });
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

    function numericPadding(style, property) {
        var value = parseFloat(style[property]);
        return isNaN(value) ? 0 : value;
    }

    function fitRoomToStage() {
        var style = window.getComputedStyle(playerStage);
        var availableWidth = playerStage.clientWidth - numericPadding(style, 'paddingLeft') - numericPadding(style, 'paddingRight');
        var availableHeight = playerStage.clientHeight - numericPadding(style, 'paddingTop') - numericPadding(style, 'paddingBottom');
        if (availableWidth <= 0 || availableHeight <= 0) return;
        var width = Number(room.data.canvas.width) || 1600;
        var height = Number(room.data.canvas.height) || 900;
        var scale = Math.min(availableWidth / width, availableHeight / height, 1);
        roomCanvas.style.width = Math.max(1, Math.floor(width * scale)) + 'px';
        roomCanvas.style.height = Math.max(1, Math.floor(height * scale)) + 'px';
    }

    function fitObjectToModal() {
        if (!activeObject || !objectModalBody.clientWidth || !objectModalBody.clientHeight) return;
        var style = window.getComputedStyle(objectModalBody);
        var availableWidth = objectModalBody.clientWidth - numericPadding(style, 'paddingLeft') - numericPadding(style, 'paddingRight');
        var availableHeight = objectModalBody.clientHeight - numericPadding(style, 'paddingTop') - numericPadding(style, 'paddingBottom');
        var width = Number(activeObject.data.canvas.width) || 1000;
        var height = Number(activeObject.data.canvas.height) || 1000;
        var scale = Math.min(availableWidth / width, availableHeight / height, 1);
        objectCanvas.style.width = Math.max(1, Math.floor(width * scale)) + 'px';
        objectCanvas.style.height = Math.max(1, Math.floor(height * scale)) + 'px';
    }

    function setMessageVisible(target, visible) {
        target.classList.toggle('has-message', visible);
        target.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function showMessage(message, context) {
        message = String(message || '').trim();
        if (!message) return;
        var isObjectMessage = !!activeObject;
        var target = byId(isObjectMessage ? 'object-player-message' : 'player-message');
        var other = byId(isObjectMessage ? 'player-message' : 'object-player-message');
        byId(isObjectMessage ? 'object-player-message-context' : 'player-message-context').textContent = context || (activeObject ? activeObject.title : room.title);
        byId(isObjectMessage ? 'object-player-message-text' : 'player-message-text').textContent = message;
        setMessageVisible(other, false);
        setMessageVisible(target, true);
    }

    function hideMessage() {
        setMessageVisible(byId('player-message'), false);
        setMessageVisible(byId('object-player-message'), false);
    }

    function updateSoundControl() {
        var button = byId('toggle-sound');
        var icon = button.querySelector('i');
        button.setAttribute('aria-pressed', soundMuted ? 'true' : 'false');
        button.setAttribute('aria-label', soundMuted ? 'Turn sound on' : 'Mute sound');
        button.setAttribute('title', soundMuted ? 'Turn sound on' : 'Mute sound');
        icon.className = soundMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    }

    function loadSoundPreference() {
        try { soundMuted = window.localStorage.getItem(SOUND_STORAGE_KEY) === '1'; } catch (_error) { soundMuted = false; }
        updateSoundControl();
    }

    function playEvaluationSounds(evaluation) {
        if (soundMuted) return;
        (evaluation && evaluation.effects && evaluation.effects.sounds || []).forEach(function (slug) {
            var sound = soundBySlug[slug];
            if (!sound || !sound.assetUrl) return;
            soundPlayer.pause();
            soundPlayer.src = sound.assetUrl;
            soundPlayer.currentTime = 0;
            var playPromise = soundPlayer.play();
            if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(function () {});
        });
    }

    function stopAmbientSound() {
        ambientPending = false;
        ambientPlayer.pause();
        ambientPlayer.removeAttribute('src');
        ambientPlayer.removeAttribute('data-sound-id');
    }

    function tryPlayAmbientSound() {
        if (soundMuted || !ambientPlayer.getAttribute('src')) return;
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
        if (soundMuted) {
            ambientPlayer.pause();
            return;
        }
        if (ambientPlayer.paused) tryPlayAmbientSound();
    }

    function resumePendingAmbientSound() {
        if (ambientPending && !soundMuted) tryPlayAmbientSound();
    }

    function toggleSound() {
        soundMuted = !soundMuted;
        try { window.localStorage.setItem(SOUND_STORAGE_KEY, soundMuted ? '1' : '0'); } catch (_error) {}
        updateSoundControl();
        if (soundMuted) {
            soundPlayer.pause();
            ambientPlayer.pause();
            ambientPending = false;
        } else {
            syncAmbientSound(room);
        }
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

    function updateBackButton() {
        var previousVisit = navigationStack.length ? navigationStack[navigationStack.length - 1] : null;
        var showBehind = !!previousVisit && previousVisit.returnMode === 'behind';
        var button = byId('back-room');
        button.hidden = !showBehind;
        byId('back-room-label').textContent = showBehind ? 'Behind you · ' + previousVisit.room.title : 'Behind you';
    }

    function renderGatewayReturnActions() {
        var container = byId('gateway-return-actions');
        container.textContent = '';
        var clusterId = clusterByRoomId[String(room.id)];
        var cluster = clusterById[clusterId];
        var assignment = cluster ? state.clusterGatewayReturns[clusterId] : null;
        if (!cluster || String(cluster.entryRoomId) !== String(room.id) || !assignment || assignment.returnMode !== 'behind') return;
        var gatewayRoom = roomById[String(assignment.gatewayRoomId)];
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'travel-button gateway-return-button';
        button.innerHTML = '<i class="fa-solid fa-shuffle" aria-hidden="true"></i><span><small>Gateway</small><strong></strong></span>';
        button.querySelector('strong').textContent = gatewayRoom ? 'Return to ' + gatewayRoom.title : 'Return through Gateway';
        button.addEventListener('click', returnThroughGateway);
        container.appendChild(button);
    }

    function regionAccessibleLabel(region) {
        return region.kind === 'door' ? 'Try this exit' : 'Investigate this area';
    }

    function renderRegionSvg(target, targetRegions) {
        target.textContent = '';
        targetRegions.forEach(function (region) {
            if (!region || !region.bounds) return;
            var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', region.bounds.x);
            rect.setAttribute('y', region.bounds.y);
            rect.setAttribute('width', region.bounds.width);
            rect.setAttribute('height', region.bounds.height);
            rect.setAttribute('class', 'play-region ' + (region.kind === 'door' ? 'door' : 'interaction'));
            rect.setAttribute('data-id', region.id);
            rect.setAttribute('tabindex', '0');
            rect.setAttribute('focusable', 'true');
            rect.setAttribute('role', 'button');
            rect.setAttribute('aria-label', regionAccessibleLabel(region));
            target.appendChild(rect);
        });
    }

    function renderRegions() {
        renderRegionSvg(roomSvg, regions);
        if (activeObject) renderRegionSvg(objectSvg, activeObject.data.regions || []);
    }

    function overlayImage(region, url, canvas) {
        var image = document.createElement('img');
        var bounds = region.bounds;
        image.src = url;
        image.alt = '';
        image.style.left = (bounds.x / canvas.width * 100) + '%';
        image.style.top = (bounds.y / canvas.height * 100) + '%';
        image.style.width = (bounds.width / canvas.width * 100) + '%';
        image.style.height = (bounds.height / canvas.height * 100) + '%';
        return image;
    }

    function renderRoomOverlays() {
        var layer = byId('room-overlay-layer');
        layer.textContent = '';
        regions.forEach(function (region) {
            var url = state.overlays[regionStateKey('room', room, region)] || state.overlays[region.id];
            if (url) layer.appendChild(overlayImage(region, url, room.data.canvas));
        });
    }

    function renderObjectOverlays() {
        var layer = byId('object-overlay-layer');
        layer.textContent = '';
        if (!activeObject) return;
        (activeObject.data.regions || []).forEach(function (region) {
            var url = state.overlays[objectOverlayKey(activeObject, region)];
            if (url) layer.appendChild(overlayImage(region, url, activeObject.data.canvas));
        });
    }

    function ownedObjects() {
        return window.NLRoomRules.ownedObjects(objects, state);
    }

    function renderInventory() {
        var owned = ownedObjects();
        var count = String(owned.length);
        byId('inventory-count').textContent = count;
        byId('inventory-count').setAttribute('aria-label', count + (owned.length === 1 ? ' item' : ' items'));
        byId('mobile-inventory-count').textContent = count;
        var container = byId('inventory-objects');
        container.textContent = '';
        if (!owned.length) {
            var empty = document.createElement('div');
            empty.className = 'inventory-empty';
            empty.innerHTML = '<div><i class="fa-solid fa-suitcase" aria-hidden="true"></i><h3>Your hands are empty</h3><p>Objects you collect will be kept here.</p></div>';
            container.appendChild(empty);
            return;
        }
        owned.forEach(function (object) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'inventory-object';
            button.setAttribute('data-object-slug', object.slug);
            button.innerHTML = '<span class="inventory-thumb"><img alt=""></span><span class="inventory-object-copy"><strong></strong><small>Examine</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
            button.querySelector('img').src = object.backgroundAsset;
            button.querySelector('strong').textContent = object.title;
            container.appendChild(button);
        });
    }

    function renderAll() {
        renderRegions();
        renderRoomOverlays();
        renderObjectOverlays();
        renderInventory();
        renderDescriptions();
        scheduleSave();
    }

    function behaviorIsActive(entry) {
        if (entry.contentKind === 'room') {
            return !activeObject && !!room && String(room.id) === String(entry.content.id);
        }
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
        if (transaction.seen[signature] || transaction.stopped) return;
        if (transaction.runs >= transaction.maximumRuns) {
            transaction.stopped = true;
            return;
        }
        transaction.seen[signature] = true;
        transaction.runs += 1;

        var evaluation = window.NLRoomRules.runLogic(entry.behavior.logic, state, behaviorActionOptions(entry));
        if (behaviorIsActive(entry)) {
            playEvaluationSounds(evaluation);
            if (evaluation.effects.message) showMessage(evaluation.effects.message, entry.content.title);
            if (evaluation.effects.examineObjects.length) openObject(evaluation.effects.examineObjects[0], null);
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
        var entries = activationBehaviorIndex[triggerType + ':' + contentKind + ':' + content.slug] || [];
        if (!entries.length) return;
        var transaction = automaticTransaction();
        var event = { type: triggerType, cause: content.title };
        entries.forEach(function (entry) { executeAutomaticBehavior(entry, event, transaction); });
        drainAutomaticStateQueue(transaction);
    }

    function closeDrawers(restoreFocus) {
        var panels = [byId('inventory-panel'), byId('room-description-panel')];
        panels.forEach(function (panel) {
            panel.classList.remove('visible');
            panel.setAttribute('aria-hidden', 'true');
        });
        byId('toggle-inventory').setAttribute('aria-expanded', 'false');
        byId('toggle-room-description').setAttribute('aria-expanded', 'false');
        byId('panel-scrim').hidden = true;
        activeDrawer = null;
        if (restoreFocus !== false && drawerTrigger && document.contains(drawerTrigger)) drawerTrigger.focus();
        drawerTrigger = null;
    }

    function openDrawer(panel, trigger) {
        closeDrawers(false);
        activeDrawer = panel;
        drawerTrigger = trigger || document.activeElement;
        panel.classList.add('visible');
        panel.setAttribute('aria-hidden', 'false');
        byId('panel-scrim').hidden = false;
        if (panel.id === 'inventory-panel') byId('toggle-inventory').setAttribute('aria-expanded', 'true');
        if (panel.id === 'room-description-panel') byId('toggle-room-description').setAttribute('aria-expanded', 'true');
        window.requestAnimationFrame(function () {
            var closeButton = panel.querySelector('.drawer-close');
            if (closeButton) closeButton.focus();
        });
    }

    function toggleInventory(trigger) {
        if (activeDrawer && activeDrawer.id === 'inventory-panel') closeDrawers(true);
        else openDrawer(byId('inventory-panel'), trigger);
    }

    function toggleRoomDescription(trigger) {
        renderDescriptions();
        if (activeDrawer && activeDrawer.id === 'room-description-panel') closeDrawers(true);
        else openDrawer(byId('room-description-panel'), trigger);
    }

    function setObjectDescriptionOpen(open) {
        if (!activeObject) return;
        renderDescriptions();
        byId('object-description-panel').hidden = !open;
        byId('toggle-object-description').setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) window.requestAnimationFrame(function () { byId('close-object-description').focus(); });
    }

    function openObject(slug, trigger) {
        var object = objectBySlug[slug];
        if (!object) return false;
        objectTrigger = trigger || document.activeElement;
        hideMessage();
        closeDrawers(false);
        activeObject = object;
        setObjectDescriptionOpen(false);
        byId('object-modal-title').textContent = object.title;
        objectImage.src = object.backgroundAsset;
        objectImage.alt = object.title;
        objectSvg.setAttribute('viewBox', '0 0 ' + object.data.canvas.width + ' ' + object.data.canvas.height);
        objectCanvas.style.aspectRatio = object.data.canvas.width + ' / ' + object.data.canvas.height;
        objectModal.hidden = false;
        playerApp.classList.add('object-open');
        renderAll();
        runActivationBehaviors('object_open', 'object', object);
        renderAll();
        window.requestAnimationFrame(function () {
            fitObjectToModal();
            byId('close-object').focus();
        });
        return true;
    }

    function closeObject(restoreFocus) {
        if (!activeObject) return;
        activeObject = null;
        objectModal.hidden = true;
        playerApp.classList.remove('object-open');
        byId('object-description-panel').hidden = true;
        setMessageVisible(byId('object-player-message'), false);
        byId('toggle-object-description').setAttribute('aria-expanded', 'false');
        if (restoreFocus !== false && objectTrigger && document.contains(objectTrigger) && objectTrigger.offsetParent !== null) {
            objectTrigger.focus();
        } else if (restoreFocus !== false) {
            roomCanvas.focus();
        }
        objectTrigger = null;
        renderDescriptions();
    }

    function defaultInteractionMessage(evaluation) {
        return evaluation && evaluation.effects && evaluation.effects.applied.length
            ? 'Something has changed.'
            : 'Nothing happens.';
    }

    function findRoomRegion(id) {
        return regions.find(function (region) { return String(region.id) === String(id); });
    }

    function clickRoomRegion(region) {
        if (!region) return;
        byId('player-touch-hint').classList.add('dismissed');
        var sourceRoom = room;
        var stateKey = regionStateKey('room', room, region);
        var evaluation = window.NLRoomRules.runRegion(region, state, {
            regionId: region.id,
            regionKind: region.kind,
            overlayKey: stateKey,
            doorKey: stateKey
        });
        playEvaluationSounds(evaluation);
        dispatchStateChanges(evaluation.effects.changes, room.title + ' · ' + region.name);
        var pass = evaluation.conditionMatched;
        var message = evaluation.effects.message || defaultInteractionMessage(evaluation);
        var destination = null;
        var navigation = null;

        if (region.kind === 'door') {
            var gatewayAssignment = gatewayAssignmentForExit(room, region.id);
            var gatewayReturn = activeGatewayReturnForRoom(room, region.id);
            var canExit = !!gatewayReturn || window.NLRoomRules.canExit(region, state, currentEntryRegionId, stateKey);
            if (!canExit) {
                pass = false;
                if (!evaluation.effects.message) message = 'It will not open.';
            } else {
                if (gatewayReturn) {
                    destination = roomById[String(gatewayReturn.gatewayRoomId)] || null;
                    navigation = { returnMode: 'door', targetRegionId: gatewayReturn.gatewayRegionId || '' };
                } else if (gatewayAssignment) {
                    destination = roomById[String(gatewayAssignment.entryRoomId)] || null;
                    navigation = {
                        returnMode: gatewayAssignment.returnMode || 'behind',
                        targetRegionId: gatewayAssignment.returnRegionId || '',
                        gatewayAssignment: gatewayAssignment
                    };
                } else {
                    var connection = connectionByExit[String(room.id) + ':' + region.id] || null;
                    destination = connection ? roomById[String(connection.targetRoomId)] : resolveRoomTarget(region.door && region.door.targetRoom);
                    navigation = connection
                        ? { returnMode: connection.returnMode || 'behind', targetRegionId: connection.targetRegionId || '' }
                        : { returnMode: 'behind', targetRegionId: '' };
                }
                if (!destination) {
                    pass = false;
                    message = evaluation.effects.message || 'The way does not lead anywhere.';
                } else {
                    pass = true;
                    message = evaluation.effects.message || (gatewayAssignment
                        ? 'The Gateway opens into ' + destination.title + '.'
                        : 'You enter ' + destination.title + '.');
                }
            }
        }

        renderAll();
        var openedObject = false;
        if (evaluation.effects.examineObjects.length) {
            var objectSlug = evaluation.effects.examineObjects[0];
            var trigger = roomSvg.querySelector('[data-id="' + cssEscape(String(region.id)) + '"]');
            openedObject = openObject(objectSlug, trigger);
            if (!openedObject) {
                message = 'There is nothing here to examine.';
                pass = false;
            } else if (!evaluation.effects.message) {
                message = 'You take a closer look.';
            }
        }
        showMessage(message, sourceRoom.title);
        if (destination && pass && !openedObject) navigateToRoom(destination, message, navigation);
    }

    function clickObjectRegion(region) {
        if (!activeObject || !region) return;
        var object = activeObject;
        var evaluation = window.NLRoomRules.runRegion(region, state, {
            regionId: region.id,
            regionKind: region.kind,
            overlayKey: objectOverlayKey(object, region),
            doorKey: objectOverlayKey(object, region)
        });
        playEvaluationSounds(evaluation);
        dispatchStateChanges(evaluation.effects.changes, object.title + ' · ' + region.name);
        var message = evaluation.effects.message || defaultInteractionMessage(evaluation);
        renderAll();
        showMessage(message, object.title);
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
        return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }

    function setActiveRoom(nextRoom, entryRegionId, runActivation) {
        if (!nextRoom) return;
        if (activeObject) closeObject(false);
        closeDrawers(false);
        hideMessage();
        room = nextRoom;
        regions = room.data.regions || [];
        currentEntryRegionId = entryRegionId || '';
        ensureGatewayAssignments(room);
        syncAmbientSound(room);
        byId('player-room-title').textContent = room.title;
        byId('room-description-title').textContent = room.title;
        roomCanvas.classList.add('loading-room');
        roomImage.src = room.backgroundAsset;
        roomImage.alt = room.title;
        roomSvg.setAttribute('viewBox', '0 0 ' + room.data.canvas.width + ' ' + room.data.canvas.height);
        roomCanvas.style.aspectRatio = room.data.canvas.width + ' / ' + room.data.canvas.height;
        updateBackButton();
        renderGatewayReturnActions();
        renderAll();
        if (runActivation !== false) {
            runActivationBehaviors('room_enter', 'room', room);
            renderAll();
        }
        window.requestAnimationFrame(fitRoomToStage);
    }

    function navigateToRoom(nextRoom, message, navigation) {
        navigation = navigation || {};
        var previousRoom = room;
        navigationStack.push({
            room: previousRoom,
            entryRegionId: currentEntryRegionId,
            returnMode: navigation.returnMode || 'behind'
        });
        if (navigation.gatewayAssignment) {
            state.clusterGatewayReturns[String(navigation.gatewayAssignment.clusterId)] = navigation.gatewayAssignment;
        }
        setActiveRoom(nextRoom, navigation.targetRegionId || returnDoorId(nextRoom, previousRoom), true);
        showMessage(message || ('You enter ' + nextRoom.title + '.'), nextRoom.title);
        roomCanvas.focus();
        saveRun();
    }

    function returnToPreviousRoom() {
        if (!navigationStack.length) return;
        var departedRoom = room;
        var previous = navigationStack.pop();
        setActiveRoom(previous.room, previous.entryRegionId, true);
        showMessage('You turn back from ' + departedRoom.title + '.', previous.room.title);
        roomCanvas.focus();
        saveRun();
    }

    function returnThroughGateway() {
        var clusterId = clusterByRoomId[String(room.id)];
        var assignment = state.clusterGatewayReturns[clusterId];
        var gatewayRoom = assignment ? roomById[String(assignment.gatewayRoomId)] : null;
        if (!assignment || !gatewayRoom) return;
        navigateToRoom(gatewayRoom, 'You return through the Gateway.', {
            returnMode: 'door',
            targetRegionId: assignment.gatewayRegionId || ''
        });
    }

    function startNewGame(showNotice) {
        try { window.localStorage.removeItem(RUN_STORAGE_KEY); } catch (_error) {}
        state = emptyState();
        addInitiallyUnlockedDoors(state);
        navigationStack = [];
        currentEntryRegionId = '';
        soundPlayer.pause();
        soundPlayer.removeAttribute('src');
        stopAmbientSound();
        if (activeObject) closeObject(false);
        closeDrawers(false);
        setActiveRoom(startRoom, '', true);
        if (showNotice) showMessage('Your previous progress has been cleared.', startRoom.title);
        saveRun();
    }

    function openGameMenu(trigger) {
        closeDrawers(false);
        menuTrigger = trigger || document.activeElement;
        byId('game-menu-actions').hidden = false;
        byId('new-game-confirm').hidden = true;
        gameMenu.hidden = false;
        byId('open-game-menu').setAttribute('aria-expanded', 'true');
        window.requestAnimationFrame(function () { byId('continue-game').focus(); });
    }

    function closeGameMenu(restoreFocus) {
        gameMenu.hidden = true;
        byId('open-game-menu').setAttribute('aria-expanded', 'false');
        byId('game-menu-actions').hidden = false;
        byId('new-game-confirm').hidden = true;
        if (restoreFocus !== false && menuTrigger && document.contains(menuTrigger)) menuTrigger.focus();
        menuTrigger = null;
    }

    function requestNewGame() {
        byId('game-menu-actions').hidden = true;
        byId('new-game-confirm').hidden = false;
        byId('cancel-new-game').focus();
    }

    function cancelNewGame() {
        byId('game-menu-actions').hidden = false;
        byId('new-game-confirm').hidden = true;
        byId('continue-game').focus();
    }

    function currentFullscreenElement() {
        return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function updateImmersiveControls() {
        var enabled = playerApp.classList.contains('immersive-mode');
        var button = byId('toggle-immersive');
        button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        button.querySelector('i').className = enabled ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
        byId('immersive-menu-label').textContent = enabled ? 'Restore interface' : 'Expand room';
        byId('immersive-menu-detail').textContent = enabled
            ? 'Show the room title and game controls'
            : 'Hide controls and use the available screen';
    }

    function setImmersiveMode(enabled) {
        playerApp.classList.toggle('immersive-mode', enabled);
        updateImmersiveControls();
        window.requestAnimationFrame(function () {
            fitRoomToStage();
            fitObjectToModal();
        });
    }

    function enterImmersiveMode() {
        closeGameMenu(false);
        setImmersiveMode(true);
        var requestFullscreen = playerApp.requestFullscreen || playerApp.webkitRequestFullscreen;
        if (requestFullscreen) {
            try {
                var request = requestFullscreen.call(playerApp);
                if (request && typeof request.catch === 'function') request.catch(function () {});
            } catch (_error) {
                // CSS immersive mode remains available when native fullscreen is unavailable.
            }
        }
        window.requestAnimationFrame(function () { byId('exit-immersive').focus(); });
    }

    function leaveImmersiveMode() {
        setImmersiveMode(false);
        if (currentFullscreenElement() === playerApp) {
            var exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
            if (exitFullscreen) {
                try {
                    var exit = exitFullscreen.call(document);
                    if (exit && typeof exit.catch === 'function') exit.catch(function () {});
                } catch (_error) {}
            }
        }
        roomCanvas.focus();
    }

    function handleFullscreenChange() {
        if (currentFullscreenElement() === playerApp) {
            nativeFullscreenEntered = true;
            if (!playerApp.classList.contains('immersive-mode')) setImmersiveMode(true);
            return;
        }
        if (nativeFullscreenEntered) {
            nativeFullscreenEntered = false;
            if (playerApp.classList.contains('immersive-mode')) setImmersiveMode(false);
        }
    }

    function focusableElements(container) {
        return Array.prototype.slice.call(container.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter(function (element) {
            return !element.hidden && element.offsetParent !== null;
        });
    }

    function trapFocus(event, container) {
        if (event.key !== 'Tab') return;
        var focusable = focusableElements(container);
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function activateRegionFromEvent(event, targetSvg, contentRegions, handler) {
        var target = event.target;
        if (!target || !target.classList || !target.classList.contains('play-region')) return;
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        if (event.type === 'keydown') event.preventDefault();
        var id = target.getAttribute('data-id');
        var region = contentRegions().find(function (candidate) { return String(candidate.id) === String(id); });
        if (region) handler(region);
    }

    roomSvg.addEventListener('click', function (event) {
        activateRegionFromEvent(event, roomSvg, function () { return regions; }, clickRoomRegion);
    });
    roomSvg.addEventListener('keydown', function (event) {
        activateRegionFromEvent(event, roomSvg, function () { return regions; }, clickRoomRegion);
    });
    objectSvg.addEventListener('click', function (event) {
        activateRegionFromEvent(event, objectSvg, function () { return activeObject ? activeObject.data.regions || [] : []; }, clickObjectRegion);
    });
    objectSvg.addEventListener('keydown', function (event) {
        activateRegionFromEvent(event, objectSvg, function () { return activeObject ? activeObject.data.regions || [] : []; }, clickObjectRegion);
    });

    byId('toggle-sound').addEventListener('click', toggleSound);
    byId('toggle-inventory').addEventListener('click', function () { toggleInventory(this); });
    byId('mobile-inventory').addEventListener('click', function () { toggleInventory(this); });
    byId('close-inventory').addEventListener('click', function () { closeDrawers(true); });
    byId('toggle-room-description').addEventListener('click', function () { toggleRoomDescription(this); });
    byId('close-room-description').addEventListener('click', function () { closeDrawers(true); });
    byId('panel-scrim').addEventListener('click', function () { closeDrawers(true); });
    byId('inventory-objects').addEventListener('click', function (event) {
        var button = event.target.closest('.inventory-object');
        if (button) openObject(button.getAttribute('data-object-slug'), button);
    });
    byId('toggle-object-description').addEventListener('click', function () {
        setObjectDescriptionOpen(this.getAttribute('aria-expanded') !== 'true');
    });
    byId('close-object-description').addEventListener('click', function () { setObjectDescriptionOpen(false); });
    byId('close-object').addEventListener('click', function () { closeObject(true); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close-object]'), function (element) {
        element.addEventListener('click', function () { closeObject(true); });
    });
    byId('back-room').addEventListener('click', returnToPreviousRoom);
    byId('open-game-menu').addEventListener('click', function () { openGameMenu(this); });
    byId('continue-game').addEventListener('click', function () { closeGameMenu(true); });
    byId('toggle-immersive').addEventListener('click', function () {
        if (playerApp.classList.contains('immersive-mode')) leaveImmersiveMode();
        else enterImmersiveMode();
    });
    byId('exit-immersive').addEventListener('click', leaveImmersiveMode);
    byId('request-new-game').addEventListener('click', requestNewGame);
    byId('cancel-new-game').addEventListener('click', cancelNewGame);
    byId('start-new-game').addEventListener('click', function () {
        closeGameMenu(false);
        startNewGame(true);
        roomCanvas.focus();
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close-menu]'), function (element) {
        element.addEventListener('click', function () { closeGameMenu(true); });
    });

    document.addEventListener('keydown', function (event) {
        resumePendingAmbientSound();
        if (!gameMenu.hidden) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeGameMenu(true);
            } else trapFocus(event, gameMenu);
            return;
        }
        if (!objectModal.hidden) {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (!byId('object-description-panel').hidden) setObjectDescriptionOpen(false);
                else closeObject(true);
            } else trapFocus(event, byId('object-description-panel').hidden ? objectModal : byId('object-description-panel'));
            return;
        }
        if (activeDrawer) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeDrawers(true);
            } else trapFocus(event, activeDrawer);
            return;
        }
        if (event.key === 'Escape' && playerApp.classList.contains('immersive-mode')) {
            event.preventDefault();
            leaveImmersiveMode();
        }
    });
    document.addEventListener('pointerdown', resumePendingAmbientSound, true);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    window.addEventListener('pagehide', saveRun);
    roomImage.addEventListener('load', function () {
        roomCanvas.classList.remove('loading-room');
        fitRoomToStage();
    });
    objectImage.addEventListener('load', fitObjectToModal);

    loadSoundPreference();
    var savedRun = loadSavedRun();
    if (savedRun) {
        state = savedRun.state;
        addInitiallyUnlockedDoors(state);
        navigationStack = savedRun.navigationStack;
        setActiveRoom(savedRun.room, savedRun.entryRegionId, false);
    } else {
        startNewGame(false);
    }

    fitRoomToStage();
    if (window.ResizeObserver) {
        new ResizeObserver(fitRoomToStage).observe(playerStage);
        new ResizeObserver(fitObjectToModal).observe(objectModalBody);
    } else {
        window.addEventListener('resize', function () {
            fitRoomToStage();
            fitObjectToModal();
        });
    }
})();
