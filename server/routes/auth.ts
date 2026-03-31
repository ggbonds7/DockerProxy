import { Router } from "express";
import jwt from "jsonwebtoken";
import { CONFIG } from "../utils/config";

const router = Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  
  if (username === CONFIG.ADMIN_USERNAME && password === CONFIG.ADMIN_PASSWORD) {
    const token = jwt.sign({ username }, CONFIG.JWT_SECRET, { expiresIn: '7d' });
    res.cookie("token", token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    return res.json({ success: true, token });
  }
  
  res.status(401).json({ error: "用户名或密码错误" });
});

router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});

router.get("/me", (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
  if (!token) return res.json({ loggedIn: false });
  
  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
    res.json({ loggedIn: true, user: decoded });
  } catch (err) {
    res.json({ loggedIn: false });
  }
});

export default router;
