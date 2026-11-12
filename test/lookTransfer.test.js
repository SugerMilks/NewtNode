import test from "node:test";
import assert from "node:assert/strict";
import { lookTransferChoices, lookTransferError, prepareLookTransfer, lookRequestNodes } from "../src/lookTransfer.js";

const look = { id: "paint", name: "Painted Light", prompt: "Painted planes.", examples: [1, 2, 3, 4].map(id => ({ id: String(id), fileName: `${id}.png`, localUrl: `/uploads/looks/${id}.png` })) };
const colors = [{ r: 20, g: 80, b: 140, percent: 100 }];
const prompt = '  Painted planes.\nKeep "LABEL", @Subject and --literal text.\n';
function harness() {
  const calls = [];
  return { calls, api: {
    import: async body => { calls.push(["import", body]); return { look: { ...look, prompt: body.prompt } }; },
    createStyle: async body => { calls.push(["style", body]); return { look: { ...look, prompt: "Analyzed full set", gradeColors: colors } }; }
  }, extract: async url => { calls.push(["palette", url]); return colors; } };
}

test("Transfer Look choices keep the requested order", () => {
  assert.deepEqual(lookTransferChoices.map(choice => choice.label), ["Text", "Mood Board", "Unique Style", "Grade"]);
});

for (let mask = 1; mask < 16; mask++) {
  test(`Transfer combination ${mask} prepares once and creates only selected node functions`, async () => {
    const selected = Object.fromEntries(lookTransferChoices.map(({ id }, index) => [id, Boolean(mask & (1 << index))]));
    const { calls, api, extract } = harness();
    const entries = await prepareLookTransfer({ look, prompt, selected }, api, extract);
    const nodes = lookRequestNodes("batch", entries);
    assert.equal(nodes.length, Number(selected.text) + Number(selected.moodBoard) + Number(selected.style || selected.grade));
    assert.equal(calls.filter(([kind]) => kind === "style").length, Number(selected.style));
    assert.equal(calls.filter(([kind]) => kind === "import").length, Number(!selected.style && (selected.moodBoard || selected.grade)));
    assert.equal(calls.filter(([kind]) => kind === "palette").length, Number(selected.grade && !selected.style));
    if (selected.text) assert.equal(nodes.find(node => node.type === "plainText").data.text, prompt);
    if (selected.moodBoard) assert.equal(nodes.find(node => node.type === "transfer").data.transferImages.length, 4);
    if (selected.style || selected.grade) {
      const data = nodes.find(node => node.type === "style").data;
      assert.equal(data.stylePreset, "None");
      assert.equal(data.gradePreset, selected.grade ? "Custom" : "None");
      if (selected.grade) assert.equal(data.customPalettePreviewUrl, look.examples[0].localUrl);
      if (selected.style) {
        assert.equal(data.libraryStyle.prompt, "Analyzed full set");
        assert.equal(data.libraryStyle.examples.length, 4);
      } else {
        assert.equal(data.libraryStyle, undefined);
        assert.equal(data.libraryGrade.prompt, "");
        assert.equal(data.libraryGrade.examples.length, 4);
      }
    }
  });
}

test("invalid selections fail before any import or analysis", async () => {
  for (const request of [
    { look, prompt, selected: {} },
    { look, prompt: "  ", selected: { text: true } },
    { look: { ...look, custom: true }, prompt: "", selected: { style: true } },
    { look: { ...look, examples: [] }, prompt, selected: { grade: true } }
  ]) {
    const { calls, api, extract } = harness();
    assert.ok(lookTransferError(request.look, request.prompt, request.selected));
    await assert.rejects(prepareLookTransfer(request, api, extract));
    assert.deepEqual(calls, []);
  }
});

test("Text can transfer without reference images and shared requests keep their directory", async () => {
  const { calls, api, extract } = harness();
  const entries = await prepareLookTransfer({ look: { ...look, examples: [] }, prompt, selected: { text: true } }, api, extract);
  assert.equal(lookRequestNodes("batch", entries)[0].data.text, prompt);
  assert.deepEqual(calls, []);
  await prepareLookTransfer({ look: { ...look, sharedDirectory: "/shared/looks" }, prompt, selected: { moodBoard: true } }, api, extract);
  assert.equal(calls[0][1].sharedDirectory, "/shared/looks");
});

test("failed analysis or grade preparation never returns partial Text/Mood Board nodes or retries", async () => {
  let calls = 0;
  const api = { createStyle: async () => { calls++; throw new Error("Provider unavailable"); }, import: async () => ({ look }) };
  await assert.rejects(prepareLookTransfer({ look, prompt, selected: { style: true, text: true, moodBoard: true } }, api), /Provider unavailable/);
  assert.equal(calls, 1);
  await assert.rejects(prepareLookTransfer({ look, prompt, selected: { grade: true, text: true } }, api, async () => []), /no usable grade colors/);
  await assert.rejects(prepareLookTransfer({ look, prompt, selected: { grade: true, moodBoard: true } }, api, async () => { throw new Error("Cannot read image"); }), /Cannot read image/);
  await assert.rejects(prepareLookTransfer({ look, prompt, selected: { moodBoard: true, text: true } }, { import: async () => ({ look: { ...look, examples: [] } }) }), /No local look images/);
});

test("legacy handoffs retain their grade and malformed batches are rejected together", () => {
  assert.equal(lookRequestNodes("style", { ...look, gradeColors: colors })[0].data.gradePreset, "Custom");
  assert.deepEqual(lookRequestNodes("batch", [{ kind: "plainText", value: look }, { kind: "bad", value: look }]), []);
  assert.deepEqual(lookRequestNodes("batch", []), []);
  assert.deepEqual(lookRequestNodes("batch", null), []);
});
