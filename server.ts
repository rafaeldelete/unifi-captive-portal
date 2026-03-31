import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import https from "https";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { createClient } from '@supabase/supabase-js';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

dotenv.config();

const app = express();
const PORT = 3000;

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

app.use(express.json());
app.use(cookieParser());

// UniFi Controller Configuration
const UNIFI_URL = process.env.UNIFI_CONTROLLER_URL?.replace(/\/$/, ""); // Remove trailing slash
const UNIFI_USER = process.env.UNIFI_USERNAME;
const UNIFI_PASS = process.env.UNIFI_PASSWORD;
const UNIFI_SITE = process.env.UNIFI_SITE || "default";

// Create a Cookie Jar and wrap Axios
const jar = new CookieJar();
const unifiAxios = wrapper(axios.create({
  baseURL: UNIFI_URL,
  jar,
  withCredentials: true,
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}));

// Store CSRF token if provided by UniFi OS
let csrfToken: string | null = null;

async function loginToUnifi() {
  const credentials = {
    username: UNIFI_USER,
    password: UNIFI_PASS,
  };

  console.log(`Attempting UniFi login at ${UNIFI_URL} with Cookie Jar...`);

  // Try UniFi OS login first
  try {
    const response = await unifiAxios.post("/api/auth/login", credentials);
    console.log("UniFi OS Login Successful");
    
    // Capture CSRF token if present
    if (response.headers['x-csrf-token']) {
      csrfToken = response.headers['x-csrf-token'] as string;
      console.log("Captured x-csrf-token from UniFi OS");
    }
    
    return response.data;
  } catch (osError: any) {
    console.log(`UniFi OS login failed (${osError.response?.status}), trying legacy endpoint...`);
    
    // Try legacy login
    try {
      const response = await unifiAxios.post("/api/login", credentials);
      console.log("Legacy UniFi Login Successful");
      return response.data;
    } catch (legacyError: any) {
      const status = legacyError.response?.status || "No Status";
      const message = legacyError.response?.data?.meta?.msg || legacyError.message;
      console.error(`All UniFi Login attempts failed. Last error [${status}]:`, message);
      throw new Error(`UniFi Login Failed: ${message} (Status ${status})`);
    }
  }
}

async function authorizeGuest(mac: string, minutes: number = 60) {
  try {
    if (!UNIFI_URL || !UNIFI_USER || !UNIFI_PASS) {
      throw new Error("UniFi environment variables (URL, Username, Password) are not configured.");
    }

    // Always login first to ensure fresh session and cookies in the jar
    await loginToUnifi();
    
    console.log(`Authorizing MAC ${mac} for ${minutes} minutes on site ${UNIFI_SITE}...`);
    
    const headers: any = {};
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }

    const response = await unifiAxios.post(`/api/s/${UNIFI_SITE}/cmd/stamgr`, {
      cmd: "authorize-guest",
      mac: mac.toLowerCase(),
      minutes: minutes,
    }, { headers });
    
    console.log("UniFi Authorization Response:", JSON.stringify(response.data));
    return response.data;
  } catch (error: any) {
    const status = error.response?.status;
    const message = error.response?.data?.meta?.msg || error.message;
    console.error(`UniFi Authorization Error [${status}]:`, message);
    throw new Error(`UniFi Authorization Failed: ${message}`);
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
