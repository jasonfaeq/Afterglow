// Vercel function for GET /api/artwork/status. Says whether this deployment has Spotify credentials.
import { createArtworkHandler } from '../../server/artwork-api.mjs';

export default createArtworkHandler({ trustProxy: true });
