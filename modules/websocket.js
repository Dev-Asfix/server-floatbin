// modules/websocket.js (Versión Mejorada)

const WebSocket = require('ws');

/**
 * Calcula el tiempo promedio de llenado del tacho.
 * @param {Array} fullTimes - Array de timestamps cuando el tacho estaba "Lleno".
 * @returns {number|null} El tiempo promedio de llenado en milisegundos, o null si insuficiente data.
 */
function calculateAverageFillTime(fullTimes) {
    // Asegúrate de que fullTimes contenga timestamps de la misma época (Date.now() o ISO strings)
    // Si tu ESP32 envía millis(), asegúrate de convertirlo en el servidor a Date.now() o ISO
    // En este ejemplo, asumimos que 'data.timestamp' del ESP32 es un valor de millis()
    // y lo convertimos a un Date en el servidor, luego a ISO string para 'fullTimes'.
    if (fullTimes.length >= 2) {
        const totalFillTime = new Date(fullTimes[fullTimes.length - 1]).getTime() - new Date(fullTimes[0]).getTime();
        return totalFillTime / (fullTimes.length - 1);
    }
    return null;
}

/**
 * Configura los manejadores de eventos para el servidor WebSocket.
 * @param {WebSocket.Server} wss - La instancia del servidor WebSocket.
 * @param {object} globalSharedState - Objeto con el estado compartido global (ahora contendrá 'bins').
 * @param {object | null} mlFunctions - Objeto que contendría las funciones de Machine Learning (se pasa como null).
 * @param {object} wppFunctions - Objeto que contiene las funciones de WhatsApp (sendWhatsAppMessage).
 */
module.exports = (wss, globalSharedState, mlFunctions, wppFunctions) => {
    wss.on('connection', ws => {
        console.log('Cliente WebSocket conectado.');

        ws.on('message', message => {
            let data;
            try {
                data = JSON.parse(message);
            } catch (error) {
                console.error('Error al parsear el mensaje JSON:', error);
                return; // Ignorar mensajes no válidos
            }

            // ** Validar que el mensaje incluya un deviceId **
            if (!data.deviceId) {
                console.warn('Mensaje recibido sin deviceId. Ignorando:', data);
                return;
            }

            const deviceId = data.deviceId;

            // ** Inicializar el estado de este tacho si es la primera vez que se ve **
            if (!globalSharedState.bins[deviceId]) {
                globalSharedState.bins[deviceId] = {
                    lastData: {},
                    fullTimes: [],
                    averageFillTime: null
                };
                console.log(`Estado inicializado para el dispositivo: ${deviceId}`);
            }

            const binState = globalSharedState.bins[deviceId];

            // ** Actualiza los últimos datos recibidos del sensor para ESTE dispositivo **
            // Convertir el timestamp de millis() del ESP32 a una fecha legible y universal (ISO string)
            // Esto es crucial para que calculateAverageFillTime funcione correctamente con new Date()
            const currentTimestamp = new Date().toISOString(); // Usar la hora del servidor para consistencia
            // Opcional: si quieres usar el timestamp del ESP32 como referencia, tendrías que gestionarlo.
            // Por simplicidad, y para cálculos en el backend, usar la hora del servidor es más fiable.

            binState.lastData = {
                estado: data.estado,
                distancia: data.distancia,
                // Conserva el timestamp original del ESP32 y añade el del servidor si es útil.
                timestampESP32: data.timestamp, // Original millis() de ESP32
                timestampServer: currentTimestamp // Timestamp del servidor para registro y cálculos
            };


            // Si el estado recibido es "Lleno" para ESTE dispositivo, registra y recalcula el promedio.
            if (data.estado === 'Lleno') {
                // Solo añadir si el último estado no era ya "Lleno" o si es el primer registro de llenado
                const lastFullTime = binState.fullTimes.length > 0 ? binState.fullTimes[binState.fullTimes.length - 1] : null;
                const isNewFullEvent = !lastFullTime || (new Date(currentTimestamp).getTime() - new Date(lastFullTime).getTime() > 1000 * 60 * 5); // Considerar un nuevo llenado si han pasado 5 minutos desde el último 'lleno'

                if (isNewFullEvent) {
                    binState.fullTimes.push(currentTimestamp); // Usar el timestamp del servidor
                    console.log(`Dispositivo ${deviceId} - Registrado llenado: ${currentTimestamp}`);
                    // Opcional: Limitar el tamaño de fullTimes para no consumir demasiada memoria
                    const MAX_FULL_TIMES = 50; // Almacenar solo los últimos 50 eventos de llenado
                    if (binState.fullTimes.length > MAX_FULL_TIMES) {
                        binState.fullTimes.shift(); // Eliminar el más antiguo
                    }
                }
                binState.averageFillTime = calculateAverageFillTime(binState.fullTimes);

                // Lógica para enviar mensajes de WhatsApp (activar si se necesita por tacho)
                // Esto requeriría una lógica para saber a qué número enviar para cada tacho.
                // Por ahora, se mantiene comentada para evitar envíos masivos.
                /*
                if (wppFunctions && wppFunctions.sendWhatsAppMessage) {
                    // Tendrías que tener un mapeo de deviceId a número de teléfono
                    // const phoneNumber = getPhoneNumberForDevice(deviceId);
                    // if (phoneNumber) {
                    //     wppFunctions.sendWhatsAppMessage(`whatsapp:${phoneNumber}`, `El tacho ${deviceId} está lleno.`)
                    //         .then(() => console.log(`Mensaje de WhatsApp enviado para ${deviceId}.`))
                    //         .catch(error => console.error(`Error al enviar WhatsApp para ${deviceId}:`, error));
                    // }
                }
                */
            }

            // Enviar los datos actualizados de ESTE DISPOSITIVO a todos los clientes WebSocket conectados.
            // Ahora se envía el deviceId en la respuesta para que el frontend sepa a qué tacho pertenece.
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        deviceId: deviceId, // ¡Importante! Enviar el ID del dispositivo
                        estado: binState.lastData.estado,
                        distancia: binState.lastData.distancia,
                        timestamp: binState.lastData.timestampServer, // Enviar el timestamp del servidor
                        averageFillTime: binState.averageFillTime
                    }));
                }
            });
        });

        ws.on('close', () => {
            console.log('Cliente WebSocket desconectado.');
            // Opcional: Manejar la desconexión del tacho, por ejemplo, marcándolo como offline.
        });

        ws.on('error', (error) => {
            console.error('Error en el WebSocket:', error);
        });
    });
};