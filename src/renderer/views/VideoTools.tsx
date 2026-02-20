import React, { useState } from 'react';
import WebAssets from './video-tools/WebAssets';
import Compress from './video-tools/Compress';

type SubView = 'web-assets' | 'compress';

interface NavItem {
  id: SubView;
  label: string;
}

const navItems: NavItem[] = [
  { id: 'web-assets', label: 'Web Assets' },
  { id: 'compress', label: 'Compress' },
];

const subViewComponents: Record<SubView, React.FC> = {
  'web-assets': WebAssets,
  'compress': Compress,
};

const VideoTools: React.FC = () => {
  const [activeSubView, setActiveSubView] = useState<SubView>('web-assets');

  const ActiveComponent = subViewComponents[activeSubView];

  return (
    <div className="h-full flex gap-6">
      {/* Left column - Sub navigation (20%) */}
      <div className="w-1/5 min-w-[160px]">
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSubView(item.id)}
              className={`
                w-full text-left px-3 py-2 rounded-md text-sm
                transition-colors duration-150
                ${
                  activeSubView === item.id
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }
              `}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Right column - Content (80%) */}
      <div className="flex-1">
        <ActiveComponent />
      </div>
    </div>
  );
};

export default VideoTools;
