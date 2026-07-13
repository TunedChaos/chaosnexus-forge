<!-- chaosnexus-forge/src/lib/components/AboutModal.svelte -->
<script lang="ts">
  /**
   * The AboutModal component displays information about ChaosNexus Forge and its open-source licenses.
   */
  import { onMount, onDestroy, tick } from "svelte";
  import chaoswrenchLicensesData from "$lib/assets/chaosnexus-anvil-licenses.json";
  import chaosforgeBackendLicensesData from "$lib/assets/chaosnexus-forge-backend-licenses.json";
  import chaosforgeFrontendLicensesData from "$lib/assets/chaosnexus-forge-frontend-licenses.json";
  import chaosdocsLicensesData from "$lib/assets/chaosnexus-codex-licenses.json";
  import ModalShell from "./ModalShell.svelte";

  let isOpen = $state(false);

  // Normalize licenses
  let licenses = $state<any[]>([]);
  let selectedLicense = $state<any | null>(null);

  onMount(() => {
    const processBackend = (data: any, sourceName: string) => {
      return (Array.isArray(data) ? data : []).map((l: any) => ({
        name: l.name,
        version: l.version,
        repository: l.repository,
        license: l.license,
        text: l.license_text,
        source: sourceName,
      }));
    };

    const processFrontend = (data: any, sourceName: string) => {
      const raw: any = typeof data === "object" && data !== null ? data : {};
      const parsed: any[] = [];
      for (const [licenseName, packages] of Object.entries(raw)) {
        if (Array.isArray(packages)) {
          for (const pkg of packages) {
            parsed.push({
              name: pkg.name,
              version: (pkg.versions && pkg.versions.length > 0) ? pkg.versions[0] : "",
              repository: pkg.repository || pkg.homepage || "",
              license: pkg.license || licenseName,
              text: pkg.licenseText || `License: ${pkg.license || licenseName}\n\nFull license text was not found in the installed package.`,
              source: sourceName,
            });
          }
        }
      }
      return parsed;
    };

    const combined = [
      ...processBackend(chaoswrenchLicensesData, "ChaosNexus Anvil"),

      ...processBackend(chaosforgeBackendLicensesData, "ChaosNexus Forge (Rust)"),
      ...processFrontend(chaosforgeFrontendLicensesData, "ChaosNexus Forge (UI)"),
      ...processFrontend(chaosdocsLicensesData, "ChaosNexus Codex"),
    ].sort((a, b) => a.name.localeCompare(b.name));

    licenses = combined;

    const onOpen = () => {
      isOpen = true;
    };
    window.addEventListener("open-about-modal", onOpen);

    return () => {
      window.removeEventListener("open-about-modal", onOpen);
    };
  });

  function close() {
    isOpen = false;
    selectedLicense = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;

    if (e.key === "Escape") {
      close();
      e.preventDefault();
      return;
    }

    if (licenses.length === 0) return;

    const currentIndex = selectedLicense
      ? licenses.findIndex((l: any) => l === selectedLicense)
      : -1;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = currentIndex < licenses.length - 1 ? currentIndex + 1 : currentIndex;
      selectedLicense = nextIndex === -1 ? licenses[0] : licenses[nextIndex];
      const targetIndex = nextIndex === -1 ? 0 : nextIndex;
      tick().then(() => {
        document
          .getElementById(`license-node-${targetIndex}`)
          ?.scrollIntoView({ block: "nearest" });
      });
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentIndex === -1) {
        selectedLicense = licenses[0];
      } else {
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        selectedLicense = licenses[prevIndex];
      }
      const targetIndex = currentIndex === -1 ? 0 : currentIndex > 0 ? currentIndex - 1 : 0;
      tick().then(() => {
        document
          .getElementById(`license-node-${targetIndex}`)
          ?.scrollIntoView({ block: "nearest" });
      });
      return;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <ModalShell
    zClass="z-[100]"
    backdropClass="bg-black/60 backdrop-blur-sm"
    panelClass="w-[800px] h-[600px] theme-bg-main theme-border border shadow-2xl rounded-xl flex flex-col overflow-hidden relative p-0 space-y-0"
    onBackdropClick={close}
  >
    <!-- Close Button (Absolute Top Right) -->
    <button
      class="absolute top-4 right-4 theme-text-muted hover:text-white cursor-pointer z-10 transition-colors"
      onclick={close}>✕</button
    >

    <!-- Top Half: Branding -->
    <div
      class="flex flex-col items-center justify-center pt-10 pb-8 text-center theme-border-b bg-black/20"
    >
      <div
        class="w-16 h-16 theme-bg-accent rounded-xl flex items-center justify-center font-bold text-3xl text-white mb-4 shadow-lg shadow-[var(--color-accent)]/20"
      >
        Ω
      </div>
      <h3 class="text-3xl font-bold font-mono mb-1 theme-text-main">ChaosNexus Forge</h3>
      <p class="text-sm font-mono theme-text-accent mb-2">v0.1.0-alpha</p>
      <p class="text-xs font-mono theme-text-muted mb-4">
        Part of <span class="theme-text-accent font-semibold">ChaosNexus</span> - open source from
        <a href="https://chaosnexus.ai" class="hover:underline" target="_blank"
          >chaosnexus.ai</a
        >
      </p>
      <p class="theme-text-muted text-sm">ChaosNexus Forge is a product of Tuned Chaos LLC &copy; 2026</p>
      <p class="text-xs opacity-60 mt-1">Agentic Orchestration Workbench</p>
    </div>

    <!-- Bottom Half: License Browser (Compact) -->
    <div class="flex-1 flex overflow-hidden bg-zinc-950/20">
      <!-- Sidebar: License List -->
      <div class="w-1/3 theme-border-r flex flex-col h-full bg-zinc-950/40">
        <div class="p-3 theme-border-b text-xs font-bold uppercase theme-text-muted tracking-wider">
          Third-Party Licenses
        </div>
        <div class="flex-1 overflow-y-auto">
          {#each licenses as pkg, i}
            <button
              id="license-node-{i}"
              class="w-full text-left p-3 theme-border-b hover:theme-bg-accent-soft flex flex-col transition-colors cursor-pointer
                  {selectedLicense === pkg
                ? 'theme-bg-accent-soft theme-text-accent'
                : 'theme-text-main'}"
              onclick={() => (selectedLicense = pkg)}
            >
              <span class="font-bold font-mono text-sm truncate">{pkg.name}</span>
              <div class="flex justify-between items-center mt-1 text-xs">
                <span class="opacity-70">{pkg.version}</span>
                <span class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
                  >{pkg.source}</span
                >
              </div>
            </button>
          {/each}
          {#if licenses.length === 0}
            <div class="p-4 text-xs theme-text-muted text-center">
              No license data found. Run build to generate.
            </div>
          {/if}
        </div>
      </div>

      <!-- Main Area: Details -->
      <div class="w-2/3 h-full flex flex-col relative">
        {#if selectedLicense}
          <div class="p-5 theme-border-b bg-black/20">
            <h3 class="text-lg font-bold font-mono text-white mb-1">{selectedLicense.name}</h3>
            <div class="text-sm theme-text-muted flex space-x-4">
              <span>Version: <span class="text-white">{selectedLicense.version}</span></span>
              <span
                >License: <span class="theme-text-accent font-bold">{selectedLicense.license}</span
                ></span
              >
            </div>
            {#if selectedLicense.repository}
              <div class="mt-2 text-xs">
                <a
                  href={selectedLicense.repository}
                  target="_blank"
                  class="text-blue-400 hover:underline">{selectedLicense.repository}</a
                >
              </div>
            {/if}
          </div>
          <div class="flex-1 p-5 overflow-y-auto">
            <pre
              class="text-xs font-mono whitespace-pre-wrap theme-text-muted">{selectedLicense.text}</pre>
          </div>
        {:else}
          <!-- Blank or 'Select a license' state -->
          <div class="flex-1 flex flex-col items-center justify-center text-center p-4">
            <p class="theme-text-muted text-sm opacity-60">
              Select a package from the sidebar to view its open-source license attribution.
            </p>
          </div>
        {/if}
      </div>
    </div>
  </ModalShell>
{/if}
