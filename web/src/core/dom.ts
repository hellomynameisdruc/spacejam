// DOM access shared by the UI layers.

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** The visitor asked for less motion: animations freeze or are skipped */
export const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
