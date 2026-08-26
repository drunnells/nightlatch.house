(function ($) {
    'use strict';

    function esc(value) {
        return $('<div>').text(value === undefined || value === null ? '' : String(value)).html();
    }

    function escAttr(value) {
        return esc(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function pickerTooltip(label, detail) {
        label = String(label === undefined || label === null ? '' : label);
        detail = String(detail === undefined || detail === null ? '' : detail);
        return detail && detail !== label ? label + '\n' + detail : label;
    }

    function normalizeBook(value) {
        value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        return {
            enabled: !!value.enabled,
            pageTurnSoundSlug: String(value.pageTurnSoundSlug || ''),
            pages: (Array.isArray(value.pages) ? value.pages : []).map(function (page) {
                return {
                    asset: page && page.asset ? String(page.asset) : '',
                    prompt: page && page.prompt ? String(page.prompt) : ''
                };
            })
        };
    }

    function create(options) {
        options = options || {};
        var root = $(options.root);
        var enabledInput = $(options.enabledInput);
        var book = normalizeBook(options.book);
        var upload = options.upload;
        var generatePage = options.generatePage;
        var sounds = Array.isArray(options.sounds) ? options.sounds : [];
        var onChange = options.onChange || function () {};
        var notify = options.notify || function () {};

        function regions() {
            return typeof options.getRegions === 'function' ? options.getRegions() : [];
        }

        function overlayChoices() {
            var choices = [];
            var seen = {};
            regions().forEach(function (region, regionIndex) {
                (Array.isArray(region.overlayLibrary) ? region.overlayLibrary : []).forEach(function (entry, overlayIndex) {
                    var asset = typeof entry === 'string' ? entry : (entry && entry.asset ? entry.asset : '');
                    if (!asset || seen[asset]) return;
                    seen[asset] = true;
                    choices.push({
                        asset: asset,
                        label: (region.name || ('Region ' + (regionIndex + 1))) + ' · overlay ' + (overlayIndex + 1),
                        detail: String(asset).split('/').pop()
                    });
                });
            });
            return choices;
        }

        function soundOptionMarkup() {
            var selected = book.pageTurnSoundSlug;
            var html = '<button type="button" class="logic-picker-option book-sound-option" title="No page flip sound&#10;Turn pages silently" data-value="" data-search="clear sound silent"><span><strong>No page flip sound</strong><small>Turn pages silently</small></span>' + (!selected ? '<i class="fa-solid fa-check"></i>' : '') + '</button>';
            sounds.forEach(function (sound) {
                var slug = String(sound.slug || '');
                var search = [sound.name, slug, sound.originalFilename || ''].join(' ').toLowerCase();
                html += '<button type="button" class="logic-picker-option book-sound-option" title="' + escAttr(pickerTooltip(sound.name, slug)) + '" role="option" aria-selected="' + (selected === slug ? 'true' : 'false') + '" data-value="' + escAttr(slug) + '" data-search="' + escAttr(search) + '"><span><strong>' + esc(sound.name) + '</strong><small>' + esc(slug) + '</small></span>' + (selected === slug ? '<i class="fa-solid fa-check"></i>' : '') + '</button>';
            });
            if (!sounds.length) html += '<p class="logic-picker-empty">Upload sounds from the top-level Sounds tab before selecting one here.</p>';
            return html;
        }

        function renderSoundPicker() {
            var selected = sounds.find(function (sound) { return String(sound.slug || '') === book.pageTurnSoundSlug; }) || null;
            var label = selected ? selected.name : (book.pageTurnSoundSlug ? 'Unavailable sound' : 'No page flip sound');
            var detail = selected ? selected.slug : (book.pageTurnSoundSlug || (sounds.length ? 'Search saved sounds' : 'No saved sounds available'));
            root.find('#book-page-sound-picker').html(
                '<button type="button" class="logic-picker-toggle" id="book-page-sound-toggle" title="' + escAttr(pickerTooltip(label, detail)) + '" aria-haspopup="listbox" aria-expanded="false"><span><strong>' + esc(label) + '</strong><small>' + esc(detail) + '</small></span><i class="fa-solid fa-chevron-down"></i></button>' +
                '<div class="logic-picker-menu"><label class="logic-picker-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="book-page-sound-search" placeholder="Search sounds by name or slug" aria-label="Search sounds by name or slug"></label><div class="logic-picker-options" id="book-page-sound-options" role="listbox">' + soundOptionMarkup() + '</div></div>'
            );
        }

        function updateSelectTooltips() {
            root.find('select').each(function () {
                var option = this.options[this.selectedIndex];
                this.title = option ? (option.getAttribute('title') || option.textContent) : '';
            });
        }

        function pageReference(page, index) {
            if (page._referenceMode === 'object') {
                return { key: 'object', mode: 'object', asset: '', label: 'Object artwork' };
            }
            if (page._referenceMode === 'current' && page.asset) {
                return { key: 'current', mode: 'current', asset: page.asset, label: 'Current page overlay' };
            }
            if (page._referenceMode === 'previous') {
                var previousIndex = book.pages.indexOf(page._referencePage);
                if (previousIndex >= 0 && previousIndex < index && page._referencePage.asset) {
                    return {
                        key: 'previous:' + previousIndex,
                        mode: 'previous',
                        asset: page._referencePage.asset,
                        label: 'Page ' + (previousIndex + 1)
                    };
                }
            }
            return page.asset
                ? { key: 'current', mode: 'current', asset: page.asset, label: 'Current page overlay' }
                : { key: 'object', mode: 'object', asset: '', label: 'Object artwork' };
        }

        function pageReferenceMarkup(page, index, selectedReference) {
            var html = '<option value="object" title="Object artwork\nUse the full object canvas as the starting image"' + (selectedReference.key === 'object' ? ' selected' : '') + '>Object artwork</option>';
            if (page.asset) {
                var currentFilename = String(page.asset).split('/').pop();
                html += '<option value="current" title="Current page overlay\n' + escAttr(currentFilename) + '"' + (selectedReference.key === 'current' ? ' selected' : '') + '>Current page overlay</option>';
            }
            book.pages.slice(0, index).forEach(function (previousPage, previousIndex) {
                if (!previousPage.asset) return;
                var filename = String(previousPage.asset).split('/').pop();
                var key = 'previous:' + previousIndex;
                html += '<option value="' + key + '" title="Page ' + (previousIndex + 1) + '\n' + escAttr(filename) + '"' + (selectedReference.key === key ? ' selected' : '') + '>Previous page · Page ' + (previousIndex + 1) + '</option>';
            });
            return html;
        }

        function pageReferenceHelp(reference) {
            if (reference.mode === 'previous') return 'Gemini uses ' + reference.label + ' as the visual design reference for this new page without replacing the source page.';
            if (reference.mode === 'current') return 'Gemini edits the current page overlay as its exact reference. The current asset remains available until normal cleanup.';
            return 'Gemini uses the full object artwork as the starting reference for this page.';
        }

        function renderPages() {
            var choices = overlayChoices();
            var html = '';
            book.pages.forEach(function (page, index) {
                var reference = pageReference(page, index);
                var filename = page.asset ? String(page.asset).split('/').pop() : 'No overlay selected';
                var choiceMarkup = '<option value="">Choose a saved overlay</option>';
                choices.forEach(function (choice) {
                    choiceMarkup += '<option value="' + escAttr(choice.asset) + '" title="' + escAttr(choice.label + '\n' + choice.detail) + '"' + (choice.asset === page.asset ? ' selected' : '') + '>' + esc(choice.label) + '</option>';
                });
                html += '<article class="book-page-card" data-page-index="' + index + '">' +
                    '<div class="book-page-heading"><span><strong>Page ' + (index + 1) + '</strong><small title="' + escAttr(filename) + '">' + esc(filename) + '</small></span><div>' +
                    '<button type="button" class="icon-button book-page-up" aria-label="Move page up" title="Move page up"' + (index === 0 ? ' disabled' : '') + '><i class="fa-solid fa-arrow-up"></i></button>' +
                    '<button type="button" class="icon-button book-page-down" aria-label="Move page down" title="Move page down"' + (index === book.pages.length - 1 ? ' disabled' : '') + '><i class="fa-solid fa-arrow-down"></i></button>' +
                    '<button type="button" class="icon-button danger book-page-remove" aria-label="Remove page" title="Remove page"><i class="fa-solid fa-trash"></i></button>' +
                    '</div></div>' +
                    '<div class="book-page-preview">' + (page.asset ? '<img src="' + escAttr(page.asset) + '" alt="Page ' + (index + 1) + ' overlay preview">' : '<span><i class="fa-regular fa-image"></i> Add an overlay</span>') + '</div>' +
                    '<label>Reuse a saved region overlay<select class="book-page-library" title="Choose an overlay already saved on this object">' + choiceMarkup + '</select></label>' +
                    '<label class="book-page-upload-label"><span><i class="fa-solid fa-cloud-arrow-up"></i> Upload page overlay</span><input class="book-page-upload" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
                    '<button type="button" class="overlay-generator-toggle book-page-generator-toggle" aria-expanded="' + (page._generatorExpanded ? 'true' : 'false') + '"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Generate page with Gemini</span><i class="fa-solid fa-chevron-down"></i></button>' +
                    '<div class="overlay-generator book-page-generator' + (page._generatorExpanded ? ' visible' : '') + '"><label>Reference image<select class="book-page-reference">' + pageReferenceMarkup(page, index, reference) + '</select></label><p class="hint book-page-reference-help">' + esc(pageReferenceHelp(reference)) + '</p><label>Page generation prompt</label><textarea class="book-page-prompt" rows="4" maxlength="2000" placeholder="Fill the open pages with faded botanical illustrations, pressed leaves, and diagram marks.">' + esc(page.prompt) + '</textarea><div class="prompt-meta"><span><i class="' + (reference.mode === 'object' ? 'fa-solid fa-book-open' : 'fa-regular fa-images') + '"></i> Uses ' + esc(reference.label) + '</span><span class="book-page-prompt-count">' + page.prompt.length + ' / 2000</span></div><button type="button" class="btn-forge btn-block book-page-generate"><i class="fa-solid fa-sparkles"></i> ' + (page.asset ? 'Regenerate page overlay' : 'Generate page overlay') + '</button><div class="generation-status book-page-generation-status' + (page._generationMessage ? ' visible' : '') + '">' + esc(page._generationMessage || '') + '</div></div>' +
                    '</article>';
            });
            root.find('#book-pages').html(html || '<div class="book-pages-empty"><i class="fa-regular fa-file-image"></i><p>No pages yet.</p></div>');
            root.find('#book-page-count').text(book.pages.length + (book.pages.length === 1 ? ' page' : ' pages'));
            updateSelectTooltips();
        }

        function render() {
            enabledInput.prop('checked', book.enabled);
            root.prop('hidden', !book.enabled);
            renderSoundPicker();
            renderPages();
        }

        function changed() {
            updateSelectTooltips();
            onChange();
        }

        enabledInput.on('change', function () {
            book.enabled = this.checked;
            if (book.enabled && !book.pages.length) book.pages.push({ asset: '', prompt: '' });
            render();
            changed();
        });
        root.on('click', '#book-page-sound-toggle', function () {
            var picker = root.find('#book-page-sound-picker');
            var opening = !picker.hasClass('open');
            picker.toggleClass('open', opening);
            $(this).attr('aria-expanded', opening ? 'true' : 'false');
            if (opening) root.find('#book-page-sound-search').val('').trigger('input').focus();
        }).on('input', '#book-page-sound-search', function () {
            var query = $(this).val().trim().toLowerCase();
            root.find('.book-sound-option[data-search]').each(function () {
                $(this).toggle(!query || String($(this).attr('data-search') || '').indexOf(query) !== -1);
            });
        }).on('click', '.book-sound-option', function () {
            book.pageTurnSoundSlug = String($(this).attr('data-value') || '');
            renderSoundPicker();
            changed();
        }).on('click', '#add-book-page', function () {
            if (book.pages.length >= 100) {
                notify('A book may contain at most 100 pages.', true);
                return;
            }
            book.pages.push({ asset: '', prompt: '' });
            renderPages();
            changed();
        }).on('click', '.book-page-remove', function () {
            var index = parseInt($(this).closest('[data-page-index]').attr('data-page-index'), 10);
            book.pages.splice(index, 1);
            renderPages();
            changed();
        }).on('click', '.book-page-up, .book-page-down', function () {
            var index = parseInt($(this).closest('[data-page-index]').attr('data-page-index'), 10);
            var nextIndex = $(this).hasClass('book-page-up') ? index - 1 : index + 1;
            if (nextIndex < 0 || nextIndex >= book.pages.length) return;
            var page = book.pages[index];
            book.pages[index] = book.pages[nextIndex];
            book.pages[nextIndex] = page;
            renderPages();
            changed();
        }).on('change', '.book-page-library', function () {
            var index = parseInt($(this).closest('[data-page-index]').attr('data-page-index'), 10);
            var asset = String($(this).val() || '');
            if (!asset) return;
            book.pages[index].asset = asset;
            renderPages();
            changed();
        }).on('change', '.book-page-upload', function () {
            if (!this.files || !this.files[0] || typeof upload !== 'function') return;
            var input = this;
            var card = $(this).closest('[data-page-index]');
            var index = parseInt(card.attr('data-page-index'), 10);
            var targetPage = book.pages[index];
            upload(this.files[0], card).then(function (asset) {
                if (book.pages.indexOf(targetPage) === -1) return;
                targetPage.asset = asset;
                renderPages();
                changed();
                notify('Book page overlay uploaded');
            }).catch(function (error) {
                input.value = '';
                notify(error.message, true);
            });
        }).on('click', '.book-page-generator-toggle', function () {
            var index = parseInt($(this).closest('[data-page-index]').attr('data-page-index'), 10);
            if (!book.pages[index]) return;
            book.pages[index]._generatorExpanded = !book.pages[index]._generatorExpanded;
            renderPages();
        }).on('change', '.book-page-reference', function () {
            var index = parseInt($(this).closest('[data-page-index]').attr('data-page-index'), 10);
            var targetPage = book.pages[index];
            if (!targetPage) return;
            var value = String($(this).val() || 'object');
            targetPage._referenceMode = value === 'current' ? 'current' : (value.indexOf('previous:') === 0 ? 'previous' : 'object');
            targetPage._referencePage = targetPage._referenceMode === 'previous'
                ? book.pages[parseInt(value.split(':')[1], 10)] || null
                : null;
            renderPages();
        }).on('input', '.book-page-prompt', function () {
            var index = parseInt($(this).closest('[data-page-index]').attr('data-page-index'), 10);
            if (!book.pages[index]) return;
            book.pages[index].prompt = $(this).val();
            $(this).siblings('.prompt-meta').find('.book-page-prompt-count').text(book.pages[index].prompt.length + ' / 2000');
            changed();
        }).on('click', '.book-page-generate', function () {
            if (typeof generatePage !== 'function') return;
            var card = $(this).closest('[data-page-index]');
            var index = parseInt(card.attr('data-page-index'), 10);
            var targetPage = book.pages[index];
            if (!targetPage) return;
            var prompt = String(targetPage.prompt || '').trim();
            if (prompt.length < 3) return notify('Describe the page content first.', true);
            var reference = pageReference(targetPage, index);
            targetPage._generatorExpanded = true;
            targetPage._generationMessage = 'Preparing ' + reference.label + ' and sending it to Gemini. This may take a minute.';
            card.find('.book-page-generate').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Generating page…');
            card.find('.book-page-generation-status').text(targetPage._generationMessage).addClass('visible');
            generatePage(prompt, reference.asset, reference.mode).then(function (result) {
                if (book.pages.indexOf(targetPage) === -1) return;
                targetPage.asset = result.url;
                targetPage.prompt = prompt;
                targetPage._generationMessage = 'Page overlay ready at ' + result.width + ' × ' + result.height + ' pixels. Save this object to keep it.';
                renderPages();
                changed();
                notify('Gemini book page created');
            }).catch(function (error) {
                if (book.pages.indexOf(targetPage) === -1) return;
                targetPage._generationMessage = error.message;
                renderPages();
                notify(error.message, true);
            });
        });

        root.on('click', '#book-page-sound-picker', function (event) { event.stopPropagation(); });
        $(document).on('click.nlBookEditor', function () {
            root.find('#book-page-sound-picker').removeClass('open').find('.logic-picker-toggle').attr('aria-expanded', 'false');
        });

        render();

        return {
            value: function () { return normalizeBook(book); },
            enabled: function () { return !!book.enabled; },
            refreshRegions: function () { renderPages(); },
            replaceAssets: function (replacements) {
                book.pages.forEach(function (page) {
                    if (replacements[page.asset]) page.asset = replacements[page.asset];
                });
                renderPages();
            },
            validate: function () {
                if (!book.enabled) return '';
                if (!book.pages.length) return 'Add at least one page overlay to this book.';
                if (book.pages.some(function (page) { return !page.asset; })) return 'Every book page needs an overlay asset.';
                return '';
            }
        };
    }

    window.NLBookEditor = { create: create, normalizeBook: normalizeBook };
}(jQuery));
