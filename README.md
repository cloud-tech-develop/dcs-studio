# SEEDANCE STUDIO

### Dead Camera Studios // AI Research Lab

> **Reinvented Cinema. Absolute Creative Control.**
> The Electric Mind.

Motor propio de generación cinematográfica construido sobre **BytePlus ModelArk · Dreamina Seedance 2.0**. Control artístico granular con presets afinados al DNA visual de DCS: **Blade Runner 2049 · The Matrix · Gone Girl · Interstellar**.

---

## ⚡ Setup en 3 pasos

### Atajo (Windows): doble click en `start.bat`

Ese script verifica que tengas Node.js, instala dependencias si es la primera vez, levanta el server, y abre el navegador en `http://localhost:3000` automáticamente. Para macOS/Linux usa `./start.sh`.

### O manualmente

**1. Instala dependencias**

```bash
npm install
```

**2. Arranca el server**

```bash
npm start
```

**3. Abre [http://localhost:3000](http://localhost:3000) y agrega tu API key desde el panel `⚿ API` en la esquina superior derecha** 🎬

> Las keys se guardan en `./keys.json` (excluido de git). Puedes agregar varias y alternar entre ellas con un click — útil cuando tienes varias cuentas o llegas al límite semanal de créditos.

---

# DOCKER

```bash
docker compose up --build -d
```

O sin compose:

```bash
docker build -t seedance-studio .
docker run -d -p 3000:3000 --name seedance seedance-studio
```

O con compose:

```bash
docker compose up --build -d
```

## 🔑 Multi-API Keys

Panel `⚿ API` en la esquina superior derecha. Permite:

- **Agregar múltiples keys** con nickname (ej. `account-1`, `weekly-pool`, `cliente-sofia`)
- **Alternar la activa** con un click — el indicador en el header muestra cuál estás usando en verde
- **Renombrar** cualquier key haciendo click en su nombre
- **Eliminar** las que ya no uses

Las keys se guardan en `./keys.json` localmente (nunca tocan ningún cloud externo, nunca van a git). El backend las usa como Bearer tokens. Puedes intercambiarlas sin reiniciar el server — útil cuando una cuenta llega al límite semanal de créditos y quieres pasarte a otra al instante.

## 🎞 Reference assets · Multimodal

Seedance 2.0 acepta imágenes, videos y audios como referencia. Hay dos zonas de upload en el panel central:

**First & Last Frame slots** — slots dedicados con etiqueta. Si pones una imagen en First Frame, el video arranca exactamente con esa imagen. Si pones también Last Frame, el video transiciona del primero al segundo. Drag & drop o click.

**Multi-reference grid** — botón `+` para añadir hasta:

- 7 imágenes adicionales (estilo, personajes, ingredientes visuales)
- 3 videos (referencia de motion / camera movement)
- 3 audios (música, ambiente, voz hasta ~15s)

Cada thumbnail muestra una etiqueta clickeable (`Image 3`, `Video 1`, `Audio 1`...). Al hacer click, la etiqueta se inserta donde tengas el cursor en el prompt — Seedance espera referencias literales en el texto, ej:

> _"`Image 1` walks down a corridor lit by `Video 1`'s flickering pattern, ambient track from `Audio 1`."_

**Cómo viajan los assets:** se convierten a base64 inline y se embeben en el JSON request a BytePlus. Los archivos nunca tocan un cloud externo — viajan directamente de tu máquina al endpoint de BytePlus en Singapur. Trade-off: hay caps razonables de tamaño (8MB imagen, 25MB video, 8MB audio) para que el request no se vuelva imposiblemente lento. Si pegas un video de 200MB, el request va a tardar bastante en subir.

**Endpoint base** — `https://ark.ap-southeast.bytepluses.com/api/v3` (región `ap-southeast-1`)

**Autenticación** — Bearer token simple (sin firma HMAC, sin signing)

```http
Authorization: Bearer ${ARK_API_KEY}
```

**Endpoints usados:**

| Método   | Path                               | Función                   |
| -------- | ---------------------------------- | ------------------------- |
| `POST`   | `/contents/generations/tasks`      | Crear tarea de generación |
| `GET`    | `/contents/generations/tasks/{id}` | Consultar estado          |
| `DELETE` | `/contents/generations/tasks/{id}` | Cancelar tarea            |

**Body de creación** (Seedance espera flags embebidos en el texto):

```json
{
  "model": "dreamina-seedance-2-0-260128",
  "content": [
    {
      "type": "text",
      "text": "A woman walks through neon rain... Blade Runner 2049 grade... --ratio 16:9 --resolution 720p --duration 5 --camerafixed false"
    }
  ]
}
```

El compilador de prompts del studio (`server.js` → `compilePrompt()`) ensambla automáticamente:

```
[USER PROMPT]. [CAMERA]. [LENS]. [CAMERA MOTION]. [COLOR GRADING]. [GENRE]. --ratio X --resolution Y --duration N --camerafixed bool
```

---

## 📊 Modelos disponibles

| Engine   | Model ID                            | Resolución  | Audio | Costo    |
| -------- | ----------------------------------- | ----------- | ----- | -------- |
| **FAST** | `dreamina-seedance-2-0-fast-260128` | 480p / 720p | ❌    | Más bajo |
| **PRO**  | `dreamina-seedance-2-0-260128`      | 480p–1080p  | ✅    | Estándar |

**Workflow recomendado DCS:** itera en FAST hasta clavar la composición → take final en PRO con audio.

> ⚠️ **Resource pack obligatorio.** Antes de generar tu primer clip, compra un resource pack para Seedance 2.0 en el console de BytePlus. Sin pack activo, los modelos no responden.
> 👉 https://console.byteplus.com/ark/region:ark+ap-southeast-1/resourcepack

---

## 🎨 Identidad de marca aplicada

La interfaz respeta el manual de marca completo de DCS:

**Paleta oficial**

- `#000000` Black Core
- `#DC2129` Signal Red — color principal, CTAs
- `#A5CB39` Neural Green — prompt compilado
- `#2C2F31` Magnet Grey — estructura
- `#FFFFFF` White Field

**Tipografía**

- Helvetica (sustituto operativo de Neue Haas Grotesk Display Pro)
- Helvetica Compressed — headers
- Thunderstorm — slogan disruptivo "VISION"
- Akira Expanded — display reservado

**Voz**

- Slogan: `LIGHTS, ~~CAMERA,~~ VISION ACTION.`
- Tagline: `Reinvented Cinema. Absolute Creative Control.`
- Firma: `The Electric Mind · Somos Dead Camera Studios.`

---

## 🎬 Presets cinematográficos · DNA DCS

Cada preset inyecta un vocabulario cinematográfico específico. Editables libremente en `presets.json`.

| Preset                | Esencia visual                                                                  |
| --------------------- | ------------------------------------------------------------------------------- |
| **Blade Runner 2049** | Tungsten-amber smog · neon pollution haze · Deakins god-rays                    |
| **The Matrix**        | Green-phosphor CRT wash · digital-rain cast · simulation aesthetic              |
| **Gone Girl**         | Fincher teal-green underexposure · clinical desaturation · Cronenweth restraint |
| **Interstellar**      | Hoytema cold blue void · warm amber practicals · IMAX 65mm reverence            |

Cada chip de grade muestra el color dominante de su película al activarse.

---

## 📁 Estructura

```
seedance-studio/
├── server.js              ← backend Express · BytePlus ModelArk client
├── presets.json           ← biblioteca cinematográfica editable
├── .env                   ← tu API key (NO subir a git)
├── public/
│   ├── index.html         ← interfaz DCS
│   ├── styles.css         ← sistema de diseño
│   ├── app.js             ← lógica UI + compilador de prompts
│   ├── fonts/             ← Helvetica, Thunderstorm, Akira
│   └── assets/            ← logo, slogan
└── outputs/               ← videos + .txt prompts (auto-guardados)
```

---

## 🛠 Personalizar presets — dos caminos

### Camino A · Excel (recomendado para iterar)

La forma más cómoda de afinar los prompts cinematográficos:

1. Abre **`seedance-prompts.xlsx`** (en la raíz del proyecto) con Excel, Numbers, o LibreOffice
2. Edita las celdas amarillas en la columna **PROMPT** — son las únicas que debes tocar
3. Guarda el archivo (mantén la extensión `.xlsx`)
4. Doble click en **`import-presets.bat`** (o `./import-presets.sh` en Mac/Linux)
5. Recarga la app con `Ctrl+Shift+R`

El script hace backup del `presets.json` anterior automáticamente antes de sobrescribir, así puedes revertir si rompiste algo.

### Camino B · Editar `presets.json` directamente

Si prefieres tocar el JSON a mano:

```json
{
  "id": "nuevo_grade",
  "label": "Nuevo Grade",
  "prompt": "vocabulario cinematográfico específico que describe sombras, luces, temperatura, saturación, textura..."
}
```

Reinicia el server y aparece como chip activo.

---

## 🔍 Troubleshooting

**`ARK_API_KEY not configured`** — falta editar `.env` con tu key real.

**`No active resource pack`** — compra un pack en el console de BytePlus para Seedance 2.0.

**`Model not found`** — verifica el model ID exacto en el dashboard. Los IDs incluyen sufijo de versión (ej. `260128`) que cambia con cada release.

**`429 Too Many Requests`** — BytePlus aplica rate limit de 2 QPS por cuenta y máximo 3 tareas concurrentes durante public beta.

**Task stuck en `running`** — Pro 1080p toma 2–4 minutos. El polling del studio hace timeout a los 10 minutos. Si tu clip pasa eso, probablemente algo más anda mal — revisa el dashboard.

---

## 🚀 Roadmap (próximas features)

- **Image-to-video** — subir still de referencia para mantener look consistente entre clips
- **Reference assets `@image1`** — sintaxis de Seedance para personajes recurrentes
- **Preset packs por director** — Villeneuve / Fincher / Nolan / Wachowskis
- **Batch mode** — 3 variantes con seeds distintos en paralelo
- **Session persistence** — SQLite local para historial entre sesiones
- **Watermark DCS** — logo en esquina del export final

---

<p align="center"><em>Somos Dead Camera Studios.</em></p>
