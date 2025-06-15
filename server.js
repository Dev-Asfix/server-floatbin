// server.js

// Carga las variables de entorno desde el archivo .env
require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
// path ya no es estrictamente necesario si no sirves archivos estáticos
// const path = require('path'); 

// Importar las funciones de Machine Learning y WhatsApp
const { trainModel, predictFillTime } = require('./ml/ml');
const { sendWhatsAppMessage } = require('./api/wpp');

// Importar los módulos que encapsulan la lógica
const setupWebsocket = require('./modules/websocket');
const setupChatbotRoutes = require('./modules/chatbot');
// const setupStaticFilesRoutes = require('./modules/staticFiles'); // <-- ¡ELIMINA O COMENTA ESTA LÍNEA!
const setupStateRoutes = require('./modules/state');

// Inicializar la aplicación Express y el servidor HTTP
const app = express();
const server = http.createServer(app);

// Inicializar el servidor WebSocket.
// Se mantiene aquí porque 'wss' es una instancia central que se pasa a 'websocket.js'.
// Si estás usando la configuración para WebSocket en una ruta específica (como /ws/tacho),
// deberías usar: const wss = new WebSocket.Server({ noServer: true });
// y luego server.on('upgrade', ...) como te sugerí en una respuesta anterior.
// Si tu cliente WebSocket se conecta a la raíz del servidor, entonces WebSocket.Server({ server }) está bien.
// Asumo que mantienes la configuración que te funciona, así que lo dejo como está.
const wss = new WebSocket.Server({ server });

// Definir un objeto para el estado compartido.
let sharedState = {
  lastData: {},
  states: [],
  fullTimes: [],
  averageFillTime: 0
};

// La API_KEY se carga de process.env
const API_KEY = process.env.GEMINI_API_KEY;

// --- Depuración (Opcional, para verificar que la clave se carga) ---
console.log('--- Verificación de API Key y Frontend URL ---');
console.log('GEMINI_API_KEY:', API_KEY ? 'Cargado' : 'NO CARGADO');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL || 'No definido');
console.log('--- Fin Verificación ---');
// ------------------------------------------------------------------

// Middleware global para CORS y para parsear JSON en las solicitudes.
// Esto es crucial para que tu cliente (frontend) en OTRO DOMINIO pueda acceder a tu API.
const allowedOrigins = (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : [])
  .map(url => url.trim())
  .filter(url => url !== '');

console.log('DEBUG: Orígenes CORS permitidos:', allowedOrigins);

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos HTTP permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Encabezados permitidos
  credentials: true // Permite el envío de cookies o encabezados de autorización
}));
app.use(express.json());

// --- Configuración de Módulos ---

// 1. Configurar el manejo de WebSockets.
setupWebsocket(wss, sharedState, { trainModel, predictFillTime }, { sendWhatsAppMessage });

// 2. Configurar las rutas del chatbot.
setupChatbotRoutes(app, sharedState, API_KEY);

// 3. Configurar las rutas para servir archivos estáticos y el dashboard.
// <-- ¡ELIMINA O COMENTA ESTA LÍNEA, YA NO SE NECESITA!
// setupStaticFilesRoutes(app); 

// 4. Configurar la ruta para el estado actual.
setupStateRoutes(app, sharedState);

// --- Inicio del Servidor ---

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
