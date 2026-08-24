(function (root, factory) {
    'use strict';

    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.NLRegionBounds = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var DEFAULT_MINIMUM_SIZE = 20;

    function number(value, fallback) {
        value = Number(value);
        return isFinite(value) ? value : fallback;
    }

    function clamp(value, minimum, maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    function canvasSize(canvas) {
        return {
            width: Math.max(1, Math.round(number(canvas && canvas.width, 1))),
            height: Math.max(1, Math.round(number(canvas && canvas.height, 1)))
        };
    }

    function move(bounds, deltaX, deltaY, canvas) {
        var size = canvasSize(canvas);
        var width = clamp(Math.round(number(bounds && bounds.width, 1)), 1, size.width);
        var height = clamp(Math.round(number(bounds && bounds.height, 1)), 1, size.height);
        return {
            x: clamp(Math.round(number(bounds && bounds.x, 0) + number(deltaX, 0)), 0, size.width - width),
            y: clamp(Math.round(number(bounds && bounds.y, 0) + number(deltaY, 0)), 0, size.height - height),
            width: width,
            height: height
        };
    }

    function resize(bounds, deltaWidth, deltaHeight, canvas, minimumSize) {
        var size = canvasSize(canvas);
        var x = clamp(Math.round(number(bounds && bounds.x, 0)), 0, size.width - 1);
        var y = clamp(Math.round(number(bounds && bounds.y, 0)), 0, size.height - 1);
        var maximumWidth = size.width - x;
        var maximumHeight = size.height - y;
        var requestedMinimum = Math.max(1, Math.round(number(minimumSize, DEFAULT_MINIMUM_SIZE)));
        var minimumWidth = Math.min(requestedMinimum, maximumWidth);
        var minimumHeight = Math.min(requestedMinimum, maximumHeight);
        return {
            x: x,
            y: y,
            width: clamp(Math.round(number(bounds && bounds.width, minimumWidth) + number(deltaWidth, 0)), minimumWidth, maximumWidth),
            height: clamp(Math.round(number(bounds && bounds.height, minimumHeight) + number(deltaHeight, 0)), minimumHeight, maximumHeight)
        };
    }

    return {
        minimumSize: DEFAULT_MINIMUM_SIZE,
        move: move,
        resize: resize
    };
});
