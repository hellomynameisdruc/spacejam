// A short confirmation for anything done that otherwise leaves no trace on screen: a line in the
// terminal's style that slides up at the bottom of the screen and fades after a few seconds.
let el: HTMLElement | null = null, timer = 0;
export function toast(text: string, kind: "ok" | "err" = "ok") {
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
  el.innerHTML = `<span class="tk">${kind === "ok" ? "✓" : "!"}</span><span></span>`;
  (el.lastChild as HTMLElement).textContent = text.toUpperCase();
  el.classList.toggle("err", kind === "err");
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  clearTimeout(timer); timer = window.setTimeout(() => el?.classList.remove("show"), 2800);
}
/** a key says what it just did for a moment ("COPIED ✓"), then goes back to its label */
export function flashKey(b: HTMLElement | null, text: string) {
  if (!b) return;
  const was = b.dataset.label ?? b.innerHTML; b.dataset.label = was;
  b.textContent = text; b.classList.add("done");
  setTimeout(() => { b.innerHTML = was; b.classList.remove("done"); delete b.dataset.label; }, 1600);
}
