// api/modules/state.js
// Este módulo define la ruta para obtener el estado actual del tacho.

/**
 * Configura la ruta GET para obtener el estado actual.
 * @param {express.Application} app - La instancia de la aplicación Express.
 * @param {object} sharedState - Objeto con el estado compartido (lastData).
 */
module.exports = (app, sharedState) => {
    // Ruta para obtener el estado actual del tacho
    app.get('./estado', (req, res) => {
        if (sharedState.lastData.estado) {
            // Si hay datos, envía el estado actual.
            res.json({ estado: sharedState.lastData.estado });
        } else {
            // Si no hay datos, indica que no está disponible.
            res.json({ estado: 'No disponible' });
        }
    });
};
