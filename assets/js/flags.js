(function ($) {
    'use strict';

    function filterFlags() {
        var query = $('#flag-catalog-search').val().trim().toLowerCase();
        var visible = 0;
        $('#flag-catalog .flag-card').each(function () {
            var matches = !query || String($(this).attr('data-flag-search') || '').indexOf(query) !== -1;
            $(this).toggle(matches);
            if (matches) visible += 1;
        });
        $('#flag-catalog-count').text(visible + ' flag' + (visible === 1 ? '' : 's'));
        $('#flag-no-results').prop('hidden', visible !== 0);
    }

    $('#flag-catalog-search').on('input', filterFlags);
}(jQuery));
