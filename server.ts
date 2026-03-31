import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import https from "https";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

// UniFi Controller Configuration
const UNIFI_URL = process.env.UNIFI_CONTROLLER_URL;
const UNIFI_USER = process.env.UNIFI_USERNAME;
const UNIFI_PASS = process.env.UNIFI_PASSWORD;
const UNIFI_SITE = process.env.UNIFI_SITE || "default";

// Create an axios instance for UniFi with self-signed cert support if needed
const unifiAxios = axios.create({
  baseURL: UNIFI_URL,
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  withCredentials: true,
});

async function loginToUnifi() {
  try {
    const response = await unifiAxios.post("/api/auth/login", {
      username: UNIFI_USER,
      password: UNIFI_PASS,
    });
    // Axios handles cookies automatically if withCredentials is true and we reuse the instance
    return response.headers["set-cookie"];
  } catch (error) {
    console.error("UniFi Login Error:", error);
    throw error;
  }
}

async function authorizeGuest(mac: string, minutes: number = 60) {
  try {
    // Ensure we are logged in (UniFi sessions usually last a while, but we can login each time for simplicity or handle session)
    await loginToUnifi();
    
    const response = await unifiAxios.post(`/api/s/${UNIFI_SITE}/cmd/stamgr`, {
      cmd: "authorize-guest",
      mac: mac.toLowerCase(),
      minutes: minutes,
    });
    
    return response.data;
  } catch (error) {
    console.error("UniFi Authorization Error:", error);
    throw error;
  }
}

// API Routes
app.post("/api/authorize", async (req, res) => {
  const { macAddress, minutes } = req.body;
  
  if (!macAddress) {
    return res.status(400).json({ error: "MAC Address is required" });
  }

  try {
    const result = await authorizeGuest(macAddress, minutes || 60);
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to authorize guest in UniFi", details: error.message });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
