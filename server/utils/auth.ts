import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { CONFIG } from "./config";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ error: "未授权，请先登录" });
  }

  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token 无效或已过期" });
  }
}
