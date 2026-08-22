import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import generatorsRouter from "./generators";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(generatorsRouter);

export default router;
