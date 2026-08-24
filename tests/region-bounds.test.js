'use strict';

const assert = require('assert');
const bounds = require('../assets/js/region-bounds.js');

assert.deepStrictEqual(
    bounds.move({ x: 100, y: 80, width: 200, height: 120 }, 35, -20, { width: 800, height: 600 }),
    { x: 135, y: 60, width: 200, height: 120 },
    'Moving should preserve size and apply the pointer delta.'
);

assert.deepStrictEqual(
    bounds.move({ x: 700, y: 520, width: 200, height: 120 }, 100, 100, { width: 800, height: 600 }),
    { x: 600, y: 480, width: 200, height: 120 },
    'Moving should keep the complete region inside the canvas.'
);

assert.deepStrictEqual(
    bounds.resize({ x: 100, y: 80, width: 200, height: 120 }, 75, 35, { width: 800, height: 600 }),
    { x: 100, y: 80, width: 275, height: 155 },
    'Resizing should keep the top-left corner fixed.'
);

assert.deepStrictEqual(
    bounds.resize({ x: 700, y: 550, width: 50, height: 30 }, 500, 500, { width: 800, height: 600 }),
    { x: 700, y: 550, width: 100, height: 50 },
    'Resizing should stop at the canvas edges.'
);

assert.deepStrictEqual(
    bounds.resize({ x: 100, y: 80, width: 200, height: 120 }, -1000, -1000, { width: 800, height: 600 }),
    { x: 100, y: 80, width: bounds.minimumSize, height: bounds.minimumSize },
    'Resizing should enforce a usable minimum region size.'
);

console.log('region-bounds tests passed');
