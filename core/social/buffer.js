// Client Buffer — nouvelle API GraphQL (beta, 2026).
// Doc : https://developers.buffer.com
// Auth : Authorization: Bearer <personal key from publish.buffer.com/settings/api>
// Endpoint : https://api.buffer.com/graphql

const BUFFER_GQL = "https://api.buffer.com/graphql";

export function hasBufferToken(config) {
  const envName = config.buffer?.envToken;
  if (!envName) return false;
  return !!process.env[envName];
}

function token(config) {
  const v = process.env[config.buffer.envToken];
  if (!v) throw new Error(`Missing ${config.buffer.envToken}`);
  return v;
}

async function bufferGQL(config, query, variables = {}) {
  const t = token(config);
  const res = await fetch(BUFFER_GQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Buffer GraphQL ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Buffer GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

/**
 * Récupère l'organizationId du compte authentifié.
 * Prend la 1ère organisation (en général il n'y en a qu'une).
 */
async function fetchOrganizationId(config) {
  const data = await bufferGQL(
    config,
    `query { account { organizations { id name } } }`
  );
  const orgs = data?.account?.organizations || [];
  if (orgs.length === 0) {
    throw new Error("No organization found on Buffer account");
  }
  return orgs[0].id;
}

/**
 * Liste les channels (profiles social) connectés.
 * @returns Array<{ id, name, service }>
 *   service = "instagram" | "facebook" | "tiktok" | "twitter" | "linkedin" | ...
 */
export async function listProfiles(config) {
  const orgId = await fetchOrganizationId(config);
  const data = await bufferGQL(
    config,
    `query($input: ChannelsInput!) {
      channels(input: $input) {
        id
        name
        service
      }
    }`,
    { input: { organizationId: orgId } }
  );
  return data.channels || [];
}

/**
 * Construit le metadata service-specific obligatoire pour Buffer.
 * - instagram : { type, shouldShareToFeed } requis
 * - facebook  : { type } requis
 * - tiktok    : optionnel (titre photo)
 */
function buildMetadata(service, format = "single", title) {
  // format → postType :  reel format = reel, sinon = post
  const postType = format === "reel" ? "reel" : "post";

  if (service === "instagram") {
    return { instagram: { type: postType, shouldShareToFeed: true } };
  }
  if (service === "facebook") {
    return { facebook: { type: postType } };
  }
  if (service === "tiktok") {
    return title ? { tiktok: { title } } : undefined;
  }
  return undefined;
}

/**
 * Crée un post programmé.
 * Schema: CreatePostInput requires schedulingType, channelId, assets, mode.
 * For specific datetime, use mode: customScheduled + dueAt (DateTime).
 * Instagram/Facebook also require service-specific metadata.
 * @param {object} args
 * @param {string} args.profileId - channelId Buffer
 * @param {string} args.service - "instagram"|"facebook"|"tiktok"
 * @param {string} args.format - "single"|"carousel"|"reel" (drives postType)
 * @param {string} args.text - caption complet
 * @param {string} args.imageUrl - URL publique de l'image OU vidéo (cf mediaType)
 * @param {"image"|"video"} [args.mediaType="image"]
 * @param {Date} args.scheduledAt - date de publication
 */
export async function schedulePost(config, { profileId, service, format, text, mediaUrls, imageUrl, mediaType = "image", scheduledAt, schedulingType = "automatic" }) {
  // Back-compat : si imageUrl fourni au lieu de mediaUrls, l'utiliser
  const urls = mediaUrls || (imageUrl ? [imageUrl] : []);
  if (urls.length === 0) {
    throw new Error("Buffer schedulePost requires mediaUrls or imageUrl (assets is mandatory)");
  }
  const isoDate = scheduledAt.toISOString();
  const metadata = buildMetadata(service, format, text?.slice(0, 80));
  const assets = urls.map((url) =>
    mediaType === "video" ? { video: { url } } : { image: { url } }
  );
  // schedulingType :
  //   - "automatic"    : Buffer publie tout seul à l'heure prévue
  //   - "notification" : Buffer envoie un push sur ton phone, tu finalises dans l'app native
  //                      (indispensable pour TikTok si tu veux picker un son trending)
  const input = {
    text,
    channelId: profileId,
    dueAt: isoDate,
    schedulingType,
    mode: "customScheduled",
    assets,
  };
  if (metadata) input.metadata = metadata;

  const data = await bufferGQL(
    config,
    `mutation($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post { id text dueAt }
        }
        ... on MutationError {
          message
        }
      }
    }`,
    { input }
  );
  const result = data.createPost;
  if (result?.message) {
    throw new Error(`Buffer createPost error: ${result.message}`);
  }
  return result?.post;
}
