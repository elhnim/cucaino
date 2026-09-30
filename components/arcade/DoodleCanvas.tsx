"use client";

// A smooth finger/pen/mouse drawing pad for Doodle Guess. Pointer events (one active
// pointer, so a resting palm or second finger doesn't scribble), coalesced events for smooth
// lines, midpoint-quadratic smoothing, DPR-sharp, resize-safe (strokes are stored in 0..1
// space). Finished strokes are baked into an offscreen layer so long drawings stay fast.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { doodleCropBox, hasInk, type DoodleStroke } from "@/lib/arcade/doodle";

export interface DoodleCanvasHandle {
  undo: () => void;
  clear: () => void;
  /** base64 PNG (no data: prefix) on white, cropped to the drawing, or null when blank */
  exportPng: (size?: number) => string | null;
  strokeCount: () => number;
}

interface Props {
  color: string;
  /** brush width as a fraction of the canvas width */
  width: number;
  eraser?: boolean;
  disabled?: boolean;
  onStrokeStart?: () => void;
  onStrokeEnd?: (strokeCount: number) => void;
}

function drawStroke(ctx: CanvasRenderingContext2D, s: DoodleStroke, w: number, h: number, ox = 0, oy = 0, scale = 1, minPx = 1) {
  const px = (p: [number, number]): [number, number] => [(p[0] - ox) * scale * w, (p[1] - oy) * scale * h];
  ctx.strokeStyle = s.eraser ? "#ffffff" : s.color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(minPx, s.width * scale * w);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pts = s.pts;
  if (pts.length === 0) return;
  if (pts.length === 1) {
    const [x, y] = px(pts[0]);
    ctx.beginPath();
    ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  const [sx, sy] = px(pts[0]);
  ctx.moveTo(sx, sy);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = px(pts[i]);
    const [nx, ny] = px(pts[i + 1]);
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const [lx, ly] = px(pts[pts.length - 1]);
  ctx.lineTo(lx, ly);
  ctx.stroke();
}

const DoodleCanvas = forwardRef<DoodleCanvasHandle, Props>(function DoodleCanvas(
  { color, width, eraser, disabled, onStrokeStart, onStrokeEnd },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<DoodleStroke[]>([]);
  const current = useRef<DoodleStroke | null>(null);
  const pointerId = useRef<number | null>(null);
  const raf = useRef(0);
  const props = useRef({ color, width, eraser, disabled, onStrokeStart, onStrokeEnd });
  useEffect(() => {
    props.current = { color, width, eraser, disabled, onStrokeStart, onStrokeEnd };
  });

  /** repaint the baked layer from all finished strokes */
  const rebake = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    if (!layerRef.current) layerRef.current = document.createElement("canvas");
    const layer = layerRef.current;
    layer.width = c.width;
    layer.height = c.height;
    const ctx = layer.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, layer.width, layer.height);
    for (const s of strokes.current) drawStroke(ctx, s, layer.width, layer.height);
  }, []);

  const paint = useCallback(() => {
    raf.current = 0;
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    if (layerRef.current) ctx.drawImage(layerRef.current, 0, 0);
    else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    if (current.current) drawStroke(ctx, current.current, c.width, c.height);
  }, []);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(paint);
  }, [paint]);

  // size the backing store to the element (sharp on retina, capped at 2x for speed)
  useEffect(() => {
    const wrap = wrapRef.current;
    const c = canvasRef.current;
    if (!wrap || !c) return;
    const fit = () => {
      const cssW = wrap.clientWidth;
      if (!cssW) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.round(cssW * dpr);
      if (c.width !== px) {
        c.width = px;
        c.height = px;
        rebake();
        paint();
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [rebake, paint]);

  const toPoint = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  const endStroke = useCallback(() => {
    const s = current.current;
    pointerId.current = null;
    if (!s) return;
    current.current = null;
    strokes.current.push(s);
    const layer = layerRef.current;
    const lctx = layer?.getContext("2d");
    if (layer && lctx) drawStroke(lctx, s, layer.width, layer.height);
    else rebake();
    schedule();
    props.current.onStrokeEnd?.(strokes.current.length);
  }, [rebake, schedule]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (props.current.disabled || pointerId.current !== null) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    pointerId.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // some browsers throw for synthetic pointers
    }
    const p = props.current;
    current.current = { color: p.color, width: p.width, eraser: p.eraser, pts: [toPoint(e)] };
    p.onStrokeStart?.();
    schedule();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== pointerId.current || !current.current) return;
    e.preventDefault();
    const native = e.nativeEvent as PointerEvent;
    const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const pts = current.current.pts;
    for (const ev of events.length ? events : [native]) {
      const pt = toPoint(ev);
      const last = pts[pts.length - 1];
      // skip sub-pixel jitter (keeps strokes light and smooth)
      if (Math.abs(pt[0] - last[0]) + Math.abs(pt[1] - last[1]) > 0.002) pts.push(pt);
    }
    schedule();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== pointerId.current) return;
    endStroke();
  };

  // lifting the pen when the game disables the pad (time's up) still finishes the stroke
  useEffect(() => {
    if (disabled && current.current) endStroke();
  }, [disabled, endStroke]);

  useImperativeHandle(ref, () => ({
    undo: () => {
      if (current.current) return;
      strokes.current.pop();
      rebake();
      schedule();
      props.current.onStrokeEnd?.(strokes.current.length);
    },
    clear: () => {
      current.current = null;
      pointerId.current = null;
      strokes.current = [];
      rebake();
      schedule();
      props.current.onStrokeEnd?.(0);
    },
    strokeCount: () => strokes.current.length,
    exportPng: (size = 256) => {
      const all = current.current ? [...strokes.current, current.current] : strokes.current;
      if (!hasInk(all)) return null;
      const box = doodleCropBox(all);
      const out = document.createElement("canvas");
      out.width = size;
      out.height = size;
      const ctx = out.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      // strokes are re-drawn as vectors at the export size (crisper than scaling pixels)
      for (const s of all) drawStroke(ctx, s, size, size, box.x, box.y, 1 / box.size, 2);
      return out.toDataURL("image/png").split(",")[1] ?? null;
    },
  }), [rebake, schedule]);

  return (
    <div
      ref={wrapRef}
      className="relative w-full aspect-square overflow-hidden"
      style={{ borderRadius: 6, background: "#ffffff", boxShadow: "inset 0 0 0 1px rgba(60,40,20,0.18), inset 0 2px 10px rgba(60,40,20,0.12)" }}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${disabled ? "cursor-not-allowed" : "cursor-crosshair"}`}
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Drawing pad"
        role="img"
      />
    </div>
  );
});

export default DoodleCanvas;
