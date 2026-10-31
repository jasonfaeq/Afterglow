// Vercel function for POST /api/artwork. Same rules as the Node server; see server/artwork-api.mjs.
// Vercel's edge sets the X-Forwarded-* headers itself, so they can be trusted here.
import { createArtworkHandler } from '../../server/artwork-api.mjs';

export default createArtworkHandler({ trustProxy: true });
