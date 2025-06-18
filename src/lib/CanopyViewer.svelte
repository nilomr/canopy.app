<script lang="ts">
	import { onMount } from 'svelte';
	import { loadCrownShapefile, projectToPixels, type CrownPolygon } from './utils/shapefileLoader';
	import Tree from 'phosphor-svelte/lib/Tree';

	// Import metadata
	let metadata: any = null;
	let selectedSpecies: Set<string> = new Set();
	let sliderValue = 75; // Changed from 50 to 75 (3/4 to the right)
	let showCrownOutlines = false;
	let imageContainer: HTMLDivElement;
	let isDragging = false;
	let isTouching = false;
	let infoCollapsed = true;
	let crownPolygons: CrownPolygon[] = [];
	let imageWidth = 0;
	let imageHeight = 0;
	let sidebarCollapsed = false;
	let mainImageLoaded = false;
	let masksLoaded = false;
	let loadingProgress = 0;
	let loadingStatus = 'Loading canopy data...';

	// Load metadata on mount
	onMount(async () => {
		try {
			loadingStatus = 'Loading metadata...';
			const response = await fetch('/web_layers/web_metadata.json');
			metadata = await response.json();
			
			// Load crown shapefile if metadata is loaded
			if (metadata) {
				loadingStatus = 'Loading crown data...';
				await loadCrownData();
				
				// Preload all images
				loadingStatus = 'Loading images...';
				await preloadAllImages();
			}
		} catch (error) {
			console.error('Failed to load metadata:', error);
			loadingStatus = 'Error loading data';
		}
	});

	// Load crown data from shapefile
	async function loadCrownData() {
		if (!metadata?.web_app_config?.image_bounds) return;
		
		const bounds = {
			minX: metadata.web_app_config.image_bounds[0][1], // minLon
			minY: metadata.web_app_config.image_bounds[0][0], // minLat
			maxX: metadata.web_app_config.image_bounds[1][1], // maxLon
			maxY: metadata.web_app_config.image_bounds[1][0]  // maxLat
		};
		
		try {
			crownPolygons = await loadCrownShapefile(`/${metadata.layers.crown_outlines}`, bounds);
		} catch (error) {
			console.error('Failed to load crown data:', error);
		}
	}

	// Preload all images (background + masks)
	async function preloadAllImages() {
		if (!metadata?.layers) return;
		
		const imagesToLoad = [];
		
		// Add background image
		if (metadata.layers.rgb_background) {
			imagesToLoad.push({
				src: `/web_layers/${metadata.layers.rgb_background}`,
				type: 'background'
			});
		}
		
		// Add all species masks
		if (metadata.layers.species_masks) {
			Object.entries(metadata.layers.species_masks).forEach(([species, maskPath]) => {
				imagesToLoad.push({
					src: `/web_layers/${maskPath}`,
					type: 'mask',
					species
				});
			});
		}
		
		let loadedCount = 0;
		const totalImages = imagesToLoad.length;
		
		const loadPromises = imagesToLoad.map(imageInfo => {
			return new Promise<void>((resolve, reject) => {
				const img = new Image();
				img.onload = () => {
					if (imageInfo.type === 'background') {
						imageWidth = img.naturalWidth;
						imageHeight = img.naturalHeight;
						mainImageLoaded = true;
					}
					loadedCount++;
					loadingProgress = Math.round((loadedCount / totalImages) * 100);
					loadingStatus = `Loading images... ${loadedCount}/${totalImages}`;
					resolve();
				};
				img.onerror = () => {
					console.error(`Failed to preload image: ${imageInfo.src}`);
					loadedCount++;
					loadingProgress = Math.round((loadedCount / totalImages) * 100);
					loadingStatus = `Loading images... ${loadedCount}/${totalImages}`;
					resolve(); // Continue even if some images fail
				};
				img.src = imageInfo.src;
			});
		});
		
		await Promise.all(loadPromises);
		masksLoaded = true;
		loadingStatus = 'Ready!';
	}

	// Helper function to get species color
	function getSpeciesColor(species: string): string {
		if (!metadata?.species_colors) return '#64B989';

		// Handle naming inconsistencies in the metadata
		const mappings: Record<string, string> = {
			'dead-understory': 'dead/understory',
			'lime spp.': 'lime',
			oak: 'ssp. oak'
		};

		const colorKey = mappings[species] || species;
		return metadata.species_colors[colorKey] || '#64B989';
	}

	// Helper function to format species names for display
	function formatSpeciesName(species: string): string {
		if (species === 'dead-understory') return 'Dead';
		return species.replace(/spp\./g, '').replace(/-/g, ' ');
	}

	// Handle species toggle
	function toggleSpecies(species: string) {
		const newSet = new Set(selectedSpecies);
		if (newSet.has(species)) {
			newSet.delete(species);
		} else {
			newSet.add(species);
		}
		selectedSpecies = newSet; // Always assign a new Set for reactivity
	}

	// Toggle all species
	function toggleAllSpecies() {
		if (metadata && selectedSpecies.size === metadata.species_list.length) {
			selectedSpecies = new Set(); // Deselect all
		} else if (metadata) {
			selectedSpecies = new Set(metadata.species_list); // Select all
		}
		selectedSpecies = selectedSpecies; // Trigger reactivity
	}

	// Check if all species are selected
	function areAllSpeciesSelected(): boolean {
		return metadata && selectedSpecies.size === metadata.species_list.length;
	}

	// Toggle info panel
	function toggleInfo() {
		infoCollapsed = !infoCollapsed;
	}

	// Handle mouse events for slider
	function handleMouseDown(event: MouseEvent) {
		// Prevent default drag behavior on images
		event.preventDefault();
		
		// Only start dragging if we're clicking on the slider handle
		const target = event.target as HTMLElement;
		if (target.closest('.slider-handle')) {
			isDragging = true;
			updateSliderFromMouse(event);
		}
	}

	function handleMouseMove(event: MouseEvent) {
		if (isDragging) {
			updateSliderFromMouse(event);
		}
	}

	function handleMouseUp() {
		isDragging = false;
	}

	// Handle touch events for slider (mobile)
	function handleTouchStart(event: TouchEvent) {
		// Only start dragging if we're touching the slider handle
		const target = event.target as HTMLElement;
		if (target.closest('.slider-handle')) {
			isTouching = true;
			updateSliderFromTouch(event);
		}
	}

	function handleTouchMove(event: TouchEvent) {
		if (isTouching) {
			updateSliderFromTouch(event);
		}
	}

	function handleTouchEnd() {
		isTouching = false;
	}

	function updateSliderFromMouse(event: MouseEvent) {
		if (!imageContainer) return;

		const rect = imageContainer.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
		sliderValue = Math.round(percentage);
	}

	function updateSliderFromTouch(event: TouchEvent) {
		if (!imageContainer || event.touches.length === 0) return;

		const rect = imageContainer.getBoundingClientRect();
		const x = event.touches[0].clientX - rect.left;
		const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
		sliderValue = Math.round(percentage);
	}

	// Add global event listeners
	onMount(() => {
		const handleGlobalMouseMove = (event: MouseEvent) => handleMouseMove(event);
		const handleGlobalMouseUp = () => handleMouseUp();
		const handleGlobalTouchMove = (event: TouchEvent) => handleTouchMove(event);
		const handleGlobalTouchEnd = () => handleTouchEnd();

		document.addEventListener('mousemove', handleGlobalMouseMove);
		document.addEventListener('mouseup', handleGlobalMouseUp);
		document.addEventListener('touchmove', handleGlobalTouchMove);
		document.addEventListener('touchend', handleGlobalTouchEnd);

		return () => {
			document.removeEventListener('mousemove', handleGlobalMouseMove);
			document.removeEventListener('mouseup', handleGlobalMouseUp);
			document.removeEventListener('touchmove', handleGlobalTouchMove);
			document.removeEventListener('touchend', handleGlobalTouchEnd);
		};
	});

	// Handle keyboard events for accessibility
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'ArrowLeft') {
			sliderValue = Math.max(0, sliderValue - 5);
			event.preventDefault();
		} else if (event.key === 'ArrowRight') {
			sliderValue = Math.min(100, sliderValue + 5);
			event.preventDefault();
		}
	}

	// Handle image load to get dimensions (fallback if preload didn't work)
	function handleImageLoad(event: Event) {
		const img = event.target as HTMLImageElement;
		if (!mainImageLoaded) {
			imageWidth = img.naturalWidth;
			imageHeight = img.naturalHeight;
			mainImageLoaded = true;
		}
	}

	// Helper function to get species from crown properties
	function getCrownSpecies(properties: any): string | null {
		// First, let's see what properties are actually available
		if (properties) {
			console.log('Crown properties:', properties);
			console.log('Property keys:', Object.keys(properties));
		}
		
		// Common property names that might contain species information
		const possibleKeys = ['Species', 'species', 'SPECIES', 'sp', 'Sp', 'SP', 'type', 'Type', 'class', 'Class'];
		
		for (const key of possibleKeys) {
			if (properties && properties[key] !== null && properties[key] !== undefined) {
				const species = properties[key].toString().toLowerCase().trim();
				console.log(`Found species in field "${key}": "${species}"`);
				
				// Normalize species names to match our metadata
				const normalizedSpecies = normalizeSpeciesName(species);
				console.log(`Normalized to: "${normalizedSpecies}"`);
				
				if (metadata.species_list.includes(normalizedSpecies)) {
					console.log(`✓ Match found: "${normalizedSpecies}"`);
					return normalizedSpecies;
				} else {
					console.log(`✗ No match for "${normalizedSpecies}" in:`, metadata.species_list);
				}
			}
		}
		
		console.log('No species field found or matched');
		return null;
	}

	// Helper function to normalize species names
	function normalizeSpeciesName(species: string): string {
		const mappings: Record<string, string> = {
			'dead': 'dead-understory',
			'understory': 'dead-understory',
			'dead/understory': 'dead-understory',
			'lime': 'lime spp.',
			'ssp. oak': 'oak',
			'oak ssp.': 'oak',
			'sweet_chestnut': 'sweet chestnut',
			'sweet-chestnut': 'sweet chestnut',
			'chestnut': 'sweet chestnut'
		};
		
		const normalized = species.toLowerCase().trim();
		return mappings[normalized] || normalized;
	}

	// Filter crown polygons by selected species
	function getFilteredCrownPolygons(): CrownPolygon[] {
		if (selectedSpecies.size === 0) {
			return [];
		}
		
		// Debug: show first few crowns to understand the data structure
		if (crownPolygons.length > 0) {
			console.log('First crown polygon properties:', crownPolygons[0].properties);
			console.log('Sample of crown properties:', crownPolygons.slice(0, 5).map(p => p.properties));
		}
		
		const filtered = crownPolygons.filter(polygon => {
			const crownSpecies = getCrownSpecies(polygon.properties);
			const isSelected = crownSpecies && selectedSpecies.has(crownSpecies);
			return isSelected;
		});
		
		console.log(`Total crowns: ${crownPolygons.length}, filtered: ${filtered.length}`);
		console.log('Selected species:', Array.from(selectedSpecies));
		return filtered;
	}

	// Helper function to lighten a hex color
	function lightenColor(hex: string, percent: number = 50): string {
		// Remove # if present
		const color = hex.replace('#', '');
		
		// Parse RGB components
		const r = parseInt(color.substr(0, 2), 16);
		const g = parseInt(color.substr(2, 2), 16);
		const b = parseInt(color.substr(4, 2), 16);
		
		// Lighten each component
		const newR = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));
		const newG = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));
		const newB = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));
		
		// Convert back to hex
		return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
	}

	// Toggle sidebar
	function toggleSidebar() {
		sidebarCollapsed = !sidebarCollapsed;
	}

	// Set initial sidebar state based on screen size
	onMount(() => {
		// Check if mobile on initial load
		if (window.innerWidth < 768) {
			sidebarCollapsed = true;
		}

		// Add resize event listener
		const handleResize = () => {
			if (window.innerWidth >= 768) {
				sidebarCollapsed = false;
			} else {
				sidebarCollapsed = true;
			}
		};

		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});
