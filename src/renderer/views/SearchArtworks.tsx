import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { LogIn, Search, Image as ImageIcon, ArrowLeft } from 'lucide-react';
import { graphqlRequest, setAuthToken } from '@/lib/graphql';
import {
  SEARCH_ARTWORKS,
  SearchArtworksResult,
  GET_USER_PROFILE,
  GetUserProfileResult,
  UserOrganization,
  Artwork,
  AssetMediaVariant,
  GET_ARTWORK_VARIATIONS,
  GetArtworkVariationsResult,
  Variation
} from '@/lib/queries';
import { VariationData } from '@/App';

interface SearchArtworksProps {
  onNavigate?: (view: string, data?: VariationData) => void;
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

/**
 * Get thumbnail URL for a variation
 */
function getVariationThumbnailUrl(variationId: string): string {
  return `${API_URL}/api/thumbnail/variation/${variationId}/thumbnail.jpg`;
}

/**
 * Artwork Detail View - shows variations for generative artworks
 */
interface ArtworkDetailProps {
  artwork: Artwork;
  onBack: () => void;
  onNavigate?: (view: string, data?: VariationData) => void;
}

const ArtworkDetail: React.FC<ArtworkDetailProps> = ({ artwork, onBack, onNavigate }) => {
  const [variations, setVariations] = useState<Variation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [variationCount, setVariationCount] = useState(0);

  useEffect(() => {
    const fetchVariations = async () => {
      setIsLoading(true);
      try {
        const result = await graphqlRequest<GetArtworkVariationsResult>(
          GET_ARTWORK_VARIATIONS,
          { artworkId: artwork.artwork_id }
        );
        setVariations(result.Variation.find.items);
        setVariationCount(result.Variation.find.count);
      } catch (error) {
        console.error('Error fetching variations:', error);
        setVariations([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVariations();
  }, [artwork.artwork_id]);

  const handleVariationClick = (variation: Variation) => {
    if (onNavigate && variation.url) {
      onNavigate('screen-record', {
        artistName: artwork.artist.name || artwork.artist.username || 'Unknown',
        artworkTitle: artwork.title,
        variationId: variation.id,
        variationNumbering: variation.numbering,
        variationUrl: variation.url
      });
    }
  };

  const thumbnailUrl = getThumbnailUrl(artwork);

  return (
    <div className="h-full flex flex-col">
      {/* Header with back button */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Main content: 20% / 80% split */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left column: Artwork info (20%) */}
        <div className="w-1/5 flex-shrink-0 pr-6 border-r border-border">
          <div className="aspect-square bg-muted rounded-lg overflow-hidden mb-3">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={artwork.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
              </div>
            )}
          </div>
          <h2 className="font-semibold text-lg mb-1">{artwork.title}</h2>
          <p className="text-sm text-muted-foreground mb-2">
            {artwork.artist.name || artwork.artist.username || 'Unknown Artist'}
          </p>
          <p className="text-xs text-muted-foreground">
            {variationCount} variation{variationCount !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Right column: Variations list (80%) */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : variations.length > 0 ? (
            <div className="grid grid-cols-4 gap-4">
              {variations.map((variation) => (
                <div
                  key={variation.id}
                  className="group cursor-pointer"
                  onClick={() => handleVariationClick(variation)}
                >
                  <div className="aspect-square bg-muted rounded-lg overflow-hidden mb-2 relative">
                    <img
                      src={getVariationThumbnailUrl(variation.id)}
                      alt={`Variation #${variation.numbering}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        // Hide broken images
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    {/* Variation number badge */}
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      #{variation.numbering}
                    </div>
                    {/* Featured badge */}
                    {variation.featured && (
                      <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs px-2 py-1 rounded font-medium">
                        Featured
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    by {variation.creator.name || variation.creator.username || 'Unknown'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No variations found for this artwork
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SearchArtworks: React.FC<SearchArtworksProps> = ({ onNavigate }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  const [searchResults, setSearchResults] = useState<Artwork[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);

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

  const handleArtworkClick = (artwork: Artwork) => {
    // Only show detail view for GENERATIVE artworks with variations
    if (artwork.type === 'GENERATIVE' && artwork.variations.count > 0) {
      setSelectedArtwork(artwork);
    }
  };

  // Show detail view if an artwork is selected
  if (selectedArtwork) {
    return (
      <ArtworkDetail
        artwork={selectedArtwork}
        onBack={() => setSelectedArtwork(null)}
        onNavigate={onNavigate}
      />
    );
  }

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
                const isClickable = artwork.type === 'GENERATIVE' && artwork.variations.count > 0;
                return (
                  <div
                    key={artwork.id}
                    className={`group ${isClickable ? 'cursor-pointer' : ''}`}
                    onClick={() => handleArtworkClick(artwork)}
                  >
                    <div className="aspect-square bg-muted rounded-lg overflow-hidden mb-2 relative">
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt={artwork.title}
                          className={`w-full h-full object-cover ${isClickable ? 'group-hover:scale-105' : ''} transition-transform duration-200`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
                        </div>
                      )}
                      {/* Show variation count badge for generative artworks */}
                      {artwork.type === 'GENERATIVE' && artwork.variations.count > 0 && (
                        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                          {artwork.variations.count} var{artwork.variations.count !== 1 ? 's' : ''}
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
