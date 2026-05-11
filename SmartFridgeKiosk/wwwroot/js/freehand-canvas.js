// Perfect Freehand - inline minimal implementation for stroke generation
// Based on Steve Ruiz's perfect-freehand library (MIT)
// Generates variable-width stroke outlines from input points

const RATE_OF_PRESSURE_CHANGE = 0.275;
const MIN_DISTANCE = 3;

function lerp(a, b, t) { return a + (b - a) * t; }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function med(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
function mul(a, s) { return [a[0] * s, a[1] * s]; }
function per(a) { return [a[1], -a[0]]; }
function uni(a) { const l = Math.hypot(a[0], a[1]); return l === 0 ? a : [a[0] / l, a[1] / l]; }

function getStrokeOutlinePoints(inputPoints, options = {}) {
    const {
        size = 16,
        thinning = 0.5,
        smoothing = 0.5,
        streamline = 0.5,
        simulatePressure = true,
        start = { taper: 0, cap: true },
        end = { taper: 0, cap: true },
        last = false,
    } = options;

    if (inputPoints.length === 0) return [];

    const totalLength = inputPoints.reduce((acc, p, i) => {
        if (i === 0) return 0;
        return acc + dist(p, inputPoints[i - 1]);
    }, 0);

    const minDist = size * smoothing;
    const leftPts = [];
    const rightPts = [];

    let prevPressure = inputPoints[0][2] || 0.5;
    let prevPoint = inputPoints[0];
    let radius = size / 2;

    for (let i = 0; i < inputPoints.length; i++) {
        let point = inputPoints[i];
        let pressure = point[2] !== undefined ? point[2] : 0.5;

        if (simulatePressure) {
            const sp = Math.min(1, dist(point, prevPoint) / size);
            pressure = Math.min(1, 1 - sp);
        }

        pressure = lerp(prevPressure, pressure, RATE_OF_PRESSURE_CHANGE);

        const r = size / 2 * (1 - thinning + thinning * pressure);

        if (i === 0 || dist(point, prevPoint) >= minDist) {
            const vec = i === 0 ? [1, 0] : uni(sub(point, prevPoint));
            const p = per(vec);
            leftPts.push(add(point, mul(p, r)));
            rightPts.push(sub(point, mul(p, r)));
            prevPoint = point;
        }

        prevPressure = pressure;
    }

    rightPts.reverse();
    return [...leftPts, ...rightPts];
}

function getSvgPathFromStroke(stroke) {
    if (!stroke.length) return "";

    const d = stroke.reduce(
        (acc, [x0, y0], i, arr) => {
            const [x1, y1] = arr[(i + 1) % arr.length];
            acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
            return acc;
        },
        ["M", ...stroke[0], "Q"]
    );

    d.push("Z");
    return d.join(" ");
}

const canvasInstances = new Map();

function createCanvasInstance(canvasId, dotnetRef, options) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    // Scale for high-DPI
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const instance = {
        canvas,
        ctx,
        dpr,
        dotnetRef,
        options: {
            size: options.size || 8,
            thinning: options.thinning ?? 0.5,
            smoothing: options.smoothing ?? 0.5,
            streamline: options.streamline ?? 0.5,
            simulatePressure: options.simulatePressure ?? true,
            color: options.color || "#1a1a2e",
            backgroundColor: options.backgroundColor || "#ffffff",
        },
        currentPoints: [],
        allStrokes: [],    // Array of { points, color, options }
        isDrawing: false,
    };

    clearCanvas(instance);
    attachEvents(canvasId, instance);
    canvasInstances.set(canvasId, instance);
}

function clearCanvas(instance) {
    const { ctx, canvas, dpr, options } = instance;
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
}

function redrawAll(instance) {
    clearCanvas(instance);
    for (const stroke of instance.allStrokes) {
        drawStroke(instance, stroke.points, stroke.color, stroke.options);
    }
}

function drawStroke(instance, points, color, options) {
    const outlinePoints = getStrokeOutlinePoints(points, options);
    if (outlinePoints.length === 0) return;

    const pathData = getSvgPathFromStroke(outlinePoints);
    const path = new Path2D(pathData);

    instance.ctx.fillStyle = color;
    instance.ctx.fill(path);
}

function getPointerData(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure !== undefined ? e.pressure : 0.5;
    return [x, y, pressure];
}

function attachEvents(canvasId, instance) {
    const { canvas } = instance;

    canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        instance.isDrawing = true;
        instance.currentPoints = [getPointerData(canvas, e)];

        // Check if we have real pressure from a pen/stylus
        if (e.pointerType === "pen") {
            instance.options.simulatePressure = false;
        }
    });

    canvas.addEventListener("pointermove", (e) => {
        if (!instance.isDrawing) return;
        e.preventDefault();

        const point = getPointerData(canvas, e);
        const lastPoint = instance.currentPoints[instance.currentPoints.length - 1];

        if (dist(point, lastPoint) < MIN_DISTANCE) return;

        instance.currentPoints.push(point);

        // Redraw everything + current in-progress stroke
        redrawAll(instance);
        drawStroke(instance, instance.currentPoints, instance.options.color, instance.options);
    });

    const endStroke = (e) => {
        if (!instance.isDrawing) return;
        instance.isDrawing = false;

        if (instance.currentPoints.length > 1) {
            instance.allStrokes.push({
                points: [...instance.currentPoints],
                color: instance.options.color,
                options: { ...instance.options },
            });
        }

        instance.currentPoints = [];
        redrawAll(instance);
    };

    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointerleave", endStroke);

    // Prevent scrolling/zooming on touch
    canvas.style.touchAction = "none";
}

window.FreehandCanvas = {
    init(canvasId, dotnetRef, options) {
        createCanvasInstance(canvasId, dotnetRef, options);
    },

    clear(canvasId) {
        const instance = canvasInstances.get(canvasId);
        if (!instance) return;
        instance.allStrokes = [];
        instance.currentPoints = [];
        clearCanvas(instance);
    },

    undo(canvasId) {
        const instance = canvasInstances.get(canvasId);
        if (!instance) return;
        instance.allStrokes.pop();
        redrawAll(instance);
    },

    setColor(canvasId, color) {
        const instance = canvasInstances.get(canvasId);
        if (instance) instance.options.color = color;
    },

    setSize(canvasId, size) {
        const instance = canvasInstances.get(canvasId);
        if (instance) instance.options.size = size;
    },

    hasStrokes(canvasId) {
        const instance = canvasInstances.get(canvasId);
        return instance ? instance.allStrokes.length > 0 : false;
    },

    exportToPngBase64(canvasId) {
        const instance = canvasInstances.get(canvasId);
        if (!instance) return null;

        // Return the raw base64 string (without the data:image/png;base64, prefix)
        const dataUrl = instance.canvas.toDataURL("image/png");
        return dataUrl.split(",")[1];
    },

    exportToPngBytes(canvasId) {
        const base64 = this.exportToPngBase64(canvasId);
        if (!base64) return null;

        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    },

    resize(canvasId) {
        const instance = canvasInstances.get(canvasId);
        if (!instance) return;

        const { canvas, ctx } = instance;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        instance.dpr = dpr;

        redrawAll(instance);
    },

    dispose(canvasId) {
        canvasInstances.delete(canvasId);
    },
};
