import React, { useState, useEffect } from 'react';
import { Search, Video, Image, MonitorPlay, Cloud, LogIn, LogOut } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';

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
  { id: 'screen-record', label: 'Artwork Capture', icon: <MonitorPlay className="w-4 h-4" /> },
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
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    // Check current session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setUserEmail(session.user.email);
      }
    };

    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) {
        setUserEmail(session.user.email);
      } else {
        setUserEmail(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    await window.electronAPI.clearTokens();
    setUserEmail(null);
  };

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
        {userEmail ? (
          <div className="space-y-2">
            <div className="px-3 py-2 text-sm">
              <p className="text-muted-foreground text-xs mb-1">Signed in as</p>
              <p className="text-foreground font-medium truncate">{userEmail}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-150"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
};

export default Sidebar;
