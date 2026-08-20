'use strict';

var assert = require('assert');
var rules = require('../assets/js/room-rules.js');

function freshState() {
    return { flags: {}, items: {}, overlays: {}, unlockedDoors: {} };
}

var state = freshState();
assert.strictEqual(rules.conditionPasses({ source: 'always' }, state), true);
assert.strictEqual(rules.conditionPasses({ type: 'group', match: 'any', children: [] }, state), true, 'empty groups are an explicit always-match branch');
assert.strictEqual(rules.conditionPasses({ source: 'flag', key: 'library_door', operator: 'exists' }, state), false);
state.flags.library_door = 'locked';
assert.strictEqual(rules.conditionPasses({ source: 'flag', key: 'library_door', operator: 'equals', value: 'locked' }, state), true);
assert.strictEqual(rules.conditionPasses({ source: 'flag', key: 'library_door', operator: 'not_equals', value: 'open' }, state), true);
state.items.brass_key = '1';
assert.strictEqual(rules.conditionPasses({ source: 'item', key: 'brass_key', operator: 'equals', value: '1' }, state), true);
assert.strictEqual(rules.conditionPasses({ type: 'condition', source: 'item', key: '', operator: 'not_exists' }, state), false, 'unfinished conditions never pass');

var keyExpression = {
    type: 'group',
    match: 'all',
    children: [
        { type: 'condition', source: 'item', key: 'blue_key', operator: 'exists' },
        { type: 'condition', source: 'item', key: 'red_key', operator: 'exists' },
        { type: 'condition', source: 'flag', key: 'ritual_ready', operator: 'equals', value: 'yes' }
    ]
};
state.items.blue_key = '1';
state.items.red_key = '1';
state.flags.ritual_ready = 'yes';
assert.strictEqual(rules.conditionPasses(keyExpression, state), true, 'ALL groups require every condition');
delete state.items.red_key;
assert.strictEqual(rules.conditionPasses(keyExpression, state), false, 'ALL groups fail when one condition fails');
keyExpression.children[1] = {
    type: 'group',
    match: 'any',
    children: [
        { type: 'condition', source: 'item', key: 'red_key', operator: 'exists' },
        { type: 'condition', source: 'item', key: 'master_key', operator: 'exists' }
    ]
};
state.items.master_key = '1';
assert.strictEqual(rules.conditionPasses(keyExpression, state), true, 'nested ANY groups support grouped OR logic');

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

var branchingRegion = {
    id: 'two-key-painting',
    kind: 'interaction',
    logic: {
        version: 1,
        branches: [{
            id: 'keys-ready',
            when: keyExpression,
            actions: [
                { id: 'show-open', type: 'set_overlay', asset: '../painting-open.png' },
                { id: 'message-open', type: 'message', text: 'Both locks release.' },
                { id: 'message-detail', type: 'message', text: 'The painting swings forward.' },
                { id: 'set-open', type: 'set_flag', key: 'painting_open', value: 'yes' }
            ]
        }],
        elseActions: [
            { id: 'clear-open', type: 'clear_overlay' },
            { id: 'message-locked', type: 'message', text: 'The locks remain shut.' }
        ]
    }
};
var branchResult = rules.runRegion(branchingRegion, state);
assert.strictEqual(branchResult.branchLabel, 'IF');
assert.strictEqual(branchResult.effects.message, 'Both locks release.\nThe painting swings forward.', 'multiple messages are returned in action order');
assert.strictEqual(state.overlays['two-key-painting'], '../painting-open.png');
assert.strictEqual(state.flags.painting_open, 'yes');
assert.strictEqual(branchResult.testedBranches[0].trace.length, 4, 'debug traces include nested leaf conditions');
delete state.items.master_key;
branchResult = rules.runRegion(branchingRegion, state);
assert.strictEqual(branchResult.branchLabel, 'ELSE');
assert.strictEqual(branchResult.effects.message, 'The locks remain shut.');
assert.strictEqual(state.overlays['two-key-painting'], undefined, 'ELSE can explicitly remove an existing overlay');

