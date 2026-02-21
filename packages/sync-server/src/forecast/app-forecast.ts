import express from 'express';

import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

import { expandEvents, simulateForecast } from './engine.js';
import { applyMutations, compareScenarios } from './scenarios.js';

const app = express();

export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

/** GET /forecast/baseline — compute baseline forecast */
app.get('/baseline', (req, res) => {
  const fileId = req.query.fileId as string;
  if (!fileId) {
    res.status(400).json({ status: 'error', reason: 'missing-file-id' });
    return;
  }

  const horizon = Math.min(
    parseInt(String(req.query.horizon), 10) || 180,
    730,
  );
  const startingBalance =
    parseInt(String(req.query.startingBalance), 10) || 0;

  const events = expandEvents(fileId, horizon);
  const result = simulateForecast(startingBalance, events, horizon);

  res.json({ status: 'ok', data: result });
});

/** POST /forecast/scenario — compare baseline vs mutated scenario */
app.post('/scenario', (req, res) => {
  const { fileId, horizon: rawHorizon, startingBalance: rawBalance, mutations } =
    req.body || {};

  if (!fileId) {
    res.status(400).json({ status: 'error', reason: 'missing-file-id' });
    return;
  }

  if (!Array.isArray(mutations) || mutations.length === 0) {
    res.status(400).json({ status: 'error', reason: 'missing-mutations' });
    return;
  }

  const horizon = Math.min(parseInt(String(rawHorizon), 10) || 180, 730);
  const startingBalance = parseInt(String(rawBalance), 10) || 0;

  const baselineEvents = expandEvents(fileId, horizon);
  const baseline = simulateForecast(startingBalance, baselineEvents, horizon);

  const scenarioEvents = applyMutations(baselineEvents, mutations);
  const scenario = simulateForecast(startingBalance, scenarioEvents, horizon);

  const delta = compareScenarios(baseline, scenario);

  res.json({
    status: 'ok',
    data: { baseline, scenario, delta },
  });
});