</script>

<svelte:head>
	<title>WYTHAM TREE SPECIES</title>
</svelte:head>

{#if !metadata || !mainImageLoaded || !masksLoaded}
	<div class="flex h-screen items-center justify-center bg-gray-50">
		<div class="flex flex-col items-center space-y-4 max-w-sm mx-auto p-6">
			<div class="flex items-center space-x-3">
				<div class="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900"></div>
				<span class="text-gray-700 font-medium">
					{loadingStatus}
				</span>
			</div>
			{#if loadingProgress > 0}
				<div class="w-full bg-gray-200 rounded-full h-2">
					<div 
						class="bg-gray-900 h-2 rounded-full transition-all duration-300 ease-out"
						style="width: {loadingProgress}%"
					></div>
				</div>
				<div class="text-sm text-gray-600">
					{loadingProgress}% complete
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div class="flex h-full bg-gray-50">
		<!-- Sidebar Toggle Button -->
		<button
			class="fixed top-4 left-4 z-30 md:hidden bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-lg border border-gray-200 hover:bg-white transition-all"
			onclick={toggleSidebar}
			aria-label="Toggle menu"
		>
			<svg class="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				{#if sidebarCollapsed}
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
				{:else}
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
				{/if}
			</svg>
		</button>

		<!-- Left Sidebar -->
		<div class="flex w-80 flex-col bg-white border-r border-gray-200 transition-transform duration-300 ease-in-out {sidebarCollapsed ? '-translate-x-full md:translate-x-0 md:w-0 md:border-r-0' : 'translate-x-0'} fixed md:relative z-20 h-full md:h-auto">
			<!-- Sidebar content wrapper -->
			<div class="flex flex-col h-full {sidebarCollapsed ? 'md:hidden' : ''}">
				<!-- Title -->
				<div class="flex-shrink-0 p-6 border-b border-gray-100">
					<h1 class="text-m font-bold text-gray-900 leading-tight">
						WYTHAM TREE SPECIES<br/>
						<span class="text-gray-600 font-normal">Segmentation viewer</span>
					</h1>
				</div>

				<!-- Controls Panel -->
				<div class="flex-shrink-0 p-6 border-b border-gray-100">
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-gray-700">Crown Outlines</span>
						<label class="relative inline-flex items-center cursor-pointer">
							<input
								type="checkbox"
								bind:checked={showCrownOutlines}
								class="sr-only peer"
							/>
							<div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></div>
						</label>
					</div>
				</div>

				<!-- Species Selection -->
				<div class="flex-1 overflow-y-auto">
					<div class="p-6">
						<div class="flex items-center justify-between mb-4">
							<h3 class="text-sm font-medium text-gray-700">Species</h3>
						</div>

						<!-- Enhanced Select All Button -->
						<button
							class="flex items-center justify-center w-full p-3 mb-4 rounded-lg border-2 border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all duration-150 font-medium text-sm"
							onclick={toggleAllSpecies}
						>
							<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								{#if areAllSpeciesSelected()}
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
								{:else}
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
								{/if}
							</svg>
							{areAllSpeciesSelected() ? 'Clear all species' : 'Select all species'}
						</button>

						<div class="space-y-2">
							{#each metadata.species_list as species}
								<button
									class="flex items-center w-full p-3 rounded-lg border transition-all duration-150 hover:bg-gray-50 {selectedSpecies.has(species)
										? 'border-gray-900 bg-gray-50'
										: 'border-gray-200'}"
									onclick={() => toggleSpecies(species)}
								>
									<div
										class="w-3 h-3 rounded-full mr-3 flex-shrink-0 {selectedSpecies.has(species) ? '' : 'opacity-40'}"
										style="background-color: {getSpeciesColor(species)}"
									></div>
									<span class="text-sm text-gray-900 font-medium capitalize truncate">
										{formatSpeciesName(species)}
									</span>
									{#if selectedSpecies.has(species)}
										<div class="ml-auto w-4 h-4 text-gray-900">
											<svg fill="currentColor" viewBox="0 0 20 20">
												<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
											</svg>
										</div>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				</div>

				<!-- Info Panel -->
				<div class="flex-shrink-0 border-t border-gray-100">
					<button
						class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
						onclick={toggleInfo}
					>
						<span class="text-sm font-medium text-gray-700">Dataset Information</span>
						<svg
							class="w-4 h-4 text-gray-500 transition-transform duration-200 {infoCollapsed ? '' : 'rotate-180'}"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
						</svg>
					</button>

					{#if !infoCollapsed}
						<div class="px-4 pb-4">
							<div class="text-xs text-gray-600 space-y-2">
								<div class="grid grid-cols-2 gap-4">
									<div>
										<div class="font-medium text-gray-700">Coordinate System</div>
										<div>EPSG:32630</div>
									</div>
									<div>
										<div class="font-medium text-gray-700">Species Count</div>
										<div>{metadata.species_list.length}</div>
									</div>
								</div>
								
								<div class="pt-2 border-t border-gray-100">
									<div class="font-medium text-gray-700 mb-1">Selected</div>
									<div>
										{selectedSpecies.size === 0
											? 'None'
											: selectedSpecies.size === 1
												? formatSpeciesName(Array.from(selectedSpecies)[0])
												: `${selectedSpecies.size} species`}
									</div>
								</div>

								<div class="pt-2 border-t border-gray-100">
									<div class="font-medium text-gray-700 mb-1">Controls</div>
									<div class="space-y-1">
										<div>• Select species to view segmentation</div>
										<div>• Drag to compare images</div>
										<div>• Use ←/→ keys to adjust</div>
									</div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Sidebar Overlay for Mobile -->
		{#if !sidebarCollapsed}
			<div 
				class="fixed inset-0 bg-black/20 backdrop-blur-sm z-10 md:hidden"
				onclick={toggleSidebar}
			></div>
		{/if}

		<!-- Main Image Viewer -->
		<div class="relative flex-1 bg-gray-900 {sidebarCollapsed ? 'md:ml-0' : 'md:ml-0'}">
			<div
				class="relative h-full w-full overflow-hidden"
				bind:this={imageContainer}
				onmousedown={handleMouseDown}
				ontouchstart={handleTouchStart}
				onkeydown={handleKeyDown}
				role="slider"
				tabindex="0"
				aria-label="Image comparison slider"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={sliderValue}
				style="touch-action: none;"
			>
				<!-- Background RGB Image -->
				<img
					src="/web_layers/{metadata.layers.rgb_background}"
					alt="RGB Background"
					class="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
					draggable="false"
					ondragstart={(e) => e.preventDefault()}
					onload={handleImageLoad}
				/>

				<!-- Species Overlays -->
				{#if selectedSpecies.size > 0}
					<div class="pointer-events-none absolute inset-0">
						{#each Array.from(selectedSpecies) as species}
							{#if metadata.layers.species_masks[species]}
								<div class="absolute inset-0 h-full w-full overflow-hidden">
									<img
										src="/web_layers/{metadata.layers.species_masks[species]}"
										alt="{species} mask"
										class="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
										draggable="false"
										ondragstart={(e) => e.preventDefault()}
										style="clip-path: inset(0 {100 - sliderValue}% 0 0)"
									/>
								</div>
							{/if}
						{/each}
					</div>
				{/if}

				<!-- Crown Outlines (SVG from shapefile) -->
				{#if showCrownOutlines && crownPolygons.length > 0 && imageContainer}
					{@const filteredPolygons = getFilteredCrownPolygons()}
					{#if filteredPolygons.length > 0}
						<svg
							class="pointer-events-none absolute inset-0 h-full w-full object-cover"
							viewBox="0 0 {imageWidth} {imageHeight}"
							preserveAspectRatio="xMidYMid slice"
						>
							{#each filteredPolygons as polygon}
								{@const crownSpecies = getCrownSpecies(polygon.properties)}
								<path
									d={projectToPixels(
										polygon.coordinates,
										metadata.web_app_config.image_bounds,
										imageWidth,
										imageHeight
									).map(ring =>
										ring.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ') + ' Z'
									).join(' ')
									}
									fill="none"
									stroke={crownSpecies ? lightenColor(getSpeciesColor(crownSpecies)) : "rgba(255, 255, 255, 0.8)"}
									stroke-width="2"
									vector-effect="non-scaling-stroke"
									opacity="0.8"
								/>
							{/each}
						</svg>
					{/if}
				{:else if showCrownOutlines}
					<!-- Fallback to original PNG if shapefile loading fails -->
					<img
						src="/{metadata.layers.crown_outlines}"
						alt="Crown outlines"
						class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50 select-none"
						draggable="false"
						ondragstart={(e) => e.preventDefault()}
					/>
				{/if}

				<!-- Image Comparison Slider -->
				{#if selectedSpecies.size > 0}
					<div
						class="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-white"
						style="left: {sliderValue}%"
					>
						<!-- Slider handle -->
						<div
							class="slider-handle pointer-events-auto absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 transform cursor-grab rounded-full bg-white shadow-lg border-2 border-gray-900 {isDragging || isTouching ? 'cursor-grabbing scale-110' : ''} transition-transform"
							style="touch-action: none;"
						>
						</div>
					</div>
				{/if}

				<!-- Instruction Overlay (when no species selected) -->
				{#if selectedSpecies.size === 0}
					<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
						<div class="bg-white/90 backdrop-blur-sm rounded-2xl p-8 text-center max-w-sm">
							<div class="w-12 h-12 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
								<Tree class="w-6 h-6 text-white" />
							</div>
							<h3 class="text-lg font-semibold text-gray-900 mb-2">Select Species</h3>
							<p class="text-gray-600 text-sm leading-relaxed">
								Choose one or more tree species from the sidebar to view the segmentation analysis
							</p>
						</div>
					</div>
				{/if}

				<!-- Design Credit -->
				<div class="pointer-events-none absolute bottom-2 right-2 text-xs text-white/90 font-light">
					designed by Nilo Merino Recalde
				</div>
			</div>
		</div>
	</div>
{/if}
