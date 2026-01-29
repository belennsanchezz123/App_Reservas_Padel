# 📖 Guía de Configuración de Supabase

Sigue estos pasos para configurar tu aplicación con Supabase:

## Paso 1: Obtener Credenciales de Supabase

1. Ve a [supabase.com](https://supabase.com) e inicia sesión
2. Crea un nuevo proyecto o selecciona uno existente
3. Ve a **Settings** (Configuración) → **API**
4. Copia los siguientes valores:
   - **Project URL** (URL del proyecto)
   - **anon/public key** (Clave anónima/pública)

## Paso 2: Configurar la Aplicación

Abre el archivo `config.js` y reemplaza estos valores:

```javascript
const SUPABASE_CONFIG = {
    url: 'PEGA_AQUI_TU_PROJECT_URL',
    anonKey: 'PEGA_AQUI_TU_ANON_KEY'
};
```

**Ejemplo:**
```javascript
const SUPABASE_CONFIG = {
    url: 'https://abcdefghijk.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
};
```

## Paso 3: Crear las Tablas en Supabase

1. En tu proyecto de Supabase, ve a **SQL Editor**
2. Haz clic en **+ New Query**
3. Copia y pega todo el contenido del archivo `schema.sql`
4. Haz clic en **RUN** para ejecutar el script
5. Verifica que las 3 tablas se hayan creado: `monitors`, `students`, `classes`

## Paso 4: Migrar Datos Existentes (Opcional)

Si ya tienes datos en LocalStorage que quieres conservar:

1. Abre `migrate.html` en tu navegador
2. Haz clic en "Ver Datos Actuales" para revisar qué datos tienes
3. Haz clic en "Iniciar Migración"
4. Espera a que termine el proceso

⚠️ **IMPORTANTE**: Solo ejecuta la migración UNA VEZ. Si la ejecutas varias veces, duplicarás los datos.

## Paso 5: Lanzar la Aplicación

1. Asegúrate de que el servidor esté corriendo:
   ```powershell
   python -m http.server 8000
   ```

2. Abre en tu navegador: `http://localhost:8000`

3. La aplicación debería cargar normalmente. Ahora todos los datos se guardan en Supabase.

## Verificación

Para verificar que todo funciona:

1. Agrega un monitor, estudiante o clase
2. Actualiza la página (F5)
3. Los datos deberían seguir ahí (vienen de Supabase, no de LocalStorage)
4. Abre la aplicación en otro navegador o dispositivo
5. Verás los mismos datos (están en la nube)

## Solución de Problemas

### Error: "Supabase library not loaded"
- Verifica que tienes conexión a internet
- El CDN de Supabase necesita internet para cargar

### Error: "Invalid API key" o "Project not found"
- Verifica que copiaste correctamente la URL y la clave en `config.js`
- Asegúrate de no tener espacios ni caracteres extra

### Los datos no se guardan
1. Abre la consola del navegador (F12)
2. Busca errores en rojo
3. Verifica que las tablas existan en Supabase
4. Asegúrate de haber deshabilitado RLS (Row Level Security) en las tablas

### Error: "permission denied" o "row level security policy"
1. Ve a Supabase → **Authentication** → **Policies**
2. Busca las tablas `monitors`, `students`, `classes`
3. Asegúrate de que RLS esté **deshabilitado** (para modo simple)

## Próximos Pasos (Opcional)

Una vez que todo funcione, puedes:

- Activar Row Level Security para mayor seguridad
- Implementar autenticación real con Supabase Auth
- Agregar sincronización en tiempo real con Supabase Realtime
- Desplegar la aplicación en producción (Vercel, Netlify, etc.)
