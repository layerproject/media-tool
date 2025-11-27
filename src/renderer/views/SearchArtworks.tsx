import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { LogIn, Search, Image as ImageIcon } from 'lucide-react';
import { graphqlRequest, setAuthToken } from '@/lib/graphql';
import {
  SEARCH_ARTWORKS,
  SearchArtworksResult,
  GET_USER_PROFILE,
  GetUserProfileResult,
  UserOrganization,
  Artwork,
  AssetMediaVariant
} from '@/lib/queries';

interface SearchArtworksProps {
  onNavigate?: (view: string) => void;
}

// API URL for thumbnail requests (generative artworks)
const API_URL = 'http://localhost:3000';

/**
 * Get thumbnail URL from artwork
 * - For VIDEO: Look for variant with resolution="thumbnail" and codec="jpg"
 * - For GENERATIVE: Use the /api/thumbnail/artwork/{artwork_id}/thumbnail.jpg endpoint
 */
function getThumbnailUrl(artwork: Artwork): string | null {
  // For GENERATIVE artworks, use the API thumbnail endpoint
  if (artwork.type === 'GENERATIVE') {
    // artwork_id is the actual artwork UUID (not the organization-artwork junction id)
    return `${API_URL}/api/thumbnail/artwork/${artwork.artwork_id}/thumbnail.jpg`;
  }

  // For VIDEO assets, find thumbnail variant in the variants array
  if (!artwork.versions?.length) return null;

  const latestVersion = artwork.versions[0];
  if (!latestVersion.assets?.length) return null;

  const asset = latestVersion.assets[0];
  if (!asset.variants?.length) return null;

  const thumbnailVariant = asset.variants.find(
    (v): v is AssetMediaVariant =>
      v.__typename === 'AssetMediaVariant' &&
      v.resolution === 'thumbnail' &&
      v.codec === 'jpg'
  );
  return thumbnailVariant?.url || null;
}

const SearchArtworks: React.FC<SearchArtworksProps> = ({ onNavigate }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  const [searchResults, setSearchResults] = useState<Artwork[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000000';

  const fetchUserOrganizations = async () => {
    setIsLoadingOrgs(true);
    try {
      const result = await graphqlRequest<GetUserProfileResult>(GET_USER_PROFILE);
      const orgs = result.Profile.me?.organizations || [];
      setOrganizations(orgs);

      if (orgs.length > 0 && !selectedOrgId) {
        setSelectedOrgId(orgs[0].id);
      } else if (orgs.length === 0) {
        setSelectedOrgId(DEFAULT_ORG_ID);
        setOrganizations([{ id: DEFAULT_ORG_ID, name: 'Default' }]);
      }
    } catch {
      setSelectedOrgId(DEFAULT_ORG_ID);
      setOrganizations([{ id: DEFAULT_ORG_ID, name: 'Default' }]);
    } finally {
      setIsLoadingOrgs(false);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);

      if (session?.access_token && session?.refresh_token) {
        setAuthToken(session.access_token, session.refresh_token);
        await window.electronAPI.setApiCookie(
          session.access_token,
          session.refresh_token,
          session.expires_at
        );
        await fetchUserOrganizations();
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setIsAuthenticated(!!session);

      if (session?.access_token && session?.refresh_token) {
        setAuthToken(session.access_token, session.refresh_token);
        await window.electronAPI.setApiCookie(
          session.access_token,
          session.refresh_token,
          session.expires_at
        );
        await fetchUserOrganizations();
      } else {
        setOrganizations([]);
        setSelectedOrgId(null);
        setSearchResults([]);
        await window.electronAPI.clearApiCookie();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!searchQuery.trim() || !isAuthenticated || !selectedOrgId) {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        setTotalCount(0);
      }
      return;
    }

    const searchArtworks = async () => {
      setIsSearching(true);
      try {
        const result = await graphqlRequest<SearchArtworksResult>(
          SEARCH_ARTWORKS,
          {
            orgId: selectedOrgId,
            searchTerm: searchQuery,
            limit: 50,
            offset: 0
          }
        );

        setSearchResults(result.Organization.get.artworks.items);
        setTotalCount(result.Organization.get.artworks.count);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
        setTotalCount(0);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(searchArtworks, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, isAuthenticated, selectedOrgId]);

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

      <div className="flex-1 overflow-auto">
        {isSearching ? (
          <div className="text-center text-muted-foreground py-8">
            Searching...
          </div>
        ) : searchResults.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {totalCount} result{totalCount !== 1 ? 's' : ''} found
            </p>
            <div className="grid grid-cols-4 gap-4">
              {searchResults.map((artwork) => {
                const thumbnailUrl = getThumbnailUrl(artwork);
                return (
                  <div
                    key={artwork.id}
                    className="group cursor-pointer"
                  >
                    <div className="aspect-square bg-muted rounded-lg overflow-hidden mb-2">
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt={artwork.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-medium text-sm truncate">{artwork.title}</h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {artwork.artist.name || artwork.artist.username || 'Unknown Artist'}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        ) : searchQuery.trim() ? (
          <div className="text-center text-muted-foreground py-8">
            No artworks found for &quot;{searchQuery}&quot;
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
