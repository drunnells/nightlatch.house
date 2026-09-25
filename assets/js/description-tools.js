(function ($) {
    'use strict';

    window.NLDescriptionGenerator = {
        available: function (asset) { return /\.(png|jpe?g|webp)(?:\?|$)/i.test(asset || ''); },
        generate: function (asset, kind) {
            return fetch('api/generate-description.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.NL_CSRF },
                body: JSON.stringify({ backgroundAsset: asset, kind: kind })
            }).then(function (response) { return response.json(); }).then(function (result) {
                if (!result.ok) throw new Error(result.error || 'The description could not be generated.');
                return result.description;
            });
        }
    };

    var bridge = window.NLImageAreaEditorBridge;
    if (!bridge) return;
    var kind = bridge.assetType === 'objects' ? 'object' : 'room';
    var descriptionRevision = 0;
    var describing = false;
    var image = document.getElementById('room-image');
    var descriptionButton = $('#generate-player-description');

    function updateDescriptionButton() {
        var available = window.NLDescriptionGenerator.available(bridge.getBackgroundAsset());
        descriptionButton.prop('hidden', !available).prop('disabled', describing || !available);
    }
    new MutationObserver(function () { descriptionRevision += 1; updateDescriptionButton(); }).observe(image, { attributes: true, attributeFilter: ['src'] });
    $('#player-description').on('input change', function () { descriptionRevision += 1; });
    descriptionButton.on('click', function () {
        if (describing) return;
        var asset = bridge.getBackgroundAsset();
        var priorDescription = $('#player-description').val();
        var revision = descriptionRevision;
        describing = true;
        updateDescriptionButton();
        descriptionButton.html('<i class="fa-solid fa-spinner fa-spin"></i>');
        $('#description-generation-status').text('Writing a short description from the image…');
        window.NLDescriptionGenerator.generate(asset, kind).then(function (description) {
            if (revision !== descriptionRevision || asset !== bridge.getBackgroundAsset() || priorDescription !== $('#player-description').val()) {
                $('#description-generation-status').text('The image or description changed while generating. Click the wand again to use the current image.');
                return;
            }
            $('#player-description').val(description).trigger('input');
            $('#description-generation-status').text('Description ready. Review it, then save to keep it.');
        }).catch(function (error) {
            $('#description-generation-status').text(error.message);
            bridge.toast(error.message, true);
        }).finally(function () {
            describing = false;
            descriptionButton.html('<i class="fa-solid fa-wand-magic-sparkles"></i>');
            updateDescriptionButton();
        });
    });
    updateDescriptionButton();

})(jQuery);
