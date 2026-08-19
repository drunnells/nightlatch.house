(function (root, factory) {
    var rules = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = rules;
    } else {
        root.NLRoomRules = rules;
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function conditionPasses(condition, state) {
        if (!condition || condition.source === 'always') return true;
        var bucket = condition.source === 'item' ? state.items : state.flags;
        var exists = Object.prototype.hasOwnProperty.call(bucket, condition.key);
        if (condition.operator === 'exists') return exists;
        if (condition.operator === 'not_exists') return !exists;
        if (condition.operator === 'not_equals') return !exists || String(bucket[condition.key]) !== String(condition.value);
        return exists && String(bucket[condition.key]) === String(condition.value);
    }

    function applySuccess(region, state) {
        var outcome = region.success || {};
        if (outcome.setFlag && outcome.setFlag.key) state.flags[outcome.setFlag.key] = outcome.setFlag.value;
        if (outcome.grantItem) state.items[outcome.grantItem] = '1';
        if (outcome.overlay) state.overlays[region.id] = outcome.overlay;
        if (outcome.unlockDoor) state.unlockedDoors[region.id] = true;
        return state;
    }

    function canExit(region, state, entryRegionId) {
        if (region.kind !== 'door') return false;
        return region.id === entryRegionId || !!state.unlockedDoors[region.id];
    }

    return {
        conditionPasses: conditionPasses,
        applySuccess: applySuccess,
        canExit: canExit
    };
}));

