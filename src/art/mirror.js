const glyphFlip = Object.freeze({
  "<": ">",
  ">": "<",
  "/": "\\",
  "\\": "/",
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
});

export function normalizeRows(rows, width = Math.max(...rows.map((row) => [...row].length))) {
  return rows.map((row) => row.padEnd(width, " "));
}

export function mirrorRows(rows, flipGlyphs = true) {
  const width = Math.max(...rows.map((row) => [...row].length));
  return normalizeRows(rows, width).map((row) =>
    [...row]
      .reverse()
      .map((glyph) => (flipGlyphs ? (glyphFlip[glyph] ?? glyph) : glyph))
      .join(""),
  );
}

export function mirrorSprite(sprite) {
  return {
    ...sprite,
    id: `${sprite.id}-mirrored`,
    shape: mirrorRows(sprite.shape, true),
    mask: mirrorRows(sprite.mask, false),
  };
}

export { glyphFlip };

