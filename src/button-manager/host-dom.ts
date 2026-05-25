export function getHostWindow(): Window {
  return window.parent ?? window;
}

export function getHostDocument(): Document {
  return getHostWindow().document;
}

export function getHostBody(): HTMLElement {
  return getHostDocument().body;
}
