import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { LogIn } from 'lucide-react';

interface SearchArtworksProps {
  onNavigate?: (view: string) => void;
}

const SearchArtworks: React.FC<SearchArtworksProps> = ({ onNavigate }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check current session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };

    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <LogIn className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-semibold mb-2">Sign in Required</h2>
          <p className="text-muted-foreground mb-6">
            You need to sign in to your Layer account to search and access artworks.
          </p>
          <Button onClick={() => onNavigate?.('sign-in-layer')}>
            Sign in to Layer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Search Artworks</h2>
      <p className="text-muted-foreground">Search artworks content goes here...</p>
    </div>
  );
};

export default SearchArtworks;
