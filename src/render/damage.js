function clipRectangle(rectangle, width, height) {
  const left = Math.max(0, Math.floor(rectangle.x));
  const top = Math.max(0, Math.floor(rectangle.y));
  const right = Math.min(width, Math.ceil(rectangle.x + rectangle.width));
  const bottom = Math.min(height, Math.ceil(rectangle.y + rectangle.height));
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function expand(rectangle, amount) {
  return {
    x: rectangle.x - amount,
    y: rectangle.y - amount,
    width: rectangle.width + amount * 2,
    height: rectangle.height + amount * 2,
  };
}

export function rectanglesOverlap(left, right, gap = 0) {
  return left.x <= right.x + right.width + gap
    && left.x + left.width + gap >= right.x
    && left.y <= right.y + right.height + gap
    && left.y + left.height + gap >= right.y;
}

function mergeRectangles(left, right) {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const rightEdge = Math.max(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: rightEdge - x, height: bottomEdge - y };
}

function rectangleArea(rectangle) {
  return rectangle.width * rectangle.height;
}

function economicalMerge(left, right) {
  if (!rectanglesOverlap(left, right, 1)) return null;
  const merged = mergeRectangles(left, right);
  const separateArea = rectangleArea(left) + rectangleArea(right);
  return rectangleArea(merged) <= separateArea * 1.18 ? merged : null;
}

export function coalesceDamage(rectangles) {
  const result = [];
  for (const rectangle of rectangles) {
    let merged = rectangle;
    let index = 0;
    while (index < result.length) {
      const candidate = economicalMerge(merged, result[index]);
      if (candidate) {
        merged = candidate;
        result.splice(index, 1);
        index = 0;
      } else {
        index += 1;
      }
    }
    result.push(merged);
  }
  return result;
}

export function damageUnionArea(rectangles) {
  if (!rectangles.length) return 0;
  const edges = [...new Set(rectangles.flatMap((rectangle) => [rectangle.x, rectangle.x + rectangle.width]))]
    .sort((left, right) => left - right);
  let area = 0;
  for (let edgeIndex = 0; edgeIndex < edges.length - 1; edgeIndex += 1) {
    const left = edges[edgeIndex];
    const right = edges[edgeIndex + 1];
    if (right <= left) continue;
    const intervals = rectangles
      .filter((rectangle) => rectangle.x < right && rectangle.x + rectangle.width > left)
      .map((rectangle) => [rectangle.y, rectangle.y + rectangle.height])
      .sort((first, second) => first[0] - second[0]);
    let covered = 0;
    let start = null;
    let end = null;
    for (const interval of intervals) {
      if (start === null) {
        [start, end] = interval;
      } else if (interval[0] <= end) {
        end = Math.max(end, interval[1]);
      } else {
        covered += end - start;
        [start, end] = interval;
      }
    }
    if (start !== null) covered += end - start;
    area += (right - left) * covered;
  }
  return area;
}

function fullDamage(scene) {
  const rects = [{ x: 0, y: 0, width: scene.width, height: scene.height }];
  return {
    rects,
    area: scene.width * scene.height,
    total: scene.width * scene.height,
    full: true,
  };
}

export function calculateDamage(previous, next, padding = 2) {
  if (!previous
    || previous.width !== next.width
    || previous.height !== next.height
    || previous.background.signature !== next.background.signature) {
    return fullDamage(next);
  }

  const previousObjects = new Map(previous.objects.map((object) => [object.id, object]));
  const nextObjects = new Map(next.objects.map((object) => [object.id, object]));
  const candidates = [];
  const ids = new Set([...previousObjects.keys(), ...nextObjects.keys()]);
  for (const id of ids) {
    const before = previousObjects.get(id);
    const after = nextObjects.get(id);
    if (before && after && before.signature === after.signature) continue;
    if (before) candidates.push(expand(before.bounds, padding));
    if (after) candidates.push(expand(after.bounds, padding));
  }

  const clipped = candidates
    .map((rectangle) => clipRectangle(rectangle, next.width, next.height))
    .filter(Boolean);
  const rects = coalesceDamage(clipped);
  const area = damageUnionArea(rects);
  return {
    rects,
    area,
    total: next.width * next.height,
    full: area >= next.width * next.height,
  };
}
