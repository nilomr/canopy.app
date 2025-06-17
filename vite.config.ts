import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		tailwindcss()
	],
	assetsInclude: ['**/*.json', '**/*.tif'],
	server: {
		host: '0.0.0.0',
		allowedHosts: [
			'localhost',
		],
		fs: {
			allow: ['static']
		}
	}
});
