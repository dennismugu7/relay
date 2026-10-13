# 012 — M5 end to end: a realistic project, 7 rounds unattended

**Date:** 2026-10-13 · **Claude Code:** 2.1.296 · **OS:** Windows 11, Node 24.19 · **Model:** Opus 5.5 (the default, in both sessions) · **Delivery:** rewake · **Relay:** commit `2f2e662` (with the nudge, ADR 0007), installed with `npm link`

## Question
Stage 1 is done when Relay runs **at least 5 rounds unattended** on a realistic project, set up only as the README says. Does it?

## Setup
A new project, `C:\Users\denni\projects\relay-playground`: a tiny HTTP server on Node's built-in `node:http`, with one route, a test, its own `CLAUDE.md` and `README.md`, committed to its own git repo.
```
src/server.js          createServer(): GET /hello?name=… → {"message":"Hello, …!"}, anything else → 404
src/index.js           npm start, port 3000
test/server.test.js    2 tests with node:test
CLAUDE.md              "No dependencies: use Node built-ins only…"
```
`npm test`: 2 of 2 pass. Then, exactly as the README says:
```
> relay init relay-playground
Relay is set up for relay-playground.
  wrote C:\Users\denni\projects\relay-playground-lead\relay.config.json
  wrote C:\Users\denni\projects\relay-playground-lead\CLAUDE.md
  wrote C:\Users\denni\projects\relay-playground-lead\.claude\settings.json
  wrote C:\Users\denni\projects\relay-playground\.claude\rules\relay-builder.md
  wrote C:\Users\denni\projects\relay-playground\.claude\skills\relay-start\SKILL.md
  wrote C:\Users\denni\projects\relay-playground\.claude\settings.local.json
  wrote C:\Users\denni\projects\relay-playground\.git\info\exclude
```
`git status` stayed empty, and a second `relay init` printed "Nothing changed". Both sessions were started with plain `claude` (no flags), through the spike's pseudo-terminal harness:
1. Builder, in `relay-playground`: `/relay-start` → `Relay builder ready. Waiting for the lead.`
2. Lead, in `relay-playground-lead`: the goal below. After that, nobody typed into either session until the lead said `TO DENNIS:`.

(Harness note: long prompts needed Enter three times before Claude Code submitted them. That's how the harness types, not Relay. Once a goal was submitted, nothing more was sent.)

## Run 1: complete and correct, but only 4 rounds
Goal (the example from Dennis's M5 brief):
> Goal: in the project, add a GET /health endpoint that returns {"status":"ok"}, a GET /time endpoint that returns the current time as an ISO string, input validation on /hello (name must be 1 to 50 letters, otherwise 400 with an error message), tests for all of them, and a short README section documenting the routes. Give the builder one step per task and review each step before the next. When everything is done and npm test passes, tell Dennis.

The run went cleanly: 4 rounds in **2 min 8 s** (18:34:22 to 18:36:30), ending with `TO DENNIS:` and 12 of 12 tests passing. It fell short of 5 rounds because the lead sensibly asked for each endpoint's tests in the same task as the endpoint, so five goal items became four tasks. Relay didn't stop early or fail. Nothing broke, so there's no bug entry. I committed run 1's work in the playground and gave the same lead a longer goal.

## Run 2: 7 rounds in 9 min 50 s, nobody typing
Goal, typed into the same lead session after its `TO DENNIS:`:
> Thanks, keep the missing-name behaviour; I committed your three steps. New goal, one step per task in this order, reviewing each before the next: 1) known routes called with the wrong method return 405 with an Allow header; 2) add POST /echo that returns the JSON body it receives, with 400 for invalid JSON; 3) reject /echo bodies over 1 KB with 413; 4) add GET /version that returns the version from package.json; 5) log one line per request (method, path, status, duration in ms) to stdout, but not during tests; 6) update the README routes section for all of this. Every step needs tests. When everything is done and npm test passes, tell Dennis.

**7 rounds** (18:37:43 to 18:47:33): the six steps, plus a seventh the lead added itself. While doing step 5, the builder noticed that a request to `//` crashed the whole server (`new URL('//', …)` throws). It said so in its report. The lead confirmed it and sent an extra "Step 5b" to fix it before the README step. That's the review loop doing real work.

- No `nudge` and no `error` entries in the activity log: the lead put its tag first every time.
- No re-arms were needed. Every round was well inside the 3600 s hook timeout.
- The longest round was step 5b, about 4 minutes, while the builder chased a test that hung (`npm test` waits forever when a request never gets a response).

### What the builder built (run 2)
`git diff --stat` before committing: 4 files changed, 332 insertions, 14 deletions.
- **`src/server.js`**: a route table (path → method → handler). A known path with the wrong method gets 405 and an `Allow` header built from the table. `POST /echo` reads the body as a stream with a 1024-byte cap: 413 if it's over (counted in bytes, checked before parsing), and 400 for invalid JSON. `GET /version` reads `package.json`. An optional logger prints `GET /health 200 1.3ms`, without the query string. An unparsable URL gets 400 instead of crashing.
- **`src/index.js`**: `npm start` passes a logger in, and tests don't, so tests stay quiet.
- **`test/server.test.js`**: 20 new tests, including exactly 1024 and 1025 bytes, multibyte characters, a streamed body with no length header, and a raw `GET //` sent with `node:http`, because `fetch` would tidy it up.
- **`README.md`**: all five routes plus a "Behaviour" section.

### `npm test` in the playground afterwards
```
✔ GET /hello greets the given name
✔ GET /hello without a name greets the world
✔ GET /hello accepts a 50-letter name
✔ GET /hello accepts non-ASCII letters
✔ GET /hello rejects an invalid name (empty)
✔ GET /hello rejects an invalid name (51 letters)
✔ GET /hello rejects an invalid name (digits)
✔ GET /hello rejects an invalid name (space)
✔ GET /hello rejects an invalid name (punctuation)
✔ GET /health reports ok
✔ GET /time returns the current ISO time
✔ unknown routes return 404
✔ POST /health returns 405 with an Allow header
✔ DELETE /hello returns 405 with an Allow header
✔ PUT /time returns 405 with an Allow header
✔ unknown routes return 404 whatever the method
✔ POST /echo returns the JSON object it receives
✔ POST /echo returns non-object JSON values too
✔ POST /echo rejects invalid JSON (malformed)
✔ POST /echo rejects invalid JSON (empty)
✔ POST /echo accepts a body of exactly 1024 bytes
✔ POST /echo rejects an oversized body (1025 bytes)
✔ POST /echo rejects an oversized body (multibyte characters)
✔ POST /echo rejects an oversized body (invalid JSON)
✔ POST /echo rejects an oversized streamed body without Content-Length
✔ GET /version returns the package version
✔ POST /version returns 405 with Allow: GET
✔ GET /echo returns 405 with Allow: POST
✔ a server with a logger logs one line per request, without the query string
✔ a server without a logger writes nothing to stdout
✔ GET // returns 400 instead of crashing the server
✔ the server still answers after an unparsable URL
ℹ tests 32
ℹ pass 32
ℹ fail 0
```
(Timings removed for readability.)

