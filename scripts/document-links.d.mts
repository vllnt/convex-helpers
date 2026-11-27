export function withoutCode(markdown: string): string;
export function linkTargets(markdown: string): string[];
export function isAbsolute(target: string): boolean;
export function slug(text: string): string;
export function headingAnchors(markdown: string): Set<string>;
export function brokenLinks(
  docs: ReadonlyMap<string, string>,
  packed: ReadonlySet<string>,
  path: {
    dirname: (path: string) => string;
    join: (...paths: string[]) => string;
  },
): string[];
export function repoOnlyMentions(
  text: string,
  repoOnly: readonly string[],
): string[];
