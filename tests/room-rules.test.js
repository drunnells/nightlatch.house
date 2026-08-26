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

var automaticBehaviors = rules.normalizeAutomaticBehaviors({
    automaticBehaviors: [{
        id: 'behavior-generator',
        name: 'Generator response',
        trigger: { type: 'state_change', source: 'flag', key: 'generator_power' },
        logic: {
            branches: [{
                when: { type: 'group', match: 'all', children: [{ type: 'condition', source: 'flag', key: 'generator_power', operator: 'equals', value: 'on' }] },
                actions: [{ type: 'set_overlay', asset: '../generator-on.png' }]
            }],
            elseActions: [{ type: 'clear_overlay' }]
        }
    }]
});
assert.strictEqual(automaticBehaviors.length, 1, 'regions retain independently authored automatic behaviors');
assert.strictEqual(automaticBehaviors[0].trigger.key, 'generator_power', 'state-change trigger keys are normalized');
var automaticOnlyRegion = {
    kind: 'interaction',
    logic: {
        branches: [{ when: { type: 'group', match: 'all', children: [] }, actions: [] }],
        elseActions: []
    },
    automaticBehaviors: automaticBehaviors
};
assert.strictEqual(rules.regionAcceptsPlayerClick(automaticOnlyRegion), false, 'automatic behavior actions do not make an otherwise empty region player-clickable');
assert.strictEqual(rules.regionAcceptsPlayerClick({
    kind: 'interaction',
    logic: {
        branches: [{ when: { type: 'group', match: 'all', children: [] }, actions: [{ type: 'message', text: 'Look closer.' }] }],
        elseActions: []
    }
}), true, 'an authored click action makes an interaction region player-clickable');
assert.strictEqual(rules.regionAcceptsPlayerClick({ kind: 'door', logic: rules.defaultLogic() }), true, 'doors remain player-clickable without result actions');
assert.strictEqual(rules.regionAcceptsPlayerClick({ kind: 'interaction', success: { message: 'Legacy click result' } }), true, 'legacy player-click results remain clickable');
var automaticState = freshState();
automaticState.flags.generator_power = 'on';
rules.runLogic(automaticBehaviors[0].logic, automaticState, { overlayKey: 'room:boiler:generator' });
assert.strictEqual(automaticState.overlays['room:boiler:generator'], '../generator-on.png', 'automatic logic can apply an overlay to its owning scoped region');

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
    { type: 'examine_object', objectSlug: 'old-box' },
    { type: 'set_description', targetKind: 'room', targetSlug: 'foyer', text: 'The fireplace casts long shadows.' },
    { type: 'play_sound', soundSlug: 'fireplace-lighting' }
], state, { regionId: 'test-region' });
assert.strictEqual(state.flags.temporary, undefined);
assert.strictEqual(state.items.disposable, undefined);
assert.deepStrictEqual(removalEffects.examineObjects, ['old-box']);
assert.strictEqual(state.descriptions['room:foyer'], 'The fireplace casts long shadows.', 'description results replace player-facing text in session state');
assert.deepStrictEqual(removalEffects.sounds, ['fireplace-lighting'], 'sound results report the selected sound for playback');
assert.deepStrictEqual(removalEffects.changes.map(function (change) { return change.source + ':' + change.key; }), ['flag:temporary', 'item:disposable'], 'state-mutating results report changed flag and item keys');

var unchangedState = freshState();
unchangedState.flags.steady = 'yes';
var unchangedEffects = rules.applyActions([{ type: 'set_flag', key: 'steady', value: 'yes' }], unchangedState);
assert.strictEqual(unchangedEffects.changes.length, 0, 'setting an existing value does not emit a state-change event');
var coalescedEffects = rules.applyActions([
    { type: 'set_flag', key: 'temporary_transition', value: 'yes' },
    { type: 'clear_flag', key: 'temporary_transition' }
], unchangedState);
assert.strictEqual(coalescedEffects.changes.length, 0, 'state changes that cancel within one result list are coalesced');

var scopedDoorState = freshState();
rules.applyActions([{ type: 'unlock_door' }], scopedDoorState, { regionId: 'exit', regionKind: 'door', doorKey: 'room:boiler:exit' });
assert.strictEqual(rules.canExit({ id: 'exit', kind: 'door' }, scopedDoorState, '', 'room:boiler:exit'), true, 'door state may use a room-qualified region key');

state.items.puzzle_box = '1';
state.items.nonportable_prop = '1';
var inventory = rules.ownedObjects([
    { slug: 'puzzle-box', portable: true, inventoryKey: 'puzzle_box' },
    { slug: 'painting', portable: false, inventoryKey: 'nonportable_prop' },
    { slug: 'missing-key', portable: true, inventoryKey: 'not_owned' }
], state);
assert.deepStrictEqual(inventory.map(function (object) { return object.slug; }), ['puzzle-box']);

var book = {
    enabled: true,
    pageTurnSoundSlug: 'paper-turn',
    pages: [{ asset: 'page-1.png' }, { asset: 'page-2.png' }, { asset: 'page-3.png' }]
};
assert.strictEqual(rules.bookPage(book, -1), null, 'a book shows its base object artwork while closed');
assert.deepStrictEqual(rules.bookControlState(book, -1), {
    enabled: true,
    isOpen: false,
    pageIndex: -1,
    pageCount: 3,
    canOpen: true,
    canNext: false,
    canPrevious: false,
    canClose: false
}, 'only Open is available while a book is closed');
var pageTurn = rules.useBookControl(book, -1, 'open');
assert.deepStrictEqual(pageTurn, { handled: true, available: true, moved: true, action: 'open', pageIndex: 0, pageCount: 3, soundSlug: '' }, 'Open reveals the first page without playing the page-turn sound');
assert.strictEqual(rules.bookPage(book, pageTurn.pageIndex).asset, 'page-1.png', 'opening a book reveals its first page overlay');
pageTurn = rules.useBookControl(book, 0, 'next');
assert.deepStrictEqual(pageTurn, { handled: true, available: true, moved: true, action: 'next', pageIndex: 1, pageCount: 3, soundSlug: 'paper-turn' }, 'Next Page advances one page and returns the shared book sound');
pageTurn = rules.useBookControl(book, 2, 'next');
assert.deepStrictEqual(pageTurn, { handled: true, available: false, moved: false, action: 'next', pageIndex: 2, pageCount: 3, soundSlug: '' }, 'Next Page is unavailable at the final page');
pageTurn = rules.useBookControl(book, 1, 'previous');
assert.strictEqual(pageTurn.pageIndex, 0, 'Previous Page moves backward one page');
assert.strictEqual(pageTurn.soundSlug, 'paper-turn', 'backward page turns use the same per-book sound');
pageTurn = rules.useBookControl(book, 0, 'close');
assert.deepStrictEqual(pageTurn, { handled: true, available: true, moved: true, action: 'close', pageIndex: -1, pageCount: 3, soundSlug: '' }, 'Close returns to the base object artwork without a page-turn sound');
assert.strictEqual(rules.useBookControl(book, -1, 'ordinary-region').handled, false, 'ordinary object regions are not treated as book controls');
assert.strictEqual(rules.bookControlState({ enabled: false, pages: book.pages }, -1).enabled, false, 'disabled book settings do not add controls to an object');

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
