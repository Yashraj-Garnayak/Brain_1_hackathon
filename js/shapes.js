/* Geometric glyph set.
   Shapes are grouped into families so the difficulty engine can deal
   "near miss" decoys (same family, different silhouette) without relying
   on colour alone. */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  function ringPoints(n, radius, rotationDeg) {
    var rot = (rotationDeg * Math.PI) / 180;
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = rot + (i * TAU) / n;
      out.push([50 + Math.cos(a) * radius, 50 + Math.sin(a) * radius]);
    }
    return out;
  }

  function starPoints(n, outer, inner, rotationDeg) {
    var rot = (rotationDeg * Math.PI) / 180;
    var out = [];
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 === 0 ? outer : inner;
      var a = rot + (i * Math.PI) / n;
      out.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
    }
    return out;
  }

  function poly(points) {
    return '<polygon fill="currentColor" points="' + points.map(function (p) {
      return p[0].toFixed(2) + ',' + p[1].toFixed(2);
    }).join(' ') + '"/>';
  }

  var SHAPES = {};
  function def(id, family, draw) { SHAPES[id] = { id: id, family: family, draw: draw }; }

  def('circle', 'round', function () {
    return '<circle cx="50" cy="50" r="31" fill="currentColor"/>';
  });
  def('ring', 'round', function () {
    return '<circle cx="50" cy="50" r="26.5" fill="none" stroke="currentColor" stroke-width="14"/>';
  });
  def('dome', 'round', function () {
    return '<path d="M14 66 A36 36 0 0 1 86 66 Z" fill="currentColor"/>';
  });
  def('square', 'quad', function () {
    return '<rect x="21" y="21" width="58" height="58" rx="7" fill="currentColor"/>';
  });
  def('diamond', 'quad', function () {
    return poly([[50, 12], [88, 50], [50, 88], [12, 50]]);
  });
  def('triangle', 'tri', function () {
    return poly(ringPoints(3, 36, -90));
  });
  def('triangleDown', 'tri', function () {
    return poly(ringPoints(3, 36, 90));
  });
  def('pentagon', 'poly', function () {
    return poly(ringPoints(5, 35, -90));
  });
  def('hexagon', 'poly', function () {
    return poly(ringPoints(6, 34, -90));
  });
  def('star5', 'star', function () {
    return poly(starPoints(5, 37, 15.5, -90));
  });
  def('star6', 'star', function () {
    return poly(starPoints(6, 36, 19, -90));
  });
  def('burst', 'star', function () {
    return poly(starPoints(12, 37, 26, -90));
  });
  def('plus', 'cross', function () {
    return poly([
      [40, 12], [60, 12], [60, 40], [88, 40], [88, 60], [60, 60],
      [60, 88], [40, 88], [40, 60], [12, 60], [12, 40], [40, 40]
    ]);
  });
  def('x', 'cross', function () {
    return '<g transform="rotate(45 50 50)" fill="currentColor">' +
      '<rect x="41" y="12" width="18" height="76" rx="5"/>' +
      '<rect x="12" y="41" width="76" height="18" rx="5"/></g>';
  });
  def('chevron', 'line', function () {
    return '<path d="M22 65 L50 33 L78 65" fill="none" stroke="currentColor" ' +
      'stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>';
  });
  def('bolt', 'line', function () {
    return poly([[58, 9], [26, 55], [45, 55], [40, 91], [74, 43], [55, 43]]);
  });

  var SHAPE_LIST = Object.keys(SHAPES).map(function (k) { return SHAPES[k]; });

  var PALETTE = [
    { id: 'mint', hex: '#5eead4', group: 'cool' },
    { id: 'cyan', hex: '#38bdf8', group: 'cool' },
    { id: 'indigo', hex: '#818cf8', group: 'cool' },
    { id: 'violet', hex: '#c084fc', group: 'cool' },
    { id: 'amber', hex: '#fbbf24', group: 'warm' },
    { id: 'orange', hex: '#fb923c', group: 'warm' },
    { id: 'rose', hex: '#fb7185', group: 'warm' },
    { id: 'lime', hex: '#bef264', group: 'warm' }
  ];

  function shapeSvg(shape, color, extraClass) {
    return '<svg class="glyph' + (extraClass ? ' ' + extraClass : '') + '" viewBox="0 0 100 100" ' +
      'style="color:' + color.hex + '" aria-hidden="true" focusable="false">' +
      shape.draw() + '</svg>';
  }

  window.TILE_SHAPES = {
    SHAPES: SHAPES,
    SHAPE_LIST: SHAPE_LIST,
    PALETTE: PALETTE,
    shapeSvg: shapeSvg
  };
})();
