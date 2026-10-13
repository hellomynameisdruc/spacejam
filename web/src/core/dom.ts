// DOM access shared by the UI layers.

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** The visitor asked for less motion: animations freeze or are skipped */
/** how many screen px one CSS px of `el` takes (the page is drawn at 80% on desktop screens) */
export const uiZoom = (el: HTMLElement) => { const w = el.getBoundingClientRect().width; return el.offsetWidth && w ? w / el.offsetWidth : 1; };
export const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