### Checks afterwards
- `git status` in the playground listed only the builder's four files. None of Relay's files showed up.
- The playground's own `CLAUDE.md` was unchanged (`md5sum -c` → `OK`).
- `relay status` after the run, and after `relay start` reset it for Dennis: `Baton: Dennis`, `Rounds: 0 of 20`, `Queue: empty`.

### One flaw in the lead's final report
The final `TO DENNIS:` report is accurate and useful (it lists four sensible follow-ups and asks before committing). But its last line, "Scope: … I didn't touch the README", was copied from an earlier builder report, and it's wrong: step 6 did change the README. That's the model's wording, not Relay's. It's a reminder to check the work itself (here, `git diff`), not just the summary.

## Activity log (both runs, `relay log`)
```text
2026-10-13
18:34:22  lead → builder   Add a `GET /health` endpoint to the project. In `C:\Users\denni\projects\relay-playground\src\serve…
18:34:41  builder → lead   I added `GET /health`, which returns 200 with `{"status":"ok"}`, and a test for it. `npm test` pass…
18:34:53  lead → builder   Step 1 (/health) checks out. I looked at the diff and re-ran `npm test`, and all 3 tests pass. Next…
18:35:11  builder → lead   I added `GET /time`, which returns 200 with `{"time": "<ISO string>"}`, and a test for it. `npm tes…
18:35:25  lead → builder   Step 2 (/time) checks out. I looked at the diff and re-ran `npm test`, and all 4 tests pass. Good c…
18:35:48  builder → lead   `GET /hello` now validates `name` by your three rules, and I added tests for all 8 cases. `npm test…
18:35:59  lead → builder   Step 3 (/hello validation) checks out. I read `src/server.js`, looked at the test diff and re-ran `…
18:36:18  builder → lead   The `## Routes` section in the README now has one bullet each for `/hello`, `/health` and `/time`. …
18:36:30  lead → Dennis    Everything you asked for is in, and `npm test` passes all 12 tests. I re-ran it myself and checked …
18:37:43  lead → builder   New goal, step 1 of 6: known routes called with the wrong method should return 405 with an `Allow` …
18:38:20  builder → lead   Wrong-method requests to known routes now get a 405 with an `Allow` header, and routing goes throug…
18:38:37  lead → builder   Step 1 (405 + Allow) checks out. I read the new `src/server.js`, looked at the test diff and re-ran…
18:39:03  builder → lead   `POST /echo` now returns the JSON body it receives, and a failing async handler gets a 500 instead …
18:39:24  lead → builder   Step 2 (`POST /echo`) checks out. I looked at the full diff and re-ran `npm test`, and all 21 tests…
18:39:54  builder → lead   `/echo` now rejects bodies over 1024 bytes with 413. `npm test` passes: 26 tests, 26 pass, 0 fail. …
18:40:05  lead → builder   Step 3 (413 limit) checks out. I read `readBody` and the `/echo` handler, looked at the new tests a…
18:40:31  builder → lead   `GET /version` now returns the version from `package.json`. `npm test` passes: 28 tests, 28 pass, 0…
18:40:57  lead → builder   Step 4 (`/version`) checks out. I checked every `fetch(` call in the test file for leftover damage …
18:42:32  builder → lead   Request logging works: `npm start` prints one line per request, and the tests print none. `npm test…
18:42:50  lead → builder   Step 5 (request logging) checks out. I read the logger code, `src/index.js` and both new tests, and…
18:46:44  builder → lead   `GET //` now returns 400 `{ "error": "Bad request" }` instead of crashing the server, and the 400 i…
18:46:58  lead → builder   Step 5b (`GET //` fix) checks out. I read the `try/catch` and the `rawRequest` helper and re-ran `n…
18:47:17  builder → lead   The README now documents all five routes and has a short `## Behaviour` section. `npm test` still p…
18:47:33  lead → Dennis    All six steps are done and `npm test` passes all 32 tests. I re-ran it myself after each step and c…
18:48:23  started
```

<details><summary>Full messages for both runs (<code>relay log --full</code>)</summary>

````text
2026-10-13
18:34:22  lead → builder
    Add a `GET /health` endpoint to the project.
    
    In `C:\Users\denni\projects\relay-playground\src\server.js`, add a route alongside the existing `/hello` route: `GET /health` returns status 200 with JSON body `{"status":"ok"}`. Use the existing `sendJson` helper.
    
    In `C:\Users\denni\projects\relay-playground\test\server.test.js`, add a test using the same style as the existing tests. It should check that `GET /health` returns status 200 and the body deep-equals `{ status: 'ok' }`.
    
    Use only Node built-ins and add no dependencies. Don't change anything else yet. Leave the README alone, because that's a later step. Run `npm test` in `C:\Users\denni\projects\relay-playground` and report what you changed and the test output (pass/fail counts).
18:34:41  builder → lead
    I added `GET /health`, which returns 200 with `{"status":"ok"}`, and a test for it. `npm test` passes: 3 tests, 3 pass, 0 fail.
    
    **Changes:**
    - **`src/server.js`:** new route for `GET /health` right after the `/hello` route, using `sendJson(res, 200, { status: 'ok' })`.
    - **`test\server.test.js`:** new test `GET /health reports ok`, written like the existing ones. It checks that the status is 200 and that the body deep-equals `{ status: 'ok' }`.
    
    **Test output:** the `/hello`, `/health` and 404 tests all passed. Cancelled, skipped and todo were all 0.
    
    **For the lead:** only those two files changed. I didn't touch the README and added no dependencies. Nothing is committed yet.
18:34:53  lead → builder
    Step 1 (/health) checks out. I looked at the diff and re-ran `npm test`, and all 3 tests pass. Next, add a `GET /time` endpoint.
    
    In `C:\Users\denni\projects\relay-playground\src\server.js`, add a route after `/health`: `GET /time` returns status 200 with JSON body `{"time": "<ISO string>"}`. Get the time from `new Date().toISOString()`, evaluated on each request. Use the existing `sendJson` helper.
    
    In `C:\Users\denni\projects\relay-playground\test\server.test.js`, add a test in the same style. It should check that:
    - the status is 200
    - `body.time` is a string matching the ISO 8601 UTC format `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/`
    - `new Date(body.time).toISOString() === body.time`
    - the time falls between a `Date.now()` taken just before the request and one taken just after it
    
    Use only Node built-ins and add no dependencies. Don't touch `/hello` or the README yet. Run `npm test` and report what you changed and the pass/fail counts.
18:35:11  builder → lead
    I added `GET /time`, which returns 200 with `{"time": "<ISO string>"}`, and a test for it. `npm test` passes: 4 tests, 4 pass, 0 fail.
    
    **Changes:**
    - **`src/server.js`:** new route for `GET /time` right after `/health`, using `sendJson(res, 200, { time: new Date().toISOString() })`. The time is computed fresh on each request.
    - **`test\server.test.js`:** new test `GET /time returns the current ISO time`. It checks all four things you asked for:
      - the status is 200
      - `body.time` is a string matching the ISO 8601 UTC pattern
      - `new Date(body.time).toISOString() === body.time`
      - the time falls between a `Date.now()` taken just before the request and one taken just after it
    
    **Test output:** the `/hello`, `/health`, `/time` and 404 tests all passed. Cancelled, skipped and todo were all 0.
    
    **For the lead:** I named the two timestamps `start` and `end` rather than `before` and `after`, because those names are already taken by the `node:test` hooks this file imports. Only these two files changed. I didn't touch `/hello` or the README and added no dependencies. Nothing is committed yet.
18:35:25  lead → builder
    Step 2 (/time) checks out. I looked at the diff and re-ran `npm test`, and all 4 tests pass. Good call renaming the timestamps to `start` and `end`. Next, add input validation to `GET /hello`.
    
    In `C:\Users\denni\projects\relay-playground\src\server.js`, change the `/hello` route so it follows these rules:
    - **No `name` query parameter at all** (`url.searchParams.get('name')` returns `null`): keep today's behaviour and respond 200 with `{ "message": "Hello, world!" }`.
    - **`name` is present:** it must match `/^\p{L}{1,50}$/u`, meaning 1 to 50 Unicode letters with no digits, spaces, punctuation or other characters. If it matches, respond 200 with `{ "message": "Hello, <name>!" }` as now.
    - **`name` is present but doesn't match:** this includes the empty string (`?name=`) and anything over 50 letters. Respond 400 with `{ "error": "name must be 1 to 50 letters" }`.
    
    Keep using `sendJson`, and keep the code in the same style as the file.
    
    In `C:\Users\denni\projects\relay-playground\test\server.test.js`, keep the existing `/hello` test and add tests in the same style for these cases:
    1. no `name` → 200, `Hello, world!`
    2. a 50-letter name (`'a'.repeat(50)`) → 200 with the matching message
    3. a non-ASCII letter name, such as `José` passed through `encodeURIComponent` → 200, `Hello, José!`
    4. `?name=` (empty) → 400 with the exact error body above
    5. a 51-letter name → 400
    6. a name with digits, such as `Dennis1` → 400
    7. a name with a space, such as `Den nis` URL-encoded → 400
    8. a name with punctuation, such as `<script>` URL-encoded → 400
    
    For each 400 case, assert both the status and the error body. A small loop or helper over the invalid cases is fine if it keeps things readable.
    
    Use only Node built-ins. Don't touch the README yet. Run `npm test` and report what you changed and the pass/fail counts.
18:35:48  builder → lead
    `GET /hello` now validates `name` by your three rules, and I added tests for all 8 cases. `npm test` passes: 12 tests, 12 pass, 0 fail.
    
    **Changes:**
    - **`src/server.js`:** the `/hello` route now handles three cases:
      - no `name` parameter: 200 with `Hello, world!`
      - `name` matches `/^\p{L}{1,50}$/u`: 200 with `Hello, <name>!`
      - anything else: 400 with `{ error: 'name must be 1 to 50 letters' }`
    
      It still uses `sendJson`.
    - **`test\server.test.js`:** I kept the existing `/hello` test and added:
      - three tests for the valid cases: no `name`, a 50-letter name, and `José`
      - one loop over an object of the five invalid cases (empty, 51 letters, `Dennis1`, `Den nis`, `<script>`). Each value is URL-encoded, and each test asserts both the 400 status and the exact error body. Each case reports as its own test, such as `rejects an invalid name (digits)`.
    
    **Test output:** the existing tests and all the new `/hello` cases passed. Cancelled, skipped and todo were all 0.
    
    **For the lead:**
    - **Decomposed accents:** the regex treats a name like `José` with the é stored as two characters (plain `e` plus a separate accent mark) as invalid. The accent mark is not a letter to `\p{L}`, so that version gets a 400. The single-character `é` that `encodeURIComponent('José')` sends is fine. If decomposed names should be accepted, the fix is to call `name.normalize('NFC')` before the check or to allow marks with `[\p{L}\p{M}]`. That would also change how the 50-letter limit counts accented letters. I kept the regex exactly as you specified.
    - **Scope:** only those two files changed. I didn't touch the README and added no dependencies. Nothing is committed yet.
18:35:59  lead → builder
    Step 3 (/hello validation) checks out. I read `src/server.js`, looked at the test diff and re-ran `npm test`, and all 12 tests pass. Thanks for flagging the decomposed-accent case. We'll leave the regex as it is, and I'll mention it to Dennis.
    
    The last step is to document the routes. In `C:\Users\denni\projects\relay-playground\README.md`, update the existing `## Routes` section so it briefly covers all three routes in the same terse bullet style as the current line. The bullets should cover:
    - **`GET /hello?name=Dennis`** → `{ "message": "Hello, Dennis!" }`. Without `name` it greets `world`. `name` must be 1 to 50 letters (Unicode letters allowed; no digits, spaces or punctuation), otherwise it returns 400 with `{ "error": "name must be 1 to 50 letters" }`.
    - **`GET /health`** → `{ "status": "ok" }`
    - **`GET /time`** → `{ "time": "<current time as an ISO 8601 string>" }`, for example `"2026-10-13T18:45:00.000Z"`
    
    Keep it short. Don't change any other part of the README or any other file. Then run `npm test` once more and report the README diff and the pass/fail counts.
