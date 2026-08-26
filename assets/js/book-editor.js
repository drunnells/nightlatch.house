(function ($) {
    'use strict';

    function esc(value) {
        return $('<div>').text(value === undefined || value === null ? '' : String(value)).html();
    }

    function escAttr(value) {
        return esc(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function normalizeBook(value) {
        value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        return {
            enabled: !!value.enabled,
            previousRegionId: String(value.previousRegionId || ''),
            nextRegionId: String(value.nextRegionId || ''),
            pages: (Array.isArray(value.pages) ? value.pages : []).map(function (page) {
                return { asset: page && page.asset ? String(page.asset) : '' };
            })
        };
    }

    function create(options) {
        options = options || {};
        var root = $(options.root);
        var enabledInput = $(options.enabledInput);
        var book = normalizeBook(options.book);
        var upload = options.upload;
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
            renderPages();
        }

        function changed() {
            updateSelectTooltips();
            onChange();
        }

        enabledInput.on('change', function () {
            book.enabled = this.checked;
            if (book.enabled && !book.pages.length) book.pages.push({ asset: '' });
            render();
            changed();
        });
        root.on('change', '#book-previous-region', function () {
            book.previousRegionId = String($(this).val() || '');
            changed();
        }).on('change', '#book-next-region', function () {
            book.nextRegionId = String($(this).val() || '');
            changed();
        }).on('click', '#add-book-page', function () {
            if (book.pages.length >= 100) {
                notify('A book may contain at most 100 pages.', true);
                return;
            }
            book.pages.push({ asset: '' });
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
