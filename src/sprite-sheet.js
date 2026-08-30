import { CanvasCellRenderer } from "./render/canvas-renderer.js";
import { createCellGrid } from "./render/cell-grid.js";
import { individualSprites, renderSpritePreview } from "./render/render.js";

const colors = ["#61e7df", "#ff716e", "#ffd76a", "#63bff2", "#72d68f", "#dd82df"];

function previewGrid(sprite, facing) {
  const preview = renderSpritePreview(sprite, facing);
  const grid = createCellGrid(preview.width, preview.height, () => ({ char: " ", fg: colors[0], bg: "#000a0d" }));
  for (let y = 0; y < preview.height; y += 1) {
    const glyphs = [...preview.shape[y]];
    const masks = [...preview.mask[y]];
    for (let x = 0; x < preview.width; x += 1) {
      const symbol = masks[x] ?? "1";
      const colorIndex = symbol === "4" ? 0 : (Number(symbol) || 1) % colors.length;
      grid.cells[y * preview.width + x] = {
        char: glyphs[x] ?? " ",
        fg: symbol === "4" ? "#f4fff9" : colors[colorIndex],
        bg: "#000a0d",
      };
    }
  }
  return grid;
}

const container = document.querySelector("#sprite-grid");
individualSprites.forEach((sprite) => {
  const right = previewGrid(sprite, "right");
  const left = previewGrid(sprite, "left");
  const card = document.createElement("article");
  card.className = "sprite-card";
  const title = document.createElement("h2");
  title.textContent = sprite.id;
  const meta = document.createElement("p");
  meta.className = "sprite-meta";
  meta.textContent = `${sprite.source} · ${right.cols} × ${right.rows}`;
  const pair = document.createElement("div");
  pair.className = "sprite-pair";

  [["Source", right], ["Generated mirror", left]].forEach(([label, grid]) => {
    const figure = document.createElement("div");
    figure.className = "sprite-facing";
    const canvas = document.createElement("canvas");
    const caption = document.createElement("span");
    caption.textContent = label;
    figure.append(canvas, caption);
    pair.append(figure);
    new CanvasCellRenderer(canvas).draw(grid);
  });

  card.append(title, meta, pair);
  container.append(card);
});

