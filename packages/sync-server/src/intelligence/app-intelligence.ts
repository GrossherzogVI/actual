import express from 'express';

import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

import { generateInsights } from './intelligence-engine.js';
import { generateRecommendations } from './recommendations.js';

const app = express();

export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

/** GET /intelligence — returns insights and recommendations for a file */
app.get('/', async (req, res) => {
  const fileId = req.query.fileId as string;

  if (!fileId) {
    res.status(400).json({ status: 'error', reason: 'file-id-required' });
    return;
  }

  try {
    const [insights, recommendations] = await Promise.all([
      generateInsights(fileId),
      generateRecommendations(fileId),
    ]);

    res.json({ status: 'ok', data: { insights, recommendations } });
  } catch (err) {
    console.error('Intelligence generation failed:', err);
    res
      .status(500)
      .json({ status: 'error', reason: 'intelligence-generation-failed' });
  }
});
