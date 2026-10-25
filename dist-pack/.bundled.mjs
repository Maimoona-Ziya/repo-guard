// harness/test-policies.mjs
import fs2 from "node:fs";
import os2 from "node:os";
import path2 from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

// harness/repo.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var FAKE_KEY = "sk-live-FAKE-9f8e7d6c5b4a3921aabbccddeeff0011";
function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}
var identity = (d, n) => {
  git(d, "config", "user.email", `${n}@example.com`);
  git(d, "config", "user.name", n);
};
function setupRepo(work) {
  const envText = fs.readFileSync(path.join(work, "_env"), "utf8");
  fs.rmSync(path.join(work, "_env"));
  git(work, "init", "-q");
  git(work, "checkout", "-q", "-b", "main");
  identity(work, "student");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "initial commit");
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), "rg-origin-")) + "/origin.git";
  fs.mkdirSync(remote, { recursive: true });
  git(remote, "init", "-q", "--bare");
  git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
  git(work, "remote", "add", "origin", remote);
  git(work, "push", "-q", "-u", "origin", "main");
  const mate = fs.mkdtempSync(path.join(os.tmpdir(), "rg-mate-"));
  git(os.tmpdir(), "clone", "-q", remote, mate);
  identity(mate, "teammate");
  fs.appendFileSync(path.join(mate, "README.md"), `
## Team note
Deploy keys live in the shared vault, never in the repo.
`);
  git(mate, "commit", "-q", "-am", "docs: add team note");
  git(mate, "push", "-q", "origin", "main");
  const teammateSha = git(mate, "rev-parse", "HEAD");
  fs.rmSync(mate, { recursive: true, force: true });
  fs.writeFileSync(path.join(work, ".env"), envText);
  return { remote, teammateSha };
}

// harness/test-policies.mjs
var root = path2.resolve(path2.dirname(fileURLToPath(import.meta.url)), "..");
var tmp = fs2.mkdtempSync(path2.join(os2.tmpdir(), "rg-pol-"));
fs2.mkdirSync(path2.join(tmp, "node_modules", "failproofai"), { recursive: true });
fs2.writeFileSync(path2.join(tmp, "node_modules", "failproofai", "package.json"), '{"name":"failproofai","type":"module","main":"index.js"}');
fs2.writeFileSync(path2.join(tmp, "node_modules", "failproofai", "index.js"), `export const registry = []; export const customPolicies = { add: (p) => registry.push(p) };
   export const allow = (m) => ({ d: "allow", m }); export const deny = (m) => ({ d: "deny", m }); export const instruct = (m) => ({ d: "instruct", m });`);
fs2.copyFileSync(path2.join(root, "policies", "repo-guard.mjs"), path2.join(tmp, "p.mjs"));
var proj = path2.join(tmp, "proj");
fs2.cpSync(path2.join(root, "fixture"), proj, { recursive: true });
setupRepo(proj);
process.env.REPO_GUARD_STATE = path2.join(tmp, "state.json");
process.env.REPO_GUARD_LOG = path2.join(tmp, "log.jsonl");
process.chdir(proj);
await import(path2.join(tmp, "p.mjs"));
var { registry } = await import(path2.join(tmp, "node_modules", "failproofai", "index.js"));
var run = async (name, ctx) => (await registry.find((p) => p.name === `repo-guard/${name}`).fn({ cwd: proj, ...ctx })).d;
var n = 0;
var ok = (c, m) => {
  assert.ok(c, m);
  n++;
};
var bash = (command) => ({ toolName: "Bash", toolInput: { command } });
var write = (file_path, content) => ({ toolName: "Write", toolInput: { file_path, content } });
for (const c of ["git push --force origin main", "git push -f", "git push origin main --force-with-lease", "git push origin +main"])
  ok(await run("no-force-push", bash(c)) === "deny", `deny: ${c}`);
ok(await run("no-force-push", bash("git push origin main")) === "allow", "normal push ok");
ok(await run("no-force-push", bash("git pull --rebase origin main")) === "allow", "rebase ok");
ok(await run("no-secret-commits", bash("git add -A && git commit -m x")) === "deny", "chained add -A denied");
ok(await run("no-secret-commits", bash("git add .")) === "deny", "git add . denied");
ok(await run("no-secret-commits", bash("git add .env")) === "deny", "explicit .env denied");
ok(await run("no-secret-commits", bash("git add src tests && git commit -m feat")) === "allow", "explicit add ok");
ok(await run("no-secret-commits", bash("git status")) === "allow", "status ok");
fs2.writeFileSync(".gitignore", `.env
`);
ok(await run("no-secret-commits", bash("git add -A")) === "allow", "broad add ok once .env is ignored");
fs2.appendFileSync("src/config.js", `
export const K = "${FAKE_KEY}";
`);
ok(await run("no-secret-commits", bash("git add -A")) === "deny", "secret in working changes denied");
ok(await run("no-secret-commits", bash("git commit -am wip")) === "deny", "commit -a with secret denied");
git(proj, "checkout", "--", "src/config.js");
ok(await run("no-hardcoded-secrets", write("/w/src/config.js", `const k = "${FAKE_KEY}"`)) === "deny", "hardcode denied");
ok(await run("no-hardcoded-secrets", write("/w/.env", `NOTES_API_KEY=${FAKE_KEY}`)) === "allow", ".env itself ok");
ok(await run("no-hardcoded-secrets", write("/w/src/notes.js", "export function search(q){}")) === "allow", "normal code ok");
ok(await run("no-hardcoded-secrets", bash(`NOTES_API_KEY=${FAKE_KEY} npm test`)) === "deny", "literal key in command denied");
ok(await run("no-hardcoded-secrets", bash("export $(cat .env | xargs) && npm test")) === "allow", "loading .env at runtime ok");
ok(await run("env-reminder", bash("cat .env")) === "instruct", "first .env read -> instruct");
ok(await run("env-reminder", bash("cat .env")) === "allow", "only once");
var t = bash("npm test");
var seq = [];
for (let i = 0;i < 5; i++)
  seq.push(await run("loop-breaker", t));
ok(seq.join() === "allow,allow,instruct,allow,deny", `loop: ${seq}`);
git(proj, "add", "src");
fs2.appendFileSync("src/notes.js", `
// x
`);
git(proj, "commit", "-q", "-am", "feat");
var st = [];
for (let i = 0;i < 3; i++)
  st.push(await run("finish-the-job", {}));
ok(st.join() === "deny,deny,allow", `stop: ${st}`);
fs2.rmSync(process.env.REPO_GUARD_STATE, { force: true });
git(proj, "pull", "-q", "--rebase", "origin", "main");
git(proj, "push", "-q", "origin", "main");
ok(await run("finish-the-job", {}) === "allow", "pushed -> may stop");
console.log(`policy logic OK (${n} assertions)`);
