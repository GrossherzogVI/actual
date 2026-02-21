import express from 'express';

import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

import { parseNaturalLanguageQuery } from './nl-query.js';
import { executeQuery } from './query-executor.js';

const app = express();

export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

/** POST /nl-query/ask — parse a natural language question and return results */
app.post('/ask', async (req, res) => {
  const { question, fileId } = req.body || {};

  if (!question || typeof question !== 'string') {
    res.status(400).json({ status: 'error', reason: 'question-required' });
    return;
  }

  if (!fileId) {
    res.status(400).json({ status: 'error', reason: 'file-id-required' });
    return;
  }

  try {
    const structuredQuery = await parseNaturalLanguageQuery(question, fileId);
    const result = await executeQuery(structuredQuery, fileId);

    res.json({
      status: 'ok',
      data: {
        query: structuredQuery,
        ...result,
      },
    });
  } catch (err) {
    console.error('NL query failed:', err);
    res.status(500).json({ status: 'error', reason: 'nl-query-failed' });
  }
});
