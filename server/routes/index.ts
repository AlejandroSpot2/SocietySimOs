import { Router } from 'express';
import { healthRouter } from './health';
import { icpRouter } from './icp';
import { mindsRouter } from './minds';
import { simulationsRouter } from './simulations';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/icp', icpRouter);
apiRouter.use('/minds', mindsRouter);
apiRouter.use('/simulations', simulationsRouter);
