import test from "node:test";
import assert from "node:assert/strict";
import { authorized } from "../lib/auth";
const basic = (value: string) =>
  `Basic ${Buffer.from(value).toString("base64")}`;
test("private data requires the configured league password", () => {
  assert.equal(authorized(null, "secret"), false);
  assert.equal(authorized(basic("league:wrong"), "secret"), false);
  assert.equal(authorized(basic("someone:secret"), "secret"), false);
  assert.equal(authorized(basic("league:secret"), "secret"), true);
  assert.equal(authorized(basic("league:"), ""), false);
});
