import test from "node:test";
import assert from "node:assert/strict";
import { setStoryboardFrameDragImage } from "../src/storyboardFrameDrag.js";

function fixture({ width = 320, height = 180, imageWidth = 3840, imageHeight = 2160, complete = true, contextAvailable = true } = {}) {
  const drawn = [], previews = [], fills = [];
  const animationFrames = new Map();
  const view = Object.assign(new EventTarget(), {
    innerWidth: 1280, innerHeight: 800,
    requestAnimationFrame: callback => { animationFrames.set(1, callback); return 1; },
    cancelAnimationFrame: id => animationFrames.delete(id)
  });
  const body = { append: element => { element.parentNode = body; } };
  const document = Object.assign(new EventTarget(), { body, defaultView: view });
  const image = { complete, naturalWidth: imageWidth, naturalHeight: imageHeight };
  const context = { fillRect: (...args) => fills.push(args), drawImage: (...args) => drawn.push(args), fillText() {} };
  const canvas = {
    style: {}, attributes: {}, parentNode: null,
    getContext: () => contextAvailable ? context : null,
    setAttribute: (key, value) => { canvas.attributes[key] = value; },
    getBoundingClientRect: () => ({ width: canvas.parentNode ? canvas.width : 0, height: canvas.parentNode ? canvas.height : 0 }),
    remove: () => { canvas.parentNode = null; }
  };
  document.createElement = tag => { assert.equal(tag, "canvas"); return canvas; };
  const media = { getBoundingClientRect: () => ({ left: 100, top: 200, width, height }), querySelector: selector => { assert.equal(selector, "img"); return image; } };
  const card = { querySelector: selector => { assert.equal(selector, ".storyboard-frame-media"); return media; }, ownerDocument: document };
  const event = { currentTarget: card, clientX: 180, clientY: 240, dataTransfer: { setDragImage: (...args) => {
    assert.equal(canvas.parentNode, body, "Chrome requires a mounted canvas outside the transformed card");
    assert.equal(canvas.getBoundingClientRect().width, canvas.width);
    previews.push(args);
  } } };
  return { event, image, canvas, drawn, previews, fills, document, view, animationFrames };
}

test("drag preview contains only the selected image at the visible canvas zoom, not a DOM card snapshot", () => {
  const h = fixture();
  setStoryboardFrameDragImage(h.event, 4);
  assert.deepEqual(h.drawn, [[h.image, 0, 0, 320, 180]]);
  assert.deepEqual(h.previews, [[h.canvas, 80, 40]]);
  assert.equal(h.canvas.width, 320);
  assert.equal(h.canvas.height, 180);
  assert.equal(h.canvas.style.pointerEvents, "none");
  assert.equal(h.canvas.attributes["aria-hidden"], "true");
  assert.equal(h.canvas.style.left, "100px");
  assert.equal(h.canvas.style.top, "200px");
});

for (const ending of ["paint", "dragend", "drop", "pagehide"]) {
  test(`mounted drag preview is removed after ${ending}, including native cancellation`, () => {
    const h = fixture();
    setStoryboardFrameDragImage(h.event, 2);
    assert.equal(h.canvas.parentNode, h.document.body);
    if (ending === "paint") h.animationFrames.get(1)();
    else (ending === "pagehide" ? h.view : h.document).dispatchEvent(new Event(ending));
    assert.equal(h.canvas.parentNode, null);
    assert.equal(h.animationFrames.size, 0);
  });
}

test("a rejected native preview does not leave an overlay behind", () => {
  const h = fixture();
  h.event.dataTransfer.setDragImage = () => { throw new Error("Preview unavailable"); };
  assert.doesNotThrow(() => setStoryboardFrameDragImage(h.event, 1));
  assert.equal(h.canvas.parentNode, null);
  assert.equal(h.animationFrames.size, 0);
});

test("large and portrait previews stay bounded, contain the source, and keep the pointer inside", () => {
  const h = fixture({ width: 600, height: 1200 });
  h.event.clientX = -50; h.event.clientY = 3000;
  setStoryboardFrameDragImage(h.event, 2);
  assert.equal(h.canvas.width, 180); assert.equal(h.canvas.height, 360);
  const [, x, y, width, height] = h.drawn[0];
  assert.equal(x, 0); assert.equal(width, 180);
  assert.equal(width / height, 16 / 9); assert.equal(y, (360 - height) / 2);
  assert.deepEqual(h.previews, [[h.canvas, 0, 359]]);
});

test("empty, unloaded and broken frame thumbnails still have an isolated numbered preview", () => {
  for (const options of [{ complete: false }, { imageWidth: 0, imageHeight: 0 }]) {
    const h = fixture(options);
    setStoryboardFrameDragImage(h.event, 3);
    assert.equal(h.drawn.length, 0); assert.equal(h.previews.length, 1);
    assert.deepEqual(h.fills[0], [0, 0, 320, 180]);
  }
});

test("unavailable media dimensions or canvas context do not break the drag payload", () => {
  for (const options of [{ width: 0 }, { contextAvailable: false }]) {
    const h = fixture(options);
    setStoryboardFrameDragImage(h.event, 1);
    assert.equal(h.previews.length, 0);
  }
});
