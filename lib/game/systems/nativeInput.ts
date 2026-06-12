/**
 * The single non-canvas carve-out: when a human must type, overlay a real
 * <input> on top of the canvas so iOS/Android show the native keyboard, then
 * remove it on commit. Used for login, kid name, custom task text, search.
 */
export interface NativeInputOptions {
  placeholder?: string;
  value?: string;
  type?: "text" | "password" | "number";
  maxLength?: number;
  /** screen-space rect to position the input over (canvas pixels) */
  rect?: { x: number; y: number; width: number; height: number };
}

export function promptText(opts: NativeInputOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const el = document.createElement("input");
    el.type = opts.type ?? "text";
    el.value = opts.value ?? "";
    if (opts.placeholder) el.placeholder = opts.placeholder;
    if (opts.maxLength) el.maxLength = opts.maxLength;

    const r = opts.rect;
    Object.assign(el.style, {
      position: "fixed",
      left: r ? `${r.x}px` : "50%",
      top: r ? `${r.y}px` : "40%",
      width: r ? `${r.width}px` : "min(80vw, 420px)",
      height: r ? `${r.height}px` : "56px",
      transform: r ? "none" : "translate(-50%, -50%)",
      zIndex: "9999",
      fontSize: "22px",
      padding: "0 16px",
      border: "4px solid #f4b223",
      borderRadius: "16px",
      outline: "none",
      boxShadow: "0 8px 24px rgba(0,0,0,.3)",
      fontFamily: "system-ui, sans-serif",
    } as CSSStyleDeclaration);

    let settled = false;
    const finish = (val: string | null) => {
      if (settled) return;
      settled = true;
      el.remove();
      resolve(val);
    };
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(el.value.trim());
      if (e.key === "Escape") finish(null);
    });
    el.addEventListener("blur", () => finish(el.value.trim() || null));

    document.body.appendChild(el);
    // focus must happen in the same user-gesture tick for iOS to show the keyboard
    el.focus();
    el.select();
  });
}
