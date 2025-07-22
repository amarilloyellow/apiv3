import express from 'express';
import { kv } from '@vercel/kv';

// Inicializa la aplicación Express
const app = express();
app.use(express.json()); // Middleware para parsear JSON

// Ejemplo de una ruta GET para obtener un dato
app.get('/api/users/:id', async (req, res) => {
  try {
    const userId = `user:${req.params.id}`;
    const user = await kv.get(userId);
    if (user) {
      return res.status(200).json(user);
    }
    return res.status(404).json({ message: 'Usuario no encontrado' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Ejemplo de una ruta POST para guardar un dato
app.post('/api/users', async (req, res) => {
  try {
    const { id, name, email } = req.body;
    const userId = `user:${id}`;
    await kv.set(userId, { name, email });
    return res.status(201).json({ message: 'Usuario creado' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Ruta raíz para verificar que la API funciona
app.get('/api', (req, res) => {
  res.send('¡Bienvenido a mi API con Express en Vercel!');
});

// ¡IMPORTANTE! Exporta la instancia de la app.
// Vercel se encarga de iniciar el servidor.
export default app;