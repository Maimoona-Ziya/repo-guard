import test from "node:test";
import assert from "node:assert/strict";
import { add, list, clear } from "../src/notes.js";

test("add and list", () => {
  clear();
  add("buy milk");
  assert.deepEqual(list(), [{ text: "buy milk" }]);
});
