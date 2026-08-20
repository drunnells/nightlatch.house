'use strict';

var assert = require('assert');
var rules = require('../assets/js/room-rules.js');

function freshState() {
    return { flags: {}, items: {}, overlays: {}, unlockedDoors: {} };
}

var state = freshState();
assert.strictEqual(rules.conditionPasses({ source: 'always' }, state), true);
assert.strictEqual(rules.conditionPasses({ source: 'flag', key: 'library_door', operator: 'exists' }, state), false);
state.flags.library_door = 'locked';
assert.strictEqual(rules.conditionPasses({ source: 'flag', key: 'library_door', operator: 'equals', value: 'locked' }, state), true);
assert.strictEqual(rules.conditionPasses({ source: 'flag', key: 'library_door', operator: 'not_equals', value: 'open' }, state), true);
state.items.brass_key = '1';
assert.strictEqual(rules.conditionPasses({ source: 'item', key: 'brass_key', operator: 'equals', value: '1' }, state), true);

var door = {
    id: 'north-door',
    kind: 'door',
    success: {
        overlay: '../door-open.png',
        setFlag: { key: 'north_door', value: 'open' },
        grantItem: 'old_coin',
        unlockDoor: true
    }
};
assert.strictEqual(rules.canExit(door, state, 'north-door'), true, 'the entry door is always a valid exit');
assert.strictEqual(rules.canExit(door, state, 'south-door'), false, 'a different locked door is blocked');
rules.applySuccess(door, state);
assert.strictEqual(state.flags.north_door, 'open');
assert.strictEqual(state.items.old_coin, '1');
assert.strictEqual(state.overlays['north-door'], '../door-open.png');
assert.strictEqual(rules.canExit(door, state, 'south-door'), true, 'an unlocked door becomes traversable');

var objectRegion = {
    id: 'hidden-catch',
    kind: 'interaction',
    success: { overlay: '../catch-open.png' }
};
rules.applySuccess(objectRegion, state, { overlayKey: 'object:puzzle-box:hidden-catch' });
assert.strictEqual(state.overlays['object:puzzle-box:hidden-catch'], '../catch-open.png', 'object overlays use their scoped state key');
assert.strictEqual(state.overlays['hidden-catch'], undefined, 'object overlays do not collide with room regions');

state.items.puzzle_box = '1';
state.items.nonportable_prop = '1';
var inventory = rules.ownedObjects([
    { slug: 'puzzle-box', portable: true, inventoryKey: 'puzzle_box' },
    { slug: 'painting', portable: false, inventoryKey: 'nonportable_prop' },
    { slug: 'missing-key', portable: true, inventoryKey: 'not_owned' }
], state);
assert.deepStrictEqual(inventory.map(function (object) { return object.slug; }), ['puzzle-box']);

console.log('room-rules tests passed');
