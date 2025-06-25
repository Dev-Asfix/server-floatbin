// server.js

// Carga las variables de entorno desde el archivo .env
require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

// Importar las funciones de Machine Learning y WhatsApp.
const { sendWhatsAppMessage } = require('./api/wpp');

// Importar los módulos que encapsulan la lógica de la aplicación.
// Nota: 'setupWebsocket' aquí se refiere a la función que configura el manejador de mensajes de WebSocket,
// pero la lógica de gestión de 'sharedState.bins' se manejará en este 'server.js' principal
// para centralizar el estado de todos los tachos que ve el dashboard.
// Si tu 'modules/websocket.js' ya tiene la lógica para registrar 'latestDeviceData',
// podrías mantenerla, pero lo centralizaremos aquí para claridad con el dashboard.
// Eliminamos el import 'setupWebsocket' de aquí si lo vamos a manejar directamente en este archivo.
// const setupWebsocket = require('./modules/websocket'); // Probablemente no necesitemos este import aquí
const setupChatbotRoutes = require('./modules/chatbot');
const setupStateRoutes = require('./modules/state');

// Inicializar la aplicación Express y el servidor HTTP.
const app = express();
const server = http.createServer(app);

// Inicializar el servidor WebSocket.
const wss = new WebSocket.Server({ server });

// Objeto para almacenar el estado compartido de la aplicación.
// Ahora 'bins' almacenará el estado más reciente de CADA tacho.
let sharedState = {
  bins: {} // Objeto para almacenar el estado de cada tacho por su deviceId
};

// La clave de API de Gemini se carga de las variables de entorno para mayor seguridad.
const API_KEY = process.env.GEMINI_API_KEY;

// --- Verificación de Variables de Entorno (solo para depuración) ---
console.log('--- Verificación de API Key y Frontend URL ---');
console.log('GEMINI_API_KEY:', API_KEY ? 'Cargado' : 'NO CARGADO');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL || 'No definido');
console.log('--- Fin Verificación ---');

// Configuración de CORS (Cross-Origin Resource Sharing).
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
// Asegúrate de añadir el origen de tu aplicación desplegada si lo tienes
// Por ejemplo, si tu frontend está en https://flotabin.vercel.app
if (!allowedOrigins.includes('https://flotabin.vercel.app')) { // Reemplaza con tu URL real si aplica
  allowedOrigins.push('https://flotabin.vercel.app');
}


console.log('DEBUG: Orígenes CORS permitidos:', allowedOrigins);

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Middleware para parsear cuerpos de solicitud JSON.
app.use(express.json());

// --- ¡Paso CRÍTICO! Servir archivos estáticos PRIMERO ---
// Esto asegura que tus archivos HTML, CSS y JS del frontend
// sean servidos antes de que cualquier otra ruta intente manejarlos.
// Esto permite que el navegador pida:
// - http://localhost:3000/index.html (para la redirección)
// - http://localhost:3000/styles.css
// - http://localhost:3000/images/Robot.png
// - http://localhost:3000/modules/dashboard.html
// - http://localhost:3000/modules/tacho.html
// - http://localhost:3000/modules/js/dashboard.js
// y así sucesivamente.
app.use(express.static('public'));
app.use(express.static('chat'));

app.get('/api/status', (req, res) => {
  res.status(200).json({ status: 'online', message: 'Chatbot server is active.' });
});
// --- Configuración del Servidor WebSocket ---
// Esta lógica se centraliza aquí para manejar el estado de 'bins' de forma global
// y asegurar que el dashboard reciba los últimos datos de todos los tachos.
wss.on('connection', ws => {
  console.log('Cliente WebSocket conectado');

  // Almacenar una referencia al socket del cliente para un posible uso futuro
  // (aunque 'wss.clients' ya los contiene).
  // ws.id = generarIdUnicoParaCliente(); // Opcional: asignar un ID único al cliente

  // Enviar los datos más recientes de todos los tachos a los clientes recién conectados.
  // Esto es crucial para que el dashboard muestre datos al cargar sin esperar un mensaje de cada tacho.
  for (const deviceId in sharedState.bins) {
    if (sharedState.bins.hasOwnProperty(deviceId)) {
      ws.send(JSON.stringify(sharedState.bins[deviceId].lastData));
    }
  }

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      // console.log(`Mensaje recibido de ${data.deviceId || 'desconocido'}:`, data);

      if (data.deviceId) {
        // Si el tacho no existe en sharedState.bins, inicializarlo
        if (!sharedState.bins[data.deviceId]) {
          sharedState.bins[data.deviceId] = {
            lastData: {},
            fullTimes: [],
            estadoActual: "", // Asegurarse de tener el estado para registerStateForDevice si lo usas en el backend
            inicioEstado: null
          };
        }

        // Actualizar los últimos datos de este tacho
        sharedState.bins[data.deviceId].lastData = data;

        // --- Opcional: Lógica para calcular averageFillTime en el backend ---
        // Si quieres que el promedio de llenado se calcule y se envíe desde el backend,
        // deberías importar las funciones de 'state.js' aquí y pasarlas.
        // Sin embargo, para mantener el backend ligero y la lógica de UI en el frontend,
        // el frontend calculará su propio promedio.
        // El ESP32 solo envía 'deviceId', 'estado', 'distancia', 'timestamp'.
        // El 'averageFillTime' se calcula en el frontend.

        // Reenviar el mensaje a TODOS los clientes conectados
        // incluyendo el remitente, para que todos los dashboards se actualicen en tiempo real.
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });

        // Si necesitas enviar mensajes de WhatsApp (ej. al llenarse)
        // if (data.estado === 'Lleno') {
        //     sendWhatsAppMessage(`El tacho ${data.deviceId} está lleno!`);
        // }

      } else {
        console.warn('Mensaje WebSocket recibido sin deviceId:', data);
      }
    } catch (error) {
      console.error('Error al parsear o procesar el mensaje WebSocket:', error);
    }
  });

  ws.on('close', () => {
    console.log('Cliente WebSocket desconectado');
  });

  ws.on('error', error => {
    console.error('Error en WebSocket:', error);
  });
});


// --- Configuración de Módulos de Lógica REST/API ---

// 1. Configurar las rutas de la API para el chatbot.
setupChatbotRoutes(app, sharedState, API_KEY);

// 2. Configurar la ruta de la API para el estado actual.
setupStateRoutes(app, sharedState); // Esto ahora podría darte los datos de sharedState.bins

// --- Inicio del Servidor ---

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor Express y WebSocket corriendo en http://localhost:${PORT}`);
  console.log(`Accede al Dashboard en: http://localhost:${PORT}/modules/dashboard.html`);
});