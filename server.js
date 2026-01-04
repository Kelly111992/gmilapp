import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

// Configuración
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const CHECK_INTERVAL = 5000; // Revisar cada 5 segundos

let lastHistoryId = null;
let gmail = null;
let isMonitoring = false;

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para iniciar sesión (redirección directa)
app.get('/login', async (req, res) => {
  try {
    let credentials;
    if (fs.existsSync(CREDENTIALS_PATH)) {
      credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    } else if (process.env.GOOGLE_CREDENTIALS) {
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } else {
      return res.status(500).send('No se encontraron credenciales.');
    }

    const { client_secret, client_id } = credentials.installed || credentials.web;
    const redirectUri = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/oauth2callback`
      : 'http://localhost:3000/oauth2callback';

    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent' // Forzar a pedir permiso para asegurar que recibimos el refresh token
    });

    res.redirect(authUrl);
  } catch (error) {
    res.status(500).send('Error iniciando login: ' + error.message);
  }
});

// Ruta para iniciar autenticación via socket (legacy)
app.get('/auth', async (req, res) => {
  try {
    const auth = await authorize();
    if (auth) {
      res.json({ success: true, message: 'Ya autenticado' });
    }
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Callback de OAuth
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    let credentials;
    if (fs.existsSync(CREDENTIALS_PATH)) {
      credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    } else if (process.env.GOOGLE_CREDENTIALS) {
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    }
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const redirectUri = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/oauth2callback`
      : 'http://localhost:3000/oauth2callback';
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));

    gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

    res.send(`
      <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; }
            .container { text-align: center; }
            h1 { color: #00d4ff; }
            p { color: #a0a0a0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ ¡Autenticación Exitosa!</h1>
            <p>Puedes cerrar esta ventana y volver a la aplicación.</p>
            <script>setTimeout(() => window.close(), 2000);</script>
          </div>
        </body>
      </html>
    `);

    io.emit('authenticated', { success: true });
    startMonitoring();
  } catch (error) {
    console.error('Error during authentication:', error);
    res.status(500).send('Error during authentication: ' + error.message);
  }
});

// Autorizar con Google
async function authorize() {
  let credentials;

  // Intentar leer desde archivo o variable de entorno
  if (fs.existsSync(CREDENTIALS_PATH)) {
    credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  } else if (process.env.GOOGLE_CREDENTIALS) {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  } else {
    throw new Error('No se encontró credentials.json. Descárgalo de Google Cloud Console.');
  }

  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const redirectUri = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/oauth2callback`
    : 'http://localhost:3000/oauth2callback';
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  // Verificar si ya tenemos token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    return oAuth2Client;
  }

  // Generar URL de autorización
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('🔐 Abre esta URL para autorizar:', authUrl);
  io.emit('needsAuth', { authUrl });

  // No usar open() en servidores headless como Railway
  if (process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_PUBLIC_DOMAIN) {
    await open(authUrl);
  }

  return null;
}

// Obtener información de un correo
async function getEmailDetails(messageId) {
  try {
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    const headers = res.data.payload.headers;
    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    // Extraer el cuerpo del mensaje
    let body = '';
    const payload = res.data.payload;

    if (payload.body.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          break;
        } else if (part.mimeType === 'text/html' && part.body.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
    }

    // Limpiar HTML si es necesario
    body = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    return {
      id: messageId,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      snippet: res.data.snippet,
      body: body.substring(0, 1000), // Limitar a 1000 caracteres
      labels: res.data.labelIds || []
    };
  } catch (error) {
    console.error('Error getting email details:', error);
    return null;
  }
}

// Obtener correos recientes
async function getRecentEmails(maxResults = 10) {
  try {
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults: maxResults,
      labelIds: ['INBOX']
    });

    if (!res.data.messages) {
      return [];
    }

    const emails = [];
    for (const message of res.data.messages) {
      const details = await getEmailDetails(message.id);
      if (details) {
        emails.push(details);
      }
    }

    return emails;
  } catch (error) {
    console.error('Error getting recent emails:', error);
    return [];
  }
}

// Verificar correos nuevos
async function checkForNewEmails() {
  if (!gmail || !isMonitoring) return;

  try {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const currentHistoryId = profile.data.historyId;

    if (lastHistoryId && currentHistoryId !== lastHistoryId) {
      // Hay cambios, obtener los correos más recientes
      const res = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 5,
        labelIds: ['INBOX'],
        q: 'is:unread'
      });

      if (res.data.messages) {
        for (const message of res.data.messages) {
          const details = await getEmailDetails(message.id);
          if (details) {
            console.log('📧 Nuevo correo detectado:', details.subject);
            io.emit('newEmail', details);
          }
        }
      }
    }

    lastHistoryId = currentHistoryId;
  } catch (error) {
    console.error('Error checking for new emails:', error);
  }
}

// Iniciar monitoreo
async function startMonitoring() {
  if (isMonitoring) return;

  isMonitoring = true;
  console.log('🔄 Iniciando monitoreo de Gmail...');

  // Obtener historyId inicial
  try {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    lastHistoryId = profile.data.historyId;
    console.log('✅ Monitoreo activo. History ID:', lastHistoryId);

    // Enviar correos recientes al conectar
    const recentEmails = await getRecentEmails(10);
    io.emit('recentEmails', recentEmails);
    io.emit('monitoringStarted', { email: profile.data.emailAddress });
  } catch (error) {
    console.error('Error starting monitoring:', error);
  }

  // Verificar cada X segundos
  setInterval(checkForNewEmails, CHECK_INTERVAL);
}

// Socket.io conexiones
io.on('connection', async (socket) => {
  console.log('🌐 Cliente conectado');

  // Verificar si ya estamos autenticados
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      await authorize();
      if (gmail) {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        socket.emit('authenticated', { success: true, email: profile.data.emailAddress });

        if (!isMonitoring) {
          startMonitoring();
        } else {
          const recentEmails = await getRecentEmails(10);
          socket.emit('recentEmails', recentEmails);
        }
      }
    } catch (error) {
      socket.emit('needsAuth', { message: 'Necesitas autenticarte' });
    }
  } else if (!fs.existsSync(CREDENTIALS_PATH) && !process.env.GOOGLE_CREDENTIALS) {
    socket.emit('needsCredentials', {
      message: 'Necesitas el archivo credentials.json de Google Cloud Console'
    });
  } else {
    socket.emit('needsAuth', { message: 'Necesitas autenticarte con Google' });
  }

  socket.on('startAuth', async () => {
    try {
      await authorize();
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('refreshEmails', async () => {
    if (gmail) {
      const recentEmails = await getRecentEmails(10);
      socket.emit('recentEmails', recentEmails);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado');
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   📧  Gmail Monitor - Servidor iniciado                   ║
║                                                           ║
║   🌐  URL: http://0.0.0.0:${PORT}                           ║
║                                                           ║
║   📋  Asegúrate de tener credentials.json en la carpeta   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
