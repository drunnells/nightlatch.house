(function ($) {
    'use strict';

    var player = document.getElementById('sound-preview-player');
    var activeButton = null;

    function toast(message, error) {
        $('#toast').text(message).toggleClass('error', !!error).addClass('visible');
        window.clearTimeout(window.nlSoundToastTimer);
        window.nlSoundToastTimer = window.setTimeout(function () { $('#toast').removeClass('visible'); }, 3400);
    }

    function request(payload) {
        return fetch('api/sounds.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
            body: JSON.stringify(payload)
        }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error || 'The sound library could not be updated.');
            return result;
        });
    }

    function resetPreviewButton() {
        if (activeButton) activeButton.html('<i class="fa-solid fa-play"></i>');
        activeButton = null;
    }

    $('#sound-upload').on('change', function () {
        var count = this.files ? this.files.length : 0;
        $('#sound-upload-selection').text(count ? count + ' file' + (count === 1 ? '' : 's') + ' selected' : 'No files selected');
        $('#upload-sounds').prop('disabled', count < 1 || count > 50);
    });

    $('#upload-sounds').on('click', function () {
        var input = document.getElementById('sound-upload');
        if (!input.files || !input.files.length) return;
        var data = new FormData();
        Array.prototype.forEach.call(input.files, function (file) { data.append('sounds[]', file); });
        data.append('csrf_token', window.NL_CSRF);
        var button = $(this).prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Uploading');
        fetch('api/sounds.php', { method: 'POST', body: data }).then(function (response) { return response.json(); }).then(function (result) {
            if (!result.ok) throw new Error(result.error || 'The sounds could not be uploaded.');
            toast(result.sounds.length + ' sound' + (result.sounds.length === 1 ? '' : 's') + ' uploaded');
            window.setTimeout(function () { window.location.reload(); }, 450);
        }).catch(function (error) {
            toast(error.message, true);
            button.prop('disabled', false).html('<i class="fa-solid fa-cloud-arrow-up"></i> Upload selected');
        });
    });

    $('#sound-library').on('click', '.sound-preview', function () {
        var button = $(this);
        var url = button.closest('.sound-card').attr('data-sound-url');
        if (activeButton && activeButton[0] === button[0] && !player.paused) {
            player.pause();
            player.currentTime = 0;
            resetPreviewButton();
            return;
        }
        player.pause();
        resetPreviewButton();
        activeButton = button.html('<i class="fa-solid fa-stop"></i>');
        player.src = url;
        player.currentTime = 0;
        player.play().catch(function () { toast('The browser could not play this sound.', true); resetPreviewButton(); });
    }).on('click', '.sound-save-name', function () {
        var card = $(this).closest('.sound-card');
        var button = $(this).prop('disabled', true);
        request({ action: 'update', id: card.attr('data-sound-id'), name: card.find('.sound-name').val().trim() }).then(function () {
            toast('Sound name saved');
            card.attr('data-sound-search', (card.find('.sound-name').val() + ' ' + card.find('code').text() + ' ' + card.find('small').text()).toLowerCase());
        }).catch(function (error) { toast(error.message, true); }).finally(function () { button.prop('disabled', false); });
    }).on('click', '.sound-delete', function () {
        var card = $(this).closest('.sound-card');
        if (!window.confirm('Delete this sound and its uploaded file?')) return;
        request({ action: 'delete', id: card.attr('data-sound-id') }).then(function () {
            if (player.getAttribute('src') === card.attr('data-sound-url')) { player.pause(); resetPreviewButton(); }
            card.remove();
            toast('Sound deleted');
            $('#sound-search').trigger('input');
        }).catch(function (error) { toast(error.message, true); });
    });

    $('#sound-search').on('input', function () {
        var query = $(this).val().trim().toLowerCase();
        var visible = 0;
        $('#sound-library .sound-card').each(function () {
            var matches = !query || String($(this).attr('data-sound-search') || '').indexOf(query) !== -1;
            $(this).toggle(matches);
            if (matches) visible += 1;
        });
        $('#sound-search-count').text(visible + ' sound' + (visible === 1 ? '' : 's'));
        $('#sound-no-results').prop('hidden', visible !== 0);
    });

    player.addEventListener('ended', resetPreviewButton);
}(jQuery));
