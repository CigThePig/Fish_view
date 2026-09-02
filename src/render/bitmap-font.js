const rows = (...patterns) => patterns.map((pattern) => Number.parseInt(pattern, 2));

export const BITMAP_FONT = Object.freeze({
  " ": rows("00000", "00000", "00000", "00000", "00000", "00000", "00000"),
  "'": rows("00100", "00100", "00010", "00000", "00000", "00000", "00000"),
  "*": rows("00000", "10101", "01110", "11111", "01110", "10101", "00000"),
  "(": rows("00010", "00100", "01000", "01000", "01000", "00100", "00010"),
  ")": rows("01000", "00100", "00010", "00010", "00010", "00100", "01000"),
  ",": rows("00000", "00000", "00000", "00000", "00100", "00100", "01000"),
  "-": rows("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
  ".": rows("00000", "00000", "00000", "00000", "00000", "00100", "00100"),
  "/": rows("00001", "00010", "00100", "00100", "01000", "10000", "10000"),
  ":": rows("00000", "00100", "00100", "00000", "00100", "00100", "00000"),
  ";": rows("00000", "00100", "00100", "00000", "00100", "00100", "01000"),
  "<": rows("00010", "00100", "01000", "10000", "01000", "00100", "00010"),
  "=": rows("00000", "00000", "11111", "00000", "11111", "00000", "00000"),
  ">": rows("01000", "00100", "00010", "00001", "00010", "00100", "01000"),
  "@": rows("01110", "10001", "10111", "10101", "10111", "10000", "01110"),
  "O": rows("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
  "Y": rows("10001", "01010", "00100", "00100", "00100", "00100", "00100"),
  "[": rows("01110", "01000", "01000", "01000", "01000", "01000", "01110"),
  "\\": rows("10000", "01000", "00100", "00100", "00010", "00001", "00001"),
  "]": rows("01110", "00010", "00010", "00010", "00010", "00010", "01110"),
  "^": rows("00100", "01010", "10001", "00000", "00000", "00000", "00000"),
  "_": rows("00000", "00000", "00000", "00000", "00000", "00000", "11111"),
  "o": rows("00000", "00000", "01110", "10001", "10001", "10001", "01110"),
  "{": rows("00110", "00100", "00100", "11000", "00100", "00100", "00110"),
  "|": rows("00100", "00100", "00100", "00100", "00100", "00100", "00100"),
  "}": rows("01100", "00100", "00100", "00011", "00100", "00100", "01100"),
  "~": rows("00000", "00000", "01001", "10110", "00000", "00000", "00000"),
  "·": rows("00000", "00000", "00000", "00100", "00000", "00000", "00000"),
  "?": rows("01110", "10001", "00001", "00010", "00100", "00000", "00100"),
});

export function glyphBitmap(glyph) {
  return BITMAP_FONT[glyph] ?? BITMAP_FONT["?"];
}

export const GLYPH_PIXEL_WIDTH = 10;
export const GLYPH_PIXEL_HEIGHT = 21;

const GLYPH_PIXELS = Object.freeze(Object.fromEntries(
  Object.entries(BITMAP_FONT).map(([glyph, bitmap]) => {
    const pixels = [];
    for (let row = 0; row < bitmap.length; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        if (bitmap[row] & (1 << (4 - column))) {
          pixels.push(Object.freeze({ x: 1 + column * 2, y: 1 + row * 3, width: 2, height: 3 }));
        }
      }
    }
    return [glyph, Object.freeze(pixels)];
  }),
));

// How much ink a glyph actually carries, in authoring units. A hyphen covers
// ten columns and three rows; a pipe covers two columns and twenty-one rows.
// Anything that spaces glyphs along a line has to use the real extent rather
// than the font's maximum box, or a run of thin glyphs comes apart.
const GLYPH_INK_EXTENTS = Object.freeze(Object.fromEntries(
  Object.entries(GLYPH_PIXELS).map(([glyph, pixels]) => {
    if (!pixels.length) return [glyph, Object.freeze({ width: 0, height: 0 })];
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const pixel of pixels) {
      left = Math.min(left, pixel.x);
      top = Math.min(top, pixel.y);
      right = Math.max(right, pixel.x + pixel.width);
      bottom = Math.max(bottom, pixel.y + pixel.height);
    }
    return [glyph, Object.freeze({ width: right - left, height: bottom - top })];
  }),
));

export function glyphInkExtent(glyph) {
  return GLYPH_INK_EXTENTS[glyph] ?? GLYPH_INK_EXTENTS["?"];
}

export function glyphPixels(glyph) {
  return GLYPH_PIXELS[glyph] ?? GLYPH_PIXELS["?"];
}

export function isSupportedGlyph(glyph) {
  return Object.hasOwn(BITMAP_FONT, glyph);
}
