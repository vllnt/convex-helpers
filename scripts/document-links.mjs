// Link and path checks for the docs shipped in the npm tarball, used by
// check-package.mjs and unit-tested in tests/document-links.test.ts.

const fence =
  /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gmu;
const codeSpan = /(`+)(?!`)[\s\S]*?[^`]\1(?!`)/gu;

/** Markdown with fenced code blocks and inline code spans blanked out. */
export function withoutCode(markdown) {
  return markdown.replace(fence, "").replace(codeSpan, "");
}

const linkForms = [
  // Inline link or image: [text](dest) or [text](dest "title"), dest may be <...>.
  /\]\(\s*(<[^>\n]*>|[^\s()<>]+(?:\([^\s()]*\)[^\s()<>]*)*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu,
  // Reference definition: [label]: dest "title"
  /^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]*>|\S+)/gmu,
  // HTML attributes: <a href="..."> and <img src="...">
  /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/giu,
];

/** Every link destination in `markdown` (inline, reference and HTML forms), outside code. */
export function linkTargets(markdown) {
  const text = withoutCode(markdown);
  return linkForms.flatMap((form) =>
    [...text.matchAll(form)].map((match) => {
      const target = match[1] ?? match[2] ?? "";
      return target.startsWith("<") ? target.slice(1, -1) : target;
    }),
  );
}

/** Whether a link target is absolute (has a scheme) rather than a path or anchor. */
export function isAbsolute(target) {
  return /^[a-z][a-z\d+.-]*:/iu.test(target);
}

/** GitHub's heading anchor for the heading text `text`. */
export function slug(text) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/[\\`*~]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/gu, "-");
}

/** The anchors GitHub generates for the headings of `markdown`, duplicates numbered. */
export function headingAnchors(markdown) {
  const seen = new Map();
  const anchors = new Set();
  for (const [, heading] of markdown
    .replace(fence, "")
    .matchAll(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/gmu)) {
    const base = slug(heading);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

/**
 * Relative links in the shipped `docs` that do not resolve inside the tarball.
 *
 * @param docs - Map of shipped doc path to its markdown
 * @param packed - Set of every path in the tarball
 * @param join - posix path join
 * @param dirname - posix dirname
 * @returns One `doc -> target` string per broken link
 */
export function brokenLinks(docs, packed, { dirname, join }) {
  const broken = [];
  for (const [doc, markdown] of docs) {
    for (const target of linkTargets(markdown)) {
      if (isAbsolute(target)) continue;
      const [path, anchor] = target.split("#");
      const file = path === "" ? doc : join(dirname(doc), decodeURI(path));
      if (!packed.has(file)) {
        broken.push(`${doc} -> ${target}`);
        continue;
      }
      if (anchor === undefined || anchor === "") continue;
      const targetDoc = docs.get(file);
      if (targetDoc === undefined || !headingAnchors(targetDoc).has(anchor)) {
        broken.push(`${doc} -> ${target} (no such heading)`);
      }
    }
  }
  return broken;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * Repository files named in `text` that the tarball does not contain. A name is
 * allowed only as the text of a link to an absolute URL, or inside that URL.
 *
 * @param text - A shipped file's contents
 * @param repoOnly - Paths tracked in git but not packed
 * @returns The repo-only paths `text` names
 */
export function repoOnlyMentions(text, repoOnly) {
  const plain = text
    .replace(
      /\[[^\]\n]*\]\(\s*<?[a-z][a-z\d+.-]*:[^)\s]*>?(?:\s+"[^"]*")?\s*\)/giu,
      "",
    )
    .replace(/[a-z][a-z\d+.-]*:\/\/[^\s)>\]]+/giu, "");
  return repoOnly.filter((path) =>
    new RegExp(`(?<![\\w./-])${escape(path)}(?![\\w/-])`, "u").test(plain),
  );
}
