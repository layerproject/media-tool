import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { supabase } from '@/lib/supabase';
import { LogIn, Search, Image as ImageIcon, ArrowLeft, Download, Copy, Video, Camera } from 'lucide-react';
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
  Variation,
  GET_CDN_URL,
  GetCdnUrlResult
} from '@/lib/queries';
import { VariationData, SearchState } from '@/App';
import { getApiUrl, initApiUrl, DEFAULT_ORG_ID } from '@/lib/constants';

interface SearchArtworksProps {
  onNavigate?: (view: string, data?: VariationData) => void;
  searchState?: SearchState;
  onSearchStateChange?: (state: SearchState) => void;
}

/**
 * Get thumbnail URL from artwork
 * - For VIDEO: Look for variant with resolution="thumbnail" and codec="jpg"
 * - For GENERATIVE: Use the /api/thumbnail/artwork/{artwork_id}/thumbnail.jpg endpoint
 */
function getThumbnailUrl(artwork: Artwork): string | null {
  // For GENERATIVE artworks, use the API thumbnail endpoint
  if (artwork.type === 'GENERATIVE') {
    // artwork_id is the actual artwork UUID (not the organization-artwork junction id)
    return `${getApiUrl()}/api/thumbnail/artwork/${artwork.artwork_id}/thumbnail.jpg`;
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
  return `${getApiUrl()}/api/thumbnail/variation/${variationId}/thumbnail.jpg`;
}

/**
 * Get asset info for VIDEO artworks download
 * Returns the asset ID (for fetching signed CDN URL) and suggested filename
 */
function getAssetDownloadInfo(artwork: Artwork): { assetId: string; filename: string } | null {
  if (!artwork.versions?.length) return null;

  const latestVersion = artwork.versions[0];
  if (!latestVersion.assets?.length) return null;

  const asset = latestVersion.assets[0];
  if (!asset.id) return null;

  // Generate filename from artwork title and artist
  const safeTitle = artwork.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const safeArtist = (artwork.artist.name || artwork.artist.username || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  // Default to mp4 extension (CDN returns hevc-q4.mp4)
  const filename = `${safeArtist}_${safeTitle}.mp4`;

  return { assetId: asset.id, filename };
}

/**
 * Get curation URL for an artwork (used for linking to the artwork in Layer)
 */
function getArtworkCurationUrl(artwork: Artwork): string {
  const artworkType = artwork.type.toLowerCase();
  return `${getApiUrl()}/orgs/${DEFAULT_ORG_ID}/curation/${artworkType}/${artwork.artwork_id}`;
}

/**
 * Get embed URL for a variation (used in iframes)
 */
function getVariationEmbedUrl(variation: Variation): string {
  return variation.url || '';
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
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
                <ContextMenu key={variation.id}>
                  <ContextMenuTrigger asChild>
                    <div
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
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => handleVariationClick(variation)}>
                      <Video className="w-4 h-4 mr-2" />
                      Capture Video
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => {
                      if (onNavigate && variation.url) {
                        onNavigate('frames-capture', {
                          artistName: artwork.artist.name || artwork.artist.username || 'Unknown',
                          artworkTitle: artwork.title,
                          variationId: variation.id,
                          variationNumbering: variation.numbering,
                          variationUrl: variation.url
                        });
                      }
                    }}>
                      <Camera className="w-4 h-4 mr-2" />
                      Capture Frames
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => copyToClipboard(getVariationEmbedUrl(variation))}>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Embed Link
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
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

