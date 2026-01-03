# 📧 Gmail Monitor

Aplicación para monitorear tu bandeja de entrada de Gmail en tiempo real y extraer información de correos nuevos.

## ✨ Características

- 🔐 Autenticación segura con OAuth2
- 📥 Vista de bandeja de entrada con correos recientes
- ⚡ Monitoreo en tiempo real (cada 10 segundos)
- 🔔 Notificaciones visuales y sonoras de correos nuevos
- 📋 Extracción de información: Remitente, Asunto, Fecha, Cuerpo
- 🎨 Interfaz moderna con diseño dark mode

## 🚀 Configuración

### Paso 1: Crear proyecto en Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Ve a **APIs y servicios** > **Biblioteca**
4. Busca y habilita **Gmail API**

### Paso 2: Crear credenciales OAuth

1. Ve a **APIs y servicios** > **Credenciales**
2. Click en **+ Crear credenciales** > **ID de cliente OAuth**
3. Si es la primera vez, configura la **Pantalla de consentimiento OAuth**:
   - Tipo de usuario: **Externo**
   - Nombre de la app: `Gmail Monitor`
   - Email de soporte: Tu email
   - En **Scopes**, agrega: `https://www.googleapis.com/auth/gmail.readonly`
   - En **Usuarios de prueba**, agrega tu email
4. Vuelve a **Credenciales** > **+ Crear credenciales** > **ID de cliente OAuth**
5. Selecciona **Aplicación de escritorio**
6. Nombre: `Gmail Monitor Desktop`
7. Click en **Crear**
8. **Descarga el archivo JSON**

### Paso 3: Configurar la aplicación

1. Renombra el archivo JSON descargado a `credentials.json`
2. Colócalo en la carpeta raíz del proyecto (junto a `server.js`)

```
gmail-monitor/
├── credentials.json  ← Coloca el archivo aquí
├── package.json
├── server.js
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```

### Paso 4: Ejecutar la aplicación

```bash
npm start
```

O para desarrollo con auto-reload:

```bash
npm run dev
```

La aplicación se abrirá automáticamente en `http://localhost:3000`

## 📖 Uso

1. Al iniciar, la app te pedirá autorización de Google
2. Acepta los permisos en la ventana de Google
3. Una vez conectado, verás tus correos recientes
4. Los correos nuevos aparecerán automáticamente en la vista "Tiempo Real"
5. Click en cualquier correo para ver el contenido completo

## 🔧 Estructura del Proyecto

```
gmail-monitor/
├── server.js          # Servidor Express + Socket.io + Gmail API
├── package.json       # Dependencias y scripts
├── credentials.json   # Credenciales OAuth (no incluido)
├── token.json         # Token de acceso (generado automáticamente)
└── public/
    ├── index.html     # Interfaz principal
    ├── styles.css     # Estilos CSS
    └── app.js         # Lógica del frontend
```

## ⚙️ Personalización

### Cambiar intervalo de monitoreo

En `server.js`, modifica:
```javascript
const CHECK_INTERVAL = 10000; // 10 segundos (en milisegundos)
```

### Ver más correos

En `server.js`, modifica el parámetro `maxResults`:
```javascript
const recentEmails = await getRecentEmails(20); // Cambiar de 10 a 20
```

## 🔒 Seguridad

- Las credenciales nunca salen de tu computadora
- Los tokens se almacenan localmente en `token.json`
- Solo se solicita permiso de **lectura** (no puede enviar ni eliminar correos)

## 📝 Licencia

MIT License
