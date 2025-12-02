import { gql } from 'graphql-request';

/**
 * Get the current user's profile with their organizations
 *
 * This query returns the user's organizations which can then be used
 * to query artworks for a specific organization.
 *
 * Uses Profile.me which returns ProtectedProfile with organizations.
 */
export const GET_USER_PROFILE = gql`
  query GetUserProfile {
    Profile {
      me {
        user_id
        username
        name
        organizations {
          id
          name
        }
      }
    }
  }
`;

export interface UserOrganization {
  id: string;
  name: string;
}

export interface UserProfile {
  user_id: string;
  username: string | null;
  name: string | null;
  organizations: UserOrganization[];
}

export interface GetUserProfileResult {
  Profile: {
    me: UserProfile | null;
  };
}

/**
 * Search artworks by term (searches in artwork title, description, and artist name)
 *
 * Returns:
 * - count: Total number of matching artworks
 * - items: Array of artworks with:
 *   - Basic info: id, title, description, type, created date
 *   - Artist: name and username
 *   - Versions: Latest version only with assets and their preview URLs
 *   - Variations: Count of variations
 *
 * Variables:
 * - orgId: Organization UUID (required) - get this from Profile.current.organizations
 * - searchTerm: String to search for (required)
 * - limit: Number of results to return (default: 50)
 * - offset: Number of results to skip for pagination (default: 0)
 */
export const SEARCH_ARTWORKS = gql`
  query SearchArtworks(
    $orgId: UUID!
    $searchTerm: String!
    $limit: Int = 50
    $offset: Int = 0
  ) {
    Organization {
      get(id: $orgId) {
        id
        name
        artworks(
          filter: {
            search_term: $searchTerm
            limit: $limit
            offset: $offset
            sort: CREATED
            sort_direction: DESC
          }
        ) {
          count
          items {
            id
            organization_id
            artwork_id
            type
            title
            description
            created
            default_duration
            featured
            artist {
              user_id
              username
              name
            }
            variations {
              count
            }
            versions(filter: { latest: true }) {
              id
              version_id
              title
              description
              status
              created
              assets {
                id
                type
                duration
                aspectRatio
                variants {
                  ... on AssetGenerativeVariant {
                    __typename
                    status
                    url
                    files {
                      name
                      size
                      mime
                    }
                  }
                  ... on AssetMediaVariant {
                    __typename
                    status
                    url
                    resolution
                    codec
                    width
                    height
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Get artwork by ID with full details
 */
export const GET_ARTWORK_BY_ID = gql`
  query GetArtwork($id: UUID!) {
    Artwork {
      get(id: $id) {
        id
        created
        type
        title
        description
        isPublished
        isSubmitted
        artist {
          user_id
          username
          name
        }
        votes {
          count
          up
          down
          user
        }
        variations {
          count
          items {
            id
          }
        }
        versions {
          id
          status
          title
          description
          created
          assets {
            id
            type
            variants {
              ... on AssetGenerativeVariant {
                url
              }
              ... on AssetMediaVariant {
                url
                width
                height
              }
            }
          }
        }
        organizations {
          id
          name
        }
      }
    }
  }
