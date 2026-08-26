(function (root, factory) {
    var rules = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = rules;
    } else {
        root.NLRoomRules = rules;
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var idSequence = 0;

    function uid(prefix) {
        idSequence += 1;
        return (prefix || 'logic') + '-' + idSequence;
    }

    function logicId(prefix, existingId) {
        if (existingId) {
            existingId = String(existingId);
            var sequenceMatch = /-(\d+)$/.exec(existingId);
            if (sequenceMatch) idSequence = Math.max(idSequence, parseInt(sequenceMatch[1], 10));
            return existingId;
        }
        return uid(prefix);
    }

    function conditionNode(source, key, operator, value, id) {
        return {
            id: logicId('condition', id),
            type: 'condition',
            source: source === 'item' ? 'item' : 'flag',
            key: key || '',
            operator: operator || 'equals',
            value: value === undefined || value === null ? '' : String(value)
        };
    }

    function conditionGroup(match, children, id) {
        return {
            id: logicId('group', id),
            type: 'group',
            match: match === 'any' ? 'any' : 'all',
            children: Array.isArray(children) ? children : []
        };
    }

    function defaultLogic() {
        return {
            version: 1,
            branches: [{ id: uid('branch'), when: conditionGroup('all', []), actions: [] }],
            elseActions: []
        };
    }

    function normalizeTrigger(trigger) {
        trigger = trigger || {};
        var type = trigger.type;
        if (type !== 'room_enter' && type !== 'object_open') type = 'state_change';
        var normalized = { type: type };
        if (type === 'state_change') {
            normalized.source = trigger.source === 'item' ? 'item' : 'flag';
            normalized.key = trigger.key || '';
        }
        return normalized;
    }

    function defaultAutomaticBehavior(triggerType) {
        return {
            id: uid('behavior'),
            name: 'Automatic behavior',
            trigger: normalizeTrigger({ type: triggerType || 'state_change' }),
            logic: defaultLogic()
        };
    }

    function normalizeExpression(expression) {
        if (!expression || expression.source === 'always') return conditionGroup('all', [], expression && expression.id);
        if (expression.type === 'group') {
            return conditionGroup(expression.match, (expression.children || []).map(normalizeExpression), expression.id);
        }
        return conditionNode(expression.source, expression.key, expression.operator, expression.value, expression.id);
    }

    function normalizeAction(action) {
        action = action || {};
        var normalized = { id: logicId('action', action.id), type: action.type || 'message' };
        if (normalized.type === 'message') normalized.text = action.text || '';
        if (normalized.type === 'set_overlay') {
            normalized.asset = action.asset || '';
            normalized.prompt = action.prompt || '';
        }
        if (normalized.type === 'set_flag') {
            normalized.key = action.key || '';
            normalized.value = action.value === undefined || action.value === null ? '' : String(action.value);
        }
        if (normalized.type === 'clear_flag' || normalized.type === 'grant_item' || normalized.type === 'remove_item') {
            normalized.key = action.key || '';
        }
        if (normalized.type === 'examine_object') normalized.objectSlug = action.objectSlug || '';
        if (normalized.type === 'set_description') {
            normalized.targetKind = action.targetKind === 'object' ? 'object' : 'room';
            normalized.targetSlug = action.targetSlug || '';
            normalized.text = action.text || '';
        }
        if (normalized.type === 'play_sound') normalized.soundSlug = action.soundSlug || '';
        return normalized;
    }

    function legacyActions(outcome) {
        outcome = outcome || {};
        var actions = [];
        if (outcome.message) actions.push(normalizeAction({ type: 'message', text: outcome.message }));
        if (outcome.overlay) actions.push(normalizeAction({ type: 'set_overlay', asset: outcome.overlay, prompt: outcome.overlayPrompt || '' }));
        if (outcome.setFlag && outcome.setFlag.key) actions.push(normalizeAction({ type: 'set_flag', key: outcome.setFlag.key, value: outcome.setFlag.value }));
        if (outcome.grantItem) actions.push(normalizeAction({ type: 'grant_item', key: outcome.grantItem }));
        if (outcome.unlockDoor) actions.push(normalizeAction({ type: 'unlock_door' }));
        if (outcome.examineObject) actions.push(normalizeAction({ type: 'examine_object', objectSlug: outcome.examineObject }));
        return actions;
    }

    function normalizeLogic(region) {
        region = region || {};
        if (region.logic && Array.isArray(region.logic.branches)) {
            return {
                version: 1,
                branches: region.logic.branches.map(function (branch) {
                    return {
                        id: logicId('branch', branch.id),
                        when: normalizeExpression(branch.when),
                        actions: (branch.actions || []).map(normalizeAction)
                    };
                }),
                elseActions: (region.logic.elseActions || []).map(normalizeAction)
            };
        }
        return {
            version: 1,
            branches: [{
                id: uid('branch'),
                when: normalizeExpression(region.condition || { source: 'always' }),
                actions: legacyActions(region.success)
            }],
            elseActions: legacyActions(region.failure)
        };
    }

    function normalizeAutomaticBehavior(behavior) {
        behavior = behavior || {};
        return {
            id: logicId('behavior', behavior.id),
            name: behavior.name || 'Automatic behavior',
            trigger: normalizeTrigger(behavior.trigger),
            logic: normalizeLogic({ logic: behavior.logic })
        };
    }

    function normalizeAutomaticBehaviors(region) {
        return (region && Array.isArray(region.automaticBehaviors) ? region.automaticBehaviors : []).map(normalizeAutomaticBehavior);
    }

    function stateBucket(state, source) {
        state = state || {};
        if (source === 'item') return state.items || {};
        return state.flags || {};
    }

    function conditionPasses(condition, state) {
        if (!condition || condition.source === 'always') return true;
        if (condition.type === 'group') {
            var children = condition.children || [];
            if (!children.length) return true;
            if (condition.match === 'any') {
                return children.some(function (child) { return conditionPasses(child, state); });
            }
            return children.every(function (child) { return conditionPasses(child, state); });
        }
        if (!condition.key) return false;
        var bucket = stateBucket(state, condition.source);
        var exists = Object.prototype.hasOwnProperty.call(bucket, condition.key);
        if (condition.operator === 'exists') return exists;
        if (condition.operator === 'not_exists') return !exists;
        if (condition.operator === 'not_equals') return !exists || String(bucket[condition.key]) !== String(condition.value);
        return exists && String(bucket[condition.key]) === String(condition.value);
    }

    function conditionTrace(condition, state, trace) {
        trace = trace || [];
        if (!condition || condition.source === 'always') return trace;
        if (condition.type === 'group') {
            (condition.children || []).forEach(function (child) { conditionTrace(child, state, trace); });
            return trace;
        }
        trace.push({
            source: condition.source,
            key: condition.key,
            operator: condition.operator,
            value: condition.value,
            passed: conditionPasses(condition, state)
        });
        return trace;
    }

    function evaluateLogic(rawLogic, state) {
        var logic = normalizeLogic({ logic: rawLogic });
        var testedBranches = [];
        for (var index = 0; index < logic.branches.length; index += 1) {
            var branch = logic.branches[index];
            var passed = conditionPasses(branch.when, state);
            var trace = conditionTrace(branch.when, state);
            testedBranches.push({
                branchId: branch.id,
                branchIndex: index,
                branchLabel: index === 0 ? 'IF' : 'ELSE IF ' + index,
                passed: passed,
                trace: trace
            });
            if (passed) {
                return {
                    branchId: branch.id,
                    branchIndex: index,
                    branchLabel: index === 0 ? 'IF' : 'ELSE IF ' + index,
                    conditionMatched: true,
                    trace: trace,
                    testedBranches: testedBranches,
                    actions: branch.actions
                };
            }
        }
        return {
            branchId: 'else',
            branchIndex: -1,
            branchLabel: 'ELSE',
            conditionMatched: false,
            trace: [],
            testedBranches: testedBranches,
            actions: logic.elseActions
        };
    }

    function evaluateRegion(region, state) {
        return evaluateLogic(normalizeLogic(region), state);
    }

    function ensureState(state) {
        state.flags = state.flags || {};
        state.items = state.items || {};
        state.overlays = state.overlays || {};
        state.unlockedDoors = state.unlockedDoors || {};
        state.descriptions = state.descriptions || {};
        return state;
    }

    function descriptionKey(kind, slug) {
        kind = kind === 'object' ? 'object' : 'room';
        slug = String(slug || '').trim();
        return slug ? kind + ':' + slug : '';
    }

    function applyActions(actions, state, options) {
        options = options || {};
        state = ensureState(state || {});
        var result = { messages: [], examineObjects: [], sounds: [], applied: [], changes: [] };
        var changedState = {};

        function rememberChange(source, key, bucket) {
            var changeKey = source + ':' + key;
            if (!changedState[changeKey]) {
                changedState[changeKey] = {
                    source: source,
                    key: key,
                    previousExists: Object.prototype.hasOwnProperty.call(bucket, key),
                    previousValue: bucket[key]
                };
            }
        }

        (actions || []).forEach(function (rawAction) {
            var action = normalizeAction(rawAction);
            var overlayKey = options.overlayKey || options.regionId;
            var doorKey = options.doorKey || options.regionId;
            if (action.type === 'message' && action.text) result.messages.push(action.text);
            if (action.type === 'set_overlay' && action.asset && overlayKey) state.overlays[overlayKey] = action.asset;
            if (action.type === 'clear_overlay' && overlayKey) delete state.overlays[overlayKey];
            if (action.type === 'set_flag' && action.key) {
                rememberChange('flag', action.key, state.flags);
                state.flags[action.key] = action.value;
            }
            if (action.type === 'clear_flag' && action.key) {
                rememberChange('flag', action.key, state.flags);
                delete state.flags[action.key];
            }
            if (action.type === 'grant_item' && action.key) {
                rememberChange('item', action.key, state.items);
                state.items[action.key] = '1';
            }
            if (action.type === 'remove_item' && action.key) {
                rememberChange('item', action.key, state.items);
                delete state.items[action.key];
            }
            if (action.type === 'unlock_door' && doorKey && options.regionKind === 'door') state.unlockedDoors[doorKey] = true;
            if (action.type === 'examine_object' && action.objectSlug) result.examineObjects.push(action.objectSlug);
            if (action.type === 'set_description') {
                var targetKey = descriptionKey(action.targetKind, action.targetSlug);
                if (targetKey) state.descriptions[targetKey] = action.text;
            }
            if (action.type === 'play_sound' && action.soundSlug) result.sounds.push(action.soundSlug);
            result.applied.push(action.type);
        });
        Object.keys(changedState).forEach(function (changeKey) {
            var change = changedState[changeKey];
            var bucket = stateBucket(state, change.source);
            change.exists = Object.prototype.hasOwnProperty.call(bucket, change.key);
            change.value = bucket[change.key];
            if (change.previousExists !== change.exists || (change.exists && String(change.previousValue) !== String(change.value))) {
                result.changes.push(change);
            }
        });
        result.message = result.messages.join('\n');
        return result;
    }

    function runLogic(logic, state, options) {
        var evaluation = evaluateLogic(logic, state);
        evaluation.effects = applyActions(evaluation.actions, state, options || {});
        return evaluation;
    }

    function runRegion(region, state, options) {
        options = options || {};
        if (region) {
            if (!options.regionId) options.regionId = region.id;
            if (!options.regionKind) options.regionKind = region.kind;
        }
        return runLogic(normalizeLogic(region), state, options);
    }

    function applySuccess(region, state, options) {
        options = options || {};
        if (region) {
            if (!options.regionId) options.regionId = region.id;
            if (!options.regionKind) options.regionKind = region.kind;
        }
        applyActions(legacyActions(region && region.success), state, options);
        return state;
    }

    function canExit(region, state, entryRegionId, doorKey) {
        if (region.kind !== 'door') return false;
        return region.id === entryRegionId || !!state.unlockedDoors[doorKey || region.id] || (!!doorKey && !!state.unlockedDoors[region.id]);
    }

    function shuffledValues(values, random) {
        var result = (values || []).slice();
        random = typeof random === 'function' ? random : Math.random;
        for (var index = result.length - 1; index > 0; index -= 1) {
            var swapIndex = Math.floor(random() * (index + 1));
            var temporary = result[index];
            result[index] = result[swapIndex];
            result[swapIndex] = temporary;
        }
        return result;
    }

    function assignGatewayDestinations(gateway, clusterById, random) {
        gateway = gateway || {};
        clusterById = clusterById || {};
        var candidates = shuffledValues((gateway.candidateClusterIds || []).map(String).filter(function (clusterId) {
            return !!clusterById[clusterId] && !!clusterById[clusterId].entryRoomId;
        }), random);
        var exits = shuffledValues((gateway.exitRegionIds || []).map(String), random);
        var count = Math.min(Number(gateway.destinationCount || 0), candidates.length, exits.length);
        var assignments = {};
        for (var index = 0; index < count; index += 1) {
            var cluster = clusterById[candidates[index]];
            assignments[exits[index]] = {
                gatewayRegionId: exits[index],
                clusterId: String(cluster.id),
                entryRoomId: String(cluster.entryRoomId),
                returnMode: cluster.gatewayReturnMode || 'behind',
                returnRegionId: cluster.gatewayReturnRegionId || ''
            };
        }
        return assignments;
    }

    function ownedObjects(objects, state) {
        return (objects || []).filter(function (object) {
            return object.portable && object.inventoryKey && Object.prototype.hasOwnProperty.call(state.items, object.inventoryKey);
        });
    }

    function normalizeBook(book) {
        book = book && typeof book === 'object' && !Array.isArray(book) ? book : {};
        return {
            enabled: !!book.enabled,
            previousRegionId: String(book.previousRegionId || ''),
            nextRegionId: String(book.nextRegionId || ''),
            pages: (Array.isArray(book.pages) ? book.pages : []).map(function (page) {
                return { asset: page && page.asset ? String(page.asset) : '' };
            })
        };
    }

    function bookPage(book, pageIndex) {
        book = normalizeBook(book);
        if (!book.enabled || !book.pages.length) return null;
        pageIndex = Math.max(0, Math.min(book.pages.length - 1, parseInt(pageIndex, 10) || 0));
        return book.pages[pageIndex];
    }

    function turnBookPage(book, pageIndex, regionId) {
        book = normalizeBook(book);
        pageIndex = Math.max(0, Math.min(Math.max(0, book.pages.length - 1), parseInt(pageIndex, 10) || 0));
        regionId = String(regionId || '');
        var direction = regionId === book.previousRegionId ? 'previous' : (regionId === book.nextRegionId ? 'next' : '');
        if (!book.enabled || !book.pages.length || !direction) {
            return { handled: false, moved: false, direction: '', pageIndex: pageIndex, pageCount: book.pages.length };
        }
        var nextIndex = direction === 'previous'
            ? Math.max(0, pageIndex - 1)
            : Math.min(book.pages.length - 1, pageIndex + 1);
        return {
            handled: true,
            moved: nextIndex !== pageIndex,
            direction: direction,
            pageIndex: nextIndex,
            pageCount: book.pages.length
        };
    }

    return {
        conditionNode: conditionNode,
        conditionGroup: conditionGroup,
        defaultLogic: defaultLogic,
        defaultAutomaticBehavior: defaultAutomaticBehavior,
        normalizeExpression: normalizeExpression,
        normalizeAction: normalizeAction,
        normalizeLogic: normalizeLogic,
        normalizeTrigger: normalizeTrigger,
        normalizeAutomaticBehavior: normalizeAutomaticBehavior,
        normalizeAutomaticBehaviors: normalizeAutomaticBehaviors,
        descriptionKey: descriptionKey,
        conditionPasses: conditionPasses,
        conditionTrace: conditionTrace,
        evaluateLogic: evaluateLogic,
        evaluateRegion: evaluateRegion,
        applyActions: applyActions,
        runLogic: runLogic,
        runRegion: runRegion,
        applySuccess: applySuccess,
        canExit: canExit,
        assignGatewayDestinations: assignGatewayDestinations,
        ownedObjects: ownedObjects,
        normalizeBook: normalizeBook,
        bookPage: bookPage,
        turnBookPage: turnBookPage
    };
}));
