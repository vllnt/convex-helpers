/* eslint-disable unicorn/prevent-abbreviations -- ambient environment declarations */
// Interface merging extends TypeScript's built-in ImportMeta.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging requires an interface
interface ImportMeta {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}