18:36:18  builder → lead
    The `## Routes` section in the README now has one bullet each for `/hello`, `/health` and `/time`. `npm test` still passes: 12 tests, 12 pass, 0 fail.
    
    **README diff:**
    ```diff
     ## Routes
     
    -- `GET /hello?name=Dennis` → `{ "message": "Hello, Dennis!" }`
    +- `GET /hello?name=Dennis` → `{ "message": "Hello, Dennis!" }`. Without `name` it greets `world`. `name` must be 1 to 50 letters (Unicode letters allowed; no digits, spaces or punctuation), otherwise 400 → `{ "error": "name must be 1 to 50 letters" }`
    +- `GET /health` → `{ "status": "ok" }`
    +- `GET /time` → `{ "time": "<current time as an ISO 8601 string>" }`, e.g. `"2026-10-13T18:45:00.000Z"`
    ```
    
    **For the lead:**
    - **Scope:** I changed only the `## Routes` section and no other file in this step.
    - **Line-ending warning:** Git warned that it will convert the README's LF line endings to CRLF the next time it touches the file. That comes from Git's line-ending setting on this machine, not from the edit.
    - **Not committed:** all three steps are still uncommitted changes in `README.md`, `src/server.js` and `test\server.test.js`.
18:36:30  lead → Dennis
    Everything you asked for is in, and `npm test` passes all 12 tests. I re-ran it myself and checked each step against the code before moving on.
    
    - **`GET /health`** returns `{"status":"ok"}`.
    - **`GET /time`** returns `{"time":"<ISO string>"}`, taken fresh on each request. Its test checks the format and that the time falls within the request window.
    - **`/hello` validation:** `name` must be 1 to 50 letters. Accented and other non-English letters are allowed, so `José` works. Anything else gets a 400 with `{"error":"name must be 1 to 50 letters"}`, including an empty name, 51 letters, digits, spaces and punctuation.
    - **Tests:** they cover every route, the valid `/hello` cases and five invalid ones.
    - **README:** the Routes section now documents all three routes.
    
    The changes are in `src/server.js`, `test/server.test.js` and `README.md`. **Nothing is committed yet.**
    
    Decisions for you:
    1. **Request with no name at all:** I had the builder keep the old behaviour, so it still answers `Hello, world!`. Only a name that is given but invalid gets the 400. If a missing name should also be a 400, that's a one-line change.
    2. **Accents typed as two characters:** an accented letter can be typed either as one character or as a plain letter plus a separate accent mark. Names using the two-character form, which some keyboards and macOS produce, are rejected. The fix is to normalize the name before checking it; I left this alone.
    3. **Commit:** should I have the builder commit the three files?
