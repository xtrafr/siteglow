<script lang="ts">
  import URLInput from "$lib/components/home/URLInput.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { SwatchBook, ShieldCheck, Gauge, Layout, Type, Globe, Files } from "@lucide/svelte";
  import { cn } from "$lib/utils";
</script>

<svelte:head>
  <title>WebDNA</title>
</svelte:head>

<div class="mt-2 flex flex-col space-y-2">
  <URLInput />

  <div class="p-px">
    <div class="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900/40">
      <div class="flex flex-col min-h-[calc(100vh-10rem)]">
        
        <!-- Page Header -->
        <div class="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div class="flex items-center space-x-2 text-neutral-500 dark:text-neutral-400">
            <Files size={18} strokeWidth={1.5} />
            <p class="text-sm">
              <span class="font-mono">6</span>
              <span>core modules</span>
            </p>
          </div>
          <div class="flex items-center space-x-2">
            <Badge variant="outline" class="font-mono text-[10px] uppercase tracking-wider">v1.0.0</Badge>
          </div>
        </div>

        <!-- Content -->
        <div class="p-6">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            
            <div class="group flex flex-col rounded-md border border-neutral-200 p-4 transition-colors hover:bg-neutral-100/80 dark:border-neutral-800 dark:hover:bg-neutral-800/20">
              <div class="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800">
                <SwatchBook size={18} strokeWidth={1.5} class="text-neutral-900 dark:text-white" />
              </div>
              <h3 class="text-sm font-medium dark:text-white">Branding</h3>
              <p class="mt-1 text-xs text-neutral-500 leading-relaxed">Extract logos, favicons, and primary brand colors automatically.</p>
            </div>

            <div class="group flex flex-col rounded-md border border-neutral-200 p-4 transition-colors hover:bg-neutral-100/80 dark:border-neutral-800 dark:hover:bg-neutral-800/20">
              <div class="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800">
                <Layout size={18} strokeWidth={1.5} class="text-neutral-900 dark:text-white" />
              </div>
              <h3 class="text-sm font-medium dark:text-white">Tech Stack</h3>
              <p class="mt-1 text-xs text-neutral-500 leading-relaxed">Identify frameworks, analytics, and libraries powering the site.</p>
            </div>

            <div class="group flex flex-col rounded-md border border-neutral-200 p-4 transition-colors hover:bg-neutral-100/80 dark:border-neutral-800 dark:hover:bg-neutral-800/20">
              <div class="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800">
                <Globe size={18} strokeWidth={1.5} class="text-neutral-900 dark:text-white" />
              </div>
              <h3 class="text-sm font-medium dark:text-white">SEO & Social</h3>
              <p class="mt-1 text-xs text-neutral-500 leading-relaxed">Preview Open Graph data and find all social media connections.</p>
            </div>

            <div class="group flex flex-col rounded-md border border-neutral-200 p-4 transition-colors hover:bg-neutral-100/80 dark:border-neutral-800 dark:hover:bg-neutral-800/20">
              <div class="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800">
                <Type size={18} strokeWidth={1.5} class="text-neutral-900 dark:text-white" />
              </div>
              <h3 class="text-sm font-medium dark:text-white">Typography</h3>
              <p class="mt-1 text-xs text-neutral-500 leading-relaxed">Analyze font families, sizes, and weight distributions.</p>
            </div>

            <div class="group flex flex-col rounded-md border border-neutral-200 p-4 transition-colors hover:bg-neutral-100/80 dark:border-neutral-800 dark:hover:bg-neutral-800/20">
              <div class="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800">
                <ShieldCheck size={18} strokeWidth={1.5} class="text-neutral-900 dark:text-white" />
              </div>
              <h3 class="text-sm font-medium dark:text-white">Security</h3>
              <p class="mt-1 text-xs text-neutral-500 leading-relaxed">Check for SSL status and common header security practices.</p>
            </div>

            <div class="group flex flex-col rounded-md border border-neutral-200 p-4 transition-colors hover:bg-neutral-100/80 dark:border-neutral-800 dark:hover:bg-neutral-800/20">
              <div class="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800">
                <Gauge size={18} strokeWidth={1.5} class="text-neutral-900 dark:text-white" />
              </div>
              <h3 class="text-sm font-medium dark:text-white">Performance</h3>
              <p class="mt-1 text-xs text-neutral-500 leading-relaxed">Get a quick overview of page weight and load metrics.</p>
            </div>

          </div>
        </div>
      </div>
    </div>
  </div>
</div>
