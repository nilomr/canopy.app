# Canopy Tree Species Segmentation Viewer

An interactive web application for visualizing tree species segmentation data. Built with SvelteKit and TypeScript, this viewer allows researchers and users to explore detailed tree crown species identification data.

## Features

- **Interactive Species Selection**: Toggle between different tree species to view their segmentation masks
- **Image Comparison Slider**: Drag to show species-specific overlays
- **Crown Outline Visualization**: Display individual, manually created tree crown boundaries from shapefile data
- **Responsive Design**: Works on desktop and mobile devices
- **Accessibility**: Keyboard navigation and ARIA labels for screen readers

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- pnpm, npm, or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/nilomr/canopy.app.git
cd canopy.app

# Install dependencies
pnpm install
# or
npm install
```

### Development

Start the development server:

```bash
pnpm dev
# or
npm run dev

# Open in browser
pnpm dev -- --open
```

The application will be available at `http://localhost:5173` or the port specified in your environment.

### Data Structure

The application expects the following data structure in the `static/web_layers/` directory:

```
static/web_layers/
├── web_metadata.json          # Metadata configuration
├── rgb_background.jpg         # RGB aerial imagery
├── species_masks/             # Species segmentation masks
│   ├── oak_mask.png
│   ├── chestnut_mask.png
│   └── ...
└── crown_outlines.shp         # Shapefile with crown boundaries
```

### Configuration

The `web_metadata.json` file should contain:

```json
{
  "species_list": ["oak", "sweet chestnut", "lime spp.", ...],
  "species_colors": {
    "oak": "#8B4513",
    "sweet chestnut": "#CD853F",
    ...
  },
  "layers": {
    "rgb_background": "rgb_background.jpg",
    "species_masks": {
      "oak": "species_masks/oak_mask.png",
      ...
    },
    "crown_outlines": "crown_outlines.shp"
  },
  "web_app_config": {
    "image_bounds": [[lat_min, lon_min], [lat_max, lon_max]]
  }
}
```

## Building for Production

Create a production build:

```bash
pnpm build
# or
npm run build
```

Preview the production build:

```bash
pnpm preview
# or  
npm run preview
```

## Technology Stack

- **SvelteKit**: Full-stack web framework
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework
- **Shapefile.js**: Shapefile parsing for crown outline data
- **Phosphor Icons**: Icon library

## Usage

1. **Select Species**: Use the sidebar to select one or more tree species
2. **Compare Images**: Drag the slider to compare RGB imagery with segmentation overlays
3. **View Crown Outlines**: Toggle crown boundaries to see individual tree detection
4. **Mobile Navigation**: Use the hamburger menu on mobile devices

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test
5. Submit a pull request

## License

This project is part of ecological research at Wytham Woods. Under a MIT license, you are free to use, modify, and distribute the code with proper attribution.

## Credits

Designed by Nilo Merino Recalde

---

For questions or support, please open an issue in the repository.
