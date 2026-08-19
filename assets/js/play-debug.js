(function ($) {
    'use strict';
    var room = window.NL_DEBUG_ROOM;
    var regions = room.data.regions || [];
    var state;
    var svg = document.getElementById('play-regions');

    function reset() {
        state = { flags: {}, items: {}, unlockedDoors: {}, overlays: {} };
        regions.forEach(function (region) { if (region.kind === 'door' && region.door && region.door.unlocked) state.unlockedDoors[region.id] = true; });
        $('#entry-region').val('');
        $('#event-log').html('<em>Session reset. Click a highlighted region.</em>');
        $('#player-message').removeClass('visible');
        renderAll();
    }

    function esc(value) { return $('<div>').text(value || '').html(); }
    function renderRegions() {
        svg.innerHTML = '';
        regions.forEach(function (region) {
            var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', region.bounds.x); rect.setAttribute('y', region.bounds.y);
            rect.setAttribute('width', region.bounds.width); rect.setAttribute('height', region.bounds.height);
            rect.setAttribute('class', 'play-region ' + region.kind);
            rect.setAttribute('data-id', region.id);
            var title = document.createElementNS('http://www.w3.org/2000/svg', 'title'); title.textContent = region.name; rect.appendChild(title);
            svg.appendChild(rect);
        });
        svg.classList.toggle('regions-hidden', !$('#show-regions').prop('checked'));
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
        $('#doors-state').html(doors.length ? doors.map(function (id) { var region = findRegion(id); return '<span>' + esc(region ? region.name : id) + '</span>'; }).join('') : '<p class="empty-mini">No extra doors unlocked</p>');
    }
    function renderOverlays() {
        var html = '';
        Object.keys(state.overlays).forEach(function (id) {
            var region = findRegion(id); if (!region || !state.overlays[id]) return;
            var b = region.bounds;
            html += '<img src="' + esc(state.overlays[id]) + '" style="left:' + (b.x / room.data.canvas.width * 100) + '%;top:' + (b.y / room.data.canvas.height * 100) + '%;width:' + (b.width / room.data.canvas.width * 100) + '%;height:' + (b.height / room.data.canvas.height * 100) + '%" alt="">';
        });
        $('#overlay-layer').html(html);
    }
    function renderAll() { renderRegions(); renderState(); renderOverlays(); }
    function findRegion(id) { return regions.find(function (region) { return region.id === id; }); }

    function clickRegion(region) {
        var pass = window.NLRoomRules.conditionPasses(region.condition, state);
        var outcome = pass ? (region.success || {}) : (region.failure || {});
        var message = outcome.message || (pass ? 'The interaction succeeds.' : 'Nothing happens.');
        if (pass) window.NLRoomRules.applySuccess(region, state);
        if (region.kind === 'door') {
            var canExit = window.NLRoomRules.canExit(region, state, $('#entry-region').val());
            if (!canExit) {
                pass = false;
                message = (region.failure && region.failure.message) || 'This door has not been unlocked. You can only leave through the door you entered.';
            } else if (pass) {
                message = outcome.message || ('Would navigate to ' + ((region.door && region.door.targetRoom) || 'the connected room') + '.');
            }
        }
        $('#player-message').text(message).addClass('visible');
        window.clearTimeout(window.nlMessageTimer);
        window.nlMessageTimer = window.setTimeout(function () { $('#player-message').removeClass('visible'); }, 3600);
        var now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        $('#event-log').prepend('<p><time>' + now + '</time><strong>' + esc(region.name) + '</strong><span class="' + (pass ? 'pass' : 'fail') + '">' + (pass ? 'passed' : 'blocked') + '</span> ' + esc(message) + '</p>');
        renderState(); renderOverlays();
    }

    $(svg).on('click', '.play-region', function () { clickRegion(findRegion($(this).data('id'))); });
    $('#show-regions').on('change', renderRegions);
    $('#reset-session').on('click', reset);
    $('[data-add-state]').on('click', function () {
        var type = $(this).data('add-state'); var base = type === 'flags' ? 'new_flag' : 'new_item'; var key = base; var n = 2;
        while (Object.prototype.hasOwnProperty.call(state[type], key)) key = base + '_' + n++;
        state[type][key] = type === 'items' ? '1' : '';
        renderState();
    });
    $('.debug-console').on('change', '.state-value', function () {
        var type = $(this).closest('.console-section').find('h3').text().toLowerCase(); state[type][$(this).data('key')] = $(this).val();
    }).on('change', '.state-key', function () {
        var type = $(this).closest('.console-section').find('h3').text().toLowerCase(); var oldKey = $(this).data('original'); var newKey = $(this).val().trim();
        if (newKey && newKey !== oldKey) { state[type][newKey] = state[type][oldKey]; delete state[type][oldKey]; renderState(); }
    }).on('click', '.state-delete', function () {
        var type = $(this).closest('.console-section').find('h3').text().toLowerCase(); delete state[type][$(this).data('key')]; renderState();
    });

    regions.filter(function (region) { return region.kind === 'door'; }).forEach(function (region) { $('#entry-region').append('<option value="' + esc(region.id) + '">' + esc(region.name) + '</option>'); });
    reset();
})(jQuery);