18:37:43  lead → builder
    New goal, step 1 of 6: known routes called with the wrong method should return 405 with an `Allow` header.
    
    In `C:\Users\denni\projects\relay-playground\src\server.js`, refactor the routing into a small route table that maps each path to the handler for each method. For example:
    
    ```js
    const routes = {
      '/hello': { GET: (req, res, url) => { ... } },
      '/health': { GET: ... },
      '/time': { GET: ... },
    };
    ```
    
    Later steps will add `POST /echo` and `GET /version`, so make adding a method or path a one-line change. Then the request handler works like this:
    - **Path not in the table:** 404 `{ "error": "Not found" }`, whatever the method (unchanged behaviour).
    - **Path in the table but no handler for `req.method`:** 405 with the header `Allow: <comma-and-space-separated list of that path's methods>`, built from the table rather than hard-coded, and the JSON body `{ "error": "Method not allowed" }`.
    - **Otherwise:** call the handler. All existing behaviour must stay identical, including the `/hello` validation.
    
    To send the header, extend `sendJson` with an optional fourth `headers` argument that is merged into `writeHead`. Don't add a separate helper.
    
    In `C:\Users\denni\projects\relay-playground\test\server.test.js`, add tests in the existing style:
    1. `POST /health` → 405, `Allow` header equals `GET`, body deep-equals `{ error: 'Method not allowed' }`
    2. `DELETE /hello` → 405 with `Allow: GET`
    3. `PUT /time` → 405 with `Allow: GET`
    4. `POST /nope` → 404 (an unknown path stays 404 regardless of method)
    
    A loop over the 405 cases is fine. All existing tests must keep passing unchanged.
    
    Use only Node built-ins and don't touch the README. Don't commit. Run `npm test` in `C:\Users\denni\projects\relay-playground` and report what you changed and the pass/fail counts.
18:38:20  builder → lead
    Wrong-method requests to known routes now get a 405 with an `Allow` header, and routing goes through a table. `npm test` passes: 16 tests, 16 pass, 0 fail.
    
    **Changes:**
    - **`src/server.js`:**
      - **`sendJson`:** takes an optional fourth `headers` argument (default `{}`), which is merged into `writeHead` after `Content-Type`.
      - **Route table:** a new `routes` object maps each path to `{ METHOD: (req, res, url) => ... }`. The `/hello`, `/health` and `/time` code moved into it unchanged, including the `/hello` validation. Adding a method or path is now one entry.
      - **Request handler:**
        - path not in the table: 404 `{ error: 'Not found' }`
        - no handler for `req.method`: 405 `{ error: 'Method not allowed' }`, with `Allow` built from `Object.keys(methods).join(', ')`
        - otherwise: it calls the handler
    - **`test\server.test.js`:** I left the existing tests unchanged and added:
      - one loop that checks `POST /health`, `DELETE /hello` and `PUT /time` each return status 405, `Allow: GET` and the exact error body
      - `POST /nope` → 404
    
    **Test output:** all 12 existing tests and the 4 new ones passed.
    
    **For the lead:**
    - **Lookups:** they use `Object.hasOwn`, so a path or method that happens to match a built-in object property name (like `constructor`) gets 404 or 405 instead of being run as a handler.
    - **HEAD requests:** because there's no special handling, `HEAD /health` now gets a 405 with `Allow: GET`. Before, it got a 404. Many servers answer HEAD for any route that supports GET. Tell me if you want that.
    - **Earlier work committed:** someone committed the earlier steps as `3390adc` ("Add /health, /time and /hello validation (Relay M5 run 1)"). This step's changes are uncommitted, in `src/server.js` and `test\server.test.js` only. I didn't touch the README.