var orderedRegion = {
    id: 'ordered',
    logic: {
        branches: [
            { id: 'first', when: { type: 'group', match: 'all', children: [] }, actions: [{ type: 'message', text: 'first' }] },
            { id: 'second', when: { type: 'group', match: 'all', children: [] }, actions: [{ type: 'message', text: 'second' }] }
        ],
        elseActions: []
    }
};
assert.strictEqual(rules.runRegion(orderedRegion, freshState()).effects.message, 'first', 'only the first matching branch executes');

var legacyLogic = rules.normalizeLogic({
    condition: { source: 'flag', key: 'legacy', operator: 'exists' },
    success: { message: 'Legacy success', overlay: '../legacy.png', examineObject: 'old-box' },
    failure: { message: 'Legacy failure' }
});
assert.strictEqual(legacyLogic.branches[0].actions.length, 3, 'legacy success fields become actions');
assert.strictEqual(legacyLogic.elseActions[0].text, 'Legacy failure', 'legacy failure messages become ELSE actions');

var sequenceProbe = rules.defaultLogic();
var nextSequence = parseInt(sequenceProbe.branches[0].when.id.split('-').pop(), 10) + 1;
var loadedBranchId = 'branch-' + nextSequence;
var loadedGroupId = 'group-' + (nextSequence + 1);
var loadedLogic = rules.normalizeLogic({
    logic: {
        branches: [{
            id: loadedBranchId,
            when: {
                id: loadedGroupId,
                type: 'group',
                match: 'all',
                children: []
            },
            actions: []
        }],
        elseActions: []
    }
});
var addedBranch = rules.defaultLogic().branches[0];
assert.notStrictEqual(addedBranch.id, loadedLogic.branches[0].id, 'a new ELSE IF branch does not reuse a loaded branch identifier');
assert.notStrictEqual(addedBranch.when.id, loadedLogic.branches[0].when.id, 'a new ELSE IF condition group does not reuse a loaded group identifier');

state.flags.temporary = '1';
state.items.disposable = '1';
var removalEffects = rules.applyActions([
    { type: 'clear_flag', key: 'temporary' },
    { type: 'remove_item', key: 'disposable' },
    { type: 'examine_object', objectSlug: 'old-box' }
], state, { regionId: 'test-region' });
assert.strictEqual(state.flags.temporary, undefined);
assert.strictEqual(state.items.disposable, undefined);
assert.deepStrictEqual(removalEffects.examineObjects, ['old-box']);

state.items.puzzle_box = '1';
state.items.nonportable_prop = '1';
var inventory = rules.ownedObjects([
    { slug: 'puzzle-box', portable: true, inventoryKey: 'puzzle_box' },
    { slug: 'painting', portable: false, inventoryKey: 'nonportable_prop' },
    { slug: 'missing-key', portable: true, inventoryKey: 'not_owned' }
], state);
assert.deepStrictEqual(inventory.map(function (object) { return object.slug; }), ['puzzle-box']);

var gatewayAssignments = rules.assignGatewayDestinations({
    destinationCount: 2,
    exitRegionIds: ['left-gateway', 'right-gateway', 'unused-gateway'],
    candidateClusterIds: ['glass-wing', 'cellar', 'attic']
}, {
    'glass-wing': { id: 'glass-wing', entryRoomId: 10, gatewayReturnMode: 'behind' },
    cellar: { id: 'cellar', entryRoomId: 20, gatewayReturnMode: 'door', gatewayReturnRegionId: 'cellar-return' },
    attic: { id: 'attic', entryRoomId: 30, gatewayReturnMode: 'behind' }
}, function () { return 0; });
var assignedGatewayExits = Object.keys(gatewayAssignments);
assert.strictEqual(assignedGatewayExits.length, 2, 'a Gateway assigns exactly its configured destination count');
assert.strictEqual(new Set(assignedGatewayExits.map(function (exitId) { return gatewayAssignments[exitId].clusterId; })).size, 2, 'a Gateway uses distinct destination clusters');
assert.ok(gatewayAssignments[assignedGatewayExits[0]].entryRoomId, 'Gateway assignments snapshot the cluster entry room');

console.log('room-rules tests passed');
