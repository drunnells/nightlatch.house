(function ($) {
    'use strict';

    var room = window.NL_ROOM_BOOTSTRAP;
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

    function uid() {
        return 'region-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    }

    function blankRegion(bounds) {
        return {
            id: uid(),
            name: 'New region',
            kind: 'interaction',
            bounds: bounds,
            condition: { source: 'always', key: '', operator: 'equals', value: '' },
            success: { message: '', overlay: '', overlayPrompt: '', setFlag: { key: '', value: '' }, grantItem: '', unlockDoor: false },
            failure: { message: '' },
            door: { targetRoom: '', unlocked: false }
        };
    }

    function normalizeRegion(region) {
        var fresh = blankRegion(region.bounds || { x: 100, y: 100, width: 220, height: 160 });
        fresh.id = region.id || fresh.id;
        fresh.name = region.name || fresh.name;
        fresh.kind = region.kind || fresh.kind;
        fresh.bounds = $.extend({}, fresh.bounds, region.bounds || {});
        fresh.condition = $.extend({}, fresh.condition, region.condition || {});
        fresh.success = $.extend({}, fresh.success, region.success || {});
        fresh.success.setFlag = $.extend({}, { key: '', value: '' }, fresh.success.setFlag || {});
        fresh.failure = $.extend({}, fresh.failure, region.failure || {});
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
        $('#condition-source').val(region.condition.source);
        $('#condition-key').val(region.condition.key);
        $('#condition-operator').val(region.condition.operator);
        $('#condition-value').val(region.condition.value);
        $('#success-message').val(region.success.message);
        $('#overlay-asset').val(region.success.overlay);
        $('#overlay-prompt').val(region.success.overlayPrompt || '');
        updateOverlayPromptCount();
        updateOverlayPreview(region.success.overlay);
        $('#set-flag-key').val(region.success.setFlag.key);
        $('#set-flag-value').val(region.success.setFlag.value);
        $('#grant-item').val(region.success.grantItem);
        $('#unlock-door').prop('checked', !!region.success.unlockDoor);
        $('#failure-message').val(region.failure.message);
        $('#target-room').val(region.door.targetRoom);
        $('#door-unlocked').prop('checked', !!region.door.unlocked);
        $('#door-fields').toggle(region.kind === 'door');
        $('#unlock-door-row').toggle(region.kind === 'door');
        $('#condition-key, #condition-operator, #condition-value').prop('disabled', region.condition.source === 'always');
        $('#region-bounds').text('x ' + Math.round(region.bounds.x) + ' · y ' + Math.round(region.bounds.y) + ' · w ' + Math.round(region.bounds.width) + ' · h ' + Math.round(region.bounds.height));
        fieldLock = false;
    }

    function updateSelected() {
        if (fieldLock) return;
        var region = selected();
        if (!region) return;
        region.name = $('#region-name').val().trim() || 'Untitled region';
        region.kind = $('#region-kind').val();
        region.condition = { source: $('#condition-source').val(), key: $('#condition-key').val().trim(), operator: $('#condition-operator').val(), value: $('#condition-value').val() };
        region.success = {
            message: $('#success-message').val(),
            overlay: $('#overlay-asset').val().trim(),
            overlayPrompt: $('#overlay-prompt').val(),
            setFlag: { key: $('#set-flag-key').val().trim(), value: $('#set-flag-value').val() },
            grantItem: $('#grant-item').val().trim(),
            unlockDoor: $('#unlock-door').prop('checked')
        };
        region.failure = { message: $('#failure-message').val() };
        region.door = { targetRoom: $('#target-room').val().trim(), unlocked: $('#door-unlocked').prop('checked') };
        $('#inspector-title').text(region.name);
        $('#door-fields').toggle(region.kind === 'door');
        $('#unlock-door-row').toggle(region.kind === 'door');
        $('#condition-key, #condition-operator, #condition-value').prop('disabled', region.condition.source === 'always');
        markDirty();
        renderRegions();
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
    $('#inspector-content').on('input change', 'input, textarea, select', updateSelected);
    $('#delete-region').on('click', function () {
        if (!selectedId || !window.confirm('Delete this clickable region?')) return;
        regions = regions.filter(function (region) { return region.id !== selectedId; });
        selectedId = null;
        renderRegions(); fillInspector(); markDirty();
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
    $('#room-title, #room-slug, #room-description, #room-status, #gemini-prompt').on('input change', markDirty);

    function roomPayload() {
        return {
            id: room.id || 0,
            title: $('#room-title').val().trim(),
            slug: $('#room-slug').val().trim(),
            description: $('#room-description').val(),
            status: $('#room-status').val(),
            backgroundAsset: image.getAttribute('src'),
            backgroundPrompt: $('#gemini-prompt').val(),
            data: { version: 1, canvas: canvas, regions: regions }
        };
    }

    function saveRoom() {
        $('#save-room').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Saving');
        return fetch('api/rooms.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
            body: JSON.stringify(roomPayload())
        }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error || 'Room could not be saved.');
            room.id = result.id;
            $('#room-slug').val(result.slug);
            history.replaceState({}, '', 'room-edit.php?id=' + result.id);
            $('#debug-link').attr('href', 'play-debug.php?id=' + result.id);
            $('#save-indicator').html('<i class="fa-regular fa-circle-check"></i> Saved just now').removeClass('dirty');
            toast('Room saved');
            return result;
        }).catch(function (error) {
            toast(error.message, true);
            throw error;
        }).finally(function () {
            $('#save-room').prop('disabled', false).html('<i class="fa-solid fa-floppy-disk"></i> Save room');
        });
    }
    $('#save-room').on('click', saveRoom);
    $('#preview-room').on('click', function () {
        saveRoom().then(function (result) { window.location.href = 'play-debug.php?id=' + result.id; }).catch(function () {});
    });

    $('#asset-upload').on('change', function () {
        if (!this.files[0]) return;
        uploadAsset(this.files[0], function (url) {
            setBackground(url, true);
            toast('Background uploaded');
        }, $('.upload-drop'));
    });

    $('#overlay-upload').on('change', function () {
        if (!this.files[0]) return;
        uploadAsset(this.files[0], function (url) {
            $('#overlay-asset').val(url).trigger('input');
            toast('Overlay uploaded');
        }, $('.mini-upload'));
    });

    $('#toggle-overlay-generator').on('click', function () {
        var expanded = !$('#overlay-generator').hasClass('visible');
        $('#overlay-generator').toggleClass('visible', expanded);
        $(this).attr('aria-expanded', expanded ? 'true' : 'false');
    });

    function updateOverlayPromptCount() {
        $('#overlay-prompt-count').text($('#overlay-prompt').val().length + ' / 2000');
    }

    function updateOverlayPreview(url) {
        var preview = $('#overlay-preview');
        if (url) {
            preview.attr('src', url).addClass('visible');
        } else {
            preview.removeAttr('src').removeClass('visible');
        }
    }

    $('#overlay-prompt').on('input', updateOverlayPromptCount);
    $('#overlay-asset').on('input', function () { updateOverlayPreview($(this).val().trim()); });
    $('#generate-overlay').on('click', function () {
        updateSelected();
        var region = selected();
        var prompt = $('#overlay-prompt').val().trim();
        if (!region) {
            toast('Select a region first.', true);
            return;
        }
        if (prompt.length < 3) {
            toast('Describe the overlay change first.', true);
            return;
        }

        var button = $(this);
        button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Editing region…');
        $('#overlay-generation-status').text('Preparing the selected crop and sending it to Gemini. This may take a minute.').addClass('visible');
        fetch('api/gemini-generate-overlay.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
            body: JSON.stringify({
                prompt: prompt,
                backgroundAsset: image.getAttribute('src'),
                canvas: canvas,
                bounds: region.bounds
            })
        }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error || 'The overlay could not be generated.');
            region.success.overlay = result.url;
            region.success.overlayPrompt = prompt;
            if (selectedId === region.id) {
                fieldLock = true;
                $('#overlay-asset').val(result.url);
                updateOverlayPreview(result.url);
                fieldLock = false;
            }
            markDirty();
            $('#overlay-generation-status').text('Overlay ready at ' + result.width + ' × ' + result.height + ' pixels · ' + formatFileSize(result.bytes) + '. Save the room to keep it.');
            toast('Gemini region overlay created');
        }).catch(function (error) {
            $('#overlay-generation-status').text(error.message);
            toast(error.message, true);
        }).finally(function () {
            button.prop('disabled', false).html('<i class="fa-solid fa-sparkles"></i> Generate region overlay');
        });
    });

    function uploadAsset(file, onSuccess, loadingElement) {
        var data = new FormData();
        data.append('asset', file);
        data.append('csrf_token', window.NL_CSRF);
        loadingElement.addClass('loading');
        fetch('api/upload-asset.php', { method: 'POST', body: data }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error);
            onSuccess(result.url);
        }).catch(function (error) { toast(error.message, true); }).finally(function () { loadingElement.removeClass('loading'); });
    }

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

    function updatePromptCount() { $('#prompt-count').text($('#gemini-prompt').val().length + ' / 2000'); }
    $('#gemini-prompt').on('input', updatePromptCount); updatePromptCount();
    $('#generate-image').on('click', function () {
        var prompt = $('#gemini-prompt').val().trim();
        var button = $(this);
        button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Building the room…');
        $('#generation-status').text('Gemini image generation may take a minute.').addClass('visible');
        fetch('api/gemini-generate.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
            body: JSON.stringify({ prompt: prompt })
        }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error);
            setBackground(result.url, true);
            $('#generation-status').text('New background ready at ' + result.width + ' × ' + result.height + ' pixels · ' + formatFileSize(result.bytes) + '. Save the room to keep this selection.');
            toast('Gemini background created');
        }).catch(function (error) {
            $('#generation-status').text(error.message);
            toast(error.message, true);
        }).finally(function () { button.prop('disabled', false).html('<i class="fa-solid fa-sparkles"></i> Generate background'); });
    });

    $('#delete-room').on('click', function () {
        if (!room.id || !window.confirm('Delete this room and its region configuration? This cannot be undone.')) return;
        fetch('api/rooms.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
            body: JSON.stringify({ action: 'delete', id: room.id })
        }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error || 'Room could not be deleted.');
            window.location.href = 'index.php';
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
    $('#zoom-in').on('click', function () { zoom = Math.min(2, zoom + 0.15); applyZoom(); });
    $('#zoom-out').on('click', function () { zoom = Math.max(0.55, zoom - 0.15); applyZoom(); });

    function toast(message, error) {
        $('#toast').text(message).toggleClass('error', !!error).addClass('visible');
        window.setTimeout(function () { $('#toast').removeClass('visible'); }, 3200);
    }

    svg.setAttribute('viewBox', '0 0 ' + canvas.width + ' ' + canvas.height);
    roomCanvas.style.aspectRatio = canvas.width + ' / ' + canvas.height;
    renderRegions();
    fillInspector();
    applyZoom();
    if (window.ResizeObserver) {
        new ResizeObserver(applyZoom).observe(canvasStage);
    } else {
        window.addEventListener('resize', applyZoom);
    }
})(jQuery);