18:38:37  lead → builder
    Step 1 (405 + Allow) checks out. I read the new `src/server.js`, looked at the test diff and re-ran `npm test`, and all 16 tests pass. The route table is clean and the `Object.hasOwn` guard is a good touch. We'll leave HEAD as a 405 for now, since it wasn't asked for, and I'll mention it to Dennis.
    
    Step 2 of 6: add `POST /echo`, which returns the JSON body it receives.
    
    In `C:\Users\denni\projects\relay-playground\src\server.js`:
    - **Body helper:** add a small function `readBody(req)` that returns a Promise resolving to the full request body as a UTF-8 string. Collect the chunks and use `Buffer.concat`. Keep it as its own function: the next step will add a size limit there.
    - **Route:** add `'/echo': { POST: async (req, res) => { ... } }` to the route table. It reads the body and `JSON.parse`s it.
      - On success, respond 200 with the parsed value as the JSON body, so `{"a":1}` echoes as `{"a":1}` and `[1,2]` as `[1,2]`.
      - If parsing fails, respond 400 with `{ "error": "Invalid JSON" }`. This includes an empty body, because `JSON.parse('')` throws.
      - Don't require a particular `Content-Type`.
    - **Async handlers:** make sure an async handler can't cause an unhandled rejection. If the handler's promise rejects (for example the request stream errors), respond 500 `{ "error": "Internal server error" }` if headers haven't been sent yet. Do this generically in the request handler, for example with `Promise.resolve(handler(...)).catch(...)`, checking `res.headersSent`.
    - **405 for /echo:** `GET /echo` must return 405 with `Allow: POST`, which comes automatically from the table.
    
    In `C:\Users\denni\projects\relay-playground\test\server.test.js`, add tests in the existing style:
    1. `POST /echo` with the object `{"name":"Dennis","n":[1,2,3],"nested":{"ok":true}}` → 200, the body deep-equals the input, and `Content-Type` is `application/json`
    2. `POST /echo` with a non-object JSON value, such as `[1,"two",null]` → 200, echoed back
    3. `POST /echo` with `{bad json` → 400 `{ error: 'Invalid JSON' }`
    4. `POST /echo` with an empty body → 400 `{ error: 'Invalid JSON' }`
    5. `GET /echo` → 405 with `Allow: POST`
    
    All existing tests must keep passing unchanged. Use only Node built-ins, don't touch the README and don't commit. Run `npm test` and report what you changed and the pass/fail counts.
18:39:03  builder → lead
    `POST /echo` now returns the JSON body it receives, and a failing async handler gets a 500 instead of an unhandled rejection. `npm test` passes: 21 tests, 21 pass, 0 fail.
    
    **Changes:**
    - **`src/server.js`:**
      - **`readBody(req)`:** a separate function that collects the chunks, joins them with `Buffer.concat` and returns a Promise of the UTF-8 string. It rejects if the request stream errors.
      - **`/echo` route:** `'/echo': { POST: async ... }` reads the body and parses it with `JSON.parse`. On success it sends 200 with the parsed value. On a parse failure, including an empty body, it sends 400 `{ error: 'Invalid JSON' }`. It doesn't check `Content-Type`.
      - **Async handlers:** the request handler now runs every handler through `Promise.resolve().then(() => handler(...)).catch(...)`. On a failure it sends 500 `{ error: 'Internal server error' }` if headers haven't been sent yet; otherwise it just ends the response.
      - **405 for `/echo`:** `GET /echo` gets 405 with `Allow: POST`, built from the table.
    - **`test\server.test.js`:** I left the existing tests unchanged and added the 5 cases:
      - the nested object, checking 200, deep equality and `Content-Type: application/json`
      - `[1,"two",null]` echoed back
      - one loop over `{bad json` and the empty body, each checking 400 and `{ error: 'Invalid JSON' }`
      - `GET /echo` → 405 with `Allow: POST`
    
    **Test output:** all 16 existing tests and the 5 new ones passed.
    
    **For the lead:**
    - **Handler errors:** I wrapped the call in `.then(() => handler(...))` rather than `Promise.resolve(handler(...))`. That way a synchronous error thrown by a non-async handler also becomes a 500 instead of crashing the request.
    - **Untested path:** no test covers the 500 path, because making the request stream fail from a test is awkward. Say if you want one, for example a test-only route that throws.
    - **Scope:** only `src/server.js` and `test\server.test.js` changed. I didn't touch the README and nothing is committed.
18:39:24  lead → builder
    Step 2 (`POST /echo`) checks out. I looked at the full diff and re-ran `npm test`, and all 21 tests pass. Moving the handler call into `.then()` was the right choice, and skipping a 500 test is fine for now.
    
    Step 3 of 6: reject `/echo` bodies over 1 KB with 413.
    
    In `C:\Users\denni\projects\relay-playground\src\server.js`:
    - **Limit:** add a constant `MAX_BODY_BYTES = 1024`. The limit is in **bytes**, not characters, so measure `chunk.length` on the Buffers.
    - **`readBody(req, maxBytes)`:**
      - Track the running byte total.
      - Once it exceeds `maxBytes`, stop keeping chunks so memory stays bounded. Keep consuming the stream until `'end'`, then reject with an error that marks it as too large. For example, give the error `code = 'BODY_TOO_LARGE'`, or use a small custom error class.
      - Draining instead of responding mid-upload avoids connection-reset errors on the client.
      - A body of exactly 1024 bytes is allowed.
    - **`/echo` route:**
      - It calls `readBody(req, MAX_BODY_BYTES)`.
      - On the too-large error it responds 413 `{ "error": "Payload too large" }`.
      - The size check happens before JSON parsing, so an oversized invalid body is 413, not 400.
      - Any other error should still propagate to the generic 500 handler.
    
    In `C:\Users\denni\projects\relay-playground\test\server.test.js`, add tests in the existing style:
    1. a valid JSON body of exactly 1024 bytes → 200, echoed back. An easy way to build it is `JSON.stringify('a'.repeat(1022))`, which is 1024 bytes once the quotes are counted. Assert `Buffer.byteLength(body) === 1024` in the test.
    2. a valid JSON body of 1025 bytes → 413 `{ error: 'Payload too large' }`
    3. a body that is under 1024 *characters* but over 1024 *bytes* because of multibyte characters → 413. For example, `JSON.stringify('é'.repeat(600))` is 602 characters and about 1202 bytes.
    4. an oversized body that is *also* invalid JSON → 413, not 400
    5. an oversized body sent **without a Content-Length**, using a `ReadableStream` body with `duplex: 'half'` in `fetch` and split across several chunks → 413. This exercises the streaming path.
    
    All existing tests must keep passing unchanged. Use only Node built-ins, don't touch the README and don't commit. Run `npm test` and report what you changed and the pass/fail counts.
