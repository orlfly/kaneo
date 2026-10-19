import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// en-US is the reference locale: a key it lacks renders as its own identifier
// (`modals.createTask.discardTitle`), so every key the app asks for must exist
// there. Nothing else checks this, and the component tests cannot: they assert
// the raw key, which is exactly what a missing key produces.
function repoRootFrom(start: string): string {
  let dir = start;
  while (!existsSync(join(dir, "i18n", "en-US.json"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no i18n/en-US.json above ${start}`);
    dir = parent;
  }
  return dir;
}

const repoRoot = repoRootFrom(process.cwd());
const sourceRoot = join(repoRoot, "apps", "web", "src");
const localePath = join(repoRoot, "i18n", "en-US.json");
const defaultNamespace = "common";

const locale = JSON.parse(readFileSync(localePath, "utf8")) as Record<
  string,
  unknown
>;

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__mocks__") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
      found.push(path);
  }
  return found;
}

function splitKey(key: string): [namespace: string, path: string] {
  const separator = key.indexOf(":");
  return separator >= 0
    ? [key.slice(0, separator), key.slice(separator + 1)]
    : [defaultNamespace, key];
}

function nodeAt(namespace: string, path: string): unknown {
  let current = locale[namespace];
  if (current === undefined) return undefined;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolves(key: string, options: string): boolean {
  if (nodeAt(...splitKey(key)) !== undefined) return true;
  if (!/\bcount\s*:/.test(options)) return false;
  // i18next swaps the key for a plural category whenever `count` is passed, so
  // only the suffixed forms are ever read in that case.
  const [namespace, path] = splitKey(key);
  const separator = path.lastIndexOf(".");
  const leaf = path.slice(separator + 1);
  const parent = separator > 0 ? path.slice(0, separator) : "";
  const siblings = parent ? nodeAt(namespace, parent) : locale[namespace];
  if (siblings === null || typeof siblings !== "object") return false;
  return (
    `${leaf}_one` in siblings ||
    `${leaf}_other` in siblings ||
    `${leaf}_zero` in siblings
  );
}

function hasLeafUnder(prefix: string): boolean {
  const node = nodeAt(...splitKey(prefix.replace(/\.$/, "")));
  if (node === null || typeof node !== "object") return false;
  return Object.keys(node).length > 0;
}

// The variable names an options object provides, or null when the expression is
// a spread, template or identifier the scanner cannot follow.
function providedNames(argument: string | undefined): Set<string> | null {
  const text = argument?.trim();
  // Nothing passed, or a plain default string: no variable can reach the copy.
  if (!text) return new Set();
  if (text.startsWith('"') || text.startsWith("'")) return new Set();
  if (text.startsWith("`")) return null;
  if (!text.startsWith("{")) return null;
  if (!text.endsWith("}") || text.includes("...")) return null;
  // `{ name: value }` and the `{ name }` shorthand both provide `name`.
  return new Set(
    [...text.matchAll(/(?:^|[,{])\s*(\w+)\s*(?=[:,}])/g)].map(
      (match) => match[1],
    ),
  );
}

function placeholdersIn(key: string): string[] | null {
  const value = nodeAt(...splitKey(key));
  if (typeof value !== "string") return null;
  const found = [...value.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map(
    (match) => match[1],
  );
  return found.length > 0 ? found : null;
}

// i18next leaves a placeholder it was not given alone, so copy interpolating
// `{{count}}` reads as `{{count}} option(s)` when the call site never passes a
// count. Reports the placeholders a call cannot fill.
function unfilled(key: string, options: string | undefined): string[] | null {
  const placeholders = placeholdersIn(key);
  if (!placeholders) return null;
  const provided = providedNames(options);
  if (provided === null) return null;
  return placeholders.filter((name) => !provided.has(name));
}

// Keys are matched textually: `t("ns:key")`, `t("key", options)` and the static
// prefix of `t(`ns:key.${dynamic}`)`. Dynamic segments cannot be resolved, so a
// prefix only has to lead somewhere. Matches inside comments are ignored.
const staticCall =
  /\bt\(\s*(?:"([a-zA-Z0-9_:@.-]+)"|'([a-zA-Z0-9_:@.-]+)')\s*(?:,([\s\S]{0,400}?))?\)/g;
const dynamicCall = /\bt\(\s*`([a-zA-Z0-9_:@.-]*)\$\{/g;
// `<Trans i18nKey="ns:key">` renders its key when the key is missing, and the
// `values` it interpolates come from a prop rather than a call.
const transKey = /i18nKey=["']([a-zA-Z0-9_:@.-]+)["']/g;
const transValues = /values=\{(\{[\s\S]{0,400}?\})\}/;
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);

// Some helpers return a key instead of copy (`error-handler` hands the caller a
// `message` key that another component passes on to `t`). A key travelling as a
// plain string never reaches `t("...")`, so match key-shaped literals against
// the namespaces en-US actually declares and skip everything else.
const keyLiteral =
  /["'`]([a-zA-Z][a-zA-Z0-9]*:[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)["'`]/g;
const namespaces = new Set(Object.keys(locale));
const isKeyLiteral = (key: string) =>
  namespaces.has(key.slice(0, key.indexOf(":")));

function scan(): {
  missing: string[];
  emptyPrefixes: string[];
  unfilledPlaceholders: string[];
} {
  const missing: string[] = [];
  const emptyPrefixes: string[] = [];
  const unfilledPlaceholders: string[] = [];
  for (const file of sourceFiles(sourceRoot)) {
    const source = readFileSync(file, "utf8");
    const where = relative(sourceRoot, file);
    const located = (match: RegExpExecArray) =>
      `${where}:${source.slice(0, match.index).split("\n").length}`;

    const check = (
      match: RegExpExecArray,
      run: () => boolean,
      collect: string[],
      label: string,
    ) => {
      const line = source.slice(0, match.index).split("\n").at(-1) ?? "";
      if (isComment(line) || run()) return;
      collect.push(`${label} (${located(match)})`);
    };

    staticCall.lastIndex = 0;
    for (
      let match = staticCall.exec(source);
      match;
      match = staticCall.exec(source)
    ) {
      const key = match[1] ?? match[2];
      check(match, () => resolves(key, match[3] ?? ""), missing, key);
      const holes = unfilled(key, match[3]);
      if (holes && holes.length > 0) {
        unfilledPlaceholders.push(
          `${key} never receives ${holes.join(", ")} (${located(match)})`,
        );
      }
    }

    dynamicCall.lastIndex = 0;
    for (
      let match = dynamicCall.exec(source);
      match;
      match = dynamicCall.exec(source)
    ) {
      const prefix = match[1];
      if (!prefix) continue;
      check(match, () => hasLeafUnder(prefix), emptyPrefixes, prefix);
    }

    keyLiteral.lastIndex = 0;
    for (
      let match = keyLiteral.exec(source);
      match;
      match = keyLiteral.exec(source)
    ) {
      const key = match[1];
      // Arguments of `t(...)` and `i18nKey` props are handled above, where plural
      // forms and `values` are resolved with what the site passes.
      const before = source.slice(0, match.index);
      if (
        /(?:t\(|i18nKey=)\s*$/.test(before) ||
        !isKeyLiteral(key) ||
        resolves(key, "")
      ) {
        continue;
      }
      const line = before.split("\n").at(-1) ?? "";
      if (isComment(line)) continue;
      missing.push(`${key} (${located(match)})`);
    }

    transKey.lastIndex = 0;
    for (
      let match = transKey.exec(source);
      match;
      match = transKey.exec(source)
    ) {
      const key = match[1];
      check(match, () => resolves(key, ""), missing, key);
      const holes = unfilled(
        key,
        source.slice(match.index, match.index + 600).match(transValues)?.[1],
      );
      if (holes && holes.length > 0) {
        unfilledPlaceholders.push(
          `${key} never receives ${holes.join(", ")} (${located(match)})`,
        );
      }
    }
  }

  return { missing, emptyPrefixes, unfilledPlaceholders };
}

describe("en-US translations", () => {
  const { missing, emptyPrefixes, unfilledPlaceholders } = scan();

  it("defines every key the web app references", () => {
    expect(missing).toEqual([]);
  });

  it("defines a key for every dynamic translation prefix", () => {
    expect(emptyPrefixes).toEqual([]);
  });

  it("never leaves a placeholder the call site cannot fill", () => {
    expect(unfilledPlaceholders).toEqual([]);
  });
});
