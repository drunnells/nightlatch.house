(function (root, $) {
    'use strict';

    function create(options) {
        var rules = root.NLRoomRules;
        var container = $(options.root);
        var region = null;
        var expandedGenerators = {};
        var expandedOverlayLibraries = {};
        var generationMessages = {};
        var maxBranches = 10;
        var maxConditions = 25;
        var maxActions = 25;

        function esc(value) {
            return $('<div>').text(value === undefined || value === null ? '' : value).html();
        }

        function notify(message, error) {
            if (options.notify) options.notify(message, error);
        }

        function changed() {
            if (options.onChange) options.onChange(region);
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
            if (!region || !region.logic) return null;
            return region.logic.branches.find(function (branch) { return branch.id === id; }) || null;
        }

        function actionList(branchId) {
            if (branchId === 'else') return region.logic.elseActions;
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

        function inventoryPicker(selected) {
            var objects = inventoryObjects();
            var current = objects.find(function (object) { return inventoryKey(object) === selected; });
            var label = current ? current.title : (selected ? 'Custom key' : 'Choose inventory object');
            var detail = current ? inventoryKey(current) : (selected || (objects.length ? 'Search by name or key' : 'No portable objects available'));
            var html = '<div class="logic-inventory-picker" data-value="' + esc(selected) + '">' +
                '<button type="button" class="logic-picker-toggle" aria-haspopup="listbox" aria-expanded="false"><span><strong>' + esc(label) + '</strong><small>' + esc(detail) + '</small></span><i class="fa-solid fa-chevron-down"></i></button>' +
                '<div class="logic-picker-menu"><div class="logic-picker-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Search inventory objects" aria-label="Search inventory objects"></div><div class="logic-picker-options" role="listbox">' +
                '<button type="button" class="logic-inventory-option" data-value="" data-search="clear selection"><span><strong>No item selected</strong><small>Clear this inventory key</small></span>' + (!selected ? '<i class="fa-solid fa-check"></i>' : '') + '</button>';
            objects.forEach(function (object) {
                var key = inventoryKey(object);
                html += '<button type="button" class="logic-inventory-option" role="option" aria-selected="' + (selected === key ? 'true' : 'false') + '" data-value="' + esc(key) + '" data-search="' + esc((object.title + ' ' + object.slug + ' ' + key).toLowerCase()) + '"><span><strong>' + esc(object.title) + '</strong><small>' + esc(key) + '</small></span>' + (selected === key ? '<i class="fa-solid fa-check"></i>' : '') + '</button>';
            });
            if (!objects.length) html += '<p class="logic-picker-empty">Make an object portable and save it to use its inventory key here.</p>';
            return html + '</div></div></div>';
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
            region.logic.branches.forEach(function (branch) {
                branch.actions.forEach(function (action) {
                    if (action.type === 'set_overlay') addOverlayToLibrary(action.asset, action.prompt, 'saved');
                });
            });
            region.logic.elseActions.forEach(function (action) {
                if (action.type === 'set_overlay') addOverlayToLibrary(action.asset, action.prompt, 'saved');
            });
        }

        function overlayName(entry) {
            if (entry.prompt) return entry.prompt;
            var pieces = String(entry.asset || '').split('/');
            return pieces[pieces.length - 1] || 'Saved overlay';
        }

        function overlayLibraryMarkup(action) {
            var entries = Array.isArray(region.overlayLibrary) ? region.overlayLibrary.slice().reverse() : [];
            var expanded = !!expandedOverlayLibraries[action.id];
            var html = '<button type="button" class="overlay-library-toggle" aria-expanded="' + (expanded ? 'true' : 'false') + '"' + (!entries.length ? ' disabled' : '') + '><i class="fa-solid fa-clock-rotate-left"></i><span>Reuse a region overlay' + (entries.length ? ' <small>' + entries.length + '</small>' : '') + '</span><i class="fa-solid fa-chevron-down"></i></button>' +
                '<div class="overlay-library' + (expanded ? ' visible' : '') + '"><p class="hint">Previously uploaded, generated, or selected overlays for this region.</p><div class="overlay-library-grid">';
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
                : '<input class="logic-condition-field logic-key" data-field="key" value="' + esc(condition.key) + '" placeholder="flag_name" aria-label="Condition key">';
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
                ['remove_item', 'Remove item']
            ];
            if (region && region.kind === 'door') types.push(['unlock_door', 'Unlock this door']);
            if (!options.isObject) types.push(['examine_object', 'Open object viewer']);
            if (selected && !types.some(function (entry) { return entry[0] === selected; })) types.push([selected, selected.replace(/_/g, ' ')]);
            return types.map(function (entry) {
                return '<option value="' + esc(entry[0]) + '"' + (selected === entry[0] ? ' selected' : '') + '>' + esc(entry[1]) + '</option>';
            }).join('');
        }

        function objectOptions(selected) {
            var html = '<option value="">Choose an object</option>';
            (options.objects || []).forEach(function (object) {
                var detail = object.portable && object.inventory_key ? ' · inventory: ' + object.inventory_key : '';
                html += '<option value="' + esc(object.slug) + '"' + (selected === object.slug ? ' selected' : '') + '>' + esc(object.title + detail) + '</option>';
            });
            return html;
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
            if (action.type === 'set_flag') return '<div class="two-cols"><div><label>Flag key</label><input class="logic-action-field" data-field="key" value="' + esc(action.key) + '" placeholder="ritual_ready"></div><div><label>Value</label><input class="logic-action-field" data-field="value" value="' + esc(action.value) + '" placeholder="yes"></div></div>';
            if (action.type === 'clear_flag') return '<label>Flag key</label><input class="logic-action-field" data-field="key" value="' + esc(action.key) + '" placeholder="ritual_ready">';
            if (action.type === 'grant_item' || action.type === 'remove_item') return '<label>Inventory object</label>' + inventoryPicker(action.key);
            if (action.type === 'unlock_door') return '<p class="logic-action-note"><i class="fa-solid fa-lock-open"></i> Unlocks this door for the current play session.</p>';
            if (action.type === 'examine_object') return '<label>Object to examine</label><select class="logic-action-field" data-field="objectSlug">' + objectOptions(action.objectSlug) + '</select><p class="hint">The object opens over the room after this branch runs.</p>';
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

        function render() {
            if (!region) {
                container.empty();
                return;
            }
            var html = '<div class="logic-editor-intro"><strong>Interaction logic</strong><small>Branches run from top to bottom; the first match wins.</small></div>';
            region.logic.branches.forEach(function (branch, index) { html += renderBranch(branch, index, region.logic.branches.length); });
            html += '<button type="button" class="btn-ghost btn-block logic-add-branch"><i class="fa-solid fa-code-branch"></i> Add ELSE IF</button>' +
                '<section class="logic-branch logic-else" data-branch-id="else"><header class="logic-branch-header"><span class="logic-branch-label">ELSE</span><small>Runs when no branch matches</small></header>' + renderActions(region.logic.elseActions, 'else') + '</section>';
            container.html(html);
        }

        function setRegion(nextRegion) {
            region = nextRegion || null;
            if (region) {
                region.logic = rules.normalizeLogic(region);
                if (!region.logic.branches.length) region.logic.branches = rules.defaultLogic().branches;
                syncOverlayLibrary();
            }
            render();
        }

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
            picker.find('.logic-inventory-option').each(function () {
                $(this).toggle(!query || String($(this).data('search') || '').indexOf(query) !== -1);
            });
        });

        container.on('keydown', '.logic-picker-search input', function (event) {
            if (event.key !== 'Escape') return;
            var picker = $(this).closest('.logic-inventory-picker').removeClass('open');
            picker.find('.logic-picker-toggle').attr('aria-expanded', 'false').focus();
        });

        container.on('click', '.logic-inventory-option', function () {
            var value = $(this).attr('data-value') || '';
            var conditionElement = $(this).closest('.logic-condition');
            if (conditionElement.length) {
                var branch = findBranch($(this).closest('.logic-branch').data('branch-id'));
                var found = branch && findNode(branch.when, conditionElement.data('node-id'));
                if (!found) return;
                found.node.key = value;
            } else {
                var actionElement = $(this).closest('.logic-action');
                var action = findAction(actionElement.data('branch-id'), actionElement.data('action-id'));
                if (!action) return;
                action.key = value;
            }
            changed(); render();
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
            if (region.logic.branches.length >= maxBranches) return notify('A region may contain at most ' + maxBranches + ' IF / ELSE IF branches.', true);
            region.logic.branches.push(rules.defaultLogic().branches[0]);
            changed(); render();
        });

        container.on('click', '.logic-remove-branch', function () {
            var id = $(this).closest('.logic-branch').data('branch-id');
            region.logic.branches = region.logic.branches.filter(function (branch) { return branch.id !== id; });
            changed(); render();
        });

        container.on('click', '.logic-move-branch', function () {
            var branchElement = $(this).closest('.logic-branch');
            var id = branchElement.data('branch-id');
            var index = region.logic.branches.findIndex(function (branch) { return branch.id === id; });
            var target = $(this).data('direction') === 'up' ? index - 1 : index + 1;
            if (index < 0 || target < 0 || target >= region.logic.branches.length) return;
            var moved = region.logic.branches.splice(index, 1)[0];
            region.logic.branches.splice(target, 0, moved);
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
