import express from 'express';
import { kv } from '@vercel/kv';

// Inicializa la aplicación Express
const app = express();
app.use(express.json()); // Middleware para parsear JSON

app.post('/api/asignaturas', async (req, res) => {
  try {
    const {
      codigo_asignatura,
      nombre_asignatura,
      unidades_credito,
      carreras
    } = req.body;

    if (!codigo_asignatura || !nombre_asignatura || unidades_credito === undefined || !carreras || carreras.length === 0) {
      return res.status(400).json({ message: 'Faltan datos requeridos.' });
    }

    const pipeline = kv.multi();
    const claveAsignatura = `asig:${codigo_asignatura}`;

    // --- INICIO DEL CAMBIO ---
    const valorAsignatura = {
      nombre: nombre_asignatura,
      uc: unidades_credito,
      // Se crea y guarda la lista de códigos de carrera
      carreras: carreras.map(c => c.codigo_carrera)
    };
    // --- FIN DEL CAMBIO ---

    pipeline.set(claveAsignatura, valorAsignatura);

    for (const carreraInfo of carreras) {
      const claveVinculo = `vinculo:${carreraInfo.codigo_carrera}:${codigo_asignatura}`;
      const valorVinculo = { semestre: carreraInfo.semestre, requisitos: carreraInfo.requisitos };
      pipeline.set(claveVinculo, valorVinculo);
    }
    
    await pipeline.exec();

    return res.status(201).json({ 
      message: 'Asignatura y sus vínculos creados exitosamente.',
      data: {
        key: claveAsignatura,
        value: valorAsignatura
      } 
    });

  } catch (error) {
    console.error('Error al crear la asignatura:', error);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
});
// En tu archivo server.js, añade esta nueva ruta:

app.put('/api/asignaturas/:codigo_asignatura', async (req, res) => {
  try {
    const { codigo_asignatura } = req.params;
    const { nombre_asignatura, unidades_credito, carreras } = req.body;

    if (!nombre_asignatura || unidades_credito === undefined || !carreras) {
      return res.status(400).json({ message: 'Faltan datos requeridos para actualizar.' });
    }

    const claveAsignatura = `asig:${codigo_asignatura}`;
    const asignaturaActual = await kv.get(claveAsignatura);

    if (!asignaturaActual) {
      return res.status(404).json({ message: 'La asignatura con ese código no fue encontrada.' });
    }

    const pipeline = kv.multi();

    if (asignaturaActual.carreras && asignaturaActual.carreras.length > 0) {
      for (const codigoCarreraAntiguo of asignaturaActual.carreras) {
        pipeline.del(`vinculo:${codigoCarreraAntiguo}:${codigo_asignatura}`);
      }
    }
    
    // --- INICIO DEL CAMBIO ---
    const codigosCarrerasNuevas = carreras.map(c => c.codigo_carrera);
    const valorAsignaturaNuevo = {
      nombre: nombre_asignatura,
      uc: unidades_credito,
      // Se guarda la nueva lista actualizada de carreras
      carreras: codigosCarrerasNuevas
    };
    // --- FIN DEL CAMBIO ---

    pipeline.set(claveAsignatura, valorAsignaturaNuevo);
    
    for (const carreraInfo of carreras) {
      const claveVinculoNuevo = `vinculo:${carreraInfo.codigo_carrera}:${codigo_asignatura}`;
      const valorVinculoNuevo = { semestre: carreraInfo.semestre, requisitos: carreraInfo.requisitos };
      pipeline.set(claveVinculoNuevo, valorVinculoNuevo);
    }
    
    await pipeline.exec();
    
    return res.status(200).json({
      message: 'Asignatura actualizada exitosamente.',
      data: {
        key: claveAsignatura,
        value: valorAsignaturaNuevo
      }
    });

  } catch (error) {
    console.error('Error al actualizar la asignatura:', error);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// En tu archivo server.js, añade la ruta DELETE

app.delete('/api/asignaturas/:codigo_asignatura', async (req, res) => {
  try {
    // 1. Obtener el código de la asignatura desde los parámetros de la URL
    const { codigo_asignatura } = req.params;
    const claveAsignatura = `asig:${codigo_asignatura}`;

    // 2. Verificar que la asignatura existe antes de intentar borrarla
    const asignatura = await kv.get(claveAsignatura);

    if (!asignatura) {
      return res.status(404).json({ message: 'La asignatura con ese código no fue encontrada.' });
    }

    // 3. Iniciar una transacción para eliminar todos los registros relacionados
    const pipeline = kv.multi();

    // 4. Añadir a la transacción la eliminación de los vínculos
    // Se usa la lista de carreras guardada en el objeto de la asignatura
    if (asignatura.carreras && asignatura.carreras.length > 0) {
      for (const codigoCarrera of asignatura.carreras) {
        const claveVinculo = `vinculo:${codigoCarrera}:${codigo_asignatura}`;
        pipeline.del(claveVinculo);
      }
    }

    // 5. Añadir a la transacción la eliminación de la asignatura principal
    pipeline.del(claveAsignatura);

    // 6. Ejecutar la transacción
    await pipeline.exec();

    // 7. Enviar respuesta de éxito
    return res.status(200).json({ message: `Asignatura '${codigo_asignatura}' y sus ${asignatura.carreras?.length || 0} vínculos han sido eliminados.` });

  } catch (error) {
    console.error('Error al eliminar la asignatura:', error);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.get('/api/asignaturas', async (req, res) => {
  try {
    // 1. Obtener todas las asignaturas base
    const asignaturaKeys = [];
    for await (const key of kv.scanIterator({ match: 'asig:*' })) {
      asignaturaKeys.push(key);
    }

    if (asignaturaKeys.length === 0) {
      return res.status(200).json([]);
    }

    const asignaturasBase = await kv.mget(...asignaturaKeys);

    // 2. Recolectar todas las claves de vínculos que necesitamos buscar
    const allVinculoKeys = [];
    asignaturasBase.forEach((asignatura, index) => {
      const codigoAsignatura = asignaturaKeys[index].split(':')[1];
      if (asignatura.carreras) {
        for (const codigoCarrera of asignatura.carreras) {
          allVinculoKeys.push(`vinculo:${codigoCarrera}:${codigoAsignatura}`);
        }
      }
    });

    // 3. Obtener todos los datos de los vínculos en una sola petición
    let vinculosData = [];
    if (allVinculoKeys.length > 0) {
      vinculosData = await kv.mget(...allVinculoKeys);
    }

    // 4. Crear un mapa para buscar fácilmente los datos de los vínculos
    const vinculosMap = new Map();
    allVinculoKeys.forEach((key, index) => {
      vinculosMap.set(key, vinculosData[index]);
    });

    // 5. Ensamblar la respuesta final
    const resultadoFinal = asignaturasBase.map((asignatura, index) => {
      const codigoAsignatura = asignaturaKeys[index].split(':')[1];
      
      const carrerasDetalladas = (asignatura.carreras || []).map(codigoCarrera => {
        const vinculoKey = `vinculo:${codigoCarrera}:${codigoAsignatura}`;
        const vinculo = vinculosMap.get(vinculoKey);
        
        return {
          codigo_carrera: codigoCarrera,
          semestre: vinculo?.semestre,
          requisitos: vinculo?.requisitos || []
        };
      });

      return {
        codigo_asignatura: codigoAsignatura,
        nombre_asignatura: asignatura.nombre,
        unidades_credito: asignatura.uc,
        carreras: carrerasDetalladas
      };
    });

    return res.status(200).json(resultadoFinal);

  } catch (error) {
    console.error('Error al obtener todas las asignaturas detalladas:', error);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.get('/api/carreras/:codigo_carrera/asignaturas', async (req, res) => {
  try {
    const { codigo_carrera } = req.params;

    const vinculoKeys = [];
    const asignaturaKeys = [];
    
    // 1. Encontrar todas las claves de vínculo para la carrera especificada
    const pattern = `vinculo:${codigo_carrera}:*`;
    for await (const key of kv.scanIterator({ match: pattern })) {
      vinculoKeys.push(key);
      // Extraer el código de la asignatura del vinculo (ej: de "vinculo:INF:CS101" extrae "CS101")
      const codigoAsignatura = key.split(':')[2];
      asignaturaKeys.push(`asig:${codigoAsignatura}`);
    }

    if (vinculoKeys.length === 0) {
      return res.status(200).json({ message: `No se encontraron asignaturas para la carrera ${codigo_carrera}.` });
    }

    // 2. Obtener todos los datos de los vínculos y las asignaturas en dos peticiones eficientes
    const vinculosData = await kv.mget(...vinculoKeys);
    const asignaturasData = await kv.mget(...asignaturaKeys);

    // 3. Unir la información
    const pensumCompleto = vinculosData.map((vinculo, index) => {
      const asignatura = asignaturasData[index];
      const codigoAsignatura = asignaturaKeys[index].split(':')[1];
      
      return {
        codigo_asignatura: codigoAsignatura,
        nombre_asignatura: asignatura.nombre,
        unidades_credito: asignatura.uc,
        semestre: vinculo.semestre,
        requisitos: vinculo.requisitos,
      };
    });

    // Opcional: Ordenar por semestre
    pensumCompleto.sort((a, b) => a.semestre - b.semestre);

    return res.status(200).json(pensumCompleto);

  } catch (error) {
    console.error('Error al obtener las asignaturas de la carrera:', error);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
});
// ¡IMPORTANTE! Exporta la instancia de la app.
// Vercel se encarga de iniciar el servidor.
export default app;