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
import bcrypt from "bcryptjs";

dotenv.config();

// Allow self-signed certificates for UniFi Controller
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const PORT = 3000;

// Admin Default Credentials
const DEFAULT_ADMIN_USER = "admin";
const DEFAULT_ADMIN_PASS = "admin123";

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

app.use(express.json());
app.use(cookieParser());

// Helper to get admin password from Supabase or default
async function getAdminPassword() {
  try {
    const { data, error } = await supabase
      .from('admin_config')
      .select('password_hash')
      .eq('key', 'admin_password')
      .maybeSingle();

    if (error || !data) {
      // If not found, use default and potentially initialize it
      const hash = await bcrypt.hash(DEFAULT_ADMIN_PASS, 10);
      return hash;
    }
    return data.password_hash;
  } catch (err) {
    return await bcrypt.hash(DEFAULT_ADMIN_PASS, 10);
  }
}

// Middleware to protect admin routes
async function authenticateAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.cookies.admin_token;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Simple verification: token is just a hash of the current password for this demo
    // In a real app, use JWT or session store
    const currentHash = await getAdminPassword();
    if (token === currentHash) {
      next();
    } else {
      res.status(401).json({ error: "Invalid session" });
    }
  } catch (err) {
    res.status(401).json({ error: "Unauthorized" });
  }
}

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
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}));

// Store CSRF token and UniFi OS flag
let csrfToken: string | null = null;
let isUnifiOs: boolean = false;

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
    isUnifiOs = true;
    
    // Capture CSRF token if present
    if (response.headers['x-csrf-token']) {
      csrfToken = response.headers['x-csrf-token'] as string;
      console.log("Captured x-csrf-token from UniFi OS");
    }
    
    return response.data;
  } catch (osError: any) {
    console.log(`UniFi OS login failed (${osError.response?.status}), trying legacy endpoint...`);
    isUnifiOs = false;
    
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

// Helper to format MAC address (ensure colons)
function formatMac(mac: string): string {
  const cleanMac = mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (cleanMac.length !== 12) return mac.toLowerCase();
  return cleanMac.match(/.{1,2}/g)?.join(':') || mac.toLowerCase();
}

async function authorizeGuest(mac: string, minutes: number = 60) {
  try {
    if (!UNIFI_URL || !UNIFI_USER || !UNIFI_PASS) {
      throw new Error("UniFi environment variables (URL, Username, Password) are not configured.");
    }

    // Always login first to ensure fresh session and cookies in the jar
    await loginToUnifi();
    
    const formattedMac = formatMac(mac);
    console.log(`Authorizing MAC ${formattedMac} for ${minutes} minutes on site ${UNIFI_SITE}...`);
    
    const headers: any = {};
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }

    // Try both paths if it's UniFi OS, or just the direct path if it's legacy
    const pathsToTry = isUnifiOs 
      ? [`/proxy/network/api/s/${UNIFI_SITE}/cmd/stamgr`, `/api/s/${UNIFI_SITE}/cmd/stamgr`]
      : [`/api/s/${UNIFI_SITE}/cmd/stamgr`];

    let lastError: any = null;
    for (const endpoint of pathsToTry) {
      try {
        console.log(`Trying UniFi authorization at: ${endpoint}`);
        const response = await unifiAxios.post(endpoint, {
          cmd: "authorize-guest",
          mac: formattedMac,
          minutes: minutes,
        }, { headers });
        
        console.log("UniFi Authorization Response:", JSON.stringify(response.data));
        
        if (response.data && response.data.meta && response.data.meta.rc === "ok") {
          console.log("UniFi Authorization SUCCESSFUL");
          return response.data;
        } else {
          const msg = response.data?.meta?.msg || "Unknown error from UniFi";
          console.warn(`UniFi returned non-ok status at ${endpoint}: ${msg}`);
          lastError = new Error(msg);
        }
      } catch (err: any) {
        console.warn(`Failed authorization attempt at ${endpoint}:`, err.message);
        lastError = err;
      }
    }

    throw lastError || new Error("All authorization attempts failed");
  } catch (error: any) {
    const status = error.response?.status;
    const message = error.response?.data?.meta?.msg || error.message;
    console.error(`UniFi Authorization Final Error [${status}]:`, message);
    throw new Error(`UniFi Authorization Failed: ${message}`);
  }
}

// API Routes
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;

  if (username !== DEFAULT_ADMIN_USER) {
    return res.status(401).json({ error: "Usuário inválido" });
  }

  try {
    const hash = await getAdminPassword();
    const isValid = await bcrypt.compare(password, hash);

    if (isValid) {
      // Set cookie with the hash as a simple token
      res.cookie('admin_token', hash, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
      });
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Senha incorreta" });
    }
  } catch (err) {
    res.status(500).json({ error: "Erro no servidor" });
  }
});

app.post("/api/admin/change-password", authenticateAdmin, async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
  }

  try {
    const newHash = await bcrypt.hash(newPassword, 10);
    
    // Upsert into Supabase
    const { error } = await supabase
      .from('admin_config')
      .upsert({ key: 'admin_password', password_hash: newHash }, { onConflict: 'key' });

    if (error) throw error;

    // Update session cookie with new hash
    res.cookie('admin_token', newHash, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao alterar senha", details: err.message });
  }
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true });
});

app.get("/api/registrations", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .order('registered_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({ error: "Failed to fetch registrations", details: error.message });
  }
});

app.post("/api/authorize", async (req, res) => {
  const { macAddress, minutes, fullName, email, phoneNumber, apMac, ssid } = req.body;
  
  if (!macAddress) {
    return res.status(400).json({ error: "MAC Address is required" });
  }

  try {
    // 1. Save to Supabase (Server-side has internet access)
    // This avoids the "Failed to fetch" error on the client device
    const { error: supabaseError } = await supabase
      .from('registrations')
      .insert([
        {
          full_name: fullName || 'Visitante',
          email: email || 'n/a',
          phone_number: phoneNumber || 'n/a',
          mac_address: macAddress,
          ap_mac: apMac || 'unknown',
          ssid: ssid || 'unknown',
        }
      ]);

    if (supabaseError) {
      console.error('Supabase Registration Error:', supabaseError);
      // We continue even if Supabase fails to at least try to authorize the user
    }

    // 2. Authorize in UniFi
    const result = await authorizeGuest(macAddress, minutes || 60);
    res.json({ success: true, result });
  } catch (error: any) {
    console.error('Authorization Error:', error.message);
    res.status(500).json({ error: "Falha ao autorizar no UniFi", details: error.message });
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
