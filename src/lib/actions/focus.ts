// chaosnexus-forge/src/lib/actions/focus.ts

/** 
 * Focuses the bound element on mount (Svelte action; no autofocus attribute). 
 *
 * @param node - The HTML element to apply focus to.
 * @returns An object with a `destroy` method for cleanup.
 */
export function focus(node: HTMLElement): { destroy(): void } {
  setTimeout(() => node.focus(), 0);
  return { destroy() {} };
}
