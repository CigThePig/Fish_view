import { CELL_HEIGHT, CELL_WIDTH } from "../sim/config.js";
import { diffCells } from "./cell-grid.js";
import { glyphBitmap } from "./bitmap-font.js";

export class CanvasCellRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.previous = null;
    this.context.imageSmoothingEnabled = false;
  }

  reset() {
    this.previous = null;
  }

  draw(grid) {
    const width = grid.cols * CELL_WIDTH;
    const height = grid.rows * CELL_HEIGHT;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.context = this.canvas.getContext("2d", { alpha: false, desynchronized: true });
      this.context.imageSmoothingEnabled = false;
      this.previous = null;
    }

    const dirty = diffCells(this.previous, grid);
    dirty.forEach((index) => this.drawCell(index, grid));
    this.previous = grid;
    return { dirty: dirty.length, total: grid.cells.length };
  }

  drawCell(index, grid) {
    const x = index % grid.cols;
    const y = Math.floor(index / grid.cols);
    const cell = grid.cells[index];
    const pixelX = x * CELL_WIDTH;
    const pixelY = y * CELL_HEIGHT;
    this.context.fillStyle = cell.bg;
    this.context.fillRect(pixelX, pixelY, CELL_WIDTH, CELL_HEIGHT);
    if (!cell.char || cell.char === " ") return;

    const bitmap = glyphBitmap(cell.char);
    this.context.fillStyle = cell.fg;
    for (let row = 0; row < bitmap.length; row += 1) {
      const bits = bitmap[row];
      for (let column = 0; column < 5; column += 1) {
        if (bits & (1 << (4 - column))) {
          this.context.fillRect(pixelX + 1 + column * 2, pixelY + 1 + row * 3, 2, 3);
        }
      }
    }
  }
}