18:39:54  builder → lead
    `/echo` now rejects bodies over 1024 bytes with 413. `npm test` passes: 26 tests, 26 pass, 0 fail.
    
    **Changes:**
    - **`src/server.js`:**
      - **Limit:** new constant `MAX_BODY_BYTES = 1024`.
      - **`readBody(req, maxBytes)`:**
        - It adds up `chunk.length`, so the limit counts bytes, not characters.
        - Once the total goes over the limit it stops keeping chunks, so memory stays bounded. It keeps reading the stream to the end, then rejects with an error whose `code` is `'BODY_TOO_LARGE'`.
        - Exactly 1024 bytes is allowed.
      - **`/echo` route:**
        - It calls `readBody(req, MAX_BODY_BYTES)` and turns the too-large error into 413 `{ error: 'Payload too large' }`.
        - Any other error is re-thrown to the generic 500 handler.
        - JSON parsing only happens after the size check, so an oversized invalid body gets 413.
    - **`test\server.test.js`:** I left the existing tests unchanged and added the 5 cases:
      - **Exactly 1024 bytes:** the body is `JSON.stringify('a'.repeat(1022))`, and the test asserts it is 1024 bytes before checking it is echoed back with 200.
      - **Three oversized bodies, in one loop:** 1025 bytes, `JSON.stringify('é'.repeat(600))` at 602 characters but over 1024 bytes, and oversized invalid JSON. Each asserts the byte length is over 1024, then checks for 413 and the error body.
      - **Streamed body with no Content-Length:** a `ReadableStream` of four 400-byte chunks, sent with `duplex: 'half'`, gets 413.
    
    **Test output:** all 21 existing tests and the 5 new ones passed.
    
    **For the lead:**
    - **Slow clients:** because the server reads oversized bodies to the end rather than cutting the connection, a client can still keep a connection busy by sending a very large or very slow body. Memory stays bounded at 1 KB of stored chunks. If that matters later, an upper cap on how much to drain, or a request timeout, would cover it.
    - **Scope:** only `src/server.js` and `test\server.test.js` changed. I didn't touch the README and nothing is committed.
18:40:05  lead → builder
    Step 3 (413 limit) checks out. I read `readBody` and the `/echo` handler, looked at the new tests and re-ran `npm test`, and all 26 tests pass. Joining the Buffers before decoding means multibyte characters split across chunks are safe. I'll pass your note about slow clients on to Dennis.
    
    Step 4 of 6: add `GET /version`, which returns the version from package.json.
    
    In `C:\Users\denni\projects\relay-playground\src\server.js`:
    - Load the version once, at module load, with `const { version } = require('../package.json');`. That file is `C:\Users\denni\projects\relay-playground\package.json`, and the require path is relative to `src/`.
    - Add `'/version': { GET: (req, res) => sendJson(res, 200, { version }) }` to the route table.
    
    In `C:\Users\denni\projects\relay-playground\test\server.test.js`, add tests in the existing style:
    1. `GET /version` → 200, and the body deep-equals `{ version: <the version read from package.json in the test> }`. Read it in the test with `require('../package.json').version`, not a hard-coded `'1.0.0'`, so the test doesn't break on a version bump. Also assert the version is a non-empty string, so the test can't pass if both sides are `undefined`.
    2. `POST /version` → 405 with `Allow: GET`
    
    All existing tests must keep passing unchanged. Don't modify `package.json`. Use only Node built-ins, don't touch the README and don't commit. Run `npm test` and report what you changed and the pass/fail counts.
18:40:31  builder → lead
    `GET /version` now returns the version from `package.json`. `npm test` passes: 28 tests, 28 pass, 0 fail.
    
    **Changes:**
    - **`src/server.js`:**
      - **Version:** loaded once at module load with `const { version } = require('../package.json');`.
      - **Route:** I added `'/version': { GET: (req, res) => sendJson(res, 200, { version }) }` to the route table.
    - **`test\server.test.js`:** I left the existing tests unchanged and added two:
      - **`GET /version`:** the test reads the version with `require('../package.json')` and asserts it is a non-empty string. It then checks for 200 and that the body deep-equals `{ version }`.
      - **`POST /version`:** it checks for 405, `Allow: GET` and the error body.
    
    **Test output:** all 26 existing tests and the 2 new ones passed.
    
    **For the lead:**
    - **Failed first run:** the first test run failed. The shell command I used to insert the tests stripped the URLs out of the two new `fetch` calls, leaving `fetch()` and `fetch(, ...)`, so the file didn't parse. I fixed both lines with a direct edit and re-ran. The 28/28 result is from after that fix.
    - **Scope:** `package.json` is unchanged (version `1.0.0`). Only `src/server.js` and `test\server.test.js` changed. I didn't touch the README and nothing is committed.
18:40:57  lead → builder
    Step 4 (`/version`) checks out. I checked every `fetch(` call in the test file for leftover damage from that shell slip and found none. `package.json` is unchanged, and `npm test` passes all 28 tests.
    
    Step 5 of 6: log one line per request (method, path, status, duration in ms) to stdout, but not during tests.
    
    **Design: inject the logger.** That keeps tests quiet by construction, with no checks on `NODE_ENV` or the test runner.
    
    In `C:\Users\denni\projects\relay-playground\src\server.js`:
    - Change the signature to `createServer({ log } = {})`. Calling `createServer()` with no arguments, as tests do, must log nothing.
    - At the start of every request, record a start time with `process.hrtime.bigint()` or `performance.now()`.
    - Attach `res.on('finish', ...)` so that, when `log` is a function, it's called once with a single string line in this format:
      `<METHOD> <pathname> <status> <ms>ms`, for example `GET /health 200 1.3ms`
      - Use `url.pathname` only, without the query string, so values like `?name=...` aren't logged.
      - Use `res.statusCode` for the status.
      - Format the duration with `toFixed(1)`.
    - This must cover every response, including 404, 405, 400, 413 and 500, so attach the listener before routing, at the top of the request handler.
    - If `req.url` were ever unparsable, keep it simple. Just make sure the logger can't throw.
    
    In `C:\Users\denni\projects\relay-playground\src\index.js`, call `createServer({ log: (line) => console.log(line) })`, so `npm start` logs to stdout.
    
    In `C:\Users\denni\projects\relay-playground\test\server.test.js`, keep the shared silent server for the existing tests, and add tests in the existing style:
    1. **Logger server:** a test (or small group) that starts a *second* server with a capturing logger, for example `createServer({ log: (line) => lines.push(line) })`, listens on port 0 and closes it at the end, even on failure. Use `try/finally` or `t.after`.
       - Make `GET /health?x=1`, `POST /echo` with an oversized body (413) and `GET /nope` (404).
       - Assert each produced exactly one line matching `/^GET \/health 200 \d+\.\dms$/`, `/^POST \/echo 413 \d+\.\dms$/` and `/^GET \/nope 404 \d+\.\dms$/`. The query string must not appear.
       - **Timing:** `'finish'` can fire slightly after the client has the response. Don't assert straight after `await fetch`. Wait for the expected line, for example with a logger that resolves a promise or a short bounded poll of under 1 second, so the test isn't flaky.
    2. **Silent by default:** a server from `createServer()` with no options writes nothing to stdout. Temporarily replace `process.stdout.write` with a spy around one request (including waiting a tick after the response), restore it in `finally`, and assert the spy captured nothing.
    
    All existing tests must keep passing unchanged, and `npm test` output should contain no request log lines. Use only Node built-ins, don't touch the README and don't commit.
    
    Run `npm test` and report what you changed and the pass/fail counts. Also start the server briefly with `npm start`, hit one route, and include the log line it printed, then stop the server.
