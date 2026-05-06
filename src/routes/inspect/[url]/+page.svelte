<script lang="ts">
	import { cn } from '$lib/utils';
	import { fade, fly } from 'svelte/transition';
	import { history, favorites, addToHistory, toggleFavorite } from '$lib/stores/appState';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	// Vercel Build Trigger: 2026-04-26T20:13
	import { toast } from 'svelte-sonner';
	import {
		Copy as CopyIcon,
		ExternalLink as ExternalLinkIcon,
		Palette as PaletteIcon,
		Type as TypeIcon,
		Info as InfoIcon,
		Layers as LayersIcon,
		Share as ShareIcon,
		Download as DownloadIcon,
		Code as CodeIcon,
		Star as StarIcon,
		Globe,
		ShieldCheck,
		Activity as ActivityIcon,
		Map as MapIcon,
		AlertCircle,
		Server,
		MapPin,
		Zap,
		Gauge,
		Folder,
		File,
		ChevronRight,
		ChevronDown,
		FileImage,
		FileCode,
		Mail,
		FileText,
		Fingerprint,
		Dna,
		Loader2,
		Search as SearchIcon,
		X as CloseIcon,
		Hash,
		Paintbrush
	} from '@lucide/svelte';
	import WhoisScanner from '$lib/components/whois/WhoisScanner.svelte';
	import { analyzeHtml } from '$lib/scanner/analysis';
	import { findProvider } from '$lib/data/providers';

	let { data } = $props<{ data: PageData }>();
	let showFullDesc = $state(false);
	let isMapOpen = $state(false);
	let isProviderModalOpen = $state(false);
	let clientReport = $state<any>(null);
	let clientError = $state<string | null>(null);
	let isScanningClient = $state(false);
	let serverReportResolved = $state<any>(null);

	// Asset Viewer state
	let selectedAsset = $state<any>(null);
	let assetContent = $state<string>('');
	let isAssetLoading = $state(false);
	let assetError = $state(false);
	let isExportOpen = $state(false);

	function formatAndHighlight(code: string, type: string) {
		if (!code) return '';

		// Simple prettifier for minified code
		let formatted = code;
		if (type === 'script' || type === 'style') {
			formatted = code
				.replace(/([{};])/g, '$1\n')
				.replace(/\n\s*\n/g, '\n')
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0)
				.join('\n');

			// Basic indentation
			let indent = 0;
			formatted = formatted
				.split('\n')
				.map((line) => {
					if (line.includes('}')) indent--;
					const spaced = '  '.repeat(Math.max(0, indent)) + line;
					if (line.includes('{')) indent++;
					return spaced;
				})
				.join('\n');
		}

		// Basic Syntax Highlighting (Regex based)
		// Escaping HTML
		let html = formatted.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

		if (type === 'script') {
			html = html
				.replace(
					/\b(const|let|var|function|return|if|else|for|while|import|export|from|async|await|const|new|try|catch|finally|class|extends|await)\b/g,
					'<span class="text-purple-500 font-bold">$1</span>'
				)
				.replace(
					/\b(true|false|null|undefined)\b/g,
					'<span class="text-orange-500 font-bold">$1</span>'
				)
				.replace(/(".*?"|'.*?'|`.*?`)/g, '<span class="text-green-500">$1</span>')
				.replace(/\/\/.*/g, '<span class="text-neutral-500">$1</span>')
				.replace(/\b(\d+)\b/g, '<span class="text-blue-500">$1</span>');
		} else if (type === 'style') {
			html = html
				.replace(/([a-zA-Z-]+)(?=\s*:)/g, '<span class="text-blue-400 font-bold">$1</span>')
				.replace(/:([^;]+);/g, ': <span class="text-orange-400">$1</span>;')
				.replace(
					/(\.[a-zA-Z0-9_-]+|#[a-zA-Z0-9_-]+|[a-z]+)(?=\s*\{)/g,
					'<span class="text-yellow-500 font-bold">$1</span>'
				);
		}

		return html;
	}

	async function openAsset(asset: any) {
		if (asset.type === 'folder') return;

		selectedAsset = asset;
		assetContent = '';
		assetError = false;

		if (
			asset.fileType === 'script' ||
			asset.fileType === 'style' ||
			asset.fileType === 'document'
		) {
			isAssetLoading = true;
			try {
				const res = await fetch(`/api/proxy-asset?url=${encodeURIComponent(asset.url)}`);
				if (res.ok) {
					const raw = await res.text();
					assetContent = formatAndHighlight(raw, asset.fileType);
				} else {
					assetContent = '<span class="text-red-500">// Failed to load asset content.</span>';
				}
			} catch (err) {
				assetContent = '<span class="text-red-500">// Error fetching asset.</span>';
			} finally {
				isAssetLoading = false;
			}
		}
	}

	// Scroll lock effect
	$effect(() => {
		if (isMapOpen || selectedAsset || showFullDesc || isProviderModalOpen) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	});

	// Derive final report and error
	let report = $derived(clientReport || serverReportResolved);
	let error = $derived(clientError || data.error);

	let isFavorite = $derived($favorites.some((f) => f.domain === report?.domain));
	let isIpOnly = $derived(report && /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(report.domain));

	// Svelte 5 effect to handle history and client-side fallback
	$effect(() => {
		const r = data.streamed.report;
		r.then((reportValue: any) => {
			serverReportResolved = reportValue;
			if (reportValue) {
				if (reportValue.needsClientFetch && !clientReport) {
					performClientScan();
				} else if (!reportValue.needsClientFetch) {
					addToHistory(reportValue);
				}
			}
		}).catch((err) => {
			clientError = err.message || 'Failed to scan website';
		});
	});

	// Helper to handle image load errors with robust fallbacks
	const handleImageError = (e: Event) => {
		const target = e.currentTarget as HTMLImageElement;
		const domain = report?.domain || activeReport?.domain;
		if (!domain) return;

		if (!target.src.includes('google.com')) {
			target.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
		} else if (!target.src.includes('duckduckgo.com')) {
			target.src = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
		} else {
			// If all else fails, hide and show a generic fallback icon
			target.style.display = 'none';
			const container = target.parentElement;
			if (container) {
				container.innerHTML =
					'<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-globe text-neutral-400"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg></div>';
			}
		}
	};

	async function performClientScan() {
		isScanningClient = true;
		clientError = null;
		const targetUrl = data.url.startsWith('http') ? data.url : `https://${data.url}`;
		const domain = new URL(targetUrl).hostname;

		try {
			// 1. Try direct fetch (works if CORS is open)
			let html = '';
			let usedProxy = false;

			try {
				const res = await fetch(targetUrl);
				if (res.ok) {
					html = await res.text();
				} else {
					throw new Error('Direct fetch failed');
				}
			} catch (e) {
				// 2. Try CORS proxy (allorigins)
				try {
					const res = await fetch(
						`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`
					);
					const json = await res.json();
					html = json.contents;
					usedProxy = true;
				} catch (proxyErr) {
					throw new Error(
						'Target site is blocking all access methods. Try a site that allows browser crawlers.'
					);
				}
			}

			if (!html) throw new Error('Could not retrieve site content.');

			// 3. Analyze HTML using shared logic
			const analysis = analyzeHtml(html, targetUrl, domain);

			// 4. Merge with server-provided network data
			clientReport = {
				...data.networkData,
				...analysis,
				domain,
				favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
				logo: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
				redFlags: [],
				subdomains: [],
				security: [], // Would need server-side headers
				securityScore: 'B',
				performance: {
					pageSize: Math.round(new TextEncoder().encode(html).length / 1024),
					domNodes: 0, // Hard to calculate without full DOM
					compression: 'Unknown'
				},
				accessibility: {
					score: 80,
					missingAltTags: 0,
					hasAriaLabels: true
				},
				assets: [],
				updatedAt: new Date().toISOString()
			};

			if (usedProxy) {
				console.info('Fetched via proxy due to site restrictions');
			}
		} catch (err: any) {
			clientError = err.message;
			console.error('Browser-side scan failed: ' + err.message);
		} finally {
			isScanningClient = false;
		}
	}

	const handleToggleFavorite = () => {
		if (report) {
			toggleFavorite(report);
			toast.success(isFavorite ? 'Removed from favorites' : 'Added to favorites');
		}
	};

	const generateComponent = () => {
		if (!report) return '';
		const primaryColor = report.brandColors[0] || '#000000';
		const secondaryColor = report.brandColors[1] || '#ffffff';
		const font = report.fonts[0] || 'Inter';

		return `
import React from 'react';

const ${report.name.replace(/\s+/g, '')}BrandCard = () => {
  return (
    <div style={{
      fontFamily: '${font}, sans-serif',
      padding: '24px',
      borderRadius: '24px',
      background: 'white',
      border: '1px solid #e5e5e5',
      maxWidth: '400px',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
        <img src="${report.favicon}" style={{ width: '48px', height: '48px', borderRadius: '12px' }} alt="" />
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#171717' }}>${report.name}</h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#737373' }}>${report.domain}</p>
        </div>
      </div>
      <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#404040', marginBottom: '24px' }}>
        ${report.description}
      </p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button style={{
          flex: 1,
          padding: '10px',
          borderRadius: '12px',
          background: '${primaryColor}',
          color: 'white',
          border: 'none',
          fontWeight: '600',
          cursor: 'pointer'
        }}>
          Visit Site
        </button>
        <button style={{
          padding: '10px 16px',
          borderRadius: '12px',
          background: '#f5f5f5',
          color: '#171717',
          border: '1px solid #e5e5e5',
          fontWeight: '600',
          cursor: 'pointer'
        }}>
          Share
        </button>
      </div>
    </div>
  );
};

export default ${report.name.replace(/\s+/g, '')}BrandCard;
    `.trim();
	};

	const copyToClipboard = (text: string, label: string) => {
		if (!text) return;
		navigator.clipboard.writeText(text);
		toast.success(`${label} copied to clipboard`);
	};

	const copyAllDNS = () => {
		if (!report) return;
		const dnsText = report.dns.map((r: any) => `[${r.type}] ${r.value}`).join('\n');
		copyToClipboard(dnsText, 'All DNS Records');
	};

	const downloadDNS = () => {
		if (!report) return;
		const dnsText =
			`DNS Records for ${report.domain}\nGenerated by WebDNA on ${new Date().toLocaleString()}\n\n` +
			report.dns.map((r: any) => `${r.type.padEnd(5)} ${r.value}`).join('\n');
		const blob = new Blob([dnsText], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${report.domain}-dns.txt`;
		a.click();
		URL.revokeObjectURL(url);
		toast.success('DNS records exported to .txt');
	};

	const downloadColors = () => {
		if (!report) return;
		const colorText =
			`/* Brand Colors for ${report.domain} */\n:root {\n` +
			report.brandColors
				.map((c: string, i: number) => `  --color-brand-${i + 1}: ${c};`)
				.join('\n') +
			'\n}';
		const blob = new Blob([colorText], { type: 'text/css' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${report.domain}-colors.css`;
		a.click();
		URL.revokeObjectURL(url);
		toast.success('Colors exported to .css');
	};

	const downloadJSON = () => {
		const targetReport = clientReport || serverReportResolved;
		if (!targetReport) return;
		const data = JSON.stringify(targetReport, null, 2);
		const blob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${targetReport.domain}-analysis.json`;
		a.click();
		URL.revokeObjectURL(url);
		toast.success('Analysis exported to .json');
	};

	let expandedFolders = $state(new Set<string>());
	const toggleFolder = (path: string) => {
		if (expandedFolders.has(path)) {
			expandedFolders.delete(path);
		} else {
			expandedFolders.add(path);
		}
		// Svelte 5 requires re-assignment to trigger reactivity for Set mutations
		expandedFolders = new Set(expandedFolders);
	};
</script>

<svelte:head>
	{#if report}
		<title>WebDNA: {report.name}</title>
		<meta name="description" content="Website analysis tool." />

		<!-- OpenGraph / Facebook -->
		<meta property="og:type" content="website" />
		<meta property="og:title" content="WebDNA: {report.name}" />
		<meta property="og:description" content="Website analysis powered by WebDNA." />
		<meta property="og:image" content="https://webdna.xtra.wtf/og-image.png" />

		<!-- Twitter -->
		<meta property="twitter:card" content="summary_large_image" />
		<meta property="twitter:title" content="WebDNA: {report.name}" />
		<meta property="twitter:description" content="Website analysis powered by WebDNA." />
		<meta property="twitter:image" content="https://webdna.xtra.wtf/og-image.png" />
	{:else}
		<title>Inspecting...</title>
	{/if}
</svelte:head>

<svelte:window onclick={() => (isExportOpen = false)} />

{#snippet assetItem(node: any, path: string = '')}
	{@const currentPath = path ? `${path}/${node.name}` : node.name}
	{@const isExpanded = expandedFolders.has(currentPath)}

	<div class="flex flex-col">
		<button
			class="group flex w-full items-center gap-2 border border-transparent px-3 py-1.5 text-left transition-all hover:border-[var(--whois-border)] hover:bg-[var(--whois-surface-2)]"
			onclick={() => {
				if (node.type === 'folder') {
					toggleFolder(currentPath);
				} else {
					openAsset(node);
				}
			}}
		>
			{#if node.type === 'folder'}
				<div class="flex items-center gap-2">
					{#if isExpanded}
						<ChevronDown size={14} class="text-[var(--whois-accent)]" />
						<Folder size={14} class="text-[var(--whois-accent)]" />
					{:else}
						<ChevronRight size={14} class="text-[var(--whois-text-dim)]" />
						<Folder size={14} class="text-[var(--whois-text-muted)]" />
					{/if}
				</div>
				<span
					class="truncate text-[10px] font-bold tracking-wider text-[var(--whois-text)] uppercase"
					>{node.name}</span
				>
			{:else}
				<div class="flex items-center gap-2">
					<div class="w-3.5"></div>
					{#if node.fileType === 'image'}
						<FileImage size={14} class="text-purple-500" />
					{:else if node.fileType === 'script'}
						<FileCode size={14} class="text-[var(--whois-accent)]" />
					{:else if node.fileType === 'style'}
						<FileCode size={14} class="text-blue-500" />
					{:else}
						<File size={14} class="text-[var(--whois-text-dim)]" />
					{/if}
				</div>
				<span
					class="w-full truncate text-[10px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase group-hover:text-[var(--whois-accent)]"
				>
					{node.name}
				</span>
			{/if}
		</button>

		{#if node.type === 'folder' && isExpanded && node.children}
			<div class="ml-4 border-l border-[var(--whois-border)] pl-2">
				{#each node.children as child}
					{@render assetItem(child, currentPath)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

{#if isScanningClient}
	<!-- Client Scanning Loader -->
	<div class="mx-auto max-w-2xl px-4 py-20 text-center font-mono" in:fade>
		<div class="mb-8 flex justify-center">
			<div class="animate-pulse border border-[var(--whois-border)] bg-[var(--whois-surface)] p-8">
				<Loader2 size={48} class="animate-spin text-[var(--whois-accent)]" />
			</div>
		</div>
		<h1 class="mb-4 text-3xl font-black tracking-tighter text-[var(--whois-text)] uppercase">
			Fallback_Protocol_Active
		</h1>
		<p
			class="text-xs leading-relaxed font-bold tracking-[0.2em] text-[var(--whois-text-muted)] uppercase"
		>
			Request blocked. Attempting direct page scan...
		</p>
	</div>
{:else if error}
	<div class="mx-auto max-w-2xl px-4 py-20 text-center font-mono" in:fade>
		<div class="mb-8 flex justify-center">
			<div class="border border-red-900/50 bg-red-950/20 p-8">
				<InfoIcon size={48} class="text-red-500" />
			</div>
		</div>
		<h1 class="mb-4 text-3xl font-black tracking-tighter text-red-500 uppercase">
			Transmission_Failure
		</h1>
		<p
			class="mx-auto max-w-md text-xs leading-relaxed font-bold tracking-[0.2em] text-red-400 uppercase"
		>
			{error}
		</p>
		<div class="mt-12">
			<a
				href="/"
				class="border border-red-900/50 px-8 py-3 text-[10px] font-black tracking-widest text-red-500 uppercase transition-all hover:bg-red-500 hover:text-black"
				>Terminate & Revert</a
			>
		</div>
	</div>
{:else}
	{#await data.streamed.report}
		<!-- Skeleton Loader -->
		<div class="mt-2 flex flex-col space-y-2 px-2 font-mono" in:fade>
			<div class="p-px">
				<div class="border border-[var(--whois-border)] bg-[var(--whois-bg)]">
					<div class="flex min-h-[calc(100vh-8rem)] flex-col">
						<div
							class="flex items-center justify-between border-b border-[var(--whois-border)] bg-[var(--whois-surface)] px-4 py-3"
						>
							<div class="h-3 w-32 animate-pulse bg-[var(--whois-surface-2)]"></div>
							<div class="h-3 w-12 animate-pulse bg-[var(--whois-surface-2)]"></div>
						</div>
						<div class="space-y-12 p-8">
							<div class="flex items-center gap-6">
								<div
									class="h-16 w-16 animate-pulse border border-[var(--whois-border)] bg-[var(--whois-surface-2)]"
								></div>
								<div class="space-y-3">
									<div class="h-8 w-64 animate-pulse bg-[var(--whois-surface-2)]"></div>
									<div class="h-4 w-48 animate-pulse bg-[var(--whois-surface-2)]"></div>
								</div>
							</div>
							<div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
								<div class="space-y-8 lg:col-span-2">
									<div
										class="h-48 w-full animate-pulse border border-[var(--whois-border)] bg-[var(--whois-surface)]"
									></div>
									<div
										class="h-48 w-full animate-pulse border border-[var(--whois-border)] bg-[var(--whois-surface)]"
									></div>
								</div>
								<div
									class="h-96 w-full animate-pulse border border-[var(--whois-border)] bg-[var(--whois-surface)]"
								></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{:then reportValue}
		{@const activeReport = clientReport || reportValue}
		{#if activeReport}
			<div
				class="mt-2 flex flex-col space-y-2 px-2 selection:bg-[var(--whois-accent)] selection:text-[var(--whois-accent-text)]"
			>
				<div class="p-px">
					<div
						class="svgl-bg flex h-[calc(100vh-4rem)] flex-col overflow-hidden border border-[var(--whois-border)] bg-[var(--whois-bg)]"
					>
						<div class="flex h-full flex-col">
							<!-- Result Header (Sticky) -->
							<div
								class="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-[var(--whois-border)] bg-[var(--whois-surface)] px-4 py-3"
							>
								<div class="flex items-center space-x-2 text-[var(--whois-text-muted)]">
									<LayersIcon size={14} strokeWidth={2} class="text-[var(--whois-accent)]" />
									<p class="text-[8px] font-black tracking-[0.3em] uppercase">
										<span>Overview</span>
									</p>
								</div>
								<div class="flex items-center space-x-2">
									<div
										class="border border-[var(--whois-border)] px-2 py-0.5 text-[8px] font-black tracking-widest text-[var(--whois-accent)] uppercase"
									>
										Stable
									</div>
								</div>
							</div>

							<!-- Scrollable Content -->
							<div class="custom-scrollbar flex-1 overflow-y-auto p-4 md:p-6">
								<!-- Header / Overview -->
								<div
									class="mb-10 flex flex-col items-center justify-between gap-8 md:flex-row md:items-center"
								>
									<div
										class="flex flex-col items-center gap-6 text-center md:flex-row md:items-center md:text-left"
									>
										{#if !isIpOnly}
											<div
												class="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border border-[var(--whois-border)] bg-[var(--whois-surface-2)] md:h-16 md:w-16"
											>
												<img
													src={activeReport.favicon}
													alt={activeReport.name}
													class="h-12 w-12 object-contain opacity-100 transition-all md:h-10 md:w-10"
													onerror={handleImageError}
												/>
											</div>
										{/if}
										<div>
											<div class="flex flex-col items-baseline gap-3 md:flex-row">
												<h1
													class="text-5xl font-black tracking-tighter text-[var(--whois-text)] uppercase"
												>
													{activeReport.name.replace(/_/g, ' ')}
												</h1>
											</div>
											<div
												class="mt-1 flex items-center justify-center gap-2 text-[var(--whois-text-muted)] md:justify-start"
											>
												<span class="text-xl font-bold text-[var(--whois-accent)]">$</span>
												<span class="text-xl font-bold">{activeReport.domain}</span>
												{#if !isIpOnly}
													<a
														href="https://{activeReport.domain}"
														target="_blank"
														class="flex h-6 w-6 items-center justify-center border border-[var(--whois-border)] text-[var(--whois-accent)] transition-colors hover:bg-[var(--whois-surface)]"
													>
														<ExternalLinkIcon size={12} />
													</a>
												{/if}
											</div>
										</div>
									</div>

									<div class="flex w-full items-center justify-center gap-2 md:w-auto">
										<button
											onclick={handleToggleFavorite}
											class={cn(
												'flex h-9 flex-1 items-center justify-center gap-2 border px-4 text-[10px] font-bold tracking-widest uppercase transition-all md:flex-none',
												isFavorite
													? 'border-[var(--whois-accent)] bg-[var(--whois-accent)] text-[var(--whois-accent-text)]'
													: 'border-[var(--whois-border)] bg-transparent text-[var(--whois-text-muted)] hover:border-[var(--whois-accent)] hover:text-[var(--whois-text)]'
											)}
										>
											<StarIcon size={14} fill={isFavorite ? 'currentColor' : 'none'} />
											<span>{isFavorite ? 'Saved' : 'Save'}</span>
										</button>
										<div class="relative">
											<button
												onclick={(e) => {
													e.stopPropagation();
													isExportOpen = !isExportOpen;
												}}
												class={cn(
													'flex h-9 items-center gap-2 border px-4 text-[10px] font-bold tracking-widest uppercase transition-all',
													isExportOpen
														? 'border-[var(--whois-accent)] bg-[var(--whois-surface-2)] text-[var(--whois-text)]'
														: 'border-[var(--whois-border)] bg-transparent text-[var(--whois-text-muted)] hover:border-[var(--whois-accent)] hover:text-[var(--whois-text)]'
												)}
											>
												<DownloadIcon size={14} />
												<span>Export</span>
												<ChevronDown
													size={10}
													class={cn('transition-transform duration-200', isExportOpen && 'rotate-180')}
												/>
											</button>

											{#if isExportOpen}
												<div
													class="absolute right-0 top-full z-50 mt-2 w-48 border border-[var(--whois-border)] bg-[var(--whois-surface)] p-1 shadow-[0_20px_50px_rgba(0,0,0,0.3)]"
													transition:fly={{ y: 5, duration: 200 }}
													onclick={(e) => e.stopPropagation()}
												>
													<button
														onclick={() => {
															downloadJSON();
															isExportOpen = false;
														}}
														class="flex w-full items-center gap-3 px-3 py-2 text-left text-[10px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase transition-colors hover:bg-[var(--whois-surface-2)] hover:text-[var(--whois-accent)]"
													>
														<DownloadIcon size={12} />
														<span>Download JSON</span>
													</button>
													<button
														onclick={() => {
															copyToClipboard(JSON.stringify(activeReport, null, 2), 'Report JSON');
															isExportOpen = false;
														}}
														class="flex w-full items-center gap-3 px-3 py-2 text-left text-[10px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase transition-colors hover:bg-[var(--whois-surface-2)] hover:text-[var(--whois-accent)]"
													>
														<CopyIcon size={12} />
														<span>Copy JSON</span>
													</button>
													{#if !isIpOnly}
														<div class="my-1 h-px bg-[var(--whois-border)]"></div>
														<button
															onclick={() => {
																downloadColors();
																isExportOpen = false;
															}}
															class="flex w-full items-center gap-3 px-3 py-2 text-left text-[10px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase transition-colors hover:bg-[var(--whois-surface-2)] hover:text-[var(--whois-accent)]"
														>
															<Paintbrush size={12} />
															<span>Export CSS</span>
														</button>
														<button
															onclick={() => {
																downloadDNS();
																isExportOpen = false;
															}}
															class="flex w-full items-center gap-3 px-3 py-2 text-left text-[10px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase transition-colors hover:bg-[var(--whois-surface-2)] hover:text-[var(--whois-accent)]"
														>
															<Fingerprint size={12} />
															<span>Export DNS</span>
														</button>
														<button
															onclick={() => {
																copyToClipboard(generateComponent(), 'React Component');
																isExportOpen = false;
															}}
															class="flex w-full items-center gap-3 px-3 py-2 text-left text-[10px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase transition-colors hover:bg-[var(--whois-surface-2)] hover:text-[var(--whois-accent)]"
														>
															<CodeIcon size={12} />
															<span>Copy Snippet</span>
														</button>
													{/if}
												</div>
											{/if}
										</div>
										<button
											onclick={() => copyToClipboard(window.location.href, 'Report URL')}
											class="flex h-9 flex-1 items-center gap-2 bg-[var(--whois-accent-blue)] px-6 text-[10px] font-black tracking-widest text-white uppercase transition-all hover:brightness-110 active:scale-95 md:flex-none"
										>
											<ShareIcon size={14} />
											Share
										</button>
									</div>
								</div>

								<!-- Server info -->
								<div
									class="no-scrollbar mb-10 flex w-full gap-4 overflow-x-auto pb-2 md:flex-wrap md:overflow-visible md:pb-0"
								>
									<div
										class="flex min-w-[140px] shrink-0 items-center gap-3 border border-[var(--whois-border)] bg-[var(--whois-surface)] p-3"
									>
										<div
											class="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--whois-border)] bg-[var(--whois-surface-2)]"
										>
											<Globe size={14} class="text-[var(--whois-accent)]" />
										</div>
										<div>
											<span
												class="mb-0.5 block text-[10px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase"
												>IP Address</span
											>
											<p class="font-mono text-sm font-bold text-[var(--whois-text)]">
												{activeReport.ip || 'Unknown'}
											</p>
										</div>
									</div>
									<button
										onclick={() => (isProviderModalOpen = true)}
										class="group flex min-w-[160px] shrink-0 items-center gap-3 border border-[var(--whois-border)] bg-[var(--whois-surface)] p-3 text-left transition-colors hover:bg-[var(--whois-surface-2)]"
									>
										<div
											class="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--whois-border)] bg-[var(--whois-surface-2)]"
										>
											<Server size={14} class="text-[var(--whois-accent)]" />
										</div>
										<div>
											<span
												class="mb-0.5 block text-[10px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase"
												>Provider</span
											>
											<p
												class="max-w-[120px] truncate text-sm font-bold text-[var(--whois-text)]"
												title={activeReport.provider || 'Unknown'}
											>
												{activeReport.provider || 'Unknown'}
											</p>
										</div>
									</button>
									{#if !isIpOnly}
										<button
											onclick={() => (isMapOpen = true)}
											class="group flex min-w-[160px] shrink-0 items-center gap-3 border border-[var(--whois-border)] bg-[var(--whois-surface)] p-3 text-left transition-colors hover:bg-[var(--whois-surface-2)]"
										>
											<div
												class="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--whois-border)] bg-[var(--whois-surface-2)]"
											>
												<MapPin size={14} class="text-[var(--whois-accent)]" />
											</div>
											<div>
												<span
													class="mb-0.5 block text-[10px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase"
													>Location</span
												>
												<p class="text-sm font-bold text-[var(--whois-text)]">
													{activeReport.location || 'Unknown'}
												</p>
											</div>
										</button>
									{:else}
										<div
											class="flex min-w-[160px] shrink-0 items-center gap-3 border border-[var(--whois-border)] bg-[var(--whois-surface)] p-3"
										>
											<div
												class="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--whois-border)] bg-[var(--whois-surface-2)]"
											>
												<MapPin size={14} class="text-[var(--whois-accent)]" />
											</div>
											<div>
												<span
													class="mb-0.5 block text-[10px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase"
													>Location</span
												>
												<p class="text-sm font-bold text-[var(--whois-text)]">
													{activeReport.location || 'Unknown'}
												</p>
											</div>
										</div>
									{/if}
								</div>

								<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
									<!-- Left Column: Branding & Visuals -->
									<div class="space-y-6 lg:col-span-2">
										{#if !isIpOnly}
											<!-- Design DNA Summary -->
											<section
												class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-6"
											>
												<div class="mb-6 flex items-center gap-2">
													<Dna size={18} class="text-[var(--whois-accent)]" />
													<h2
														class="text-sm font-bold tracking-[0.2em] text-[var(--whois-accent)] uppercase"
													>
														Visual Style
													</h2>
												</div>

												<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
													<!-- Typography & Lang -->
													<div class="space-y-4">
														<div>
															<h3
																class="mb-4 text-[10px] font-bold tracking-[0.2em] text-[var(--whois-text-muted)] uppercase"
															>
																Typography
															</h3>
															<div class="space-y-3">
																<div
																	class="group flex items-center justify-between border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-3 py-2"
																>
																	<div class="flex flex-col">
																		<span
																			class="mb-1 text-[10px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
																			>Heading</span
																		>
																		<span
																			class="truncate text-sm font-bold text-[var(--whois-text)]"
																			style="font-family: {activeReport.fonts?.[0] || 'Inter'}"
																			>{activeReport.fonts?.[0] || 'Inter'}</span
																		>
																	</div>
																	<span
																		class="font-serif text-xl text-[var(--whois-text-muted)] transition-colors group-hover:text-[var(--whois-accent)]"
																		>Aa</span
																	>
																</div>
																<div
																	class="group flex items-center justify-between border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-3 py-2"
																>
																	<div class="flex flex-col">
																		<span
																			class="mb-1 text-[10px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
																			>Body</span
																		>
																		<span
																			class="truncate text-sm font-medium text-[var(--whois-text)]"
																			style="font-family: {activeReport.fonts?.[1] ||
																				activeReport.fonts?.[0] ||
																				'Inter'}"
																			>{activeReport.fonts?.[1] ||
																				activeReport.fonts?.[0] ||
																				'Inter'}</span
																		>
																	</div>
																	<span
																		class="font-sans text-xl text-[var(--whois-text-muted)] transition-colors group-hover:text-[var(--whois-accent)]"
																		>Aa</span
																	>
																</div>
															</div>
														</div>

														<div class="flex gap-3">
															<div
																class="flex-1 border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-3 py-2"
															>
																<span
																	class="mb-1 block text-[10px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
																	>Language</span
																>
																<div class="flex items-center gap-2">
																	<span class="text-2xl font-black text-[var(--whois-text)]"
																		>{activeReport.language || 'EN'}</span
																	>
																	<span class="text-[9px] font-medium text-[var(--whois-text-muted)]"
																		>{activeReport.language
																			? new Intl.DisplayNames(['en'], { type: 'language' }).of(
																					activeReport.language
																				)
																			: 'English'}</span
																	>
																</div>
															</div>
															<div
																class="flex-1 border border-[var(--whois-border)] bg-[var(--whois-accent-dim)] px-3 py-2"
																style="border-color: var(--whois-accent)"
															>
																<span
																	class="mb-1 block text-[10px] font-black tracking-widest text-[var(--whois-accent)] uppercase"
																	>Theme</span
																>
																<div class="flex h-7 min-w-0 items-center gap-2">
																	<div
																		class="h-4 w-4 shrink-0 border border-[var(--whois-border)]"
																		style="background-color: {activeReport.themeColor ||
																			activeReport.brandColors?.[0] ||
																			'#000'}"
																	></div>
																	<span
																		class="truncate font-mono text-xs font-black text-[var(--whois-accent)] uppercase"
																	>
																		{activeReport.themeColor || 'None'}
																	</span>
																</div>
															</div>
														</div>
													</div>

													<!-- Hierarchy & Social -->
													<div class="space-y-6">
														<div>
															<h3
																class="mb-4 text-[10px] font-bold tracking-[0.2em] text-[var(--whois-text-muted)] uppercase"
															>
																Hierarchy
															</h3>
															<div class="grid grid-cols-3 gap-3">
																<div
																	class="border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-2 py-2 text-center"
																>
																	<span
																		class="mb-1 block text-[8px] font-bold text-[var(--whois-text-muted)] uppercase"
																		>H1</span
																	>
																	<span class="text-lg font-bold text-[var(--whois-text)]"
																		>{activeReport.headings?.h1 ?? 0}</span
																	>
																</div>
																<div
																	class="border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-2 py-2 text-center"
																>
																	<span
																		class="mb-1 block text-[8px] font-bold text-[var(--whois-text-muted)] uppercase"
																		>H2</span
																	>
																	<span class="text-lg font-bold text-[var(--whois-text)]"
																		>{activeReport.headings?.h2 ?? 0}</span
																	>
																</div>
																<div
																	class="border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-2 py-2 text-center"
																>
																	<span
																		class="mb-1 block text-[8px] font-bold text-[var(--whois-text-muted)] uppercase"
																		>H3</span
																	>
																	<span class="text-lg font-bold text-[var(--whois-text)]"
																		>{activeReport.headings?.h3 ?? 0}</span
																	>
																</div>
															</div>
														</div>

														<div>
															<h3
																class="mb-4 text-[8px] font-bold tracking-[0.2em] text-[var(--whois-text-muted)] uppercase"
															>
																Socials
															</h3>
															<div class="flex flex-wrap gap-2">
																{#if activeReport.socialLinks.length > 0}
																	{#each activeReport.socialLinks as social}
																		<a
																			href={social.url}
																			target="_blank"
																			class="group flex items-center gap-1.5 border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-2 py-1.5 transition-colors hover:border-[var(--whois-accent)]"
																		>
																			<span
																				class="text-[10px] font-bold text-[var(--whois-text-muted)] group-hover:text-[var(--whois-text)]"
																				>{social.platform}</span
																			>
																			<ExternalLinkIcon
																				size={10}
																				class="text-[var(--whois-text-dim)] group-hover:text-[var(--whois-accent)]"
																			/>
																		</a>
																	{/each}
																{:else}
																	<div
																		class="px-1 py-1 text-[10px] tracking-widest text-[var(--whois-text-dim)] uppercase italic"
																	>
																		No social presence found.
																	</div>
																{/if}
															</div>
														</div>
													</div>
												</div>
											</section>

											<!-- Colors Card -->
											<section
												class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-6"
											>
												<div class="mb-6 flex items-center justify-between">
													<div class="flex items-center gap-2">
														<PaletteIcon size={18} class="text-[var(--whois-accent)]" />
														<h2
															class="text-xs font-bold tracking-[0.2em] text-[var(--whois-accent)] uppercase"
														>
															Brand Colors
														</h2>
													</div>
													<button
														class="flex items-center gap-1.5 text-[9px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase transition-colors hover:text-[var(--whois-accent)]"
														onclick={downloadColors}
													>
														<Paintbrush size={10} />
														Export CSS
													</button>
												</div>
												<div class="flex flex-wrap gap-4">
													{#each activeReport.brandColors as color}
														<button
															onclick={() => copyToClipboard(color, 'Color')}
															class="group flex items-center gap-4 border border-[var(--whois-border)] bg-[var(--whois-surface-2)] p-2 pr-4 transition-all hover:border-[var(--whois-accent)]"
														>
															<div
																class="h-10 w-10 shrink-0 border border-white/5"
																style="background-color: {color}"
															></div>
															<div class="flex flex-col items-start justify-center">
																<span
																	class="mb-1.5 text-[8px] leading-none font-black text-[var(--whois-text-muted)] uppercase"
																	>HEX</span
																>
																<span
																	class="font-mono text-sm leading-none font-bold text-[var(--whois-text)] group-hover:text-[var(--whois-accent)]"
																>
																	{color}
																</span>
															</div>
														</button>
													{/each}
												</div>
											</section>

											<!-- Tech Stack Card -->
											<section
												class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-6"
											>
												<div class="mb-6 flex items-center gap-2">
													<LayersIcon size={18} class="text-[var(--whois-accent)]" />
													<h2
														class="text-xs font-bold tracking-[0.2em] text-[var(--whois-accent)] uppercase"
													>
														Tech Stack
													</h2>
												</div>
												<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
													{#each activeReport.techStack as tech}
														<a
															href={tech.website}
															target="_blank"
															class="group flex items-center justify-between border border-[var(--whois-border)] bg-[var(--whois-surface-2)] p-3 transition-all hover:border-[var(--whois-accent)]"
														>
															<div class="flex flex-col">
																<span class="text-sm font-bold text-[var(--whois-text)]"
																	>{tech.name}</span
																>
																<span
																	class="mt-1 text-[10px] tracking-widest text-[var(--whois-text-muted)] uppercase"
																	>{tech.category}</span
																>
															</div>
															<div
																class="border border-[var(--whois-border)] px-1.5 py-0.5 text-[10px] tracking-widest text-[var(--whois-text-muted)] uppercase transition-colors group-hover:border-[var(--whois-accent)] group-hover:text-[var(--whois-accent)]"
															>
																{tech.category}
															</div>
														</a>
													{/each}
												</div>
											</section>
										{/if}

										<!-- Infrastructure & Propagation Audit -->
										<div class="mt-8">
											<WhoisScanner domain={activeReport.domain} />
										</div>

										{#if activeReport.assets && activeReport.assets.length > 0}
											<!-- Asset Explorer Card -->
											<section
												class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-6"
											>
												<div class="mb-6 flex items-center gap-2">
													<Folder size={18} class="text-[var(--whois-accent)]" />
													<h2
														class="text-xs font-bold tracking-[0.2em] text-[var(--whois-accent)] uppercase"
													>
														Files
													</h2>
												</div>
												<div
													class="custom-scrollbar max-h-[400px] overflow-y-auto border border-[var(--whois-border)] bg-[var(--whois-bg)] p-4 font-mono"
												>
													{#each activeReport.assets as node}
														{@render assetItem(node)}
													{/each}
												</div>
											</section>
										{/if}

										{#if activeReport.subdomains && activeReport.subdomains.length > 0}
											<!-- Subdomains Card -->
											<section
												class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-6"
											>
												<div class="mb-6 flex items-center gap-2">
													<MapIcon size={18} class="text-[var(--whois-accent)]" />
													<h2
														class="text-xs font-bold tracking-[0.2em] text-[var(--whois-accent)] uppercase"
													>
														Subdomains
													</h2>
												</div>
												<div class="flex flex-wrap gap-3">
													{#each activeReport.subdomains as sub}
														<a
															href={sub.url}
															target="_blank"
															class="group flex items-center gap-3 border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-3 py-1.5 transition-all hover:border-[var(--whois-accent)]"
														>
															<span class="text-xs font-bold text-[var(--whois-text)]"
																>{sub.name}</span
															>
															<div
																class="border border-[var(--whois-border)] bg-[var(--whois-accent-dim)] px-1.5 py-0.5 text-[8px] font-black tracking-widest text-[var(--whois-accent)] uppercase"
															>
																{sub.status}
															</div>
														</a>
													{/each}
												</div>
											</section>
										{/if}

										{#if !isIpOnly}
											<!-- Red Flags Card -->
											<section class="border border-red-950/30 bg-red-950/10 p-6">
												<div class="mb-6 flex items-center gap-2">
													<AlertCircle size={18} class="text-red-500" />
													<h2 class="text-xs font-bold tracking-[0.2em] text-red-500 uppercase">
														Security Warnings
													</h2>
												</div>
												<div class="space-y-3">
													{#each activeReport.redFlags as flag}
														<div
															class="flex items-start gap-4 border border-red-950/50 bg-red-950/20 p-4"
														>
															<div class="mt-0.5 shrink-0">
																<AlertCircle size={14} class="text-red-500" />
															</div>
															<p
																class="text-xs leading-relaxed font-bold tracking-wide text-red-400 uppercase"
															>
																{flag.message}
															</p>
														</div>
													{/each}
												</div>
											</section>
										{/if}
									</div>

									<!-- Right Column: Metadata & Socials -->
									<div class="space-y-6">
										{#if !isIpOnly}
											<!-- Security & Discovery Card -->
											<section
												class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-6"
											>
												<div class="mb-6 flex items-center gap-2">
													<Fingerprint size={18} class="text-[var(--whois-accent)]" />
													<h2
														class="text-xs font-bold tracking-[0.2em] text-[var(--whois-accent)] uppercase"
													>
														Domain & Email
													</h2>
												</div>

												<div class="space-y-8">
													<!-- Email Protection -->
													<div>
														<div class="mb-4 flex items-center gap-2">
															<Mail size={14} class="text-[var(--whois-text-muted)]" />
															<span
																class="text-[8px] font-bold tracking-[0.2em] text-[var(--whois-text-muted)] uppercase"
																>Email safety</span
															>
														</div>
														<div class="grid grid-cols-2 gap-3">
															<div
																class="flex items-center justify-between border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-3 py-2"
															>
																<span class="text-xs font-bold text-[var(--whois-text)]">SPF</span>
																<div
																	class="border border-[var(--whois-border)] px-1.5 py-0.5 text-[8px] tracking-widest uppercase {activeReport
																		.emailSecurity.spf
																		? 'bg-[var(--whois-accent-dim)] text-[var(--whois-accent)]'
																		: 'bg-red-500/10 text-red-500'} font-black"
																>
																	{activeReport.emailSecurity.spf ? 'OK' : 'MISSING'}
																</div>
															</div>
															<div
																class="flex items-center justify-between border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-3 py-2"
															>
																<span class="text-xs font-bold text-[var(--whois-text)]">DMARC</span>
																<div
																	class="border border-[var(--whois-border)] px-1.5 py-0.5 text-[8px] tracking-widest uppercase {activeReport
																		.emailSecurity.dmarc
																		? 'bg-[var(--whois-accent-dim)] text-[var(--whois-accent)]'
																		: 'bg-red-500/10 text-red-500'} font-black"
																>
																	{activeReport.emailSecurity.dmarc ? 'OK' : 'MISSING'}
																</div>
															</div>
														</div>
													</div>

													<!-- Crawler Config -->
													<div>
														<div class="mb-4 flex items-center gap-2">
															<SearchIcon size={14} class="text-[var(--whois-text-muted)]" />
															<span
																class="text-[8px] font-bold tracking-[0.2em] text-[var(--whois-text-muted)] uppercase"
																>Crawler setup</span
															>
														</div>
														<div class="space-y-3">
															<div
																class="flex items-center justify-between border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-3 py-2"
															>
																<div class="flex items-center gap-2">
																	<FileText size={14} class="text-[var(--whois-text-dim)]" />
																	<span class="text-xs font-bold text-[var(--whois-text)]"
																		>Robots.txt</span
																	>
																</div>
																{#if activeReport.crawling.robots}
																	<a
																		href={activeReport.crawling.robots}
																		target="_blank"
																		class="text-[10px] font-bold tracking-widest text-[var(--whois-accent)] uppercase hover:underline"
																		>View</a
																	>
																{:else}
																	<div
																		class="border border-[var(--whois-border)] bg-red-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-widest text-red-500 uppercase"
																	>
																		NULL
																	</div>
																{/if}
															</div>
															<div
																class="flex items-center justify-between border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-3 py-2"
															>
																<div class="flex items-center gap-2">
																	<MapIcon size={14} class="text-[var(--whois-text-dim)]" />
																	<span class="text-xs font-bold text-[var(--whois-text)]"
																		>Sitemap</span
																	>
																</div>
																{#if activeReport.crawling.sitemap}
																	<a
																		href={activeReport.crawling.sitemap}
																		target="_blank"
																		class="max-w-[80px] truncate text-[10px] font-bold tracking-widest text-[var(--whois-accent)] uppercase hover:underline"
																		>View</a
																	>
																{:else}
																	<div
																		class="border border-[var(--whois-border)] bg-red-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-widest text-red-500 uppercase"
																	>
																		NULL
																	</div>
																{/if}
															</div>
														</div>
													</div>
												</div>
											</section>
										{/if}

										<!-- Security Audit Card -->
										<section
											class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-6"
										>
											<div class="mb-6 flex items-center gap-2">
												<ShieldCheck size={18} class="text-[var(--whois-accent)]" />
												<h2
													class="text-xs font-bold tracking-[0.2em] text-[var(--whois-accent)] uppercase"
												>
													Safety check
												</h2>
											</div>
											<div class="space-y-3">
												{#each activeReport.security as header}
													<div
														class="flex items-center justify-between border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-3 py-2"
													>
														<span class="text-xs font-bold text-[var(--whois-text)]"
															>{header.name}</span
														>
														<div
															class="border border-[var(--whois-border)] px-1.5 py-0.5 text-[8px] tracking-widest uppercase {header.status ===
															'secure'
																? 'bg-[var(--whois-accent-dim)] text-[var(--whois-accent)]'
																: 'bg-red-500/10 text-red-500'} font-black"
														>
															{header.status === 'secure' ? 'SECURE' : 'MISSING'}
														</div>
													</div>
												{/each}
											</div>
										</section>

										{#if activeReport.ssl}
											<!-- SSL Card -->
											<section
												class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-6"
											>
												<div class="mb-6 flex items-center gap-2">
													<InfoIcon size={18} class="text-[var(--whois-accent)]" />
													<h2
														class="text-xs font-bold tracking-[0.2em] text-[var(--whois-accent)] uppercase"
													>
														SSL Certificate
													</h2>
												</div>
												<div class="space-y-5">
													<div class="flex flex-col border-l-2 border-[var(--whois-border)] pl-4">
														<span
															class="mb-1 text-[8px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
															>Issuer</span
														>
														<span class="text-xs font-bold text-[var(--whois-text)]"
															>{activeReport.ssl.issuer}</span
														>
													</div>
													<div class="flex flex-col border-l-2 border-[var(--whois-border)] pl-4">
														<span
															class="mb-1 text-[8px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
															>Valid Until</span
														>
														<span
															class="text-xs font-bold {activeReport.ssl.isExpired
																? 'text-red-500'
																: 'text-[var(--whois-text)]'}"
														>
															{new Date(activeReport.ssl.validTo).toLocaleDateString()}
														</span>
													</div>
													<div
														class="w-full border border-[var(--whois-accent)] bg-[var(--whois-accent-dim)] py-2 text-center text-[10px] font-black tracking-[0.2em] text-[var(--whois-accent)] uppercase"
													>
														{activeReport.ssl.protocol}
													</div>

													{#if activeReport.ssl.sans && activeReport.ssl.sans.length > 0}
														<div class="mt-4 border-t border-[var(--whois-border)] pt-4">
															<span
																class="mb-3 block text-center text-[8px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
																>Associated Domains (SAN)</span
															>
															<div class="flex flex-wrap justify-center gap-2">
																{#each activeReport.ssl.sans as san}
																	<span
																		class="border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-2 py-1 text-[9px] font-bold text-[var(--whois-text-muted)]"
																	>
																		{san}
																	</span>
																{/each}
															</div>
														</div>
													{/if}
												</div>
											</section>
										{/if}

										{#if activeReport.performance}
											<!-- Performance Card -->
											<section
												class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-6"
											>
												<div class="mb-6 flex items-center gap-2">
													<Gauge size={18} class="text-[var(--whois-accent)]" />
													<h2
														class="text-xs font-bold tracking-[0.2em] text-[var(--whois-accent)] uppercase"
													>
														Performance
													</h2>
												</div>
												<div class="grid grid-cols-2 gap-6">
													<div class="flex flex-col border-l border-[var(--whois-border)] pl-3">
														<span
															class="mb-1 text-[8px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
															>Page Size</span
														>
														<span class="text-xs font-bold text-[var(--whois-text)]"
															>{activeReport.performance.pageSize} KB</span
														>
													</div>
													<div class="flex flex-col border-l border-[var(--whois-border)] pl-3">
														<span
															class="mb-1 text-[8px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
															>DOM Nodes</span
														>
														<span class="text-xs font-bold text-[var(--whois-text)]"
															>{activeReport.performance.domNodes}</span
														>
													</div>
													<div
														class="col-span-2 flex flex-col border-l border-[var(--whois-border)] pl-3"
													>
														<span
															class="mb-1 text-[8px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
															>Compression</span
														>
														<span class="text-xs font-bold text-[var(--whois-accent)] uppercase"
															>{activeReport.performance.compression}</span
														>
													</div>
												</div>
											</section>
										{/if}

										{#if activeReport.accessibility}
											<!-- Accessibility Card -->
											<section
												class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-6"
											>
												<div class="mb-6 flex items-center gap-2">
													<ShieldCheck size={18} class="text-[var(--whois-accent)]" />
													<h2
														class="text-xs font-bold tracking-[0.2em] text-[var(--whois-accent)] uppercase"
													>
														Accessibility
													</h2>
												</div>
												<div class="space-y-6">
													<div class="space-y-3">
														<div class="flex items-center justify-between px-1">
															<span
																class="text-[8px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
																>Health Score</span
															>
															<span class="text-xs font-bold text-[var(--whois-accent)]"
																>{activeReport.accessibility.score}%</span
															>
														</div>
														<div class="h-1 w-full bg-[var(--whois-surface-2)]">
															<div
																class="h-full bg-[var(--whois-accent)] transition-all duration-1000"
																style="width: {activeReport.accessibility.score}%"
															></div>
														</div>
													</div>
													<div class="grid grid-cols-1 gap-3">
														<div
															class="flex items-center justify-between border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-3 py-2"
														>
															<span
																class="text-[10px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase"
																>Alt Tags</span
															>
															<span
																class="text-[10px] font-black {activeReport.accessibility
																	.missingAltTags > 0
																	? 'text-red-500'
																	: 'text-[var(--whois-accent)]'}"
															>
																{activeReport.accessibility.missingAltTags === 0
																	? 'PERFECT'
																	: `${activeReport.accessibility.missingAltTags} MISSING`}
															</span>
														</div>
														<div
															class="flex items-center justify-between border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-3 py-2"
														>
															<span
																class="text-[10px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase"
																>ARIA</span
															>
															<span
																class="text-[10px] font-black text-[var(--whois-text)] uppercase"
																>{activeReport.accessibility.hasAriaLabels
																	? 'DETECTED'
																	: 'NONE'}</span
															>
														</div>
													</div>
												</div>
											</section>
										{/if}

										<section
											class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-6"
										>
											<div class="mb-6 flex items-center gap-2">
												<InfoIcon size={18} class="text-[var(--whois-accent)]" />
												<h2
													class="text-xs font-bold tracking-[0.2em] text-[var(--whois-accent)] uppercase"
												>
													Metadata
												</h2>
											</div>
											<div class="space-y-6">
												<div class="overflow-hidden">
													<span
														class="mb-2 block text-[8px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase"
														>Meta Title</span
													>
													<p class="text-xs font-bold break-words text-[var(--whois-text)]">
														{activeReport.title}
													</p>
												</div>
												<div class="h-px bg-[var(--whois-border)]"></div>
												<div>
													<span
														class="mb-2 block text-[8px] font-bold tracking-widest text-[var(--whois-text-muted)] uppercase"
														>Description</span
													>
													<div class="relative">
														<p
															class="line-clamp-3 text-xs leading-relaxed text-[var(--whois-text-muted)]"
														>
															{activeReport.description || 'No description detected.'}
														</p>
														{#if activeReport.description && activeReport.description.length > 150}
															<button
																onclick={() => (showFullDesc = true)}
																class="mt-2 text-[9px] font-bold tracking-widest text-[var(--whois-accent)] uppercase hover:underline"
															>
																Full View
															</button>
														{/if}
														{#if !activeReport.description}
															<p
																class="text-[9px] tracking-widest text-[var(--whois-text-dim)] uppercase italic"
															>
																NULL
															</p>
														{/if}
													</div>
												</div>
											</div>
										</section>

										{#if showFullDesc}
											<div
												class="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
											>
												<button
													class="absolute inset-0 bg-black/50"
													aria-label="Close description"
													onclick={() => (showFullDesc = false)}
												></button>
												<div
													class="relative w-full max-w-xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
													role="dialog"
													aria-modal="true"
													aria-labelledby="modal-title"
													tabindex="-1"
													onclick={(e) => e.stopPropagation()}
													onkeydown={(e) => e.stopPropagation()}
												>
													<div class="mb-4 flex items-center justify-between">
														<h3 id="modal-title" class="text-base font-bold dark:text-white">
															Full Description
														</h3>
														<Button
															variant="ghost"
															size="icon"
															class="h-8 w-8"
															onclick={() => (showFullDesc = false)}
														>
															<InfoIcon size={16} />
														</Button>
													</div>
													<p class="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
														{activeReport.description}
													</p>
													<div class="mt-6 flex justify-end">
														<Button
															variant="default"
															size="sm"
															onclick={() => (showFullDesc = false)}>Close</Button
														>
													</div>
												</div>
											</div>
										{/if}

										{#if activeReport.socialLinks && activeReport.socialLinks.length > 0}
											<!-- Social Links Card -->
											<section
												class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-6"
											>
												<div class="mb-6 flex items-center gap-2">
													<ShareIcon size={18} class="text-[var(--whois-accent)]" />
													<h2
														class="text-xs font-bold tracking-[0.2em] text-[var(--whois-accent)] uppercase"
													>
														Social Links
													</h2>
												</div>
												<div class="grid grid-cols-1 gap-3">
													{#each activeReport.socialLinks as social}
														<a
															href={social.url}
															target="_blank"
															class="group flex items-center justify-between border border-[var(--whois-border)] bg-[var(--whois-surface-2)] px-3 py-2 transition-all hover:border-[var(--whois-accent)]"
														>
															<span class="text-xs font-bold text-[var(--whois-text)]"
																>{social.platform}</span
															>
															<ExternalLinkIcon
																size={12}
																class="text-[var(--whois-text-dim)] transition-colors group-hover:text-[var(--whois-accent)]"
															/>
														</a>
													{/each}
												</div>
											</section>
										{/if}

										<!-- Component Export Card -->
										<section
											class="border border-[var(--whois-accent-blue)] bg-[var(--whois-accent-blue)]/5 p-6"
										>
											<div class="mb-4 flex items-center gap-2">
												<CodeIcon size={18} class="text-[var(--whois-accent-blue)]" />
												<h2
													class="text-xs font-bold tracking-[0.2em] text-[var(--whois-accent-blue)] uppercase"
												>
													Export Component
												</h2>
											</div>
											<p
												class="mb-6 text-[10px] leading-relaxed font-bold tracking-widest text-[var(--whois-accent-blue)] uppercase opacity-70"
											>
												Export a production-ready snippet based on the discovered styles.
											</p>
											<button
												class="h-10 w-full bg-[var(--whois-accent-blue)] text-[10px] font-black tracking-[0.2em] text-white uppercase transition-all hover:brightness-110 active:scale-[0.98]"
												onclick={() => copyToClipboard(generateComponent(), 'React Component')}
											>
												Copy Snippet
											</button>
										</section>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{:else}
			<div class="mx-auto max-w-2xl px-4 py-20 text-center font-mono">
				<div class="mb-8 flex justify-center">
					<div class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-8">
						<AlertCircle size={48} class="text-[var(--whois-text-dim)]" />
					</div>
				</div>
				<h1 class="mb-4 text-3xl font-black tracking-tighter text-[var(--whois-text)] uppercase">
					Null_Response_Received
				</h1>
				<p
					class="text-xs leading-relaxed font-bold tracking-[0.2em] text-[var(--whois-text-muted)] uppercase"
				>
					The requested data stream could not be found or has been purged.
				</p>
				<div class="mt-12">
					<a
						href="/"
						class="border border-[var(--whois-border)] px-8 py-3 text-[10px] font-black tracking-widest text-[var(--whois-text)] uppercase transition-all hover:border-[var(--whois-accent)] hover:text-[var(--whois-accent)]"
						>Re-Entry</a
					>
				</div>
			</div>
		{/if}
	{:catch error}
		<div class="mx-auto max-w-2xl px-4 py-20 text-center" in:fade>
			<div class="mb-6 flex justify-center">
				<div class="border border-red-200 bg-red-100 p-4 dark:border-red-900/50 dark:bg-red-900/30">
					<InfoIcon size={40} class="text-red-600 dark:text-red-400" />
				</div>
			</div>
			<h1 class="text-2xl font-bold dark:text-white">Scan Failed</h1>
			<p class="mt-2 text-neutral-600 dark:text-neutral-400">
				{error.message || 'An unknown error occurred during the scan.'}
			</p>
			<div class="mt-8">
				<Button variant="outline" href="/">Go Back Home</Button>
			</div>
		</div>
	{/await}
{/if}

{#if isMapOpen && (report?.latitude || report?.location)}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
		onclick={() => (isMapOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (isMapOpen = false)}
		role="button"
		tabindex="0"
	>
		<div
			class="w-full max-w-2xl border border-[var(--whois-border)] bg-[var(--whois-bg)] shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="none"
			transition:fly={{ y: 10, duration: 150 }}
		>
			<div
				class="flex items-center justify-between border-b border-[var(--whois-border)] bg-[var(--whois-surface)] p-3"
			>
				<div class="flex items-center gap-2">
					<MapPin size={16} class="text-[var(--whois-accent)]" />
					<span class="text-[10px] font-black tracking-widest text-[var(--whois-accent)] uppercase"
						>Server Location</span
					>
				</div>
				<button
					onclick={() => (isMapOpen = false)}
					class="p-1 text-[var(--whois-text-muted)] transition-colors hover:text-[var(--whois-accent)]"
				>
					<CloseIcon size={16} />
				</button>
			</div>
			<div class="relative aspect-video w-full bg-[var(--whois-bg)]">
				{#if report?.latitude && report?.longitude}
					<iframe
						title="Map"
						width="100%"
						height="100%"
						frameborder="0"
						src="https://www.openstreetmap.org/export/embed.html?bbox={report.longitude -
							0.1},{report.latitude - 0.1},{report.longitude + 0.1},{report.latitude +
							0.1}&layer=mapnik&marker={report.latitude},{report.longitude}"
						class="opacity-100 brightness-[1.1] contrast-[0.9] hue-rotate-180 invert-[0.9]"
					></iframe>
				{:else}
					<div class="absolute inset-0 flex flex-col items-center justify-center gap-2">
						<Globe size={32} class="animate-pulse text-[var(--whois-text-dim)]" />
						<p
							class="text-[10px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
						>
							Map unavailable
						</p>
					</div>
				{/if}
			</div>
			<div
				class="flex items-center justify-between gap-4 border-t border-[var(--whois-border)] bg-[var(--whois-surface)] p-4"
			>
				<div class="min-w-0">
					<span
						class="mb-1 block text-[8px] font-black tracking-[0.2em] text-[var(--whois-text-muted)] uppercase"
						>Coordinates_Detected</span
					>
					<p class="truncate text-xs font-bold text-[var(--whois-text)]">
						{report?.location || 'Unknown Location'}
					</p>
				</div>
				<a
					href="https://www.openstreetmap.org/search?query={encodeURIComponent(
						report?.location || ''
					)}"
					target="_blank"
					class="flex h-10 items-center justify-center border border-[var(--whois-border)] px-4 text-[10px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase transition-all hover:border-[var(--whois-accent)] hover:text-[var(--whois-accent)]"
				>
					Explore
				</a>
			</div>
		</div>
	</div>
{/if}

{#if selectedAsset}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
		onclick={() => (selectedAsset = null)}
		onkeydown={(e) => e.key === 'Escape' && (selectedAsset = null)}
		role="button"
		tabindex="0"
	>
		<div
			class="w-full max-w-4xl border border-[var(--whois-border)] bg-[var(--whois-bg)] shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="none"
			transition:fly={{ y: 10, duration: 150 }}
		>
			<div
				class="flex items-center justify-between border-b border-[var(--whois-border)] bg-[var(--whois-surface)] p-3"
			>
				<div class="flex min-w-0 items-center gap-3">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--whois-border)] bg-[var(--whois-surface-2)]"
					>
						{#if selectedAsset.fileType === 'image'}
							<FileImage size={14} class="text-purple-500" />
						{:else if selectedAsset.fileType === 'script'}
							<FileCode size={14} class="text-[var(--whois-accent)]" />
						{:else}
							<FileText size={14} class="text-[var(--whois-text-muted)]" />
						{/if}
					</div>
					<span
						class="truncate text-[10px] font-black tracking-widest text-[var(--whois-text)] uppercase"
						>{selectedAsset.name}</span
					>
				</div>
				<div class="flex items-center gap-4">
					<a
						href={selectedAsset.url}
						target="_blank"
						class="text-[var(--whois-text-muted)] transition-colors hover:text-[var(--whois-accent)]"
					>
						<ExternalLinkIcon size={14} />
					</a>
					<button
						onclick={() => (selectedAsset = null)}
						class="text-[var(--whois-text-muted)] transition-colors hover:text-red-500"
					>
						<CloseIcon size={18} />
					</button>
				</div>
			</div>

			<div class="relative max-h-[70vh] min-h-[400px] overflow-auto bg-[var(--whois-bg)] p-0">
				{#if selectedAsset.fileType === 'image'}
					<div class="flex min-h-[400px] items-center justify-center p-8">
						{#if assetError}
							<div class="flex flex-col items-center gap-3 text-[var(--whois-text-dim)]">
								<AlertCircle size={32} />
								<span class="text-[10px] font-black tracking-widest uppercase">Asset_Missing</span>
								<p class="max-w-[200px] text-center text-[8px] tracking-wider uppercase opacity-60">
									The resource could not be retrieved from the target host.
								</p>
							</div>
						{:else}
							<img
								src={selectedAsset.url}
								alt={selectedAsset.name}
								class="h-auto max-w-full border border-[var(--whois-border)]"
								onerror={() => (assetError = true)}
							/>
						{/if}
					</div>
				{:else if isAssetLoading}
					<div class="absolute inset-0 flex flex-col items-center justify-center gap-3">
						<Loader2 size={24} class="animate-spin text-[var(--whois-accent)]" />
						<span
							class="animate-pulse text-[8px] font-black tracking-[0.2em] text-[var(--whois-text-muted)] uppercase"
							>Scanning_Source...</span
						>
					</div>
				{:else}
					<div class="p-6 font-mono text-[11px] leading-relaxed text-[var(--whois-text-muted)]">
						<pre
							class="overflow-x-auto whitespace-pre selection:bg-[var(--whois-accent)] selection:text-black">
              {@html assetContent || '// NULL_CONTENT'}
            </pre>
					</div>
				{/if}
			</div>

			<div
				class="flex items-center justify-between gap-4 border-t border-[var(--whois-border)] bg-[var(--whois-surface)] p-4"
			>
				<span
					class="flex-1 truncate px-2 text-[8px] font-black tracking-widest text-[var(--whois-text-dim)] uppercase"
				>
					{selectedAsset.url}
				</span>
				<button
					onclick={() => copyToClipboard(selectedAsset.url, 'Asset URL')}
					class="px-2 text-[9px] font-black tracking-widest text-[var(--whois-accent)] uppercase hover:underline"
				>
					Copy_Link
				</button>
			</div>
		</div>
	</div>
{/if}

{#if isProviderModalOpen && report?.provider}
	{@const provider = findProvider(report.provider)}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
		onclick={() => (isProviderModalOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (isProviderModalOpen = false)}
		role="button"
		tabindex="0"
	>
		<div
			class="w-full max-w-2xl border border-[var(--whois-border)] bg-[var(--whois-bg)] shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="none"
			transition:fly={{ y: 10, duration: 150 }}
		>
			<div
				class="flex items-center justify-between border-b border-[var(--whois-border)] bg-[var(--whois-surface)] p-4"
			>
				<div class="flex items-center gap-3">
					<div
						class="flex h-10 w-10 items-center justify-center border border-[var(--whois-border)] bg-[var(--whois-surface-2)]"
					>
						<Server size={20} class="text-[var(--whois-accent)]" />
					</div>
					<div class="flex flex-col">
						<h3 class="text-xs font-black tracking-[0.2em] text-[var(--whois-accent)] uppercase">
							Infrastructure_Node
						</h3>
						<span
							class="text-[8px] font-bold tracking-[0.2em] text-[var(--whois-text-muted)] uppercase"
							>Tracing...</span
						>
					</div>
				</div>
				<button
					onclick={() => (isProviderModalOpen = false)}
					class="text-[var(--whois-text-muted)] transition-colors hover:text-[var(--whois-accent)]"
				>
					<CloseIcon size={20} />
				</button>
			</div>

			<div class="bg-[var(--whois-bg)] p-8">
				<div class="flex flex-col items-start gap-8 md:flex-row">
					<div class="flex-1 space-y-8">
						<div>
							<div class="mb-4 flex items-center gap-3">
								<h4 class="text-3xl font-black tracking-tighter text-[var(--whois-text)] uppercase">
									{provider?.name || report.provider}
								</h4>
								{#if provider}
									<div
										class="border border-[var(--whois-border)] bg-[var(--whois-accent-dim)] px-2 py-0.5 text-[8px] font-black tracking-widest text-[var(--whois-accent)] uppercase"
									>
										{provider.category}
									</div>
								{/if}
							</div>
							<p
								class="text-xs leading-relaxed font-bold tracking-widest text-[var(--whois-text-muted)] uppercase opacity-80"
							>
								{provider?.description ||
									"This infrastructure provider is responsible for hosting and routing the website's data. Network metrics confirm their management of this server's specific IP range."}
							</p>
						</div>

						<div class="grid grid-cols-2 gap-4">
							<div class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-4">
								<span
									class="mb-2 block text-[8px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
									>Entity_ID</span
								>
								<span class="text-xs font-bold text-[var(--whois-text)] uppercase"
									>{report.provider}</span
								>
							</div>
							<div class="border border-[var(--whois-border)] bg-[var(--whois-surface)] p-4">
								<span
									class="mb-2 block text-[8px] font-black tracking-widest text-[var(--whois-text-muted)] uppercase"
									>IPV4_Endpoint</span
								>
								<span class="font-mono text-xs font-bold text-[var(--whois-accent)]"
									>{report.ip}</span
								>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div
				class="flex items-center justify-between border-t border-[var(--whois-border)] bg-[var(--whois-surface)] p-4"
			>
				<div class="flex items-center gap-2">
					<ShieldCheck size={14} class="text-[var(--whois-accent)]" />
					<span
						class="text-[8px] font-black tracking-[0.2em] text-[var(--whois-text-muted)] uppercase"
						>Verified_Stack</span
					>
				</div>
				{#if provider}
					<a
						href={provider.website}
						target="_blank"
						class="inline-flex items-center gap-2 bg-[var(--whois-accent-blue)] px-6 py-2 text-[10px] font-black tracking-widest text-white uppercase transition-all hover:brightness-110"
					>
						Visit Host
						<ExternalLinkIcon size={12} />
					</a>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	:global(body) {
		overflow: hidden !important;
		overscroll-behavior: none !important;
		background-color: var(--whois-sidebar);
	}

	/* SVGL Inspired Grid & Spotlight */
	.svgl-bg {
		background-image:
			radial-gradient(circle at 50% -20%, rgba(148, 163, 184, 0.08) 0%, transparent 60%),
			radial-gradient(circle at 50% 50%, var(--whois-bg) 0%, var(--whois-bg) 100%),
			url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1h1v1H1V1z' fill='%231a1a1a' fill-opacity='0.4'/%3E%3C/svg%3E");
		background-attachment: local;
	}

	/* Custom Scrollbar */
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
		height: 4px;
	}

	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}

	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: var(--whois-border);
	}

	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: var(--whois-accent);
	}

	/* Selection */
	:global(::selection) {
		background: var(--whois-accent);
		color: var(--whois-accent-text);
	}

	/* Typography Refinements */
	:global(h1, h2, h3, h4, h5, h6) {
		letter-spacing: -0.05em;
	}

	/* Layout Fixes */
	.grid {
		gap: 1.5rem;
	}

	section {
		transition: none;
		background-color: rgba(15, 15, 15, 0.5); /* Semi-transparent SVGL cards */
		backdrop-filter: blur(8px);
	}

	/* Animation */
	@keyframes scanline {
		0% {
			transform: translateY(-100%);
		}
		100% {
			transform: translateY(100%);
		}
	}

	.scanline {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 1px;
		background: rgba(100, 116, 139, 0.02);
		z-index: 9999;
		pointer-events: none;
		animation: scanline 15s linear infinite;
	}
</style>
