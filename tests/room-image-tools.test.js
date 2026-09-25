'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Minimal DOM adapter for asynchronous editor behavior; no network or AI calls.
function harness(assetType = 'rooms') {
    const elements = new Map();
    class Element {
        constructor() { this.handlers = {}; this.attrs = {}; this.value = ''; this.label = ''; this.children = []; this.hidden = false; }
        on(name, selector, callback) { this.handlers[name] = callback || selector; return this; }
        trigger(name) { if (this.handlers[name]) this.handlers[name].call(this); return this; }
        prop(key, value) { if (arguments.length === 1) return this[key]; this[key] = value; return this; }
        attr(key, value) { if (arguments.length === 1) return this.attrs[key]; this.attrs[key] = value; return this; }
        removeAttr(key) { delete this.attrs[key]; return this; }
        val(value) { if (!arguments.length) return this.value; this.value = value; return this; }
        text(value) { if (!arguments.length) return this.label; this.label = value; return this; }
        html(value) { this.markup = value; return this; }
        empty() { this.children = []; return this; }
        append(...children) { this.children.push(...children); return this; }
        closest() { return this; }
    }
    function $(selector) {
        if (typeof selector !== 'string') return selector;
        if (selector.startsWith('<')) return new Element();
        if (!elements.has(selector)) elements.set(selector, new Element());
        return elements.get(selector);
    }
    const events = {};
    const pending = [];
    const uploads = [];
    const discarded = [];
    const notices = [];
    let source = '../assets/graphics/rooms/demo-room.svg';
    let observer;
    const document = new Element();
    document.getElementById = id => $('#' + id);
    document.body = { classList: { add() {}, remove() {} } };
    $('#room-reference-workspace').hidden = true;
    const window = {
        NL_CSRF: 'test-token',
        addEventListener: (event, cb) => { events[event] = cb; },
        NLImageAreaEditorBridge: {
            assetType, getBackgroundAsset: () => source,
            upload: () => new Promise(resolve => uploads.push(resolve)),
            discardTemporaryAsset: url => { discarded.push(url); return Promise.resolve(); },
            toast: message => notices.push(message)
        }
    };
    const context = {
        jQuery: $, window, document,
        MutationObserver: class { constructor(cb) { observer = cb; } observe() {} },
        fetch: (url, options) => new Promise(resolve => pending.push({ url, options, resolve: result => resolve({ json: () => Promise.resolve(result) }) }))
    };
    ['description-tools.js', 'room-image-tools.js'].forEach(file => vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/' + file), 'utf8'), context));
    return { $, window, events, pending, uploads, discarded, notices,
        background: value => { source = value; observer(); } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

(async function () {
    const h = harness();
    const button = h.$('#generate-player-description');
    const field = h.$('#player-description');
    assert.strictEqual(button.hidden, true, 'No wand for placeholder artwork');
    h.background('../assets/graphics/rooms/uploads/room.png');
    assert.strictEqual(button.hidden, false);
    field.val('Original text');
    button.trigger('click');
    assert.strictEqual(button.disabled, true);
    button.trigger('click');
    assert.strictEqual(h.pending.length, 1, 'Repeated clicks must not send duplicate requests');
    assert.strictEqual(h.pending[0].url, 'api/generate-description.php');
    assert.strictEqual(JSON.parse(h.pending[0].options.body).backgroundAsset, '../assets/graphics/rooms/uploads/room.png');
    assert.strictEqual(h.pending[0].options.headers['X-CSRF-Token'], 'test-token');
    h.pending.shift().resolve({ ok: true, description: 'Moonlight spills across the empty study.' });
    await settle();
    assert.strictEqual(field.val(), 'Moonlight spills across the empty study.');
    assert.strictEqual(button.disabled, false);

    button.trigger('click');
    field.val('My newer description').trigger('input');
    h.pending.shift().resolve({ ok: true, description: 'Stale text' });
    await settle();
    assert.strictEqual(field.val(), 'My newer description');
    button.trigger('click');
    h.background('../assets/graphics/rooms/uploads/new-room.jpg');
    h.pending.shift().resolve({ ok: true, description: 'Wrong image description' });
    await settle();
    assert.strictEqual(field.val(), 'My newer description');
    button.trigger('click');
    h.pending.shift().resolve({ ok: false, error: 'Service unavailable' });
    await settle();
    assert.strictEqual(field.val(), 'My newer description');
    assert.strictEqual(button.disabled, false);
    assert.strictEqual(h.$('#description-generation-status').text(), 'Service unavailable');

    h.$('#room-reference-picker').trigger('click');
    h.pending.shift().resolve({ ok: true, assets: [{ title: 'Study lamp', slug: 'study', detail: 'Room · study · Overlay', assetType: 'rooms', backgroundAsset: 'rooms/study/overlays/lamp.png' }] });
    await settle();
    const grid = h.$('#room-reference-grid');
    assert.strictEqual(grid.children[0].attr('title'), 'Study lamp\nRoom · study · Overlay');
    grid.handlers.click.call(grid.children[0]);
    assert.strictEqual(h.window.NL_ROOM_REFERENCE.backgroundAsset, 'rooms/study/overlays/lamp.png');
    h.$('#room-reference-clear').trigger('click');
    assert.strictEqual(h.window.NL_ROOM_REFERENCE, null);
    assert.deepStrictEqual(h.discarded, [], 'Saved game assets must not be deleted');

    const upload = h.$('#room-reference-upload');
    upload.files = [{ name: 'Reference.png', size: 200, type: 'image/png' }];
    upload.trigger('change');
    assert.strictEqual(h.window.NL_ROOM_REFERENCE_UPLOADING, true);
    h.uploads.shift()('../assets/graphics/rooms/uploads/reference.png');
    await settle();
    assert.strictEqual(h.window.NL_ROOM_REFERENCE_UPLOADING, false);
    assert.strictEqual(h.window.NL_ROOM_REFERENCE.backgroundAsset, '../assets/graphics/rooms/uploads/reference.png');
    h.events['nl-room-reference-reset']();
    assert.strictEqual(h.window.NL_ROOM_REFERENCE, null);
    assert.deepStrictEqual(h.discarded, ['../assets/graphics/rooms/uploads/reference.png']);
    upload.trigger('change');
    h.events['nl-room-reference-reset']();
    h.uploads.shift()('../assets/graphics/rooms/uploads/late.png');
    await settle();
    assert.strictEqual(h.window.NL_ROOM_REFERENCE, null, 'Uploads completing after Save must not revive a cleared reference');
    assert.strictEqual(h.discarded[1], '../assets/graphics/rooms/uploads/late.png');
    const object = harness('objects');
    object.background('../assets/graphics/objects/uploads/box.png');
    object.$('#generate-player-description').trigger('click');
    assert.strictEqual(JSON.parse(object.pending[0].options.body).kind, 'object');
    object.pending.shift().resolve({ ok: true, description: 'A box with a brass keyhole.' });
    await settle();
    assert.strictEqual(object.$('#player-description').val(), 'A box with a brass keyhole.');
    const pageDescription = object.window.NLDescriptionGenerator.generate('objects/journal/overlays/page.png', 'book_page');
    assert.strictEqual(JSON.parse(object.pending[0].options.body).kind, 'book_page');
    object.pending.shift().resolve({ ok: true, description: 'Faded sketches fill the page.' });
    assert.strictEqual(await pageDescription, 'Faded sketches fill the page.');
    console.log('room-image-tools tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
