# Layer Media Tool

A robust, scalable Electron + React + TypeScript application with a well-organized structure for professional development.

## Tech Stack

- **Electron** - Desktop application framework
- **React** - UI library for building component-based interfaces
- **TypeScript** - Typed superset of JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Beautiful, accessible React components
- **lucide-react** - Icon library with 1000+ icons
- **Webpack** - Module bundler
- **ESLint** - Code linting

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
# Development mode with hot reload
npm run dev

# Build and run
npm start
```

### Building for Production

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:mac      # macOS
npm run build:win      # Windows
npm run build:linux    # Linux
```

## Project Structure

```
src/
├── main/              # Main process (Electron)
│   ├── main.ts
│   └── preload.ts
└── renderer/          # Renderer process (React)
    ├── components/    # React components
    │   └── ui/        # shadcn/ui components
    ├── lib/           # Utilities (cn helper, etc.)
    ├── styles/        # Global styles (Tailwind)
    ├── App.tsx
    └── index.tsx
```

## License

MIT
