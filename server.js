// server.js

// Carga las variables de entorno desde el archivo .env
// Esta línea debe ser una de las primeras para que las variables estén disponibles globalmente.
require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

// Importar las funciones de Machine Learning y WhatsApp.
// Las funciones de Machine Learning se comentan aquí porque ya no se utilizarán.
// const { trainModel, predictFillTime } = require('./ml/ml'); 
const { sendWhatsAppMessage } = require('./api/wpp');

// Importar los módulos que encapsulan la lógica de la aplicación.
const setupWebsocket = require('./modules/websocket');
const setupChatbotRoutes = require('./modules/chatbot');
const setupStateRoutes = require('./modules/state');

// Inicializar la aplicación Express y el servidor HTTP.
const app = express();
const server = http.createServer(app);

// Inicializar el servidor WebSocket.
// Se adjunta directamente al servidor HTTP para una configuración sencilla.
// Si se necesitara una ruta específica para WebSockets, se usaría `noServer: true` y un `server.on('upgrade')`.
const wss = new WebSocket.Server({ server });

// Objeto para almacenar el estado compartido de la aplicación.
// Incluye los últimos datos del sensor, historial para el promedio, etc.
let sharedState = {
  lastData: {},
  // El array 'states' ya no se usa para el entrenamiento de ML, pero se mantiene si tiene otro propósito.
  states: [],
  fullTimes: [],
  averageFillTime: 0
};

// La clave de API de Gemini se carga de las variables de entorno para mayor seguridad.
const API_KEY = process.env.GEMINI_API_KEY;

// --- Verificación de Variables de Entorno (solo para depuración) ---
console.log('--- Verificación de API Key y Frontend URL ---');
console.log('GEMINI_API_KEY:', API_KEY ? 'Cargado' : 'NO CARGADO');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL || 'No definido');
console.log('--- Fin Verificación ---');

// Configuración de CORS (Cross-Origin Resource Sharing).
// Esto permite que tu cliente (frontend) acceda a tu API desde un dominio diferente.
const allowedOrigins = (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : [])
  .map(url => url.trim())
  .filter(url => url !== '');

// Añadir orígenes locales específicos para el desarrollo.
if (!allowedOrigins.includes('http://localhost:8080')) {
  allowedOrigins.push('http://localhost:8080');
}
if (!allowedOrigins.includes('http://127.0.0.1:5500')) {
  allowedOrigins.push('http://127.0.0.1:5500');
}

console.log('DEBUG: Orígenes CORS permitidos:', allowedOrigins);

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos HTTP permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Encabezados permitidos
  credentials: true // Permite el envío de cookies o encabezados de autorización
}));

// Middleware para parsear cuerpos de solicitud JSON.
app.use(express.json());

// --- Configuración de Módulos de Lógica ---

// 1. Configurar el manejo de WebSockets.
// Se pasa 'null' para las funciones de ML, indicando que no se usarán.
setupWebsocket(wss, sharedState, null, { sendWhatsAppMessage });

// 2. Configurar las rutas de la API para el chatbot.
setupChatbotRoutes(app, sharedState, API_KEY);

// 3. Configurar la ruta de la API para el estado actual.
setupStateRoutes(app, sharedState);

// --- Inicio del Servidor ---

// Define el puerto del servidor. Usa la variable de entorno PORT si existe, sino 3000.
const PORT = process.env.PORT || 3000;

// El servidor empieza a escuchar en el puerto definido, accesible desde cualquier interfaz de red.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});