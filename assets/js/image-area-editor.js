(function ($) {
    'use strict';

    var bridge = window.NLImageAreaEditorBridge;
    if (!bridge) return;

    var workspace = document.getElementById('image-edit-workspace');
    var selectionCanvas = document.getElementById('image-edit-selection-canvas');
    var previewImage = document.getElementById('image-edit-preview');
    var selectionLayer = document.getElementById('image-edit-selection-layer');
    var sourceUrl = '';
    var dimensions = null;
    var selection = null;
    var selectionStart = null;
    var candidate = null;
    var showingOriginal = false;
    var generationId = 0;

    function setOpen(open) {
        workspace.hidden = !open;
        document.body.classList.toggle('image-workspace-open', open);
    }

    function fitCanvas() {
        if (!dimensions) return;
        var stage = selectionCanvas.closest('.image-selection-stage');
        if (!stage || !stage.clientWidth || !stage.clientHeight) return;
        var style = window.getComputedStyle(stage);
        var availableWidth = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        var availableHeight = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        var scale = Math.min(availableWidth / dimensions.width, availableHeight / dimensions.height, 1);
        selectionCanvas.style.width = Math.floor(dimensions.width * scale) + 'px';
        selectionCanvas.style.height = Math.floor(dimensions.height * scale) + 'px';
        selectionCanvas.style.aspectRatio = dimensions.width + ' / ' + dimensions.height;
    }

    function point(event) {
        var rect = selectionLayer.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(dimensions.width, (event.clientX - rect.left) / rect.width * dimensions.width)),
            y: Math.max(0, Math.min(dimensions.height, (event.clientY - rect.top) / rect.height * dimensions.height))
        };
    }

    function boundsBetween(first, second) {
        return { x: Math.min(first.x, second.x), y: Math.min(first.y, second.y), width: Math.abs(second.x - first.x), height: Math.abs(second.y - first.y) };
    }

    function renderSelection() {
        selectionLayer.innerHTML = '';
        if (!selection) {
            $('#image-edit-selection-status').text('No area selected');
            $('#image-edit-footer-status').text('Select an image area to begin.');
            return;
        }
        var shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        Object.keys(selection).forEach(function (key) { shape.setAttribute(key, selection[key]); });
        shape.setAttribute('class', 'image-selection-shape');
        selectionLayer.appendChild(shape);
        var summary = Math.round(selection.width) + ' × ' + Math.round(selection.height) + ' pixels selected';
        $('#image-edit-selection-status').text(summary);
        $('#image-edit-footer-status').text(summary + '. Describe the change and generate a preview.');
    }

    function clearCandidate(discard) {
        if (discard && candidate && bridge.discardTemporaryAsset) bridge.discardTemporaryAsset(candidate.url);
        candidate = null;
        showingOriginal = false;
        previewImage.src = sourceUrl;
        selectionLayer.hidden = false;
        $('#toggle-image-area-original, #image-edit-review-note').prop('hidden', true);
        $('#apply-image-area-edit').prop('disabled', true);
        $('#image-edit-generation-status').removeClass('visible').empty();
    }

    function resetEditor(clearPrompt, discardCandidate) {
        generationId += 1;
        selection = null;
        selectionStart = null;
        clearCandidate(discardCandidate !== false);
        if (clearPrompt) $('#image-edit-prompt').val('').trigger('input');
        $('#generate-image-area-edit').prop('disabled', false).html('<i class="fa-solid fa-sparkles"></i> Generate preview');
        renderSelection();
    }

    function setupSource() {
        previewImage.onload = null;
        dimensions = bridge.getCanvas();
        selectionLayer.setAttribute('viewBox', '0 0 ' + dimensions.width + ' ' + dimensions.height);
        fitCanvas();
        renderSelection();
    }

    $('#open-image-area-edit').on('click', function () {
        sourceUrl = bridge.getBackgroundAsset();
        if (!/\.(png|jpe?g|webp)(?:\?|$)/i.test(sourceUrl)) {
            bridge.toast('Upload or generate a PNG, JPG, or WebP image before editing an area.', true);
            return;
        }
        dimensions = bridge.getCanvas();
        resetEditor(true);
        setOpen(true);
        previewImage.onload = setupSource;
        previewImage.src = sourceUrl;
        if (previewImage.complete && previewImage.naturalWidth) window.setTimeout(setupSource, 0);
    });

    $(selectionLayer).on('pointerdown', function (event) {
        if (!dimensions) return;
        event.preventDefault();
        if (candidate) clearCandidate(true);
        selectionStart = point(event.originalEvent);
        selection = { x: selectionStart.x, y: selectionStart.y, width: 1, height: 1 };
        selectionLayer.setPointerCapture(event.originalEvent.pointerId);
        renderSelection();
    }).on('pointermove', function (event) {
        if (!selectionStart) return;
        selection = boundsBetween(selectionStart, point(event.originalEvent));
        renderSelection();
    }).on('pointerup', function (event) {
        if (!selectionStart) return;
        selection = boundsBetween(selectionStart, point(event.originalEvent));
        selectionStart = null;
        if (selection.width < 2 || selection.height < 2) selection = null;
        renderSelection();
    });

    $('#image-edit-prompt').on('input', function () {
        $('#image-edit-prompt-count').text($(this).val().length + ' / 2000');
    });

    $('#generate-image-area-edit').on('click', function () {
        var prompt = $('#image-edit-prompt').val().trim();
        if (!selection || selection.width < 2 || selection.height < 2) return bridge.toast('Drag a rectangle around the detail to edit first.', true);
        if (prompt.length < 3) return bridge.toast('Describe the image change first.', true);
        var button = $(this);
        var requestId = ++generationId;
        button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Editing selected area…');
        $('#image-edit-generation-status').text('Gemini is editing the selected crop and rebuilding a full-image preview. This may take a minute.').addClass('visible');
        fetch('api/gemini-edit-background-region.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
            body: JSON.stringify({ prompt: prompt, backgroundAsset: sourceUrl, assetType: bridge.assetType, canvas: dimensions, bounds: selection })
        }).then(function (response) { return response.json(); }).then(function (result) {
            if (requestId !== generationId) {
                if (result.ok && bridge.trackTemporaryAsset && bridge.discardTemporaryAsset) {
                    bridge.trackTemporaryAsset(result.url);
                    bridge.discardTemporaryAsset(result.url);
                }
                return;
            }
            if (!result.ok) throw new Error(result.error || 'The image area could not be edited.');
            if (bridge.trackTemporaryAsset) bridge.trackTemporaryAsset(result.url);
            candidate = result;
            showingOriginal = false;
            previewImage.src = result.url;
            selectionLayer.hidden = true;
            $('#toggle-image-area-original, #image-edit-review-note').prop('hidden', false);
            $('#toggle-image-area-original').html('<i class="fa-solid fa-images"></i> View original');
            $('#apply-image-area-edit').prop('disabled', false);
            $('#image-edit-generation-status').text('Edited full-image preview ready at ' + result.width + ' × ' + result.height + ' pixels.').addClass('visible');
            $('#image-edit-footer-status').text('Review the edited image. Apply it to the draft or cancel to keep the current background.');
        }).catch(function (error) {
            if (requestId !== generationId) return;
            $('#image-edit-generation-status').text(error.message).addClass('visible');
            bridge.toast(error.message, true);
        }).finally(function () {
            if (requestId === generationId) button.prop('disabled', false).html('<i class="fa-solid fa-sparkles"></i> Generate preview');
        });
    });

    $('#toggle-image-area-original').on('click', function () {
        if (!candidate) return;
        showingOriginal = !showingOriginal;
        previewImage.src = showingOriginal ? sourceUrl : candidate.url;
        $(this).html('<i class="fa-solid fa-images"></i> ' + (showingOriginal ? 'View edited' : 'View original'));
    });

    $('#reset-image-area-edit').on('click', function () { resetEditor(false); });
    $('[data-cancel-image-edit]').on('click', function () { setOpen(false); resetEditor(true); });
    $('#apply-image-area-edit').on('click', function () {
        if (!candidate) return;
        var appliedCandidate = candidate;
        candidate = null;
        bridge.applyBackground(appliedCandidate.url, appliedCandidate.width, appliedCandidate.height);
        setOpen(false);
        bridge.toast('Edited image applied to the draft. Save to keep it.');
        resetEditor(true, false);
    });
    $(document).on('keydown', function (event) {
        if (event.key === 'Escape' && !workspace.hidden) {
            setOpen(false);
            resetEditor(true);
        }
    });
    if (window.ResizeObserver) new ResizeObserver(fitCanvas).observe(workspace);
}(jQuery));
