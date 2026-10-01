const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const code = fs.readFileSync(path.join(__dirname, "../js/chatbot.js"), "utf8");

const sandbox = {
  console,
  window: {
    setTimeout: () => 0,
    clearTimeout: () => {},
    addEventListener: () => {}
  },
  document: {
    getElementById: () => null,
    addEventListener: () => {},
    querySelectorAll: () => []
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  crypto: {
    randomUUID: () => "test-id"
  },
  URL: global.URL,
  fetch: async () => ({
    ok: true,
    json: async () => ({ response: "Sure — you can reset your CUNY password through the official CUNY password management page. Click below to get started.\n\n[CUNY_PASSWORD_RESET]" })
  }),
  AbortController: class {
    constructor() {}
    abort() {}
  },
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout
};
sandbox.globalThis = sandbox;
vm.runInNewContext(code, sandbox);

test("parseChatActions removes recognized tokens and exposes the safe action metadata", () => {
  const result = sandbox.parseChatActions(
    "Sure — you can reset your CUNY password through the official CUNY password management page. Click below to get started.\n\n[CUNY_PASSWORD_RESET]"
  );

  assert.equal(result.cleanMessage, "Sure — you can reset your CUNY password through the official CUNY password management page. Click below to get started.");
  assert.deepEqual(JSON.parse(JSON.stringify(result.actions)), [{
    type: "link",
    label: "Reset CUNY Password",
    url: "https://managelogin.cuny.edu/OIMSelfService/forgotpwd"
  }]);
});

test("parseChatActions ignores unknown action-like tokens", () => {
  const result = sandbox.parseChatActions("Need help. [SOME_RANDOM_ACTION]");

  assert.equal(result.cleanMessage, "Need help.");
  assert.deepEqual(JSON.parse(JSON.stringify(result.actions)), []);
});
