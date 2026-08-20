(function ($) {
    'use strict';

    var initialRoom = window.NL_DEBUG_ROOM;
    var room = initialRoom;
    var rooms = Array.isArray(window.NL_DEBUG_ROOMS) && window.NL_DEBUG_ROOMS.length ? window.NL_DEBUG_ROOMS : [initialRoom];
    var objects = Array.isArray(window.NL_DEBUG_OBJECTS) ? window.NL_DEBUG_OBJECTS : [];
    var objectBySlug = {};
    var roomById = {};
    var roomBySlug = {};
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

    objects.forEach(function (object) { objectBySlug[object.slug] = object; });
    rooms.forEach(function (candidate) {
        roomById[String(candidate.id)] = candidate;
        roomBySlug[candidate.slug] = candidate;
    });

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
        state = { flags: {}, items: {}, unlockedDoors: {}, overlays: {} };
        rooms.forEach(function (candidate) {
            (candidate.data.regions || []).forEach(function (region) {
                if (region.kind === 'door' && region.door && region.door.unlocked) state.unlockedDoors[region.id] = true;
            });
        });
        navigationStack = [];
        closeObject(false);
        closeInventory();
        setActiveRoom(initialRoom, '');
        $('#event-log').html('<em>Session reset. Click a highlighted region.</em>');
        $('.player-message').removeClass('visible');
    }

    function esc(value) { return $('<div>').text(value === undefined || value === null ? '' : value).html(); }

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
        var previous = navigationStack.length ? navigationStack[navigationStack.length - 1].room : null;
        $('#back-room').prop('hidden', !previous);
        $('#back-room-label').text(previous ? 'Back to ' + previous.title : 'Back');
    }

    function setActiveRoom(nextRoom, entryRegionId) {
        if (!nextRoom) return;
        room = nextRoom;
        regions = room.data.regions || [];
        closeObject(false);
        closeInventory();
        $('#debug-room-title').text(room.title);
        $('#debug-room-slug').text(room.slug);
        $('#debug-editor-link').attr('href', 'room-edit.php?id=' + room.id);
        roomImage.setAttribute('src', room.backgroundAsset);
        roomImage.setAttribute('alt', room.title);
        svg.setAttribute('viewBox', '0 0 ' + room.data.canvas.width + ' ' + room.data.canvas.height);
        playCanvas.style.aspectRatio = room.data.canvas.width + ' / ' + room.data.canvas.height;
        populateEntryDoors(entryRegionId);
        updateBackButton();
        renderAll();
        fitRoomToStage();
    }

    function navigateToRoom(nextRoom, message) {
        var previousRoom = room;
        navigationStack.push({ room: previousRoom, entryRegionId: $('#entry-region').val() || '' });
        setActiveRoom(nextRoom, returnDoorId(nextRoom, previousRoom));
        showMessage(message || ('Entered ' + nextRoom.title + '.'));
        playCanvas.focus();
    }

    function returnToPreviousRoom() {
        if (!navigationStack.length) return;
        var departedRoom = room;
        var previous = navigationStack.pop();
        setActiveRoom(previous.room, previous.entryRegionId);
        var message = 'Returned to ' + previous.room.title + ' from ' + departedRoom.title + '.';
        showMessage(message);
        logEvent('Back to ' + previous.room.title, true, message, 'navigation');
        playCanvas.focus();
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
            return '<span>' + esc(region ? region.name : id) + '</span>';
        }).join('') : '<p class="empty-mini">No extra doors unlocked</p>');
    }

    function overlayImage(region, url, canvas) {
        var bounds = region.bounds;
        return '<img src="' + esc(url) + '" style="left:' + (bounds.x / canvas.width * 100) + '%;top:' + (bounds.y / canvas.height * 100) + '%;width:' + (bounds.width / canvas.width * 100) + '%;height:' + (bounds.height / canvas.height * 100) + '%" alt="">';
    }

    function renderRoomOverlays() {
        var html = '';
        regions.forEach(function (region) {
            if (state.overlays[region.id]) html += overlayImage(region, state.overlays[region.id], room.data.canvas);
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

    function openObject(slug, source) {
        var object = objectBySlug[slug];
        if (!object) return false;
        activeObject = object;
        closeInventory();
        $('#object-modal-title').text(object.title);
        $('#object-image').attr('src', object.backgroundAsset).attr('alt', object.title);
        objectSvg.setAttribute('viewBox', '0 0 ' + object.data.canvas.width + ' ' + object.data.canvas.height);
        objectCanvas.style.aspectRatio = object.data.canvas.width + ' / ' + object.data.canvas.height;
        renderRegionSvg(objectSvg, object.data.regions || []);
        renderObjectOverlays();
        document.getElementById('object-modal').hidden = false;
        document.body.classList.add('object-modal-open');
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
        var evaluation = window.NLRoomRules.runRegion(region, state, { regionId: region.id });
        var pass = evaluation.conditionMatched;
        var message = evaluation.effects.message || (pass ? 'The interaction succeeds.' : (evaluation.actions.length ? 'The alternate result runs.' : 'Nothing happens.'));
        var destination = null;
        if (region.kind === 'door') {
            var canExit = window.NLRoomRules.canExit(region, state, $('#entry-region').val());
            if (!canExit) {
                pass = false;
                if (!evaluation.effects.message) message = 'This door has not been unlocked. You can only leave through the door you entered.';
            } else {
                destination = resolveRoomTarget(region.door && region.door.targetRoom);
                if (!destination) {
                    pass = false;
                    message = evaluation.effects.message || ((region.door && region.door.targetRoom) ? 'The target room “' + region.door.targetRoom + '” is unavailable.' : 'This door does not have a target room yet.');
                } else {
                    pass = true;
                    message = evaluation.effects.message || ('Enter ' + destination.title + '.');
                }
            }
        }

        renderState();
        renderRoomOverlays();
        renderInventory();
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
        if (destination && pass && !openedObject) navigateToRoom(destination, message);
    }

    function clickObjectRegion(region) {
        if (!activeObject) return;
        var object = activeObject;
        var evaluation = window.NLRoomRules.runRegion(region, state, { regionId: region.id, overlayKey: objectOverlayKey(object, region) });
        var pass = evaluation.conditionMatched;
        var message = evaluation.effects.message || (pass ? 'The interaction succeeds.' : (evaluation.actions.length ? 'The alternate result runs.' : 'Nothing happens.'));
        renderState();
        renderObjectOverlays();
        renderInventory();
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
    $('#toggle-inventory').on('click', function () { $('#inventory-panel').hasClass('visible') ? closeInventory() : openInventory(); });
    $('#close-inventory').on('click', closeInventory);
    $('#inventory-objects').on('click', '.inventory-object', function () { openObject($(this).attr('data-object-slug'), 'inventory'); });
    $('#close-object, [data-close-object]').on('click', function () { closeObject(true); });
    $(document).on('keydown', function (event) {
        if (event.key !== 'Escape') return;
        if (activeObject) closeObject(true); else closeInventory();
    });

    $('[data-add-state]').on('click', function () {
        var type = $(this).data('add-state');
        var base = type === 'flags' ? 'new_flag' : 'new_item';
        var key = base;
        var n = 2;
        while (Object.prototype.hasOwnProperty.call(state[type], key)) key = base + '_' + n++;
        state[type][key] = type === 'items' ? '1' : '';
        renderAll();
    });
    $('.debug-console').on('change', '.state-value', function () {
        var type = $(this).closest('.console-section').find('h3').text().toLowerCase();
        state[type][$(this).data('key')] = $(this).val();
        renderInventory();
    }).on('change', '.state-key', function () {
        var type = $(this).closest('.console-section').find('h3').text().toLowerCase();
        var oldKey = $(this).data('original');
        var newKey = $(this).val().trim();
        if (newKey && newKey !== oldKey) {
            state[type][newKey] = state[type][oldKey];
            delete state[type][oldKey];
            renderAll();
        }
    }).on('click', '.state-delete', function () {
        var type = $(this).closest('.console-section').find('h3').text().toLowerCase();
        delete state[type][$(this).data('key')];
        renderAll();
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
