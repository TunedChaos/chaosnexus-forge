<!-- chaosnexus-forge/src/lib/components/Splitter.svelte -->
<script lang="ts">
  import { onDestroy } from "svelte";

  let {
    min = 10,
    max = 90,
    value = $bindable(50),
    vertical = false,
    type = "px",
    reverse = false,
    testId = "editor-split-handle",
  } = $props<{
    /** The minimum allowable value for the splitter. */
    min?: number;
    /** The maximum allowable value for the splitter. */
    max?: number;
    /** The current resize value, bound bidirectionally. */
    value: number;
    /** If true, the splitter resizes vertically (up/down). */
    vertical?: boolean;
    /** The unit of measurement for the resize value (pixels or percentages). */
    type?: "px" | "percent";
    /** If true, dragging right/down decreases the value instead of increasing. */
    reverse?: boolean;
    /** Optional identifier for testing. */
    testId?: string;
  }>();

  let isDragging = $state(false);
  let startX = 0;
  let startY = 0;
  let startVal = 0;
  let containerSize = 0;

  function applyDelta(clientX: number, clientY: number) {
    let delta = vertical ? clientY - startY : clientX - startX;
    if (reverse) delta = -delta;

    const raw =
      type === "percent" && containerSize > 0
        ? startVal + (delta / containerSize) * 100
        : startVal + delta;

    value = Math.max(min, Math.min(max, raw));
  }

  function onMove(e: PointerEvent) {
    if (!isDragging) return;
    e.preventDefault();
    applyDelta(e.clientX, e.clientY);
  }

  function stopDrag() {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", stopDrag, true);
    window.removeEventListener("pointercancel", stopDrag, true);
  }

  function handlePointerDown(e: PointerEvent) {
    if (isDragging || e.button !== 0) return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startVal = value;

    const parent = (e.currentTarget as HTMLElement).parentElement;
    if (parent) {
      containerSize = vertical ? parent.clientHeight : parent.clientWidth;
    }

    document.body.style.userSelect = "none";

    // Capture phase so the drag keeps tracking even when the cursor passes over
    // Monaco or the Svelte Flow canvas (which can stop event propagation).
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", stopDrag, true);
    window.addEventListener("pointercancel", stopDrag, true);

    e.preventDefault();
  }

  function handleKeydown(e: KeyboardEvent) {
    const decKey = vertical ? "ArrowUp" : "ArrowLeft";
    const incKey = vertical ? "ArrowDown" : "ArrowRight";
    const step = e.shiftKey ? 10 : 2;

    if (e.key === decKey) value = Math.max(min, Math.min(max, value - step));
    else if (e.key === incKey) value = Math.max(min, Math.min(max, value + step));
    else if (e.key === "Home") value = min;
    else if (e.key === "End") value = max;
    else return;

    e.preventDefault();
  }

  onDestroy(() => stopDrag());
</script>

<!--
  Splitter handle. Uses `self-stretch` (NOT h-full/w-full) to fill the flex
  cross-axis: a percentage height/width collapses to content size on a flex
  child whose parent size is briefly indefinite during mount/HMR, which would
  shrink the grab area. align-self:stretch is immune to that timing.
-->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  data-testid={testId}
  aria-orientation={vertical ? "horizontal" : "vertical"}
  aria-valuenow={Math.round(value)}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-label={vertical ? "Resize panes vertically" : "Resize panes horizontally"}
  tabindex={0}
  class="relative z-50 shrink-0 self-stretch outline-none transition-colors focus-visible:bg-red-500/70 {vertical
    ? 'h-1 cursor-row-resize'
    : 'w-1 cursor-col-resize'} {isDragging
    ? 'bg-red-500'
    : 'theme-bg-border hover:bg-red-500 hover:opacity-50'}"
  style="touch-action: none;"
  onpointerdown={handlePointerDown}
  onkeydown={handleKeydown}
></div>
