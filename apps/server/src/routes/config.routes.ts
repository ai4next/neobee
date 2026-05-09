import { Router } from 'express';
import { getConfig, saveConfig } from '../lib/config-cache.js';

export const configRouter = Router();

configRouter.get('/', (_req, res) => {
  res.json(getConfig());
});

configRouter.put('/', (req, res) => {
  saveConfig(req.body);
  res.json({ success: true });
});