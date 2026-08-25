(function (root, $) {
    'use strict';

    function create(options) {
        var rules = root.NLRoomRules;
        var container = $(options.root);
        var region = null;
        var expandedGenerators = {};
        var expandedOverlayLibraries = {};
        var generationMessages = {};
        var activeBehaviorId = 'click';
        var maxBranches = 10;
        var maxConditions = 25;
        var maxActions = 25;
        var maxAutomaticBehaviors = 25;

        function esc(value) {
            return $('<div>').text(value === undefined || value === null ? '' : value).html().replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        function notify(message, error) {
            if (options.notify) options.notify(message, error);
        }

        function changed() {
            if (options.onChange) options.onChange(region);
        }

        function activeBehavior() {
            if (!region || activeBehaviorId === 'click') return null;
            return (region.automaticBehaviors || []).find(function (behavior) { return behavior.id === activeBehaviorId; }) || null;
        }

        function activeLogic() {
            var behavior = activeBehavior();
            return behavior ? behavior.logic : (region ? region.logic : null);
        }

        function allLogics() {
            if (!region) return [];
            return [region.logic].concat((region.automaticBehaviors || []).map(function (behavior) { return behavior.logic; }));
        }

        function findNode(expression, id, parent, depth) {
            if (!expression) return null;
            if (expression.id === id) return { node: expression, parent: parent || null, depth: depth || 0 };
            if (expression.type !== 'group') return null;
            for (var index = 0; index < expression.children.length; index += 1) {
                var result = findNode(expression.children[index], id, expression, (depth || 0) + 1);
                if (result) return result;
            }
            return null;
        }

        function findBranch(id) {
            var logic = activeLogic();
            if (!logic) return null;
            return logic.branches.find(function (branch) { return branch.id === id; }) || null;
        }

        function actionList(branchId) {
            var logic = activeLogic();
            if (!logic) return [];
            if (branchId === 'else') return logic.elseActions;
            var branch = findBranch(branchId);
            return branch ? branch.actions : [];
        }

        function findAction(branchId, actionId) {
            return actionList(branchId).find(function (action) { return action.id === actionId; }) || null;
        }

        function countConditions(expression) {
            if (!expression) return 0;
            if (expression.type !== 'group') return 1;
            return expression.children.reduce(function (total, child) { return total + countConditions(child); }, 0);
        }

        function inventoryKey(object) {
            return object && (object.inventory_key || object.inventoryKey) || '';
        }

        function isPortable(object) {
            return object && (object.portable === true || object.portable === 1 || object.portable === '1');
        }

        function inventoryObjects() {
            return (options.objects || []).filter(function (object) {
                return isPortable(object) && inventoryKey(object);
            });
        }

        function searchPicker(type, selected, settings, entries) {
            var current = entries.find(function (entry) { return entry.value === selected; });
            var label = current ? current.label : (selected ? settings.customLabel : settings.placeholder);
            var detail = current ? current.detail : (selected || (entries.length ? settings.searchHint : settings.emptyDetail));
            var html = '<div class="logic-inventory-picker logic-value-picker" data-picker-type="' + esc(type) + '" data-value="' + esc(selected) + '">' +
                '<button type="button" class="logic-picker-toggle" aria-haspopup="listbox" aria-expanded="false"><span><strong>' + esc(label) + '</strong><small>' + esc(detail) + '</small></span><i class="fa-solid fa-chevron-down"></i></button>' +
                '<div class="logic-picker-menu"><div class="logic-picker-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="' + esc(settings.searchPlaceholder) + '" aria-label="' + esc(settings.searchPlaceholder) + '"></div><div class="logic-picker-options" role="listbox">' +
                '<button type="button" class="logic-picker-option" data-value="" data-search="clear selection"><span><strong>' + esc(settings.clearLabel) + '</strong><small>' + esc(settings.clearDetail) + '</small></span>' + (!selected ? '<i class="fa-solid fa-check"></i>' : '') + '</button>';
            entries.forEach(function (entry) {
                html += '<button type="button" class="logic-picker-option" role="option" aria-selected="' + (selected === entry.value ? 'true' : 'false') + '" data-value="' + esc(entry.value) + '" data-search="' + esc(entry.search.toLowerCase()) + '"><span><strong>' + esc(entry.label) + '</strong><small>' + esc(entry.detail) + '</small></span>' + (selected === entry.value ? '<i class="fa-solid fa-check"></i>' : '') + '</button>';
            });
            if (settings.allowNew) {
                html += '<button type="button" class="logic-picker-option logic-create-picker-value" hidden><span><strong>Use as a new flag</strong><small></small></span><i class="fa-solid fa-plus"></i></button>';
            }
            if (!entries.length) html += '<p class="logic-picker-empty">' + esc(settings.emptyHelp) + '</p>';
            return html + '</div></div></div>';
        }

        function inventoryPicker(selected) {
            var objects = inventoryObjects();
            var entries = objects.map(function (object) {
                var key = inventoryKey(object);
                return { value: key, label: object.title, detail: key, search: object.title + ' ' + object.slug + ' ' + key };
            });
            return searchPicker('inventory', selected, {
                placeholder: 'Choose inventory object', customLabel: 'Custom key', searchHint: 'Search by name or key', emptyDetail: 'No portable objects available',
                searchPlaceholder: 'Search inventory objects', clearLabel: 'No item selected', clearDetail: 'Clear this inventory key',
                emptyHelp: 'Make an object portable and save it to use its inventory key here.'
            }, entries);
        }

        function flagPicker(selected) {
            var entries = (options.flags || []).map(function (flag) {
                var references = Array.isArray(flag.references) ? flag.references : [];
                var associations = references.length + ' saved association' + (references.length === 1 ? '' : 's');
                var search = [flag.key];
                references.forEach(function (reference) {
                    search.push(reference.contentTitle, reference.contentSlug, reference.regionName);
                });
                return { value: flag.key, label: flag.key, detail: associations, search: search.join(' ') };
            });
            return searchPicker('flag', selected, {
                placeholder: 'Choose or create a flag', customLabel: 'New or unsaved flag', searchHint: 'Search saved flags or type a new name', emptyDetail: 'Type a new flag name',
                searchPlaceholder: 'Search or create a flag', clearLabel: 'No flag selected', clearDetail: 'Clear this flag key',
                emptyHelp: 'Type a new flag name above, then choose “Use as a new flag.”', allowNew: true
            }, entries);
        }

        function objectPicker(selected) {
            var entries = (options.objects || []).map(function (object) {
                var detail = object.slug + (isPortable(object) ? (inventoryKey(object) ? ' · inventory: ' + inventoryKey(object) : ' · portable') : ' · room-bound');
                return { value: object.slug, label: object.title, detail: detail, search: object.title + ' ' + object.slug + ' ' + inventoryKey(object) };
            });
            return searchPicker('object', selected, {
                placeholder: 'Choose an object', customLabel: 'Unavailable object', searchHint: 'Search by object name or slug', emptyDetail: 'No saved objects available',
                searchPlaceholder: 'Search objects', clearLabel: 'No object selected', clearDetail: 'Clear this object result',
                emptyHelp: 'Save an object before selecting it for examination.'
            }, entries);
        }

        function descriptionTargetPicker(selectedKind, selectedSlug) {
            var selected = selectedSlug ? (selectedKind === 'object' ? 'object:' : 'room:') + selectedSlug : '';
            var entries = [];
            (options.rooms || []).forEach(function (room) {
                entries.push({
                    value: 'room:' + room.slug,
                    label: room.title,
                    detail: 'Room · ' + room.slug + (room.clusterName ? ' · ' + room.clusterName : ''),
                    search: 'room ' + room.title + ' ' + room.slug + ' ' + (room.clusterName || '')
                });
            });
            (options.objects || []).forEach(function (object) {
                entries.push({
                    value: 'object:' + object.slug,
                    label: object.title,
                    detail: 'Object · ' + object.slug,
                    search: 'object ' + object.title + ' ' + object.slug
                });
            });
            return searchPicker('description_target', selected, {
                placeholder: 'Choose a room or object', customLabel: 'Unavailable content', searchHint: 'Search rooms and objects', emptyDetail: 'No saved content available',
                searchPlaceholder: 'Search rooms and objects', clearLabel: 'No description target', clearDetail: 'Clear this target',
                emptyHelp: 'Save a room or object before selecting its player description.'
            }, entries);
        }

        function soundPicker(selected) {
            var entries = (options.sounds || []).map(function (sound) {
                return { value: sound.slug, label: sound.name, detail: sound.slug, search: sound.name + ' ' + sound.slug + ' ' + (sound.originalFilename || '') };
            });
            return searchPicker('sound', selected, {
                placeholder: 'Choose a sound', customLabel: 'Unavailable sound', searchHint: 'Search by name or slug', emptyDetail: 'No saved sounds available',
                searchPlaceholder: 'Search sounds', clearLabel: 'No sound selected', clearDetail: 'Clear this sound',
                emptyHelp: 'Upload sounds from the top-level Sounds tab before selecting one here.'
            }, entries);
        }

        function addOverlayToLibrary(asset, prompt, source) {
            if (!region || !asset || !String(asset).trim()) return;
            asset = String(asset).trim();
            if (!Array.isArray(region.overlayLibrary)) region.overlayLibrary = [];
            var existing = region.overlayLibrary.find(function (entry) { return entry.asset === asset; });
            if (existing) {
                if (prompt && !existing.prompt) existing.prompt = prompt;
                if (source && !existing.source) existing.source = source;
                return;
            }
            if (region.overlayLibrary.length >= 100) region.overlayLibrary.shift();
            region.overlayLibrary.push({ asset: asset, prompt: prompt || '', source: source || 'saved' });
        }

        function syncOverlayLibrary() {
            var existing = Array.isArray(region.overlayLibrary) ? region.overlayLibrary : [];
            region.overlayLibrary = [];
            existing.forEach(function (entry) {
                if (typeof entry === 'string') addOverlayToLibrary(entry, '', 'saved');
                else if (entry && typeof entry === 'object') addOverlayToLibrary(entry.asset, entry.prompt, entry.source);
            });
            allLogics().forEach(function (logic) {
                logic.branches.forEach(function (branch) {
                    branch.actions.forEach(function (action) {
                        if (action.type === 'set_overlay') addOverlayToLibrary(action.asset, action.prompt, 'saved');
                    });
                });
                logic.elseActions.forEach(function (action) {
                    if (action.type === 'set_overlay') addOverlayToLibrary(action.asset, action.prompt, 'saved');
                });
            });
        }

        function overlayName(entry) {
            if (entry.prompt) return entry.prompt;
            var pieces = String(entry.asset || '').split('/');
            var filename = pieces[pieces.length - 1] || 'Saved overlay';
            return entry.source === 'captured' ? 'Captured appearance · ' + filename : filename;
        }

        function overlayLibraryMarkup(action) {
            var entries = Array.isArray(region.overlayLibrary) ? region.overlayLibrary.slice().reverse() : [];
            var expanded = !!expandedOverlayLibraries[action.id];
            var html = '<button type="button" class="overlay-library-toggle" aria-expanded="' + (expanded ? 'true' : 'false') + '"' + (!entries.length ? ' disabled' : '') + '><i class="fa-solid fa-clock-rotate-left"></i><span>Reuse a region overlay' + (entries.length ? ' <small>' + entries.length + '</small>' : '') + '</span><i class="fa-solid fa-chevron-down"></i></button>' +
                '<div class="overlay-library' + (expanded ? ' visible' : '') + '"><p class="hint">Previously captured, uploaded, generated, or selected overlays for this region.</p><div class="overlay-library-grid">';
            entries.forEach(function (entry) {
                var selected = action.asset === entry.asset;
                html += '<button type="button" class="logic-overlay-choice' + (selected ? ' selected' : '') + '" data-asset="' + esc(entry.asset) + '" title="' + esc(overlayName(entry)) + '"><img src="' + esc(entry.asset) + '" alt=""><span>' + esc(overlayName(entry)) + '</span>' + (selected ? '<i class="fa-solid fa-check"></i>' : '') + '</button>';
            });
            return html + '</div></div>';
        }

        function conditionOptions(selected, source) {
            var labels = source === 'item' ? {
                equals: 'Value equals', not_equals: 'Value does not equal', exists: 'Player has item', not_exists: 'Player lacks item'
            } : {
                equals: 'Equals', not_equals: 'Does not equal', exists: 'Is set', not_exists: 'Is not set'
            };
            return ['equals', 'not_equals', 'exists', 'not_exists'].map(function (value) {
                return '<option value="' + value + '"' + (selected === value ? ' selected' : '') + '>' + labels[value] + '</option>';
            }).join('');
        }

        function renderCondition(condition) {
            var hideValue = condition.operator === 'exists' || condition.operator === 'not_exists';
            var keyField = condition.source === 'item'
                ? inventoryPicker(condition.key)
                : flagPicker(condition.key);
            return '<div class="logic-condition" data-node-id="' + esc(condition.id) + '">' +
                '<select class="logic-condition-field logic-source" data-field="source" aria-label="Condition source">' +
                    '<option value="flag"' + (condition.source === 'flag' ? ' selected' : '') + '>Flag</option>' +
                    '<option value="item"' + (condition.source === 'item' ? ' selected' : '') + '>Player item</option>' +
                '</select>' +
                keyField +
                '<select class="logic-condition-field logic-operator" data-field="operator" aria-label="Condition comparison">' + conditionOptions(condition.operator, condition.source) + '</select>' +
                '<input class="logic-condition-field logic-value" data-field="value" value="' + esc(condition.value) + '" placeholder="value" aria-label="Condition value"' + (hideValue ? ' hidden' : '') + '>' +
                '<button type="button" class="logic-icon danger logic-remove-node" title="Remove condition"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>';
        }

        function renderGroup(group, depth, isRoot) {
            var connector = group.match === 'any' ? 'OR' : 'AND';
            var html = '<div class="logic-group' + (isRoot ? ' root' : '') + '" data-node-id="' + esc(group.id) + '" data-depth="' + depth + '">';
            html += '<div class="logic-group-header"><span>Match</span><select class="logic-group-match" aria-label="Condition group matching"><option value="all"' + (group.match === 'all' ? ' selected' : '') + '>ALL · AND</option><option value="any"' + (group.match === 'any' ? ' selected' : '') + '>ANY · OR</option></select><span>conditions</span>';
            if (!isRoot) html += '<button type="button" class="logic-icon danger logic-remove-node" title="Remove group"><i class="fa-solid fa-trash"></i></button>';
            html += '</div><div class="logic-group-children">';
            if (!group.children.length) html += '<p class="logic-empty">No conditions: this branch always matches.</p>';
            group.children.forEach(function (child, index) {
                if (index) html += '<div class="logic-connector"><span>' + connector + '</span></div>';
                html += child.type === 'group' ? renderGroup(child, depth + 1, false) : renderCondition(child);
            });
            html += '</div><div class="logic-group-actions"><button type="button" class="btn-ghost logic-add-condition"><i class="fa-solid fa-plus"></i> Condition</button>';
            if (depth < 2) html += '<button type="button" class="btn-ghost logic-add-group"><i class="fa-solid fa-code-branch"></i> Group</button>';
            html += '</div></div>';
            return html;
        }

        function availableActionTypes(selected) {
            var types = [
                ['message', 'Show player message'],
                ['set_overlay', 'Show / replace overlay'],
                ['clear_overlay', 'Remove overlay'],
                ['set_flag', 'Set flag'],
                ['clear_flag', 'Clear flag'],
                ['grant_item', 'Grant item'],
                ['remove_item', 'Remove item'],
                ['set_description', 'Change player description'],
                ['play_sound', 'Play sound']
            ];
            if (region && region.kind === 'door') types.push(['unlock_door', 'Unlock this door']);
            if (!options.isObject) types.push(['examine_object', 'Open object viewer']);
            if (selected && !types.some(function (entry) { return entry[0] === selected; })) types.push([selected, selected.replace(/_/g, ' ')]);
            return types.map(function (entry) {
                return '<option value="' + esc(entry[0]) + '"' + (selected === entry[0] ? ' selected' : '') + '>' + esc(entry[1]) + '</option>';
            }).join('');
        }

        function renderActionFields(action) {
            if (action.type === 'message') {
                return '<label>Player message</label><textarea class="logic-action-field" data-field="text" rows="3" placeholder="Describe what the player notices.">' + esc(action.text) + '</textarea>';
            }
            if (action.type === 'set_overlay') {
                var expanded = !!expandedGenerators[action.id];
                var message = generationMessages[action.id] || '';
                return '<label>Overlay graphic URL</label><input class="logic-action-field" data-field="asset" value="' + esc(action.asset) + '" placeholder="../assets/graphics/rooms/generated/overlay.jpg">' +
                    (action.asset ? '<img class="overlay-preview visible logic-overlay-preview" src="' + esc(action.asset) + '" alt="Overlay preview">' : '') +
                    overlayLibraryMarkup(action) +
                    '<label class="mini-upload logic-overlay-upload"><i class="fa-solid fa-upload"></i> Upload a new overlay<input class="logic-overlay-file" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
                    '<button type="button" class="overlay-generator-toggle logic-generator-toggle" aria-expanded="' + (expanded ? 'true' : 'false') + '"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Generate overlay with Gemini</span><i class="fa-solid fa-chevron-down"></i></button>' +
                    '<div class="overlay-generator logic-overlay-generator' + (expanded ? ' visible' : '') + '"><p class="hint">Gemini receives this exact region crop. Describe only what should change.</p><label>Overlay edit prompt</label><textarea class="logic-action-field logic-overlay-prompt" data-field="prompt" rows="4" maxlength="2000" placeholder="Show the compartment opened.">' + esc(action.prompt) + '</textarea><div class="prompt-meta"><span><i class="fa-solid fa-crop-simple"></i> Uses selected region</span><span>' + (action.prompt || '').length + ' / 2000</span></div><button type="button" class="btn-forge btn-block logic-generate-overlay"><i class="fa-solid fa-sparkles"></i> Generate region overlay</button><div class="generation-status logic-generation-status' + (message ? ' visible' : '') + '">' + esc(message) + '</div></div>';
            }
            if (action.type === 'clear_overlay') return '<p class="logic-action-note"><i class="fa-solid fa-eraser"></i> Removes any overlay currently displayed for this region.</p>';
            if (action.type === 'set_flag') return '<div class="two-cols"><div><label>Flag</label>' + flagPicker(action.key) + '</div><div><label>Value</label><input class="logic-action-field" data-field="value" value="' + esc(action.value) + '" placeholder="yes"></div></div>';
            if (action.type === 'clear_flag') return '<label>Flag</label>' + flagPicker(action.key);
            if (action.type === 'grant_item' || action.type === 'remove_item') return '<label>Inventory object</label>' + inventoryPicker(action.key);
            if (action.type === 'unlock_door') return '<p class="logic-action-note"><i class="fa-solid fa-lock-open"></i> Unlocks this door for the current play session.</p>';
            if (action.type === 'examine_object') return '<label>Object to examine</label>' + objectPicker(action.objectSlug) + '<p class="hint">The object opens over the room after this branch runs.</p>';
            if (action.type === 'set_description') return '<label>Room or object</label>' + descriptionTargetPicker(action.targetKind, action.targetSlug) + '<label>New player description</label><textarea class="logic-action-field" data-field="text" rows="4" maxlength="8000" placeholder="Describe what the player now sees.">' + esc(action.text) + '</textarea>';
            if (action.type === 'play_sound') return '<label>Sound</label>' + soundPicker(action.soundSlug) + '<p class="logic-action-note"><i class="fa-solid fa-volume-high"></i> Plays the selected sound when this result runs.</p>';
            return '<p class="logic-action-note">This action type is not supported by this editor.</p>';
        }

        function renderAction(action, branchId, index, total) {
            return '<div class="logic-action" data-branch-id="' + esc(branchId) + '" data-action-id="' + esc(action.id) + '">' +
                '<div class="logic-action-header"><select class="logic-action-type" aria-label="Result type">' + availableActionTypes(action.type) + '</select><span class="logic-order-controls"><button type="button" class="logic-icon logic-move-action" data-direction="up" title="Move result up"' + (index === 0 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-up"></i></button><button type="button" class="logic-icon logic-move-action" data-direction="down" title="Move result down"' + (index === total - 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-down"></i></button><button type="button" class="logic-icon danger logic-remove-action" title="Remove result"><i class="fa-solid fa-trash"></i></button></span></div>' +
                '<div class="logic-action-fields">' + renderActionFields(action) + '</div></div>';
        }

        function renderActions(actions, branchId) {
            var html = '<div class="logic-actions" data-branch-id="' + esc(branchId) + '">';
            if (!actions.length) html += '<p class="logic-empty">No results yet. The interaction will not change state.</p>';
            actions.forEach(function (action, index) { html += renderAction(action, branchId, index, actions.length); });
            html += '<button type="button" class="btn-ghost logic-add-action"><i class="fa-solid fa-plus"></i> Result</button></div>';
            return html;
        }

        function renderBranch(branch, index, total) {
            var label = index === 0 ? 'IF' : 'ELSE IF ' + index;
            return '<section class="logic-branch" data-branch-id="' + esc(branch.id) + '"><header class="logic-branch-header"><span class="logic-branch-label">' + label + '</span><span class="logic-order-controls"><button type="button" class="logic-icon logic-move-branch" data-direction="up" title="Move branch up"' + (index === 0 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-up"></i></button><button type="button" class="logic-icon logic-move-branch" data-direction="down" title="Move branch down"' + (index === total - 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-down"></i></button>' + (total > 1 ? '<button type="button" class="logic-icon danger logic-remove-branch" title="Remove branch"><i class="fa-solid fa-trash"></i></button>' : '') + '</span></header>' +
                renderGroup(branch.when, 0, true) + '<div class="section-rule then"><span>THEN</span></div>' + renderActions(branch.actions, branch.id) + '</section>';
        }

        function triggerSummary(behavior) {
            var trigger = behavior.trigger || {};
            if (trigger.type === 'room_enter') return 'When the player enters this room';
            if (trigger.type === 'object_open') return 'When the object viewer opens';
            var source = trigger.source === 'item' ? 'Item' : 'Flag';
            return source + ' changes' + (trigger.key ? ': ' + trigger.key : '');
        }

        function renderBehaviorNavigation() {
            var html = '<section class="logic-behavior-manager"><div class="logic-behavior-heading"><div><strong>Region behaviors</strong><small>A region can respond to clicks and automatic game events.</small></div><button type="button" class="btn-ghost logic-add-behavior"' + ((region.automaticBehaviors || []).length >= maxAutomaticBehaviors ? ' disabled' : '') + '><i class="fa-solid fa-plus"></i> Automatic</button></div><div class="logic-behavior-tabs">';
            html += '<button type="button" class="logic-behavior-tab' + (activeBehaviorId === 'click' ? ' active' : '') + '" data-behavior-id="click"><i class="fa-solid fa-hand-pointer"></i><span><strong>Player click</strong><small>When this region is clicked</small></span></button>';
            (region.automaticBehaviors || []).forEach(function (behavior) {
                html += '<button type="button" class="logic-behavior-tab' + (activeBehaviorId === behavior.id ? ' active' : '') + '" data-behavior-id="' + esc(behavior.id) + '"><i class="fa-solid fa-bolt"></i><span><strong>' + esc(behavior.name) + '</strong><small>' + esc(triggerSummary(behavior)) + '</small></span></button>';
            });
            return html + '</div></section>';
        }

        function renderTriggerSettings(behavior) {
            if (!behavior) return '';
            var trigger = behavior.trigger || {};
            var activationType = options.isObject ? 'object_open' : 'room_enter';
            var activationLabel = options.isObject ? 'Object viewer opens' : 'Player enters room';
            var html = '<section class="logic-behavior-trigger"><div class="logic-behavior-trigger-heading"><strong>Automatic trigger</strong><button type="button" class="logic-icon danger logic-remove-behavior" title="Delete automatic behavior"><i class="fa-solid fa-trash"></i></button></div>' +
                '<label>Behavior name</label><input class="logic-behavior-name" maxlength="190" value="' + esc(behavior.name) + '" placeholder="Generator-powered machinery">' +
                '<label>Run this behavior when</label><select class="logic-trigger-type"><option value="state_change"' + (trigger.type === 'state_change' ? ' selected' : '') + '>A flag or inventory item changes</option><option value="' + activationType + '"' + (trigger.type === activationType ? ' selected' : '') + '>' + activationLabel + '</option></select>';
            if (trigger.type === 'state_change') {
                html += '<div class="two-cols logic-trigger-state"><div><label>State type</label><select class="logic-trigger-source"><option value="flag"' + (trigger.source === 'flag' ? ' selected' : '') + '>Flag</option><option value="item"' + (trigger.source === 'item' ? ' selected' : '') + '>Inventory item</option></select></div><div><label>Watch</label>' + (trigger.source === 'item' ? inventoryPicker(trigger.key) : flagPicker(trigger.key)) + '</div></div>' +
                    '<p class="hint">Runs only when this value actually changes. Persistent results apply remotely; messages, sounds, and viewers appear only while this room or object is active.</p>';
            } else {
                html += '<p class="hint">Runs every time this ' + (options.isObject ? 'object is opened' : 'room becomes active') + '.</p>';
            }
            return html + '</section>';
        }

        function render() {
            if (!region) {
                container.empty();
                return;
            }
            var behavior = activeBehavior();
            var logic = activeLogic();
            if (!logic) return;
            var html = renderBehaviorNavigation() + renderTriggerSettings(behavior) + '<div class="logic-editor-intro"><strong>' + (behavior ? esc(behavior.name) : 'Click interaction') + ' logic</strong><small>Branches run from top to bottom; the first match wins.</small></div>';
            logic.branches.forEach(function (branch, index) { html += renderBranch(branch, index, logic.branches.length); });
            html += '<button type="button" class="btn-ghost btn-block logic-add-branch"><i class="fa-solid fa-code-branch"></i> Add ELSE IF</button>' +
                '<section class="logic-branch logic-else" data-branch-id="else"><header class="logic-branch-header"><span class="logic-branch-label">ELSE</span><small>Runs when no branch matches</small></header>' + renderActions(logic.elseActions, 'else') + '</section>';
            container.html(html);
        }

        function setRegion(nextRegion) {
            region = nextRegion || null;
            activeBehaviorId = 'click';
            if (region) {
                region.logic = rules.normalizeLogic(region);
                if (!region.logic.branches.length) region.logic.branches = rules.defaultLogic().branches;
                region.automaticBehaviors = rules.normalizeAutomaticBehaviors(region);
                syncOverlayLibrary();
            }
            render();
        }

        container.on('click', '.logic-behavior-tab', function () {
            activeBehaviorId = String($(this).attr('data-behavior-id') || 'click');
            render();
        });

        container.on('click', '.logic-add-behavior', function () {
            if (!region || region.automaticBehaviors.length >= maxAutomaticBehaviors) return notify('A region may contain at most ' + maxAutomaticBehaviors + ' automatic behaviors.', true);
            var behavior = rules.defaultAutomaticBehavior('state_change');
            region.automaticBehaviors.push(behavior);
            activeBehaviorId = behavior.id;
            changed(); render();
        });

        container.on('click', '.logic-remove-behavior', function () {
            var behavior = activeBehavior();
            if (!behavior || !window.confirm('Delete this automatic behavior?')) return;
            region.automaticBehaviors = region.automaticBehaviors.filter(function (candidate) { return candidate.id !== behavior.id; });
            activeBehaviorId = 'click';
            changed(); render();
        });

        container.on('input', '.logic-behavior-name', function () {
            var behavior = activeBehavior();
            if (!behavior) return;
            behavior.name = $(this).val();
            changed();
            container.find('.logic-behavior-tab[data-behavior-id="' + behavior.id + '"] strong').text(behavior.name || 'Automatic behavior');
            container.find('.logic-editor-intro strong').text((behavior.name || 'Automatic behavior') + ' logic');
        });

        container.on('change', '.logic-trigger-type', function () {
            var behavior = activeBehavior();
            if (!behavior) return;
            behavior.trigger = rules.normalizeTrigger({ type: $(this).val(), source: behavior.trigger.source, key: behavior.trigger.key });
            changed(); render();
        });

        container.on('change', '.logic-trigger-source', function () {
            var behavior = activeBehavior();
            if (!behavior || behavior.trigger.type !== 'state_change') return;
            behavior.trigger.source = $(this).val() === 'item' ? 'item' : 'flag';
            behavior.trigger.key = '';
            changed(); render();
        });

        container.on('change', '.logic-group-match', function () {
            var groupElement = $(this).closest('.logic-group');
            var branch = findBranch($(this).closest('.logic-branch').data('branch-id'));
            var found = branch && findNode(branch.when, groupElement.data('node-id'));
            if (!found) return;
            found.node.match = $(this).val() === 'any' ? 'any' : 'all';
            changed(); render();
        });

        container.on('input change', '.logic-condition-field', function (event) {
            var branch = findBranch($(this).closest('.logic-branch').data('branch-id'));
            var found = branch && findNode(branch.when, $(this).closest('.logic-condition').data('node-id'));
            if (!found) return;
            var field = $(this).data('field');
            var previous = found.node[field];
            found.node[field] = $(this).val();
            if (field === 'source' && previous !== found.node.source) {
                found.node.key = '';
                found.node.value = '';
                found.node.operator = found.node.source === 'item' ? 'exists' : 'equals';
            }
            changed();
            if (event.type === 'change' && (field === 'source' || field === 'operator')) render();
        });

        container.on('click', '.logic-inventory-picker', function (event) {
            event.stopPropagation();
        });

        container.on('click', '.logic-picker-toggle', function () {
            var picker = $(this).closest('.logic-inventory-picker');
            var opening = !picker.hasClass('open');
            container.find('.logic-inventory-picker.open').not(picker).removeClass('open').find('.logic-picker-toggle').attr('aria-expanded', 'false');
            picker.toggleClass('open', opening);
            $(this).attr('aria-expanded', opening ? 'true' : 'false');
            if (opening) picker.find('.logic-picker-search input').val('').trigger('input').focus();
        });

        container.on('input', '.logic-picker-search input', function () {
            var query = $(this).val().trim().toLowerCase();
            var picker = $(this).closest('.logic-inventory-picker');
            picker.find('.logic-picker-option[data-search]').each(function () {
                $(this).toggle(!query || String($(this).data('search') || '').indexOf(query) !== -1);
            });
            var createOption = picker.find('.logic-create-picker-value');
            if (createOption.length) {
                var rawValue = $(this).val().trim();
                var exactMatch = picker.find('.logic-picker-option[data-value]').filter(function () { return $(this).attr('data-value') === rawValue; }).length > 0;
                createOption.prop('hidden', !rawValue || rawValue.length > 190 || exactMatch);
                createOption.find('small').text(rawValue);
            }
        });

        container.on('keydown', '.logic-picker-search input', function (event) {
            var picker = $(this).closest('.logic-inventory-picker');
            if (event.key === 'Enter') {
                event.preventDefault();
                var createOption = picker.find('.logic-create-picker-value:not([hidden])');
                if (createOption.length) createOption.trigger('click');
                else picker.find('.logic-picker-option[data-search]:visible').first().trigger('click');
                return;
            }
            if (event.key === 'Escape') {
                picker.removeClass('open');
                picker.find('.logic-picker-toggle').attr('aria-expanded', 'false').focus();
            }
        });

        function assignPickerValue(picker, value) {
            var pickerType = picker.attr('data-picker-type');
            if (pickerType === 'flag' && value && !(options.flags || []).some(function (flag) { return flag.key === value; })) {
                options.flags = options.flags || [];
                options.flags.push({ key: value, references: [] });
                options.flags.sort(function (first, second) { return first.key.localeCompare(second.key); });
            }
            var triggerElement = picker.closest('.logic-behavior-trigger');
            var conditionElement = picker.closest('.logic-condition');
            if (triggerElement.length) {
                var behavior = activeBehavior();
                if (!behavior || behavior.trigger.type !== 'state_change') return;
                behavior.trigger.key = value;
            } else if (conditionElement.length) {
                var branch = findBranch(picker.closest('.logic-branch').data('branch-id'));
                var found = branch && findNode(branch.when, conditionElement.data('node-id'));
                if (!found) return;
                found.node.key = value;
            } else {
                var actionElement = picker.closest('.logic-action');
                var action = findAction(actionElement.data('branch-id'), actionElement.data('action-id'));
                if (!action) return;
                if (pickerType === 'object') action.objectSlug = value;
                else if (pickerType === 'description_target') {
                    var separator = value.indexOf(':');
                    action.targetKind = separator > 0 && value.slice(0, separator) === 'object' ? 'object' : 'room';
                    action.targetSlug = separator > 0 ? value.slice(separator + 1) : '';
                }
                else if (pickerType === 'sound') action.soundSlug = value;
                else action.key = value;
            }
            changed(); render();
        }

        container.on('click', '.logic-picker-option[data-value]', function () {
            assignPickerValue($(this).closest('.logic-inventory-picker'), $(this).attr('data-value') || '');
        });

        container.on('click', '.logic-create-picker-value', function () {
            var picker = $(this).closest('.logic-inventory-picker');
            assignPickerValue(picker, picker.find('.logic-picker-search input').val().trim());
        });

        $(document).on('click', function () {
            container.find('.logic-inventory-picker.open').removeClass('open').find('.logic-picker-toggle').attr('aria-expanded', 'false');
        });

        container.on('click', '.logic-add-condition', function () {
            var branch = findBranch($(this).closest('.logic-branch').data('branch-id'));
            var found = branch && findNode(branch.when, $(this).closest('.logic-group').data('node-id'));
            if (!found) return;
            if (countConditions(branch.when) >= maxConditions) return notify('A branch may contain at most ' + maxConditions + ' conditions.', true);
            found.node.children.push(rules.conditionNode('flag', '', 'equals', ''));
            changed(); render();
        });

        container.on('click', '.logic-add-group', function () {
            var branch = findBranch($(this).closest('.logic-branch').data('branch-id'));
            var found = branch && findNode(branch.when, $(this).closest('.logic-group').data('node-id'));
            if (!found || found.depth >= 2) return;
            if (countConditions(branch.when) >= maxConditions) return notify('A branch may contain at most ' + maxConditions + ' conditions.', true);
            found.node.children.push(rules.conditionGroup('all', [rules.conditionNode('flag', '', 'equals', '')]));
            changed(); render();
        });

        container.on('click', '.logic-remove-node', function () {
            var branch = findBranch($(this).closest('.logic-branch').data('branch-id'));
            var found = branch && findNode(branch.when, $(this).closest('[data-node-id]').data('node-id'));
            if (!found || !found.parent) return;
            found.parent.children = found.parent.children.filter(function (child) { return child.id !== found.node.id; });
            changed(); render();
        });

        container.on('click', '.logic-add-branch', function () {
            var logic = activeLogic();
            if (logic.branches.length >= maxBranches) return notify('A behavior may contain at most ' + maxBranches + ' IF / ELSE IF branches.', true);
            logic.branches.push(rules.defaultLogic().branches[0]);
            changed(); render();
        });

        container.on('click', '.logic-remove-branch', function () {
            var id = $(this).closest('.logic-branch').data('branch-id');
            var logic = activeLogic();
            logic.branches = logic.branches.filter(function (branch) { return branch.id !== id; });
            changed(); render();
        });

        container.on('click', '.logic-move-branch', function () {
            var branchElement = $(this).closest('.logic-branch');
            var id = branchElement.data('branch-id');
            var logic = activeLogic();
            var index = logic.branches.findIndex(function (branch) { return branch.id === id; });
            var target = $(this).data('direction') === 'up' ? index - 1 : index + 1;
            if (index < 0 || target < 0 || target >= logic.branches.length) return;
            var moved = logic.branches.splice(index, 1)[0];
            logic.branches.splice(target, 0, moved);
            changed(); render();
        });

        container.on('click', '.logic-add-action', function () {
            var branchId = $(this).closest('.logic-actions').data('branch-id');
            var actions = actionList(branchId);
            if (actions.length >= maxActions) return notify('A branch may contain at most ' + maxActions + ' results.', true);
            actions.push(rules.normalizeAction({ type: 'message' }));
            changed(); render();
        });

        container.on('change', '.logic-action-type', function () {
            var element = $(this).closest('.logic-action');
            var branchId = element.data('branch-id');
            var actions = actionList(branchId);
            var index = actions.findIndex(function (action) { return action.id === element.data('action-id'); });
            if (index < 0) return;
            actions[index] = rules.normalizeAction({ id: actions[index].id, type: $(this).val() });
            changed(); render();
        });

        container.on('input change', '.logic-action-field', function (event) {
            var element = $(this).closest('.logic-action');
            var action = findAction(element.data('branch-id'), element.data('action-id'));
            if (!action) return;
            action[$(this).data('field')] = $(this).val();
            changed();
            if ($(this).hasClass('logic-overlay-prompt')) $(this).siblings('.prompt-meta').find('span:last-child').text($(this).val().length + ' / 2000');
            if ($(this).data('field') === 'asset') {
                var preview = element.find('.logic-overlay-preview');
                if (preview.length) preview.attr('src', $(this).val());
                if (event.type === 'change') {
                    addOverlayToLibrary(action.asset, action.prompt, 'linked');
                    render();
                }
            }
            if ($(this).data('field') === 'prompt' && event.type === 'change') addOverlayToLibrary(action.asset, action.prompt, 'generated');
        });

        container.on('click', '.logic-remove-action', function () {
            var element = $(this).closest('.logic-action');
            var branchId = element.data('branch-id');
            var actionId = element.data('action-id');
            var actions = actionList(branchId);
            var index = actions.findIndex(function (action) { return action.id === actionId; });
            if (index < 0) return;
            actions.splice(index, 1);
            changed(); render();
        });

        container.on('click', '.logic-move-action', function () {
            var element = $(this).closest('.logic-action');
            var actions = actionList(element.data('branch-id'));
            var index = actions.findIndex(function (action) { return action.id === element.data('action-id'); });
            var target = $(this).data('direction') === 'up' ? index - 1 : index + 1;
            if (index < 0 || target < 0 || target >= actions.length) return;
            var moved = actions.splice(index, 1)[0];
            actions.splice(target, 0, moved);
            changed(); render();
        });

        container.on('click', '.logic-generator-toggle', function () {
            var actionId = $(this).closest('.logic-action').data('action-id');
            expandedGenerators[actionId] = !expandedGenerators[actionId];
            render();
        });

        container.on('click', '.overlay-library-toggle', function () {
            var actionId = $(this).closest('.logic-action').data('action-id');
            expandedOverlayLibraries[actionId] = !expandedOverlayLibraries[actionId];
            render();
        });

        container.on('click', '.logic-overlay-choice', function () {
            var element = $(this).closest('.logic-action');
            var action = findAction(element.data('branch-id'), element.data('action-id'));
            if (!action) return;
            var asset = $(this).attr('data-asset') || '';
            var entry = (region.overlayLibrary || []).find(function (candidate) { return candidate.asset === asset; });
            action.asset = asset;
            if (!action.prompt && entry && entry.prompt) action.prompt = entry.prompt;
            changed(); render(); notify('Previous region overlay selected');
        });

        container.on('change', '.logic-overlay-file', function () {
            var file = this.files[0];
            var element = $(this).closest('.logic-action');
            var action = findAction(element.data('branch-id'), element.data('action-id'));
            if (!file || !action || !options.uploadOverlay) return;
            var uploadControl = $(this).closest('.logic-overlay-upload');
            options.uploadOverlay(file, uploadControl).then(function (url) {
                action.asset = url;
                addOverlayToLibrary(url, '', 'uploaded');
                changed(); render(); notify('Overlay uploaded');
            }).catch(function (error) { notify(error.message, true); });
        });

        container.on('click', '.logic-generate-overlay', function () {
            var element = $(this).closest('.logic-action');
            var action = findAction(element.data('branch-id'), element.data('action-id'));
            if (!action || !options.generateOverlay) return;
            if ((action.prompt || '').trim().length < 3) return notify('Describe the overlay change first.', true);
            var actionId = action.id;
            var button = $(this);
            button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Editing region…');
            generationMessages[actionId] = 'Preparing the selected crop and sending it to Gemini. This may take a minute.';
            element.find('.logic-generation-status').text(generationMessages[actionId]).addClass('visible');
            options.generateOverlay(action.prompt.trim()).then(function (result) {
                action.asset = result.url;
                addOverlayToLibrary(result.url, action.prompt, 'generated');
                generationMessages[actionId] = 'Overlay ready at ' + result.width + ' × ' + result.height + ' pixels. Save this content to keep it.';
                changed(); render(); notify('Gemini region overlay created');
            }).catch(function (error) {
                generationMessages[actionId] = error.message;
                render(); notify(error.message, true);
            });
        });

        return { setRegion: setRegion, refresh: render };
    }

    root.NLLogicEditor = { create: create };
}(window, jQuery));
