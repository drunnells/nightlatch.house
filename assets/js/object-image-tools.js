(function ($) {
    'use strict';

    var bridge = window.NLObjectEditorBridge;
    if (!bridge) return;

    var cropMode = 'rectangle';
    var cropSelection = null;
    var cropStart = null;
    var cropPoints = [];
    var cropClosed = false;
    var cropCanvas = document.getElementById('object-crop-canvas');
    var cropImage = document.getElementById('object-crop-image');
    var cropLayer = document.getElementById('object-crop-layer');
    var referenceCanvas = document.getElementById('reference-selection-canvas');
    var referenceImage = document.getElementById('reference-selection-image');
    var referenceLayer = document.getElementById('reference-selection-layer');
    var referenceAssets = null;
    var selectedReferenceAsset = null;
    var referenceDimensions = null;
    var referenceBounds = null;
    var referenceStart = null;

    function esc(value) { return $('<div>').text(value || '').html(); }

    function setWorkspaceOpen(id, open) {
        document.getElementById(id).hidden = !open;
        document.body.classList.toggle('image-workspace-open', open);
    }

    function fitSelectionCanvas(element, width, height) {
        var stage = element.closest('.image-selection-stage');
        if (!stage || !stage.clientWidth || !stage.clientHeight) return;
        var style = window.getComputedStyle(stage);
        var availableWidth = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        var availableHeight = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        var scale = Math.min(availableWidth / width, availableHeight / height, 1);
        element.style.width = Math.floor(width * scale) + 'px';
        element.style.height = Math.floor(height * scale) + 'px';
        element.style.aspectRatio = width + ' / ' + height;
    }

    function svgPoint(event, layer, dimensions) {
        var rect = layer.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(dimensions.width, (event.clientX - rect.left) / rect.width * dimensions.width)),
            y: Math.max(0, Math.min(dimensions.height, (event.clientY - rect.top) / rect.height * dimensions.height))
        };
    }

    function addSvgShape(layer, name, attributes, className) {
        var shape = document.createElementNS('http://www.w3.org/2000/svg', name);
        Object.keys(attributes).forEach(function (key) { shape.setAttribute(key, attributes[key]); });
        if (className) shape.setAttribute('class', className);
        layer.appendChild(shape);
        return shape;
    }

    function rectangleFromPoints(start, end) {
        return {
            x: Math.min(start.x, end.x),
            y: Math.min(start.y, end.y),
            width: Math.abs(end.x - start.x),
            height: Math.abs(end.y - start.y)
        };
    }

    function selectionBounds(selection) {
        if (selection.mode === 'rectangle') return selection.bounds;
        var xs = selection.points.map(function (point) { return point.x; });
        var ys = selection.points.map(function (point) { return point.y; });
        var left = Math.min.apply(Math, xs);
        var top = Math.min.apply(Math, ys);
        return { x: left, y: top, width: Math.max.apply(Math, xs) - left, height: Math.max.apply(Math, ys) - top };
    }

    function renderCropSelection() {
        cropLayer.innerHTML = '';
        if (cropMode === 'rectangle' && cropSelection) {
            addSvgShape(cropLayer, 'rect', cropSelection.bounds, 'image-selection-shape');
            $('#crop-selection-status').text(Math.round(cropSelection.bounds.width) + ' × ' + Math.round(cropSelection.bounds.height) + ' selected');
        } else if (cropMode === 'lasso' && cropPoints.length) {
            var points = cropPoints.map(function (point) { return point.x + ',' + point.y; }).join(' ');
            addSvgShape(cropLayer, cropClosed ? 'polygon' : 'polyline', { points: points }, 'image-selection-shape lasso' + (cropClosed ? ' closed' : ''));
            cropPoints.forEach(function (point, index) {
                addSvgShape(cropLayer, 'circle', { cx: point.x, cy: point.y, r: Math.max(4, bridge.getCanvas().width / 220) }, 'lasso-point' + (index === 0 ? ' first' : ''));
            });
            $('#crop-selection-status').text(cropClosed ? cropPoints.length + ' point lasso ready' : cropPoints.length + ' points · close the shape when finished');
        } else {
            $('#crop-selection-status').text('No selection yet');
        }
        $('#close-lasso').prop('hidden', cropMode !== 'lasso' || cropPoints.length < 3 || cropClosed);
    }

    function resetCropSelection() {
        cropSelection = null;
        cropStart = null;
        cropPoints = [];
        cropClosed = false;
        renderCropSelection();
    }

    function setupCropImage() {
        var dimensions = bridge.getCanvas();
        cropLayer.setAttribute('viewBox', '0 0 ' + dimensions.width + ' ' + dimensions.height);
        fitSelectionCanvas(cropCanvas, dimensions.width, dimensions.height);
    }

    $('#open-object-crop').on('click', function () {
        var asset = bridge.getBackgroundAsset();
        if (!/\.(png|jpe?g|webp)(?:\?|$)/i.test(asset)) {
            bridge.toast('Upload or generate a PNG, JPG, or WebP object image before cropping.', true);
            return;
        }
        resetCropSelection();
        setWorkspaceOpen('object-crop-workspace', true);
        cropImage.onload = setupCropImage;
        cropImage.src = asset;
        if (cropImage.complete && cropImage.naturalWidth) window.setTimeout(setupCropImage, 0);
    });

    $('[data-close-image-workspace]').on('click', function () { setWorkspaceOpen('object-crop-workspace', false); });
    $('[data-crop-mode]').on('click', function () {
        cropMode = $(this).data('crop-mode');
        $('[data-crop-mode]').removeClass('active');
        $(this).addClass('active');
        $('#crop-instruction').text(cropMode === 'rectangle' ? 'Drag a rectangle tightly around the object.' : 'Click around the object edge, then click the first point or use Close shape.');
        resetCropSelection();
    });
    $('#reset-object-crop').on('click', resetCropSelection);
    $('#close-lasso').on('click', function () {
        if (cropPoints.length < 3) return;
        cropClosed = true;
        cropSelection = { mode: 'lasso', points: cropPoints.slice() };
        renderCropSelection();
    });

    $(cropLayer).on('pointerdown', function (event) {
        if (cropMode !== 'rectangle') return;
        event.preventDefault();
        cropStart = svgPoint(event.originalEvent, cropLayer, bridge.getCanvas());
        cropSelection = { mode: 'rectangle', bounds: { x: cropStart.x, y: cropStart.y, width: 1, height: 1 } };
        cropLayer.setPointerCapture(event.originalEvent.pointerId);
        renderCropSelection();
    }).on('pointermove', function (event) {
        if (cropMode !== 'rectangle' || !cropStart) return;
        cropSelection.bounds = rectangleFromPoints(cropStart, svgPoint(event.originalEvent, cropLayer, bridge.getCanvas()));
        renderCropSelection();
    }).on('pointerup', function (event) {
        if (cropMode !== 'rectangle' || !cropStart) return;
        cropSelection.bounds = rectangleFromPoints(cropStart, svgPoint(event.originalEvent, cropLayer, bridge.getCanvas()));
        cropStart = null;
        if (cropSelection.bounds.width < 2 || cropSelection.bounds.height < 2) cropSelection = null;
        renderCropSelection();
    }).on('click', function (event) {
        if (cropMode !== 'lasso' || cropClosed) return;
        var point = svgPoint(event.originalEvent, cropLayer, bridge.getCanvas());
        if (cropPoints.length >= 3) {
            var first = cropPoints[0];
            var dimensions = bridge.getCanvas();
            var closeDistance = Math.max(dimensions.width, dimensions.height) / 60;
            if (Math.sqrt(Math.pow(point.x - first.x, 2) + Math.pow(point.y - first.y, 2)) <= closeDistance) {
                cropClosed = true;
                cropSelection = { mode: 'lasso', points: cropPoints.slice() };
                renderCropSelection();
                return;
            }
        }
        if (cropPoints.length >= 200) {
            bridge.toast('The lasso is limited to 200 points. Close the shape to continue.', true);
            return;
        }
        cropPoints.push(point);
        renderCropSelection();
    });

    $('#apply-object-crop').on('click', function () {
        if (!cropSelection || (cropSelection.mode === 'lasso' && !cropClosed)) {
            bridge.toast(cropMode === 'lasso' ? 'Close the lasso shape first.' : 'Draw a crop selection first.', true);
            return;
        }
        var bounds = selectionBounds(cropSelection);
        if (bounds.width < 2 || bounds.height < 2) {
            bridge.toast('The crop selection is too small.', true);
            return;
        }
        if (bridge.getRegionCount() && !window.confirm('Cropping will transform regions inside the crop and remove regions outside it. Continue?')) return;
        var button = $(this);
        button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Cropping…');
        fetch('api/crop-object.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
            body: JSON.stringify({
                backgroundAsset: bridge.getBackgroundAsset(),
                canvas: bridge.getCanvas(),
                selection: cropSelection
            })
        }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error || 'The object could not be cropped.');
            bridge.applyCrop(result.url, result.width, result.height, bounds);
            setWorkspaceOpen('object-crop-workspace', false);
            bridge.toast('Cropped object image ready');
        }).catch(function (error) {
            bridge.toast(error.message, true);
        }).finally(function () {
            button.prop('disabled', false).html('<i class="fa-solid fa-crop-simple"></i> Use cropped object');
        });
    });

    function renderAssetLibrary() {
        var query = $('#asset-search').val().trim().toLowerCase();
        var matches = (referenceAssets || []).filter(function (asset) {
            return !query || (asset.title + ' ' + asset.slug + ' ' + asset.assetType).toLowerCase().indexOf(query) !== -1;
        });
        $('#asset-search-count').text(matches.length + ' image' + (matches.length === 1 ? '' : 's'));
        if (!matches.length) {
            $('#asset-thumbnail-grid').html('<div class="asset-library-empty"><i class="fa-regular fa-image"></i><p>No matching saved raster images.</p></div>');
            return;
        }
        var html = '';
        matches.forEach(function (asset) {
            html += '<button type="button" class="asset-thumbnail" data-asset-type="' + esc(asset.assetType) + '" data-asset-slug="' + esc(asset.slug) + '"><span><img src="' + esc(asset.backgroundAsset) + '" alt=""></span><strong>' + esc(asset.title) + '</strong><small>' + esc(asset.assetType === 'rooms' ? 'Room' : 'Object') + ' · ' + esc(asset.slug) + '</small></button>';
        });
        $('#asset-thumbnail-grid').html(html);
    }

    function loadAssets() {
        if (referenceAssets) {
            renderAssetLibrary();
            return;
        }
        $('#asset-thumbnail-grid').html('<p class="asset-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading saved images…</p>');
        fetch('api/image-assets.php', { headers: { 'Accept': 'application/json' } }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error || 'Saved images could not be loaded.');
            referenceAssets = result.assets || [];
            renderAssetLibrary();
        }).catch(function (error) {
            $('#asset-thumbnail-grid').html('<div class="asset-library-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>' + esc(error.message) + '</p></div>');
        });
    }

    function setupReferenceImage() {
        referenceDimensions = { width: referenceImage.naturalWidth, height: referenceImage.naturalHeight };
        referenceLayer.setAttribute('viewBox', '0 0 ' + referenceDimensions.width + ' ' + referenceDimensions.height);
        fitSelectionCanvas(referenceCanvas, referenceDimensions.width, referenceDimensions.height);
        referenceBounds = null;
        renderReferenceSelection();
    }

    function renderReferenceSelection() {
        referenceLayer.innerHTML = '';
        if (!referenceBounds) {
            $('#reference-selection-status').text('No area selected');
            return;
        }
        addSvgShape(referenceLayer, 'rect', referenceBounds, 'image-selection-shape');
        $('#reference-selection-status').text(Math.round(referenceBounds.width) + ' × ' + Math.round(referenceBounds.height) + ' selected');
    }

    function selectReferenceAsset(asset) {
        selectedReferenceAsset = asset;
        $('#asset-library-view').prop('hidden', true);
        $('#reference-select-view').prop('hidden', false);
        $('#selected-reference-title').text(asset.title);
        referenceImage.onload = setupReferenceImage;
        referenceImage.src = asset.backgroundAsset;
        if (referenceImage.complete && referenceImage.naturalWidth) window.setTimeout(setupReferenceImage, 0);
    }

    $('#open-reference-picker').on('click', function () {
        $('#asset-library-view').prop('hidden', false);
        $('#reference-select-view').prop('hidden', true);
        setWorkspaceOpen('reference-workspace', true);
        loadAssets();
        window.setTimeout(function () { $('#asset-search').focus(); }, 0);
    });
    $('[data-close-reference-workspace]').on('click', function () { setWorkspaceOpen('reference-workspace', false); });
    $('#asset-search').on('input', renderAssetLibrary);
    $('#asset-thumbnail-grid').on('click', '.asset-thumbnail', function () {
        var type = $(this).attr('data-asset-type');
        var slug = $(this).attr('data-asset-slug');
        var asset = (referenceAssets || []).find(function (candidate) { return candidate.assetType === type && candidate.slug === slug; });
        if (asset) selectReferenceAsset(asset);
    });
    $('#back-to-assets').on('click', function () {
        $('#reference-select-view').prop('hidden', true);
        $('#asset-library-view').prop('hidden', false);
        referenceBounds = null;
    });

    $(referenceLayer).on('pointerdown', function (event) {
        if (!referenceDimensions) return;
        event.preventDefault();
        referenceStart = svgPoint(event.originalEvent, referenceLayer, referenceDimensions);
        referenceBounds = { x: referenceStart.x, y: referenceStart.y, width: 1, height: 1 };
        referenceLayer.setPointerCapture(event.originalEvent.pointerId);
        renderReferenceSelection();
    }).on('pointermove', function (event) {
        if (!referenceStart) return;
        referenceBounds = rectangleFromPoints(referenceStart, svgPoint(event.originalEvent, referenceLayer, referenceDimensions));
        renderReferenceSelection();
    }).on('pointerup', function (event) {
        if (!referenceStart) return;
        referenceBounds = rectangleFromPoints(referenceStart, svgPoint(event.originalEvent, referenceLayer, referenceDimensions));
        referenceStart = null;
        if (referenceBounds.width < 2 || referenceBounds.height < 2) referenceBounds = null;
        renderReferenceSelection();
    });

    function drawReferencePreview() {
        var preview = document.getElementById('reference-crop-preview');
        var context = preview.getContext('2d');
        context.clearRect(0, 0, preview.width, preview.height);
        context.fillStyle = '#080b0c';
        context.fillRect(0, 0, preview.width, preview.height);
        var scale = Math.min(preview.width / referenceBounds.width, preview.height / referenceBounds.height);
        var width = referenceBounds.width * scale;
        var height = referenceBounds.height * scale;
        try {
            context.drawImage(referenceImage, referenceBounds.x, referenceBounds.y, referenceBounds.width, referenceBounds.height, (preview.width - width) / 2, (preview.height - height) / 2, width, height);
            preview.hidden = false;
        } catch (error) {
            preview.hidden = true;
        }
    }

    $('#use-reference-selection').on('click', function () {
        if (!selectedReferenceAsset || !referenceDimensions || !referenceBounds || referenceBounds.width < 2 || referenceBounds.height < 2) {
            bridge.toast('Drag a rectangle around the reference area first.', true);
            return;
        }
        window.NL_OBJECT_REFERENCE = {
            assetType: selectedReferenceAsset.assetType,
            backgroundAsset: selectedReferenceAsset.backgroundAsset,
            canvas: { width: referenceDimensions.width, height: referenceDimensions.height },
            bounds: $.extend({}, referenceBounds)
        };
        $('#reference-source-title').text(selectedReferenceAsset.title);
        $('#reference-source-detail').text(Math.round(referenceBounds.width) + ' × ' + Math.round(referenceBounds.height) + ' crop from ' + (selectedReferenceAsset.assetType === 'rooms' ? 'room' : 'object') + ' “' + selectedReferenceAsset.slug + '”');
        $('#clear-reference').prop('hidden', false);
        drawReferencePreview();
        setWorkspaceOpen('reference-workspace', false);
        bridge.toast('Gemini reference crop selected');
    });

    $('#clear-reference').on('click', function () {
        window.NL_OBJECT_REFERENCE = null;
        $('#reference-source-title').text('No reference selected');
        $('#reference-source-detail').text('Choose a saved room or object image, then mark the exact area to use.');
        $('#reference-crop-preview').prop('hidden', true);
        $(this).prop('hidden', true);
    });

    $(document).on('keydown', function (event) {
        if (event.key !== 'Escape') return;
        if (!document.getElementById('object-crop-workspace').hidden) setWorkspaceOpen('object-crop-workspace', false);
        if (!document.getElementById('reference-workspace').hidden) setWorkspaceOpen('reference-workspace', false);
    });
    window.addEventListener('resize', function () {
        if (!document.getElementById('object-crop-workspace').hidden) {
            var dimensions = bridge.getCanvas();
            fitSelectionCanvas(cropCanvas, dimensions.width, dimensions.height);
        }
        if (!document.getElementById('reference-workspace').hidden && referenceDimensions) {
            fitSelectionCanvas(referenceCanvas, referenceDimensions.width, referenceDimensions.height);
        }
    });
})(jQuery);