`;

/**
 * Get artworks by specific artist
 */
export const GET_ARTWORKS_BY_ARTIST = gql`
  query GetArtworksByArtist(
    $artist_id: UUID!
    $limit: Int = 50
    $offset: Int = 0
  ) {
    Artwork {
      search(
        filter: {
          artist_id: $artist_id
          status: PUBLISHED
          limit: $limit
          offset: $offset
          sort: CREATED
          sort_direction: DESC
        }
      ) {
        count
        items {
          id
          created
          type
          title
          description
          artist {
            user_id
            username
            name
          }
          variations {
            count
          }
          versions {
            id
            status
            title
            description
            created
            assets {
              id
              type
              variants {
                ... on AssetGenerativeVariant {
                  url
                }
                ... on AssetMediaVariant {
                  url
                  width
                  height
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Get featured artworks
 */
export const GET_FEATURED_ARTWORKS = gql`
  query GetFeaturedArtworks(
    $limit: Int = 50
    $offset: Int = 0
  ) {
    Artwork {
      search(
        filter: {
          featured: true
          status: PUBLISHED
          limit: $limit
          offset: $offset
          sort: FEATURED
          sort_direction: DESC
        }
      ) {
        count
        items {
          id
          created
          type
          title
          description
          artist {
            user_id
            username
            name
          }
          variations {
            count
          }
          versions {
            id
            status
            title
            description
            created
            assets {
              id
              type
              variants {
                ... on AssetGenerativeVariant {
                  url
                }
                ... on AssetMediaVariant {
                  url
                  width
                  height
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Get artworks by type (GENERATIVE or VIDEO)
 */
export const GET_ARTWORKS_BY_TYPE = gql`
  query GetArtworksByType(
    $type: ArtworkType!
    $limit: Int = 50
    $offset: Int = 0
  ) {
    Artwork {
      search(
        filter: {
          type: $type
          status: PUBLISHED
          limit: $limit
          offset: $offset
          sort: CREATED
          sort_direction: DESC
        }
      ) {
        count
        items {
          id
          created
          type
          title
          description
          artist {
            user_id
            username
            name
          }
          variations {
            count
          }
          versions {
            id
            status
            title
            description
            created
            assets {
              id
              type
              variants {
                ... on AssetGenerativeVariant {
                  url
                }
                ... on AssetMediaVariant {
                  url
                  width
                  height
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * TypeScript interfaces for query results
 */
export interface AssetFile {
  name: string;
  size: number;
  mime: string;
}

export interface AssetGenerativeVariant {
  __typename: 'AssetGenerativeVariant';
  status: string;
  url: string;
  files: AssetFile[];
}

export interface AssetMediaVariant {
  __typename: 'AssetMediaVariant';
  status: string;
  url: string;
  resolution: string;
  codec: string;
  width: number;
  height: number;
}

export type ArtworkAssetVariant = AssetGenerativeVariant | AssetMediaVariant;

export interface ArtworkAsset {
  id: string;
  type: string;
  mime: string;
  size: number;
  duration: number | null;
  aspectRatio: number | null;
  aspect_ratio: number | null;
  variants: ArtworkAssetVariant[];
}

export interface ArtworkVersion {
  id: string;
  version_id: string;
  title: string | null;
  description: string | null;
  status: string;
  created: string;
  published: string | null;
  submitted: string | null;
  reviewed: string | null;
  assets: ArtworkAsset[];
}

export interface Artist {
  user_id: string;
  username: string;
  name: string;
}

export interface Variations {
  count: number;
  items?: Array<{
    id: string;
    title: string;
    artist: Artist;
  }>;
}

export interface Artwork {
  id: string;
  organization_id: string;
  artwork_id: string;
  type: 'GENERATIVE' | 'VIDEO';
  title: string;
  description: string | null;
  created: string;
  default_duration: number | null;
  featured: boolean;
  directories: string[] | null;
  artist: Artist;
  variations: Variations;
  versions: ArtworkVersion[];
  votes?: {
    count: number;
    up: number;
    down: number;
    user: number;
  };
  organizations?: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
}

export interface SearchArtworksResult {
  Organization: {
    get: {
      id: string;
      name: string;
      artworks: {
        count: number;
        items: Artwork[];
      };
    };
  };
}

export interface GetArtworkResult {
  Artwork: {
    get: Artwork;
  };
}

/**
 * Get variations for a specific artwork
 * Used to display the variations grid for generative artworks
 */
export const GET_ARTWORK_VARIATIONS = gql`
  query GetArtworkVariations($artworkId: UUID!) {
    Variation {
      find(artwork_id: $artworkId) {
        count
        items {
          id
          numbering
          url
          featured
          customizor
          created
          creator {
            user_id
            username
            name
          }
        }
      }
    }
  }
`;

export interface Variation {
  id: string;
  numbering: number;
  url: string | null;
  featured: boolean;
  customizor: 'ARTIST' | 'CURATOR' | 'VIEWER';
  created: string;
  creator: {
    user_id: string;
    username: string | null;
    name: string | null;
  };
}

export interface GetArtworkVariationsResult {
  Variation: {
    find: {
      count: number;
      items: Variation[];
    };
  };
}

/**
 * Get signed CDN URL for downloading an asset
 * This returns a Bunny CDN signed URL that expires in 1 hour
 * Requires ADMIN role
 */
export const GET_CDN_URL = gql`
  query GetCdnUrl($id: UUID!) {
    Asset {
      getCdnUrl(id: $id)
    }
  }
`;

export interface GetCdnUrlResult {
  Asset: {
    getCdnUrl: string;
  };
}
