import { Router } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler.js';
import { register, login, me, logout } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', asyncHandler(register));
authRouter.post('/login', asyncHandler(login));
authRouter.get('/me', asyncHandler(me));
authRouter.post('/logout', logout);