const SearchArtworks: React.FC<SearchArtworksProps> = ({ onNavigate, searchState, onSearchStateChange }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);

  // Use persisted state from parent, with local fallback
  const searchQuery = searchState?.searchQuery ?? '';
  const searchResults = (searchState?.searchResults ?? []) as Artwork[];
  const totalCount = searchState?.totalCount ?? 0;
  const selectedArtwork = (searchState?.selectedArtwork ?? null) as Artwork | null;

  // Helper to update persisted state
  const updateState = (updates: Partial<SearchState>) => {
    if (onSearchStateChange) {
      onSearchStateChange({
        searchQuery: updates.searchQuery ?? searchState?.searchQuery ?? '',
        searchResults: updates.searchResults ?? searchState?.searchResults ?? [],
        totalCount: updates.totalCount ?? searchState?.totalCount ?? 0,
        selectedArtwork: updates.selectedArtwork !== undefined ? updates.selectedArtwork : (searchState?.selectedArtwork ?? null),
      });
    }
  };

  const setSearchQuery = (query: string) => updateState({ searchQuery: query });
  const setSelectedArtwork = (artwork: Artwork | null) => updateState({ selectedArtwork: artwork });

  const fetchUserOrganizations = async () => {
    setIsLoadingOrgs(true);
    try {
      const result = await graphqlRequest<GetUserProfileResult>(GET_USER_PROFILE);
      console.log('🔍 GET_USER_PROFILE result:', JSON.stringify(result, null, 2));
      const orgs = result.Profile.me?.organizations || [];
      console.log('📋 Organizations found:', orgs.length, orgs);
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
    const initialize = async () => {
      // Initialize API URL from main process environment
      await initApiUrl();

      // Check authentication session
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

    initialize();

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
        updateState({ searchResults: [], totalCount: 0 });
        await window.electronAPI.clearApiCookie();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const performSearch = async () => {
    if (!searchQuery.trim() || !isAuthenticated || !selectedOrgId) {
      return;
    }

    setIsSearching(true);
    console.log('🔍 Searching with orgId:', selectedOrgId);
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

      updateState({
        searchResults: result.Organization.get.artworks.items,
        totalCount: result.Organization.get.artworks.count,
      });
    } catch (error) {
      console.error('Search error:', error);
      updateState({ searchResults: [], totalCount: 0 });
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  };

  const handleArtworkClick = async (artwork: Artwork) => {
    // For GENERATIVE artworks with variations, show detail view
    if (artwork.type === 'GENERATIVE' && artwork.variations.count > 0) {
      setSelectedArtwork(artwork);
      return;
    }

    // For VIDEO artworks, get signed CDN URL and download
    if (artwork.type === 'VIDEO') {
      const assetInfo = getAssetDownloadInfo(artwork);
      if (assetInfo) {
        try {
          // Fetch signed CDN URL from GraphQL
          const cdnResult = await graphqlRequest<GetCdnUrlResult>(
            GET_CDN_URL,
            { id: assetInfo.assetId }
          );

          const signedUrl = cdnResult.Asset?.getCdnUrl;
          if (!signedUrl) {
            console.error('No CDN URL returned for asset:', assetInfo.assetId);
            return;
          }

          const result = await window.electronAPI.downloadFile(signedUrl, assetInfo.filename);
          if (result.error && result.error !== 'Cancelled') {
            console.error('Download failed:', result.error);
          }
        } catch (error) {
          console.error('Failed to get CDN URL:', error);
        }
      }
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
          placeholder="Search by title or artist name... (press Enter)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
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
                const isGenerativeClickable = artwork.type === 'GENERATIVE' && artwork.variations.count > 0;
                const isVideoClickable = artwork.type === 'VIDEO' && !!getAssetDownloadInfo(artwork);
                const isClickable = isGenerativeClickable || isVideoClickable;
                return (
                  <ContextMenu key={artwork.id}>
                    <ContextMenuTrigger asChild>
                      <div
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
                          {/* Show download indicator for VIDEO artworks */}
                          {artwork.type === 'VIDEO' && isVideoClickable && (
                            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                              Download
                            </div>
                          )}
                        </div>
                        <h3 className="font-medium text-sm truncate">{artwork.title}</h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {artwork.artist.name || artwork.artist.username || 'Unknown Artist'}
                        </p>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => copyToClipboard(getArtworkCurationUrl(artwork))}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Link
                      </ContextMenuItem>
                      {isVideoClickable && (
                        <ContextMenuItem onClick={() => handleArtworkClick(artwork)}>
                          <Download className="w-4 h-4 mr-2" />
                          Download Video
                        </ContextMenuItem>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>
          </>
        ) : searchQuery.trim() ? (
          <div className="text-center text-muted-foreground py-8">
            Press Enter to search for &quot;{searchQuery}&quot;
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            Type a search term and press Enter
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchArtworks;