18:42:32  builder → lead
    Request logging works: `npm start` prints one line per request, and the tests print none. `npm test` passes: 30 tests, 30 pass, 0 fail, the same on three runs in a row.
    
    **Changes:**
    - **`src/server.js`:**
      - **Signature:** `createServer({ log } = {})`. Without a `log` function it attaches nothing and logs nothing.
      - **Timing:** when `log` is given, the request handler records `process.hrtime.bigint()` at the very top and attaches `res.on('finish')` before any routing. So 404, 405, 400, 413 and 500 responses are all logged.
      - **Line format:** `` `${req.method} ${pathname} ${res.statusCode} ${ms.toFixed(1)}ms` ``.
      - **Safety:** a small `pathnameOf(req)` helper returns the path without the query string. If the URL doesn't parse, it falls back to cutting `req.url` at `?`. The whole logging callback is in a `try/catch`, so it can't throw.
    - **`src/index.js`:** it calls `createServer({ log: (line) => console.log(line) })`.
    - **`test\server.test.js`:** the shared server and the existing tests are unchanged. I added two tests:
      - **Logger test:** a second server with a capturing logger, closed with `t.after`. It makes the three requests and asserts exactly 3 lines matching the three patterns, with no `?x=1`. It waits for each line through a callback in the logger, with a 1-second timeout, rather than asserting straight after `fetch`.
      - **Silent-by-default test:** a server from `createServer()` with a spy on `process.stdout.write` around one request plus a 20 ms wait, restored in `finally`.
    
    **One deviation from your spec:** under `node --test`, the runner sends its own results to the parent process through the test file's stdout. So the spy can't assert "captured nothing": my first version of this test failed on the runner's own messages, and swallowed them. The spy now passes every write through to the real stdout and asserts that **no request-log line** was written. To make sure it isn't a no-op, I briefly made the default logger write to `console.log`: this test failed, and it passed again once I restored the code.
    
    **`npm start` check:** I ran the server on port 3917, requested `GET /hello?name=Dennis` and stopped it. It printed:
    ```
    Listening on http://localhost:3917
    GET /hello 200 2.6ms
    ```
    `npm test` output contains no request log lines.
    
    **For the lead: `GET //` crashes the server.** This bug predates this step. `new URL('//', 'http://localhost')` throws `ERR_INVALID_URL`, and since the request handler parses the URL with nothing around it, a request to `//` throws an uncaught exception that crashes the server process. The logger can't stop that, because the process dies first. The fix would be about three lines (catch the parse error and return 400 or 404), but it's outside this step, so I left it. Say if you want it as its own step.
    
    **Scope:** `src/server.js`, `src/index.js` and `test\server.test.js` changed. I didn't touch the README or `package.json`, and nothing is committed.
18:42:50  lead → builder
    Step 5 (request logging) checks out. I read the logger code, `src/index.js` and both new tests, and ran `npm test` twice: 30/30 both times, with no log lines in the output. Your change to the stdout spy was the right call, and good that you showed it can actually fail.
    
    Thanks for catching `GET //`. I confirmed it: `new URL('//', 'http://localhost')` throws `ERR_INVALID_URL`, and a crash anyone can trigger with one request is worth fixing now. So this is a small extra step before the README.
    
    Step 5b: unparsable request URLs return 400 instead of crashing the server.
    
    In `C:\Users\denni\projects\relay-playground\src\server.js`:
    - Wrap the `new URL(req.url, 'http://localhost')` call in the request handler in a `try/catch`. On failure, respond 400 `{ "error": "Bad request" }` and return.
    - Keep the logger attached *before* this point, so the 400 is logged too. `pathnameOf` already handles unparsable URLs.
    
    In `C:\Users\denni\projects\relay-playground\test\server.test.js`, add tests in the existing style. `fetch` may normalize `//`, so send the raw path with `node:http`'s `http.request({ host: 'localhost', port, path: '//', method: 'GET' })` against the shared server:
    1. `GET //` → 400 with the body `{ error: 'Bad request' }`
    2. Straight after that, `GET /health` on the same shared server still returns 200, which proves the server survived.
    
    Before you apply the fix, run the new test once against the unfixed code and confirm it fails or crashes, then apply the fix and confirm it passes. Mention both results in your report.
    
    All existing tests must keep passing unchanged. Use only Node built-ins, don't touch the README and don't commit. Run `npm test` and report what you changed and the pass/fail counts.
18:46:44  builder → lead
    `GET //` now returns 400 `{ "error": "Bad request" }` instead of crashing the server, and the 400 is logged. `npm test` passes: 32 tests, 32 pass, 0 fail, the same on two runs.
    
    **Changes:**
    - **`src/server.js`:** `new URL(req.url, 'http://localhost')` is now inside a `try/catch`, and a failure returns 400 `{ error: 'Bad request' }`. The logger is still attached before this point.
    - **`test\server.test.js`:** I added `const http = require('node:http')` and a small `rawRequest(path)` helper. It uses `http.request` against the shared server, so `//` is sent as is. Two new tests use it:
      - `GET //` → 400 with `{ error: 'Bad request' }`
      - right after that, `GET /health` → 200 `{ status: 'ok' }`
    
      The existing tests are unchanged.
    
    **Before the fix:** the new test didn't fail on its own; `npm test` hung. The request handler threw, no response was ever sent, and `node:test` has no default timeout, so the run never finished and I had to stop it. Re-run with `--test-timeout=5000`, it failed clearly: 31 pass, 0 fail, 1 cancelled, and `GET //` timed out after 5000ms.
    
    **After the fix:** all 32 tests pass, both new ones included.
    
    **For the lead:**
    - **Weak follow-up test:** on the unfixed code, the `/health` test still passed, because `node:test` catches the uncaught exception and the test process keeps running. So that test doesn't prove the server would survive in real use; the `GET //` test is the real check. To cover that, I ran the actual server with `npm start` and sent `curl --path-as-is http://localhost:3918//`. It returned 400, then `/health` returned 200, and it logged:
      ```
      GET // 400 0.4ms
      GET /health 200 0.2ms
      ```
      I stopped the server afterwards.
    - **Possible hang:** if this test ever regresses, `npm test` will hang rather than fail. Adding `--test-timeout` to the `test` script in `package.json` would prevent that. I left `package.json` alone since it wasn't part of this step.
    - **Scope:** `src/server.js` and `test\server.test.js` changed in this step, and `src/index.js` is still modified from step 5. I didn't touch the README and nothing is committed.
