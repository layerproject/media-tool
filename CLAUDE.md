# Claude Project Documentation

This file contains important context about the Layer Media Tool project for AI assistants.

## Project Overview

**Layer Media Tool** is a modern Electron desktop application built with React, TypeScript, Tailwind CSS, and shadcn/ui. It's structured for scalability and professional development.

## Tech Stack

- **Electron 28** - Desktop application framework
- **React 18** - UI library with functional components and hooks
- **TypeScript 5** - Strict typing throughout the project
- **Tailwind CSS 3** - Utility-first CSS framework
- **shadcn/ui** - Pre-built accessible React components
- **lucide-react** - Icon library
- **Webpack 5** - Module bundler for renderer process
- **ESLint** - Code linting with TypeScript and React plugins
- **Inter Font** - Primary typeface via @fontsource/inter

## Project Structure

```
layer-media-tool/
├── src/
│   ├── main/                    # Main process (Node.js/Electron)
│   │   ├── main.ts             # Entry point, window management
│   │   └── preload.ts          # IPC bridge (contextBridge)
│   └── renderer/               # Renderer process (React)
│       ├── components/
│       │   ├── ui/             # shadcn/ui components
│       │   │   ├── button.tsx
│       │   │   └── separator.tsx
│       │   ├── Sidebar.tsx     # Main sidebar navigation
│       │   └── ContentArea.tsx # Main content area
│       ├── lib/
│       │   └── utils.ts        # cn() helper for class merging
│       ├── styles/
│       │   └── globals.css     # Tailwind + CSS variables
│       ├── App.tsx             # Root React component (layout)
│       ├── index.tsx           # React entry point
│       └── index.html          # HTML template
├── dist/                       # Compiled output (gitignored)
│   ├── main/                   # Compiled main process
│   └── renderer/               # Webpack bundle
├── assets/                     # Static assets
├── build/                      # Build resources (icons)
├── config/                     # Configuration files
├── tsconfig.json               # Base TypeScript config
├── tsconfig.main.json          # Main process TypeScript config
├── tailwind.config.js          # Tailwind configuration
├── webpack.config.js           # Webpack configuration
├── postcss.config.js           # PostCSS configuration
├── components.json             # shadcn/ui configuration
└── .eslintrc.json             # ESLint configuration

```

## Key Configurations

### TypeScript

- **Base config**: `tsconfig.json` - Used for renderer (React) code
  - Module: ESNext
  - JSX: react-jsx
  - Path alias: `@/*` → `./src/renderer/*`

- **Main process**: `tsconfig.main.json` - Used for Electron main process
  - Module: commonjs
  - Outputs to: `dist/main/`

### Build Process

1. **Main Process**: TypeScript → JavaScript (tsc)
   - Source: `src/main/*.ts`
   - Output: `dist/main/*.js`

2. **Renderer Process**: TypeScript + React → Bundle (Webpack)
   - Entry: `src/renderer/index.tsx`
   - Output: `dist/renderer/bundle.js`

### Important Scripts

```bash
npm start                 # Build all and run Electron
npm run dev              # Watch mode + DevTools
npm run build:all        # Build main + renderer
npm run build:main       # Compile main process only
npm run build:renderer   # Webpack build renderer only
npm run clean           # Remove dist folder
npm run lint            # ESLint check
```

## Path Aliases

The `@` alias is configured for cleaner imports:

- `@/lib/utils` → `src/renderer/lib/utils`
- `@/components/ui/button` → `src/renderer/components/ui/button`

Configured in:
- `tsconfig.json` (`baseUrl` and `paths`)
- `webpack.config.js` (`resolve.alias`)

## Styling Approach

### Tailwind CSS + shadcn/ui

- **No SASS/SCSS** - Removed in favor of Tailwind
- **Utility-first** - Use Tailwind classes for styling
- **Component library** - shadcn/ui for pre-built components
- **Font**: Inter (via @fontsource/inter)
- **Dark mode**: Supported via class strategy
- **CSS Variables**: Defined in `globals.css` for theming

### IMPORTANT: Always Use shadcn/ui Components

**CRITICAL RULE**: When building UI components, ALWAYS use shadcn/ui components instead of creating custom implementations. This ensures:
- Consistent design system across the application
- Built-in accessibility features
- Professional, polished UI out of the box
- Reduced development time

**Before creating any UI element, check if shadcn/ui has it:**
- Buttons → Use `Button` from shadcn/ui
- Inputs → Use `Input` from shadcn/ui
- Dialogs/Modals → Use `Dialog` from shadcn/ui
- Cards → Use `Card` from shadcn/ui
- Dropdowns → Use `DropdownMenu` from shadcn/ui
- Tabs → Use `Tabs` from shadcn/ui
- And many more...

**Exception**: Only create custom components when shadcn/ui doesn't provide the specific UI pattern needed.

