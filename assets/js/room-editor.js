(function ($) {
    'use strict';

    var room = window.NL_ROOM_BOOTSTRAP;
    var editor = window.NL_EDITOR_CONTEXT || { kind: 'room', apiUrl: 'api/rooms.php', editUrl: 'room-edit.php', listUrl: 'index.php', debugUrl: 'play-debug.php', assetType: 'rooms' };
    var isObject = editor.kind === 'object';
    var contentLabel = isObject ? 'object' : 'room';
    var editorRooms = Array.isArray(window.NL_EDITOR_ROOMS) ? window.NL_EDITOR_ROOMS : [];
    var editorClusters = Array.isArray(window.NL_EDITOR_CLUSTERS) ? window.NL_EDITOR_CLUSTERS : [];
    var roomClusterId = String(window.NL_EDITOR_ROOM_CLUSTER_ID || '');
    var gateway = $.extend(true, { enabled: false, roomId: 0, destinationCount: 1, exitRegionIds: [], candidateClusterIds: [] }, window.NL_EDITOR_GATEWAY || {});
    gateway.exitRegionIds = Array.isArray(gateway.exitRegionIds) ? gateway.exitRegionIds.map(String) : [];
    gateway.candidateClusterIds = Array.isArray(gateway.candidateClusterIds) ? gateway.candidateClusterIds.map(String) : [];
    var regions = room.data && Array.isArray(room.data.regions) ? room.data.regions : [];
    var canvas = room.data && room.data.canvas ? room.data.canvas : { width: 1600, height: 900 };
    var selectedId = null;
    var drawing = false;
    var drawStart = null;
    var draftRect = null;
    var zoom = 1;
    var fieldLock = false;
    var svg = document.getElementById('region-layer');
    var image = document.getElementById('room-image');
    var roomCanvas = document.getElementById('room-canvas');
    var canvasStage = document.getElementById('canvas-stage');
    var zoomFrame = null;
    var logicEditor = null;

    function uid() {
        return 'region-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    }

    function blankRegion(bounds) {
        return {
            id: uid(),
            name: 'New region',
            kind: 'interaction',
            bounds: bounds,
            logic: window.NLRoomRules.defaultLogic(),
            overlayLibrary: [],
            door: { targetRoom: '', unlocked: false, connectionMode: 'static', returnMode: 'behind', targetRegionId: '' }
        };
    }

    function normalizeRegion(region) {
        var fresh = blankRegion(region.bounds || { x: 100, y: 100, width: 220, height: 160 });
        fresh.id = region.id || fresh.id;
        fresh.name = region.name || fresh.name;
        fresh.kind = region.kind || fresh.kind;
        fresh.bounds = $.extend({}, fresh.bounds, region.bounds || {});
        fresh.logic = window.NLRoomRules.normalizeLogic(region);
        fresh.overlayLibrary = Array.isArray(region.overlayLibrary) ? region.overlayLibrary.slice() : [];
        fresh.door = $.extend({}, fresh.door, region.door || {});
        return fresh;
    }
    regions = regions.map(normalizeRegion);

    function selected() {
        return regions.find(function (region) { return region.id === selectedId; }) || null;
    }

    function esc(value) {
        return $('<div>').text(value || '').html();
    }

    function roomOption(value) {
        value = String(value || '');
        return editorRooms.find(function (candidate) { return String(candidate.id) === value || candidate.slug === value; }) || null;
    }

    function renderTargetRoomPicker(value) {
        if (isObject || !document.getElementById('target-room-picker')) return;
        value = String(value || '');
        var selectedRoom = roomOption(value);
        var label = selectedRoom ? selectedRoom.title : (value || 'Choose a room');
        var detail = selectedRoom ? (selectedRoom.clusterName + ' · ' + selectedRoom.slug) : (value ? 'Unavailable saved target' : 'Search by room name, slug, or cluster');
        var html = '<button type="button" class="logic-picker-toggle" aria-haspopup="listbox" aria-expanded="false"><span><strong>' + esc(label) + '</strong><small>' + esc(detail) + '</small></span><i class="fa-solid fa-chevron-down"></i></button>' +
            '<div class="logic-picker-menu"><div class="logic-picker-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Search rooms or clusters" aria-label="Search rooms or clusters"></div><div class="logic-picker-options" role="listbox">' +
            '<button type="button" class="logic-picker-option room-target-option" data-value="" data-search="clear target"><span><strong>No static target</strong><small>Leave this exit unconnected</small></span>' + (!value ? '<i class="fa-solid fa-check"></i>' : '') + '</button>';
        editorRooms.forEach(function (candidate) {
            if (room.id && String(candidate.id) === String(room.id)) return;
            var outsideCluster = roomClusterId && String(candidate.clusterId || '') !== roomClusterId;
            var unassigned = !candidate.clusterId;
            var disabled = !roomClusterId || outsideCluster || unassigned;
            var disabledDetail = unassigned ? 'Unassigned · add from Map first' : (outsideCluster ? candidate.clusterName + ' · use a Gateway across clusters' : candidate.clusterName + ' · ' + candidate.slug);
            html += '<button type="button" class="logic-picker-option room-target-option" data-value="' + esc(candidate.id) + '" data-search="' + esc((candidate.title + ' ' + candidate.slug + ' ' + candidate.clusterName).toLowerCase()) + '"' + (disabled ? ' disabled' : '') + '><span><strong>' + esc(candidate.title) + '</strong><small>' + esc(disabledDetail) + '</small></span>' + (String(candidate.id) === value ? '<i class="fa-solid fa-check"></i>' : '') + '</button>';
        });
        html += '</div></div>';
        $('#target-room-picker').attr('data-value', value).html(html);
    }

    function gatewayExitSelected(regionId) {
        return gateway.enabled && gateway.exitRegionIds.some(function (candidate) { return String(candidate) === String(regionId); });
    }

    function gatewayReturnDoor(regionId) {
        var cluster = editorClusters.find(function (candidate) { return String(candidate.id) === roomClusterId; });
        return !!cluster && cluster.gatewayReturnMode === 'door' && String(cluster.entryRoomId) === String(room.id) && String(cluster.gatewayReturnRegionId) === String(regionId);
    }

    function gatewayStatus() {
        if (!gateway.enabled) return;
        var count = Math.max(1, parseInt(gateway.destinationCount, 10) || 1);
        var valid = gateway.exitRegionIds.length >= count && gateway.candidateClusterIds.length >= count;
        var html = valid
            ? '<i class="fa-solid fa-circle-check"></i><span>Ready: ' + count + ' distinct clusters will be paired with ' + count + ' shuffled Gateway exits.</span>'
            : '<i class="fa-solid fa-triangle-exclamation"></i><span>Cannot save: select at least ' + count + ' Door / exit regions and ' + count + ' eligible clusters. Currently ' + gateway.exitRegionIds.length + ' exits and ' + gateway.candidateClusterIds.length + ' clusters are selected.</span>';
        $('#room-gateway-status').toggleClass('valid', valid).html(html);
    }

    function renderGatewaySettings() {
        if (isObject || !document.getElementById('room-gateway-enabled')) return;
        $('#room-gateway-enabled').prop('checked', !!gateway.enabled);
        $('#room-gateway-fields').prop('hidden', !gateway.enabled);
        $('#room-gateway-count').val(gateway.destinationCount || 1);
        var exitHtml = '';
        regions.filter(function (region) { return region.kind === 'door'; }).forEach(function (region) {
            var checked = gatewayExitSelected(region.id);
            var reserved = gatewayReturnDoor(region.id);
            exitHtml += '<label><input type="checkbox" class="room-gateway-exit-option" value="' + esc(region.id) + '"' + (checked ? ' checked' : '') + (reserved ? ' disabled' : '') + '><span><strong>' + esc(region.name) + '</strong><small>' + (reserved ? 'Reserved cluster Gateway return' : (region.door && region.door.targetRoom && !checked ? 'Selecting this removes its static destination' : 'Available Door / exit region')) + '</small></span></label>';
        });
        $('#room-gateway-exits').html(exitHtml || '<p class="empty-mini">Create at least one Door / exit region first.</p>');
        var candidateHtml = '';
        editorClusters.forEach(function (cluster) {
            if (String(cluster.id) === roomClusterId) return;
            var checked = gateway.candidateClusterIds.some(function (candidate) { return String(candidate) === String(cluster.id); });
            candidateHtml += '<label><input type="checkbox" class="room-gateway-candidate-option" value="' + esc(cluster.id) + '"' + (checked ? ' checked' : '') + '><span><strong>' + esc(cluster.name) + '</strong><small>' + esc(cluster.slug) + ' · ' + esc(cluster.gatewayReturnMode === 'door' ? 'return door' : 'behind-you return') + '</small></span></label>';
        });
        $('#room-gateway-candidates').html(candidateHtml || '<p class="empty-mini">Create at least one other cluster in Map.</p>');
        gatewayStatus();
        var region = selected();
        var reservedReturn = !!region && gatewayReturnDoor(region.id);
        $('#door-gateway-row').toggle(!!region && region.kind === 'door' && !!gateway.enabled && !reservedReturn);
        $('#door-reserved-return').prop('hidden', !reservedReturn);
        if (region) {
            $('#door-gateway-exit').prop('checked', gatewayExitSelected(region.id));
            $('#static-door-fields').toggle(!gatewayExitSelected(region.id) && !reservedReturn);
        }
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes < 1024) return (bytes || 0) + ' B';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function renderRegions() {
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        regions.forEach(function (region, index) {
            var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', region.bounds.x);
            rect.setAttribute('y', region.bounds.y);
            rect.setAttribute('width', region.bounds.width);
            rect.setAttribute('height', region.bounds.height);
            rect.setAttribute('class', 'region-shape' + (region.id === selectedId ? ' selected' : ''));
            rect.setAttribute('data-id', region.id);
            svg.appendChild(rect);

            var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', region.bounds.x + 12);
            label.setAttribute('y', region.bounds.y + 28);
            label.setAttribute('class', 'region-label');
            label.setAttribute('data-id', region.id);
            label.textContent = (index + 1) + '  ' + region.name;
            svg.appendChild(label);
        });
        if (draftRect) svg.appendChild(draftRect);

        var html = regions.length ? '' : '<div class="region-empty"><i class="fa-regular fa-square-plus"></i><p>No clickable areas yet</p></div>';
        regions.forEach(function (region, index) {
            html += '<button class="region-item' + (region.id === selectedId ? ' active' : '') + '" data-id="' + esc(region.id) + '">' +
                '<span class="region-number">' + (index + 1) + '</span><span><strong>' + esc(region.name) + '</strong><small><i class="fa-solid ' + (region.kind === 'door' ? 'fa-door-open' : 'fa-hand-pointer') + '"></i> ' + (region.kind === 'door' ? 'Door / exit' : 'Interaction') + '</small></span><i class="fa-solid fa-chevron-right"></i></button>';
        });
        $('#region-list').html(html);
    }

    function selectRegion(id) {
        selectedId = id;
        renderRegions();
        fillInspector();
    }

    function fillInspector() {
        var region = selected();
        $('#inspector-empty').toggle(!region);
        $('#inspector-content').toggle(!!region);
        if (!region) return;
        fieldLock = true;
        $('#inspector-title').text(region.name);
        $('#region-name').val(region.name);
        $('#region-kind').val(region.kind);
        $('#target-room').val(region.door.targetRoom);
        renderTargetRoomPicker(region.door.targetRoom);
        $('#door-unlocked').prop('checked', !!region.door.unlocked);
        $('#door-fields').toggle(region.kind === 'door');
        var reservedReturn = region.kind === 'door' && gatewayReturnDoor(region.id);
        $('#door-gateway-row').toggle(region.kind === 'door' && !!gateway.enabled && !reservedReturn);
        $('#door-reserved-return').prop('hidden', !reservedReturn);
        $('#door-gateway-exit').prop('checked', gatewayExitSelected(region.id));
        $('#static-door-fields').toggle(!gatewayExitSelected(region.id) && !reservedReturn);
        if (logicEditor) logicEditor.setRegion(region);
        $('#region-bounds').text('x ' + Math.round(region.bounds.x) + ' · y ' + Math.round(region.bounds.y) + ' · w ' + Math.round(region.bounds.width) + ' · h ' + Math.round(region.bounds.height));
        fieldLock = false;
    }

    function updateSelected() {
        if (fieldLock) return;
        var region = selected();
        if (!region) return;
        var previousKind = region.kind;
        region.name = $('#region-name').val().trim() || 'Untitled region';
        region.kind = isObject ? 'interaction' : $('#region-kind').val();
        if (previousKind === 'door' && region.kind !== 'door') {
            region.logic.branches.forEach(function (branch) {
                branch.actions = branch.actions.filter(function (action) { return action.type !== 'unlock_door'; });
            });
            region.logic.elseActions = region.logic.elseActions.filter(function (action) { return action.type !== 'unlock_door'; });
            gateway.exitRegionIds = gateway.exitRegionIds.filter(function (candidate) { return String(candidate) !== String(region.id); });
        }
        var reservedReturn = !isObject && region.kind === 'door' && gatewayReturnDoor(region.id);
        var gatewayExit = !reservedReturn && !isObject && region.kind === 'door' && gatewayExitSelected(region.id);
        region.door = isObject ? { targetRoom: '', unlocked: false, connectionMode: 'static', returnMode: 'behind', targetRegionId: '' } : {
            targetRoom: gatewayExit || reservedReturn ? '' : $('#target-room').val().trim(),
            unlocked: $('#door-unlocked').prop('checked'),
            connectionMode: gatewayExit ? 'gateway' : 'static',
            returnMode: region.door && region.door.returnMode ? region.door.returnMode : 'behind',
            targetRegionId: region.door && region.door.targetRegionId ? region.door.targetRegionId : ''
        };
        $('#inspector-title').text(region.name);
        $('#door-fields').toggle(region.kind === 'door');
        $('#door-gateway-row').toggle(region.kind === 'door' && !!gateway.enabled && !reservedReturn);
        $('#door-reserved-return').prop('hidden', !reservedReturn);
        $('#static-door-fields').toggle(!gatewayExit && !reservedReturn);
        if (previousKind !== region.kind && logicEditor) logicEditor.refresh();
        markDirty();
        renderRegions();
        if (previousKind !== region.kind) renderGatewaySettings();
    }

    function canvasPoint(event) {
        var rect = svg.getBoundingClientRect();
        var clientX = event.clientX !== undefined ? event.clientX : event.originalEvent.clientX;
        var clientY = event.clientY !== undefined ? event.clientY : event.originalEvent.clientY;
        return {
            x: Math.max(0, Math.min(canvas.width, (clientX - rect.left) / rect.width * canvas.width)),
            y: Math.max(0, Math.min(canvas.height, (clientY - rect.top) / rect.height * canvas.height))
        };
    }

    function startDrawing() {
        drawing = true;
        drawStart = null;
        roomCanvas.classList.add('drawing');
        $('#draw-instruction').addClass('visible');
        $('#draw-region, #add-region').addClass('active');
    }

    function stopDrawing() {
        drawing = false;
        drawStart = null;
        draftRect = null;
        roomCanvas.classList.remove('drawing');
        $('#draw-instruction').removeClass('visible');
        $('#draw-region, #add-region').removeClass('active');
        renderRegions();
    }

    $('#draw-region, #add-region').on('click', function () { drawing ? stopDrawing() : startDrawing(); });
    $(document).on('keydown', function (event) { if (event.key === 'Escape') stopDrawing(); });
    $(svg).on('pointerdown', function (event) {
        if (drawing) {
            event.preventDefault();
            drawStart = canvasPoint(event);
            draftRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            draftRect.setAttribute('class', 'region-shape draft');
            draftRect.setAttribute('x', drawStart.x);
            draftRect.setAttribute('y', drawStart.y);
            draftRect.setAttribute('width', 1);
            draftRect.setAttribute('height', 1);
            svg.setPointerCapture(event.pointerId);
            renderRegions();
            return;
        }
        var id = event.target.getAttribute('data-id');
        if (id) selectRegion(id);
    });
    $(svg).on('pointermove', function (event) {
        if (!drawing || !drawStart || !draftRect) return;
        var point = canvasPoint(event);
        var x = Math.min(point.x, drawStart.x);
        var y = Math.min(point.y, drawStart.y);
        draftRect.setAttribute('x', x);
        draftRect.setAttribute('y', y);
        draftRect.setAttribute('width', Math.abs(point.x - drawStart.x));
        draftRect.setAttribute('height', Math.abs(point.y - drawStart.y));
    });
    $(svg).on('pointerup', function (event) {
        if (!drawing || !drawStart) return;
        var point = canvasPoint(event);
        var bounds = { x: Math.min(point.x, drawStart.x), y: Math.min(point.y, drawStart.y), width: Math.abs(point.x - drawStart.x), height: Math.abs(point.y - drawStart.y) };
        if (bounds.width > 18 && bounds.height > 18) {
            var region = blankRegion(bounds);
            regions.push(region);
            stopDrawing();
            selectRegion(region.id);
            markDirty();
        } else {
            stopDrawing();
        }
    });

    $('#region-list').on('click', '.region-item', function () { selectRegion($(this).data('id')); });
    $('#region-name, #region-kind, #target-room, #door-unlocked').on('input change', updateSelected);
    $('#target-room-picker').on('click', '.logic-picker-toggle', function () {
        var picker = $(this).closest('.room-target-picker');
        var opening = !picker.hasClass('open');
        picker.toggleClass('open', opening);
        $(this).attr('aria-expanded', opening ? 'true' : 'false');
        if (opening) picker.find('.logic-picker-search input').val('').trigger('input').focus();
    }).on('input', '.logic-picker-search input', function () {
        var query = $(this).val().trim().toLowerCase();
        $(this).closest('.room-target-picker').find('.room-target-option[data-search]').each(function () {
            $(this).toggle(!query || String($(this).data('search')).indexOf(query) !== -1);
        });
    }).on('click', '.room-target-option:not(:disabled)', function () {
        var value = String($(this).data('value') || '');
        $('#target-room').val(value);
        renderTargetRoomPicker(value);
        updateSelected();
    }).on('click', function (event) { event.stopPropagation(); });
    $(document).on('click', function () { $('.room-target-picker.open').removeClass('open').find('.logic-picker-toggle').attr('aria-expanded', 'false'); });
    $('#door-gateway-exit').on('change', function () {
        var region = selected();
        if (!region || region.kind !== 'door' || !gateway.enabled) return;
        var regionId = String(region.id);
        gateway.exitRegionIds = gateway.exitRegionIds.filter(function (candidate) { return String(candidate) !== regionId; });
        if (this.checked) gateway.exitRegionIds.push(regionId);
        if (this.checked) $('#target-room').val('');
        updateSelected(); renderGatewaySettings();
    });
    $('#delete-region').on('click', function () {
        if (!selectedId || !window.confirm('Delete this clickable region?')) return;
        gateway.exitRegionIds = gateway.exitRegionIds.filter(function (candidate) { return String(candidate) !== String(selectedId); });
        regions = regions.filter(function (region) { return region.id !== selectedId; });
        selectedId = null;
        renderRegions(); fillInspector(); renderGatewaySettings(); markDirty();
    });

    $('.rail-tool[data-panel]').on('click', function () {
        var panel = $(this).data('panel');
        $('.rail-tool[data-panel]').removeClass('active');
        $(this).addClass('active');
        $('.editor-panel').removeClass('active');
        $('[data-panel-content="' + panel + '"]').addClass('active');
    });

    function markDirty() {
        $('#save-indicator').html('<i class="fa-solid fa-circle"></i> Unsaved changes').addClass('dirty');
    }
    $('#room-title, #room-slug, #room-description, #room-status, #gemini-prompt, #object-portable, #inventory-key').on('input change', markDirty);

    $('#room-gateway-enabled').on('change', function () {
        if (!roomClusterId && this.checked) {
            $(this).prop('checked', false);
            toast('Assign this room to a cluster from Map before enabling Gateway behavior.', true);
            return;
        }
        gateway.enabled = this.checked;
        if (!gateway.enabled) gateway.exitRegionIds = [];
        renderGatewaySettings(); fillInspector(); markDirty();
    });
    $('#room-gateway-count').on('input change', function () {
        gateway.destinationCount = Math.max(1, parseInt($(this).val(), 10) || 1);
        gatewayStatus(); markDirty();
    });
    $('#room-gateway-exits').on('change', '.room-gateway-exit-option', function () {
        var regionId = String($(this).val());
        gateway.exitRegionIds = gateway.exitRegionIds.filter(function (candidate) { return String(candidate) !== regionId; });
        if (this.checked) gateway.exitRegionIds.push(regionId);
        var region = regions.find(function (candidate) { return String(candidate.id) === regionId; });
        if (region && this.checked) { region.door.targetRoom = ''; region.door.connectionMode = 'gateway'; }
        if (region && !this.checked) region.door.connectionMode = 'static';
        renderGatewaySettings(); fillInspector(); markDirty();
    });
    $('#room-gateway-candidates').on('change', '.room-gateway-candidate-option', function () {
        var clusterId = String($(this).val());
        gateway.candidateClusterIds = gateway.candidateClusterIds.filter(function (candidate) { return String(candidate) !== clusterId; });
        if (this.checked) gateway.candidateClusterIds.push(clusterId);
        gatewayStatus(); markDirty();
    });

    function updatePortableFields() {
        $('#inventory-key-fields').toggle($('#object-portable').prop('checked'));
    }
    $('#object-portable').on('change', updatePortableFields);
    updatePortableFields();

    function roomPayload() {
        var payload = {
            id: room.id || 0,
            title: $('#room-title').val().trim(),
            slug: $('#room-slug').val().trim(),
            description: $('#room-description').val(),
            status: $('#room-status').val(),
            backgroundAsset: image.getAttribute('src'),
            backgroundPrompt: $('#gemini-prompt').val(),
            data: { version: 2, canvas: canvas, regions: regions }
        };
        if (isObject) {
            payload.portable = $('#object-portable').prop('checked');
            payload.inventoryKey = $('#inventory-key').val().trim();
        } else {
            payload.gateway = {
                enabled: !!gateway.enabled,
                destinationCount: Math.max(1, parseInt(gateway.destinationCount, 10) || 1),
                exitRegionIds: gateway.exitRegionIds.slice(),
                candidateClusterIds: gateway.candidateClusterIds.slice()
            };
        }
        return payload;
    }

    function saveRoom() {
        if (!isObject && gateway.enabled) {
            var required = Math.max(1, parseInt(gateway.destinationCount, 10) || 1);
            if (gateway.exitRegionIds.length < required || gateway.candidateClusterIds.length < required) {
                var validationError = new Error('This Gateway needs at least ' + required + ' selected Door / exit regions and ' + required + ' eligible clusters before it can be saved.');
                toast(validationError.message, true);
                return Promise.reject(validationError);
            }
        }
        $('#save-room').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Saving');
        return fetch(editor.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
            body: JSON.stringify(roomPayload())
        }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error || ('The ' + contentLabel + ' could not be saved.'));
            room.id = result.id;
            $('#room-slug').val(result.slug);
            if (isObject) {
                $('#room-slug').prop('readonly', true);
                if (result.inventoryKey) $('#inventory-key').val(result.inventoryKey);
            }
            history.replaceState({}, '', editor.editUrl + '?id=' + result.id);
            if (editor.debugUrl) $('#debug-link').attr('href', editor.debugUrl + '?id=' + result.id);
            $('#save-indicator').html('<i class="fa-regular fa-circle-check"></i> Saved just now').removeClass('dirty');
            toast((isObject ? 'Object' : 'Room') + ' saved');
            return result;
        }).catch(function (error) {
            toast(error.message, true);
            throw error;
        }).finally(function () {
            $('#save-room').prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> Save ' + contentLabel);
        });
    }
    $('#save-room').on('click', function () { saveRoom().catch(function () {}); });
    $('#preview-room').on('click', function () {
        saveRoom().then(function (result) { if (editor.debugUrl) window.location.href = editor.debugUrl + '?id=' + result.id; }).catch(function () {});
    });

    $('#asset-upload').on('change', function () {
        if (!this.files[0]) return;
        uploadAsset(this.files[0], function (url) {
            setBackground(url, true);
            toast((isObject ? 'Object image' : 'Background') + ' uploaded');
        }, $('.upload-drop'));
    });

    function generateOverlay(prompt) {
        var region = selected();
        if (!region) return Promise.reject(new Error('Select a region first.'));
        return fetch('api/gemini-generate-overlay.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
            body: JSON.stringify({
                prompt: prompt,
                backgroundAsset: image.getAttribute('src'),
                assetType: editor.assetType,
                canvas: canvas,
                bounds: region.bounds
            })
        }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error || 'The overlay could not be generated.');
            return result;
        });
    }

    function uploadAssetPromise(file, loadingElement) {
        var data = new FormData();
        data.append('asset', file);
        data.append('assetType', editor.assetType);
        data.append('csrf_token', window.NL_CSRF);
        loadingElement.addClass('loading');
        return fetch('api/upload-asset.php', { method: 'POST', body: data }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error);
            return result.url;
        }).finally(function () { loadingElement.removeClass('loading'); });
    }

    function uploadAsset(file, onSuccess, loadingElement) {
        uploadAssetPromise(file, loadingElement).then(onSuccess).catch(function (error) { toast(error.message, true); });
    }

    logicEditor = window.NLLogicEditor.create({
        root: '#region-logic-editor',
        isObject: isObject,
        objects: window.NL_EDITOR_OBJECTS || [],
        flags: window.NL_EDITOR_FLAGS || [],
        onChange: markDirty,
        notify: toast,
        uploadOverlay: uploadAssetPromise,
        generateOverlay: generateOverlay
    });

    function setBackground(url, updateDimensions) {
        image.onload = function () {
            if (updateDimensions && image.naturalWidth && image.naturalHeight) {
                var scaleX = image.naturalWidth / canvas.width;
                var scaleY = image.naturalHeight / canvas.height;
                regions.forEach(function (region) {
                    region.bounds.x *= scaleX;
                    region.bounds.y *= scaleY;
                    region.bounds.width *= scaleX;
                    region.bounds.height *= scaleY;
                });
                canvas = { width: image.naturalWidth, height: image.naturalHeight };
                svg.setAttribute('viewBox', '0 0 ' + canvas.width + ' ' + canvas.height);
                roomCanvas.style.aspectRatio = canvas.width + ' / ' + canvas.height;
                renderRegions();
                fillInspector();
                applyZoom();
            }
            markDirty();
        };
        image.src = url;
    }

    function applyCroppedBackground(url, width, height, cropBounds) {
        var scaleX = width / cropBounds.width;
        var scaleY = height / cropBounds.height;
        var right = cropBounds.x + cropBounds.width;
        var bottom = cropBounds.y + cropBounds.height;
        var keptRegions = [];
        regions.forEach(function (region) {
            var regionRight = region.bounds.x + region.bounds.width;
            var regionBottom = region.bounds.y + region.bounds.height;
            var left = Math.max(region.bounds.x, cropBounds.x);
            var top = Math.max(region.bounds.y, cropBounds.y);
            var clippedRight = Math.min(regionRight, right);
            var clippedBottom = Math.min(regionBottom, bottom);
            if (clippedRight <= left || clippedBottom <= top) return;
            region.bounds = {
                x: (left - cropBounds.x) * scaleX,
                y: (top - cropBounds.y) * scaleY,
                width: (clippedRight - left) * scaleX,
                height: (clippedBottom - top) * scaleY
            };
            keptRegions.push(region);
        });
        regions = keptRegions;
        if (selectedId && !selected()) selectedId = null;
        canvas = { width: width, height: height };
        image.onload = function () {
            svg.setAttribute('viewBox', '0 0 ' + canvas.width + ' ' + canvas.height);
            roomCanvas.style.aspectRatio = canvas.width + ' / ' + canvas.height;
            renderRegions();
            fillInspector();
            applyZoom();
            markDirty();
        };
        image.src = url;
    }

    function updatePromptCount() { $('#prompt-count').text($('#gemini-prompt').val().length + ' / 2000'); }
    $('#gemini-prompt').on('input', updatePromptCount); updatePromptCount();
    $('#generate-image').on('click', function () {
        var prompt = $('#gemini-prompt').val().trim();
        var button = $(this);
        var generationPayload = { prompt: prompt, assetType: editor.assetType };
        if (isObject && window.NL_OBJECT_REFERENCE) generationPayload.reference = window.NL_OBJECT_REFERENCE;
        button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Building the ' + contentLabel + '…');
        $('#generation-status').text(window.NL_OBJECT_REFERENCE ? 'Gemini is using the selected reference crop. Generation may take a minute.' : 'Gemini image generation may take a minute.').addClass('visible');
        fetch('api/gemini-generate.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
            body: JSON.stringify(generationPayload)
        }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error);
            setBackground(result.url, true);
            $('#generation-status').text('New image ready at ' + result.width + ' × ' + result.height + ' pixels · ' + formatFileSize(result.bytes) + (result.referenceUsed ? ' · reference crop applied' : '') + '. Save the ' + contentLabel + ' to keep this selection.');
            toast('Gemini ' + (isObject ? 'object image' : 'background') + ' created');
        }).catch(function (error) {
            $('#generation-status').text(error.message);
            toast(error.message, true);
        }).finally(function () { button.prop('disabled', false).html('<i class="fa-solid fa-sparkles"></i> Generate ' + (isObject ? 'object image' : 'background')); });
    });

    $('#delete-room').on('click', function () {
        if (!room.id || !window.confirm('Delete this ' + contentLabel + ' and its region configuration? This cannot be undone.')) return;
        fetch(editor.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
            body: JSON.stringify({ action: 'delete', id: room.id })
        }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error || ('The ' + contentLabel + ' could not be deleted.'));
            window.location.href = editor.listUrl;
        }).catch(function (error) { toast(error.message, true); });
    });

    function applyZoom() {
        var stageStyle = window.getComputedStyle(canvasStage);
        var availableWidth = canvasStage.clientWidth - parseFloat(stageStyle.paddingLeft) - parseFloat(stageStyle.paddingRight);
        var availableHeight = canvasStage.clientHeight - parseFloat(stageStyle.paddingTop) - parseFloat(stageStyle.paddingBottom);
        if (availableWidth <= 0 || availableHeight <= 0) return;

        var fitScale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height, 1);
        roomCanvas.style.width = Math.floor(canvas.width * fitScale * zoom) + 'px';
        roomCanvas.style.height = Math.floor(canvas.height * fitScale * zoom) + 'px';
        $('#zoom-label').text(zoom === 1 ? 'Fit' : Math.round(zoom * 100) + '%');
    }
    function scheduleZoom() {
        if (zoomFrame !== null) window.cancelAnimationFrame(zoomFrame);
        zoomFrame = window.requestAnimationFrame(function () {
            zoomFrame = null;
            applyZoom();
        });
    }
    $('#zoom-in').on('click', function () { zoom = Math.min(2, zoom + 0.15); applyZoom(); });
    $('#zoom-out').on('click', function () { zoom = Math.max(0.55, zoom - 0.15); applyZoom(); });

    function toast(message, error) {
        $('#toast').text(message).toggleClass('error', !!error).addClass('visible');
        window.setTimeout(function () { $('#toast').removeClass('visible'); }, 3200);
    }

    if (isObject) {
        window.NLObjectEditorBridge = {
            getBackgroundAsset: function () { return image.getAttribute('src'); },
            getCanvas: function () { return { width: canvas.width, height: canvas.height }; },
            getRegionCount: function () { return regions.length; },
            applyCrop: applyCroppedBackground,
            toast: toast
        };
    }
    window.NLImageAreaEditorBridge = {
        assetType: editor.assetType,
        getBackgroundAsset: function () { return image.getAttribute('src'); },
        getCanvas: function () { return { width: canvas.width, height: canvas.height }; },
        applyBackground: function (url) { setBackground(url, true); },
        toast: toast
    };

    svg.setAttribute('viewBox', '0 0 ' + canvas.width + ' ' + canvas.height);
    roomCanvas.style.aspectRatio = canvas.width + ' / ' + canvas.height;
    renderRegions();
    fillInspector();
    renderGatewaySettings();
    applyZoom();
    image.addEventListener('load', scheduleZoom);
    window.addEventListener('load', scheduleZoom);
    scheduleZoom();
    if (window.ResizeObserver) {
        new ResizeObserver(scheduleZoom).observe(canvasStage);
    } else {
        window.addEventListener('resize', scheduleZoom);
    }
})(jQuery);
