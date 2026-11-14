<!-- chaosnexus-forge/src/lib/components/ThemedSelect.svelte -->
<script lang="ts">
  import IconChevronDown from "~icons/lucide/chevron-down";
  import IconCheck from "~icons/lucide/check";

  /** A single selectable entry. `previewFont` renders the row in that CSS font. */
  export interface ThemedSelectOption {
    /** The actual value bound when this option is selected. */
    value: string;
    /** Human-readable label displayed for this option. */
    label: string;
    /** Optional CSS font-family applied to this row (and the trigger when chosen). */
    previewFont?: string;
  }

  /**
   * Props for the ThemedSelect component.
   */
  interface Props {
    /** The currently selected value. */
    value: string;
    /** Array of selectable options. */
    options: ThemedSelectOption[];
    /** Callback triggered when a new option is selected. */
    onChange: (value: string) => void;
    /** Whether the select dropdown is disabled. */
    disabled?: boolean;
    /** Placeholder text shown when no value is selected. */
    placeholder?: string;
    /** Accessible name for the trigger (required when there is no visible label). */
    ariaLabel?: string;
    /** data-testid for the trigger button (list/options derive suffixed ids). */
    testId?: string;
  }

  let {
    value,
    options,
    onChange,
    disabled = false,
    placeholder = "Select...",
    ariaLabel,
    testId,
  }: Props = $props();

  let open = $state(false);
  /** Keyboard-focused row while the list is open (-1 = none). */
  let activeIndex = $state(-1);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);

  /** Fixed-position popover geometry (escapes modal/scroll overflow clipping). */
  let popStyle = $state("");

  let selected = $derived(options.find((o) => o.value === value) ?? null);
  /** Trigger text: matched label, else the raw value, else the placeholder. */
  let triggerLabel = $derived(selected?.label ?? (value ? value : placeholder));

  /**
   * Positions the popover with `position: fixed` relative to the trigger so it is
   * never clipped by an ancestor's `overflow`, flipping above the trigger when
   * there is more room there than below.
   */
  function reposition(): void {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const maxH = 260;
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    const flipUp = below < Math.min(maxH, 200) && above > below;
    const height = Math.min(maxH, (flipUp ? above : below) - 8);
    const top = flipUp ? rect.top - height - 4 : rect.bottom + 4;
    popStyle =
      `left:${Math.round(rect.left)}px;` +
      `top:${Math.round(top)}px;` +
      `width:${Math.round(rect.width)}px;` +
      `max-height:${Math.round(height)}px;`;
  }

  function openList(): void {
    if (disabled) return;
    reposition();
    open = true;
    activeIndex = Math.max(
      0,
      options.findIndex((o) => o.value === value)
    );
    // Focus the active row once the list has rendered.
    queueMicrotask(() => focusRow(activeIndex));
  }

  function closeList(refocus = true): void {
    open = false;
    activeIndex = -1;
    if (refocus) triggerEl?.focus();
  }

  function choose(option: ThemedSelectOption): void {
    onChange(option.value);
    closeList();
  }

  function focusRow(index: number): void {
    const row = listEl?.querySelectorAll<HTMLButtonElement>("[data-ts-option]")[index];
    row?.focus();
  }

  function onTriggerKeydown(e: KeyboardEvent): void {
    if (disabled) return;
    // Enter/Space already fire a native button click (toggling open); only the
    // arrow keys need explicit handling so we don't double-toggle.
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openList();
    }
  }

  function onListKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      closeList();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % options.length;
      focusRow(activeIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + options.length) % options.length;
      focusRow(activeIndex);
    } else if (e.key === "Home") {
      e.preventDefault();
      activeIndex = 0;
      focusRow(0);
    } else if (e.key === "End") {
      e.preventDefault();
      activeIndex = options.length - 1;
      focusRow(activeIndex);
    } else if (e.key === "Tab") {
      // Leaving the list dismisses it without stealing the Tab navigation.
      closeList(false);
    }
  }

  // While open, dismiss on outside pointerdown and keep the popover glued to the
  // trigger across scroll/resize (fixed positioning would otherwise drift).
  $effect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerEl?.contains(target) || listEl?.contains(target)) return;
      closeList(false);
    };
    const onReflow = () => reposition();

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  });
</script>

<button
  type="button"
  bind:this={triggerEl}
  data-testid={testId}
  {disabled}
  class="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border theme-border theme-bg-sidebar theme-text-main text-left cursor-pointer focus:outline-none focus:theme-border-accent disabled:opacity-50 disabled:cursor-not-allowed"
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-label={ariaLabel}
  onclick={() => (open ? closeList() : openList())}
  onkeydown={onTriggerKeydown}
>
  <span
    class="truncate {selected ? '' : 'theme-text-muted'}"
    style={selected?.previewFont ? `font-family: ${selected.previewFont};` : undefined}
  >
    {triggerLabel}
  </span>
  <IconChevronDown
    class="w-3.5 h-3.5 shrink-0 theme-text-muted transition-transform {open ? 'rotate-180' : ''}"
  />
</button>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={listEl}
    data-testid={testId ? `${testId}-list` : undefined}
    role="listbox"
    aria-label={ariaLabel}
    tabindex="-1"
    style={popStyle}
    class="fixed z-[200] overflow-y-auto rounded border theme-border-accent theme-bg-sidebar shadow-2xl shadow-black/50 py-1"
    onkeydown={onListKeydown}
  >
    {#each options as option (option.value)}
      {@const isSelected = option.value === value}
      <button
        type="button"
        data-ts-option
        data-value={option.value}
        role="option"
        aria-selected={isSelected}
        tabindex="-1"
        class="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left cursor-pointer theme-text-main hover:theme-bg-accent-soft focus:theme-bg-accent-soft focus:outline-none {isSelected
          ? 'theme-text-accent'
          : ''}"
        onclick={() => choose(option)}
      >
        <span class="truncate" style={option.previewFont ? `font-family: ${option.previewFont};` : undefined}>
          {option.label}
        </span>
        {#if isSelected}
          <IconCheck class="w-3.5 h-3.5 shrink-0" />
        {/if}
      </button>
    {/each}
  </div>
{/if}