### Adding shadcn/ui Components

```bash
npx shadcn@latest add [component-name]
```

Examples:
- `npx shadcn@latest add card`
- `npx shadcn@latest add dialog`
- `npx shadcn@latest add input`
- `npx shadcn@latest add separator`
- `npx shadcn@latest add tabs`

Browse all available components: https://ui.shadcn.com/docs/components

## Window Configuration

- Default size: 1200×800
- Minimum size: 800×600
- Resizable: Yes (by default)
- DevTools: Opens automatically with `--dev` flag

To modify: `src/main/main.ts` → `createWindow()`

## Security

- **Context Isolation**: Enabled
- **Node Integration**: Disabled in renderer
- **Preload Script**: Uses `contextBridge` for safe IPC
- **Content Security Policy**: Configured in HTML

## IPC Communication

### Adding New IPC Handlers

1. **Main process** (`main.ts`):
```typescript
ipcMain.handle('channel:name', (event, args) => {
  return result;
});
```

2. **Preload** (`preload.ts`):
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  methodName: (args) => ipcRenderer.invoke('channel:name', args)
});
```

3. **Renderer** (TypeScript):
```typescript
// Extend Window interface
interface Window {
  electronAPI: {
    methodName: (args) => Promise<result>;
  };
}

// Use it
const result = await window.electronAPI.methodName(args);
```

## Dependencies

### Production
- React ecosystem (react, react-dom)
- UI libraries (@radix-ui/react-slot, lucide-react)
- Utilities (clsx, tailwind-merge, class-variance-authority)
- Fonts (@fontsource/inter)

### Development
- Electron + electron-builder
- TypeScript + type definitions
- Webpack toolchain (webpack, loaders, plugins)
- Tailwind CSS + PostCSS
- ESLint + TypeScript/React plugins

## Building for Distribution

```bash
npm run build:mac        # macOS (DMG + ZIP)
npm run build:win        # Windows (NSIS + Portable)
npm run build:linux      # Linux (AppImage + DEB)
npm run build:all:platforms  # All platforms
```

Output directory: `dist/`

## Common Patterns

### Creating a New React Component

```tsx
import React from 'react';

interface MyComponentProps {
  title: string;
  onAction?: () => void;
}

const MyComponent: React.FC<MyComponentProps> = ({ title, onAction }) => {
  return (
    <div className="p-4 rounded-lg bg-card">
      <h2 className="text-xl font-semibold">{title}</h2>
      {onAction && (
        <button onClick={onAction} className="mt-2">
          Action
        </button>
      )}
    </div>
  );
};

export default MyComponent;
```

### Using Icons (lucide-react)

```tsx
import { Home, Settings, User } from 'lucide-react';

<Home className="w-6 h-6 text-primary" />
```

### Using shadcn/ui Components

```tsx
import { Button } from '@/components/ui/button';

<Button variant="default" size="lg">
  Click me
</Button>
```

## Application Structure

The application uses a sidebar layout with the following views:
- **Search artworks** (default active view)
- **Screen record**
- **Video Tools**
- **Image Tools**
- **Bunny CDN**

### Layout Components

- `App.tsx`: Main layout with sidebar and content area
- `Sidebar.tsx`: Left navigation sidebar (256px wide) with menu items
- `ContentArea.tsx`: Right content area that displays view-specific content

### Styling Notes

- Sidebar uses `text-sm` for menu items (small/base fonts as requested)
- Active menu item is highlighted with `bg-primary` and `text-primary-foreground`
- Inactive items use `text-muted-foreground` with hover states
- Icons are sized at `w-4 h-4` for consistency

## Known Issues / Notes

- **SASS removed**: Project originally had SASS but switched to Tailwind-only
- **Old components removed**: Original example components (Header, Footer, WelcomeSection) were removed to provide clean slate
- **Icons folder empty**: Need to add application icons for builds

## Git Workflow

The project is NOT currently a git repository. To initialize:

```bash
git init
git add .
git commit -m "Initial commit"
```

Recommended `.gitignore` is already in place covering:
- node_modules/
- dist/
- Build outputs
- OS files
- IDE configs

## Future Considerations

- [ ] Add application icons (see `build/icons/README.md`)
- [ ] Implement auto-updater
- [ ] Add logging system
- [ ] Set up testing framework (Jest/Vitest + Testing Library)
- [ ] Add CI/CD pipeline
- [ ] Implement state management (if needed - Zustand/Redux)
- [ ] Add error tracking (Sentry, etc.)

## Resources

- Electron: https://www.electronjs.org/
- React: https://react.dev/
- Tailwind CSS: https://tailwindcss.com/
- shadcn/ui: https://ui.shadcn.com/
- lucide icons: https://lucide.dev/icons
- electron-builder: https://www.electron.build/

---

**Last Updated**: November 2025