18:46:58  lead → builder
    Step 5b (`GET //` fix) checks out. I read the `try/catch` and the `rawRequest` helper and re-ran `npm test`, and all 32 tests pass. Your test with the real server and `curl` is the convincing proof, so thanks. I'll mention the `--test-timeout` idea to Dennis instead of changing `package.json` now.
    
    Step 6 of 6, the last one: update the README routes section.
    
    In `C:\Users\denni\projects\relay-playground\README.md`, update the `## Routes` section and add a short `## Behaviour` section right after it. Use the same terse bullet style as the existing lines.
    
    **`## Routes`:** keep the three existing bullets exactly as they are, and add:
    - `POST /echo` → returns the JSON body it receives, with any JSON value echoed as is. Invalid or empty JSON gets 400 `{ "error": "Invalid JSON" }`. Bodies over 1 KB (1024 bytes) get 413 `{ "error": "Payload too large" }`.
    - `GET /version` → `{ "version": "<version from package.json>" }`, for example `"1.0.0"`
    
    **`## Behaviour`:**
    - Unknown paths get 404 `{ "error": "Not found" }`.
    - A known path called with the wrong method gets 405 `{ "error": "Method not allowed" }`, with an `Allow` header listing the supported methods.
    - An unparsable request URL gets 400 `{ "error": "Bad request" }`.
    - `npm start` logs one line per request to stdout, in the form `GET /health 200 1.3ms` (method, path without query string, status, duration). Servers created with `createServer()`, as in the tests, don't log.
    
    Keep it short. Don't change any other part of the README or any other file, and don't commit. Run `npm test` once more and report the README diff and the pass/fail counts.
18:47:17  builder → lead
    The README now documents all five routes and has a short `## Behaviour` section. `npm test` still passes: 32 tests, 32 pass, 0 fail.
    
    **README diff:**
    ```diff
    @@ -12,3 +12,12 @@ npm test
     - `GET /hello?name=Dennis` → ... (unchanged)
     - `GET /health` → `{ "status": "ok" }`
     - `GET /time` → `{ "time": "<current time as an ISO 8601 string>" }`, e.g. `"2026-10-13T18:45:00.000Z"`
    +- `POST /echo` → returns the JSON body it receives (any JSON value, as is). Invalid or empty JSON → 400 `{ "error": "Invalid JSON" }`. Bodies over 1 KB (1024 bytes) → 413 `{ "error": "Payload too large" }`
    +- `GET /version` → `{ "version": "<version from package.json>" }`, e.g. `"1.0.0"`
    +
    +## Behaviour
    +
    +- Unknown paths → 404 `{ "error": "Not found" }`
    +- A known path with the wrong method → 405 `{ "error": "Method not allowed" }`, with an `Allow` header listing the supported methods
    +- An unparsable request URL → 400 `{ "error": "Bad request" }`
    +- `npm start` logs one line per request to stdout, e.g. `GET /health 200 1.3ms` (method, path without query string, status, duration). Servers made with `createServer()`, as in the tests, don't log.
    ```
    
    **For the lead:**
    - **Wording:** I wrote the new bullets with `→` and `e.g.` to match the existing lines, so a few phrases differ slightly from your text. The content is the same.
    - **Scope:** the three existing route bullets and the rest of the README are unchanged. This step changed only `README.md`.
    - **Not committed:** all of this goal's work is still uncommitted, in `README.md`, `src/server.js`, `src/index.js` and `test\server.test.js`.
18:47:33  lead → Dennis
    All six steps are done and `npm test` passes all 32 tests. I re-ran it myself after each step and checked the code before moving on. **Nothing is committed yet.**
    
    1. **Wrong method → 405:** routing now goes through a table of paths and methods. A known path called with the wrong method gets 405 with an `Allow` header built from that table, such as `Allow: GET`. Unknown paths still get 404.
    2. **`POST /echo`:** returns the JSON it receives. Invalid or empty JSON gets 400 `{"error":"Invalid JSON"}`.
    3. **1 KB limit:** `/echo` bodies over 1024 bytes get 413. The limit counts bytes, not characters. An oversized body is checked before parsing, so it gets 413 even if it isn't valid JSON. The tests cover exactly 1024 bytes, 1025 bytes, accented characters, and a body sent without a length header.
    4. **`GET /version`:** returns `{"version":"1.0.0"}`, read from `package.json`. The test reads the expected value from `package.json` too, so a version bump won't break it.
    5. **Request logging:** `npm start` prints one line per request, such as `GET /health 200 1.3ms`. It covers every status, including errors. Query strings are left out of the log, so values like `?name=…` aren't printed. Tests don't log, because a server only logs when it is given a logger and only `npm start` passes one in.
    6. **README:** the Routes section now lists all five routes, and a new Behaviour section covers the 404, 405 and 400 responses and the logging.
    
    **One extra fix:** the builder found a crash bug that was already there. A request to `//`, for example `curl --path-as-is http://localhost:3000//`, crashed the whole server process. Since one request could take the server down, I had it fixed: such requests now get 400 `{"error":"Bad request"}`. There's a test for it, and the builder also confirmed it against a running server.
    
    Changed files: `src/server.js`, `src/index.js`, `test/server.test.js` and `README.md`.
    
    Follow-ups, if you want any of them:
    - **Possible hang:** if a request ever gets no response, `npm test` hangs instead of failing; the builder hit this before the `//` fix. Adding `--test-timeout=5000` to the `test` script in `package.json` would make it fail cleanly.
    - **Slow clients:** an oversized `/echo` body is read to the end before the 413 is sent. Memory use stays capped, but a very large or very slow upload keeps its connection open until it finishes. A request timeout would cover that.
    - **HEAD requests:** a HEAD request to a GET route gets 405. Many servers answer HEAD wherever GET works.
    - **No test for 500:** the error path that returns 500 has no test.
    
    Should I have the builder commit this?
````

</details>

## Conclusion
- **Stage 1's bar is met.** On a realistic project, set up only with `relay init`, `/relay-start` and a goal, the lead and builder ran **7 rounds unattended** in under 10 minutes, with a correct, well-tested result. Run 1 added another 4 clean rounds.
- **The review loop adds real value.** The lead caught and prioritised a real crash the goal never mentioned.
- **The tag-first rule held** across all 13 lead replies with Opus 5.5. The nudge (ADR 0007) wasn't needed here; it's proven separately in ADR 0007's evidence.
- **Follow-ups go in the backlog, not into Relay now:** `relay status`'s "type anything" hint is misleading for a lead whose waiter died.
- The playground is left set up: Relay installed, run reset with `relay start`, and both runs committed in its own git history.
