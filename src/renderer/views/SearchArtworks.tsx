import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { LogIn, Search } from 'lucide-react';
import { graphqlRequest, setAuthToken } from '@/lib/graphql';
import {
  SEARCH_ARTWORKS,
  SearchArtworksResult,
  GET_USER_PROFILE,
  GetUserProfileResult,
  UserOrganization
} from '@/lib/queries';

interface SearchArtworksProps {
  onNavigate?: (view: string) => void;
}

const SearchArtworks: React.FC<SearchArtworksProps> = ({ onNavigate }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);

  // Default organization ID (fallback)
  const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000000';

  // Fetch user's organizations when authenticated
  const fetchUserOrganizations = async () => {
    setIsLoadingOrgs(true);
    try {
      console.log('📋 Fetching user organizations...');
      const result = await graphqlRequest<GetUserProfileResult>(GET_USER_PROFILE);

      const orgs = result.Profile.me?.organizations || [];
      console.log('🏢 User organizations:', orgs);

      setOrganizations(orgs);

      // Auto-select first organization if available, or use default
      if (orgs.length > 0 && !selectedOrgId) {
        setSelectedOrgId(orgs[0].id);
        console.log('✅ Selected organization:', orgs[0].name, `(${orgs[0].id})`);
      } else if (orgs.length === 0) {
        // Fallback to default organization
        console.log('⚠️ No organizations found, using default:', DEFAULT_ORG_ID);
        setSelectedOrgId(DEFAULT_ORG_ID);
        setOrganizations([{ id: DEFAULT_ORG_ID, name: 'Default' }]);
      }
    } catch (error) {
      console.error('❌ Error fetching organizations:', error);
      // On error, try default org
      console.log('⚠️ Error fetching orgs, using default:', DEFAULT_ORG_ID);
      setSelectedOrgId(DEFAULT_ORG_ID);
      setOrganizations([{ id: DEFAULT_ORG_ID, name: 'Default' }]);
    } finally {
      setIsLoadingOrgs(false);
    }
  };

  useEffect(() => {
    // Check current session and set auth token
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);

      // Set auth token for GraphQL requests (include refresh token for cookie auth)
      if (session?.access_token && session?.refresh_token) {
        setAuthToken(session.access_token, session.refresh_token);
        // Also set the cookie via Electron's session API (include expires_at for Supabase SSR)
        await window.electronAPI.setApiCookie(
          session.access_token,
          session.refresh_token,
          session.expires_at
        );
        // Debug: Check if cookies were set
        const cookies = await window.electronAPI.getCookies();
        console.log('🍪 Cookies after setting:', cookies);
        console.log('🔐 Session expires_at:', session.expires_at);
        // Fetch organizations after setting auth token
        await fetchUserOrganizations();
      }
    };

    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setIsAuthenticated(!!session);

      // Update auth token when session changes (include refresh token for cookie auth)
      if (session?.access_token && session?.refresh_token) {
        setAuthToken(session.access_token, session.refresh_token);
        // Also set the cookie via Electron's session API (include expires_at for Supabase SSR)
        await window.electronAPI.setApiCookie(
          session.access_token,
          session.refresh_token,
          session.expires_at
        );
        // Fetch organizations after setting auth token
        await fetchUserOrganizations();
      } else {
        // Clear organizations and cookie on sign out
        setOrganizations([]);
        setSelectedOrgId(null);
        await window.electronAPI.clearApiCookie();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim() || !isAuthenticated || !selectedOrgId) return;

    const searchArtworks = async () => {
      setIsSearching(true);
      try {
        console.log('🔍 Searching for:', searchQuery, 'in org:', selectedOrgId);

        const result = await graphqlRequest<SearchArtworksResult>(
          SEARCH_ARTWORKS,
          {
            orgId: selectedOrgId,
            searchTerm: searchQuery,
            limit: 50,
            offset: 0
          }
        );

        console.log('✅ Search results:', result);
        console.log('🏢 Organization:', result.Organization.get.name);
        console.log('📊 Total count:', result.Organization.get.artworks.count);
        console.log('🎨 Artworks:', result.Organization.get.artworks.items);

        // Log each artwork with details
        result.Organization.get.artworks.items.forEach((artwork, index) => {
          console.log(`\n[${index + 1}] ${artwork.title}`);
          console.log('   Artist:', artwork.artist.name, `(@${artwork.artist.username})`);
          console.log('   Type:', artwork.type);
          console.log('   Variations:', artwork.variations.count);
          console.log('   Versions:', artwork.versions.length);
          if (artwork.versions.length > 0) {
            const latestVersion = artwork.versions[0];
            console.log('   Latest version assets:', latestVersion.assets.length);
            if (latestVersion.assets.length > 0 && latestVersion.assets[0].variants.length > 0) {
              console.log('   Preview URL:', latestVersion.assets[0].variants[0].url);
            }
          }
        });

      } catch (error) {
        console.error('❌ Search error:', error);
      } finally {
        setIsSearching(false);
      }
    };

    // Debounce search by 500ms
    const timeoutId = setTimeout(searchArtworks, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, isAuthenticated, selectedOrgId]);

  // Show loading state while fetching organizations
  if (isAuthenticated && isLoadingOrgs) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading organizations...</p>
        </div>
      </div>
    );
  }

  // Show message if user has no organizations
  if (isAuthenticated && organizations.length === 0 && !isLoadingOrgs) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <p className="text-muted-foreground">
            You don&apos;t have access to any organizations. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

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
    <div className="h-full flex flex-col">
      <div className="relative w-full mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
        <Input
          type="text"
          placeholder="Search by title or artist name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-6 text-base"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
          </div>
        )}
      </div>

      <div className="flex-1">
        {isSearching ? (
          <div className="text-center text-muted-foreground py-8">
            Searching...
          </div>
        ) : searchQuery.trim() ? (
          <div className="text-center text-muted-foreground py-8">
            Check the browser console for search results
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            Start typing to search for artworks
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchArtworks;
