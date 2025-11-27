import React from 'react';
import { Search, Video, Image, MonitorPlay, Cloud, LogIn } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  activeItem: string;
  onItemClick: (id: string) => void;
}

const menuItems: MenuItem[] = [
  { id: 'search-artworks', label: 'Search artworks', icon: <Search className="w-4 h-4" /> },
  { id: 'screen-record', label: 'Screen record', icon: <MonitorPlay className="w-4 h-4" /> },
  { id: 'video-tools', label: 'Video Tools', icon: <Video className="w-4 h-4" /> },
  { id: 'image-tools', label: 'Image Tools', icon: <Image className="w-4 h-4" /> },
  { id: 'bunny-cdn', label: 'Bunny CDN', icon: <Cloud className="w-4 h-4" /> },
];

const authMenuItem: MenuItem = {
  id: 'sign-in-layer',
  label: 'Sign in to Layer',
  icon: <LogIn className="w-4 h-4" />
};

const Sidebar: React.FC<SidebarProps> = ({ activeItem, onItemClick }) => {
  return (
    <div className="w-64 h-screen bg-card border-r border-border flex flex-col">
      <div className="p-4">
        <h1 className="text-lg font-semibold text-foreground">Layer Media Tool</h1>
      </div>

      <Separator />

      <nav className="flex-1 p-2">
        <ul className="space-y-1">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onItemClick(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm
                  transition-colors duration-150
                  ${
                    activeItem === item.id
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }
                `}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <Separator />

      <div className="p-2">
        <button
          onClick={() => onItemClick(authMenuItem.id)}
          className={`
            w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm
            transition-colors duration-150
            ${
              activeItem === authMenuItem.id
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }
          `}
        >
          {authMenuItem.icon}
          <span>{authMenuItem.label}</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
