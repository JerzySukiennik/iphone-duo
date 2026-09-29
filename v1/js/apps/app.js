// Base class for apps. An app builds ONE root element that lives inside a window; the window can be moved
// between surfaces (inner canvas, outer display, bent-mode panels) and resized, so layouts must be fluid
// (CSS container queries on the window: `@container win (min-width: 620px)`).
export class App {
  constructor(os, win) { this.os = os; this.win = win; }
  build() { throw new Error('build() not implemented'); }
  /** colour of the status corner over this app: 'light' (white) or 'dark' (black) */
  statusTone() { return 'dark'; }
  onOpen() { }
  onClose() { }
  onAttach() { }
  destroy() { }
  get surface() { return this.win.surface; }
}
