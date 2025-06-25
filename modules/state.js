// /modules/state.js (Versión Mejorada)

/**
 * Configura la ruta GET para obtener el estado actual.
 * @param {express.Application} app - La instancia de la aplicación Express.
 * @param {object} globalSharedState - Objeto con el estado compartido global (ahora contendrá 'bins').
 */
module.exports = (app, globalSharedState) => {
    // Ruta para obtener el estado de un tacho específico por su ID
    app.get('/estado/:deviceId', (req, res) => {
        const deviceId = req.params.deviceId;
        if (globalSharedState.bins[deviceId] && globalSharedState.bins[deviceId].lastData.estado) {
            res.json({
                deviceId: deviceId,
                estado: globalSharedState.bins[deviceId].lastData.estado,
                distancia: globalSharedState.bins[deviceId].lastData.distancia,
                timestamp: globalSharedState.bins[deviceId].lastData.timestampServer,
                averageFillTime: globalSharedState.bins[deviceId].averageFillTime
            });
        } else {
            res.status(404).json({ message: `Estado para el dispositivo ${deviceId} no disponible.` });
        }
    });

    // Opcional: Ruta para obtener un resumen de todos los tachos
    app.get('/estados', (req, res) => {
        const allBinStates = Object.keys(globalSharedState.bins).map(deviceId => {
            const bin = globalSharedState.bins[deviceId];
            return {
                deviceId: deviceId,
                estado: bin.lastData.estado || 'No disponible',
                distancia: bin.lastData.distancia || null,
                timestamp: bin.lastData.timestampServer || null,
                averageFillTime: bin.averageFillTime
            };
        });
        res.json(allBinStates);
    });

    // La ruta original ./estado probablemente causaría un error o no haría lo que esperas.
    // Si la quieres para un estado general, podría ser:
    app.get('/estado', (req, res) => {
        if (Object.keys(globalSharedState.bins).length > 0) {
            // Podrías devolver el estado del primer tacho o un resumen
            res.json({
                message: "Accede a /estado/:deviceId para un tacho específico o /estados para todos.",
                primerTachoId: Object.keys(globalSharedState.bins)[0]
            });
        } else {
            res.json({ message: 'No hay datos de ningún tacho disponibles.' });
        }
    });
};