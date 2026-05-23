import { type CSSProperties, useEffect, useRef, useState } from "react";

/**
 * Image preview with wheel-zoom (toward cursor), drag-to-pan when zoomed,
 * and double-click to toggle fit ↔ 2×. Pan is clamped so the image edges
 * cannot fly past the visible content area. Reset whenever `resetKey` changes
 * (typically the item id) so navigating to a new image starts at fit.
 *
 * The wheel listener is attached imperatively because React's synthetic
 * `onWheel` is registered as passive at the root and cannot
 * `preventDefault()` the page-scroll.
 *
 * Shared between the Gallery lightbox and the Studio canvas so the zoom
 * interaction stays identical across both surfaces.
 */
export function ZoomableImage({
  resetKey,
  src,
  alt,
  width,
  height,
  baseStyle,
  className = "block h-auto max-h-full w-auto max-w-full rounded-(--radius-md) object-contain select-none",
  containerClassName = "relative flex h-full w-full items-center justify-center",
}: {
  resetKey: string;
  src: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  baseStyle?: CSSProperties;
  className?: string;
  containerClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseTx: number;
    baseTy: number;
  } | null>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [panning, setPanning] = useState(false);

  // Reset zoom whenever the displayed item changes.
  useEffect(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
  }, [resetKey]);

  const clampPan = (s: number, x: number, y: number): { x: number; y: number } => {
    const c = containerRef.current;
    const img = imgRef.current;
    if (!c || !img) return { x, y };
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    // offsetWidth/Height are pre-transform layout dimensions, so they reflect
    // the "fit" size set by max-w-full / max-h-full / object-contain.
    const mw = img.offsetWidth * s;
    const mh = img.offsetHeight * s;
    const maxX = Math.max(0, (mw - cw) / 2);
    const maxY = Math.max(0, (mh - ch) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  // Wheel-to-zoom centered at the cursor. Attach a non-passive native listener
  // so `preventDefault()` actually suppresses page scroll inside the surface.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Cursor relative to the container's center, which is also where the
      // image's transform-origin sits at scale = 1.
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      // Smooth exponential zoom; trackpads send small deltaY, mice send larger.
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((prev) => {
        const next = Math.min(8, Math.max(1, prev.scale * factor));
        if (next === prev.scale) return prev;
        if (next <= 1.001) return { scale: 1, tx: 0, ty: 0 };
        // Keep the image-space point under the cursor stationary across
        // the zoom: solve (cx - tx) / s == (cx - tx') / s' for tx'.
        const nextTx = cx - ((cx - prev.tx) * next) / prev.scale;
        const nextTy = cy - ((cy - prev.ty) * next) / prev.scale;
        const clamped = clampPan(next, nextTx, nextTy);
        return { scale: next, tx: clamped.x, ty: clamped.y };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLImageElement>): void => {
    if (view.scale <= 1) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseTx: view.tx,
      baseTy: view.ty,
    };
    setPanning(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLImageElement>): void => {
    const ps = panRef.current;
    if (!ps) return;
    const dx = e.clientX - ps.startX;
    const dy = e.clientY - ps.startY;
    setView((prev) => {
      const clamped = clampPan(prev.scale, ps.baseTx + dx, ps.baseTy + dy);
      return { ...prev, tx: clamped.x, ty: clamped.y };
    });
  };
  const endPan = (e: React.PointerEvent<HTMLImageElement>): void => {
    if (!panRef.current) return;
    panRef.current = null;
    setPanning(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer may already be released */
    }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLImageElement>): void => {
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    setView((prev) => {
      if (prev.scale > 1) return { scale: 1, tx: 0, ty: 0 };
      const next = 2;
      const nextTx = cx - cx * next; // prev.tx === 0, prev.scale === 1
      const nextTy = cy - cy * next;
      const clamped = clampPan(next, nextTx, nextTy);
      return { scale: next, tx: clamped.x, ty: clamped.y };
    });
  };

  return (
    <div ref={containerRef} className={containerClassName}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        width={width || undefined}
        height={height || undefined}
        draggable={false}
        style={{
          ...baseStyle,
          transform: `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${view.scale})`,
          transformOrigin: "center center",
          transition: panning ? "none" : "transform 120ms ease-out",
          cursor: view.scale > 1 ? (panning ? "grabbing" : "grab") : "default",
          touchAction: "none",
          willChange: "transform",
        }}
        className={className}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
}
