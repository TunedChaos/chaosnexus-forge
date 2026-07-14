<!-- chaosnexus-forge/src/lib/components/FloatingDraggable.svelte -->
<script lang="ts">
  import { onMount } from "svelte";

  let { 
    children, 
    initialX = 20, 
    initialY = 20, 
    width = 300, 
    height = 400 
  } = $props<{
    children: any;
    initialX?: number;
    initialY?: number;
    width?: number;
    height?: number;
  }>();

  let x = $state(initialX);
  let y = $state(initialY);
  let isDragging = $state(false);
  let startX = 0;
  let startY = 0;
  let initialMouseX = 0;
  let initialMouseY = 0;

  function handleMousedown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    isDragging = true;
    startX = x;
    startY = y;
    initialMouseX = e.clientX;
    initialMouseY = e.clientY;
    
    window.addEventListener('mousemove', handleMousemove);
    window.addEventListener('mouseup', handleMouseup);
  }

  function handleMousemove(e: MouseEvent) {
    if (!isDragging) return;
    e.preventDefault(); // Prevent text selection
    
    const dx = e.clientX - initialMouseX;
    const dy = e.clientY - initialMouseY;
    
    x = startX + dx;
    y = startY + dy;
    
    // Boundary checks
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + width > window.innerWidth) x = window.innerWidth - width;
    if (y + height > window.innerHeight) y = window.innerHeight - height;
  }

  function handleMouseup() {
    isDragging = false;
    window.removeEventListener('mousemove', handleMousemove);
    window.removeEventListener('mouseup', handleMouseup);
  }

  onMount(() => {
    return () => {
      window.removeEventListener('mousemove', handleMousemove);
      window.removeEventListener('mouseup', handleMouseup);
    };
  });
</script>

<div 
  class="fixed z-50 shadow-xl rounded-lg overflow-hidden border theme-border theme-bg-main flex flex-col"
  style="left: {x}px; top: {y}px; width: {width}px; height: {height}px;"
>
  <div 
    class="flex-none h-2 cursor-move theme-bg-sidebar hover:theme-bg-accent transition-colors"
    onmousedown={handleMousedown}
    aria-label="Drag Handle"
    role="button"
    tabindex="0"
  ></div>
  <div class="flex-1 min-h-0 no-drag">
    {@render children()}
  </div>
</div>
