<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import ModalShell from "$lib/components/ModalShell.svelte";
  import { onMount } from "svelte";

  // Modal State
  let isOpen = $state(false);
  let searchQuery = $state("");
  let isSearching = $state(false);
  let isInstalling = $state(false);
  let error = $state<string | null>(null);
  
  // Results
  interface RegistryPlugin {
    name: string;
    description: string;
    git_url: string;
    capabilities: string[];
  }
  let searchResults = $state<RegistryPlugin[]>([]);
  let selectedPlugin = $state<RegistryPlugin | null>(null);
  let installSuccessMessage = $state<string | null>(null);

  function handleOpen() {
    isOpen = true;
    error = null;
    installSuccessMessage = null;
    selectedPlugin = null;
    performSearch(); // auto load default results
  }

  function handleClose() {
    isOpen = false;
  }

  async function performSearch() {
    isSearching = true;
    error = null;
    selectedPlugin = null;
    installSuccessMessage = null;
    
    try {
      const res = await invoke<{ content: { text: string }[] }>("call_mcp_tool", {
        serverName: "chaosnexus-anvil",
        toolName: "chaoswrench_search_plugins",
        arguments: { query: searchQuery }
      });
      
      if (res && res.content && res.content.length > 0) {
        searchResults = JSON.parse(res.content[0].text);
      } else {
        searchResults = [];
      }
    } catch (e) {
      error = String(e);
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }

  async function performInstall(plugin: RegistryPlugin) {
    if (isInstalling) return;
    
    isInstalling = true;
    error = null;
    installSuccessMessage = null;
    
    try {
      const res = await invoke<{ content: { text: string }[] }>("call_mcp_tool", {
        serverName: "chaosnexus-anvil",
        toolName: "chaoswrench_install_plugin",
        arguments: { 
          plugin_name: plugin.name,
          git_url: plugin.git_url
        }
      });
      
      if (res && res.content && res.content.length > 0) {
        installSuccessMessage = res.content[0].text;
      } else {
        installSuccessMessage = "Plugin installed successfully. Check the Pending Approvals tab.";
      }
    } catch (e) {
      error = String(e);
    } finally {
      isInstalling = false;
    }
  }

  onMount(() => {
    const onOpen = () => handleOpen();
    window.addEventListener("open-plugin-browser-modal", onOpen);
    return () => {
      window.removeEventListener("open-plugin-browser-modal", onOpen);
    };
  });
</script>

{#if isOpen}
  <ModalShell onBackdropClick={handleClose} panelClass="w-[800px] h-[600px] theme-bg-main theme-border rounded overflow-hidden shadow-2xl p-5 flex flex-col space-y-4">
    <div class="flex justify-between items-center theme-border-b pb-2">
      <h3 class="text-sm font-bold uppercase tracking-wider theme-text-accent flex items-center space-x-1.5">
        <span class="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
        <span>Plugin Browser</span>
      </h3>
      <button class="text-xs theme-text-muted hover:theme-text-main cursor-pointer" onclick={handleClose}>
        ✕
      </button>
    </div>
    <div class="flex flex-col flex-1 min-h-0 space-y-4">
      
      <!-- Search Bar -->
      <div class="flex space-x-2">
        <input 
          type="text" 
          bind:value={searchQuery}
          onkeydown={(e) => { if (e.key === 'Enter') performSearch(); }}
          placeholder="Search plugins..."
          class="flex-1 px-3 py-1.5 text-sm theme-bg-main theme-border rounded theme-text-main focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button 
          onclick={performSearch}
          disabled={isSearching}
          class="px-4 py-1.5 text-sm font-bold uppercase tracking-wider theme-bg-sidebar hover:theme-bg-header theme-border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSearching ? "Searching..." : "Search"}
        </button>
      </div>

      {#if error}
        <div class="p-3 text-sm font-mono text-red-400 bg-red-950/30 border border-red-500/20 rounded">
          <span class="font-bold">Error:</span> {error}
        </div>
      {/if}

      {#if installSuccessMessage}
        <div class="p-3 text-sm font-mono text-green-400 bg-green-950/30 border border-green-500/20 rounded flex justify-between items-start">
          <div>
            <span class="font-bold">Success:</span> {installSuccessMessage}
          </div>
          <button 
            onclick={() => installSuccessMessage = null}
            class="ml-4 text-green-500 hover:text-green-300"
          >
            ✕
          </button>
        </div>
      {/if}

      <!-- Main Layout -->
      <div class="flex flex-1 overflow-hidden space-x-4">
        
        <!-- Results List -->
        <div class="w-1/2 flex flex-col theme-border rounded overflow-hidden theme-bg-sidebar">
          <div class="px-3 py-2 text-xs font-bold uppercase tracking-wider theme-bg-header theme-border-b">
            Available Plugins
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-2">
            {#if searchResults.length === 0 && !isSearching}
              <div class="text-sm theme-text-muted p-2 italic text-center mt-4">
                No plugins found.
              </div>
            {/if}
            
            {#each searchResults as plugin}
              <button 
                class="w-full text-left p-3 rounded theme-border transition-colors {selectedPlugin?.name === plugin.name ? 'theme-bg-header border-blue-500/50' : 'theme-bg-main hover:theme-bg-header'}"
                onclick={() => { selectedPlugin = plugin; installSuccessMessage = null; error = null; }}
              >
                <div class="flex justify-between items-center mb-1">
                  <span class="font-bold font-mono text-sm theme-text-accent">{plugin.name}</span>
                  {#if plugin.capabilities.length > 0}
                    <span class="text-[10px] uppercase tracking-wide theme-text-muted bg-black/20 px-1.5 py-0.5 rounded">
                      {plugin.capabilities.length} Caps
                    </span>
                  {/if}
                </div>
                <div class="text-xs theme-text-muted line-clamp-2">
                  {plugin.description}
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Details Panel -->
        <div class="w-1/2 flex flex-col theme-border rounded overflow-hidden theme-bg-sidebar">
          <div class="px-3 py-2 text-xs font-bold uppercase tracking-wider theme-bg-header theme-border-b">
            Plugin Details
          </div>
          <div class="flex-1 overflow-y-auto p-4">
            {#if selectedPlugin}
              <div class="space-y-4">
                <div>
                  <h2 class="text-lg font-bold font-mono theme-text-accent mb-2">{selectedPlugin.name}</h2>
                  <p class="text-sm theme-text-main leading-relaxed">
                    {selectedPlugin.description}
                  </p>
                </div>
                
                <div class="pt-2 theme-border-t">
                  <h3 class="text-xs font-bold uppercase tracking-wider theme-text-muted mb-2">Repository</h3>
                  <div class="text-xs font-mono theme-text-main bg-black/20 p-2 rounded break-all">
                    {selectedPlugin.git_url}
                  </div>
                </div>

                <div class="pt-2 theme-border-t">
                  <h3 class="text-xs font-bold uppercase tracking-wider theme-text-muted mb-2">Requested Capabilities</h3>
                  {#if selectedPlugin.capabilities.length > 0}
                    <div class="flex flex-wrap gap-1.5">
                      {#each selectedPlugin.capabilities as cap}
                        <span class="text-xs font-mono px-2 py-1 theme-bg-header rounded theme-border">
                          {cap}
                        </span>
                      {/each}
                    </div>
                  {:else}
                    <div class="text-xs italic theme-text-muted">None</div>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="flex items-center justify-center h-full text-sm italic theme-text-muted">
                Select a plugin to view details.
              </div>
            {/if}
          </div>
          
          {#if selectedPlugin}
            <div class="p-3 theme-bg-header theme-border-t flex justify-end">
              <button 
                onclick={() => performInstall(selectedPlugin!)}
                disabled={isInstalling}
                class="px-4 py-1.5 text-sm font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {#if isInstalling}
                  <span>Installing...</span>
                {:else}
                  <span>Install to Quarantine</span>
                {/if}
              </button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </ModalShell>
{/if}
