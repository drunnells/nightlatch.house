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
            previousRegionId: String(value.previousRegionId || ''),
            nextRegionId: String(value.nextRegionId || ''),
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

        function regionOptionMarkup(selectedId, roleLabel) {
            var html = '<option value="">Choose a region</option>';
            var found = false;
            regions().forEach(function (region, index) {
                var id = String(region.id || '');
                var label = (index + 1) + '. ' + (region.name || 'Untitled region');
                var detail = roleLabel + ' · ' + id;
                if (id === selectedId) found = true;
                html += '<option value="' + escAttr(id) + '" title="' + escAttr(label + '\n' + detail) + '"' + (id === selectedId ? ' selected' : '') + '>' + esc(label) + '</option>';
            });
            if (selectedId && !found) {
                html += '<option value="' + escAttr(selectedId) + '" title="Missing region\n' + escAttr(selectedId) + '" selected>Missing region · ' + esc(selectedId) + '</option>';
            }
            return html;
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

        function renderNavigation() {
            root.find('#book-previous-region').html(regionOptionMarkup(book.previousRegionId, 'Previous page'));
            root.find('#book-next-region').html(regionOptionMarkup(book.nextRegionId, 'Next page'));
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

        function renderPages() {
            var choices = overlayChoices();
            var html = '';
            book.pages.forEach(function (page, index) {
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
                    '<div class="overlay-generator book-page-generator' + (page._generatorExpanded ? ' visible' : '') + '"><p class="hint">Gemini receives ' + (page.asset ? 'the current page overlay as its exact reference' : 'the full object artwork') + '. Describe the page content to add or change.</p><label>Page generation prompt</label><textarea class="book-page-prompt" rows="4" maxlength="2000" placeholder="Fill the open pages with faded botanical illustrations, pressed leaves, and diagram marks.">' + esc(page.prompt) + '</textarea><div class="prompt-meta"><span><i class="' + (page.asset ? 'fa-regular fa-images' : 'fa-solid fa-book-open') + '"></i> ' + (page.asset ? 'Uses current page' : 'Uses object artwork') + '</span><span class="book-page-prompt-count">' + page.prompt.length + ' / 2000</span></div><button type="button" class="btn-forge btn-block book-page-generate"><i class="fa-solid fa-sparkles"></i> ' + (page.asset ? 'Regenerate page overlay' : 'Generate page overlay') + '</button><div class="generation-status book-page-generation-status' + (page._generationMessage ? ' visible' : '') + '">' + esc(page._generationMessage || '') + '</div></div>' +
                    '</article>';
            });
            root.find('#book-pages').html(html || '<div class="book-pages-empty"><i class="fa-regular fa-file-image"></i><p>No pages yet.</p></div>');
            root.find('#book-page-count').text(book.pages.length + (book.pages.length === 1 ? ' page' : ' pages'));
            updateSelectTooltips();
        }

        function render() {
            enabledInput.prop('checked', book.enabled);
            root.prop('hidden', !book.enabled);
            renderNavigation();
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
        root.on('change', '#book-previous-region', function () {
            book.previousRegionId = String($(this).val() || '');
            changed();
        }).on('change', '#book-next-region', function () {
            book.nextRegionId = String($(this).val() || '');
            changed();
        }).on('click', '#book-page-sound-toggle', function () {
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
            targetPage._generatorExpanded = true;
            targetPage._generationMessage = 'Preparing the page reference and sending it to Gemini. This may take a minute.';
            card.find('.book-page-generate').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Generating page…');
            card.find('.book-page-generation-status').text(targetPage._generationMessage).addClass('visible');
            generatePage(prompt, targetPage.asset).then(function (result) {
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
            navigationRole: function (regionId) {
                regionId = String(regionId || '');
                if (!book.enabled) return '';
                if (regionId === book.previousRegionId) return 'previous';
                if (regionId === book.nextRegionId) return 'next';
                return '';
            },
            refreshRegions: function () { renderNavigation(); renderPages(); },
            clearRegion: function (regionId) {
                regionId = String(regionId || '');
                if (book.previousRegionId === regionId) book.previousRegionId = '';
                if (book.nextRegionId === regionId) book.nextRegionId = '';
                renderNavigation();
            },
            replaceAssets: function (replacements) {
                book.pages.forEach(function (page) {
                    if (replacements[page.asset]) page.asset = replacements[page.asset];
                });
                renderPages();
            },
            validate: function () {
                if (!book.enabled) return '';
                if (!book.previousRegionId || !book.nextRegionId) return 'Choose both previous-page and next-page regions for this book.';
                if (book.previousRegionId === book.nextRegionId) return 'Previous-page and next-page controls must use different regions.';
                var regionIds = regions().map(function (region) { return String(region.id || ''); });
                if (regionIds.indexOf(book.previousRegionId) === -1 || regionIds.indexOf(book.nextRegionId) === -1) return 'Book navigation controls must use regions that still exist.';
                if (!book.pages.length) return 'Add at least one page overlay to this book.';
                if (book.pages.some(function (page) { return !page.asset; })) return 'Every book page needs an overlay asset.';
                return '';
            }
        };
    }

    window.NLBookEditor = { create: create, normalizeBook: normalizeBook };
}(jQuery));
