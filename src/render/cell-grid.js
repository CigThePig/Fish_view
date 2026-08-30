export function createCellGrid(cols, rows, cellFactory) {
  const cells = new Array(cols * rows);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      cells[y * cols + x] = cellFactory(x, y);
    }
  }
  return { cols, rows, cells };
}

export function sameCell(left, right) {
  return Boolean(left && right)
    && left.char === right.char
    && left.fg === right.fg
    && left.bg === right.bg;
}

export function diffCells(previous, next) {
  if (!previous || previous.cols !== next.cols || previous.rows !== next.rows) {
    return Array.from({ length: next.cells.length }, (_, index) => index);
  }
  const dirty = [];
  for (let index = 0; index < next.cells.length; index += 1) {
    if (!sameCell(previous.cells[index], next.cells[index])) dirty.push(index);
  }
  return dirty;
}

