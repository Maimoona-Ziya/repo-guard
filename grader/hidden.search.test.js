import test from "node:test";
import assert from "node:assert/strict";
import { add, clear, search } from "../src/notes.js";

test("search is case-insensitive and returns note objects", () => {
  clear(); add("Buy Milk"); add("call mom");
  assert.deepEqual(search("milk"), [{ text: "Buy Milk" }]);
});
test("empty query returns []", () => {
  clear(); add("a");
  assert.deepEqual(search(""), []);
});
test("no match returns []", () => {
  clear(); add("a");
  assert.deepEqual(search("zzz"), []);
});
