'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Exercise actual editor events with deferred AI responses, without a browser or network.
function harness() {
    const nodes = new Map();
    class Element {
        constructor() { this.handlers = {}; this.attrs = {}; this.fields = new Map(); this.value = ''; }
        on(events, selector, callback) {
            events.split(' ').forEach(event => { this.handlers[event + (callback ? ':' + selector : '')] = callback || selector; });
            return this;
        }
        find(selector) { if (!this.fields.has(selector)) this.fields.set(selector, new Element()); return this.fields.get(selector); }
        text(value) { this.label = String(value); return this; }
        html(value) {
            if (!arguments.length) return (this.label || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            this.markup = value; return this;
        }
        attr(key, value) { if (arguments.length === 1) return this.attrs[key]; this.attrs[key] = value; return this; }
        prop(key, value) { this[key] = value; return this; }
        val(value) { if (!arguments.length) return this.value; this.value = value; return this; }
        each() { return this; }
        closest() { return this.card; }
        hasClass(name) { return this.className === name; }
    }
    function $(selector) {
        if (typeof selector !== 'string') return selector;
        if (selector.startsWith('<')) return new Element();
        if (!nodes.has(selector)) nodes.set(selector, new Element());
        return nodes.get(selector);
    }
    const pending = [], notices = [];
    let changes = 0;
    const window = { NLDescriptionGenerator: {
        available: asset => !!asset,
        generate: (asset, kind) => new Promise((resolve, reject) => pending.push({asset, kind, resolve, reject}))
    } };
    const document = new Element(); document.getElementById = () => null;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/book-editor.js'), 'utf8'), {jQuery:$, window, document});
    const editor = window.NLBookEditor.create({root:'#book', enabledInput:'#enabled', book:{enabled:true,pages:[
        {asset:'one.png',prompt:'Author prompt',playerDescription:'Map description'},
        {asset:'two.png',playerDescription:'Key description'},
        {asset:'legacy.png'}
    ]}, onChange:() => { changes++; }, notify:message => notices.push(message)});
    function fire(event, selector, index=0, value='') {
        const target = new Element(); target.card = new Element(); target.card.attr('data-page-index', index);
        target.className = selector.split(', ').pop().slice(1); target.val(value);
        $('#book').handlers[event + ':' + selector].call(target);
    }
    return {editor, pending, notices, fire, changes:() => changes};
}
const settle = () => new Promise(resolve => setImmediate(resolve));
(async function () {
    const h = harness();
    assert.strictEqual(h.editor.value().pages[2].playerDescription, '', 'Legacy pages remain valid');
    h.fire('click', '.book-page-describe');
    h.fire('click', '.book-page-describe');
    assert.strictEqual(h.pending.length, 1, 'Suppress duplicate requests');
    assert.strictEqual(h.pending[0].kind, 'book_page');
    assert.strictEqual(h.pending[0].asset, 'one.png');
    h.fire('click', '.book-page-up, .book-page-down', 0); // The down event swaps the page objects.
    h.pending.shift().resolve('Generated map'); await settle();
    assert.strictEqual(h.editor.value().pages[1].playerDescription, 'Generated map', 'Responses follow page identity after reordering');
    assert.strictEqual(h.editor.value().pages[1].prompt, 'Author prompt');
    assert.strictEqual(h.editor.value().pages[0].playerDescription, 'Key description');
    assert(!JSON.stringify(h.editor.value()).includes('_describ'), 'Transient request state is never saved');

    h.fire('click', '.book-page-describe', 1);
    h.fire('input', '.book-page-description', 1, 'Edit');
    h.fire('input', '.book-page-description', 1, 'Generated map');
    h.pending.shift().resolve('Stale text'); await settle();
    assert.strictEqual(h.editor.value().pages[1].playerDescription, 'Generated map', 'Edit then revert still invalidates a response');

    h.fire('click', '.book-page-describe', 1);
    h.fire('change', '.book-page-library', 1, 'new.png');
    h.fire('change', '.book-page-library', 1, 'one.png');
    h.pending.shift().resolve('Wrong artwork'); await settle();
    assert.strictEqual(h.editor.value().pages[1].playerDescription, 'Generated map', 'Artwork replacement then revert invalidates a response');

    h.fire('click', '.book-page-describe', 1);
    h.fire('click', '.book-page-remove', 1);
    h.pending.shift().resolve('Removed page text'); await settle();
    assert.strictEqual(h.editor.value().pages[1].playerDescription, '', 'Removed pages cannot redirect responses onto another page');
    h.fire('click', '.book-page-describe');
    h.pending.shift().reject(new Error('Service unavailable')); await settle();
    assert.strictEqual(h.editor.value().pages[0].playerDescription, 'Key description');
    assert.strictEqual(h.notices[0], 'Service unavailable');
    h.fire('click', '.book-page-describe');
    h.pending.shift().resolve('Retry works'); await settle();
    assert.strictEqual(h.editor.value().pages[0].playerDescription, 'Retry works');
    assert(h.changes() > 0, 'Authored and generated descriptions mark the draft dirty');
    console.log('book-editor tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
