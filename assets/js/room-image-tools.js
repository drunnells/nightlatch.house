(function ($) {
    'use strict';

    var bridge = window.NLImageAreaEditorBridge;
    if (!bridge || bridge.assetType !== 'rooms') return;
    var assets = [];
    var selectedUpload = '';
    var referenceRevision = 0;
    var workspace = document.getElementById('room-reference-workspace');

    function closePicker() {
        workspace.hidden = true;
        document.body.classList.remove('image-workspace-open');
        $('#room-reference-picker').trigger('focus');
    }

    function clearReference() {
        referenceRevision += 1;
        var oldUpload = selectedUpload;
        selectedUpload = '';
        window.NL_ROOM_REFERENCE = null;
        $('#room-reference-title').text('No reference selected');
        $('#room-reference-detail').text('Use an uploaded image or any saved background, overlay, or book page.');
        $('#room-reference-summary').removeAttr('title');
        $('#room-reference-preview').prop('hidden', true).removeAttr('src');
        $('#room-reference-clear').prop('hidden', true);
        $('#room-reference-upload').val('');
        if (oldUpload) bridge.discardTemporaryAsset(oldUpload);
    }

    function selectReference(asset, uploaded) {
        clearReference();
        selectedUpload = uploaded ? asset.backgroundAsset : '';
        window.NL_ROOM_REFERENCE = { assetType: asset.assetType, backgroundAsset: asset.backgroundAsset };
        $('#room-reference-title').text(asset.title);
        $('#room-reference-detail').text(asset.detail);
        $('#room-reference-summary').attr('title', asset.title + '\n' + asset.detail);
        $('#room-reference-preview').attr('src', asset.backgroundAsset).prop('hidden', false);
        $('#room-reference-clear').prop('hidden', false);
    }

    function renderAssets() {
        var query = $('#room-reference-search').val().trim().toLowerCase();
        var grid = $('#room-reference-grid').empty();
        var count = 0;
        assets.forEach(function (asset, index) {
            if (query && (asset.title + ' ' + asset.slug + ' ' + asset.detail).toLowerCase().indexOf(query) === -1) return;
            count += 1;
            var button = $('<button type="button" class="asset-thumbnail">').attr('data-index', index).attr('title', asset.title + '\n' + asset.detail);
            button.append($('<span>').append($('<img alt="" loading="lazy">').attr('src', asset.backgroundAsset)));
            button.append($('<strong>').text(asset.title), $('<small>').text(asset.detail));
            grid.append(button);
        });
        $('#room-reference-count').text(count + (count === 1 ? ' image' : ' images'));
        if (!count) grid.append($('<p class="asset-library-empty">').text('No matching saved PNG, JPG, or WebP images.'));
    }

    $('#room-reference-picker').on('click', function () {
        workspace.hidden = false;
        document.body.classList.add('image-workspace-open');
        $('#room-reference-search').trigger('focus');
        $('#room-reference-count').text('');
        $('#room-reference-grid').empty().append($('<p class="asset-loading">').text('Loading saved images…'));
        fetch('api/image-assets.php?includeOverlays=1', { headers: { Accept: 'application/json' } })
            .then(function (response) { return response.json(); }).then(function (result) {
                if (!result.ok) throw new Error(result.error || 'Saved images could not be loaded.');
                assets = result.assets || [];
                renderAssets();
            }).catch(function (error) {
                $('#room-reference-grid').empty().append($('<p class="asset-library-empty">').text(error.message));
            });
    });
    $('[data-close-room-reference]').on('click', closePicker);
    $('#room-reference-search').on('input', renderAssets);
    $('#room-reference-grid').on('click', '.asset-thumbnail', function () {
        var asset = assets[Number($(this).attr('data-index'))];
        if (asset) { selectReference(asset, false); closePicker(); }
    });
    $('#room-reference-clear').on('click', clearReference);
    window.addEventListener('nl-room-reference-reset', clearReference);
    $('#room-reference-upload').on('change', function () {
        var file = this.files[0];
        if (!file) return;
        if (file.size > 12 * 1024 * 1024 || !/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type)) {
            bridge.toast('Choose a PNG, JPG, or WebP reference up to 12 MB.', true);
            this.value = '';
            return;
        }
        var revision = ++referenceRevision;
        window.NL_ROOM_REFERENCE_UPLOADING = true;
        var input = $(this).prop('disabled', true);
        bridge.upload(file, input.closest('.reference-source-card')).then(function (url) {
            if (revision !== referenceRevision) { bridge.discardTemporaryAsset(url); return; }
            selectReference({ title: file.name, detail: 'Uploaded reference', assetType: 'rooms', backgroundAsset: url }, true);
            bridge.toast('Reference uploaded. Generate a background to use it.');
        }).catch(function (error) { bridge.toast(error.message, true); }).finally(function () {
            window.NL_ROOM_REFERENCE_UPLOADING = false;
            input.prop('disabled', false).val('');
        });
    });

    $(document).on('keydown', function (event) {
        if (workspace.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); closePicker(); }
        if (event.key !== 'Tab') return;
        var controls = $(workspace).find('button, input').filter(':visible:not(:disabled)');
        var first = controls[0];
        var last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
})(jQuery);
