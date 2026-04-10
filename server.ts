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
import jwt from "jsonwebtoken";

dotenv.config();

// Allow self-signed certificates for UniFi Controller
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'unifi-captive-secret-key-2026';

// Admin Default Credentials (Fallback)
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
async function authenticateAdmin(req: any, res: express.Response, next: express.NextFunction) {
  const token = req.cookies.admin_token;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid session" });
  }
}

// Middleware to protect Superadmin routes
async function authenticateSuperadmin(req: any, res: express.Response, next: express.NextFunction) {
  const token = req.cookies.admin_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded.is_superadmin) {
      return res.status(403).json({ error: "Forbidden: Superadmin access required" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid session" });
  }
}

// UniFi Controller Configuration (Legacy Defaults - will be overridden by Tenant config)
let DEFAULT_UNIFI_URL = process.env.UNIFI_CONTROLLER_URL?.replace(/\/$/, ""); 
let DEFAULT_UNIFI_USER = process.env.UNIFI_USERNAME;
let DEFAULT_UNIFI_PASS = process.env.UNIFI_PASSWORD;
let DEFAULT_UNIFI_SITE = process.env.UNIFI_SITE || "default";

// Helper to get tenant by subdomain
async function getTenantBySubdomain(subdomain: string) {
  if (!subdomain || subdomain === 'www' || subdomain === 'localhost') return null;
  
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('subdomain', subdomain)
    .maybeSingle();
    
  if (error) {
    console.error('Error fetching tenant:', error);
    return null;
  }
  return data;
}

// Helper to get tenant from request
async function getTenantFromReq(req: express.Request) {
  // Try to get the real host from various headers used by proxies
  const forwardedHost = req.headers['x-forwarded-host'] as string;
  const originalHost = req.headers['x-original-host'] as string;
  const hostHeader = req.headers.host || '';
  
  // Priority: x-forwarded-host > x-original-host > host
  let host = (forwardedHost || originalHost || hostHeader).split(':')[0].toLowerCase();
  
  const baseDomain = (process.env.BASE_DOMAIN || 'unificaptive.com.br').toLowerCase();
  
  // Superadmin domain is now dash.baseDomain
  const superAdminDomain = `dash.${baseDomain}`;
  
  // If we are on the main domain or localhost, it's the admin panel
  if (
    host === superAdminDomain || 
    host === baseDomain ||
    host === 'localhost' ||
    host.includes('.run.app') || 
    host.includes('googleusercontent.com')
  ) {
    return null;
  }

  let subdomain = '';
  if (host.endsWith(`.${baseDomain}`)) {
    subdomain = host.substring(0, host.length - baseDomain.length - 1);
  } else if (host !== baseDomain && !host.includes('.')) {
    subdomain = host;
  }
  
  if (!subdomain || subdomain === 'www') {
    return null;
  }
  
  const tenant = await getTenantBySubdomain(subdomain);
  return tenant;
}

async function loginToUnifi(unifiAxios: any, credentials: any) {
  // Try UniFi OS login first
  try {
    const response = await unifiAxios.post("/api/auth/login", credentials);
    
    let csrfToken = null;
    // Capture CSRF token if present
    if (response.headers['x-csrf-token']) {
      csrfToken = response.headers['x-csrf-token'] as string;
    }
    
    return { success: true, isUnifiOs: true, csrfToken };
  } catch (osError: any) {
    // Try legacy login
    try {
      const response = await unifiAxios.post("/api/login", credentials);
      return { success: true, isUnifiOs: false, csrfToken: null };
    } catch (legacyError: any) {
      const status = legacyError.response?.status || "No Status";
      const message = legacyError.response?.data?.meta?.msg || legacyError.message;
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

async function authorizeGuest(tenant: any, mac: string, minutes: number = 60) {
  try {
    const unifiUrl = tenant?.unifi_url || DEFAULT_UNIFI_URL;
    const unifiUser = tenant?.unifi_user || DEFAULT_UNIFI_USER;
    const unifiPass = tenant?.unifi_pass || DEFAULT_UNIFI_PASS;
    const unifiSite = tenant?.unifi_site || DEFAULT_UNIFI_SITE;

    if (!unifiUrl || !unifiUser || !unifiPass) {
      throw new Error("UniFi configuration is missing for this tenant.");
    }

    // Create a fresh Cookie Jar and Axios instance for this tenant/request
    const jar = new CookieJar();
    const unifiAxios = wrapper(axios.create({
      baseURL: unifiUrl,
      jar,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    }));

    // Always login first to ensure fresh session and cookies in the jar
    const loginResult = await loginToUnifi(unifiAxios, {
      username: unifiUser,
      password: unifiPass
    });
    
    const formattedMac = formatMac(mac);
    
    const headers: any = {};
    if (loginResult.csrfToken) {
      headers['x-csrf-token'] = loginResult.csrfToken;
    }

    // Try both paths if it's UniFi OS, or just the direct path if it's legacy
    const pathsToTry = loginResult.isUnifiOs 
      ? [`/proxy/network/api/s/${unifiSite}/cmd/stamgr`, `/api/s/${unifiSite}/cmd/stamgr`]
      : [`/api/s/${unifiSite}/cmd/stamgr`];

    let lastError: any = null;
    for (const endpoint of pathsToTry) {
      try {
        const response = await unifiAxios.post(endpoint, {
          cmd: "authorize-guest",
          mac: formattedMac,
          minutes: minutes,
        }, { headers });
        
        if (response.data && response.data.meta && response.data.meta.rc === "ok") {
          return response.data;
        } else {
          const msg = response.data?.meta?.msg || "Unknown error from UniFi";
          lastError = new Error(msg);
        }
      } catch (err: any) {
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
// Logging Middleware for all requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Handle UniFi legacy subpaths by redirecting to root with query params
app.get(['/guest/s/:site', '/guest/s/:site/*'], (req, res) => {
  const urlParts = req.url.split('?');
  const query = urlParts.length > 1 ? `?${urlParts[1]}` : '';
  const target = `/${query}`;
  console.log(`[REDIRECT] UniFi path detected: ${req.url} -> Redirecting to: ${target}`);
  res.redirect(302, target);
});

app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;
  const tenant = await getTenantFromReq(req);

  try {
    // 1. Try to find user in admin_config
    let query = supabase.from('admin_config').select('*').eq('username', username);
    
    if (tenant) {
      query = query.eq('tenant_id', tenant.id);
    } else {
      query = query.is('tenant_id', null).eq('is_superadmin', true);
    }

    const { data: admin, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    if (!admin) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const isValid = await bcrypt.compare(password, admin.password_hash);

    if (isValid) {
      const token = jwt.sign({ 
        id: admin.id, 
        username: admin.username, 
        is_superadmin: admin.is_superadmin,
        tenant_id: admin.tenant_id 
      }, JWT_SECRET);

      res.cookie('admin_token', token, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 
      });
      res.json({ success: true, is_superadmin: admin.is_superadmin });
    } else {
      res.status(401).json({ error: "Senha incorreta" });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true });
});

app.post("/api/admin/change-password", authenticateAdmin, async (req: any, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
  }

  try {
    const newHash = await bcrypt.hash(newPassword, 10);
    
    const { error } = await supabase
      .from('admin_config')
      .update({ password_hash: newHash })
      .eq('id', req.admin.id);

    if (error) throw error;

    // Update session cookie with new token
    const token = jwt.sign({ 
      id: req.admin.id, 
      username: req.admin.username, 
      is_superadmin: req.admin.is_superadmin,
      tenant_id: req.admin.tenant_id 
    }, JWT_SECRET);

    res.cookie('admin_token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao alterar senha", details: err.message });
  }
});

app.get("/api/registrations", authenticateAdmin, async (req: any, res) => {
  try {
    let query = supabase.from('registrations').select('*').order('registered_at', { ascending: false });
    
    // If not superadmin, filter by tenant_id
    if (!req.admin.is_superadmin) {
      if (!req.admin.tenant_id) {
        return res.status(403).json({ error: "Acesso negado: Tenant não identificado" });
      }
      query = query.eq('tenant_id', req.admin.tenant_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error('Error fetching registrations:', err);
    res.status(500).json({ error: "Erro ao buscar registros", details: err.message });
  }
});

// Tenant Management Routes (Superadmin)
app.get("/api/admin/tenants", authenticateSuperadmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch tenants", details: error.message });
  }
});

app.post("/api/admin/tenants", authenticateSuperadmin, async (req, res) => {
  const { name, subdomain, unifi_url, unifi_user, unifi_pass, unifi_site, hero_title, hero_description } = req.body;
  
  try {
    const { data, error } = await supabase
      .from('tenants')
      .insert([{ 
        name, 
        subdomain, 
        unifi_url, 
        unifi_user, 
        unifi_pass, 
        unifi_site: unifi_site || 'default',
        hero_title,
        hero_description
      }])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to create tenant", details: error.message });
  }
});

app.delete("/api/admin/tenants/:id", authenticateSuperadmin, async (req, res) => {
  try {
    const { error } = await supabase
      .from('tenants')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete tenant", details: error.message });
  }
});

// Admin Management for Tenants (Superadmin only)
app.get("/api/admin/admins", authenticateSuperadmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('admin_config')
      .select('*, tenants(name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar administradores" });
  }
});

app.post("/api/admin/admins", authenticateSuperadmin, async (req, res) => {
  try {
    const { username, password, tenant_id, is_superadmin } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from('admin_config').insert({
      username,
      password_hash: hash,
      tenant_id: is_superadmin ? null : tenant_id,
      is_superadmin: !!is_superadmin
    }).select().single();
    
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/admin/admins/:id", authenticateSuperadmin, async (req, res) => {
  try {
    const { error } = await supabase.from('admin_config').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao excluir administrador" });
  }
});

app.post("/api/authorize", async (req, res) => {
  const { macAddress, minutes, fullName, email, phoneNumber, apMac, ssid } = req.body;
  
  if (!macAddress) {
    return res.status(400).json({ error: "MAC Address is required" });
  }

  // Backend Validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^(\(?\d{2}\)?\s?)?(\d{4,5}-?\d{4})$/;

  if (email && !emailRegex.test(email)) {
    return res.status(400).json({ error: "Formato de e-mail inválido" });
  }

  if (phoneNumber && !phoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
    return res.status(400).json({ error: "Formato de telefone inválido" });
  }

  try {
    // Identify tenant from request
    const tenant = await getTenantFromReq(req);

    // 1. Save to Supabase
    const registrationData = {
      full_name: fullName || 'Visitante',
      email: email || 'n/a',
      phone_number: phoneNumber || 'n/a',
      mac_address: macAddress,
      ap_mac: apMac || 'unknown',
      ssid: ssid || 'unknown',
      tenant_id: tenant?.id || null
    };
    
    const { error: supabaseError } = await supabase
      .from('registrations')
      .insert([registrationData]);

    if (supabaseError) {
      console.error('Supabase Registration Error:', supabaseError);
    }

    // 2. Authorize in UniFi
    const result = await authorizeGuest(tenant, macAddress, minutes || 60);
    
    res.json({ 
      success: true, 
      result
    });
  } catch (error: any) {
    console.error('Authorization Error:', error.message);
    res.status(500).json({ 
      error: "Falha ao autorizar no UniFi", 
      details: error.message
    });
  }
});

// Public endpoint to get tenant info (for the portal UI)
app.get("/api/tenant-info", async (req, res) => {
  try {
    const tenant = await getTenantFromReq(req);

    if (!tenant) {
      return res.json({ 
        name: "UnifiCaptive by CoreBase"
      });
    }
    res.json({ 
      name: tenant.name,
      hero_title: tenant.hero_title,
      hero_description: tenant.hero_description
    });
  } catch (error) {
    res.json({ 
      name: "UnifiCaptive by CoreBase"
    });
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
