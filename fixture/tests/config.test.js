import test from "node:test";
import assert from "node:assert/strict";
import { getApiKey } from "../src/config.js";

test("api key is configured", () => {
  assert.ok(getApiKey().startsWith("sk-"));
});
