// ==========================================
// PADEL CLASS MANAGEMENT - SUPABASE VERSION
// ==========================================

const appState = {
    students: [],
    classes: [],
    currentWeekStart: null,
    currentMonthDate: null,
    selectedDayDate: null,
    selectedClass: null,
    classToDelete: null,
    editingStudent: null,
    viewingStudentId: null,
    studentPayments: [],
    addPaymentType: null,
    personal: [],
    currentUser: null,
    viewingMonitorId: null,
    matches: [],
    recepcionTab: 'pagos',
    matchTempPlayers: [],
    cajaPayments: [],
    cajaCounted: '',
    matchesView: 'list',
    calendarDate: null,
    coordTab: 'monitores',
    avisosCollapsed: true,
    misClasesCollapsed: false,
    solicitudesCollapsed: false,
    cuotasCollapsed: false,
    recuperarCollapsed: false,
    gestionSearch: '',
    gestionData: null,
    // Solicitudes de inscripción (alumno -> monitor) y notificaciones realtime.
    monitorRequests: [],      // solicitudes pendientes del monitor logueado
    notifChannel: null,       // canal de Supabase Realtime del usuario actual
    classHolds: [],           // solicitudes con el pago en curso: retienen plaza (ver occupancyOf)
};

const CONFIG = {
    hoursStart: 7,
    hoursEnd: 23,
    maxStudentsPerClass: 4,
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    // Snap interval in minutes when dragging/resizing classes (can be 15 or 30)
    snapMinutes: 15,
    // Partidos: nº de pistas por defecto y duración fija de cada partido (min).
    numCourts: 10,
    matchDurationMin: 90,
};

// Precio por defecto de una clase (EUR). Coincide con el DEFAULT de la columna
// classes.precio. La política de precios definitiva (por nivel, por tipo de clase...)
// está pendiente de decidir: de momento el precio es editable clase a clase.
const DEFAULT_CLASS_PRICE = 10;

// Nº de pistas configurable, persistido en el navegador (localStorage).
function getNumCourts() {
    const stored = parseInt(localStorage.getItem('padel_num_courts'), 10);
    return (!isNaN(stored) && stored >= 1 && stored <= 40) ? stored : CONFIG.numCourts;
}
function setNumCourts(n) {
    const v = Math.max(1, Math.min(40, parseInt(n, 10) || CONFIG.numCourts));
    localStorage.setItem('padel_num_courts', String(v));
    return v;
}

window.addEventListener('DOMContentLoaded', () => {
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) {
        console.error('calendarGrid not found. Ensure the element with id "calendarGrid" exists in the HTML.');
        return;
    }

    calendarGrid.addEventListener('dragend', (event) => {
        const changedDay = 'Nuevo Día'; // Lógica para obtener el nuevo día
        const changedTime = 'Nueva Hora'; // Lógica para obtener la nueva hora
        showConfirmChangesModal(changedDay, changedTime);
    });
});

// ==========================================
// SIMPLE EMAIL/PASSWORD LOGIN OVERLAY (index.html #login-view)
// ==========================================

// Dado el id de usuario de Supabase Auth, devuelve el objeto currentUser
// buscando primero en `monitors` (monitor/coordinador/recepción) y, si no
// existe, en `students` (rol 'usuario'/alumno). Devuelve null si no hay perfil.
async function resolveUserFromAuth(authUserId) {
    try {
        const { data: monitorRow } = await supabase
            .from('personal')
            .select('*')
            .eq('auth_user_id', authUserId)
            .maybeSingle();

        if (monitorRow) {
            return {
                id: monitorRow.id,
                name: monitorRow.name,
                permissions: monitorRow.permissions || [],
            };
        }

        // ¿Es un alumno con acceso?
        const studentRow = await db.getStudentByAuthId(authUserId);
        if (studentRow) {
            return {
                id: studentRow.id,
                studentId: studentRow.id,
                name: studentRow.name,
                permissions: ['usuario'],
            };
        }

        return null;
    } catch (e) {
        console.error('Error resolviendo el perfil del usuario:', e);
        return null;
    }
}

// Esta función se llama desde el botón "Entrar" del nuevo login
// que has añadido en index.html. Aquí conectamos de verdad con Supabase Auth
// usando supabase-js v2 (UMD) para hacer signInWithPassword.
async function handleLogin() {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMsg = document.getElementById('error-msg');

    if (!emailInput || !passwordInput || !errorMsg) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        errorMsg.textContent = 'Introduce correo y contraseña.';
        errorMsg.style.display = 'block';
        return;
    }

    if (typeof supabase === 'undefined' || !supabase) {
        errorMsg.textContent = 'Supabase no está disponible en esta página.';
        errorMsg.style.display = 'block';
        return;
    }

    try {
        errorMsg.style.display = 'none';

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            console.error('Error de login Supabase:', error);
            errorMsg.textContent = error.message || 'Error al iniciar sesión.';
            errorMsg.style.display = 'block';
            return;
        }

        // Resolver el perfil (monitor/coordinador/recepción o alumno) del usuario.
        const resolvedUser = await resolveUserFromAuth(data.user.id);

        if (!resolvedUser) {
            console.error('No se encontró perfil (monitors/students) para este usuario.');
            errorMsg.textContent = 'Usuario no autorizado. Contacta con el administrador.';
            errorMsg.style.display = 'block';
            await supabase.auth.signOut();
            return;
        }

        appState.currentUser = resolvedUser;

        const loginView = document.getElementById('login-view');
        if (loginView) loginView.style.display = 'none';

        console.log('✅ Login correcto como:', appState.currentUser.name, appState.currentUser.permissions);

        try {
            await loadAllData();
        } catch (loadError) {
            console.warn('Error cargando datos tras login:', loadError);
        }
        showMainApp();
    } catch (e) {
        console.error('Excepción en handleLogin:', e);
        errorMsg.textContent = 'Error inesperado al iniciar sesión.';
        errorMsg.style.display = 'block';
    }
}

// El control de visibilidad del overlay de login (#login-view)
// se realiza dentro de initializeApp(), para que el flujo de
// autenticación y carga de datos esté centralizado.

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Escapa texto para interpolarlo de forma segura en HTML (contenido o atributos)
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function formatDateISO(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatMonthYearSpanish(date) {
    const d = new Date(date);
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
}

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function getDateForDay(weekStart, dayIndex) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayIndex);
    return date;
}

function formatTime(time) {
    return time.padStart(5, '0');
}

function formatPeriod(period) {
    if (!period) return '';
    const [year, month] = period.split('-');
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${months[parseInt(month, 10) - 1]} ${year}`;
}

function addMinutesToTime(time, minutesToAdd) {
    const parts = time.split(':').map(n => parseInt(n, 10));
    let h = parts[0] || 0;
    let m = parts[1] || 0;
    let total = h * 60 + m + minutesToAdd;
    if (total < 0) total = 0;
    const nh = Math.floor(total / 60) % 24;
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function minutesToTime(totalMinutes) {
    if (totalMinutes < 0) totalMinutes = 0;
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
}

// "Móvil" = dispositivo táctil sin ratón (aunque esté girado en apaisado y
// supere los 768px), o cualquier pantalla estrecha. Evita que un iPhone en
// horizontal caiga por accidente en la vista semanal de escritorio.
// Debe coincidir con la condición de los @media en styles.css.
function isMobileLayout() {
    const coarseTouch = window.matchMedia('(hover: none) and (pointer: coarse) and (max-width: 950px)').matches;
    return coarseTouch || window.innerWidth <= 768;
}

// Transición animada entre vistas (View Transitions API).
// En navegadores sin soporte (o en escritorio) ejecuta el cambio tal cual.
function withViewTransition(update) {
    if (document.startViewTransition && isMobileLayout()) {
        document.startViewTransition(update);
    } else {
        update();
    }
}

// ==========================================
// BLOQUEO DE SCROLL DE FONDO (unificado) — modales y vista de día
// Técnica robusta iOS: position:fixed + guardar/restaurar scrollY, porque
// overflow:hidden NO frena el scroll táctil en Safari iOS. El bloqueo se lleva
// por "propietarios" (Set) en vez de un contador: es idempotente (se puede
// pedir el mismo bloqueo varias veces, p. ej. renderDayClassesPanel en cada
// refresco) y soporta anidamiento (un modal sobre la vista de día). El fondo
// solo se libera cuando TODOS los propietarios lo sueltan.
// ==========================================
const scrollLockOwners = new Set();
let scrollLockSavedY = 0;

function lockBackgroundScroll(owner) {
    if (scrollLockOwners.has(owner)) return;
    const firstLock = scrollLockOwners.size === 0;
    scrollLockOwners.add(owner);
    if (!firstLock) return; // ya estaba bloqueado: solo registramos el propietario
    scrollLockSavedY = window.scrollY;
    // Compensar el ancho de la barra de scroll para que el fondo no "salte"
    // al desaparecer la barra en escritorio
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;
    document.body.style.top = `-${scrollLockSavedY}px`;
    document.body.classList.add('scroll-locked');
}

function unlockBackgroundScroll(owner) {
    if (!scrollLockOwners.has(owner)) return;
    scrollLockOwners.delete(owner);
    if (scrollLockOwners.size > 0) return; // aún quedan propietarios: seguir bloqueado
    document.body.classList.remove('scroll-locked');
    document.body.style.top = '';
    document.body.style.paddingRight = '';
    // Restaurar la posición exacta que tenía la página antes de bloquear
    window.scrollTo(0, scrollLockSavedY);
}

function timeStringToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = String(timeStr).split(':').map(n => parseInt(n, 10) || 0);
    return h * 60 + m;
}

function isSameCalendarDay(dateA, dateB) {
    const d1 = new Date(dateA);
    const d2 = new Date(dateB);
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
}

function hasClassTimeConflict(targetDate, startTime, endTime, excludeClassId = null) {
    const targetStart = timeStringToMinutes(startTime);
    const targetEnd = timeStringToMinutes(endTime);
    if (!targetDate || isNaN(targetStart) || isNaN(targetEnd)) return false;

    return appState.classes.some(cls => {
        if (!cls || !cls.date) return false;
        if (excludeClassId && cls.id === excludeClassId) return false;
        if (!isSameCalendarDay(cls.date, targetDate)) return false;

        const otherStart = timeStringToMinutes(cls.startTime);
        const otherEnd = timeStringToMinutes(cls.endTime);

        // Overlap if intervals intersect: [start, end) ∩ [otherStart, otherEnd) ≠ ∅
        return targetStart < otherEnd && targetEnd > otherStart;
    });
}

function showLoading(message = 'Cargando...') {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        const text = overlay.querySelector('.loading-text');
        if (text) text.textContent = message;
        overlay.classList.remove('hidden');
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

// ==========================================
// AUTHENTICATION & USER MANAGEMENT
// ==========================================


function logout() {
    // Cerrar el canal de notificaciones en tiempo real del usuario saliente.
    if (typeof unsubscribeFromNotifications === 'function') unsubscribeFromNotifications();

    appState.currentUser = null;
    appState.monitorRequests = [];
    localStorage.removeItem('padelApp_currentUser');
    localStorage.removeItem('padelApp_dbLogin');

    if (typeof supabase !== 'undefined' && supabase) {
        supabase.auth.signOut().catch(err => {
            console.warn('Error al cerrar sesión en Supabase:', err);
        });
    }

    const loginView = document.getElementById('login-view');
    if (loginView) loginView.style.display = 'flex';

    hideMainApp();
}

function getCurrentUser() {
    return appState.currentUser;
}

function isCoordinator() {
    return (appState.currentUser?.permissions || []).includes('coordinador');
}

function isMonitor() {
    return (appState.currentUser?.permissions || []).includes('monitor');
}

function isRecepcion() {
    return (appState.currentUser?.permissions || []).includes('recepcion');
}

function isUsuario() {
    return (appState.currentUser?.permissions || []).includes('usuario');
}

// ==========================================
// MONITOR MANAGEMENT
// ==========================================

async function addMonitor(name, email, phone) {
    try {
        const monitor = {
            id: generateId(),
            name,
            email,
            phone,
            role: 'monitor',
            createdDate: new Date().toISOString(),
        };

        const result = await db.createPersonal(monitor);
        const converted = db.convertPersonalFromDB(result);
        appState.personal.push(converted);

        if (isCoordinator()) {
            renderMonitorsList();
        }
        // persist locally as fallback
        saveToLocalStorage();
        return converted;
    } catch (error) {
        console.error('Error adding monitor:', error);
        showToast('Error al agregar monitor', 'error');
        throw error;
    }
}

async function updateMonitor(monitorId, updates) {
    try {
        await db.updatePersonal(monitorId, updates);
        const monitorIndex = appState.personal.findIndex(m => m.id === monitorId);
        if (monitorIndex !== -1) {
            appState.personal[monitorIndex] = { ...appState.personal[monitorIndex], ...updates };
        }

        if (isCoordinator()) {
            renderMonitorsList();
        }
        saveToLocalStorage();
        showToast('Monitor actualizado', 'success');
    } catch (error) {
        console.error('Error updating monitor:', error);
        showToast('Error al actualizar monitor', 'error');
    }
}

async function deleteMonitor(monitorId) {
    try {
        await db.deletePersonal(monitorId);

        appState.personal = appState.personal.filter(m => m.id !== monitorId);
        appState.classes = appState.classes.filter(c => c.monitorId !== monitorId);

        if (isCoordinator()) {
            renderMonitorsList();
            renderCalendar();
        }
        saveToLocalStorage();
        showToast('Monitor eliminado', 'success');
    } catch (error) {
        console.error('Error deleting monitor:', error);
        showToast('Error al eliminar monitor', 'error');
    }
}

function getAllMonitors() {
    return appState.personal;
}

function getMonitorById(monitorId) {
    return appState.personal.find(m => m.id === monitorId);
}

function getClassDurationHours(cls) {
    if (!cls.startTime || !cls.endTime) return 0;
    const [sh, sm = '0'] = cls.startTime.split(':');
    const [eh, em = '0'] = cls.endTime.split(':');
    const startMinutes = parseInt(sh, 10) * 60 + parseInt(sm, 10);
    const endMinutes = parseInt(eh, 10) * 60 + parseInt(em, 10);
    return Math.max(endMinutes - startMinutes, 0) / 60;
}

function getMonitorStats(monitorId) {
    const classes = appState.classes.filter(c => c.monitorId === monitorId);
    const studentIds = new Set();
    classes.forEach(cls => cls.students.forEach(sid => studentIds.add(sid)));

    const now = new Date();

    const monthlyHours = classes
        .filter(cls => {
            const [y, mo] = (cls.date || '').split('-').map(Number);
            return y === now.getFullYear() && (mo - 1) === now.getMonth();
        })
        .reduce((sum, cls) => sum + getClassDurationHours(cls), 0);

    // Monthly breakdown: classes and hours for each month of the current year
    const year = now.getFullYear();
    const monthlyBreakdown = Array.from({ length: 12 }, (_, m) => {
        const mClasses = classes.filter(cls => {
            const [y, mo] = (cls.date || '').split('-').map(Number);
            return y === year && (mo - 1) === m;
        });
        const mHours = mClasses
            .reduce((sum, cls) => sum + getClassDurationHours(cls), 0);
        return { month: m, count: mClasses.length, hours: mHours };
    });

    // Unique students with details
    const students = [...studentIds]
        .map(sid => appState.students.find(s => s.id === sid))
        .filter(Boolean)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return {
        totalClasses: classes.length,
        totalStudents: studentIds.size,
        hoursThisMonth: Number.isFinite(monthlyHours) ? monthlyHours : 0,
        monthlyBreakdown,
        students,
    };
}

function getMonitorClasses(monitorId) {
    return appState.classes.filter(c => c.monitorId === monitorId);
}

// ==========================================
// STUDENT MANAGEMENT
// ==========================================

async function addStudent(name, email, phone, level = null) {
    try {
        const student = {
            id: generateId(),
            name,
            email,
            phone,
            level: level !== null && level !== '' ? parseFloat(level) : null,
            registeredDate: new Date().toISOString(),
        };

        const result = await db.createStudent(student);
        const converted = db.convertStudentFromDB(result);
        appState.students.push(converted);

        renderStudentsList();
        renderStudentsSelector();
        saveToLocalStorage();
        showToast('Alumno agregado correctamente', 'success');
        return converted;
    } catch (error) {
        console.error('Error adding student:', error);
        showToast('Error al agregar alumno', 'error');
        throw error;
    }
}

async function deleteStudent(studentId) {
    try {
        await db.deleteStudent(studentId);

        appState.students = appState.students.filter(s => s.id !== studentId);

        appState.classes.forEach(cls => {
            cls.students = cls.students.filter(sid => sid !== studentId);
        });

        renderStudentsList();
        renderStudentsSelector();
        renderCalendar();
        saveToLocalStorage();
        showToast('Alumno eliminado', 'success');
    } catch (error) {
        console.error('Error deleting student:', error);
        showToast('Error al eliminar alumno', 'error');
    }
}

async function updateStudent(studentId, updates) {
    try {
        const result = await db.updateStudent(studentId, updates);
        const converted = db.convertStudentFromDB(result);

        const idx = appState.students.findIndex(s => s.id === studentId);
        if (idx !== -1) appState.students[idx] = converted;

        renderStudentsList();
        renderStudentsSelector();
        renderStudentsDropdown();
        renderCalendar();

        saveToLocalStorage();

        showToast('Alumno actualizado', 'success');
        return converted;
    } catch (error) {
        console.error('Error updating student:', error);
        showToast('Error al actualizar alumno', 'error');
        throw error;
    }
}

function getStudentById(studentId) {
    return appState.students.find(s => s.id === studentId);
}

function getStudentClassCount(studentId) {
    return appState.classes.filter(cls => cls.students.includes(studentId)).length;
}

// ==========================================
// CLASS MANAGEMENT
// ==========================================

async function addClass(day, startTime, endTime, studentIds) {
    try {
        const weekStart = appState.currentWeekStart;
        const dayIndex = CONFIG.days.indexOf(day);
        const date = getDateForDay(weekStart, dayIndex);

        const currentUser = getCurrentUser();
        let monitorId = null;
        let monitorName = null;

        if (isMonitor()) {
            monitorId = currentUser.id;
            monitorName = currentUser.name;
        } else if (isCoordinator()) {
            monitorId = appState.selectedMonitor || null;
            monitorName = appState.selectedMonitor ? getMonitorById(appState.selectedMonitor)?.name : null;
        }

        const commentsInput = document.getElementById('classComments');
        const comments = commentsInput ? commentsInput.value.trim() : '';

        const newClass = {
            id: generateId(),
            day,
            date: date.toISOString(),
            startTime: formatTime(startTime),
            endTime: formatTime(endTime),
            students: studentIds,
            maxCapacity: CONFIG.maxStudentsPerClass,
            status: 'active',
            isCompleted: false,
            monitorId,
            monitorName,
            comments,
        };

        try {
            const result = await db.createClass(newClass);
            const converted = db.convertClassFromDB(result);
            appState.classes.push(converted);
            renderCalendar();
            saveToLocalStorage();
            showToast('Clase creada correctamente', 'success');
            return converted;
        } catch (dbError) {
            console.warn('db.createClass falló, guardando localmente:', dbError);
            // Fallback: persist clase localmente para desarrollo/offline
            appState.classes.push(newClass);
            renderCalendar();
            saveToLocalStorage();
            showToast('Clase guardada localmente (sin conexión)', 'warning');
            return newClass;
        }
    } catch (error) {
        console.error('Error adding class:', error);
        showToast('Error al crear clase', 'error');
        throw error;
    }
}

async function updateClass(classId, updates, silent = false) {
    try {
        try {
            await db.updateClass(classId, updates);
            const classIndex = appState.classes.findIndex(c => c.id === classId);
            if (classIndex !== -1) {
                appState.classes[classIndex] = { ...appState.classes[classIndex], ...updates };
            }
            renderCalendar();
            saveToLocalStorage();
            if (!silent) showToast('Clase actualizada', 'success');
        } catch (dbError) {
            console.warn('db.updateClass falló, aplicando cambio localmente:', dbError);
            const classIndex = appState.classes.findIndex(c => c.id === classId);
            if (classIndex !== -1) {
                appState.classes[classIndex] = { ...appState.classes[classIndex], ...updates };
            }
            renderCalendar();
            saveToLocalStorage();
            if (!silent) showToast('Clase actualizada localmente (sin conexión)', 'warning');
        }
    } catch (error) {
        console.error('Error updating class:', error);
        showToast('Error al actualizar clase', 'error');
    }
}

async function deleteClass(classId) {
    try {
        try {
            await db.deleteClass(classId);
            // Refrescamos datos desde Supabase para asegurar consistencia
            try {
                await loadAllData();
            } catch (reloadError) {
                console.warn('No se pudieron recargar los datos tras borrar la clase, actualizando solo en memoria:', reloadError);
                appState.classes = appState.classes.filter(c => c.id !== classId);
            }
            saveToLocalStorage();
            showToast('Clase eliminada', 'success');
        } catch (dbError) {
            console.warn('db.deleteClass falló, eliminando localmente:', dbError);
            appState.classes = appState.classes.filter(c => c.id !== classId);
            saveToLocalStorage();
            showToast('Clase eliminada localmente (sin conexión)', 'warning');
        }
        // En cualquier caso, limpiamos la selección y redibujamos el calendario
        appState.selectedClass = null;
        renderCalendar();
    } catch (error) {
        console.error('Error deleting class:', error);
        showToast('Error al eliminar clase', 'error');
    }
}

function getClassById(classId) {
    return appState.classes.find(c => c.id === classId);
}

function getClassesForWeek(weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekStartStr = weekStart.toLocaleDateString('sv');
    const weekEndStr = weekEnd.toLocaleDateString('sv');

    let classes = appState.classes.filter(cls => {
        const dateStr = (cls.date || '').substring(0, 10);
        return dateStr >= weekStartStr && dateStr < weekEndStr;
    });

    if (isMonitor()) {
        const currentUser = getCurrentUser();
        classes = classes.filter(cls => cls.monitorId === currentUser.id);
    }

    if (isCoordinator() && appState.viewingMonitorId) {
        classes = classes.filter(cls => cls.monitorId === appState.viewingMonitorId);
    }

    return classes;
}

function getClassOccupancy(cls) {
    if (cls.isCompleted) return 'full';

    const count = cls.students.length;
    const max = cls.maxCapacity;
    const percentage = (count / max) * 100;

    if (percentage >= 100) return 'full';
    if (percentage > 0) return 'partial';
    return 'empty';
}

// ==========================================
// DATA LOADING FROM SUPABASE
// ==========================================

async function loadAllData() {
    try {
        showLoading('Cargando datos...');

        // El alumno no puede leer la tabla `students` de los demás (privacidad, students_privacy.sql):
        // carga el roster (nombre/nivel de todos, sin email/teléfono) y fusiona su propia fila completa.
        // El personal carga todos los alumnos como siempre.
        const isStudent = isUsuario();
        const studentsLoader = isStudent
            ? Promise.all([db.getStudentsRoster(), db.getStudents()]).then(([roster, own]) => {
                  const list = roster.map(s => db.convertStudentFromDB(s));
                  const ownRow = (own || [])[0];
                  if (ownRow) {
                      const ownConv = db.convertStudentFromDB(ownRow);
                      const idx = list.findIndex(s => s.id === ownConv.id);
                      if (idx !== -1) list[idx] = ownConv; else list.push(ownConv);
                  }
                  return list;
              })
            : db.getStudents().then(rows => rows.map(s => db.convertStudentFromDB(s)));

        const [monitorsData, studentsList, classesData, matchesData, holdsData] = await Promise.all([
            db.getPersonal(),
            studentsLoader,
            db.getClasses(),
            db.getMatches().catch(err => {
                // La tabla matches puede no existir aún (ejecutar matches.sql).
                console.warn('No se pudieron cargar los partidos (¿falta ejecutar matches.sql?):', err);
                return [];
            }),
            db.getActiveHolds().catch(err => {
                // Las columnas de pago pueden no existir aún (ejecutar stripe_payments.sql).
                console.warn('No se pudieron cargar las plazas retenidas (¿falta ejecutar stripe_payments.sql?):', err);
                return [];
            })
        ]);

        appState.personal = monitorsData.map(m => db.convertPersonalFromDB(m));
        appState.students = studentsList;
        appState.classes = classesData.map(c => db.convertClassFromDB(c));
        appState.matches = matchesData.map(m => db.convertMatchFromDB(m));
        appState.classHolds = holdsData.map(h => db.convertRequestFromDB(h));

        // Torneos (función definida en tournaments.js; tolera tabla inexistente).
        if (typeof loadTournaments === 'function') await loadTournaments();

        console.log('✅ Datos cargados:', {
            monitors: appState.personal.length,
            students: appState.students.length,
            classes: appState.classes.length,
            matches: appState.matches.length
        });

        hideLoading();
    } catch (error) {
        console.error('❌ Error cargando datos:', error);
        hideLoading();
        showToast('Error al cargar datos. Verifica config.js', 'error');
        throw error;
    }
}

// ==========================================
// LOCAL STORAGE FALLBACK
// ==========================================

function saveToLocalStorage() {
    try {
        localStorage.setItem('padelApp_students', JSON.stringify(appState.students || []));
        localStorage.setItem('padelApp_classes', JSON.stringify(appState.classes || []));
        localStorage.setItem('padelApp_monitors', JSON.stringify(appState.personal || []));
        localStorage.setItem('padelApp_currentUser', JSON.stringify(appState.currentUser || null));
    } catch (e) {
        console.warn('saveToLocalStorage failed:', e);
    }
}

function loadFromLocalStorage() {
    try {
        const students = localStorage.getItem('padelApp_students');
        const classes = localStorage.getItem('padelApp_classes');
        const monitors = localStorage.getItem('padelApp_monitors');
        const savedUser = localStorage.getItem('padelApp_currentUser');

        appState.students = students ? JSON.parse(students) : [];
        appState.classes = classes ? JSON.parse(classes) : [];
        appState.personal = monitors ? JSON.parse(monitors) : [];
        appState.currentUser = savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
        console.warn('loadFromLocalStorage failed:', e);
        appState.students = appState.students || [];
        appState.classes = appState.classes || [];
        appState.personal = appState.personal || [];
    }
}

// ==========================================
// UI RENDERING
// ==========================================

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthWrapper = document.getElementById('monthCalendarWrapper');

    if (!appState.currentWeekStart || !appState.currentMonthDate) {
        setAnchorDate(getAnchorDate());
    }

    const isMobile = isMobileLayout();

    if (isMobile && monthWrapper) {
        renderMonthCalendar();
    }

    if (grid) {
        grid.innerHTML = '';

        renderTimeColumn(grid);

        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            renderDayColumn(grid, dayIndex);
        }
    } else {
        console.warn('renderCalendar: element #calendarGrid not found');
    }
}

function getClassesForDate(targetDate) {
    const target = new Date(targetDate);

    let classes = appState.classes.filter(cls => {
        if (!cls.date) return false;
        return isSameCalendarDay(cls.date, target);
    });

    if (isMonitor()) {
        const currentUser = getCurrentUser();
        classes = classes.filter(cls => cls.monitorId === currentUser.id);
    }

    if (isCoordinator() && appState.viewingMonitorId) {
        classes = classes.filter(cls => cls.monitorId === appState.viewingMonitorId);
    }

    classes.sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));
    return classes;
}

// ==========================================
// CALENDARIO MENSUAL MÓVIL — scroll continuo de meses (estilo iOS/iCloud)
// Se baja con el dedo y van apareciendo los meses siguientes/anteriores.
// Estado de UI local (rango de meses renderizados); no duplica datos de appState.
// ==========================================
// ==========================================
// NAVEGACIÓN MÓVIL — dos ejes independientes
//  · Eje jerárquico: mobileViewLevel ('month' | 'day')
//  · Eje temporal:   appState.selectedDayDate es la ÚNICA fecha ancla;
//    currentWeekStart y currentMonthDate se derivan de ella vía setAnchorDate.
//    (currentMonthDate refleja además el mes visible durante el scroll.)
// ==========================================
let mobileViewLevel = 'month';

function setAnchorDate(date) {
    const d = new Date(date);
    appState.selectedDayDate = d.toISOString();
    appState.currentWeekStart = getMonday(d);
    appState.currentMonthDate = new Date(d.getFullYear(), d.getMonth(), 1);
}

function getAnchorDate() {
    return appState.selectedDayDate ? new Date(appState.selectedDayDate) : new Date();
}

// Entrar en la vista de día con una fecha (tap en celda del mes, swipe…)
function openDayView(date) {
    setAnchorDate(date);
    mobileViewLevel = 'day';
    // Transición animada: la celda del día "crece" hasta la vista de día.
    // La página vuelve arriba para mostrar la vista de día completa.
    withViewTransition(() => {
        renderMonthCalendar();
        window.scrollTo(0, 0);
    });
}

// Cambiar de día sin salir de la vista de día (swipe horizontal o botones ‹ ›)
function navigateDay(delta) {
    const d = getAnchorDate();
    d.setDate(d.getDate() + delta);
    openDayView(d);
}

// Nivel de zoom del mes (pellizco, estilo iOS):
// 0 = compacto (contador de clases) · 1 = chips con nombre · 2 = chips con nombre y hora
let monthZoomLevel = 0;
try {
    monthZoomLevel = Math.max(0, Math.min(2, parseInt(localStorage.getItem('padel_monthZoomLevel'), 10) || 0));
} catch (e) { /* localStorage no disponible */ }

// El pellizco solo ENCOLA el cambio de nivel; el re-render se hace al soltar
// los dedos (onGestureEnd). Reconstruir el DOM en mitad del gesto hace que
// iOS pierda el touchend (el elemento tocado desaparece) y el contenedor
// quedaba con el scroll bloqueado para siempre.
let pendingMonthZoom = null;

function queueMonthZoom(level) {
    const clamped = Math.max(0, Math.min(2, level));
    if (clamped === monthZoomLevel || clamped === pendingMonthZoom) return;
    pendingMonthZoom = clamped;
    if (window.navigator.vibrate) window.navigator.vibrate(20);
}

function applyPendingMonthZoom() {
    if (pendingMonthZoom === null) return;
    monthZoomLevel = pendingMonthZoom;
    pendingMonthZoom = null;
    try { localStorage.setItem('padel_monthZoomLevel', String(monthZoomLevel)); } catch (e) { /* noop */ }
    monthZoomDirty = true; // las alturas de celda cambian: rehacer el lienzo
    renderMonthCalendar();
}

// Cerrar la vista de día y volver al calendario mensual (botón "‹ Mes" y pellizco)
function closeDayViewToMonth() {
    // Transición animada: la vista de día "se encoge" de vuelta a su celda
    withViewTransition(() => {
        mobileViewLevel = 'month';
        const panel = document.getElementById('dayClassesPanel');
        if (panel) panel.classList.remove('visible');
        // Liberar el bloqueo de fondo (scrollToMonthSection recolocará después)
        unlockBackgroundScroll('day-view');
        const monthWrapper = document.getElementById('monthCalendarWrapper');
        if (monthWrapper) monthWrapper.style.display = '';
        // Refrescar las secciones (los datos pudieron cambiar en la vista de
        // día) y recolocar la página con el mes del día que estabas viendo
        const cont = document.getElementById('monthScrollContainer');
        if (cont) cont.querySelectorAll('.month-section').forEach(s => s.remove());
        scrollToMonthSection(getAnchorDate(), false);
        updateVirtualMonths();
    });
}

// Gesto de pellizco con dos dedos (estilo calendario de iOS):
// separar dedos = zoom in (mes → día) · juntar dedos = zoom out (día → mes)
function setupPinchGesture(el, handlers) {
    let startDist = 0;
    let active = false;
    let fired = false;
    let centerX = 0;
    let centerY = 0;

    // lockPage: el scroll a congelar durante el pellizco es el de la PÁGINA
    // (la lista de meses usa el scroll de la ventana, como iOS)
    const lockPage = !!handlers.lockPage;
    const scrollTarget = lockPage ? window : el;
    const getScrollPos = () => (lockPage ? window.scrollY : el.scrollTop);
    const setScrollPos = (v) => {
        if (lockPage) window.scrollTo(0, v);
        else el.scrollTop = v;
    };

    function touchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }

    let prevOverflowY = '';
    let lockTop = 0;
    let unlockTimer = null;

    // Candado de posición: iOS sigue desplazando un scroll ya iniciado aunque
    // se cambie overflow o se llame a preventDefault. Mientras el pellizco esté
    // activo, cualquier scroll que se cuele se revierte inmediatamente.
    const lockScroll = () => {
        if (getScrollPos() !== lockTop) setScrollPos(lockTop);
    };

    el.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            // Un dedo tras un pellizco: liberar el candado residual al instante,
            // el usuario quiere scrollear y no hay que pisarle el gesto
            clearTimeout(unlockTimer);
            scrollTarget.removeEventListener('scroll', lockScroll);
            // Recuperación: si un pellizco anterior quedó a medias (iOS perdió
            // su touchend), restaurar el scroll ahora
            if (active || el.dataset.pinching === '1') {
                if (!lockPage) el.style.overflowY = prevOverflowY || '';
                delete el.dataset.pinching;
                active = false;
                if (handlers.onGestureEnd) handlers.onGestureEnd();
            }
        }
        if (e.touches.length === 2) {
            active = true;
            fired = false;
            startDist = touchDistance(e.touches);
            centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            el.dataset.pinching = '1';
            if (!lockPage) {
                prevOverflowY = el.style.overflowY;
                el.style.overflowY = 'hidden';
            }
            clearTimeout(unlockTimer);
            lockTop = getScrollPos();
            scrollTarget.addEventListener('scroll', lockScroll);
        }
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        if (!active || e.touches.length !== 2) return;
        // Con dos dedos el gesto es nuestro: bloquear scroll/zoom nativo
        e.preventDefault();
        if (fired || startDist <= 0) return;
        centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const ratio = touchDistance(e.touches) / startDist;
        if (ratio > 1.25 && handlers.onZoomIn) {
            fired = true;
            handlers.onZoomIn(centerX, centerY);
            lockTop = getScrollPos();
        } else if (ratio < 0.8 && handlers.onZoomOut) {
            fired = true;
            handlers.onZoomOut(centerX, centerY);
            lockTop = getScrollPos();
        }
    }, { passive: false });

    const resetPinch = (e) => {
        if (!e.touches || e.touches.length < 2) {
            if (active) {
                if (!lockPage) el.style.overflowY = prevOverflowY || '';
                delete el.dataset.pinching;
                // Mantener el candado un instante más para absorber la
                // inercia residual del scroll que iOS pueda soltar al final
                clearTimeout(unlockTimer);
                unlockTimer = setTimeout(() => {
                    scrollTarget.removeEventListener('scroll', lockScroll);
                }, 250);
                active = false;
                // El gesto terminó: aplicar ahora los cambios encolados
                // (re-render seguro, ya no hay dedos sobre el DOM)
                if (handlers.onGestureEnd) handlers.onGestureEnd();
                // El re-render pudo recolocar el scroll: la nueva posición
                // pasa a ser la bloqueada durante la ventana de inercia
                lockTop = getScrollPos();
            }
            active = false;
        }
    };
    el.addEventListener('touchend', resetPinch);
    el.addEventListener('touchcancel', resetPinch);
    // Redundancia deliberada: si iOS no entrega el touchend al contenedor
    // (target original eliminado), el documento sí lo recibe
    document.addEventListener('touchend', resetPinch);
    document.addEventListener('touchcancel', resetPinch);
}

// Swipe horizontal en la vista de día → día anterior / siguiente (estilo iOS)
function setupDaySwipe(el) {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;

    el.addEventListener('touchstart', (e) => {
        // Ignorar pellizcos (dos dedos) y gestos que empiezan sobre una clase
        // (ahí manda el long-press de arrastre)
        if (e.touches.length !== 1 || e.target.closest('.class-card')) {
            tracking = false;
            return;
        }
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        startTime = Date.now();
        tracking = true;
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        if (!t) return;
        if (Date.now() - startTime > 600) return;      // demasiado lento: no es swipe
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) < 60) return;                 // umbral mínimo de recorrido
        if (Math.abs(dx) < Math.abs(dy) * 1.5) return; // debe dominar el eje horizontal
        navigateDay(dx < 0 ? 1 : -1);
    });
}

function buildMonthSection(year, month) {
    const section = document.createElement('div');
    section.className = 'month-section';
    section.dataset.year = String(year);
    section.dataset.month = String(month);

    const title = document.createElement('div');
    title.className = 'month-section-title';
    title.textContent = formatMonthYearSpanish(new Date(year, month, 1));
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'month-calendar-grid';

    const firstOfMonth = new Date(year, month, 1);
    const startDay = (firstOfMonth.getDay() + 6) % 7; // 0 = lunes
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const todayStr = formatDateISO(new Date());
    const selectedDayStr = appState.selectedDayDate ? formatDateISO(appState.selectedDayDate) : null;

    const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;
    for (let cellIndex = 0; cellIndex < totalCells; cellIndex++) {
        const cell = document.createElement('div');
        cell.className = 'month-day-cell';

        const dayNumber = cellIndex - startDay + 1;
        if (dayNumber < 1 || dayNumber > daysInMonth) {
            cell.classList.add('empty');
            grid.appendChild(cell);
            continue;
        }

        const cellDate = new Date(year, month, dayNumber);
        const cellDateStr = formatDateISO(cellDate);
        cell.dataset.day = String(dayNumber);

        const classesForDay = monthClassesByDate
            ? (monthClassesByDate.get(cellDateStr) || [])
            : getClassesForDate(cellDate);
        const hasClasses = classesForDay.length > 0;
        if (hasClasses) cell.classList.add('has-classes');
        if (cellDateStr === todayStr) cell.classList.add('today');
        if (selectedDayStr && cellDateStr === selectedDayStr) cell.classList.add('selected-day');

        const dayLabel = document.createElement('div');
        dayLabel.className = 'month-day-number';
        dayLabel.textContent = String(dayNumber);
        cell.appendChild(dayLabel);

        if (hasClasses) {
            if (monthZoomLevel === 0) {
                // Nivel compacto: solo el número de clases
                const badge = document.createElement('div');
                badge.className = 'month-day-badge';
                badge.textContent = `${classesForDay.length}`;
                cell.appendChild(badge);
            } else {
                // Niveles ampliados: chips estilo iOS con el alumno (y hora en nivel 2)
                const maxChips = monthZoomLevel === 1 ? 2 : 5;
                classesForDay.slice(0, maxChips).forEach(cls => {
                    const chip = document.createElement('div');
                    chip.className = `month-event-chip chip-${getClassOccupancy(cls)}`;

                    const firstStudent = (cls.students && cls.students.length > 0)
                        ? getStudentById(cls.students[0])
                        : null;
                    const label = firstStudent ? firstStudent.name : 'Clase';
                    const extraCount = (cls.students || []).length - 1;

                    if (monthZoomLevel === 1) {
                        chip.textContent = extraCount > 0 ? `${label} +${extraCount}` : label;
                    } else {
                        const nameEl = document.createElement('span');
                        nameEl.className = 'chip-name';
                        nameEl.textContent = extraCount > 0 ? `${label} +${extraCount}` : label;
                        const timeEl = document.createElement('span');
                        timeEl.className = 'chip-time';
                        timeEl.textContent = cls.startTime;
                        chip.appendChild(nameEl);
                        chip.appendChild(timeEl);
                    }
                    cell.appendChild(chip);
                });

                if (classesForDay.length > maxChips) {
                    const more = document.createElement('div');
                    more.className = 'month-more-chip';
                    more.textContent = `+${classesForDay.length - maxChips} más`;
                    cell.appendChild(more);
                }
            }
        }

        cell.addEventListener('click', () => openDayView(cellDate));

        grid.appendChild(cell);
    }

    section.appendChild(grid);
    return section;
}

// ==========================================
// VIRTUALIZACIÓN DEL CALENDARIO MENSUAL (estilo UICollectionView de iOS)
// Cada mes se pinta en una posición ABSOLUTA calculada dentro de un lienzo
// alto. Materializar o quitar un mes no desplaza a los demás, así que jamás
// hay que ajustar el scroll: sin saltos y sin matar la inercia, en cualquier
// navegador. Las alturas son deterministas (celdas de altura fija por nivel
// de zoom), medidas una vez por número de filas.
// ==========================================
const MONTH_VIEW_BUFFER = 1600;   // px materializados por delante y por detrás

// Índice fecha → clases (con filtro de rol aplicado). Construir un mes deja
// de escanear TODAS las clases por cada celda: mirar el mapa es O(1).
// Se reconstruye en cada render por datos (renderMonthCalendar).
let monthClassesByDate = null;

function rebuildMonthClassesIndex() {
    monthClassesByDate = new Map();
    let classes = appState.classes;
    if (isMonitor()) {
        const cu = getCurrentUser();
        classes = classes.filter(c => c.monitorId === cu.id);
    } else if (isCoordinator() && appState.viewingMonitorId) {
        classes = classes.filter(c => c.monitorId === appState.viewingMonitorId);
    }
    classes.forEach(c => {
        if (!c || !c.date) return;
        const key = formatDateISO(c.date);
        if (!monthClassesByDate.has(key)) monthClassesByDate.set(key, []);
        monthClassesByDate.get(key).push(c);
    });
    monthClassesByDate.forEach(list =>
        list.sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime))
    );
}

let monthLayout = new Map();      // idx (año*12+mes) -> { top, height }
let monthLayoutMin = 0;           // rango contiguo cacheado
let monthLayoutMax = 0;
let monthHeightByRows = {};       // nº de filas (4/5/6) -> altura en px
let monthZoomDirty = false;       // las alturas cambiaron (zoom o rotación)

function monthIndex(y, m) { return y * 12 + m; }
function ymOf(idx) { return { y: Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 }; }

function rowsInMonth(y, m) {
    const startDay = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    return Math.ceil((startDay + days) / 7);
}

// Altura de un mes según sus filas, medida con una sección sonda (una vez
// por combinación filas×zoom; el contenido no altera la altura: es fija)
function getMonthHeight(y, m) {
    const rows = rowsInMonth(y, m);
    if (monthHeightByRows[rows]) return monthHeightByRows[rows];
    const container = document.getElementById('monthScrollContainer');
    if (!container) return 400;
    const probe = buildMonthSection(y, m);
    probe.style.visibility = 'hidden';
    probe.style.top = '0px';
    container.appendChild(probe);
    const h = probe.offsetHeight || 400;
    probe.remove();
    monthHeightByRows[rows] = h;
    return h;
}

function initMonthLayout(anchorIdx) {
    monthLayout = new Map();
    monthHeightByRows = {};
    const { y, m } = ymOf(anchorIdx);
    const h = getMonthHeight(y, m);
    // Pista inicial: 3 AÑOS de hueco por encima del ancla. Ni una cadena de
    // flings con inercia puede agotarla antes de que una pausa la reponga.
    let topAllowance = 0;
    for (let i = 1; i <= 36; i++) {
        const a = ymOf(anchorIdx - i);
        topAllowance += getMonthHeight(a.y, a.m);
    }
    monthLayout.set(anchorIdx, { top: topAllowance, height: h });
    monthLayoutMin = anchorIdx;
    monthLayoutMax = anchorIdx;
}

function extendLayoutUp() {
    const prev = monthLayout.get(monthLayoutMax);
    const nextIdx = monthLayoutMax + 1;
    const { y, m } = ymOf(nextIdx);
    monthLayout.set(nextIdx, { top: prev.top + prev.height, height: getMonthHeight(y, m) });
    monthLayoutMax = nextIdx;
}

function extendLayoutDown() {
    const prevIdx = monthLayoutMin - 1;
    const { y, m } = ymOf(prevIdx);
    const h = getMonthHeight(y, m);
    const below = monthLayout.get(monthLayoutMin);
    if (below.top - h < 0) return false; // sin hueco arriba: hará falta rebase
    monthLayout.set(prevIdx, { top: below.top - h, height: h });
    monthLayoutMin = prevIdx;
    return true;
}

// Rebase: ganar N meses de hueco por arriba desplazando TODO (layout,
// secciones, lienzo y scroll) la misma cantidad. Visualmente invisible;
// solo se hace con el scroll en calma para no matar la inercia.
function rebaseCanvas(extraMonths) {
    const container = document.getElementById('monthScrollContainer');
    if (!container || monthLayout.size === 0) return;
    let K = 0;
    for (let i = 1; i <= extraMonths; i++) {
        const { y, m } = ymOf(monthLayoutMin - i);
        K += getMonthHeight(y, m);
    }
    monthLayout.forEach(l => { l.top += K; });
    container.querySelectorAll('.month-section').forEach(sec => {
        sec.style.top = `${parseFloat(sec.style.top) + K}px`;
    });
    container.style.height = `${(parseFloat(container.style.height) || 0) + K}px`;
    window.scrollTo(0, window.scrollY + K);
}

function ensureLayoutFor(idx) {
    while (idx > monthLayoutMax) extendLayoutUp();
    while (idx < monthLayoutMin) {
        if (!extendLayoutDown()) rebaseCanvas(12);
    }
    return monthLayout.get(idx);
}

function materializeMonth(idx, container) {
    if (container.querySelector(`.month-section[data-idx="${idx}"]`)) return;
    const { y, m } = ymOf(idx);
    const lay = monthLayout.get(idx);
    const sec = buildMonthSection(y, m);
    sec.dataset.idx = String(idx);
    sec.style.top = `${lay.top}px`;
    container.appendChild(sec);
}

// Núcleo de la virtualización: materializa los meses de la ventana visible
// (± buffer) y quita los que quedaron lejos. Nunca toca el scroll.
function updateVirtualMonths() {
    const wrapper = document.getElementById('monthCalendarWrapper');
    const container = document.getElementById('monthScrollContainer');
    if (!wrapper || !container || wrapper.style.display === 'none') return;
    if (monthLayout.size === 0) return;

    const viewTop = -container.getBoundingClientRect().top;
    const from = Math.max(viewTop - MONTH_VIEW_BUFFER, 0);
    const to = viewTop + window.innerHeight + MONTH_VIEW_BUFFER;

    // Extender el layout cacheado hasta cubrir la ventana
    while (monthLayout.get(monthLayoutMin).top > from && extendLayoutDown()) { /* seguir */ }

    // Sin hueco arriba y a punto de tocar el tope del lienzo: rebase de
    // emergencia AHORA (mejor un microajuste que chocar contra el muro).
    // Con 3 años de pista inicial + reposición en cada pausa, este caso
    // es prácticamente inalcanzable.
    if (monthLayout.get(monthLayoutMin).top > from &&
        viewTop < window.innerHeight * 1.5) {
        rebaseCanvas(48);
        updateVirtualMonths();
        return;
    }

    while (true) {
        const maxL = monthLayout.get(monthLayoutMax);
        if (maxL.top + maxL.height >= to) break;
        extendLayoutUp();
    }

    // Materializar la ventana y localizar el mes visible
    const needed = new Set();
    let visibleIdx = null;
    for (let i = monthLayoutMin; i <= monthLayoutMax; i++) {
        const l = monthLayout.get(i);
        if (l.top <= viewTop + 90) visibleIdx = i;
        if (l.top + l.height <= from || l.top >= to) continue;
        needed.add(i);
        materializeMonth(i, container);
    }

    if (visibleIdx !== null) {
        const { y, m } = ymOf(visibleIdx);
        appState.currentMonthDate = new Date(y, m, 1);
    }

    // Desmaterializar con HISTÉRESIS: los meses recién pasados se conservan
    // un buffer extra, así invertir la dirección del scroll no obliga a
    // reconstruirlos al instante (evita el tirón al cambiar de sentido)
    container.querySelectorAll('.month-section').forEach(sec => {
        const i = parseInt(sec.dataset.idx, 10);
        if (needed.has(i)) return;
        const l = monthLayout.get(i);
        if (!l || l.top + l.height < from - MONTH_VIEW_BUFFER || l.top > to + MONTH_VIEW_BUFFER) {
            sec.remove();
        }
    });

    // El lienzo crece por abajo según se avanza (crecer abajo no mueve nada)
    const maxL = monthLayout.get(monthLayoutMax);
    const neededHeight = maxL.top + maxL.height + window.innerHeight;
    if ((parseFloat(container.style.height) || 0) < neededHeight) {
        container.style.height = `${neededHeight}px`;
    }
}

// (la antigua poda por ventana ya no existe: la virtualización materializa y
// desmaterializa por posición, sin tocar nunca el scroll)

let monthIdleTimer = null;

function onMonthScroll() {
    // El scroll de meses ES el scroll de la página (una sola superficie, como iOS)
    if (!isMobileLayout() || mobileViewLevel !== 'month') return;
    const container = document.getElementById('monthScrollContainer');
    if (!container || container.dataset.pinching === '1') return;
    // El calendario puede estar oculto aunque mobileViewLevel siga en 'month'
    // (p. ej. en el panel del coordinador, con #calendarSectionContainer en
    // display:none): con un ancestro oculto getBoundingClientRect() da 0 y el
    // rebase creería que falta margen arriba, disparando un window.scrollTo
    // que da el "pum". offsetParent === null detecta ese ancestro oculto.
    if (container.offsetParent === null) return;

    updateVirtualMonths();

    // Con el scroll en calma, ampliar el margen superior si escasea
    // (rebase invisible: jamás durante el gesto, para no matar la inercia)
    clearTimeout(monthIdleTimer);
    monthIdleTimer = setTimeout(maybeExtendHeadroom, 180);
}

// El listener vive en la ventana: la lista de meses no tiene scroll propio
window.addEventListener('scroll', onMonthScroll, { passive: true });

function maybeExtendHeadroom() {
    if (!isMobileLayout() || mobileViewLevel !== 'month') return;
    const container = document.getElementById('monthScrollContainer');
    if (!container || container.dataset.pinching === '1' || monthLayout.size === 0) return;
    // No reposicionar el scroll si el calendario está oculto (ancestro en
    // display:none): el rect vale 0 y el rebase daría un salto de scroll
    if (container.offsetParent === null) return;
    const viewTop = -container.getBoundingClientRect().top;
    if (viewTop > window.innerHeight * 3) return; // aún hay margen de sobra
    // Con el scroll en calma el rebase es 100% invisible: reponer 3 años de
    // pista para que el rebase de emergencia en movimiento nunca haga falta
    rebaseCanvas(36);
    updateVirtualMonths();
}

// Colocar la página de forma que un mes concreto quede arriba del calendario
function scrollToMonthSection(date, smooth) {
    const container = document.getElementById('monthScrollContainer');
    if (!container || monthLayout.size === 0) return;
    const lay = ensureLayoutFor(monthIndex(date.getFullYear(), date.getMonth()));
    const containerTopPage = container.getBoundingClientRect().top + window.scrollY;
    const top = containerTopPage + lay.top - 90;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
}

function renderMonthCalendar() {
    const wrapper = document.getElementById('monthCalendarWrapper');
    if (!wrapper) return;

    const baseDate = new Date(appState.currentMonthDate || new Date());
    const baseMonth = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);

    // Índice fecha → clases fresco para este render (lo usan las sondas
    // de altura y cada materialización posterior durante el scroll)
    rebuildMonthClassesIndex();

    let container = document.getElementById('monthScrollContainer');
    if (!container) {
        // Primera construcción: toolbar ("Hoy"), cabecera de días y contenedor
        wrapper.innerHTML = '';

        const toolbar = document.createElement('div');
        toolbar.className = 'month-scroll-toolbar';

        // Grupo izquierdo: píldora "‹ Panel" (solo coordinador viendo el
        // calendario de un monitor; la cabecera en flujo quedaba tapada por
        // esta barra fija y se perdía al scrollear) + botón "Hoy"
        const leftActions = document.createElement('div');
        leftActions.className = 'month-top-actions';

        const backToPanelBtn = document.createElement('button');
        backToPanelBtn.type = 'button';
        backToPanelBtn.id = 'monthBackToPanelBtn';
        backToPanelBtn.className = 'day-back-btn';
        backToPanelBtn.title = 'Volver al panel de coordinador';
        backToPanelBtn.setAttribute('aria-label', 'Volver al panel de coordinador');
        backToPanelBtn.innerHTML = '<span class="day-back-chevron">‹</span> Panel';
        backToPanelBtn.style.display = 'none';
        backToPanelBtn.addEventListener('click', () => backToCoordinatorDashboard());
        leftActions.appendChild(backToPanelBtn);

        const todayBtn = document.createElement('button');
        todayBtn.type = 'button';
        todayBtn.id = 'monthScrollTodayBtn';
        todayBtn.className = 'btn btn-secondary btn-sm';
        todayBtn.textContent = 'Hoy';
        todayBtn.addEventListener('click', () => {
            // "Hoy": scroll animado hasta el mes actual, esté donde esté
            // (si sus secciones no están materializadas, se materializan al llegar)
            setAnchorDate(new Date());
            const now = new Date();
            const cont = document.getElementById('monthScrollContainer');
            if (cont) {
                const prevSel = cont.querySelector('.month-day-cell.selected-day');
                if (prevSel) prevSel.classList.remove('selected-day');
                const sec = cont.querySelector(
                    `.month-section[data-year="${now.getFullYear()}"][data-month="${now.getMonth()}"]`
                );
                if (sec) {
                    const todayCell = sec.querySelector(`.month-day-cell[data-day="${now.getDate()}"]`);
                    if (todayCell) todayCell.classList.add('selected-day');
                }
            }
            scrollToMonthSection(now, true);
        });
        leftActions.appendChild(todayBtn);
        toolbar.appendChild(leftActions);

        // Grupo derecho de la barra superior (estilo iOS): buscar, alumnos y salir
        const topActions = document.createElement('div');
        topActions.className = 'month-top-actions';

        // Campana de avisos 🔔, A LA IZQUIERDA de la lupa, mismo tamaño de icono.
        // Se crea SIEMPRE (oculta): esta toolbar se construye una sola vez y puede
        // montarse ANTES de resolverse el rol del usuario (primer renderCalendar de
        // initializeApp, con currentUser aún null). renderNotifBadge la muestra
        // cuando ya se sabe que el usuario es monitor. Misma bandeja que el botón
        // de escritorio.
        const notifFloatBtn = document.createElement('button');
        notifFloatBtn.type = 'button';
        notifFloatBtn.className = 'day-icon-btn notif-icon-btn';
        notifFloatBtn.id = 'notifBellBtnMobile';
        notifFloatBtn.title = 'Avisos';
        notifFloatBtn.setAttribute('aria-label', 'Avisos');
        notifFloatBtn.style.display = 'none';
        notifFloatBtn.innerHTML = '🔔<span class="notif-icon-badge" id="notifBellBadgeMobile" style="display:none;">0</span>';
        notifFloatBtn.addEventListener('click', () => openNotifModal());
        topActions.appendChild(notifFloatBtn);
        renderNotifBadge();

        const searchFloatBtn = document.createElement('button');
        searchFloatBtn.type = 'button';
        searchFloatBtn.className = 'day-icon-btn';
        searchFloatBtn.title = 'Buscar clases por alumno';
        searchFloatBtn.setAttribute('aria-label', 'Buscar clases por alumno');
        searchFloatBtn.textContent = '🔍';
        searchFloatBtn.addEventListener('click', () => openSearchClassesModal());
        topActions.appendChild(searchFloatBtn);

        const studentsFloatBtn = document.createElement('button');
        studentsFloatBtn.type = 'button';
        studentsFloatBtn.className = 'day-icon-btn';
        studentsFloatBtn.title = 'Ver alumnos';
        studentsFloatBtn.setAttribute('aria-label', 'Ver alumnos');
        studentsFloatBtn.textContent = '👥';
        studentsFloatBtn.addEventListener('click', () => {
            renderStudentsDropdown();
            openModal('studentsModal');
        });
        topActions.appendChild(studentsFloatBtn);

        const homeFloatBtn = document.createElement('button');
        homeFloatBtn.type = 'button';
        homeFloatBtn.className = 'day-icon-btn';
        homeFloatBtn.title = 'Cerrar sesión';
        homeFloatBtn.setAttribute('aria-label', 'Cerrar sesión');
        homeFloatBtn.textContent = '🏠';
        homeFloatBtn.addEventListener('click', () => logout());
        topActions.appendChild(homeFloatBtn);

        toolbar.appendChild(topActions);
        wrapper.appendChild(toolbar);

        const weekdays = document.createElement('div');
        weekdays.className = 'month-scroll-weekdays';
        ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach(d => {
            const s = document.createElement('span');
            s.textContent = d;
            weekdays.appendChild(s);
        });
        wrapper.appendChild(weekdays);

        container = document.createElement('div');
        container.id = 'monthScrollContainer';
        container.className = 'month-scroll-container';

        // Pellizco sobre el mes: cambia el nivel de detalle de las celdas
        // (separar dedos = más detalle · juntar dedos = más compacto).
        // El cambio se encola y se aplica al soltar los dedos. lockPage: el
        // scroll a congelar durante el gesto es el de la página.
        setupPinchGesture(container, {
            lockPage: true,
            onZoomIn: () => queueMonthZoom(monthZoomLevel + 1),
            onZoomOut: () => queueMonthZoom(monthZoomLevel - 1),
            onGestureEnd: () => applyPendingMonthZoom()
        });

        wrapper.appendChild(container);
    }

    // La píldora "‹ Panel" solo se muestra cuando un coordinador está viendo
    // el calendario de un monitor (la barra persiste entre renders)
    const backToPanelBtn = document.getElementById('monthBackToPanelBtn');
    if (backToPanelBtn) {
        backToPanelBtn.style.display =
            (isCoordinator() && appState.viewingMonitorId) ? '' : 'none';
    }

    // ¿La lista de meses está a la vista? (en vista de día el wrapper está oculto
    // y no se puede ni medir ni recolocar el scroll de la página)
    const monthListVisible = wrapper.style.display !== 'none';

    // Clase de zoom ANTES de medir: controla las alturas de celda
    container.classList.remove('zoom-1', 'zoom-2');
    if (monthZoomLevel > 0) container.classList.add(`zoom-${monthZoomLevel}`);

    // Con la app oculta (antes del login) no se puede medir: esperar
    if (container.offsetParent === null && monthLayout.size === 0) return;

    if (monthLayout.size === 0 || monthZoomDirty) {
        // (Re)construir el lienzo: primera vez, cambio de zoom o rotación.
        // Ancla visual: mantener el mes visible en su sitio si lo hay.
        let pin = null;
        if (monthZoomDirty && monthListVisible && monthLayout.size > 0) {
            const viewTop = -container.getBoundingClientRect().top;
            for (let i = monthLayoutMin; i <= monthLayoutMax; i++) {
                const l = monthLayout.get(i);
                if (l.top <= viewTop + 90) {
                    pin = { idx: i, progress: (viewTop + 90 - l.top) / l.height };
                }
            }
        }
        monthZoomDirty = false;

        // Congelar la altura del zoom máximo en px EN ESTE MOMENTO: usar dvh
        // en vivo desestabiliza el lienzo cuando Safari muestra/oculta su
        // barra en pleno scroll (la altura del viewport cambia sola)
        container.style.setProperty(
            '--zoom2-cell',
            `${Math.max(200, Math.round(window.innerHeight * 0.42) - 24)}px`
        );

        container.querySelectorAll('.month-section').forEach(s => s.remove());
        const centerIdx = pin
            ? pin.idx
            : monthIndex(baseMonth.getFullYear(), baseMonth.getMonth());
        initMonthLayout(centerIdx);

        const lay = monthLayout.get(centerIdx);
        container.style.height = `${lay.top + lay.height + window.innerHeight * 2}px`;

        if (monthListVisible) {
            const containerTopPage = container.getBoundingClientRect().top + window.scrollY;
            const progress = pin ? Math.min(Math.max(pin.progress, 0), 1) : 0;
            window.scrollTo(0, Math.max(0, containerTopPage + lay.top - 90 + progress * lay.height));
        }
        updateVirtualMonths();
    } else {
        // Re-render por cambio de datos: reconstruir en el sitio la ventana
        // materializada (posiciones idénticas → cero desplazamiento)
        container.querySelectorAll('.month-section').forEach(s => s.remove());
        updateVirtualMonths();
    }

    if (!appState.selectedDayDate) {
        setAnchorDate(new Date());
    }

    // Vista de día abierta → refrescarla (el mes queda oculto detrás);
    // si no, asegurar que el calendario mensual está visible
    if (mobileViewLevel === 'day') {
        renderDayClassesPanel(getAnchorDate());
    } else {
        const panel = document.getElementById('dayClassesPanel');
        if (panel) panel.classList.remove('visible');
        unlockBackgroundScroll('day-view');
        wrapper.style.display = '';
    }
}

function getClassesForDateAndHour(date, hour) {
    const classesForDay = getClassesForDate(date);
    return classesForDay.filter(cls => {
        if (!cls.startTime) return false;
        const startHour = parseInt(cls.startTime.split(':')[0], 10);
        return startHour === hour;
    });
}

function renderDayClassesPanel(date) {
    const panel = document.getElementById('dayClassesPanel');
    const titleEl = document.getElementById('dayClassesTitle');
    const gridEl = document.getElementById('dayViewGrid');
    if (!panel || !titleEl || !gridEl) return;

    panel.classList.add('visible');
    // Vista de día a pantalla completa: bloquear el scroll de la página de fondo.
    // Idempotente: renderDayClassesPanel se llama en cada refresco de datos.
    lockBackgroundScroll('day-view');

    const d = new Date(date);
    const weekdayIndex = (d.getDay() + 6) % 7; // 0=Lunes
    const weekdayName = CONFIG.days[weekdayIndex];

    // Vista de día a pantalla completa (estilo iOS): se oculta el calendario
    // mensual y el botón "‹ Mes" permite volver a él
    const monthWrapper = document.getElementById('monthCalendarWrapper');
    if (monthWrapper) monthWrapper.style.display = 'none';
    const backLabel = document.getElementById('dayBackMonthLabel');
    if (backLabel) backLabel.textContent = formatMonthYearSpanish(d).split(' ')[0];

    // La fecha mostrada es la ancla: semana y mes se derivan de ella
    // (el guardado del formulario y el drag táctil usan currentWeekStart)
    setAnchorDate(d);

    titleEl.textContent = `${weekdayName} ${formatDate(d)}`;

    const classesForDay = getClassesForDate(d);

    // Sin aviso de "no hay clases": la rejilla de horas vacía ya lo comunica.
    const emptyMsg = document.getElementById('dayViewEmptyMsg');
    if (emptyMsg) emptyMsg.remove();

    gridEl.innerHTML = '';
    const timeColumn = document.createElement('div');
    timeColumn.className = 'time-column day-view-time-column';

    const dayColumn = document.createElement('div');
    dayColumn.className = 'day-column day-view-day-column';

    for (let hour = CONFIG.hoursStart; hour < CONFIG.hoursEnd; hour++) {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        timeSlot.textContent = `${String(hour).padStart(2, '0')}:00`;
        timeColumn.appendChild(timeSlot);

        const cell = document.createElement('div');
        cell.className = 'calendar-cell';

        const classesInSlot = getClassesForDateAndHour(d, hour);
        if (classesInSlot.length > 0) {
            classesInSlot.forEach(cls => {
                const classCard = createClassCard(cls);
                cell.appendChild(classCard);
            });
            cell.classList.add('has-class');
        } else {
            // Tap corto: crear clase a la hora en punto
            cell.addEventListener('click', () => {
                if (cell.dataset.lpFired === '1') return; // ya gestionado por la pulsación larga
                openAddClassModal(weekdayName, hour);
            });

            // Pulsación larga (estilo iOS): crear clase en el cuarto de hora
            // exacto donde está el dedo dentro de la celda
            cell.addEventListener('touchstart', (startEv) => {
                if (startEv.touches.length > 1) return;
                const touch = startEv.touches[0];
                if (!touch) return;
                const pressX = touch.clientX;
                const pressY = touch.clientY;
                let movedPress = false;

                const lpTimer = setTimeout(() => {
                    if (movedPress) return;
                    cell.dataset.lpFired = '1';
                    setTimeout(() => { delete cell.dataset.lpFired; }, 700);
                    if (window.navigator.vibrate) window.navigator.vibrate(30);

                    const rect = cell.getBoundingClientRect();
                    const ratio = rect.height > 0 ? (pressY - rect.top) / rect.height : 0;
                    let minute = Math.round((ratio * 60) / 15) * 15;
                    if (minute > 45) minute = 45;
                    if (minute < 0) minute = 0;
                    openAddClassModal(weekdayName, hour, minute);
                }, 450);

                const cancelPress = () => {
                    clearTimeout(lpTimer);
                    cell.removeEventListener('touchmove', onPressMove);
                    cell.removeEventListener('touchend', cancelPress);
                    cell.removeEventListener('touchcancel', cancelPress);
                };
                const onPressMove = (ev) => {
                    const t = ev.touches[0];
                    if (!t) return;
                    if (Math.abs(t.clientX - pressX) > 10 || Math.abs(t.clientY - pressY) > 10) {
                        movedPress = true;
                        cancelPress();
                    }
                };
                cell.addEventListener('touchmove', onPressMove, { passive: true });
                cell.addEventListener('touchend', cancelPress);
                cell.addEventListener('touchcancel', cancelPress);
            }, { passive: true });
        }

        dayColumn.appendChild(cell);
    }

    gridEl.appendChild(timeColumn);
    gridEl.appendChild(dayColumn);

    // Llevar el scroll interno hasta la primera clase del día
    if (classesForDay.length > 0) {
        const slotHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--slot-height'), 10) || 60;
        const firstStartMin = timeStringToMinutes(classesForDay[0].startTime);
        gridEl.scrollTop = Math.max(0, ((firstStartMin - CONFIG.hoursStart * 60) / 60) * slotHeight - 20);
    }
}

// ==========================================
// BÚSQUEDA DE CLASES POR ALUMNO (botón 🔍 de la vista de día)
// ==========================================

// Sin tildes, sin mayúsculas: "garcía" y "Garcia" encuentran lo mismo
function normalizeSearchText(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

function getClassesForStudent(studentId) {
    let classes = appState.classes.filter(c => Array.isArray(c.students) && c.students.includes(studentId));
    // Un monitor solo ve sus propias clases, igual que en el calendario
    if (isMonitor()) {
        const currentUser = getCurrentUser();
        classes = classes.filter(c => c.monitorId === currentUser.id);
    }
    return classes;
}

function openSearchClassesModal() {
    const input = document.getElementById('searchClassesInput');
    const results = document.getElementById('searchClassesResults');
    if (input) input.value = '';
    if (results) results.innerHTML = '<p class="search-classes-hint">Escribe el nombre o apellidos de un alumno para ver sus clases.</p>';
    openModal('searchClassesModal');
    if (input) setTimeout(() => input.focus(), 150);
}

function renderSearchClassesResults() {
    const input = document.getElementById('searchClassesInput');
    const container = document.getElementById('searchClassesResults');
    if (!input || !container) return;

    const query = normalizeSearchText(input.value);
    container.innerHTML = '';

    if (query.length < 2) {
        container.innerHTML = '<p class="search-classes-hint">Escribe al menos 2 letras del nombre o apellidos.</p>';
        return;
    }

    const matches = appState.students.filter(s =>
        s.active !== false && normalizeSearchText(s.name).includes(query)
    );

    if (matches.length === 0) {
        container.innerHTML = '<p class="search-classes-hint">No se encontró ningún alumno con ese nombre.</p>';
        return;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    matches.slice(0, 6).forEach(student => {
        const group = document.createElement('div');
        group.className = 'search-student-group';

        const classes = getClassesForStudent(student.id);

        const header = document.createElement('div');
        header.className = 'search-student-name';
        header.innerHTML = `<span>${student.name}</span><span class="search-student-count">${classes.length} ${classes.length === 1 ? 'clase' : 'clases'}</span>`;
        group.appendChild(header);

        if (classes.length === 0) {
            const none = document.createElement('p');
            none.className = 'search-classes-hint';
            none.textContent = 'Sin clases asignadas.';
            group.appendChild(none);
        } else {
            // Próximas primero (más cercana arriba), luego pasadas (más reciente arriba)
            const upcoming = classes
                .filter(c => new Date(c.date) >= todayStart)
                .sort((a, b) => (new Date(a.date) - new Date(b.date)) ||
                    (timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)));
            const past = classes
                .filter(c => new Date(c.date) < todayStart)
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            [...upcoming, ...past].forEach(cls => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'search-class-item';
                const clsDate = new Date(cls.date);
                if (clsDate < todayStart) item.classList.add('past');

                const clsWeekday = CONFIG.days[(clsDate.getDay() + 6) % 7];
                const monitorInfo = (isCoordinator() && cls.monitorName) ? ` · 👤 ${cls.monitorName}` : '';
                const doneMark = cls.isCompleted ? ' ✓' : '';
                item.innerHTML = `
                    <span class="search-class-date">${clsWeekday} ${formatDate(clsDate)}</span>
                    <span class="search-class-meta">${cls.startTime}–${cls.endTime} · ${(cls.students || []).length}/${cls.maxCapacity}${monitorInfo}${doneMark}</span>
                `;
                item.addEventListener('click', () => {
                    closeModal('searchClassesModal');
                    showClassDetails(cls.id);
                });
                group.appendChild(item);
            });
        }

        container.appendChild(group);
    });
}

function renderTimeColumn(grid) {
    const timeColumn = document.createElement('div');
    timeColumn.className = 'time-column';

    const header = document.createElement('div');
    header.className = 'time-header';
    header.textContent = 'Hora';
    timeColumn.appendChild(header);

    for (let hour = CONFIG.hoursStart; hour < CONFIG.hoursEnd; hour++) {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        timeSlot.textContent = `${String(hour).padStart(2, '0')}:00`;
        timeColumn.appendChild(timeSlot);
    }

    grid.appendChild(timeColumn);
}

function renderDayColumn(grid, dayIndex) {
    const dayColumn = document.createElement('div');
    dayColumn.className = 'day-column';

    const date = getDateForDay(appState.currentWeekStart, dayIndex);
    const dayName = CONFIG.days[dayIndex];

    const header = document.createElement('div');
    header.className = 'day-header';
    header.innerHTML = `
        <span class="day-header-name">${dayName}</span>
        <span class="day-header-date">${formatDate(date)}</span>
    `;

    // Resaltar la columna del día actual
    if (isSameCalendarDay(date, new Date())) {
        dayColumn.classList.add('today-column');
        header.classList.add('today');
    }

    dayColumn.appendChild(header);

    for (let hour = CONFIG.hoursStart; hour < CONFIG.hoursEnd; hour++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';

        const classesInSlot = getClassesForTimeSlot(dayName, hour);

        if (classesInSlot.length > 0) {
            classesInSlot.forEach(cls => {
                const classCard = createClassCard(cls);
                cell.appendChild(classCard);
            });
            cell.classList.add('has-class');
        } else {
            cell.addEventListener('click', () => {
                openAddClassModal(dayName, hour);
            });
        }

        dayColumn.appendChild(cell);
    }

    grid.appendChild(dayColumn);
}

function getClassesForTimeSlot(day, hour) {
    const weekClasses = getClassesForWeek(appState.currentWeekStart);

    return weekClasses.filter(cls => {
        if (cls.day !== day) return false;
        const startHour = parseInt(cls.startTime.split(':')[0]);
        return hour === startHour;
    });
}

function createClassCard(cls) {
    const occupancy = getClassOccupancy(cls);
    const card = document.createElement('div');
    card.className = `class-card class-${occupancy}`;

    const studentsCount = cls.students.length;
    const maxCapacity = cls.maxCapacity;

    const startTimeParts = cls.startTime.split(':');
    const endTimeParts = cls.endTime.split(':');
    const startMinutes = parseInt(startTimeParts[0], 10) * 60 + parseInt(startTimeParts[1] || '0', 10);
    const endMinutes = parseInt(endTimeParts[0], 10) * 60 + parseInt(endTimeParts[1] || '0', 10);
    const durationMinutes = endMinutes - startMinutes;
    const durationHours = durationMinutes / 60;

    // Compute height based on CSS slot height variable so JS matches visual grid
    const rootStyles = getComputedStyle(document.documentElement);
    const slotHeightStr = rootStyles.getPropertyValue('--slot-height') || '60px';
    const slotHeight = parseInt(slotHeightStr, 10) || 60;

    let cardHeight = Math.round(durationHours * slotHeight) - 8;
    if (cardHeight < 24) cardHeight = 24;
    card.style.height = `${cardHeight}px`;
    card.style.boxSizing = 'border-box';

    // Posición según los MINUTOS de inicio dentro de su hora: una clase de
    // 20:30 nace a media celda de la línea de las 20:00 (y = min/60 × alto)
    const minuteOffset = startMinutes % 60;
    if (minuteOffset > 0) {
        card.style.top = `${Math.round((minuteOffset / 60) * slotHeight)}px`;
    }


    // Mejor separación visual: el nombre del monitor va debajo de la hora, con margen
    let monitorDisplay = '';
    if (isCoordinator() && cls.monitorName) {
        monitorDisplay = `<div class="class-card-monitor">👤 ${cls.monitorName}</div>`;
    }

    const hasComments = cls.comments != null && String(cls.comments).trim().length > 0;
    const commentsIndicator = hasComments
        ? `<div class="class-card-comments-indicator" title="Esta clase tiene comentarios del monitor">💬</div>`
        : '';

    card.innerHTML = `
        <div class="class-card-time">${cls.startTime} - ${cls.endTime}</div>
        ${monitorDisplay}
        <div class="class-card-occupancy">${studentsCount}/${maxCapacity}</div>
        ${commentsIndicator}
    `;

    // Add resize handle for adjusting duration visually
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.title = 'Arrastrar para ajustar duración';
    card.appendChild(resizeHandle);

    // Resize logic con ratón: snap a 15 minutos
    resizeHandle.addEventListener('mousedown', (startEvent) => {
        startEvent.stopPropagation();
        startEvent.preventDefault();

        const rootStyles = getComputedStyle(document.documentElement);
        const slotHeightStr = rootStyles.getPropertyValue('--slot-height') || '60px';
        const slotHeight = parseInt(slotHeightStr, 10) || 60;
        const pixelsPerMinute = slotHeight / 60;

        const startRect = card.getBoundingClientRect();
        const startY = startEvent.clientY;
        const initialHeight = startRect.height;
        const initialDurationMinutes = durationMinutes;

        document.body.style.userSelect = 'none';

        function onMouseMove(ev) {
            const deltaY = ev.clientY - startY;
            const deltaMinutes = Math.round((deltaY / pixelsPerMinute) / 15) * 15;
            let newDuration = initialDurationMinutes + deltaMinutes;
            if (newDuration < 15) newDuration = 15;

            const newHeight = Math.round((newDuration / 60) * slotHeight) - 8;
            card.style.height = `${newHeight}px`;
        }

        function onMouseUp(ev) {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.userSelect = '';

            const deltaY = ev.clientY - startY;
            const deltaMinutes = Math.round((deltaY / pixelsPerMinute) / 15) * 15;
            let finalDuration = initialDurationMinutes + deltaMinutes;
            if (finalDuration < 15) finalDuration = 15;

            // Compute new end time and persist change
            const newEndTime = addMinutesToTime(cls.startTime, finalDuration);

            // Update class locally first for instant feedback and mark pending save
            markClassPendingSave(cls.id, { endTime: newEndTime, date: cls.date });
        }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

    // Drag-to-move logic con ratón: change start time by dragging the card vertically and change day by dragging horizontally
    card.addEventListener('mousedown', (startEvent) => {
        // Ignore right-clicks and interactions that started on the resize handle
        if (startEvent.button !== 0) return;
        if (startEvent.target.closest('.resize-handle')) return;

        startEvent.stopPropagation();
        startEvent.preventDefault();

        const rootStyles = getComputedStyle(document.documentElement);
        const slotHeightStr = rootStyles.getPropertyValue('--slot-height') || '60px';
        const slotHeight = parseInt(slotHeightStr, 10) || 60;
        const pixelsPerMinute = slotHeight / 60;

        // Estimate day column width
        const sampleCell = document.querySelector('.calendar-cell');
        const dayCellWidth = sampleCell ? sampleCell.getBoundingClientRect().width : 140;

        const startY = startEvent.clientY;
        const startX = startEvent.clientX;
        const initialStartMinutes = startMinutes;
        const initialEndMinutes = endMinutes;
        const duration = durationMinutes;
        const initialDayIndex = CONFIG.days.indexOf(cls.day);

        let moved = false;

        document.body.style.userSelect = 'none';
        card.style.zIndex = 9999;

        function onMouseMove(ev) {
            const deltaY = ev.clientY - startY;
            const deltaX = ev.clientX - startX;
            if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) moved = true;
            card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        }

        function onMouseUp(ev) {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.userSelect = '';
            card.style.zIndex = '';
            const deltaY = ev.clientY - startY;
            const deltaX = ev.clientX - startX;

            // Vertical: calculate delta minutes and snap to CONFIG.snapMinutes
            const rawDeltaMinutes = Math.round(deltaY / pixelsPerMinute);
            const snappedMinutes = Math.round(rawDeltaMinutes / CONFIG.snapMinutes) * CONFIG.snapMinutes;

            let finalStart = initialStartMinutes + snappedMinutes;
            // Clamp between allowed hours
            const minStart = CONFIG.hoursStart * 60;
            const maxStart = (CONFIG.hoursEnd * 60) - duration;
            if (finalStart < minStart) finalStart = minStart;
            if (finalStart > maxStart) finalStart = maxStart;

            const finalEnd = finalStart + duration;

            // Horizontal: compute day shift
            const dayShift = Math.round(deltaX / dayCellWidth);
            let finalDayIndex = initialDayIndex + dayShift;
            if (finalDayIndex < 0) finalDayIndex = 0;
            if (finalDayIndex > 6) finalDayIndex = 6;

            const newStartTime = minutesToTime(finalStart);
            const newEndTime = minutesToTime(finalEnd);
            // Fijar la fecha a mediodía local antes de serializar: evita que
            // toISOString (UTC) cruce la medianoche y desplace el día natural.
            const movedDate = getDateForDay(appState.currentWeekStart, finalDayIndex);
            const normalizedDate = new Date(
                movedDate.getFullYear(), movedDate.getMonth(), movedDate.getDate(), 12, 0, 0
            );
            const newDay = CONFIG.days[(normalizedDate.getDay() + 6) % 7];
            const newDate = normalizedDate.toISOString();

            // Reset visual transform
            card.style.transform = '';

            if (!moved) {
                // treat as click - show details
                showClassDetails(cls.id);
                return;
            }

            // Comprobar solapamiento con otra clase antes de aplicar cambios
            if (hasClassTimeConflict(newDate, newStartTime, newEndTime, cls.id)) {
                showToast('No se puede mover la clase: ya hay otra en ese horario', 'error');
                return;
            }

            // Update class locally first and mark pending save
            markClassPendingSave(cls.id, { startTime: newStartTime, endTime: newEndTime, day: newDay, date: newDate });
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // Drag-to-move logic en dispositivos táctiles (touch) con pulsación prolongada:
    // toque corto → abre detalles; mantener pulsado unos ms → entra en modo arrastre.
    // El movimiento queda limitado al área de la columna de día para que
    // la tarjeta no se pueda arrastrar por toda la interfaz.
    if (isTouchDevice()) {
        card.addEventListener('touchstart', (startEvent) => {
            const touch = startEvent.touches[0];
            if (!touch) return;

            const rootStyles = getComputedStyle(document.documentElement);
            const slotHeight = parseInt(rootStyles.getPropertyValue('--slot-height'), 10) || 60;
            const pixelsPerMinute = slotHeight / 60;

            const sampleCell = document.querySelector('.calendar-cell');
            const dayCellWidth = sampleCell ? sampleCell.getBoundingClientRect().width : 140;

            const pressStartX = touch.clientX;
            const pressStartY = touch.clientY;
            const initialStartMinutes = startMinutes;
            const duration = durationMinutes;
            const initialDayIndex = CONFIG.days.indexOf(cls.day);

            let dragging = false;
            let movedDuringPress = false;

            // Estas variables guardarán el punto de origen exacto del arrastre
            let dragStartX = 0;
            let dragStartY = 0;

            // Límites del arrastre dentro de la columna de día
            let minDeltaY = -Infinity;
            let maxDeltaY = Infinity;
            let minDeltaX = -Infinity;
            let maxDeltaX = Infinity;

            // Contenedor que se desplazará (scroll) cuando arrastremos cerca de sus bordes
            let scrollContainer = null;

            card.style.zIndex = 9999;

            const longPressDelay = 350; 
            const longPressTimer = setTimeout(() => {
                if (movedDuringPress) return;
                
                dragging = true;
                // Capturamos la posición actual del dedo justo cuando 
                // se activa el drag para que el movimiento empiece desde 0
                dragStartX = lastTouchX;
                dragStartY = lastTouchY;

                // Calculamos los límites permitidos dentro de la columna de día
                const cardRect = card.getBoundingClientRect();
                const containerEl = card.closest('.day-view-day-column') || card.closest('.day-column');
                if (containerEl) {
                    const containerRect = containerEl.getBoundingClientRect();
                    minDeltaY = containerRect.top - cardRect.top;
                    maxDeltaY = containerRect.bottom - cardRect.bottom;
                    minDeltaX = containerRect.left - cardRect.left;
                    maxDeltaX = containerRect.right - cardRect.right;

                    // El contenedor scrollable principal será la rejilla de vista de día, si existe
                    scrollContainer = containerEl.closest('.day-view-grid') || containerEl.parentElement;
                }

                document.body.style.userSelect = 'none';
                document.body.style.webkitUserSelect = 'none';

                // Feedback visual y táctil al entrar en modo arrastre
                card.classList.add('dragging-touch');
                if (window.navigator.vibrate) window.navigator.vibrate(50);
            }, longPressDelay);

            let lastTouchX = pressStartX;
            let lastTouchY = pressStartY;
            let lastScrollY = window.scrollY;

            // Últimos desplazamientos efectivos (clampados a los límites)
            let lastDragDeltaX = 0;
            let lastDragDeltaY = 0;

            function onTouchMove(ev) {
                const t = ev.touches[0];
                if (!t) return;

                lastTouchX = t.clientX;
                lastTouchY = t.clientY;

                if (!dragging) {
                    const deltaPressY = t.clientY - pressStartY;
                    const deltaPressX = t.clientX - pressStartX;
                    // Si se mueve más de 10px antes de los 350ms, cancelamos el drag para permitir scroll normal
                    if (Math.abs(deltaPressX) > 10 || Math.abs(deltaPressY) > 10) {
                        movedDuringPress = true;
                        clearTimeout(longPressTimer);
                    }
                    return;
                }

                // En modo arrastre bloqueamos el scroll de la página y
                // desplazamos solo el contenedor de horas si nos acercamos a sus bordes
                ev.preventDefault();

                if (scrollContainer) {
                    const rect = scrollContainer.getBoundingClientRect();
                    const edgeThreshold = 60; // px desde el borde superior/inferior del contenedor
                    let scrollDelta = 0;

                    if (lastTouchY > rect.bottom - edgeThreshold) {
                        scrollDelta = 10; // desplazar horas hacia abajo
                    } else if (lastTouchY < rect.top + edgeThreshold) {
                        scrollDelta = -10; // desplazar horas hacia arriba
                    }

                    if (scrollDelta !== 0) {
                        scrollContainer.scrollTop += scrollDelta;
                    }
                }

                // Usamos requestAnimationFrame para que el movimiento sea a 60fps (suave)
                requestAnimationFrame(() => {
                    if (!dragging) return;
                    let deltaY = t.clientY - dragStartY;
                    let deltaX = t.clientX - dragStartX;

                    // Limitar movimiento a la columna de día
                    deltaY = Math.min(Math.max(deltaY, minDeltaY), maxDeltaY);
                    deltaX = Math.min(Math.max(deltaX, minDeltaX), maxDeltaX);

                    lastDragDeltaY = deltaY;
                    lastDragDeltaX = deltaX;

                    card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                });
            }

            function onTouchEnd(ev) {
                clearTimeout(longPressTimer);
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
                
                card.style.zIndex = '';
                card.classList.remove('dragging-touch');
                document.body.style.userSelect = '';
                document.body.style.webkitUserSelect = '';

                if (!dragging) {
                    if (!movedDuringPress) showClassDetails(cls.id);
                    return;
                }

                // Usamos los últimos desplazamientos clampados para que
                // el resultado coincida visualmente con la posición final.
                const deltaY = lastDragDeltaY;
                const deltaX = lastDragDeltaX;
                
                card.style.transform = '';
                dragging = false;

                // Lógica de guardado (reutilizando tus funciones existentes)
                const rawDeltaMinutes = Math.round(deltaY / pixelsPerMinute);
                const snappedMinutes = Math.round(rawDeltaMinutes / CONFIG.snapMinutes) * CONFIG.snapMinutes;

                let finalStart = initialStartMinutes + snappedMinutes;
                const minStart = CONFIG.hoursStart * 60;
                const maxStart = (CONFIG.hoursEnd * 60) - duration;
                if (finalStart < minStart) finalStart = minStart;
                if (finalStart > maxStart) finalStart = maxStart;

                const finalEnd = finalStart + duration;

                let dayShift = 0;
                const weekContainer = document.getElementById('weekCalendarContainer');
                if (weekContainer && window.getComputedStyle(weekContainer).display !== 'none') {
                    dayShift = Math.round(deltaX / dayCellWidth);
                }

                // La vista de día se posiciona por cls.date (no por cls.day) y
                // NO cambia de día (dayShift=0). Anclamos la fecha nueva al día
                // natural REAL que ocupa la clase y solo cambiamos la hora.
                // Reconstruir desde currentWeekStart+cls.day saltaba de día si
                // cls.day estaba desincronizado con cls.date; además fijamos la
                // hora a mediodía local para evitar el desfase de UTC/toISOString.
                const baseDate = new Date(cls.date);
                const shifted = new Date(
                    baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + dayShift, 12, 0, 0
                );
                const candidateStart = minutesToTime(finalStart);
                const candidateEnd = minutesToTime(finalEnd);
                const candidateDate = shifted.toISOString();
                const candidateDay = CONFIG.days[(shifted.getDay() + 6) % 7];

                // Comprobar solapamiento con otra clase antes de aplicar cambios
                if (hasClassTimeConflict(candidateDate, candidateStart, candidateEnd, cls.id)) {
                    showToast('No se puede mover la clase: ya hay otra en ese horario', 'error');
                    return;
                }

                markClassPendingSave(cls.id, {
                    startTime: candidateStart,
                    endTime: candidateEnd,
                    day: candidateDay,      // re-sincroniza cls.day con cls.date
                    date: candidateDate
                });
            }

            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
        });
    }

    card.addEventListener('click', (e) => {
        e.stopPropagation();
        // En dispositivos táctiles el tap ya se gestiona en touchend.
        if (isTouchDevice()) return;
        showClassDetails(cls.id);
    });

    return card;
}

function renderStudentsList() {
    const container = document.getElementById('studentsList');
    if (!container) {
        console.warn('renderStudentsList: element #studentsList not found');
        return;
    }
    container.innerHTML = '';

    if (appState.students.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 2rem;">No hay alumnos registrados</p>';
        return;
    }

    appState.students.filter(s => s.active !== false).forEach(student => {
        const classCount = getStudentClassCount(student.id);
        const card = document.createElement('div');
        card.className = 'student-card';

        const levelDisplay = student.level !== null && student.level !== undefined
            ? `<span class="level-badge">Nivel: ${student.level}</span>`
            : '';

        card.innerHTML = `
            <div class="student-card-header">
                <h4>${student.name} ${levelDisplay}</h4>
                <div class="student-card-actions">
                    ${(isCoordinator() || isRecepcion()) ? `<button class="btn-icon-sm" onclick="showStudentProfile('${student.id}')" title="Ver ficha y pagos">📋</button>` : ''}
                    <button class="btn-icon-sm" onclick="openEditStudentModal('${student.id}')" title="Editar">✏️</button>
                    <button class="btn-icon-sm btn-danger-sm" onclick="confirmDeleteStudent('${student.id}')" title="Eliminar">🗑️</button>
                </div>
            </div>
            <p>${student.email || 'Sin email'}</p>
            <p>${student.phone || 'Sin teléfono'}</p>
            <div class="student-stats">${classCount} ${classCount === 1 ? 'clase' : 'clases'}</div>
        `;

        container.appendChild(card);
    });
}

async function confirmDeleteStudent(studentId) {
    const student = getStudentById(studentId);
    if (!student) return;
    const ok = await showConfirm(`¿Eliminar alumno ${student.name}? Esta acción no se puede deshacer.`,
        { title: 'Eliminar alumno', confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    deleteStudent(studentId);
}

// ==========================================
// FICHA DE ALUMNO — PAGOS
// ==========================================

async function showStudentProfile(studentId) {
    if (!isCoordinator() && !isRecepcion()) return;
    const student = getStudentById(studentId);
    if (!student) return;

    appState.viewingStudentId = studentId;
    appState.studentPayments = [];

    document.getElementById('profileStudentName').textContent = student.name;
    const parts = [
        student.level !== null && student.level !== undefined ? `Nivel ${student.level}` : null,
        student.email || null,
        student.phone || null,
    ].filter(Boolean);
    document.getElementById('profileStudentMeta').textContent = parts.join(' · ');

    hideAddPaymentForm();
    document.getElementById('profilePaymentsList').innerHTML = '<p class="profile-loading">Cargando pagos...</p>';
    document.getElementById('profileSummaryBar').innerHTML = '';

    openModal('studentProfileModal');

    try {
        const data = await db.getPaymentsByStudent(studentId);
        appState.studentPayments = data.map(p => db.convertPaymentFromDB(p));
    } catch (e) {
        console.error('Error loading payments:', e);
        appState.studentPayments = [];
    }
    renderStudentPayments();
    // Si el usuario abrió el formulario de clase suelta antes de que los pagos
    // terminaran de cargar, refrescar el desplegable con los datos ya cargados.
    if (appState.addPaymentType === 'class') {
        showAddPaymentForm('class');
    }
}

function renderStudentPayments() {
    const payments = appState.studentPayments;
    const studentId = appState.viewingStudentId;

    const totalPaid = payments.filter(p => p.paidDate).reduce((s, p) => s + (p.amount || 0), 0);
    const totalPending = payments.filter(p => !p.paidDate).reduce((s, p) => s + (p.amount || 0), 0);

    // Clases del alumno sin ningún tipo de cobertura (ni individual ni por cuota mensual)
    const paidClassIds = new Set(payments.filter(p => p.classId).map(p => p.classId));
    const paidMonths = new Set(payments.filter(p => p.period && !p.classId).map(p => p.period));
    const unpaidClasses = appState.classes.filter(c =>
        Array.isArray(c.students) &&
        c.students.includes(studentId) &&
        !paidClassIds.has(c.id) &&
        !paidMonths.has(c.date.substring(0, 7))
    );

    document.getElementById('profileSummaryBar').innerHTML = `
        <div class="profile-stat">
            <span class="profile-stat-label">Cobrado</span>
            <span class="profile-stat-value profile-stat-paid">€${totalPaid.toFixed(2)}</span>
        </div>
        <div class="profile-stat">
            <span class="profile-stat-label">Pendiente</span>
            <span class="profile-stat-value profile-stat-pending">€${totalPending.toFixed(2)}</span>
        </div>
        <div class="profile-stat">
            <span class="profile-stat-label">Clases sin pagar</span>
            <span class="profile-stat-value ${unpaidClasses.length > 0 ? 'profile-stat-pending' : ''}">${unpaidClasses.length}</span>
        </div>
        <div class="profile-stat">
            <span class="profile-stat-label">Registros</span>
            <span class="profile-stat-value">${payments.length}</span>
        </div>
    `;

    const container = document.getElementById('profilePaymentsList');
    if (payments.length === 0) {
        container.innerHTML = '<p class="profile-empty">No hay pagos registrados. Usa los botones de arriba para añadir.</p>';
        return;
    }

    container.innerHTML = payments.map(p => {
        const isClass = !!p.classId;
        const isPaid = !!p.paidDate;

        let description = '';
        if (isClass) {
            const cls = getClassById(p.classId);
            description = cls ? `${cls.day} ${cls.date} · ${cls.startTime}` : 'Clase';
        } else {
            description = p.period ? formatPeriod(p.period) : 'Cuota';
        }

        const method = p.method ? `<span class="payment-method">${escapeHtml(p.method)}</span>` : '';
        const notes = p.notes ? `<div class="payment-notes">${escapeHtml(p.notes)}</div>` : '';
        const amount = p.amount !== null ? `€${parseFloat(p.amount).toFixed(2)}` : '—';
        const paidLabel = isPaid ? `Pagado ${escapeHtml(p.paidDate)}` : 'Pendiente';
        const icon = isClass ? '📚' : '📅';

        return `
            <div class="payment-row">
                <div class="payment-row-info">
                    <div class="payment-desc">${icon} <strong>${escapeHtml(description)}</strong> ${method}</div>
                    ${notes}
                </div>
                <div class="payment-row-right">
                    <span class="payment-amount">${amount}</span>
                    <button class="pay-badge ${isPaid ? 'paid' : 'none'}" onclick="togglePaymentPaid('${p.id}')">
                        ${paidLabel}
                    </button>
                    <button class="btn-icon-sm" onclick="openEditPaymentModal('${p.id}')" title="Editar">✏️</button>
                    <button class="btn-icon-sm btn-danger-sm" onclick="deleteStudentPayment('${p.id}')" title="Eliminar">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function showAddPaymentForm(type) {
    appState.addPaymentType = type;

    document.getElementById('paymentAmount').value = '';
    document.getElementById('paymentMethod').value = '';
    document.getElementById('paymentNotes').value = '';

    const periodGroup = document.getElementById('paymentPeriodGroup');
    const classGroup = document.getElementById('paymentClassGroup');

    if (type === 'monthly') {
        periodGroup.style.display = '';
        classGroup.style.display = 'none';
        const now = new Date();
        document.getElementById('paymentPeriod').value =
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    } else {
        periodGroup.style.display = 'none';
        classGroup.style.display = '';
        const select = document.getElementById('paymentClassSelect');
        select.innerHTML = '<option value="">Seleccionar clase...</option>';
        const manualGroup = document.getElementById('paymentClassManualGroup');
        if (manualGroup) { manualGroup.style.display = 'none'; }
        const studentId = appState.viewingStudentId;

        // Clases con pago individual registrado
        const paidClassIds = new Set(
            appState.studentPayments.filter(p => p.classId).map(p => p.classId)
        );
        // Meses cubiertos por cuota mensual
        const paidMonths = new Set(
            appState.studentPayments.filter(p => p.period && !p.classId).map(p => p.period)
        );

        const studentClasses = appState.classes
            .filter(c => Array.isArray(c.students) && c.students.includes(studentId))
            .sort((a, b) => b.date.localeCompare(a.date));

        // Clasificar cada clase
        const pending = [];
        const coveredByQuota = [];
        const paidIndividually = [];

        studentClasses.forEach(cls => {
            const month = cls.date.substring(0, 7);
            if (paidClassIds.has(cls.id)) {
                paidIndividually.push(cls);
            } else if (paidMonths.has(month)) {
                coveredByQuota.push({ cls, month });
            } else {
                pending.push(cls);
            }
        });

        if (pending.length > 0) {
            const grp = document.createElement('optgroup');
            grp.label = `Pendientes de pago (${pending.length})`;
            pending.forEach(cls => {
                const opt = document.createElement('option');
                opt.value = cls.id;
                opt.textContent = `${cls.date} · ${cls.startTime}–${cls.endTime} · ${cls.day}`;
                grp.appendChild(opt);
            });
            select.appendChild(grp);
        }

        if (coveredByQuota.length > 0) {
            const grp = document.createElement('optgroup');
            grp.label = `Cubiertas por cuota mensual (${coveredByQuota.length})`;
            coveredByQuota.forEach(({ cls, month }) => {
                const opt = document.createElement('option');
                opt.value = cls.id;
                opt.disabled = true;
                opt.textContent = `📅 ${cls.date} · ${cls.startTime} · ${cls.day} (cuota ${formatPeriod(month)})`;
                grp.appendChild(opt);
            });
            select.appendChild(grp);
        }

        if (paidIndividually.length > 0) {
            const grp = document.createElement('optgroup');
            grp.label = `Ya pagadas individualmente (${paidIndividually.length})`;
            paidIndividually.forEach(cls => {
                const opt = document.createElement('option');
                opt.value = cls.id;
                opt.disabled = true;
                opt.textContent = `✅ ${cls.date} · ${cls.startTime} · ${cls.day}`;
                grp.appendChild(opt);
            });
            select.appendChild(grp);
        }

        if (studentClasses.length === 0) {
            const opt = document.createElement('option');
            opt.disabled = true;
            opt.textContent = 'Sin clases registradas en el sistema';
            select.appendChild(opt);
        }

        // Opción manual al final siempre
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '──────────────';
        select.appendChild(sep);
        const manualOpt = document.createElement('option');
        manualOpt.value = '__manual__';
        manualOpt.textContent = '📝 Introducir clase manualmente...';
        select.appendChild(manualOpt);
    }

    document.getElementById('addPaymentFormContainer').style.display = '';
}

function onClassSelectChange() {
    const select = document.getElementById('paymentClassSelect');
    const manualGroup = document.getElementById('paymentClassManualGroup');
    if (!manualGroup) return;
    const isManual = select && select.value === '__manual__';
    manualGroup.style.display = isManual ? '' : 'none';
    if (isManual) document.getElementById('paymentClassManual').focus();
}

function hideAddPaymentForm() {
    const el = document.getElementById('addPaymentFormContainer');
    if (el) el.style.display = 'none';
    appState.addPaymentType = null;
}

async function submitAddPayment() {
    const studentId = appState.viewingStudentId;
    const type = appState.addPaymentType;
    const amount = document.getElementById('paymentAmount').value;
    const method = document.getElementById('paymentMethod').value || null;
    let notes = document.getElementById('paymentNotes').value.trim() || null;

    let period = null, classId = null;
    if (type === 'monthly') {
        period = document.getElementById('paymentPeriod').value || null;
        if (!period) { showToast('Selecciona el mes', 'error'); return; }
    } else {
        classId = document.getElementById('paymentClassSelect').value || null;
        if (!classId) { showToast('Selecciona la clase', 'error'); return; }
        if (classId === '__manual__') {
            const desc = document.getElementById('paymentClassManual').value.trim();
            if (!desc) { showToast('Describe la clase manualmente', 'error'); return; }
            notes = notes ? `${desc} — ${notes}` : desc;
            classId = null;
        }
    }

    try {
        showLoading('Guardando pago...');
        const result = await db.createPayment({
            studentId,
            classId,
            period,
            amount: amount !== '' ? parseFloat(amount) : null,
            method,
            notes,
        });
        appState.studentPayments.unshift(db.convertPaymentFromDB(result));
        hideAddPaymentForm();
        renderStudentPayments();
        showToast('Pago registrado', 'success');
    } catch (e) {
        console.error('Error creating payment:', e);
        showToast('Error al guardar el pago', 'error');
    } finally {
        hideLoading();
    }
}

async function togglePaymentPaid(paymentId) {
    const payment = appState.studentPayments.find(p => p.id === paymentId);
    if (!payment) return;
    const newPaidDate = payment.paidDate ? null : new Date().toLocaleDateString('sv');
    try {
        await db.updatePayment(paymentId, { paidDate: newPaidDate });
        payment.paidDate = newPaidDate;
        renderStudentPayments();
        showToast(newPaidDate ? 'Marcado como pagado' : 'Marcado como pendiente', 'success');
    } catch (e) {
        showToast('Error al actualizar el pago', 'error');
    }
}

function openEditPaymentModal(paymentId) {
    const payment = appState.studentPayments.find(p => p.id === paymentId);
    if (!payment) return;
    appState.editingPaymentId = paymentId;
    document.getElementById('editPaymentAmount').value = payment.amount !== null ? payment.amount : '';
    document.getElementById('editPaymentMethod').value = payment.method || '';
    document.getElementById('editPaymentDate').value = payment.paidDate || '';
    document.getElementById('editPaymentNotes').value = payment.notes || '';
    openModal('editPaymentModal');
}

async function saveEditPayment() {
    const paymentId = appState.editingPaymentId;
    if (!paymentId) return;
    const payment = appState.studentPayments.find(p => p.id === paymentId);
    if (!payment) return;

    const amount = document.getElementById('editPaymentAmount').value;
    const method = document.getElementById('editPaymentMethod').value;
    const paidDate = document.getElementById('editPaymentDate').value || null;
    const notes = document.getElementById('editPaymentNotes').value.trim();

    try {
        await db.updatePayment(paymentId, {
            amount: amount !== '' ? parseFloat(amount) : null,
            method: method || null,
            paidDate,
            notes: notes || null,
        });
        payment.amount = amount !== '' ? parseFloat(amount) : null;
        payment.method = method || null;
        payment.paidDate = paidDate;
        payment.notes = notes || null;
        closeModal('editPaymentModal');
        renderStudentPayments();
        showToast('Pago actualizado', 'success');
    } catch (e) {
        showToast('Error al guardar el pago', 'error');
    }
}

async function deleteStudentPayment(paymentId) {
    try {
        await db.deletePayment(paymentId);
        appState.studentPayments = appState.studentPayments.filter(p => p.id !== paymentId);
        renderStudentPayments();
        showToast('Pago eliminado', 'success');
    } catch (e) {
        showToast('Error al eliminar el pago', 'error');
    }
}

// Render students into quick dropdown list
function renderStudentsDropdown(filter = '') {
    // Prefer modal list container, fallback to old dropdown id
    const container = document.getElementById('studentsModalList') || document.getElementById('studentsDropdownList');
    if (!container) return;
    container.innerHTML = '';

    const q = (filter || '').toLowerCase();
    const list = appState.students.filter(s => s.active !== false && s.name.toLowerCase().includes(q));

    if (list.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '1rem';
        empty.style.color = 'var(--gray-500)';
        empty.textContent = 'No hay alumnos';
        container.appendChild(empty);
        return;
    }

    list.forEach(s => {
        const wrapper = document.createElement('div');
        wrapper.className = 'students-dropdown-item';
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'space-between';

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.gap = '0.75rem';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `dd-student-${s.id}`;
        checkbox.value = s.id;

        const label = document.createElement('label');
        label.htmlFor = `dd-student-${s.id}`;
        label.style.cursor = 'pointer';

        const metaParts = [];
        if (s.email) metaParts.push(s.email);
        if (s.phone) metaParts.push(s.phone);

        label.innerHTML = `
            <strong style="display:block">${s.name}</strong>
            <div class="meta">${metaParts.join(' · ')}</div>
        `;

        left.appendChild(checkbox);
        left.appendChild(label);

        const right = document.createElement('div');
        if (s.level !== null && s.level !== undefined) {
            const lvl = document.createElement('span');
            lvl.className = 'level-badge';
            lvl.textContent = s.level;
            right.appendChild(lvl);
        }

        wrapper.appendChild(left);
        wrapper.appendChild(right);

        container.appendChild(wrapper);
    });
}

function openEditStudentModal(studentId) {
    const student = getStudentById(studentId);
    if (!student) return;

    const form = document.getElementById('studentForm');
    if (!form) return;

    // Prefill fields
    document.getElementById('studentName').value = student.name || '';
    document.getElementById('studentEmail').value = student.email || '';
    document.getElementById('studentPhone').value = student.phone || '';
    document.getElementById('studentLevel').value = student.level !== null && student.level !== undefined ? student.level : '';

    appState.editingStudent = studentId;
    const header = document.querySelector('#studentModal .modal-header h2');
    if (header) header.textContent = 'Editar Alumno';
    openModal('studentModal');

    // Close dropdown
    const modal = document.getElementById('studentsModal');
    if (modal) closeModal('studentsModal');
}

// (No dropdown/modal renderer here — keep student rendering in `renderStudentsList` and `renderStudentsSelector`)

// Handler de "click fuera" del autocompletado de alumnos: se re-registra en
// cada render, así que guardamos la referencia para limpiar el anterior.
let studentsSelectorOutsideHandler = null;

function renderStudentsSelector() {
    const container = document.getElementById('studentsSelector');
    if (!container) {
        console.warn('renderStudentsSelector: element #studentsSelector not found');
        return;
    }
    // Build search + selected area
    container.innerHTML = '';

    const selected = appState.tempSelectedStudents || [];

    const selectedWrap = document.createElement('div');
    selectedWrap.className = 'selected-students';
    selectedWrap.id = 'studentsSelectorSelected';
    // render selected pills
    function renderSelectedPills() {
        selectedWrap.innerHTML = '';
        const counter = document.createElement('div');
        counter.className = 'students-selector-counter';
        counter.textContent = `${selected.length}/${CONFIG.maxStudentsPerClass} alumnos`;
        if (selected.length >= CONFIG.maxStudentsPerClass) counter.classList.add('full');
        selectedWrap.appendChild(counter);
        if (selected.length === 0) {
            const hint = document.createElement('div');
            hint.style.color = 'var(--gray-500)';
            hint.style.padding = '0.5rem 0';
            hint.textContent = 'No hay alumnos seleccionados';
            selectedWrap.appendChild(hint);
            return;
        }
        selected.forEach(id => {
            const s = getStudentById(id);
            if (!s) return;
            const pill = document.createElement('div');
            pill.className = 'student-pill';
            pill.textContent = s.name;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-icon-only';
            removeBtn.style.fontSize = '0.9rem';
            removeBtn.innerHTML = '✕';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = selected.indexOf(id);
                if (idx !== -1) selected.splice(idx, 1);
                renderSelectedPills();
                updateInputState(); // al bajar de 4, reactivar el input de búsqueda
            });
            pill.appendChild(removeBtn);
            selectedWrap.appendChild(pill);
        });
    }

    // ---- Autocompletado: input + desplegable flotante ----
    const MIN_CHARS = 1; // subir a 2 si el desplegable genera demasiado ruido

    const searchWrap = document.createElement('div');
    searchWrap.className = 'students-autocomplete';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = 'studentsSelectorSearch';
    searchInput.autocomplete = 'off';
    searchWrap.appendChild(searchInput);

    // Desplegable flotante: oculto salvo que haya texto suficiente
    const dropdown = document.createElement('div');
    dropdown.id = 'studentsSelectorResults';
    dropdown.className = 'students-autocomplete-dropdown';
    dropdown.hidden = true;
    searchWrap.appendChild(dropdown);

    const isFull = () => selected.length >= CONFIG.maxStudentsPerClass;

    function hideDropdown() {
        dropdown.hidden = true;
        dropdown.innerHTML = '';
    }

    // Habilita/deshabilita el input según el límite de plazas
    function updateInputState() {
        if (isFull()) {
            searchInput.value = '';
            searchInput.disabled = true;
            searchInput.placeholder = `Máximo ${CONFIG.maxStudentsPerClass} alumnos`;
            hideDropdown();
        } else {
            searchInput.disabled = false;
            searchInput.placeholder = 'Buscar alumno...';
        }
    }

    function renderResults(q = '') {
        const query = (q || '').trim().toLowerCase();
        if (query.length < MIN_CHARS || isFull()) { hideDropdown(); return; }
        // Filtro en memoria (sin backend), excluyendo los ya seleccionados
        const list = appState.students.filter(s =>
            s.active !== false &&
            !selected.includes(s.id) &&
            (s.name.toLowerCase().includes(query) || (s.email || '').toLowerCase().includes(query))
        );
        dropdown.innerHTML = '';
        dropdown.hidden = false;
        if (list.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'students-autocomplete-empty';
            empty.textContent = 'No se encontraron alumnos';
            dropdown.appendChild(empty);
            return;
        }
        list.forEach(s => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'students-autocomplete-item';
            item.innerHTML = `<strong>${escapeHtml(s.name)}</strong><span>${escapeHtml(s.email || '')}</span>`;
            // Click en un resultado: añadir directo, limpiar input y cerrar
            item.addEventListener('click', () => {
                if (isFull()) return;
                selected.push(s.id);
                searchInput.value = '';
                hideDropdown();
                renderSelectedPills();
                updateInputState();
            });
            dropdown.appendChild(item);
        });
    }

    searchInput.addEventListener('input', (e) => renderResults(e.target.value));
    // Reabrir si ya hay texto al volver a enfocar
    searchInput.addEventListener('focus', (e) => renderResults(e.target.value));

    // Cerrar al hacer click fuera. Se re-registra en cada render, así que
    // limpiamos el handler anterior para no acumular listeners.
    if (studentsSelectorOutsideHandler) {
        document.removeEventListener('pointerdown', studentsSelectorOutsideHandler);
    }
    studentsSelectorOutsideHandler = (e) => {
        if (!searchWrap.contains(e.target)) hideDropdown();
    };
    document.addEventListener('pointerdown', studentsSelectorOutsideHandler);

    // Montaje: contador/pills arriba, buscador (con su desplegable) debajo
    container.appendChild(selectedWrap);
    container.appendChild(searchWrap);
    renderSelectedPills();
    updateInputState();
}

// ==========================================
// PENDING SAVE (dragged changes) MANAGEMENT
// ==========================================

function markClassPendingSave(classId, updates) {
    const clsIndex = appState.classes.findIndex(c => c.id === classId);
    if (clsIndex === -1) return;

    // Initialize pending container if not exists or different class
    if (!appState.pendingSave || appState.pendingSave.classId !== classId) {
        appState.pendingSave = {
            classId,
            original: JSON.parse(JSON.stringify(appState.classes[clsIndex])),
            updates: { ...updates }
        };
    } else {
        // Merge updates
        appState.pendingSave.updates = { ...appState.pendingSave.updates, ...updates };
    }

    // Apply updates to local copy for instant UI feedback
    appState.classes[clsIndex] = { ...appState.classes[clsIndex], ...appState.pendingSave.updates };
    saveToLocalStorage();
    renderCalendar();

    // Show confirm changes modal with the actual changes made
    const original = appState.pendingSave.original;
    const newClass = appState.classes[clsIndex];
    
    const changedDay = newClass.day !== original.day ? `${original.day} → ${newClass.day}` : newClass.day;
    const changedTime = (newClass.startTime !== original.startTime || newClass.endTime !== original.endTime) 
        ? `${original.startTime} - ${original.endTime} → ${newClass.startTime} - ${newClass.endTime}` 
        : `${newClass.startTime} - ${newClass.endTime}`;
    
    showConfirmChangesModal(changedDay, changedTime);
}

async function performPendingSave() {
    if (!appState.pendingSave) return;
    const { classId, updates } = appState.pendingSave;

    // Validar que los cambios de hora/día no solapan con otra clase antes de guardar
    const clsIndex = appState.classes.findIndex(c => c.id === classId);
    if (clsIndex !== -1) {
        const current = appState.classes[clsIndex];
        const candidateDate = new Date(updates.date || current.date);
        const candidateStartTime = updates.startTime || current.startTime;
        const candidateEndTime = updates.endTime || current.endTime;

        if (hasClassTimeConflict(candidateDate, candidateStartTime, candidateEndTime, classId)) {
            // Revertir a la posición original si hay conflicto y limpiar el estado pendiente
            showToast('No se puede mover la clase: ya hay otra en ese horario', 'error');
            if (appState.pendingSave && appState.pendingSave.original) {
                appState.classes[clsIndex] = appState.pendingSave.original;
            }
            appState.pendingSave = null;
            saveToLocalStorage();
            renderCalendar();
            if (appState.selectedClass === classId) showClassDetails(classId);
            return;
        }
    }

    try {
        showLoading('Guardando cambios...');
        await updateClass(classId, updates);
        showToast('Cambios guardados', 'success');
    } catch (err) {
        console.error('Error guardando cambios pendientes:', err);
        showToast('Error al guardar cambios (ver consola)', 'error');
    } finally {
        hideLoading();
        // clear pending save
        appState.pendingSave = null;
        saveToLocalStorage();
        renderCalendar();
        if (appState.selectedClass === classId) showClassDetails(classId);
    }
}

function cancelPendingSave() {
    if (!appState.pendingSave) return;
    const { classId, original } = appState.pendingSave;
    const idx = appState.classes.findIndex(c => c.id === classId);
    if (idx !== -1) {
        appState.classes[idx] = original;
    }
    appState.pendingSave = null;
    saveToLocalStorage();
    renderCalendar();
    if (appState.selectedClass === classId) showClassDetails(classId);
    showToast('Cambios cancelados', 'warning');
}

function renderWeekTitle() {
    const title = document.getElementById('weekTitle');
    const weekStart = new Date(appState.currentWeekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const startStr = formatDate(weekStart);
    const endStr = formatDate(weekEnd);

    const monitorHeader = document.getElementById('monitorViewHeader');
    const monitorViewTitle = document.getElementById('monitorViewTitle');
    if (appState.viewingMonitorId) {
        const monitor = getMonitorById(appState.viewingMonitorId);
        const monitorName = monitor ? monitor.name : '';
        title.textContent = `Clases de ${monitorName}`;
        if (monitorHeader) monitorHeader.style.display = 'flex';
        if (monitorViewTitle) monitorViewTitle.textContent = monitorName;
    } else {
        title.textContent = `Semana del ${startStr} - ${endStr}`;
        if (monitorHeader) monitorHeader.style.display = 'none';
    }
    setupMonthYearSelectors();

    // Sincronizar el título de semana en el panel de coordinador
    const coordTitle = document.getElementById('coordWeekTitle');
    if (coordTitle) coordTitle.textContent = `${startStr} – ${endStr}`;
}

// Setup listeners para los selectores de mes y año (llamar tras renderizar cabecera)
function setupMonthYearSelectors() {
    // Solo actualiza los títulos de mes y año. Los listeners se configuran
    // una única vez en initializeEventListeners() para evitar duplicados.
    const monthTitle = document.getElementById('monthTitle');
    const yearTitle = document.getElementById('yearTitle');
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const date = appState.currentMonthDate ? new Date(appState.currentMonthDate) : new Date();
    if (monthTitle) monthTitle.textContent = monthNames[date.getMonth()];
    if (yearTitle) yearTitle.textContent = date.getFullYear();
}

function renderMonitorsList() {
    const container = document.getElementById('monitorsList');
    if (!container) return;

    container.innerHTML = '';

    const monitors = appState.personal.filter(m => (m.permissions || []).includes('monitor'));

    // Subtítulo del panel con el número de monitores
    const countLabel = document.getElementById('monitorsCountLabel');
    if (countLabel) {
        countLabel.textContent = monitors.length === 0
            ? 'Sin monitores todavía'
            : `${monitors.length} ${monitors.length === 1 ? 'monitor activo' : 'monitores activos'}`;
    }

    if (monitors.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 2rem;">No hay monitores registrados. Agrega el primer monitor.</p>';
        return;
    }

    monitors.forEach(monitor => {
        const stats = getMonitorStats(monitor.id);
        const card = document.createElement('div');
        card.className = 'monitor-card';

        const studentList = stats.students.length > 0
            ? stats.students.map(s => `
                <div class="monitor-student-item">
                    <span class="monitor-student-name">${s.name}</span>
                    <span class="monitor-student-level">${s.level || '—'}</span>
                </div>`).join('')
            : '<p class="monitor-no-students">Sin alumnos registrados</p>';

        const currentYear = new Date().getFullYear();

        // Métricas del mes en curso, visibles sin desplegar detalles
        const classesThisMonth = (stats.monthlyBreakdown[new Date().getMonth()] || {}).count || 0;
        const hoursLabel = String(Math.round(stats.hoursThisMonth * 10) / 10).replace('.', ',');

        const initials = String(monitor.name || '?')
            .split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

        const emailLine = monitor.email
            ? `<p>📧 ${monitor.email}</p>`
            : '<p class="monitor-info-empty">📧 Sin email</p>';
        const phoneLine = monitor.phone
            ? `<p>📞 ${monitor.phone}</p>`
            : '<p class="monitor-info-empty">📞 Sin teléfono</p>';

        card.innerHTML = `
            <div class="monitor-card-header">
                <div class="monitor-card-id">
                    <span class="monitor-avatar">${initials}</span>
                    <h3>${monitor.name}</h3>
                </div>
                <div class="monitor-card-actions">
                    <button class="btn-icon-sm" onclick="event.stopPropagation(); editMonitor('${monitor.id}')" title="Editar">✏️</button>
                    <button class="btn-icon-sm btn-danger-sm" onclick="event.stopPropagation(); confirmDeleteMonitor('${monitor.id}')" title="Eliminar">🗑️</button>
                </div>
            </div>
            <div class="monitor-card-info">
                ${emailLine}
                ${phoneLine}
            </div>
            <div class="monitor-card-stats">
                <div class="stat-item"><span class="stat-value">${classesThisMonth}</span><span class="stat-label">Clases/mes</span></div>
                <div class="stat-item"><span class="stat-value">${hoursLabel}h</span><span class="stat-label">Horas/mes</span></div>
                <div class="stat-item"><span class="stat-value">${stats.totalStudents}</span><span class="stat-label">Alumnos</span></div>
            </div>
            <button class="monitor-details-toggle" onclick="event.stopPropagation(); toggleMonitorDetails(this)">
                Ver detalles <span class="details-arrow">▾</span>
            </button>
            <div class="monitor-details-panel" style="display:none;">
                <div class="monitor-details-section">
                    <div class="monitor-month-year-nav">
                        <button class="monitor-year-btn" onclick="changeMonitorYear(this, '${monitor.id}', -1)">&#8249;</button>
                        <span class="monitor-year-label" data-year="${currentYear}">${currentYear}</span>
                        <button class="monitor-year-btn" onclick="changeMonitorYear(this, '${monitor.id}', 1)">&#8250;</button>
                    </div>
                    <table class="monitor-month-table">
                        <thead>
                            <tr><th>Mes</th><th>Clases</th><th>Horas</th><th>Pagos</th></tr>
                        </thead>
                        <tbody id="month-tbody-${monitor.id}">${buildMonthRows(monitor.id, currentYear)}</tbody>
                    </table>
                </div>
                <div class="monitor-details-section">
                    <h4>Alumnos asociados (${stats.students.length})</h4>
                    <div class="monitor-students-list">${studentList}</div>
                </div>
            </div>
        `;

        // Tarjeta entera clicable → abre el calendario del monitor
        card.addEventListener('click', () => viewMonitorClasses(monitor.id));
        // Los clicks dentro del panel de detalles (tabla, año, pagos) no navegan
        const detailsPanel = card.querySelector('.monitor-details-panel');
        if (detailsPanel) detailsPanel.addEventListener('click', (e) => e.stopPropagation());

        container.appendChild(card);
    });
}

function toggleMonitorDetails(btn) {
    const panel = btn.nextElementSibling;
    const open = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    btn.classList.toggle('open', open);
    // El primer nodo es el texto; la flecha (span) rota vía CSS
    btn.firstChild.textContent = open ? 'Ocultar detalles ' : 'Ver detalles ';
}

function getMonthClasses(monitorId, year, month) {
    return appState.classes.filter(c => {
        if (c.monitorId !== monitorId) return false;
        const [y, mo] = (c.date || '').split('-').map(Number);
        return y === year && (mo - 1) === month;
    });
}

function getMonthPayStatus(monitorId, year, month) {
    const classes = getMonthClasses(monitorId, year, month);
    const paid = classes.filter(c => c.paid).length;
    const total = classes.length;
    if (total === 0) return { cls: 'none', label: '—', paid, total };
    if (paid === total) return { cls: 'paid', label: 'Pagado', paid, total };
    if (paid === 0) return { cls: 'pending', label: 'Pendiente', paid, total };
    return { cls: 'partial', label: `${paid}/${total} pagadas`, paid, total };
}

function renderPayBadge(monitorId, year, month) {
    const s = getMonthPayStatus(monitorId, year, month);
    return `<span class="pay-badge ${s.cls}" id="paybadge-${monitorId}-${year}-${month}">${s.label}</span>`;
}

function refreshMonthPayBadge(monitorId, year, month) {
    const el = document.getElementById(`paybadge-${monitorId}-${year}-${month}`);
    if (el) {
        const s = getMonthPayStatus(monitorId, year, month);
        el.className = `pay-badge ${s.cls}`;
        el.textContent = s.label;
    }
    refreshYearPayTotal(monitorId, year);
}

function refreshYearPayTotal(monitorId, year) {
    const el = document.getElementById(`paytotal-${monitorId}-${year}`);
    if (!el) return;
    const yearClasses = appState.classes.filter(c =>
        c.monitorId === monitorId && Number((c.date || '').split('-')[0]) === year);
    const paid = yearClasses.filter(c => c.paid).length;
    el.textContent = yearClasses.length ? `${paid}/${yearClasses.length} pagadas` : '—';
}

function buildMonthRows(monitorId, year) {
    const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const classes = appState.classes.filter(c => c.monitorId === monitorId);
    const monthRows = monthNames.map((name, m) => {
        const mClasses = classes.filter(cls => {
            const [y, mo] = (cls.date || '').split('-').map(Number);
            return y === year && (mo - 1) === m;
        });
        const mHours = mClasses.reduce((sum, cls) => sum + getClassDurationHours(cls), 0);
        const empty = mClasses.length === 0;

        const sorted = mClasses.sort((a, b) =>
            (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));

        const detailRows = sorted.map(cls => {
            const h = getClassDurationHours(cls);
            const [, , dd] = (cls.date || '').split('-');
            const studentNames = (cls.students || [])
                .map(id => { const s = getStudentById(id); return s ? s.name : null; })
                .filter(Boolean);
            const studentCount = cls.students ? cls.students.length : 0;
            const titleAttr = studentNames.length ? ` title="${escapeHtml(studentNames.join(', '))}"` : '';
            return `<tr class="month-class-detail-row">
                <td class="month-class-info"${titleAttr}>
                    ${name} ${parseInt(dd,10)} · ${cls.startTime}–${cls.endTime} · ${studentCount} ${studentCount === 1 ? 'alumno' : 'alumnos'}
                </td>
                <td class="month-class-hours">${h.toFixed(1)}</td>
                <td style="text-align:center;">
                    <input type="checkbox" class="paid-checkbox" data-class-id="${cls.id}"
                        ${cls.paid ? 'checked' : ''}
                        onchange="toggleClassPaid('${cls.id}', this.checked)">
                </td>
            </tr>`;
        }).join('');

        const detailHtml = empty ? '' : `
            <tr class="month-detail-container" style="display:none;">
                <td colspan="4" style="padding:0;">
                    <div class="month-detail-toolbar">
                        <span class="toolbar-label">Clases de ${name} ${year}</span>
                        <button class="btn-pay-month" onclick="payAllMonthClasses(this, '${monitorId}', ${year}, ${m})">
                            Marcar mes pagado
                        </button>
                    </div>
                    <table class="month-detail-table">${detailRows}</table>
                </td>
            </tr>`;

        const nowRef = new Date();
        const isCurrentMonth = year === nowRef.getFullYear() && m === nowRef.getMonth();
        const clickAttr = empty ? '' : `style="cursor:pointer;" onclick="toggleMonthDetail(this)"`;
        return `<tr class="${empty ? 'month-row-empty' : 'month-row-clickable'}${isCurrentMonth ? ' month-row-current' : ''}" ${clickAttr}>
            <td>${name}${empty ? '' : ' <span class="month-expand-icon">▸</span>'}</td>
            <td>${mClasses.length}</td>
            <td>${mHours.toFixed(1)}</td>
            <td>${renderPayBadge(monitorId, year, m)}</td>
        </tr>${detailHtml}`;
    }).join('');

    const yearClasses = classes.filter(c => Number((c.date || '').split('-')[0]) === year);
    const totalHours = yearClasses.reduce((sum, cls) => sum + getClassDurationHours(cls), 0);
    const totalPaid = yearClasses.filter(c => c.paid).length;
    const totalsRow = `<tr class="month-total-row">
        <td>Total ${year}</td>
        <td>${yearClasses.length}</td>
        <td>${totalHours.toFixed(1)}</td>
        <td><span id="paytotal-${monitorId}-${year}">${yearClasses.length ? `${totalPaid}/${yearClasses.length} pagadas` : '—'}</span></td>
    </tr>`;

    return monthRows + totalsRow;
}

function toggleMonthDetail(row) {
    const detailRow = row.nextElementSibling;
    if (!detailRow || !detailRow.classList.contains('month-detail-container')) return;
    const open = detailRow.style.display === 'none';
    detailRow.style.display = open ? '' : 'none';
    const icon = row.querySelector('.month-expand-icon');
    if (icon) icon.textContent = open ? '▾' : '▸';
}

async function toggleClassPaid(classId, newPaid) {
    const cls = appState.classes.find(c => c.id === classId);
    if (!cls) return;
    cls.paid = newPaid;
    await updateClass(classId, { paid: newPaid }, true);
    const [y, mo] = (cls.date || '').split('-').map(Number);
    if (y && mo) refreshMonthPayBadge(cls.monitorId, y, mo - 1);
}

async function payAllMonthClasses(btn, monitorId, year, month) {
    const pending = getMonthClasses(monitorId, year, month).filter(c => !c.paid);
    await Promise.all(pending.map(cls => {
        cls.paid = true;
        return updateClass(cls.id, { paid: true }, true);
    }));
    // Update all checkboxes in this detail block without closing the panel
    const detailRow = btn.closest('tr.month-detail-container');
    if (detailRow) {
        detailRow.querySelectorAll('.paid-checkbox').forEach(cb => { cb.checked = true; });
    }
    refreshMonthPayBadge(monitorId, year, month);
    if (pending.length > 0) showToast('Mes marcado como pagado');
}

function changeMonitorYear(btn, monitorId, delta) {
    const nav = btn.parentElement;
    const label = nav.querySelector('.monitor-year-label');
    const newYear = parseInt(label.dataset.year, 10) + delta;
    label.dataset.year = newYear;
    label.textContent = newYear;
    const tbody = document.getElementById(`month-tbody-${monitorId}`);
    if (tbody) tbody.innerHTML = buildMonthRows(monitorId, newYear);
}

// ==========================================
// MODAL MANAGEMENT
// ==========================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('active');
    // Sheets expandibles: reabrir siempre en el anclaje medio (limpiar el
    // tamaño/desplazamiento que dejara la sesión anterior)
    if (modal.classList.contains('sheet-expandable')) {
        const c = modal.querySelector('.modal-content');
        if (c) { c.style.height = ''; c.style.transform = ''; c.style.transition = ''; }
    }
    // Bloquear el scroll del fondo mientras el modal está abierto (por id, así
    // varios modales conviven y el fondo se libera al cerrar el último)
    lockBackgroundScroll(modalId);
}

// ==========================================
// SHEETS EXPANDIBLES (estilo iOS con detents) — avisos y buscar clases
// Se arrastra la BARRA DE ARRIBA (cabecera + asa), no la lista:
//   · hacia arriba  → el panel crece (medio → grande)
//   · hacia abajo   → encoge (grande → medio) y, pasado el medio, se cierra
// La lista interna conserva su propio scroll (arrastrarla no mueve el sheet).
// Dos anclajes: medio (~60% alto) y grande (~92% alto).
// ==========================================
const SHEET_MEDIUM_RATIO = 0.6;
const SHEET_LARGE_RATIO = 0.92;

function setupExpandableSheet(modal) {
    const content = modal.querySelector('.modal-content');
    if (!content) return;

    let startY = 0;
    let startH = 0;
    let dragging = false;
    let mode = null;      // 'resize' | 'dismiss'
    let overNow = 0;      // px arrastrados por debajo del anclaje medio (modo cierre)
    let mediumH = 0;
    let largeH = 0;

    const easing = 'height 0.28s cubic-bezier(0.32, 0.72, 0, 1), transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)';

    content.addEventListener('touchstart', (e) => {
        if (!isMobileLayout() || e.touches.length !== 1) return;
        // El gesto arranca solo desde la barra superior: el asa (target = content)
        // o la cabecera. La lista scrollea con normalidad. El botón ✕ hace su tap.
        if (e.target.closest('.btn-close')) return;
        const fromTopBar = e.target === content || e.target.closest('.modal-header');
        if (!fromTopBar) return;
        mediumH = Math.round(window.innerHeight * SHEET_MEDIUM_RATIO);
        largeH = Math.round(window.innerHeight * SHEET_LARGE_RATIO);
        startY = e.touches[0].clientY;
        startH = content.getBoundingClientRect().height;
        dragging = true;
        mode = null;
        overNow = 0;
    }, { passive: true });

    content.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        const dy = e.touches[0].clientY - startY;   // + hacia abajo, − hacia arriba
        const targetH = startH - dy;                 // arrastrar arriba ⇒ más alto
        content.style.transition = 'none';
        if (targetH >= mediumH) {
            // Redimensionar entre medio y grande
            mode = 'resize';
            overNow = 0;
            content.style.transform = '';
            content.style.height = `${Math.min(targetH, largeH)}px`;
        } else {
            // Por debajo del anclaje medio: modo cierre (deslizar hacia fuera)
            mode = 'dismiss';
            overNow = mediumH - targetH;
            content.style.height = `${mediumH}px`;
            content.style.transform = `translateY(${overNow}px)`;
        }
        e.preventDefault();
    }, { passive: false });

    const end = () => {
        if (!dragging) return;
        dragging = false;
        content.style.transition = easing;
        if (mode === 'dismiss') {
            const dismissThreshold = Math.min(mediumH * 0.25, 120);
            if (overNow > dismissThreshold) {
                content.style.transform = 'translateY(100%)';
                setTimeout(() => {
                    closeModal(modal.id);
                    content.style.transform = '';
                    content.style.height = '';
                    content.style.transition = '';
                }, 240);
                return;
            }
            // No llegó al umbral: rebota al anclaje medio
            content.style.transform = '';
            content.style.height = `${mediumH}px`;
        } else if (mode === 'resize') {
            // Ajustar al anclaje más cercano
            const h = content.getBoundingClientRect().height;
            const mid = (mediumH + largeH) / 2;
            content.style.height = `${h >= mid ? largeH : mediumH}px`;
        }
        setTimeout(() => { content.style.transition = ''; }, 300);
    };
    content.addEventListener('touchend', end);
    content.addEventListener('touchcancel', end);
}

// ==========================================
// SHEETS MÓVILES — arrastrar hacia abajo para cerrar (estilo iOS)
// Se activa solo en móvil y solo cuando el contenido está scrolleado arriba.
// Si el arrastre supera el umbral, el sheet se desliza fuera y se cierra;
// si no, rebota a su sitio.
// ==========================================
function setupSheetDragDismiss() {
    document.querySelectorAll('.modal').forEach(modal => {
        // Las alertas centradas (.modal-center) no son sheets: sin arrastre
        if (modal.classList.contains('modal-center')) return;
        // Sheets expandibles (avisos, buscar clases): arrastrar la barra de
        // arriba para agrandar/encoger/cerrar (detents estilo iOS)
        if (modal.classList.contains('sheet-expandable')) {
            setupExpandableSheet(modal);
            return;
        }
        const content = modal.querySelector('.modal-content');
        if (!content) return;

        let startY = 0;
        let currentY = 0;
        let draggingSheet = false;
        let innerScrollEl = null;

        content.addEventListener('touchstart', (e) => {
            if (!isMobileLayout()) return;
            if (e.touches.length !== 1) return;
            // Solo iniciar si el contenido está arriba del todo: si hay scroll
            // interno pendiente, el gesto es scroll, no cierre
            if (content.scrollTop > 0) return;
            // Listas con scroll propio dentro del sheet (alumnos, resultados…):
            // si están scrolleadas, el gesto les pertenece a ellas
            innerScrollEl = e.target.closest(
                '.students-modal-list, .search-classes-results, .player-results, .profile-payments-list, .profile-add-section, .monitor-students-list'
            );
            if (innerScrollEl && innerScrollEl.scrollTop > 0) return;
            startY = e.touches[0].clientY;
            currentY = 0;
            draggingSheet = true;
        }, { passive: true });

        content.addEventListener('touchmove', (e) => {
            if (!draggingSheet) return;
            // Si la lista interna empezó a scrollear, ceder el gesto
            if (innerScrollEl && innerScrollEl.scrollTop > 0) {
                draggingSheet = false;
                currentY = 0;
                content.style.transform = '';
                return;
            }
            const dy = e.touches[0].clientY - startY;
            if (dy <= 0) {
                // Hacia arriba: soltar el gesto y dejar scrollear con normalidad
                currentY = 0;
                content.style.transform = '';
                return;
            }
            currentY = dy;
            content.style.transition = 'none';
            content.style.transform = `translateY(${dy}px)`;
            // Evitar que el navegador haga scroll/rebote mientras movemos el sheet
            e.preventDefault();
        }, { passive: false });

        const endSheetDrag = () => {
            if (!draggingSheet) return;
            draggingSheet = false;
            content.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
            const threshold = Math.min(content.offsetHeight * 0.3, 160);
            if (currentY > threshold) {
                // Umbral superado → deslizar fuera y cerrar
                content.style.transform = 'translateY(100%)';
                setTimeout(() => {
                    closeModal(modal.id);
                    content.style.transform = '';
                    content.style.transition = '';
                }, 220);
            } else {
                // No llegó → rebotar a su sitio
                content.style.transform = '';
                setTimeout(() => { content.style.transition = ''; }, 260);
            }
        };
        content.addEventListener('touchend', endSheetDrag);
        content.addEventListener('touchcancel', endSheetDrag);
    });
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('active');
    // El Set de propietarios libera el fondo solo cuando no queda ningún otro
    // bloqueo activo (otro modal o la vista de día)
    unlockBackgroundScroll(modalId);
}

function openAddClassModal(day = '', hour = null, minute = 0) {
    const form = document.getElementById('classForm');
    form.reset();

    appState.selectedClass = null;

    document.getElementById('classModalTitle').textContent = 'Nueva Clase';

    if (day) {
        document.getElementById('classDay').value = day;
    }

    if (hour !== null) {
        const mm = String(minute || 0).padStart(2, '0');
        document.getElementById('classStartHour').value = String(hour).padStart(2, '0');
        document.getElementById('classStartMinute').value = mm;
        document.getElementById('classEndHour').value = String(hour + 1).padStart(2, '0');
        document.getElementById('classEndMinute').value = mm;
    }

    // initialize temporary selection for this form
    appState.tempSelectedStudents = [];
    renderStudentsSelector();

    const commentsEl = document.getElementById('classComments');
    if (commentsEl) commentsEl.value = '';

    const precioEl = document.getElementById('classPrecio');
    if (precioEl) precioEl.value = DEFAULT_CLASS_PRICE;

    const recurringSection = document.getElementById('recurringSection');
    if (recurringSection) recurringSection.style.display = '';
    const recurringEnabled = document.getElementById('recurringEnabled');
    if (recurringEnabled) recurringEnabled.checked = false;

    openModal('classModal');
}

function openEditClassModal(classId) {
    const cls = getClassById(classId);
    if (!cls) return;

    const form = document.getElementById('classForm');
    form.reset();

    document.getElementById('classModalTitle').textContent = 'Editar Clase';
    // El día se toma de la FECHA real de la clase, no del campo cls.day (que
    // podía estar desincronizado y hacía saltar la clase de día al guardar).
    // Además alineamos la semana activa con esa fecha para que el guardado
    // (getDateForDay sobre currentWeekStart) recomponga el día correcto.
    const clsRealDate = new Date(cls.date);
    const realDayName = CONFIG.days[(clsRealDate.getDay() + 6) % 7];
    setAnchorDate(clsRealDate);
    document.getElementById('classDay').value = realDayName;

    const startParts = cls.startTime.split(':');
    document.getElementById('classStartHour').value = startParts[0];
    document.getElementById('classStartMinute').value = startParts[1] || '00';

    const endParts = cls.endTime.split(':');
    document.getElementById('classEndHour').value = endParts[0];
    document.getElementById('classEndMinute').value = endParts[1] || '00';

    // initialize temporary selection with class students
    appState.tempSelectedStudents = Array.isArray(cls.students) ? [...cls.students] : [];
    renderStudentsSelector();

    const commentsEl = document.getElementById('classComments');
    if (commentsEl) commentsEl.value = cls.comments || '';

    const precioEl = document.getElementById('classPrecio');
    if (precioEl) precioEl.value = cls.precio != null ? cls.precio : DEFAULT_CLASS_PRICE;

    appState.selectedClass = classId;

    const recurringSection = document.getElementById('recurringSection');
    if (recurringSection) recurringSection.style.display = 'none';

    openModal('classModal');
}

function showClassDetails(classId) {
    const cls = getClassById(classId);
    if (!cls) return;

    const container = document.getElementById('classDetailsContent');
    const occupancy = getClassOccupancy(cls);
    const occupancyText = occupancy === 'full' ? 'Completa' :
        occupancy === 'partial' ? 'Parcial' : 'Vacía';

    const completedBadge = cls.isCompleted ?
        '<span style="color: var(--status-full); font-weight: 600; margin-left: var(--spacing-sm);">✓ Cerrada manualmente</span>' : '';

    let studentsHtml = '<div class="students-in-class"><h4>Alumnos inscritos:</h4>';

    if (cls.students.length === 0) {
        studentsHtml += '<p style="color: var(--gray-500);">No hay alumnos en esta clase</p>';
    } else {
        const canMarkAbsence = isMonitor() || isCoordinator();
        cls.students.forEach(studentId => {
            const student = getStudentById(studentId);
            if (student) {
                const levelHtml = (student.level !== null && student.level !== undefined) ? `<span class="level-badge" style="margin-left:0.5rem">Nivel: ${student.level}</span>` : '';
                const absenceBtn = canMarkAbsence
                    ? `<button class="btn-icon-sm btn-absence" onclick="markAbsence('${cls.id}', '${studentId}')" title="Marcar ausencia (clase por recuperar)">🔁 Ausente</button>`
                    : '';
                // Sacar al alumno de la clase (libera la plaza). Distinto de "Ausente":
                // aquí SÍ deja de estar inscrito. Pregunta si darle clase por recuperar.
                const removeBtn = canMarkAbsence
                    ? `<button class="btn-icon-sm btn-remove-student" onclick="removeStudentFromClass('${cls.id}', '${studentId}')" title="Quitar de la clase (libera la plaza)">✕</button>`
                    : '';
                studentsHtml += `<div class="student-item"><span>${escapeHtml(student.name)}${levelHtml}</span><span class="student-item-actions">${absenceBtn}${removeBtn}</span></div>`;
            }
        });
    }
    studentsHtml += '</div>';

    container.innerHTML = `
        <div class="detail-row">
            <span class="detail-label">Día:</span>
            <span class="detail-value">${cls.day}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Fecha:</span>
            <span class="detail-value">${formatDate(cls.date)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Horario:</span>
            <span class="detail-value">${cls.startTime} - ${cls.endTime}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Ocupación:</span>
            <span class="detail-value">${cls.students.length}/${cls.maxCapacity} (${occupancyText})${completedBadge}</span>
        </div>
        ${cls.comments ? `<div class="detail-row"><span class="detail-label">Comentarios:</span><span class="detail-value">${cls.comments}</span></div>` : ''}
        ${studentsHtml}
    `;

    appState.selectedClass = classId;
    updateToggleCompletedButton(cls);
    // If there are pending changes for this class, show Save/Cancel in modal actions
    const modal = document.getElementById('classDetailsModal');
    const actions = modal ? modal.querySelector('.modal-actions') : null;
    if (actions) {
        // Remove existing dynamic buttons to avoid duplicates
        const existingSave = document.getElementById('saveDraggedClassBtn');
        if (existingSave) existingSave.remove();
        const existingCancel = document.getElementById('cancelDraggedClassBtn');
        if (existingCancel) existingCancel.remove();

        if (appState.pendingSave && appState.pendingSave.classId === classId) {
            const saveBtn = document.createElement('button');
            saveBtn.id = 'saveDraggedClassBtn';
            saveBtn.className = 'btn btn-primary';
            saveBtn.textContent = 'Guardar cambios';
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                performPendingSave();
            });

            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'cancelDraggedClassBtn';
            cancelBtn.className = 'btn btn-secondary';
            cancelBtn.textContent = 'Cancelar cambios';
            cancelBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (await showConfirm('¿Cancelar los cambios realizados arrastrando la clase?',
                    { title: 'Cancelar cambios', confirmText: 'Sí, cancelar', cancelText: 'No' })) {
                    cancelPendingSave();
                }
            });

            // insert save & cancel before delete/edit to make them prominent
            actions.insertBefore(saveBtn, actions.firstChild);
            actions.insertBefore(cancelBtn, actions.firstChild);
        }
    }
    openModal('classDetailsModal');
}

function showConfirmChangesModal(changedDay, changedTime) {
    document.getElementById('changedDay').textContent = changedDay;
    document.getElementById('changedTime').textContent = changedTime;
    openModal('confirmChangesModal');
}

function closeConfirmChangesModal() {
    closeModal('confirmChangesModal');
}

function closeSaveChangesModal() {
    closeModal('saveChangesModal');
}

function discardChanges() {
    closeConfirmChangesModal();
    cancelPendingSave();
}

function saveChanges() {
    closeConfirmChangesModal();
    performPendingSave();
}

// ==========================================
// FORM HANDLERS
// ==========================================

async function handleClassFormSubmit(e) {
    e.preventDefault();

    const day = document.getElementById('classDay').value;

    if (!day) {
        showToast('Debes seleccionar un día', 'error');
        return;
    }

    const startHour = document.getElementById('classStartHour').value;
    const startMinute = document.getElementById('classStartMinute').value;
    const startTime = `${startHour}:${startMinute}`;

    const endHour = document.getElementById('classEndHour').value;
    const endMinute = document.getElementById('classEndMinute').value;
    const endTime = `${endHour}:${endMinute}`;

    const commentsEl = document.getElementById('classComments');
    const comments = commentsEl ? commentsEl.value.trim() : '';

    // Precio que pagará el alumno al aceptarse su solicitud (ver stripe_payments.sql).
    const precioEl = document.getElementById('classPrecio');
    const precioRaw = precioEl ? parseFloat(precioEl.value) : NaN;
    const precio = Number.isFinite(precioRaw) && precioRaw > 0 ? precioRaw : DEFAULT_CLASS_PRICE;

    const selectedStudents = Array.isArray(appState.tempSelectedStudents) ? appState.tempSelectedStudents : [];

    if (selectedStudents.length > CONFIG.maxStudentsPerClass) {
        showToast(`Máximo ${CONFIG.maxStudentsPerClass} alumnos por clase`, 'error');
        return;
    }

    // Validate times (expect HH:MM)
    const timePattern = /^\d{2}:\d{2}$/;
    if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
        showToast('Formato de hora inválido', 'error');
        return;
    }

    // Ensure end time is after start time
    const [sh, sm] = startTime.split(':').map(n => parseInt(n, 10));
    const [eh, em] = endTime.split(':').map(n => parseInt(n, 10));
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    if (endMinutes <= startMinutes) {
        showToast('La hora de fin debe ser posterior a la de inicio', 'error');
        return;
    }

    try {
        showLoading('Guardando clase...');

        const dayIndex = CONFIG.days.indexOf(day);
        // Fecha a mediodía local antes de serializar: evita el desfase de UTC
        // (toISOString cruzando la medianoche) al calcular el día natural.
        const rawDate = getDateForDay(appState.currentWeekStart, dayIndex);
        const date = new Date(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate(), 12, 0, 0);
        const excludeId = appState.selectedClass || null;

        if (hasClassTimeConflict(date, startTime, endTime, excludeId)) {
            hideLoading();
            showToast('Ya existe otra clase en ese horario para ese día', 'error');
            return;
        }

        if (appState.selectedClass) {
            await updateClass(appState.selectedClass, {
                day,
                date: date.toISOString(),
                startTime,
                endTime,
                students: selectedStudents,
                comments,
                precio,
            });
            appState.selectedClass = null;
        } else {
            const recurringChecked = document.getElementById('recurringEnabled')?.checked;

            if (recurringChecked) {
                const RECURRING_WEEKS = 52;
                const groupId = generateId();
                showLoading('Creando clases recurrentes...');

                const currentUser = getCurrentUser();
                let monitorId = null, monitorName = null;
                if (isMonitor()) {
                    monitorId = currentUser.id;
                    monitorName = currentUser.name;
                } else if (isCoordinator()) {
                    monitorId = appState.selectedMonitor || null;
                    monitorName = appState.selectedMonitor ? getMonitorById(appState.selectedMonitor)?.name : null;
                }

                const classesToCreate = [];
                for (let w = 0; w < RECURRING_WEEKS; w++) {
                    const classDate = new Date(date);
                    classDate.setDate(classDate.getDate() + w * 7);
                    if (w > 0 && hasClassTimeConflict(classDate, startTime, endTime, null)) continue;
                    classesToCreate.push({
                        id: generateId(),
                        day,
                        date: classDate.toISOString(),
                        startTime: formatTime(startTime),
                        endTime: formatTime(endTime),
                        students: selectedStudents,
                        maxCapacity: CONFIG.maxStudentsPerClass,
                        status: 'active',
                        isCompleted: false,
                        monitorId,
                        monitorName,
                        comments,
                        precio,
                        recurringGroupId: groupId,
                    });
                }

                try {
                    const results = await Promise.all(classesToCreate.map(c => db.createClass(c)));
                    results.forEach(r => r && appState.classes.push(db.convertClassFromDB(r)));
                } catch (dbError) {
                    console.warn('createClass falló, guardando localmente:', dbError);
                    classesToCreate.forEach(c => appState.classes.push(c));
                }

                renderCalendar();
                saveToLocalStorage();
                showToast(`${classesToCreate.length} clases recurrentes creadas`, 'success');
            } else {
                await addClassOnDate(date, day, startTime, endTime, selectedStudents, comments, null, precio);
                renderCalendar();
                saveToLocalStorage();
                showToast('Clase creada correctamente', 'success');
            }
        }

        hideLoading();
        // clear temp selection for next time
        appState.tempSelectedStudents = [];
        closeModal('classModal');
    } catch (error) {
        hideLoading();
        console.error('Error saving class:', error);
        try { console.error('Error details:', JSON.stringify(error, null, 2)); } catch (e) {}
        showToast('Error guardando clase (ver consola)', 'error');
    }
}

async function showDeleteClassModal(classId) {
    const cls = getClassById(classId);
    if (!cls) return;

    if (!cls.recurringGroupId) {
        closeModal('classDetailsModal');
        await deleteClass(classId);
        return;
    }

    appState.classToDelete = classId;

    const desc = document.getElementById('deleteClassModalDesc');
    if (desc) desc.textContent = '¿Quieres eliminar solo esta clase o todas las clases de esta serie recurrente?';

    const recurringBtn = document.getElementById('deleteRecurringGroupConfirmBtn');
    if (recurringBtn) recurringBtn.style.display = '';

    closeModal('classDetailsModal');
    openModal('deleteClassModal');
}

async function confirmDeleteSingleClass() {
    const classId = appState.classToDelete;
    if (!classId) return;
    closeModal('deleteClassModal');
    await deleteClass(classId);
    appState.classToDelete = null;
}

async function confirmDeleteRecurringGroup() {
    const classId = appState.classToDelete;
    if (!classId) return;
    const cls = getClassById(classId);
    if (!cls || !cls.recurringGroupId) return;

    closeModal('deleteClassModal');
    showLoading('Eliminando clases recurrentes...');
    try {
        await db.deleteClassesByGroup(cls.recurringGroupId);
        appState.classes = appState.classes.filter(c => c.recurringGroupId !== cls.recurringGroupId);
        try { await loadAllData(); } catch (e) {}
        saveToLocalStorage();
        renderCalendar();
        showToast('Clases recurrentes eliminadas', 'success');
    } catch (error) {
        console.error('Error deleting recurring group:', error);
        showToast('Error al eliminar las clases recurrentes', 'error');
    } finally {
        hideLoading();
        appState.classToDelete = null;
        appState.selectedClass = null;
    }
}

async function addClassOnDate(date, day, startTime, endTime, studentIds, comments, recurringGroupId = null, precio = null) {
    const currentUser = getCurrentUser();
    let monitorId = null;
    let monitorName = null;

    if (isMonitor()) {
        monitorId = currentUser.id;
        monitorName = currentUser.name;
    } else if (isCoordinator()) {
        monitorId = appState.selectedMonitor || null;
        monitorName = appState.selectedMonitor ? getMonitorById(appState.selectedMonitor)?.name : null;
    }

    const newClass = {
        id: generateId(),
        day,
        date: date.toISOString(),
        startTime: formatTime(startTime),
        endTime: formatTime(endTime),
        students: studentIds,
        maxCapacity: CONFIG.maxStudentsPerClass,
        status: 'active',
        isCompleted: false,
        monitorId,
        monitorName,
        comments,
        precio,
        recurringGroupId,
    };

    try {
        const result = await db.createClass(newClass);
        const converted = db.convertClassFromDB(result);
        appState.classes.push(converted);
        return converted;
    } catch (dbError) {
        console.warn('db.createClass falló, guardando localmente:', dbError);
        appState.classes.push(newClass);
        return newClass;
    }
}

async function handleStudentFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('studentName').value.trim();
    const email = document.getElementById('studentEmail').value.trim();
    const phone = document.getElementById('studentPhone').value.trim();
    const level = document.getElementById('studentLevel').value.trim();

    if (!name) {
        showToast('El nombre es obligatorio', 'error');
        return;
    }

    // Validate level if provided
    if (level !== '' && (isNaN(level) || parseFloat(level) < 0 || parseFloat(level) > 5)) {
        showToast('El nivel debe ser un número entre 0 y 5', 'error');
        return;
    }

    try {
        showLoading('Guardando alumno...');
        if (appState.editingStudent) {
            await updateStudent(appState.editingStudent, {
                name,
                email,
                phone,
                level: level !== '' ? parseFloat(level) : null
            });
            appState.editingStudent = null;
        } else {
            await addStudent(name, email, phone, level !== '' ? parseFloat(level) : null);
        }
        hideLoading();
        closeModal('studentModal');
        document.getElementById('studentForm').reset();
    } catch (error) {
        hideLoading();
        console.error('Error saving student:', error);
    }
}

async function handleMonitorFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('monitorName').value.trim();
    const email = document.getElementById('monitorEmail').value.trim();
    const phone = document.getElementById('monitorPhone').value.trim();

    if (!name) {
        showToast('El nombre es obligatorio', 'error');
        return;
    }

    try {
        showLoading('Guardando monitor...');
        await addMonitor(name, email, phone);
        hideLoading();
        closeMonitorModal();
        showToast('Monitor agregado correctamente', 'success');
    } catch (error) {
        hideLoading();
    }
}

// ==========================================
// NAVIGATION
// ==========================================

function navigateWeek(direction) {
    const currentWeek = new Date(appState.currentWeekStart);
    currentWeek.setDate(currentWeek.getDate() + (direction * 7));
    setAnchorDate(currentWeek);
    renderWeekTitle();
    renderCalendar();
}

function goToToday() {
    setAnchorDate(new Date());
    renderWeekTitle();
    renderCalendar();
}

// Copiar todas las clases de la semana actual a la semana siguiente
async function copyCurrentWeekToNext() {
    try {
        const sourceWeekStart = new Date(appState.currentWeekStart);
        const targetWeekStart = new Date(sourceWeekStart);
        targetWeekStart.setDate(targetWeekStart.getDate() + 7);

        const sourceClasses = getClassesForWeek(sourceWeekStart);
        if (sourceClasses.length === 0) {
            showToast('No hay clases en esta semana para copiar', 'error');
            return;
        }

        const existingTarget = getClassesForWeek(targetWeekStart);
        if (existingTarget.length > 0) {
            const ok = await showConfirm('La semana siguiente ya tiene clases. ¿Quieres copiar igualmente y añadir más?',
                { title: 'Copiar semana', confirmText: 'Copiar igualmente' });
            if (!ok) return;
        }

        showLoading('Copiando clases a la semana siguiente...');

        const createdClasses = [];
        for (const cls of sourceClasses) {
            const dayIndex = CONFIG.days.indexOf(cls.day);
            const newDate = getDateForDay(targetWeekStart, dayIndex);

            const newClass = {
                id: generateId(),
                day: cls.day,
                date: newDate.toISOString(),
                startTime: cls.startTime,
                endTime: cls.endTime,
                students: [...cls.students],
                maxCapacity: cls.maxCapacity,
                status: 'active',
                isCompleted: false,
                monitorId: cls.monitorId,
                monitorName: cls.monitorName,
                comments: cls.comments || ''
            };

            try {
                const result = await db.createClass(newClass);
                const converted = db.convertClassFromDB(result);
                appState.classes.push(converted);
                createdClasses.push(converted);
            } catch (dbError) {
                console.warn('Error copiando clase a Supabase, guardando solo localmente:', dbError);
                appState.classes.push(newClass);
                createdClasses.push(newClass);
            }
        }

        saveToLocalStorage();

        // Movernos visualmente a la semana destino para que el usuario vea el resultado
        setAnchorDate(targetWeekStart);
        renderWeekTitle();
        renderCalendar();

        hideLoading();
        showToast(`Se copiaron ${createdClasses.length} clases a la semana siguiente`, 'success');
    } catch (error) {
        console.error('Error copiando semana:', error);
        hideLoading();
        showToast('Error al copiar clases de la semana', 'error');
    }
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        console.error('Toast container not found. Ensure the element with id "toastContainer" exists in the HTML.');
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? '✓' : '✕';

    // escapeHtml: el mensaje puede venir de la BD (p. ej. notifications.message,
    // que incluye nombres de alumnos) — sin escapar sería un XSS almacenado.
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-message">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease-in-out reverse';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// ==========================================
// DIÁLOGOS PROPIOS (sustituyen a confirm()/alert()/prompt() nativos, que el
// navegador muestra como "localhost dice"). Reutilizan el estilo de modales de
// la app y devuelven una promesa. Uso: `if (await showConfirm('...')) { ... }`.
// ==========================================

// Confirmación. Resuelve true (Aceptar) o false (Cancelar/Escape/fondo).
function showConfirm(message, options = {}) {
    const {
        title = 'Confirmar',
        confirmText = 'Aceptar',
        cancelText = 'Cancelar',
        danger = false,
    } = options;
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal modal-center active app-dialog';
        overlay.innerHTML = `
            <div class="modal-content modal-compact">
                <div class="modal-header"><h3>${escapeHtml(title)}</h3></div>
                <div class="modal-body"><p class="app-dialog-msg">${escapeHtml(message)}</p></div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" data-act="cancel">${escapeHtml(cancelText)}</button>
                    <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${escapeHtml(confirmText)}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const close = (val) => { document.removeEventListener('keydown', onKey); overlay.remove(); resolve(val); };
        const onKey = (e) => { if (e.key === 'Escape') close(false); else if (e.key === 'Enter') close(true); };
        overlay.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
        overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
        document.addEventListener('keydown', onKey);
        setTimeout(() => overlay.querySelector('[data-act="ok"]').focus(), 30);
    });
}

// Aviso informativo con un solo botón. Resuelve al cerrarse.
function showAlert(message, options = {}) {
    const { title = 'Aviso', okText = 'Aceptar' } = options;
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal modal-center active app-dialog';
        overlay.innerHTML = `
            <div class="modal-content modal-compact">
                <div class="modal-header"><h3>${escapeHtml(title)}</h3></div>
                <div class="modal-body"><p class="app-dialog-msg">${escapeHtml(message)}</p></div>
                <div class="modal-actions">
                    <button class="btn btn-primary" data-act="ok">${escapeHtml(okText)}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const close = () => { document.removeEventListener('keydown', onKey); overlay.remove(); resolve(); };
        const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
        overlay.querySelector('[data-act="ok"]').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', onKey);
        setTimeout(() => overlay.querySelector('[data-act="ok"]').focus(), 30);
    });
}

// Pide un texto. Resuelve con el valor (string) o null si se cancela.
function showPrompt(message, defaultValue = '', options = {}) {
    const {
        title = 'Introduce un valor',
        confirmText = 'Aceptar',
        cancelText = 'Cancelar',
    } = options;
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal modal-center active app-dialog';
        overlay.innerHTML = `
            <div class="modal-content modal-compact">
                <div class="modal-header"><h3>${escapeHtml(title)}</h3></div>
                <div class="modal-body">
                    <p class="app-dialog-msg">${escapeHtml(message)}</p>
                    <input type="text" class="app-dialog-input">
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" data-act="cancel">${escapeHtml(cancelText)}</button>
                    <button class="btn btn-primary" data-act="ok">${escapeHtml(confirmText)}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('.app-dialog-input');
        input.value = defaultValue;
        const close = (val) => { document.removeEventListener('keydown', onKey); overlay.remove(); resolve(val); };
        const onKey = (e) => { if (e.key === 'Escape') close(null); else if (e.key === 'Enter') close(input.value); };
        overlay.querySelector('[data-act="ok"]').addEventListener('click', () => close(input.value));
        overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
        document.addEventListener('keydown', onKey);
        setTimeout(() => { input.focus(); input.select(); }, 30);
    });
}

// ==========================================
// CLASS COMPLETION TOGGLE
// ==========================================

async function toggleClassCompleted(classId) {
    const cls = getClassById(classId);
    if (!cls) return;

    const newStatus = !cls.isCompleted;
    await updateClass(classId, { isCompleted: newStatus });

    updateToggleCompletedButton(cls);
    showClassDetails(classId);

    const message = newStatus ? 'Clase marcada como cerrada' : 'Marca de cerrada eliminada';
    showToast(message, 'success');
}

// Marca a un alumno como ausente en una clase: crea una "clase por recuperar".
// Solo monitores y coordinadores.
async function markAbsence(classId, studentId) {
    if (!(isMonitor() || isCoordinator())) return;
    const cls = getClassById(classId);
    const student = getStudentById(studentId);
    if (!cls || !student) return;

    if (!(await showConfirm(`¿Marcar a ${student.name} como ausente? Se le añadirá una clase por recuperar.`,
        { title: 'Marcar ausencia', confirmText: 'Marcar ausente' }))) return;

    try {
        await db.createRecovery({
            studentId,
            originClassId: classId,
            originDate: (cls.date || '').substring(0, 10),
            notes: `Ausencia en clase del ${formatDate(cls.date)} ${cls.startTime}`,
        });
        showToast(`Ausencia registrada · ${student.name} tiene una clase por recuperar`, 'success');
    } catch (e) {
        console.error('Error registrando ausencia:', e);
        showToast('No se pudo registrar la ausencia', 'error');
    }
}

// Saca a un alumno de la clase directamente desde el panel de detalle (sin pasar
// por "Editar"). Libera la plaza (baja la ocupación). El monitor solo pulsa la ✕:
// el sistema decide solo si darle recuperación según si HABÍA PAGADO la plaza
//   - pagó (class_requests.confirmada_pagada) -> clase por recuperar (no la pierde)
//   - no pagó (añadido a mano, o nunca pagó)  -> la plaza se pierde, sin recuperación
// No confundir con markAbsence, que NO lo saca de la clase.
async function removeStudentFromClass(classId, studentId) {
    if (!(isMonitor() || isCoordinator())) return;
    const cls = getClassById(classId);
    const student = getStudentById(studentId);
    if (!cls || !student) return;

    if (!(await showConfirm(`¿Quitar a ${student.name} de esta clase? La plaza quedará libre.`,
        { title: 'Quitar de la clase', confirmText: 'Quitar', cancelText: 'Cancelar', danger: true }))) return;

    try {
        // ¿Había pagado la plaza? Eso decide si se le da recuperación (automático).
        const paid = await db.getPaidRequestForClass(classId, studentId);

        const newStudents = (cls.students || []).filter(id => id !== studentId);
        await updateClass(classId, { students: newStudents }, true);

        if (paid) {
            await db.createRecovery({
                studentId,
                originClassId: classId,
                originDate: (cls.date || '').substring(0, 10),
                notes: `Quitado de la clase pagada del ${formatDate(cls.date)} ${cls.startTime}`,
            });
        }

        showToast(paid
            ? `${student.name} quitado · había pagado, tiene una clase por recuperar`
            : `${student.name} quitado de la clase`, 'success');

        showClassDetails(classId); // refresca el panel abierto (ocupación y lista)
    } catch (e) {
        console.error('Error quitando al alumno de la clase:', e);
        showToast('No se pudo quitar al alumno de la clase', 'error');
    }
}

function updateToggleCompletedButton(cls) {
    const btn = document.getElementById('toggleCompletedBtn');
    if (!btn) return;

    if (cls.isCompleted) {
        btn.innerHTML = '<span class="btn-icon">✕</span> Desmarcar como Cerrada';
        btn.className = 'btn btn-success';
    } else {
        btn.innerHTML = '<span class="btn-icon">✓</span> Marcar como Cerrada';
        btn.className = 'btn btn-secondary';
    }
}

// ==========================================
// MONITOR MODAL MANAGEMENT
// ==========================================

function openAddMonitorModal() {
    document.getElementById('monitorForm').reset();
    openModal('monitorModal');
}

function closeMonitorModal() {
    closeModal('monitorModal');
}

// ==========================================
// UI MANAGEMENT
// ==========================================

function showMainApp() {
    const appView = document.getElementById('app-view');
    if (appView) appView.style.display = 'block';
    const mainContainer = document.querySelector('.main-container');
    const header = document.querySelector('.header');
    if (mainContainer) mainContainer.style.display = 'flex';
    if (header) header.style.display = 'block';

    updateHeaderForUser();
    fetchWeather();

    // Los roles de personal (coordinador, recepción, monitor) tienen prioridad.
    // La vista de alumno solo se muestra a cuentas que sean ÚNICAMENTE 'usuario'.
    if (isCoordinator()) {
        showCoordinatorDashboard();
    } else if (isRecepcion()) {
        showRecepcionView();
    } else if (isMonitor()) {
        showMonitorView();
    } else if (isUsuario()) {
        showStudentView();
    } else {
        showMonitorView();
    }

    handleStripeReturn();
}

// El alumno vuelve de Stripe Checkout (success_url / cancel_url).
// La confirmación real la hace el webhook, pero puede tardar unos segundos: aquí
// preguntamos el estado a Stripe para que el alumno vea su plaza confirmada al
// instante. Si el webhook llega después, no pasa nada: la operación es idempotente.
async function handleStripeReturn() {
    const params = new URLSearchParams(window.location.search);
    const pago = params.get('pago');
    const requestId = params.get('request');
    if (!pago) return;

    // Limpiar la query para que un refresco no repita el aviso.
    window.history.replaceState({}, '', window.location.pathname);

    if (pago === 'cancelado') {
        showToast('Pago cancelado. Tu plaza sigue reservada hasta que caduque el plazo.', 'warning');
        renderStudentDashboard();
        return;
    }

    if (pago === 'ok' && requestId) {
        try {
            const { status } = await db.getCheckoutStatus(requestId);
            if (status === 'confirmada_pagada') {
                showToast('¡Pago recibido! Tu plaza está confirmada 🎾', 'success');
            } else if (status === 'cancelada_por_impago') {
                showToast('El plazo de pago había terminado y la plaza se liberó.', 'warning');
            } else {
                showToast('Estamos confirmando tu pago...', 'success');
            }
        } catch (error) {
            console.warn('No se pudo confirmar el pago al volver de Stripe:', error);
            showToast('Estamos confirmando tu pago...', 'success');
        }
        await refreshClassHolds();
        renderStudentDashboard();
    }
}

function hideMainApp() {
    const mainContainer = document.querySelector('.main-container');
    const header = document.querySelector('.header');
    if (mainContainer) mainContainer.style.display = 'none';
    if (header) header.style.display = 'none';
}

function updateHeaderForUser() {
    const userDisplay = document.getElementById('userDisplay');
    const currentUser = getCurrentUser();

    if (userDisplay && currentUser) {
        let roleEmoji = '🎾';
        if (isCoordinator()) roleEmoji = '👔';
        else if (isRecepcion()) roleEmoji = '🏢';
        else if (isUsuario()) roleEmoji = '🎾';
        userDisplay.innerHTML = `${roleEmoji} ${currentUser.name}`;
    }
}

function showCoordinatorDashboard() {
    const calendarSection = document.getElementById('calendarSectionContainer');
    const coordinatorDashboard = document.getElementById('coordinatorDashboard');
    const recepcionDashboard = document.getElementById('recepcionDashboard');
    const studentDashboard = document.getElementById('studentDashboard');
    const sidebar = document.getElementById('sidebar');

    if (calendarSection) calendarSection.style.display = 'none';
    if (recepcionDashboard) recepcionDashboard.style.display = 'none';
    if (studentDashboard) studentDashboard.style.display = 'none';
    if (coordinatorDashboard) {
        coordinatorDashboard.style.display = 'block';
        switchCoordTab(appState.coordTab || 'monitores');
    }
    if (sidebar) sidebar.style.display = 'none';
}

// Alterna entre las pestañas del panel de coordinador: "Monitores" y
// "Gestión de clase" (historial de pagos y retrasos de alumnos).
function switchCoordTab(tab) {
    appState.coordTab = tab;

    const monitoresView = document.getElementById('coordMonitoresView');
    const gestionView = document.getElementById('coordGestionClaseView');
    const tabMonitores = document.getElementById('coordTabMonitores');
    const tabGestion = document.getElementById('coordTabGestion');

    if (monitoresView) monitoresView.style.display = tab === 'monitores' ? '' : 'none';
    if (gestionView) gestionView.style.display = tab === 'gestion' ? '' : 'none';
    if (tabMonitores) tabMonitores.classList.toggle('active', tab === 'monitores');
    if (tabGestion) tabGestion.classList.toggle('active', tab === 'gestion');

    if (tab === 'monitores') renderMonitorsList();
    else if (tab === 'gestion') renderGestionClase();
}

// Tabla de "Gestión de clase": por cada alumno, su estado de pago del mes
// actual, cuotas pendientes, clases por recuperar y si está "con retraso"
// (impago vencido, misma regla que bloquea la sesión del alumno).
async function renderGestionClase() {
    const container = document.getElementById('coordGestionClaseContent');
    if (!container) return;

    container.innerHTML = '<p class="profile-loading">Cargando historial de pagos...</p>';

    const students = appState.students.filter(s => s.active !== false);

    // Cargar TODOS los pagos y recuperaciones pendientes en 2 consultas
    // (no una por alumno): escala aunque el club tenga miles de alumnos.
    let allPayments = {};
    let pendingRecoveries = [];
    try {
        const [paymentRows, recData] = await Promise.all([
            db.getAllPayments().catch(() => []),
            db.getPendingRecoveries().catch(() => []),
        ]);
        // Agrupar los pagos por alumno en memoria.
        paymentRows.forEach(row => {
            const p = db.convertPaymentFromDB(row);
            (allPayments[p.studentId] = allPayments[p.studentId] || []).push(p);
        });
        pendingRecoveries = recData.map(r => db.convertRecoveryFromDB(r));
    } catch (e) {
        console.error('Error cargando gestión de clase:', e);
    }

    const recoveryCountByStudent = {};
    pendingRecoveries.forEach(r => {
        recoveryCountByStudent[r.studentId] = (recoveryCountByStudent[r.studentId] || 0) + 1;
    });

    // Cachear los datos para poder filtrar por nombre sin volver a consultar.
    appState.gestionData = { students, allPayments, recoveryCountByStudent };
    renderGestionClaseTable();
}

// Pinta el armazón de la tabla (resumen + buscador + cabecera) UNA sola vez.
// Al escribir en el buscador solo se actualizan las filas (updateGestionRows),
// sin re-renderizar el input: así no pierde el foco ni salta la pantalla
// con el teclado en móvil (iOS/Android).
function renderGestionClaseTable() {
    const container = document.getElementById('coordGestionClaseContent');
    if (!container || !appState.gestionData) return;

    const { students, allPayments } = appState.gestionData;
    const currentPeriodLabel = formatPeriod(periodOf());
    const lateCount = students.filter(s => findBlockingUnpaidQuota(allPayments[s.id] || [])).length;

    container.innerHTML = `
        <div class="gestion-controls">
            <div class="gestion-search-wrap">
                <span class="gestion-search-icon">🔍</span>
                <input type="search" id="gestionSearch" class="gestion-search-input"
                    placeholder="Buscar alumno..." value="${escapeHtml(appState.gestionSearch || '')}"
                    autocomplete="off" autocorrect="off" spellcheck="false"
                    oninput="onGestionSearchInput(this.value)">
            </div>
            <div class="gestion-summary">
                <span>Mes actual: <strong>${escapeHtml(currentPeriodLabel)}</strong></span>
                <span>Alumnos: <strong>${students.length}</strong></span>
                <span class="${lateCount ? 'is-late' : ''}">Con retraso: <strong>${lateCount}</strong></span>
            </div>
        </div>
        <div class="gestion-table-wrap">
            <table class="gestion-table">
                <thead>
                    <tr>
                        <th>Alumno</th>
                        <th>Última cuota pagada</th>
                        <th>Cuotas pendientes</th>
                        <th>Por recuperar</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody id="gestionTableBody"></tbody>
            </table>
        </div>
    `;

    updateGestionRows();
}

// Actualiza SOLO las filas de la tabla según el filtro (no toca el buscador).
function updateGestionRows() {
    const tbody = document.getElementById('gestionTableBody');
    if (!tbody || !appState.gestionData) return;

    const { students, allPayments, recoveryCountByStudent } = appState.gestionData;
    const query = (appState.gestionSearch || '').toLowerCase().trim();
    const filtered = query
        ? students.filter(s => s.name.toLowerCase().includes(query))
        : students;

    const rows = filtered.map(s => {
        const payments = allPayments[s.id] || [];
        const lastPaid = payments
            .filter(p => p.paidDate && p.period)
            .sort((a, b) => (b.period || '').localeCompare(a.period || ''))[0];
        const pending = payments.filter(p => !p.paidDate);
        const blocking = findBlockingUnpaidQuota(payments);
        const recoveries = recoveryCountByStudent[s.id] || 0;

        const statusHtml = blocking
            ? `<span class="badge-late">⚠️ Retraso (${escapeHtml(formatPeriod(blocking.period))})</span>`
            : `<span class="badge-ok">Al día</span>`;

        return `
            <tr class="${blocking ? 'row-late' : ''}">
                <td>${escapeHtml(s.name)}</td>
                <td>${lastPaid ? escapeHtml(formatPeriod(lastPaid.period)) : '—'}</td>
                <td class="num">${pending.length}</td>
                <td class="num">${recoveries}</td>
                <td>${statusHtml}</td>
            </tr>`;
    }).join('');

    const emptyRow = query
        ? `<tr><td colspan="5">Ningún alumno coincide con "${escapeHtml(query)}".</td></tr>`
        : '<tr><td colspan="5">No hay alumnos.</td></tr>';

    tbody.innerHTML = rows || emptyRow;
}

// Actualiza el filtro del buscador de "Gestión de clase" y refresca las filas.
function onGestionSearchInput(value) {
    appState.gestionSearch = value;
    updateGestionRows();
}

function showMonitorView() {
    const calendarSection = document.getElementById('calendarSectionContainer');
    const coordinatorDashboard = document.getElementById('coordinatorDashboard');
    const recepcionDashboard = document.getElementById('recepcionDashboard');
    const studentDashboard = document.getElementById('studentDashboard');
    const sidebar = document.getElementById('sidebar');

    if (calendarSection) calendarSection.style.display = 'block';
    if (coordinatorDashboard) coordinatorDashboard.style.display = 'none';
    if (recepcionDashboard) recepcionDashboard.style.display = 'none';
    if (studentDashboard) studentDashboard.style.display = 'none';
    if (sidebar) sidebar.style.display = 'block';

    renderCalendar();
    renderStudentsList();

    // Solicitudes de inscripción: solo el monitor las gestiona.
    renderSolicitudesBadge();
    // Bandeja de avisos 🔔: lo que los toasts pierden si la app estaba cerrada.
    renderNotifBadge();
    const monitorId = getCurrentUser()?.id;
    if (isMonitor() && monitorId) subscribeToNotifications(monitorId);
}

function showRecepcionView() {
    const calendarSection = document.getElementById('calendarSectionContainer');
    const coordinatorDashboard = document.getElementById('coordinatorDashboard');
    const recepcionDashboard = document.getElementById('recepcionDashboard');
    const studentDashboard = document.getElementById('studentDashboard');
    const sidebar = document.getElementById('sidebar');

    if (calendarSection) calendarSection.style.display = 'none';
    if (coordinatorDashboard) coordinatorDashboard.style.display = 'none';
    if (recepcionDashboard) recepcionDashboard.style.display = 'block';
    if (studentDashboard) studentDashboard.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';

    switchRecepcionTab(appState.recepcionTab || 'pagos');
}

// ==========================================
// PANEL DEL ALUMNO (rol 'usuario')
// ==========================================

function showStudentView() {
    const calendarSection = document.getElementById('calendarSectionContainer');
    const coordinatorDashboard = document.getElementById('coordinatorDashboard');
    const recepcionDashboard = document.getElementById('recepcionDashboard');
    const studentDashboard = document.getElementById('studentDashboard');
    const sidebar = document.getElementById('sidebar');

    if (calendarSection) calendarSection.style.display = 'none';
    if (coordinatorDashboard) coordinatorDashboard.style.display = 'none';
    if (recepcionDashboard) recepcionDashboard.style.display = 'none';
    if (studentDashboard) studentDashboard.style.display = 'block';
    if (sidebar) sidebar.style.display = 'none';

    renderStudentDashboard();

    // Notificaciones en tiempo real (aceptada/rechazada) para el alumno.
    const studentId = getCurrentUser()?.studentId || getCurrentUser()?.id;
    if (studentId) subscribeToNotifications(studentId);
}

// Periodo 'YYYY-MM' de una fecha (por defecto, hoy).
function periodOf(date = new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// TRUE si el alumno tiene un impago que debe bloquear su sesión:
// existe una cuota mensual (period fijado, sin clase asociada) sin pagar cuyo
// periodo es anterior al mes actual, o es el mes actual pero ya pasó el día 5.
// Devuelve la primera cuota pendiente que bloquea, o null si está al día.
function findBlockingUnpaidQuota(payments) {
    const currentPeriod = periodOf();
    const today = new Date();
    const pastDay5 = today.getDate() > 5;

    const pending = (payments || []).filter(p =>
        p.period && !p.classId && !p.paidDate && p.period <= currentPeriod
    );
    // Impaga y vencida: cualquier mes anterior, o el mes actual si ya pasó el día 5.
    const blocking = pending.filter(p => p.period < currentPeriod || (p.period === currentPeriod && pastDay5));
    if (blocking.length === 0) return null;
    // La más antigua primero.
    blocking.sort((a, b) => a.period.localeCompare(b.period));
    return blocking[0];
}

// Nivel medio de los alumnos inscritos en una clase (o null si no hay niveles).
function avgLevelOfClass(cls) {
    const levels = (cls.students || [])
        .map(id => getStudentById(id))
        .filter(s => s && s.level !== null && s.level !== undefined)
        .map(s => Number(s.level));
    if (levels.length === 0) return null;
    return levels.reduce((a, b) => a + b, 0) / levels.length;
}

// ---- Aforo y plazos de pago (ver stripe_payments.sql) ----

// Antelación mínima para poder solicitar una clase: 30 min de margen antes de que
// empiece + los 30 min mínimos que Stripe exige que viva una sesión de Checkout.
// Por debajo de esa hora no hay forma de cobrar a tiempo.
const MIN_LEAD_MINUTES = 60;

// Instante de inicio de la clase (cls.date es YYYY-MM-DD y cls.startTime "HH:MM",
// ambos en hora local, que es la del navegador de la escuela).
function classStartDate(cls) {
    if (!cls || !cls.date || !cls.startTime) return null;
    const d = new Date(`${String(cls.date).substring(0, 10)}T${cls.startTime}:00`);
    return isNaN(d.getTime()) ? null : d;
}

function minutesUntilClass(cls) {
    const start = classStartDate(cls);
    if (!start) return null;
    return (start.getTime() - Date.now()) / 60000;
}

// Ocupación real: alumnos confirmados + plazas retenidas por pagos en curso.
// Un hold caducado no cuenta: la plaza vuelve a estar libre aunque el webhook de
// expiración de Stripe todavía no haya llegado.
function occupancyOf(cls) {
    if (!cls) return 0;
    const now = Date.now();
    const holds = (appState.classHolds || []).filter(h =>
        h.classId === cls.id &&
        h.paymentExpiresAt &&
        new Date(h.paymentExpiresAt).getTime() > now
    );
    return (cls.students || []).length + holds.length;
}

function classIsFull(cls) {
    return occupancyOf(cls) >= (cls.maxCapacity || CONFIG.maxStudentsPerClass);
}

// Recarga las plazas retenidas (tras aceptar, pagar o expirar un pago).
async function refreshClassHolds() {
    try {
        const rows = await db.getActiveHolds();
        appState.classHolds = rows.map(r => db.convertRequestFromDB(r));
    } catch (e) {
        console.warn('No se pudieron recargar las plazas retenidas:', e);
    }
}

// "1h 25min" / "18 min" — para la cuenta atrás del plazo de pago.
function formatTimeLeft(isoDate) {
    if (!isoDate) return '';
    const ms = new Date(isoDate).getTime() - Date.now();
    if (ms <= 0) return 'caducado';
    const totalMin = Math.floor(ms / 60000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;
}

// Clases libres futuras que "cuadran" con el nivel del alumno:
// no cerradas, con 1-3 alumnos (sin llegar a la capacidad, contando las plazas
// retenidas por pagos en curso), el alumno no inscrito, su nivel dentro de ±0,5
// del nivel medio, y con margen suficiente para procesar el pago.
function findFreeClassesForStudent(student) {
    if (!student) return [];
    const level = (student.level !== null && student.level !== undefined) ? Number(student.level) : null;

    return appState.classes.filter(cls => {
        if (!cls || cls.isCompleted) return false;
        // Debe quedar margen para cobrar (esto ya descarta las clases pasadas).
        const minutesLeft = minutesUntilClass(cls);
        if (minutesLeft === null || minutesLeft < MIN_LEAD_MINUTES) return false;
        const count = (cls.students || []).length;
        if (count < 1 || classIsFull(cls)) return false;
        if (cls.students.includes(student.id)) return false;
        if (level === null) return false;
        const avg = avgLevelOfClass(cls);
        if (avg === null) return false;
        return Math.abs(level - avg) <= 0.5;
    }).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));
}

// Estado "visto" de avisos por alumno (persistido en localStorage, sin push).
function seenFreeClassesKey(studentId) {
    return `padel_seen_free_${studentId}`;
}
function getSeenFreeClasses(studentId) {
    try {
        return JSON.parse(localStorage.getItem(seenFreeClassesKey(studentId)) || '[]');
    } catch (e) { return []; }
}
function markFreeClassesSeen(studentId, classIds) {
    localStorage.setItem(seenFreeClassesKey(studentId), JSON.stringify(classIds));
    renderStudentDashboard();
}

// Colapsa/expande la sección de Avisos del panel del alumno (sin re-render).
function toggleAvisos() {
    appState.avisosCollapsed = !appState.avisosCollapsed;
    const section = document.getElementById('avisosSection');
    if (section) section.classList.toggle('collapsed', appState.avisosCollapsed);
}

// Colapsa/expande la sección "Mis clases" del panel del alumno (sin re-render).
function toggleMisClases() {
    appState.misClasesCollapsed = !appState.misClasesCollapsed;
    const section = document.getElementById('misClasesSection');
    if (section) section.classList.toggle('collapsed', appState.misClasesCollapsed);
}

// Colapsa/expande cualquier sección del panel del alumno (Mis solicitudes, Cuotas,
// Clases por recuperar). Guarda el estado en appState para que sobreviva al re-render.
function toggleStudentSection(sectionId, stateKey) {
    appState[stateKey] = !appState[stateKey];
    const section = document.getElementById(sectionId);
    if (section) section.classList.toggle('collapsed', appState[stateKey]);
}

async function renderStudentDashboard() {
    const container = document.getElementById('studentDashboardContent');
    if (!container) return;

    const user = getCurrentUser();
    const studentId = user?.studentId || user?.id;
    const student = getStudentById(studentId);

    container.innerHTML = '<p class="profile-loading">Cargando tu información...</p>';

    // Cargar pagos, recuperaciones y solicitudes de inscripción del alumno.
    let payments = [];
    let recoveries = [];
    let requests = [];
    try {
        const [pData, rData, sData] = await Promise.all([
            db.getPaymentsByStudent(studentId),
            db.getRecoveriesByStudent(studentId).catch(() => []),
            db.getRequestsByStudent(studentId).catch(() => []),
        ]);
        payments = pData.map(p => db.convertPaymentFromDB(p));
        recoveries = rData.map(r => db.convertRecoveryFromDB(r));
        requests = sData.map(s => db.convertRequestFromDB(s));
    } catch (e) {
        console.error('Error cargando datos del alumno:', e);
    }

    // Ids de clases con solicitud en curso -sin resolver o con el pago pendiente-
    // para no ofrecer "Solicitar" dos veces.
    const pendingRequestClassIds = new Set(
        requests
            .filter(r => r.status === 'pendiente' || r.status === 'aceptada_pendiente_pago')
            .map(r => r.classId)
    );

    // 1) Bloqueo por impago (tiene prioridad sobre todo lo demás).
    const blockingQuota = findBlockingUnpaidQuota(payments);
    if (blockingQuota) {
        container.innerHTML = `
            <div class="student-blocked">
                <div class="student-blocked-icon">🔒</div>
                <h2>Sesión bloqueada por impago</h2>
                <p>Tienes una cuota pendiente de <strong>${formatPeriod(blockingQuota.period)}</strong>${blockingQuota.amount != null ? ` (€${blockingQuota.amount.toFixed(2)})` : ''}.</p>
                <p>Para poder acceder a tu panel, ponte en contacto con recepción para regularizar el pago. Una vez registrado, tu acceso se restablecerá automáticamente.</p>
                <button class="btn btn-secondary" onclick="logout()">Cerrar sesión</button>
            </div>
        `;
        return;
    }

    // 2) Cuotas / pagos.
    const paidPayments = payments.filter(p => p.paidDate);
    const pendingPayments = payments.filter(p => !p.paidDate);
    const totalPaid = paidPayments.reduce((s, p) => s + (p.amount || 0), 0);

    const paymentsHtml = payments.length === 0
        ? '<p class="student-empty">Aún no hay cuotas registradas.</p>'
        : payments.map(p => {
            const isPaid = !!p.paidDate;
            const desc = p.period ? `Cuota ${formatPeriod(p.period)}` : (p.classId ? 'Clase suelta' : 'Pago');
            const amount = p.amount != null ? `€${p.amount.toFixed(2)}` : '';
            const method = p.method ? `<span class="payment-method">${escapeHtml(p.method)}</span>` : '';
            const status = isPaid
                ? `<span class="pay-badge paid">Pagado ${escapeHtml(p.paidDate)}</span>`
                : `<span class="pay-badge none">Pendiente</span>`;
            return `
                <div class="payment-row">
                    <div class="payment-row-info">
                        <div class="payment-desc"><strong>${escapeHtml(desc)}</strong> ${method}</div>
                    </div>
                    <div class="payment-row-right">
                        <span class="payment-amount">${amount}</span>
                        ${status}
                    </div>
                </div>`;
        }).join('');

    // 3) Clases por recuperar (pendientes = sin recovered_at).
    const pendingRecoveries = recoveries.filter(r => !r.recoveredAt);
    const recoveriesHtml = pendingRecoveries.length === 0
        ? '<p class="student-empty">No tienes clases pendientes de recuperar.</p>'
        : pendingRecoveries.map(r => {
            const cls = r.originClassId ? getClassById(r.originClassId) : null;
            const dateLabel = r.originDate ? formatDate(r.originDate) : (cls ? formatDate(cls.date) : '');
            const timeLabel = cls ? ` · ${cls.startTime}` : '';
            return `
                <div class="recovery-row">
                    <span class="recovery-icon">🔁</span>
                    <div>
                        <div class="recovery-title">Clase del ${escapeHtml(dateLabel)}${timeLabel}</div>
                        ${r.notes ? `<div class="recovery-notes">${escapeHtml(r.notes)}</div>` : ''}
                    </div>
                </div>`;
        }).join('');

    // 4) Avisos: clases libres que cuadran con su nivel.
    const freeClasses = findFreeClassesForStudent(student);
    const freeIds = freeClasses.map(c => c.id);
    const seen = getSeenFreeClasses(studentId);
    const unseenCount = freeIds.filter(id => !seen.includes(id)).length;

    const freeHtml = freeClasses.length === 0
        ? '<p class="student-empty">No hay clases libres para tu nivel ahora mismo.</p>'
        : freeClasses.map(cls => {
            const isNew = !seen.includes(cls.id);
            const avg = avgLevelOfClass(cls);
            const monitor = cls.monitorName ? ` · ${escapeHtml(cls.monitorName)}` : '';
            // ¿El alumno ya tiene una solicitud pendiente para esta clase?
            const alreadyRequested = pendingRequestClassIds.has(cls.id);
            const actionBtn = alreadyRequested
                ? '<span class="notice-req-pending">Solicitud enviada</span>'
                : `<button class="btn btn-sm btn-primary notice-req-btn" onclick="requestClassEnrollment('${escapeHtml(cls.id)}')">Solicitar plaza</button>`;
            return `
                <div class="notice-row ${isNew ? 'notice-new' : ''}">
                    <span class="notice-icon">🎾</span>
                    <div class="notice-body">
                        <div class="notice-title">${escapeHtml(formatDate(cls.date))} · ${escapeHtml(cls.startTime)}-${escapeHtml(cls.endTime)}${monitor}</div>
                        <div class="notice-sub">${cls.students.length}/${cls.maxCapacity} plazas · nivel medio ${avg != null ? avg.toFixed(1) : '—'}</div>
                    </div>
                    <div class="notice-actions">
                        ${isNew ? '<span class="notice-badge">Nuevo</span>' : ''}
                        ${actionBtn}
                    </div>
                </div>`;
        }).join('');

    const markSeenBtn = unseenCount > 0
        ? `<button class="btn btn-sm btn-secondary" onclick='markFreeClassesSeen(${JSON.stringify(studentId)}, ${JSON.stringify(freeIds)})'>Marcar como leídos</button>`
        : '';

    // 5) Mis solicitudes: estado de las inscripciones pedidas (notificación al alumno).
    //    Si el monitor ya la aceptó, aquí es donde el alumno paga: la plaza está
    //    reservada pero NO confirmada hasta que se completa el pago.
    const requestsHtml = requests.length === 0
        ? '<p class="student-empty">Aún no has solicitado plaza en ninguna clase.</p>'
        : requests.map(r => {
            const cls = r.classId ? getClassById(r.classId) : null;
            const dateLabel = cls ? `${formatDate(cls.date)} · ${cls.startTime}` : 'Clase';
            const badge = requestStatusBadge(r);

            let detail = '';
            let action = '';

            if (r.status === 'aceptada_pendiente_pago') {
                const expired = r.paymentExpiresAt && new Date(r.paymentExpiresAt).getTime() <= Date.now();
                const amount = r.price != null ? `€${Number(r.price).toFixed(2)}` : '';
                detail = expired
                    ? '<div class="request-reason">El plazo de pago ha terminado. Tu plaza se ha liberado.</div>'
                    : `<div class="request-pay-info">Paga ${escapeHtml(amount)} para confirmar tu plaza · te quedan <strong>${escapeHtml(formatTimeLeft(r.paymentExpiresAt))}</strong></div>`;
                if (!expired && r.checkoutUrl) {
                    action = `<a class="btn btn-sm btn-primary request-pay-btn" href="${escapeHtml(r.checkoutUrl)}">Pagar ahora</a>`;
                }
            } else if (r.status === 'confirmada_pagada') {
                const amount = r.price != null ? ` · €${Number(r.price).toFixed(2)} pagados` : '';
                detail = `<div class="request-reason">Plaza confirmada${escapeHtml(amount)}</div>`;
            } else if (r.status === 'cancelada_por_impago') {
                detail = '<div class="request-reason">No se completó el pago, así que la plaza se liberó. Puedes volver a solicitar una clase.</div>';
            } else if (r.status === 'rechazada' && r.reason) {
                detail = `<div class="request-reason">${escapeHtml(r.reason)}</div>`;
            }

            return `
                <div class="request-row">
                    <span class="request-icon">📩</span>
                    <div class="request-body">
                        <div class="request-title">${escapeHtml(dateLabel)}</div>
                        ${detail}
                    </div>
                    <div class="request-right">
                        ${badge}
                        ${action}
                    </div>
                </div>`;
        }).join('');
    const pendingRequestsCount = requests.filter(r =>
        r.status === 'pendiente' || r.status === 'aceptada_pendiente_pago'
    ).length;

    // 6) Mis clases (próximas): clases futuras donde el alumno está inscrito.
    //    Es la única sección donde puede darse de baja (solo con >=24h de antelación).
    const myClasses = appState.classes
        .filter(cls => cls && !cls.isCompleted && (cls.students || []).includes(studentId))
        .filter(cls => {
            const mins = minutesUntilClass(cls);
            return mins !== null && mins > 0; // solo futuras
        })
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));

    const myClassesHtml = myClasses.length === 0
        ? '<p class="student-empty">No tienes clases próximas.</p>'
        : myClasses.map(cls => {
            const canLeave = minutesUntilClass(cls) >= 24 * 60;
            const monitor = cls.monitorName ? ` · ${escapeHtml(cls.monitorName)}` : '';
            const action = canLeave
                ? `<button class="btn btn-sm btn-baja" onclick="leaveClass('${escapeHtml(cls.id)}')">Darme de baja</button>`
                : '<span class="myclass-locked">No se puede cancelar (menos de 24h)</span>';
            return `
                <div class="request-row">
                    <span class="request-icon">🎾</span>
                    <div class="request-body">
                        <div class="request-title">${escapeHtml(formatDate(cls.date))} · ${escapeHtml(cls.startTime)}-${escapeHtml(cls.endTime)}${monitor}</div>
                    </div>
                    <div class="request-right">${action}</div>
                </div>`;
        }).join('');

    container.innerHTML = `
        <div class="student-greeting">
            <h2>Hola, ${escapeHtml(student ? student.name : 'alumno')} 👋</h2>
            <p class="student-sub">Nivel ${student && student.level != null ? student.level : '—'}</p>
        </div>

        <div class="student-cards">
            <div class="student-card student-card-stat student-card-clickable" onclick="scrollToStudentSection('cuotasSection')" title="Ver mis cuotas">
                <span class="student-stat-label">Total pagado</span>
                <span class="student-stat-value">€${totalPaid.toFixed(2)}</span>
            </div>
            <div class="student-card student-card-stat student-card-clickable" onclick="scrollToStudentSection('cuotasSection')" title="Ver mis cuotas">
                <span class="student-stat-label">Cuotas pendientes</span>
                <span class="student-stat-value ${pendingPayments.length ? 'is-warn' : ''}">${pendingPayments.length}</span>
            </div>
            <div class="student-card student-card-stat student-card-clickable" onclick="scrollToStudentSection('recuperarSection')" title="Ver clases por recuperar">
                <span class="student-stat-label">Por recuperar</span>
                <span class="student-stat-value ${pendingRecoveries.length ? 'is-warn' : ''}">${pendingRecoveries.length}</span>
            </div>
        </div>

        <div class="student-section ${appState.avisosCollapsed ? 'collapsed' : ''}" id="avisosSection">
            <div class="student-section-head student-section-toggle" onclick="toggleAvisos()">
                <h3>🔔 Avisos ${freeClasses.length > 0 ? `<span class="notice-count">${unseenCount > 0 ? unseenCount : freeClasses.length}</span>` : ''}</h3>
                <span class="section-chevron" aria-hidden="true"></span>
            </div>
            <div class="student-section-body">
                ${markSeenBtn ? `<div class="avisos-actions">${markSeenBtn}</div>` : ''}
                ${freeHtml}
            </div>
        </div>

        <div class="student-section ${appState.misClasesCollapsed ? 'collapsed' : ''}" id="misClasesSection">
            <div class="student-section-head student-section-toggle" onclick="toggleMisClases()">
                <h3>🎾 Mis clases ${myClasses.length > 0 ? `<span class="notice-count">${myClasses.length}</span>` : ''}</h3>
                <span class="section-chevron" aria-hidden="true"></span>
            </div>
            <div class="student-section-body">${myClassesHtml}</div>
        </div>

        <div class="student-section ${appState.solicitudesCollapsed ? 'collapsed' : ''}" id="solicitudesSection">
            <div class="student-section-head student-section-toggle" onclick="toggleStudentSection('solicitudesSection', 'solicitudesCollapsed')">
                <h3>📩 Mis solicitudes ${pendingRequestsCount > 0 ? `<span class="notice-count">${pendingRequestsCount}</span>` : ''}</h3>
                <span class="section-chevron" aria-hidden="true"></span>
            </div>
            <div class="student-section-body">${requestsHtml}</div>
        </div>

        <div class="student-section ${appState.cuotasCollapsed ? 'collapsed' : ''}" id="cuotasSection">
            <div class="student-section-head student-section-toggle" onclick="toggleStudentSection('cuotasSection', 'cuotasCollapsed')">
                <h3>💳 Mis cuotas</h3>
                <span class="section-chevron" aria-hidden="true"></span>
            </div>
            <div class="student-section-body">${paymentsHtml}</div>
        </div>

        <div class="student-section ${appState.recuperarCollapsed ? 'collapsed' : ''}" id="recuperarSection">
            <div class="student-section-head student-section-toggle" onclick="toggleStudentSection('recuperarSection', 'recuperarCollapsed')">
                <h3>🔁 Clases por recuperar</h3>
                <span class="section-chevron" aria-hidden="true"></span>
            </div>
            <div class="student-section-body">${recoveriesHtml}</div>
        </div>

        <div class="student-section ${appState.misDatosCollapsed ? 'collapsed' : ''}" id="misDatosSection">
            <div class="student-section-head student-section-toggle" onclick="toggleStudentSection('misDatosSection', 'misDatosCollapsed')">
                <h3>👤 Mis datos</h3>
                <span class="section-chevron" aria-hidden="true"></span>
            </div>
            <div class="student-section-body">
                <div class="detail-row"><span class="detail-label">Nombre:</span><span class="detail-value">${escapeHtml(student?.name || '—')}</span></div>
                <div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(student?.email || 'Sin email')}</span></div>
                <div class="detail-row"><span class="detail-label">Teléfono:</span><span class="detail-value">${escapeHtml(student?.phone || 'Sin teléfono')}</span></div>
            </div>
        </div>
    `;
}

// Desplaza suave hasta una sección del panel del alumno y la resalta un instante.
// Si la sección estaba colapsada, la expande antes (para no llevar al usuario a
// una cabecera plegada al pulsar una tarjeta de arriba).
function scrollToStudentSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const stateKey = { cuotasSection: 'cuotasCollapsed', recuperarSection: 'recuperarCollapsed' }[sectionId];
    if (stateKey && appState[stateKey]) {
        appState[stateKey] = false;
        section.classList.remove('collapsed');
    }
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section.classList.add('section-highlight');
    setTimeout(() => section.classList.remove('section-highlight'), 1200);
}

// ==========================================
// SOLICITUDES DE INSCRIPCIÓN (alumno -> monitor) + NOTIFICACIONES
// Sistema modular y reutilizable: la fuente de verdad es class_requests;
// las notificaciones (tabla notifications) son el canal de avisos + Realtime.
// ==========================================

// Badge de estado para "Mis solicitudes" (panel del alumno).
function requestStatusBadge(request) {
    switch (request.status) {
        case 'confirmada_pagada':      return '<span class="pay-badge paid">Confirmada</span>';
        case 'aceptada_pendiente_pago': return '<span class="pay-badge pending-pay">Pendiente de pago</span>';
        case 'cancelada_por_impago':   return '<span class="pay-badge none">Sin pagar</span>';
        case 'aceptada':               return '<span class="pay-badge paid">Aceptada</span>'; // histórico (antes del cobro)
        case 'rechazada':              return '<span class="pay-badge none">Rechazada</span>';
        default:                       return '<span class="pay-badge partial">Pendiente</span>';
    }
}

// El alumno solicita plaza en una clase de su nivel (desde la sección Avisos).
async function requestClassEnrollment(classId) {
    const user = getCurrentUser();
    const studentId = user?.studentId || user?.id;
    const student = getStudentById(studentId);
    const cls = getClassById(classId);

    if (!student || !cls) {
        showToast('No se pudo procesar la solicitud', 'error');
        return;
    }

    // Validaciones (defensa en profundidad, no solo confiar en el filtro de Avisos):
    if ((cls.students || []).includes(studentId)) {
        showToast('Ya estás inscrito en esta clase', 'warning');
        return;
    }
    // Sin margen para cobrar: la plaza solo se confirma tras el pago, y hace falta
    // al menos 1 hora (30 min de pago + 30 min de margen antes de la clase).
    const minutesLeft = minutesUntilClass(cls);
    if (minutesLeft === null || minutesLeft < MIN_LEAD_MINUTES) {
        showToast('Quedan menos de 60 minutos para la clase: no hay margen suficiente para procesar el pago', 'warning');
        renderStudentDashboard();
        return;
    }
    // El aforo cuenta también las plazas retenidas por pagos en curso.
    if (classIsFull(cls)) {
        showToast('Esta clase ya está completa', 'warning');
        renderStudentDashboard();
        return;
    }
    const level = (student.level !== null && student.level !== undefined) ? Number(student.level) : null;
    const avg = avgLevelOfClass(cls);
    if (level === null || avg === null || Math.abs(level - avg) > 0.5) {
        showToast('Esta clase no corresponde a tu nivel', 'warning');
        return;
    }
    if (!cls.monitorId) {
        showToast('La clase no tiene monitor asignado', 'error');
        return;
    }

    try {
        // Evitar duplicados: si ya hay una solicitud pendiente, no crear otra.
        const existing = await db.getPendingRequestForClass(classId, studentId);
        if (existing) {
            showToast('Ya tienes una solicitud pendiente para esta clase', 'warning');
            renderStudentDashboard();
            return;
        }

        const created = await db.createRequest({ classId, studentId, monitorId: cls.monitorId });
        // Notificar al monitor responsable (dispara su badge/aviso en tiempo real).
        await db.createNotification({
            recipientId: cls.monitorId,
            recipientRole: 'monitor',
            type: 'nueva_solicitud',
            requestId: created.id,
            classId,
            message: `${student.name} solicita unirse a la clase del ${formatDate(cls.date)} ${cls.startTime}`,
        }).catch(err => console.warn('No se pudo crear la notificación al monitor:', err));

        showToast('Solicitud enviada al monitor');
        renderStudentDashboard();
    } catch (error) {
        console.error('Error al solicitar inscripción:', error);
        // El índice único parcial puede rechazar duplicados en carrera.
        showToast('No se pudo enviar la solicitud', 'error');
    }
}

// El alumno se da de baja de una clase (>=24h de antelación). La baja la procesa
// el servidor (functions/api/enrollment/leave): libera la plaza, y si la clase
// estaba pagada la añade a "Clases por recuperar". Al liberar plaza en una clase
// llena, el servidor avisa a los alumnos del nivel.
async function leaveClass(classId) {
    const user = getCurrentUser();
    const studentId = user?.studentId || user?.id;
    const cls = getClassById(classId);
    if (!studentId || !cls) return;

    const ok = await showConfirm(
        `¿Seguro que quieres darte de baja de la clase del ${formatDate(cls.date)} a las ${cls.startTime}?`,
        { title: 'Darse de baja', confirmText: 'Sí, darme de baja', cancelText: 'No', danger: true }
    );
    if (!ok) return;

    try {
        // El servidor identifica al alumno por su JWT (no se envía studentId).
        const res = await db.leaveClass(classId);
        showToast(res.recovery
            ? 'Te has dado de baja. La clase se ha añadido a tus clases por recuperar.'
            : 'Te has dado de baja de la clase.', 'success');
        // Recargar clases (el alumno ya no está en students) y refrescar el panel.
        try {
            const rows = await db.getClasses();
            appState.classes = rows.map(c => db.convertClassFromDB(c));
        } catch (e) { /* el panel se refresca igual */ }
        await refreshClassHolds();
        renderStudentDashboard();
    } catch (error) {
        console.error('Error al darse de baja:', error);
        showToast(error.message || 'No se pudo procesar la baja', 'warning');
    }
}

// ---- Lado monitor: badge, modal y resolución de solicitudes ----

// Cuenta las solicitudes pendientes del monitor logueado y pinta el badge.
async function renderSolicitudesBadge() {
    const btn = document.getElementById('solicitudesBtn');
    const badge = document.getElementById('solicitudesBadge');
    if (!btn || !badge) return;

    if (!isMonitor()) {
        btn.style.display = 'none';
        return;
    }
    btn.style.display = '';

    const monitorId = getCurrentUser()?.id;
    if (!monitorId) return;
    try {
        const rows = await db.getRequestsByMonitor(monitorId, 'pendiente');
        appState.monitorRequests = rows.map(r => db.convertRequestFromDB(r));
    } catch (error) {
        console.warn('No se pudieron cargar las solicitudes del monitor:', error);
        appState.monitorRequests = [];
    }
    const count = appState.monitorRequests.length;
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
}

async function openSolicitudesModal() {
    openModal('solicitudesModal');
    await renderSolicitudesList();
}

function closeSolicitudesModal() {
    closeModal('solicitudesModal');
}

// ---- Bandeja de avisos del monitor (🔔) ----
// Los toasts en vivo son efímeros: si el monitor no tenía la app abierta (p. ej.
// un alumno se dio de baja por la noche), el aviso se perdía. La tabla
// notifications ya guarda todo con is_read; esta bandeja lo hace visible.

const NOTIF_ICONS = {
    nueva_solicitud: '📩',
    solicitud_aceptada: '💶',   // un alumno ha pagado su plaza
    solicitud_rechazada: '👋',  // baja de un alumno (el servidor reutiliza este tipo)
    pago_pendiente: '⏳',
    pago_confirmado: '💶',
    pago_expirado: '⌛',
    plaza_libre: '🎾',
};

// Pinta la campana con el nº de avisos no leídos del monitor logueado.
async function renderNotifBadge() {
    // Dos campanas según el layout: en ESCRITORIO el botón ancho (#notifBellBtn);
    // en MÓVIL el icono flotante junto a la lupa (#notifBellBtnMobile). El icono
    // móvil se crea siempre oculto (la toolbar se monta antes de saber el rol),
    // así que aquí se decide su visibilidad ya con el rol resuelto.
    const btn = document.getElementById('notifBellBtn');
    if (btn) btn.style.display = (isMonitor() && !isMobileLayout()) ? '' : 'none';
    const mobileBtn = document.getElementById('notifBellBtnMobile');
    if (mobileBtn) mobileBtn.style.display = isMonitor() ? '' : 'none';
    if (!isMonitor()) return;

    const monitorId = getCurrentUser()?.id;
    if (!monitorId) return;

    let count = 0;
    try {
        const rows = await db.getUnreadNotifications(monitorId);
        count = (rows || []).length;
    } catch (error) {
        console.warn('No se pudo cargar el contador de avisos:', error);
        return;
    }

    const label = count > 9 ? '9+' : String(count);
    ['notifBellBadge', 'notifBellBadgeMobile'].forEach(id => {
        const badge = document.getElementById(id);
        if (!badge) return;
        badge.textContent = label;
        badge.style.display = count > 0 ? '' : 'none';
    });
}

// Abre la bandeja: lista los últimos avisos (no leídos resaltados) y, una vez
// mostrados, los marca todos como leídos (el resaltado de esta vista se conserva).
async function openNotifModal() {
    const container = document.getElementById('notifList');
    if (!container) return;
    openModal('notifModal');
    container.innerHTML = '<p class="profile-loading">Cargando avisos...</p>';

    const monitorId = getCurrentUser()?.id;
    let notifs = [];
    try {
        const rows = await db.getNotifications(monitorId);
        notifs = (rows || []).map(n => db.convertNotificationFromDB(n)).slice(0, 50);
    } catch (error) {
        console.error('Error cargando los avisos:', error);
        container.innerHTML = '<p class="student-empty">No se pudieron cargar los avisos.</p>';
        return;
    }

    if (notifs.length === 0) {
        container.innerHTML = '<p class="student-empty">No tienes avisos.</p>';
        return;
    }

    const toolbar = `
        <div class="notif-toolbar">
            <button class="btn btn-sm btn-baja" onclick="clearAllNotifs()">Borrar todos</button>
        </div>`;

    container.innerHTML = toolbar + notifs.map(n => {
        const icon = NOTIF_ICONS[n.type] || '🔔';
        return `
            <div class="solicitud-row${n.isRead ? '' : ' notif-unread'}">
                <div class="solicitud-info">
                    <div class="solicitud-name">${icon} ${escapeHtml(n.message || n.type)}</div>
                    <div class="solicitud-class">${escapeHtml(formatNotifDate(n.createdAt))}</div>
                </div>
                <button class="notif-delete" title="Borrar aviso" onclick="deleteNotif('${escapeHtml(n.id)}', this)">✕</button>
            </div>`;
    }).join('');

    try {
        await db.markAllNotificationsRead(monitorId);
    } catch (error) {
        console.warn('No se pudieron marcar los avisos como leídos:', error);
    }
    renderNotifBadge();
}

// Borra un aviso concreto (✕ de su fila) y actualiza la lista sin recargarla.
async function deleteNotif(id, btn) {
    try {
        await db.deleteNotification(id);
        const row = btn ? btn.closest('.solicitud-row') : null;
        if (row) row.remove();
        const list = document.getElementById('notifList');
        if (list && !list.querySelector('.solicitud-row')) {
            list.innerHTML = '<p class="student-empty">No tienes avisos.</p>';
        }
        renderNotifBadge();
    } catch (error) {
        console.error('Error borrando el aviso:', error);
        showToast('No se pudo borrar el aviso', 'error');
    }
}

// Vacía la bandeja entera (con confirmación).
async function clearAllNotifs() {
    const ok = await showConfirm('¿Borrar todos los avisos?', {
        title: 'Borrar avisos', confirmText: 'Sí, borrar', cancelText: 'No', danger: true,
    });
    if (!ok) return;
    try {
        await db.deleteAllNotifications(getCurrentUser()?.id);
        const list = document.getElementById('notifList');
        if (list) list.innerHTML = '<p class="student-empty">No tienes avisos.</p>';
        renderNotifBadge();
    } catch (error) {
        console.error('Error vaciando los avisos:', error);
        showToast('No se pudieron borrar los avisos', 'error');
    }
}

function closeNotifModal() {
    closeModal('notifModal');
}

function formatNotifDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${formatDate(d)} · ${hh}:${mm}`;
}

// Etiqueta de clase con el aforo real: confirmados + retenidos por pagos en curso.
function solicitudClassLabel(cls) {
    if (!cls) return 'Clase';
    const capacity = cls.maxCapacity || CONFIG.maxStudentsPerClass;
    return `${formatDate(cls.date)} · ${cls.startTime}-${cls.endTime} (${occupancyOf(cls)}/${capacity})`;
}

// Lista las solicitudes del monitor: las pendientes de decidir (con acciones) y,
// debajo, las ya aceptadas que están esperando a que el alumno pague.
async function renderSolicitudesList() {
    const container = document.getElementById('solicitudesList');
    if (!container) return;
    container.innerHTML = '<p class="profile-loading">Cargando solicitudes...</p>';

    const monitorId = getCurrentUser()?.id;
    let requests = [];
    let awaitingPayment = [];
    try {
        const [pendingRows, payingRows] = await Promise.all([
            db.getRequestsByMonitor(monitorId, 'pendiente'),
            db.getRequestsByMonitor(monitorId, 'aceptada_pendiente_pago').catch(() => []),
        ]);
        requests = pendingRows.map(r => db.convertRequestFromDB(r));
        awaitingPayment = payingRows
            .map(r => db.convertRequestFromDB(r))
            .filter(r => r.paymentExpiresAt && new Date(r.paymentExpiresAt).getTime() > Date.now());
    } catch (error) {
        console.error('Error cargando solicitudes:', error);
        container.innerHTML = '<p class="student-empty">No se pudieron cargar las solicitudes.</p>';
        return;
    }
    appState.monitorRequests = requests;

    if (requests.length === 0 && awaitingPayment.length === 0) {
        container.innerHTML = '<p class="student-empty">No tienes solicitudes pendientes.</p>';
        return;
    }

    const pendingHtml = requests.map(r => {
        const student = getStudentById(r.studentId);
        const name = student ? student.name : 'Alumno';
        const levelLabel = (student && student.level != null) ? ` · Nivel ${student.level}` : '';
        return `
            <div class="solicitud-row">
                <div class="solicitud-info">
                    <div class="solicitud-name">${escapeHtml(name)}${levelLabel}</div>
                    <div class="solicitud-class">${escapeHtml(solicitudClassLabel(getClassById(r.classId)))}</div>
                </div>
                <div class="solicitud-actions">
                    <button class="btn btn-sm btn-primary" onclick="acceptRequest('${escapeHtml(r.id)}')">Aceptar</button>
                    <button class="btn btn-sm btn-baja" onclick="rejectRequest('${escapeHtml(r.id)}')">Rechazar</button>
                </div>
            </div>`;
    }).join('');

    // Ya aceptadas: la plaza está retenida hasta que el alumno pague o expire el plazo.
    // Sin botones: el monitor ya decidió, ahora la pelota está en el tejado del alumno.
    const payingHtml = awaitingPayment.length === 0 ? '' : `
        <div class="solicitud-group-title">Esperando pago</div>
        ${awaitingPayment.map(r => {
            const student = getStudentById(r.studentId);
            const name = student ? student.name : 'Alumno';
            const amount = r.price != null ? `€${Number(r.price).toFixed(2)} · ` : '';
            return `
            <div class="solicitud-row solicitud-waiting">
                <div class="solicitud-info">
                    <div class="solicitud-name">${escapeHtml(name)}</div>
                    <div class="solicitud-class">${escapeHtml(solicitudClassLabel(getClassById(r.classId)))}</div>
                </div>
                <span class="pay-badge pending-pay">${escapeHtml(amount)}caduca en ${escapeHtml(formatTimeLeft(r.paymentExpiresAt))}</span>
            </div>`;
        }).join('')}`;

    container.innerHTML = pendingHtml + payingHtml;
}

// Aceptar: NO inscribe al alumno. Pide al servidor una sesión de Stripe Checkout,
// que retiene la plaza y envía el link de pago al alumno. El alumno solo entra en
// la clase cuando el webhook de Stripe confirma el cobro (ver functions/api/).
async function acceptRequest(requestId) {
    const request = appState.monitorRequests.find(r => r.id === requestId);
    if (!request) {
        showToast('Solicitud no encontrada', 'error');
        await renderSolicitudesList();
        return;
    }

    const student = getStudentById(request.studentId);
    const name = student ? student.name : 'El alumno';

    try {
        // El servidor rehace todas las validaciones (aforo con plazas retenidas,
        // margen de 60 min, precio) y verifica por el JWT que quien acepta es el
        // monitor responsable: aquí solo mostramos el resultado.
        const { expiresAt } = await db.createCheckoutSession(requestId);

        showToast(`Link de pago enviado a ${name} · tiene ${formatTimeLeft(expiresAt)} para pagar`);
    } catch (error) {
        console.error('Error al aceptar la solicitud:', error);
        // El mensaje viene del servidor: "clase completa", "sin margen para cobrar"...
        showToast(error.message || 'No se pudo aceptar la solicitud', 'warning');
    }

    await refreshClassHolds();
    await refreshSolicitudesAfterChange();
}

// Rechazar manualmente una solicitud.
async function rejectRequest(requestId) {
    const request = appState.monitorRequests.find(r => r.id === requestId);
    if (!request) {
        showToast('Solicitud no encontrada', 'error');
        await renderSolicitudesList();
        return;
    }
    try {
        const cls = getClassById(request.classId);
        const student = getStudentById(request.studentId);
        await db.updateRequestStatus(requestId, 'rechazada', 'rechazada por el monitor');
        await notifyStudentResolution(request, 'solicitud_rechazada', cls, student, 'Tu solicitud ha sido rechazada');
        showToast('Solicitud rechazada');
        await refreshSolicitudesAfterChange();
    } catch (error) {
        console.error('Error al rechazar la solicitud:', error);
        showToast('No se pudo rechazar la solicitud', 'error');
        await refreshSolicitudesAfterChange();
    }
}

// Nota: el auto-rechazo de las solicitudes restantes cuando una clase se llena lo
// hace ahora el servidor, al confirmarse el pago (functions/_shared/fulfillment.js).

// Crea la notificación de resultado para el alumno.
async function notifyStudentResolution(request, type, cls, student, message) {
    try {
        await db.createNotification({
            recipientId: request.studentId,
            recipientRole: 'usuario',
            type,
            requestId: request.id,
            classId: request.classId,
            message,
        });
    } catch (error) {
        console.warn('No se pudo notificar al alumno:', error);
    }
}

// Refresca badge + modal (si está abierto) tras resolver una solicitud.
async function refreshSolicitudesAfterChange() {
    await renderSolicitudesBadge();
    const modal = document.getElementById('solicitudesModal');
    if (modal && modal.classList.contains('active')) {
        await renderSolicitudesList();
    }
}

// ---- Realtime cross-device (bus de notificaciones) ----

// Suscribe al usuario actual a sus notificaciones (INSERT) vía Supabase Realtime.
function subscribeToNotifications(recipientId) {
    if (!recipientId || typeof supabase === 'undefined' || !supabase) return;

    // Evitar suscripciones duplicadas.
    unsubscribeFromNotifications();

    try {
        const channel = supabase
            .channel('notif-' + recipientId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: 'recipient_id=eq.' + recipientId,
            }, payload => {
                const notif = db.convertNotificationFromDB(payload.new);
                handleIncomingNotification(notif);
            })
            .subscribe();
        appState.notifChannel = channel;
    } catch (error) {
        console.warn('No se pudo suscribir a notificaciones en tiempo real:', error);
    }
}

function unsubscribeFromNotifications() {
    if (appState.notifChannel && typeof supabase !== 'undefined' && supabase) {
        try {
            supabase.removeChannel(appState.notifChannel);
        } catch (e) { /* noop */ }
    }
    appState.notifChannel = null;
}

// Reacciona a una notificación entrante según el rol del usuario actual.
async function handleIncomingNotification(notif) {
    if (!notif) return;

    if (isMonitor()) {
        // La campana 🔔 se actualiza con cualquier aviso entrante.
        renderNotifBadge();
        if (notif.type === 'nueva_solicitud') {
            // Actualiza el badge y, si el modal está abierto, refresca la lista.
            refreshSolicitudesAfterChange();
            showToast(notif.message || 'Nueva solicitud de inscripción');
            return;
        }
        // Un alumno ha pagado (solicitud_aceptada) o se ha dado de baja
        // (solicitud_rechazada): en ambos casos cambia la ocupación de una clase,
        // así que recargamos para que el calendario del monitor se actualice solo.
        if (notif.type === 'solicitud_aceptada' || notif.type === 'solicitud_rechazada') {
            try {
                const rows = await db.getClasses();
                appState.classes = rows.map(c => db.convertClassFromDB(c));
            } catch (e) {
                console.warn('No se pudieron recargar las clases:', e);
            }
            await refreshClassHolds();
            renderCalendar();
            await refreshSolicitudesAfterChange();
            showToast(notif.message || (notif.type === 'solicitud_aceptada'
                ? 'Un alumno ha confirmado su plaza'
                : 'Un alumno se ha dado de baja'));
        }
        return;
    }

    if (isUsuario()) {
        switch (notif.type) {
            case 'pago_pendiente':
                showToast(notif.message || 'Tu solicitud ha sido aceptada: ya puedes pagar tu plaza', 'success');
                break;
            case 'pago_confirmado':
                showToast(notif.message || 'Pago confirmado, tu plaza está reservada', 'success');
                break;
            case 'pago_expirado':
                showToast(notif.message || 'El pago no se completó y tu plaza se ha liberado', 'warning');
                break;
            case 'solicitud_aceptada':
                showToast(notif.message || 'Solicitud aceptada', 'success');
                break;
            case 'solicitud_rechazada':
                showToast(notif.message || 'Solicitud rechazada', 'warning');
                break;
            case 'plaza_libre':
                showToast(notif.message || 'Se ha liberado una plaza en una clase de tu nivel 🎾', 'success');
                break;
            default:
                return;
        }
        // Recargar clases: al liberarse/confirmarse una plaza cambia la ocupación,
        // así que "Mis clases" y los "Avisos" deben recalcularse con datos frescos.
        try {
            const rows = await db.getClasses();
            appState.classes = rows.map(c => db.convertClassFromDB(c));
        } catch (e) { /* el panel se refresca igual */ }
        await refreshClassHolds();
        renderStudentDashboard();
    }
}

function renderRecepcionStudentsList() {
    const container = document.getElementById('recepcionStudentsList');
    if (!container) return;
    const searchInput = document.getElementById('recepcionStudentSearch');
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    const all = appState.students.filter(s => s.name.toLowerCase().includes(query));
    const active = all.filter(s => s.active !== false);
    const inactive = all.filter(s => s.active === false);

    if (all.length === 0) {
        container.innerHTML = '<div class="recepcion-empty">No se encontraron alumnos.</div>';
        return;
    }

    const renderCard = (s, isInactive) => {
        const initials = s.name.trim().split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
        const contact = s.phone || s.email || '';
        return `
        <div class="recepcion-card ${isInactive ? 'recepcion-card-inactive' : ''}">
            <div class="recepcion-card-avatar ${isInactive ? 'recepcion-card-avatar-inactive' : ''}">${escapeHtml(initials)}</div>
            <div class="recepcion-card-name">${escapeHtml(s.name)}</div>
            ${isInactive ? '<div class="recepcion-baja-badge">De baja</div>' : ''}
            ${contact ? `<div class="recepcion-card-contact">${escapeHtml(contact)}</div>` : ''}
            <div class="recepcion-card-btns">
                <button class="btn btn-primary btn-sm" data-action="ficha" data-student-id="${escapeHtml(s.id)}">Ver ficha</button>
                ${isInactive
                    ? `<button class="btn btn-secondary btn-sm" data-action="reactivar" data-student-id="${escapeHtml(s.id)}">Reactivar</button>`
                    : `<button class="btn btn-sm btn-baja" data-action="baja" data-student-id="${escapeHtml(s.id)}">Dar de baja</button>`
                }
            </div>
        </div>`;
    };

    let html = active.map(s => renderCard(s, false)).join('');

    if (inactive.length > 0) {
        html += `<div class="recepcion-baja-section-title">Alumnos de baja (${inactive.length})</div>`;
        html += inactive.map(s => renderCard(s, true)).join('');
    }

    container.innerHTML = html;

    container.onclick = (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const { action, studentId } = btn.dataset;
        if (action === 'ficha') showStudentProfile(studentId);
        else if (action === 'baja') confirmDeactivateStudent(studentId);
        else if (action === 'reactivar') reactivateStudent(studentId);
    };
}

function confirmDeactivateStudent(studentId) {
    const student = getStudentById(studentId);
    if (!student) return;
    document.getElementById('deactivateStudentModalDesc').textContent =
        `¿Dar de baja a ${student.name}?`;
    const btn = document.getElementById('deactivateStudentConfirmBtn');
    btn.onclick = async () => {
        closeModal('deactivateStudentModal');
        try {
            await db.setStudentActive(studentId, false);
            const s = appState.students.find(s => s.id === studentId);
            if (s) s.active = false;
            renderRecepcionStudentsList();
            showToast(`${student.name} dado de baja`, 'success');
        } catch (e) {
            showToast('Error al dar de baja al alumno', 'error');
        }
    };
    openModal('deactivateStudentModal');
}

async function reactivateStudent(studentId) {
    const student = getStudentById(studentId);
    if (!student) return;
    try {
        await db.setStudentActive(studentId, true);
        const s = appState.students.find(s => s.id === studentId);
        if (s) s.active = true;
        renderRecepcionStudentsList();
        showToast(`${student.name} reactivado`, 'success');
    } catch (e) {
        showToast('Error al reactivar al alumno', 'error');
    }
}

// ==========================================
// PARTIDOS / NIVELES (estilo Playtomic)
// ==========================================
// Sección dentro del panel de Recepción (pestaña "Partidos / Niveles").
// Cada partido muestra hasta 4 jugadores con su nivel individual (students.level).
// Al registrar el resultado, los 2 jugadores de la pareja ganadora suben +0.1.

// Cambia entre las vistas de Recepción: Pagos, Partidos y Categorías.
function switchRecepcionTab(tab) {
    appState.recepcionTab = tab;

    // Mostrar solo la vista activa.
    document.getElementById('recepcionPagosView').style.display = tab === 'pagos' ? '' : 'none';
    document.getElementById('recepcionCajaView').style.display = tab === 'caja' ? '' : 'none';
    document.getElementById('recepcionPartidosView').style.display = tab === 'partidos' ? '' : 'none';
    document.getElementById('recepcionCategoriasView').style.display = tab === 'categorias' ? '' : 'none';
    document.getElementById('recepcionTorneosView').style.display = tab === 'torneos' ? '' : 'none';

    // Resaltar la pestaña activa.
    document.getElementById('recepcionTabPagos').classList.toggle('active', tab === 'pagos');
    document.getElementById('recepcionTabCaja').classList.toggle('active', tab === 'caja');
    document.getElementById('recepcionTabPartidos').classList.toggle('active', tab === 'partidos');
    document.getElementById('recepcionTabCategorias').classList.toggle('active', tab === 'categorias');
    document.getElementById('recepcionTabTorneos').classList.toggle('active', tab === 'torneos');

    // El buscador de alumnos solo aplica a la vista de pagos.
    // Escritorio: visibility (no mueve el layout). Móvil: la clase
    // search-hidden lo quita del flujo (display:none) y recupera la altura.
    const searchWrap = document.getElementById('recepcionSearchWrap');
    if (searchWrap) {
        searchWrap.style.visibility = tab === 'pagos' ? 'visible' : 'hidden';
        searchWrap.classList.toggle('search-hidden', tab !== 'pagos');
    }

    if (tab === 'pagos') renderRecepcionStudentsList();
    else if (tab === 'caja') openCajaView();
    else if (tab === 'partidos') renderMatchesArea();
    else if (tab === 'categorias') renderCategoriasView();
    else if (tab === 'torneos') { backToTournamentsList(); }
}

// ==========================================
// CAJA — arqueo diario de pagos cobrados
// ==========================================

// Fecha local en formato YYYY-MM-DD (sin desfase de zona horaria).
function localDateStr(d) {
    return d.toLocaleDateString('sv'); // 'sv' -> YYYY-MM-DD
}

// Inicializa el rango (hoy por defecto) y carga los pagos.
function openCajaView() {
    const fromEl = document.getElementById('cajaFrom');
    const toEl = document.getElementById('cajaTo');
    if (!fromEl.value || !toEl.value) {
        const today = localDateStr(new Date());
        fromEl.value = today;
        toEl.value = today;
    }
    loadCajaPayments();
}

// Ajusta el rango con los botones rápidos.
function setCajaRange(preset) {
    const now = new Date();
    let from, to;
    if (preset === 'today') {
        from = to = new Date(now);
    } else if (preset === 'yesterday') {
        from = to = new Date(now.getTime() - 86400000);
    } else if (preset === 'week') {
        // Lunes a domingo de la semana actual.
        const dow = (now.getDay() + 6) % 7; // 0 = lunes
        from = new Date(now.getTime() - dow * 86400000);
        to = new Date(from.getTime() + 6 * 86400000);
    } else if (preset === 'month') {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    document.getElementById('cajaFrom').value = localDateStr(from);
    document.getElementById('cajaTo').value = localDateStr(to);
    loadCajaPayments();
}

async function loadCajaPayments() {
    let from = document.getElementById('cajaFrom').value;
    let to = document.getElementById('cajaTo').value;
    if (!from || !to) return;
    if (from > to) { [from, to] = [to, from]; } // por si se invierten

    const listEl = document.getElementById('cajaList');
    listEl.innerHTML = '<p class="profile-loading">Cargando pagos...</p>';
    try {
        const data = await db.getPaymentsByDateRange(from, to);
        appState.cajaPayments = data.map(p => db.convertPaymentFromDB(p));
    } catch (e) {
        console.error('Error cargando caja:', e);
        appState.cajaPayments = [];
        listEl.innerHTML = '<p class="profile-empty">Error al cargar los pagos.</p>';
        return;
    }
    renderCajaView();
}

// Devuelve los pagos de caja aplicando los filtros de tipo y método.
function getFilteredCajaPayments() {
    const typeFilter = document.getElementById('cajaTypeFilter')?.value || 'all';
    const methodFilter = document.getElementById('cajaMethodFilter')?.value || 'all';
    return appState.cajaPayments.filter(p => {
        const type = p.classId ? 'class' : 'monthly';
        if (typeFilter !== 'all' && type !== typeFilter) return false;
        if (methodFilter !== 'all' && (p.method || '') !== methodFilter) return false;
        return true;
    });
}

// Concepto legible de un pago (clase suelta o cuota del mes).
function cajaConcept(p) {
    if (p.classId) {
        const cls = getClassById(p.classId);
        return cls ? `Clase ${cls.date} ${cls.startTime || ''}`.trim() : 'Clase suelta';
    }
    return p.period ? `Cuota ${formatPeriod(p.period)}` : 'Cuota mensual';
}

function studentName(studentId) {
    const s = appState.students.find(x => x.id === studentId);
    return s ? s.name : 'Alumno';
}

function renderCajaView() {
    const payments = getFilteredCajaPayments();
    const sumBy = (arr) => arr.reduce((s, p) => s + (p.amount || 0), 0);

    const total = sumBy(payments);
    const efectivo = sumBy(payments.filter(p => p.method === 'efectivo'));
    const bizum = sumBy(payments.filter(p => p.method === 'bizum'));
    const transfer = sumBy(payments.filter(p => p.method === 'transferencia'));
    const otros = sumBy(payments.filter(p => !['efectivo', 'bizum', 'transferencia'].includes(p.method)));
    const mensual = sumBy(payments.filter(p => !p.classId));
    const clases = sumBy(payments.filter(p => p.classId));

    const eur = n => `€${n.toFixed(2)}`;

    // --- Tarjetas de totales ---
    document.getElementById('cajaSummary').innerHTML = `
        <div class="caja-card caja-card-total">
            <span class="caja-card-label">Total recaudado</span>
            <span class="caja-card-value">${eur(total)}</span>
            <span class="caja-card-sub">${payments.length} pago${payments.length === 1 ? '' : 's'}</span>
        </div>
        <div class="caja-card">
            <span class="caja-card-label">💵 Efectivo</span>
            <span class="caja-card-value">${eur(efectivo)}</span>
        </div>
        <div class="caja-card">
            <span class="caja-card-label">📱 Bizum</span>
            <span class="caja-card-value">${eur(bizum)}</span>
        </div>
        <div class="caja-card">
            <span class="caja-card-label">🏦 Transferencia</span>
            <span class="caja-card-value">${eur(transfer)}</span>
        </div>
        ${otros > 0 ? `<div class="caja-card">
            <span class="caja-card-label">❓ Sin método</span>
            <span class="caja-card-value">${eur(otros)}</span>
        </div>` : ''}
        <div class="caja-card caja-card-types">
            <span class="caja-card-label">Por tipo</span>
            <span class="caja-card-sub">Mensual: <strong>${eur(mensual)}</strong></span>
            <span class="caja-card-sub">Clases sueltas: <strong>${eur(clases)}</strong></span>
        </div>`;

    // --- Cuadre de caja (solo efectivo) ---
    appState._cajaEfectivo = efectivo;
    const counted = parseFloat(appState.cajaCounted);
    let badgeClass = 'caja-diff';
    let badgeLabel = '';
    let badgeVisible = false;
    if (!isNaN(counted) && appState.cajaCounted !== '') {
        const diff = counted - efectivo;
        const cls = Math.abs(diff) < 0.005 ? 'ok' : (diff > 0 ? 'over' : 'under');
        badgeClass = `caja-diff caja-diff-${cls}`;
        badgeLabel = cls === 'ok' ? '✅ Cuadra' : (diff > 0 ? `🔼 Sobra ${eur(Math.abs(diff))}` : `🔽 Falta ${eur(Math.abs(diff))}`);
        badgeVisible = true;
    }
    document.getElementById('cajaReconcile').innerHTML = `
        <div class="caja-reconcile-box">
            <span class="caja-reconcile-title">🧮 Cuadre de caja (efectivo)</span>
            <div class="caja-reconcile-row">
                <span>Efectivo esperado: <strong>${eur(efectivo)}</strong></span>
                <label class="caja-reconcile-input">Efectivo contado:
                    <input type="text" inputmode="decimal" placeholder="0.00" id="cajaCountedInput"
                        value="${escapeHtml(appState.cajaCounted)}"
                        oninput="updateCajaCounted(this.value)">
                </label>
                <span id="cajaDiffBadge" class="${badgeClass}" style="visibility:${badgeVisible ? 'visible' : 'hidden'}">${escapeHtml(badgeLabel)}</span>
            </div>
        </div>`;


    // --- Tabla de movimientos ---
    const listEl = document.getElementById('cajaList');
    if (payments.length === 0) {
        listEl.innerHTML = '<p class="profile-empty">No hay pagos cobrados en este periodo.</p>';
        return;
    }
    const methodLabel = m => ({ efectivo: '💵 Efectivo', bizum: '📱 Bizum', transferencia: '🏦 Transferencia' }[m] || '—');
    const rows = payments.map(p => `
        <tr>
            <td>${escapeHtml(p.paidDate || '')}</td>
            <td>${escapeHtml(studentName(p.studentId))}</td>
            <td>${escapeHtml(cajaConcept(p))}</td>
            <td><span class="caja-type-badge ${p.classId ? 'class' : 'monthly'}">${p.classId ? 'Clase' : 'Mensual'}</span></td>
            <td>${methodLabel(p.method)}</td>
            <td class="caja-amount">${p.amount !== null ? eur(p.amount) : '—'}</td>
        </tr>`).join('');
    listEl.innerHTML = `
        <table class="caja-table">
            <thead><tr><th>Fecha</th><th>Alumno</th><th>Concepto</th><th>Tipo</th><th>Método</th><th>Importe</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td colspan="5">Total</td><td class="caja-amount">${eur(total)}</td></tr></tfoot>
        </table>`;
}

function updateCajaCounted(value) {
    appState.cajaCounted = value;
    const badge = document.getElementById('cajaDiffBadge');
    if (!badge) return;
    const efectivo = appState._cajaEfectivo ?? 0;
    const eur = n => `€${n.toFixed(2)}`;
    const counted = parseFloat(value);
    if (!isNaN(counted) && value !== '') {
        const diff = counted - efectivo;
        const cls = Math.abs(diff) < 0.005 ? 'ok' : (diff > 0 ? 'over' : 'under');
        const label = cls === 'ok' ? '✅ Cuadra' : (diff > 0 ? `🔼 Sobra ${eur(Math.abs(diff))}` : `🔽 Falta ${eur(Math.abs(diff))}`);
        badge.className = `caja-diff caja-diff-${cls}`;
        badge.textContent = label;
        badge.style.visibility = 'visible';
    } else {
        badge.style.visibility = 'hidden';
        badge.textContent = '';
    }
}

async function exportCajaToExcel() {
    const payments = getFilteredCajaPayments();
    if (payments.length === 0) {
        showToast('No hay pagos para exportar', 'warning');
        return;
    }
    showLoading('Preparando exportación...');
    const excelReady = await ensureExcelJS();
    if (!excelReady) {
        hideLoading();
        showToast('No se pudo cargar la librería de Excel.', 'error');
        return;
    }

    const from = document.getElementById('cajaFrom').value;
    const to = document.getElementById('cajaTo').value;
    const eur = n => Number((n || 0).toFixed(2));
    const sumBy = (arr) => arr.reduce((s, p) => s + (p.amount || 0), 0);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Padel Pro Manager';
    const sheet = workbook.addWorksheet('Caja');
    sheet.columns = [
        { header: 'Fecha', width: 14 },
        { header: 'Alumno', width: 26 },
        { header: 'Concepto', width: 26 },
        { header: 'Tipo', width: 14 },
        { header: 'Método', width: 16 },
        { header: 'Importe (€)', width: 14 },
    ];

    // Título
    const titleRow = sheet.addRow([`Caja ${from === to ? from : from + ' a ' + to}`]);
    sheet.mergeCells(titleRow.number, 1, titleRow.number, 6);
    styleCell(titleRow.getCell(1), { bgColor: EXCEL_COLORS.greenLight, fontColor: EXCEL_COLORS.greenDark, bold: true, fontSize: 13 });
    titleRow.height = 22;

    // Cabecera de columnas
    const headRow = sheet.addRow(['Fecha', 'Alumno', 'Concepto', 'Tipo', 'Método', 'Importe (€)']);
    headRow.eachCell(c => styleCell(c, { bgColor: EXCEL_COLORS.greenDark, fontColor: EXCEL_COLORS.white, bold: true }));

    payments.forEach(p => {
        sheet.addRow([
            p.paidDate || '',
            studentName(p.studentId),
            cajaConcept(p),
            p.classId ? 'Clase suelta' : 'Mensual',
            p.method || '—',
            eur(p.amount),
        ]);
    });

    // Resumen
    sheet.addRow([]);
    const addSummary = (label, val) => {
        const r = sheet.addRow(['', '', '', '', label, eur(val)]);
        styleCell(r.getCell(5), { bold: true });
        styleCell(r.getCell(6), { bold: true });
    };
    addSummary('Total', sumBy(payments));
    addSummary('Efectivo', sumBy(payments.filter(p => p.method === 'efectivo')));
    addSummary('Bizum', sumBy(payments.filter(p => p.method === 'bizum')));
    addSummary('Transferencia', sumBy(payments.filter(p => p.method === 'transferencia')));

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Caja_${from}${from !== to ? '_a_' + to : ''}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    hideLoading();
    showToast('Excel exportado correctamente', 'success');
}

// Categorías de nivel (límite inferior incluido, superior excluido).
const LEVEL_CATEGORIES = [
    { key: 'primera', name: 'Primera', range: '≥ 5.5', min: 5.5, max: Infinity },
    { key: 'segunda', name: 'Segunda', range: '4.5 – 5.5', min: 4.5, max: 5.5 },
    { key: 'tercera', name: 'Tercera', range: '3.5 – 4.5', min: 3.5, max: 4.5 },
    { key: 'cuarta', name: 'Cuarta', range: '2.5 – 3.5', min: 2.5, max: 3.5 },
    { key: 'quinta', name: 'Quinta', range: '< 2.5', min: -Infinity, max: 2.5 },
];

// Devuelve la key de categoría de un nivel, o 'sin' si no tiene nivel asignado.
function getStudentCategory(level) {
    if (level === null || level === undefined || level === '' || isNaN(level)) return 'sin';
    const n = Number(level);
    const cat = LEVEL_CATEGORIES.find(c => n >= c.min && n < c.max);
    return cat ? cat.key : 'sin';
}

function renderCategoriasView() {
    const container = document.getElementById('categoriasList');
    if (!container) return;
    const filter = document.getElementById('categoriaFilter')?.value || 'all';

    // Solo alumnos activos, agrupados por categoría.
    const active = appState.students.filter(s => s.active !== false);

    // Construir grupos en orden: Primera → Quinta y, al final, Sin clasificar.
    const groups = LEVEL_CATEGORIES.map(c => ({
        ...c,
        students: active.filter(s => getStudentCategory(s.level) === c.key),
    }));
    groups.push({
        key: 'sin', name: 'Sin clasificar', range: 'sin nivel asignado',
        students: active.filter(s => getStudentCategory(s.level) === 'sin'),
    });

    const visible = filter === 'all' ? groups : groups.filter(g => g.key === filter);

    if (active.length === 0) {
        container.innerHTML = '<div class="recepcion-empty">No hay alumnos.</div>';
        return;
    }

    container.innerHTML = visible.map(g => {
        const cards = g.students.length
            ? g.students.map(s => `
                <div class="categoria-student">
                    <span class="categoria-student-name">${escapeHtml(s.name)}</span>
                    <span class="match-level-badge sm">${escapeHtml(formatLevel(s.level))}</span>
                </div>`).join('')
            : '<div class="players-hint">Sin alumnos en esta categoría.</div>';
        return `
        <div class="categoria-group">
            <div class="categoria-group-header">
                <span class="categoria-group-name">${escapeHtml(g.name)}</span>
                <span class="categoria-group-range">${escapeHtml(g.range)}</span>
                <span class="categoria-group-count">${g.students.length}</span>
            </div>
            <div class="categoria-students">${cards}</div>
        </div>`;
    }).join('');
}

// Formatea un nivel numérico (1.2, 2, 3.5...) con un decimal, o '—' si no hay.
function formatLevel(level) {
    if (level === null || level === undefined || level === '' || isNaN(level)) return '—';
    return Number(level).toFixed(1);
}

// Iniciales para el avatar circular del jugador.
function getInitials(name) {
    return String(name || '?').trim().split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

// Devuelve la etiqueta legible del tipo de partido.
function matchTypeLabel(type) {
    return type === 'friendly' ? 'Amistoso' : 'Competitivo';
}

// Fecha legible: "Hoy", "Mañana" o "lun 23 jun".
function formatMatchDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Mañana';
    if (diff === -1) return 'Ayer';
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function renderMatchesList() {
    const container = document.getElementById('matchesList');
    if (!container) return;

    if (!appState.matches.length) {
        container.innerHTML = '<div class="recepcion-empty">No hay partidos. Pulsa "Montar partido" para crear el primero.</div>';
        return;
    }

    container.innerHTML = appState.matches.map(buildMatchCard).join('');

    container.onclick = (e) => {
        const btn = e.target.closest('button[data-match-action]');
        if (!btn) return;
        const { matchAction, matchId } = btn.dataset;
        if (matchAction === 'result') openMatchResultModal(matchId);
        else if (matchAction === 'delete') confirmDeleteMatch(matchId);
    };
}

// ==========================================
// CALENDARIO DE PARTIDOS POR PISTAS
// ==========================================

// Punto de entrada de la pestaña Partidos: muestra lista o calendario.
function renderMatchesArea() {
    if (appState.matchesView === 'calendar') {
        document.getElementById('matchesListView').style.display = 'none';
        document.getElementById('matchesCalendarView').style.display = '';
        document.getElementById('matchesViewListBtn').classList.remove('active');
        document.getElementById('matchesViewCalBtn').classList.add('active');
        if (!appState.calendarDate) appState.calendarDate = localDateStr(new Date());
        document.getElementById('calendarDate').value = appState.calendarDate;
        document.getElementById('numCourtsInput').value = getNumCourts();
        applyCalendarFullWidth();
        renderMatchesCalendar();
    } else {
        document.getElementById('matchesListView').style.display = '';
        document.getElementById('matchesCalendarView').style.display = 'none';
        document.getElementById('matchesViewListBtn').classList.add('active');
        document.getElementById('matchesViewCalBtn').classList.remove('active');
        renderMatchesList();
    }
}

// Extiende la vista de calendario SOLO hacia la derecha, hasta el borde derecho
// del fondo gris (.recepcion-dashboard). El margen izquierdo se mantiene alineado
// con el resto del panel (.recepcion-inner, 860px).
function applyCalendarFullWidth() {
    const calView = document.getElementById('matchesCalendarView');
    const inner = document.querySelector('.recepcion-inner');
    const dash = document.getElementById('recepcionDashboard');
    if (!calView || !inner || !dash) return;
    const innerRect = inner.getBoundingClientRect();
    const dashRect = dash.getBoundingClientRect();
    const padR = parseFloat(getComputedStyle(dash).paddingRight);
    const rightGap = (dashRect.right - padR) - innerRect.right;
    calView.style.marginLeft = '0px';
    calView.style.marginRight = `-${Math.max(0, rightGap)}px`;
}

// Recalcular el ancho del calendario al redimensionar la ventana.
window.addEventListener('resize', () => {
    if (appState.recepcionTab === 'partidos' && appState.matchesView === 'calendar') {
        applyCalendarFullWidth();
    }
});

// Cambiar entre calendario semanal (escritorio) y mensual (móvil) al
// redimensionar la ventana, sin necesidad de recargar. En un dispositivo
// táctil girar el teléfono NO cambia de vista (isMobileLayout ignora el giro).
let _lastLayoutIsMobile = isMobileLayout();
let _layoutResizeTimer = null;
let _lastViewportWidth = window.innerWidth;
window.addEventListener('resize', () => {
    clearTimeout(_layoutResizeTimer);
    _layoutResizeTimer = setTimeout(() => {
        const nowMobile = isMobileLayout();
        if (nowMobile !== _lastLayoutIsMobile) {
            _lastLayoutIsMobile = nowMobile;
            renderCalendar();
        } else if (nowMobile && window.innerWidth !== _lastViewportWidth) {
            // Rotación REAL (cambió el ancho): rehacer el lienzo virtualizado.
            // Los resize de solo-altura (Safari mostrando/ocultando su barra
            // durante el scroll) NO deben reconstruir nada: causaban el "pum".
            monthZoomDirty = true;
            renderMonthCalendar();
        }
        _lastViewportWidth = window.innerWidth;
    }, 150);
});

function switchMatchesView(view) {
    appState.matchesView = view;
    renderMatchesArea();
}

function shiftCalendarDay(delta) {
    const base = new Date(`${appState.calendarDate}T00:00:00`);
    base.setDate(base.getDate() + delta);
    appState.calendarDate = localDateStr(base);
    document.getElementById('calendarDate').value = appState.calendarDate;
    renderMatchesCalendar();
}

function setCalendarToday() {
    appState.calendarDate = localDateStr(new Date());
    document.getElementById('calendarDate').value = appState.calendarDate;
    renderMatchesCalendar();
}

function updateNumCourts(value) {
    setNumCourts(value);
    document.getElementById('numCourtsInput').value = getNumCourts();
    renderMatchesCalendar();
}

// Dibuja el calendario: columnas = pistas, filas cada 30 min, bloques de 1,5 h.
function renderMatchesCalendar() {
    const host = document.getElementById('matchesCalendar');
    const unassignedHost = document.getElementById('matchesUnassigned');
    if (!host) return;

    appState.calendarDate = document.getElementById('calendarDate').value || appState.calendarDate;
    const date = appState.calendarDate;
    const numCourts = getNumCourts();

    const dayStart = CONFIG.hoursStart * 60;       // min desde medianoche
    const dayEnd = CONFIG.hoursEnd * 60;
    const totalMin = dayEnd - dayStart;
    const slotMin = 30;                            // regla de media en media hora
    const slotPx = 30;                             // alto de cada media hora (px)
    const pxPerMin = slotPx / slotMin;
    const numSlots = Math.ceil(totalMin / slotMin);

    const dayMatches = appState.matches.filter(m => m.matchDate === date);

    // Partidos sin pista asignada -> tira superior.
    const unassigned = dayMatches.filter(m => !m.court);
    if (unassignedHost) {
        if (unassigned.length) {
            unassignedHost.innerHTML = `<span class="cal-unassigned-label">⚠️ Sin pista asignada:</span> ` +
                unassigned.map(m => `<span class="cal-unassigned-chip" title="${escapeHtml(m.startTime)}">${escapeHtml(m.startTime)} · ${escapeHtml(matchCalLabel(m))}</span>`).join('');
            unassignedHost.style.display = '';
        } else {
            unassignedHost.innerHTML = '';
            unassignedHost.style.display = 'none';
        }
    }

    // --- Regla de horas (columna izquierda) ---
    let timeLabels = '';
    for (let i = 0; i < numSlots; i++) {
        const min = dayStart + i * slotMin;
        const hh = String(Math.floor(min / 60)).padStart(2, '0');
        const mm = String(min % 60).padStart(2, '0');
        const onHour = (min % 60 === 0);
        timeLabels += `<div class="cal-time-label ${onHour ? 'on-hour' : ''}" style="height:${slotPx}px">${onHour ? hh + ':' + mm : ''}</div>`;
    }

    // --- Cabecera de pistas ---
    let headers = '<div class="cal-corner"></div>';
    for (let c = 1; c <= numCourts; c++) {
        headers += `<div class="cal-court-head">Pista ${c}</div>`;
    }

    // --- Columnas de pistas con líneas de fondo + bloques de partido ---
    let columns = '';
    for (let c = 1; c <= numCourts; c++) {
        // Líneas de fondo (cada media hora).
        let bg = '';
        for (let i = 0; i < numSlots; i++) {
            const min = dayStart + i * slotMin;
            bg += `<div class="cal-slot ${min % 60 === 0 ? 'on-hour' : ''}" style="height:${slotPx}px"></div>`;
        }
        // Bloques de partido de esta pista.
        const courtMatches = dayMatches.filter(m => m.court === c);
        const blocks = courtMatches.map(m => {
            const start = timeToMinutes(m.startTime);
            const top = (start - dayStart) * pxPerMin;
            const height = CONFIG.matchDurationMin * pxPerMin;
            const endMin = start + CONFIG.matchDurationMin;
            const endStr = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
            const cls = m.isCompleted ? 'cal-block-done' : (m.matchType === 'friendly' ? 'cal-block-friendly' : 'cal-block-comp');
            return `
                <div class="cal-block ${cls}" style="top:${top}px; height:${height}px"
                     data-match-id="${escapeHtml(m.id)}"
                     title="${escapeHtml(m.startTime)}–${endStr} · ${escapeHtml(matchCalLabel(m))} (arrastra para mover)">
                    <div class="cal-block-time">${escapeHtml(m.startTime)}–${endStr}</div>
                    <div class="cal-block-players">${escapeHtml(matchCalLabel(m))}</div>
                    ${m.winner ? `<div class="cal-block-winner">🏆 ${escapeHtml(m.winner)}</div>` : ''}
                </div>`;
        }).join('');
        columns += `<div class="cal-court-col" data-court="${c}">${bg}${blocks}</div>`;
    }

    const gridCols = `grid-template-columns: 56px repeat(${numCourts}, minmax(96px, 1fr));`;
    host.innerHTML = `
        <div class="cal-grid">
            <div class="cal-head-row" style="${gridCols}">${headers}</div>
            <div class="cal-body-row" style="${gridCols}">
                <div class="cal-times">${timeLabels}</div>
                ${columns}
            </div>
        </div>`;

    // Guardar parámetros de geometría para los cálculos de arrastre/doble clic.
    host._cal = { dayStart, dayEnd, slotPx, pxPerMin, durationMin: CONFIG.matchDurationMin };
    attachCalendarInteractions(host);
}

// ==========================================
// INTERACCIÓN DEL CALENDARIO: arrastrar bloques + doble clic en hueco
// ==========================================

// Snap de minutos a intervalos (15 min, coherente con el selector de hora).
const CAL_SNAP_MIN = 15;
function snapMinutes(min) {
    return Math.round(min / CAL_SNAP_MIN) * CAL_SNAP_MIN;
}
function minutesToTime(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Devuelve la columna de pista bajo unas coordenadas de pantalla (o null).
function courtColAt(host, clientX, clientY) {
    const cols = host.querySelectorAll('.cal-court-col');
    for (const col of cols) {
        const r = col.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
            return col;
        }
    }
    return null;
}

// Calcula la hora (min desde medianoche, ya con snap y dentro de límites) a
// partir de la Y del puntero relativa a una columna.
function timeFromPointer(host, col, clientY) {
    const { dayStart, dayEnd, pxPerMin, durationMin } = host._cal;
    const r = col.getBoundingClientRect();
    let min = dayStart + (clientY - r.top) / pxPerMin;
    min = snapMinutes(min);
    min = Math.max(dayStart, Math.min(min, dayEnd - durationMin)); // que quepa el partido
    return min;
}

function attachCalendarInteractions(host) {
    // MÓVIL: sin arrastre (touch-action:none mataba el scroll de la página y
    // el drag con el dedo era impreciso). Como con las clases: tap en un
    // bloque = abrirlo; tap en un hueco = montar partido a esa hora y pista.
    if (isMobileLayout()) {
        host.onpointerdown = null;
        host.onpointermove = null;
        host.onpointerup = null;
        host.ondblclick = null;
        host.onclick = (e) => {
            const block = e.target.closest('.cal-block');
            if (block) {
                openMatchFromCalendar(block.dataset.matchId);
                return;
            }
            const col = e.target.closest('.cal-court-col');
            if (!col) return;
            const court = parseInt(col.dataset.court, 10);
            const min = timeFromPointer(host, col, e.clientY);
            openCreateMatchModal({ court, time: minutesToTime(min) });
        };
        return;
    }
    host.onclick = null;

    let drag = null; // { id, block, origCourt, moved }

    host.onpointerdown = (e) => {
        const block = e.target.closest('.cal-block');
        if (!block) return;
        e.preventDefault();
        drag = {
            id: block.dataset.matchId,
            block,
            startX: e.clientX,
            startY: e.clientY,
            moved: false,
        };
        block.classList.add('cal-block-dragging');
        host.setPointerCapture(e.pointerId);
    };

    host.onpointermove = (e) => {
        if (!drag) return;
        if (!drag.moved && Math.abs(e.clientX - drag.startX) < 4 && Math.abs(e.clientY - drag.startY) < 4) return;
        drag.moved = true;
        const col = courtColAt(host, e.clientX, e.clientY);
        if (!col) return;
        // Reubicar el bloque en la columna destino y a la altura correspondiente.
        if (drag.block.parentElement !== col) col.appendChild(drag.block);
        const min = timeFromPointer(host, col, e.clientY);
        const top = (min - host._cal.dayStart) * host._cal.pxPerMin;
        drag.block.style.top = `${top}px`;
    };

    host.onpointerup = async (e) => {
        if (!drag) return;
        const d = drag; drag = null;
        d.block.classList.remove('cal-block-dragging');
        try { host.releasePointerCapture(e.pointerId); } catch (_) {}

        if (!d.moved) {                       // fue un clic, no un arrastre
            openMatchFromCalendar(d.id);
            return;
        }
        const col = courtColAt(host, e.clientX, e.clientY) || d.block.parentElement;
        const newCourt = parseInt(col.dataset.court, 10);
        const newMin = timeFromPointer(host, col, e.clientY);
        const newTime = minutesToTime(newMin);

        const m = appState.matches.find(x => x.id === d.id);
        if (!m) { renderMatchesCalendar(); return; }
        if (m.court === newCourt && m.startTime === newTime) { renderMatchesCalendar(); return; }

        // Aviso de solapamiento en la pista destino.
        if (isCourtBusy(newCourt, m.matchDate, newTime, m.id)) {
            if (!(await showConfirm(`La pista ${newCourt} ya tiene un partido que se solapa a las ${newTime}. ¿Mover de todos modos?`,
                { title: 'Pista ocupada', confirmText: 'Mover igualmente' }))) {
                renderMatchesCalendar();
                return;
            }
        }
        try {
            await db.updateMatch(d.id, { court: newCourt, startTime: newTime });
            m.court = newCourt;
            m.startTime = newTime;
            appState.matches.sort((a, b) => (a.matchDate + a.startTime).localeCompare(b.matchDate + b.startTime));
            renderMatchesCalendar();
            showToast(`Movido a Pista ${newCourt} · ${newTime}`, 'success');
        } catch (err) {
            console.error('Error moviendo partido:', err);
            showToast('Error al mover el partido', 'error');
            renderMatchesCalendar();
        }
    };

    // Doble clic en un hueco vacío -> montar partido con pista y hora prefijadas.
    host.ondblclick = (e) => {
        if (e.target.closest('.cal-block')) return;   // doble clic sobre un partido: ignorar
        const col = e.target.closest('.cal-court-col');
        if (!col) return;
        const court = parseInt(col.dataset.court, 10);
        const min = timeFromPointer(host, col, e.clientY);
        openCreateMatchModal({ court, time: minutesToTime(min) });
    };
}

// Etiqueta breve de un partido para el calendario (apellidos/primer nombre).
function matchCalLabel(m) {
    const names = (m.players || []).filter(Boolean).map(id => {
        const s = getStudentById(id);
        return s ? s.name.split(' ')[0] : 'Alumno';
    });
    if (!names.length) return 'Sin jugadores';
    const a = names.slice(0, 2).join(' / ');
    const b = names.slice(2, 4).join(' / ');
    return b ? `${a} vs ${b}` : a;
}

// Al pulsar un bloque del calendario: registrar resultado si está completo,
// o avisar de que faltan jugadores.
function openMatchFromCalendar(matchId) {
    const m = appState.matches.find(x => x.id === matchId);
    if (!m) return;
    const filled = (m.players || []).filter(Boolean).length;
    if (m.isCompleted) {
        showToast('Este partido ya tiene resultado registrado', 'info');
        return;
    }
    if (filled === 4) {
        openMatchResultModal(matchId);
    } else {
        showToast(`Faltan jugadores (${filled}/4) para registrar resultado`, 'warning');
    }
}

// Construye una tarjeta de partido (cabecera + slots de jugadores).
function buildMatchCard(match) {
    const slots = [];
    for (let i = 0; i < 4; i++) {
        const playerId = match.players[i];
        if (playerId) {
            const student = getStudentById(playerId);
            const name = student ? student.name : 'Alumno';
            const level = student ? student.level : null;
            slots.push(`
                <div class="match-player">
                    <div class="match-player-avatar">${escapeHtml(getInitials(name))}</div>
                    <div class="match-player-name">${escapeHtml(name.split(' ')[0])}</div>
                    <div class="match-level-badge">${escapeHtml(formatLevel(level))}</div>
                </div>`);
        } else {
            slots.push(`
                <div class="match-player match-player-empty">
                    <div class="match-player-avatar match-slot-available">+</div>
                    <div class="match-player-name">Libre</div>
                </div>`);
        }
        // Separador visual entre Pareja A (0,1) y Pareja B (2,3)
        if (i === 1) slots.push('<div class="match-vs">VS</div>');
    }

    const winnerLabel = match.winner
        ? `<span class="match-winner-tag">🏆 Ganó Pareja ${escapeHtml(match.winner)}</span>`
        : '';

    return `
    <div class="match-card ${match.isCompleted ? 'match-card-done' : ''}">
        <div class="match-card-header">
            <div class="match-card-when">
                <span class="match-card-date">${escapeHtml(formatMatchDate(match.matchDate))} a las ${escapeHtml(match.startTime)}</span>
                <div class="match-card-tags">
                    <span class="match-type-chip">🎾 ${escapeHtml(matchTypeLabel(match.matchType))}</span>
                    <span class="match-range-chip">${escapeHtml(formatLevel(match.levelMin))} - ${escapeHtml(formatLevel(match.levelMax))}</span>
                    ${winnerLabel}
                </div>
            </div>
            <button class="btn-icon-sm match-delete-btn" data-match-action="delete" data-match-id="${escapeHtml(match.id)}" title="Eliminar partido">🗑️</button>
        </div>
        <div class="match-players-row">
            ${slots.join('')}
        </div>
        <div class="match-card-footer">
            ${match.isCompleted
                ? '<span class="match-done-text">Resultado registrado</span>'
                : `<button class="btn btn-primary btn-sm" data-match-action="result" data-match-id="${escapeHtml(match.id)}">Registrar resultado</button>`
            }
        </div>
    </div>`;
}

// --- Crear / montar partido ------------------------------------------------

// Rellena el <select> de hora con franjas cada 15 min (solo :00, :15, :30, :45).
function populateMatchTimeOptions() {
    const select = document.getElementById('matchTime');
    if (!select) return;
    const startH = CONFIG.hoursStart; // 7
    const endH = CONFIG.hoursEnd;      // 23
    let html = '<option value="">--:--</option>';
    for (let h = startH; h <= endH; h++) {
        for (const m of ['00', '15', '30', '45']) {
            if (h === endH && m !== '00') break; // no pasar de 23:00
            const hh = String(h).padStart(2, '0');
            html += `<option value="${hh}:${m}">${hh}:${m}</option>`;
        }
    }
    select.innerHTML = html;
}

// Rellena el <select> de pistas (1..N). preselect opcional.
function populateMatchCourtOptions(preselect) {
    const select = document.getElementById('matchCourt');
    if (!select) return;
    const n = getNumCourts();
    let html = '';
    for (let c = 1; c <= n; c++) {
        html += `<option value="${c}">Pista ${c}</option>`;
    }
    select.innerHTML = html;
    if (preselect) select.value = String(preselect);
}

function openCreateMatchModal(prefill) {
    // prefill puede ser un objeto { court, time } (desde el calendario) o el
    // evento de un onclick (lo ignoramos).
    const pre = (prefill && typeof prefill === 'object' && !prefill.target) ? prefill : null;

    document.getElementById('matchForm').reset();
    populateMatchTimeOptions();
    populateMatchCourtOptions(pre && pre.court ? pre.court : 1);
    document.getElementById('matchLevelMin').value = '0.5';
    document.getElementById('matchLevelMax').value = '5.0';
    document.getElementById('matchType').value = 'competitive';
    // Si venimos del calendario, prefijar la fecha mostrada.
    if (appState.matchesView === 'calendar' && appState.calendarDate) {
        document.getElementById('matchDate').value = appState.calendarDate;
    }
    if (pre && pre.time) document.getElementById('matchTime').value = pre.time;
    appState.matchTempPlayers = [];
    renderMatchPlayersSelector();
    openModal('matchModal');
}

// Selector de jugadores: pills de seleccionados + buscador de alumnos.
function renderMatchPlayersSelector(query = '') {
    const container = document.getElementById('matchPlayersSelector');
    if (!container) return;

    const selected = appState.matchTempPlayers;
    const pills = selected.map((id, idx) => {
        const s = getStudentById(id);
        const team = idx < 2 ? 'A' : 'B';
        return `
        <span class="player-pill player-pill-team-${team}">
            <span class="player-pill-team">${team}</span>
            ${escapeHtml(s ? s.name : 'Alumno')}
            <span class="player-pill-level">${escapeHtml(formatLevel(s ? s.level : null))}</span>
            <button type="button" class="player-pill-remove" onclick="removeMatchPlayer('${escapeHtml(id)}')">✕</button>
        </span>`;
    }).join('');

    // Rango de nivel: solo se muestran alumnos cuyo nivel esté dentro del rango.
    const levelMin = parseFloat(document.getElementById('matchLevelMin').value);
    const levelMax = parseFloat(document.getElementById('matchLevelMax').value);
    const inLevelRange = (lvl) => {
        const n = parseFloat(lvl);
        if (isNaN(n)) return false;                       // sin nivel asignado -> fuera
        if (!isNaN(levelMin) && n < levelMin) return false;
        if (!isNaN(levelMax) && n > levelMax) return false;
        return true;
    };

    const full = selected.length >= 4;
    const q = query.toLowerCase();
    const candidates = full ? [] : appState.students
        .filter(s => s.active !== false && !selected.includes(s.id)
            && s.name.toLowerCase().includes(q)
            && inLevelRange(s.level));
    const results = candidates
        .slice(0, 6)
        .map(s => `
            <div class="player-result" onclick="addMatchPlayer('${escapeHtml(s.id)}')">
                <span>${escapeHtml(s.name)}</span>
                <span class="match-level-badge sm">${escapeHtml(formatLevel(s.level))}</span>
            </div>`).join('');

    const emptyMsg = candidates.length === 0
        ? `<div class="players-hint">Ningún alumno con nivel entre ${escapeHtml(formatLevel(levelMin))} y ${escapeHtml(formatLevel(levelMax))}.</div>`
        : '';

    container.innerHTML = `
        <div class="player-pills">${pills || '<span class="players-hint">Aún no hay jugadores.</span>'}</div>
        ${full
            ? '<div class="players-hint">Partido completo (4 jugadores).</div>'
            : `<input type="text" class="player-search-input" placeholder="Buscar alumno..." oninput="renderMatchPlayersSelector(this.value)" value="${escapeHtml(query)}">
               <div class="player-results">${results || emptyMsg}</div>`
        }`;

    // Mantener el foco en el buscador tras re-render.
    const input = container.querySelector('.player-search-input');
    if (input && query) { input.focus(); input.setSelectionRange(query.length, query.length); }
}

function addMatchPlayer(studentId) {
    if (appState.matchTempPlayers.length >= 4) return;
    if (!appState.matchTempPlayers.includes(studentId)) {
        appState.matchTempPlayers.push(studentId);
    }
    renderMatchPlayersSelector();
}

function removeMatchPlayer(studentId) {
    appState.matchTempPlayers = appState.matchTempPlayers.filter(id => id !== studentId);
    renderMatchPlayersSelector();
}

async function submitMatch() {
    const matchDate = document.getElementById('matchDate').value;
    const startTime = document.getElementById('matchTime').value;
    const matchType = document.getElementById('matchType').value;
    const levelMin = parseFloat(document.getElementById('matchLevelMin').value);
    const levelMax = parseFloat(document.getElementById('matchLevelMax').value);
    const court = parseInt(document.getElementById('matchCourt').value, 10) || null;

    if (!matchDate || !startTime) {
        showToast('Indica fecha y hora del partido', 'error');
        return;
    }
    if (isNaN(levelMin) || isNaN(levelMax) || levelMin > levelMax) {
        showToast('Rango de nivel no válido', 'error');
        return;
    }
    // Aviso si la pista ya está ocupada en esa franja (solapamiento de 1,5 h).
    if (court && isCourtBusy(court, matchDate, startTime)) {
        if (!(await showConfirm(`La pista ${court} ya tiene un partido que se solapa a esa hora. ¿Crear de todos modos?`,
            { title: 'Pista ocupada', confirmText: 'Crear igualmente' }))) return;
    }

    try {
        const created = await db.createMatch({
            matchDate,
            startTime,
            matchType,
            levelMin,
            levelMax,
            court,
            players: appState.matchTempPlayers,
        });
        appState.matches.push(db.convertMatchFromDB(created));
        appState.matches.sort((a, b) =>
            (a.matchDate + a.startTime).localeCompare(b.matchDate + b.startTime));
        closeModal('matchModal');
        if (appState.matchesView === 'calendar') renderMatchesCalendar();
        else renderMatchesList();
        showToast('Partido creado', 'success');
    } catch (e) {
        showToast('Error al crear el partido', 'error');
    }
}

// ¿Hay ya un partido en esa pista/fecha cuyo intervalo de 1,5 h solapa con el nuevo?
function isCourtBusy(court, date, startTime, ignoreId) {
    const newStart = timeToMinutes(startTime);
    const newEnd = newStart + CONFIG.matchDurationMin;
    return appState.matches.some(m => {
        if (m.id === ignoreId) return false;
        if (m.court !== court || m.matchDate !== date) return false;
        const s = timeToMinutes(m.startTime);
        const e = s + CONFIG.matchDurationMin;
        return newStart < e && s < newEnd; // se solapan
    });
}

// "HH:MM" -> minutos desde medianoche.
function timeToMinutes(t) {
    if (!t) return 0;
    const [h, m] = String(t).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

// --- Registrar resultado y actualizar nivel --------------------------------

function openMatchResultModal(matchId) {
    const match = appState.matches.find(m => m.id === matchId);
    if (!match) return;

    const teamA = [match.players[0], match.players[1]].filter(Boolean);
    const teamB = [match.players[2], match.players[3]].filter(Boolean);

    if (teamA.length < 2 || teamB.length < 2) {
        showToast('El partido necesita 4 jugadores para registrar el resultado', 'error');
        return;
    }

    const teamHtml = (team, letter) => {
        const names = team.map(id => {
            const s = getStudentById(id);
            return `${escapeHtml(s ? s.name : 'Alumno')} <span class="match-level-badge sm">${escapeHtml(formatLevel(s ? s.level : null))}</span>`;
        }).join(' · ');
        return `
        <button class="match-result-team-btn" onclick="registerMatchResult('${escapeHtml(matchId)}', '${letter}')">
            <span class="match-result-team-label">Pareja ${letter}</span>
            <span class="match-result-team-players">${names}</span>
            <span class="match-result-win">Ganó esta pareja →</span>
        </button>`;
    };

    document.getElementById('matchResultTeams').innerHTML = teamHtml(teamA, 'A') + teamHtml(teamB, 'B');
    openModal('matchResultModal');
}

async function registerMatchResult(matchId, winner) {
    const match = appState.matches.find(m => m.id === matchId);
    if (!match) return;

    // Jugadores de la pareja ganadora: índices 0-1 (A) o 2-3 (B).
    const winnerIds = winner === 'A'
        ? [match.players[0], match.players[1]]
        : [match.players[2], match.players[3]];

    try {
        // +0.1 al nivel de cada jugador ganador, persistiendo en students.level.
        for (const id of winnerIds.filter(Boolean)) {
            const student = getStudentById(id);
            if (!student) continue;
            const current = (student.level === null || student.level === undefined || isNaN(student.level))
                ? 0 : Number(student.level);
            const newLevel = Math.round((current + 0.1) * 10) / 10; // evita errores de coma flotante
            await db.updateStudent(id, { level: newLevel });
            student.level = newLevel; // actualizar estado local sin recargar
        }

        const updated = await db.updateMatch(matchId, { winner, isCompleted: true });
        const idx = appState.matches.findIndex(m => m.id === matchId);
        if (idx !== -1) appState.matches[idx] = db.convertMatchFromDB(updated);

        closeModal('matchResultModal');
        renderMatchesArea();
        showToast('Resultado registrado · niveles actualizados', 'success');
    } catch (e) {
        console.error('Error registrando resultado:', e);
        showToast('Error al registrar el resultado', 'error');
    }
}

async function confirmDeleteMatch(matchId) {
    const match = appState.matches.find(m => m.id === matchId);
    if (!match) return;
    if (!(await showConfirm('¿Eliminar este partido?',
        { title: 'Eliminar partido', confirmText: 'Eliminar', danger: true }))) return;
    db.deleteMatch(matchId)
        .then(() => {
            appState.matches = appState.matches.filter(m => m.id !== matchId);
            renderMatchesArea();
            showToast('Partido eliminado', 'success');
        })
        .catch(() => showToast('Error al eliminar el partido', 'error'));
}

function viewMonitorClasses(monitorId) {
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    appState.viewingMonitorId = monitorId;

    // withViewTransition solo anima en móvil; en escritorio ejecuta tal cual
    withViewTransition(() => {
        document.getElementById('coordinatorDashboard').style.display = 'none';
        document.getElementById('calendarSectionContainer').style.display = 'block';

        renderWeekTitle();
        renderCalendar();

        // En móvil el panel puede estar scrolleado muy abajo: recolocar el
        // scroll de la página sobre el mes ancla del calendario del monitor
        // (solo con la lista de meses visible; en vista de día no se mide)
        if (isMobileLayout() && mobileViewLevel === 'month') {
            scrollToMonthSection(getAnchorDate(), false);
        }
    });
}

function backToCoordinatorDashboard() {
    appState.viewingMonitorId = null;
    withViewTransition(() => {
        renderWeekTitle();
        showCoordinatorDashboard();
        // El calendario deja el scroll de la página a miles de px: el panel
        // debe verse desde arriba
        if (isMobileLayout()) window.scrollTo(0, 0);
    });
}

function goHome() {
    appState.viewingMonitorId = null;
    appState.currentUser = null;
    hideMainApp();
    const loginView = document.getElementById('login-view');
    if (loginView) loginView.style.display = 'flex';
}

async function confirmDeleteMonitor(monitorId) {
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    if (await showConfirm(`¿Estás seguro de eliminar al monitor "${monitor.name}"? Se eliminarán también todas sus clases.`,
        { title: 'Eliminar monitor', confirmText: 'Eliminar', danger: true })) {
        await deleteMonitor(monitorId);
    }
}

async function editMonitor(monitorId) {
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    const newName = await showPrompt('Nuevo nombre:', monitor.name, { title: 'Editar monitor' });
    if (newName && newName.trim()) {
        await updateMonitor(monitorId, { name: newName.trim() });
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================

let _listenersInitialized = false;
function initializeEventListeners() {
    if (_listenersInitialized) return;
    _listenersInitialized = true;

    function getEl(id) {
        const el = document.getElementById(id);
        if (!el) console.warn(`initializeEventListeners: element not found: ${id}`);
        return el;
    }
    // Student modal
    const addStudentBtn = getEl('addStudentBtn');
    if (addStudentBtn) addStudentBtn.addEventListener('click', () => {
        const form = getEl('studentForm');
        if (form) form.reset();
        appState.editingStudent = null;
        const header = document.querySelector('#studentModal .modal-header h2');
        if (header) header.textContent = 'Añadir Alumno';
        openModal('studentModal');
    });

    const closeStudentModalBtn = getEl('closeStudentModal');
    if (closeStudentModalBtn) closeStudentModalBtn.addEventListener('click', () => closeModal('studentModal'));

    const cancelStudentBtn = getEl('cancelStudentBtn');
    if (cancelStudentBtn) cancelStudentBtn.addEventListener('click', () => closeModal('studentModal'));

    const studentFormEl = getEl('studentForm');
    if (studentFormEl) studentFormEl.addEventListener('submit', handleStudentFormSubmit);

    // Class modal
    const addClassBtn = getEl('addClassBtn');
    if (addClassBtn) addClassBtn.addEventListener('click', () => {
        appState.selectedClass = null;
        openAddClassModal();
    });

    const closeClassModalBtn = getEl('closeClassModal');
    if (closeClassModalBtn) closeClassModalBtn.addEventListener('click', () => {
        closeModal('classModal');
        appState.selectedClass = null;
        appState.tempSelectedStudents = [];
    });

    const cancelClassBtnEl = getEl('cancelClassBtn');
    if (cancelClassBtnEl) cancelClassBtnEl.addEventListener('click', () => {
        closeModal('classModal');
        appState.selectedClass = null;
        appState.tempSelectedStudents = [];
    });

    const classFormEl = getEl('classForm');
    if (classFormEl) classFormEl.addEventListener('submit', handleClassFormSubmit);

    // Class details modal
    const closeClassDetailsBtn = getEl('closeClassDetailsModal');
    if (closeClassDetailsBtn) closeClassDetailsBtn.addEventListener('click', () => closeModal('classDetailsModal'));

    const editClassBtnEl = getEl('editClassBtn');
    if (editClassBtnEl) editClassBtnEl.addEventListener('click', () => {
        const classId = appState.selectedClass;
        closeModal('classDetailsModal');
        openEditClassModal(classId);
    });

    const deleteClassBtnEl = getEl('deleteClassBtn');
    if (deleteClassBtnEl) deleteClassBtnEl.addEventListener('click', () => {
        showDeleteClassModal(appState.selectedClass);
    });

    const deleteSingleBtn = getEl('deleteSingleClassConfirmBtn');
    if (deleteSingleBtn) deleteSingleBtn.addEventListener('click', confirmDeleteSingleClass);

    const deleteRecurringBtn = getEl('deleteRecurringGroupConfirmBtn');
    if (deleteRecurringBtn) deleteRecurringBtn.addEventListener('click', confirmDeleteRecurringGroup);

    const toggleCompletedBtnEl = getEl('toggleCompletedBtn');
    if (toggleCompletedBtnEl) toggleCompletedBtnEl.addEventListener('click', () => toggleClassCompleted(appState.selectedClass));

    // Week navigation
    const prevWeekBtn = getEl('prevWeekBtn');
    if (prevWeekBtn) prevWeekBtn.addEventListener('click', () => navigateWeek(-1));
    const nextWeekBtn = getEl('nextWeekBtn');
    if (nextWeekBtn) nextWeekBtn.addEventListener('click', () => navigateWeek(1));
    const todayBtnEl = getEl('todayBtn');
    if (todayBtnEl) todayBtnEl.addEventListener('click', goToToday);

    const copyWeekBtnEl = getEl('copyWeekBtn');
    if (copyWeekBtnEl) copyWeekBtnEl.addEventListener('click', copyCurrentWeekToNext);

    // Month/year selectors
    const monthSelectorEl = getEl('monthSelector');
    const monthSelectorButton = getEl('monthSelectorButton');
    const monthSelectorDropdown = getEl('monthSelectorDropdown');
    const monthTitle = getEl('monthTitle');
    const yearTitle = getEl('yearTitle');

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    function updateMonthYearTitles() {
        const date = appState.currentMonthDate ? new Date(appState.currentMonthDate) : new Date();
        if (monthTitle) monthTitle.textContent = monthNames[date.getMonth()];
        if (yearTitle) yearTitle.textContent = date.getFullYear();
    }

    function setMonthYear(month, year) {
        setAnchorDate(new Date(year, month, 1));
        updateMonthYearTitles();
        renderWeekTitle();
        renderCalendar();
    }

    // Dropdown de meses
    if (monthSelectorButton && monthSelectorEl && monthSelectorDropdown) {
        function renderMonthDropdown() {
            let html = '';
            for (let m = 0; m < 12; m++) {
                html += `<li data-month="${m}">${monthNames[m]}</li>`;
            }
            monthSelectorDropdown.innerHTML = html;
        }

        monthSelectorButton.addEventListener('click', (e) => {
            e.stopPropagation();
            renderMonthDropdown();
            monthSelectorEl.classList.toggle('open');
        });

        monthSelectorDropdown.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-month]');
            if (!li) return;
            e.stopPropagation();
            const monthIndex = parseInt(li.getAttribute('data-month'), 10);
            if (isNaN(monthIndex)) return;
            const date = appState.currentMonthDate ? new Date(appState.currentMonthDate) : new Date();
            setMonthYear(monthIndex, date.getFullYear());
            monthSelectorEl.classList.remove('open');
        });

        document.addEventListener('click', (e) => {
            if (monthSelectorEl && !monthSelectorEl.contains(e.target)) {
                monthSelectorEl.classList.remove('open');
            }
        });
    }

    // Navegación de año con botones ‹ / ›
    const yearPrevBtn = getEl('yearPrevBtn');
    const yearNextBtn = getEl('yearNextBtn');
    if (yearPrevBtn) {
        yearPrevBtn.onclick = () => {
            const date = appState.currentMonthDate ? new Date(appState.currentMonthDate) : new Date();
            setMonthYear(date.getMonth(), date.getFullYear() - 1);
        };
    }
    if (yearNextBtn) {
        yearNextBtn.onclick = () => {
            const date = appState.currentMonthDate ? new Date(appState.currentMonthDate) : new Date();
            setMonthYear(date.getMonth(), date.getFullYear() + 1);
        };
    }

    updateMonthYearTitles();

    // Snap toggle button (15m / 30m)
    const weekNavEl = document.querySelector('.week-navigation');
    if (weekNavEl && !document.getElementById('snapToggleBtn')) {
        const snapBtn = document.createElement('button');
        snapBtn.id = 'snapToggleBtn';
        snapBtn.className = 'btn btn-sm';
        snapBtn.style.marginLeft = '8px';
        snapBtn.textContent = `Snap: ${CONFIG.snapMinutes}m`;
        snapBtn.title = 'Alternar snap entre 15 y 30 minutos';
        snapBtn.addEventListener('click', () => {
            CONFIG.snapMinutes = CONFIG.snapMinutes === 15 ? 30 : 15;
            snapBtn.textContent = `Snap: ${CONFIG.snapMinutes}m`;
            showToast(`Snap cambiado a ${CONFIG.snapMinutes} minutos`, 'success');
        });
        weekNavEl.appendChild(snapBtn);
    }

    // Ver Alumnos modal (full-screen list)
    const toggleStudentsBtn = getEl('toggleSidebarBtn');
    const studentsModal = getEl('studentsModal');
    const studentsModalSearch = getEl('studentsModalSearch');

    if (toggleStudentsBtn && studentsModal) {
        toggleStudentsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderStudentsDropdown();
            openModal('studentsModal');
            if (studentsModalSearch) {
                studentsModalSearch.value = '';
                // En móvil evitar auto-focus para que no haga zoom la pantalla
                if (!isTouchDevice()) {
                    studentsModalSearch.focus();
                }
            }
        });
    }

    if (studentsModalSearch) {
        studentsModalSearch.addEventListener('input', (e) => renderStudentsDropdown(e.target.value));
    }

    // Close button inside dropdown
    const closeStudentsModalBtn = getEl('closeStudentsModal');
    if (closeStudentsModalBtn) closeStudentsModalBtn.addEventListener('click', (e) => { e.stopPropagation(); closeModal('studentsModal'); });

    const studentsModalAddBtn = getEl('studentsModalAddBtn');
    if (studentsModalAddBtn) studentsModalAddBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const form = getEl('studentForm');
        if (form) form.reset();
        appState.editingStudent = null;
        const header = document.querySelector('#studentModal .modal-header h2');
        if (header) header.textContent = 'Añadir Alumno';
        openModal('studentModal');
    });

    // Botón + en la vista diaria móvil: crea una clase en el día mostrado y hora actual
    const addFromDayViewBtn = getEl('addClassFromDayViewBtn');
    if (addFromDayViewBtn) {
        addFromDayViewBtn.addEventListener('click', () => {
            const now = new Date();

            // La fecha ancla ES el día mostrado en la vista diaria
            const baseDate = getAnchorDate();

            // Usar la hora actual (redondeada a la hora entera) como referencia
            const currentHour = now.getHours();

            // Aseguramos que la hora esté dentro del rango de la configuración
            const clampedHour = Math.min(Math.max(currentHour, CONFIG.hoursStart), CONFIG.hoursEnd - 1);

            const weekdayIndex = (baseDate.getDay() + 6) % 7; // 0=Lunes
            const weekdayName = CONFIG.days[weekdayIndex];

            // Abrimos el modal de nueva clase con el día y la hora sugeridos
            openAddClassModal(weekdayName, clampedHour);
        });
    }

    // Búsqueda de clases por alumno (el botón 🔍 vive en la barra superior
    // del mes, creado en renderMonthCalendar)
    const searchClassesInputEl = getEl('searchClassesInput');
    if (searchClassesInputEl) searchClassesInputEl.addEventListener('input', renderSearchClassesResults);

    // Botón "‹ Mes": volver de la vista de día al calendario mensual
    const dayBackBtnEl = getEl('dayBackBtn');
    if (dayBackBtnEl) dayBackBtnEl.addEventListener('click', closeDayViewToMonth);

    // Pellizco juntando dedos en la vista de día → volver al mes
    // (encolado: el cambio de vista se aplica al soltar los dedos)
    // Swipe horizontal → día anterior / siguiente
    const dayViewGridEl = getEl('dayViewGrid');
    if (dayViewGridEl) {
        let dayPinchCloseQueued = false;
        setupPinchGesture(dayViewGridEl, {
            onZoomOut: () => {
                dayPinchCloseQueued = true;
                if (window.navigator.vibrate) window.navigator.vibrate(20);
            },
            onGestureEnd: () => {
                if (dayPinchCloseQueued) {
                    dayPinchCloseQueued = false;
                    closeDayViewToMonth();
                }
            }
        });
        setupDaySwipe(dayViewGridEl);
    }

    // Botones ‹ › de la vista de día
    const prevDayBtnEl = getEl('prevDayBtn');
    if (prevDayBtnEl) prevDayBtnEl.addEventListener('click', () => navigateDay(-1));
    const nextDayBtnEl = getEl('nextDayBtn');
    if (nextDayBtnEl) nextDayBtnEl.addEventListener('click', () => navigateDay(1));

    // Sheets móviles: arrastrar hacia abajo para cerrar cualquier modal
    setupSheetDragDismiss();

    const closeSidebarBtnEl = getEl('closeSidebarBtn');
    if (closeSidebarBtnEl) {
        const sidebarEl = getEl('sidebar');
        closeSidebarBtnEl.addEventListener('click', () => { if (sidebarEl) sidebarEl.classList.remove('active'); });
    }

    // Student search
    const studentSearchEl = getEl('studentSearch');
    if (studentSearchEl) studentSearchEl.addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        const studentCards = document.querySelectorAll('.student-card');

        studentCards.forEach(card => {
            const nameEl = card.querySelector('h4');
            const name = nameEl ? nameEl.textContent.toLowerCase() : '';
            card.style.display = name.includes(search) ? 'block' : 'none';
        });
    });

    // Close modals on background click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
}

// ==========================================
// WEATHER WIDGET
// ==========================================

const WEATHER_CODES = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '🌥️',
    45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌧️',
    61: '🌧️', 63: '🌧️', 65: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '❄️',
    80: '🌦️', 81: '🌧️', 82: '⛈️',
    95: '⛈️', 96: '⛈️', 99: '⛈️',
};

async function fetchWeather() {
    const widget = document.getElementById('weatherWidget');
    if (!widget) return;

    // Coordenadas: C. Federico García Lorca, 21, Guadalupe, Murcia
    const lat = 38.0177003;
    const lon = -1.1754612;

    try {
        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,wind_speed_10m,wind_gusts_10m,weather_code` +
            `&timezone=auto&forecast_days=1`
        );
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        const temp = Math.round(data.current.temperature_2m);
        const wind = Math.round(data.current.wind_speed_10m);
        const gusts = Math.round(data.current.wind_gusts_10m);
        const code = data.current.weather_code;
        const emoji = WEATHER_CODES[code] || '🌡️';

        widget.replaceChildren();

        const spanEmoji = document.createElement('span');
        spanEmoji.className = 'weather-emoji';
        spanEmoji.textContent = emoji;

        const spanTemp = document.createElement('span');
        spanTemp.className = 'weather-temp';
        spanTemp.textContent = `${temp}°C`;

        const spanWind = document.createElement('span');
        spanWind.className = 'weather-wind';
        const spanGusts = document.createElement('span');
        spanGusts.style.cssText = 'opacity:0.7;font-size:0.8em';
        spanGusts.textContent = `(${gusts})`;
        spanWind.append(`💨 ${wind} `, spanGusts, ' km/h');

        widget.append(spanEmoji, spanTemp, spanWind);

        if (gusts > 30) {
            const spanAlert = document.createElement('span');
            spanAlert.className = 'weather-alert';
            spanAlert.title = 'Rachas fuertes, puede afectar al juego';
            spanAlert.textContent = '⚠️';
            widget.append(spanAlert);
        }
    } catch (e) {
        widget.innerHTML = '';
    }
}

// ==========================================
// INITIALIZATION
// ==========================================

async function initializeApp() {
    try {
        const loginView = document.getElementById('login-view');

        // Inicializar fechas, títulos y listeners siempre, antes del check de sesión,
        // para que estén listos cuando el usuario haga login.
        setAnchorDate(new Date());
        renderWeekTitle();
        renderCalendar();
        initializeEventListeners();

        // Comprobar sesión de Supabase
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                const { data, error } = await supabase.auth.getSession();
                if (error) {
                    console.warn('No se pudo obtener la sesión de Supabase al iniciar:', error);
                    await supabase.auth.signOut().catch(() => {});
                }

                const hasSession = data && data.session;

                if (!hasSession) {
                    if (loginView) loginView.style.display = 'flex';
                    hideMainApp();
                    hideLoading();
                    return;
                }

                // Resolver el perfil (monitor/coordinador/recepción o alumno).
                const resolvedUser = await resolveUserFromAuth(data.session.user.id);

                if (!resolvedUser) {
                    console.warn('Usuario sin perfil (monitors/students), cerrando sesión.');
                    await supabase.auth.signOut().catch(() => {});
                    if (loginView) loginView.style.display = 'flex';
                    hideMainApp();
                    hideLoading();
                    return;
                }

                appState.currentUser = resolvedUser;

                if (loginView) loginView.style.display = 'none';
            } catch (sessionError) {
                console.warn('Error comprobando sesión de Supabase al iniciar:', sessionError);
                await supabase.auth.signOut().catch(() => {});
                if (loginView) loginView.style.display = 'flex';
                hideMainApp();
                hideLoading();
                return;
            }
        } else {
            if (loginView) loginView.style.display = 'none';
        }

        // Cargar datos
        if (typeof supabase === 'undefined' || !supabase) {
            console.warn('Supabase no está configurado. Usando datos locales (localStorage) como fallback.');
            loadFromLocalStorage();
        } else {
            try {
                await loadAllData();
            } catch (loadError) {
                console.warn('Carga desde Supabase falló, usando localStorage como fallback:', loadError);
                loadFromLocalStorage();
            }
        }

        if (appState.currentUser) {
            showMainApp();
        } else {
            hideMainApp();
            if (loginView) loginView.style.display = 'flex';
        }
    } catch (error) {
        console.error('Error initializing app:', error);
        hideLoading();
        showAlert('❌ Error al inicializar la aplicación.\n\nDetalles en la consola (F12)', { title: 'Error' });
    }
}

    // Prevent clicks inside dropdown from closing it via document click
    // No special stopPropagation needed for modal; modal background click handler closes modal already.

// ==========================================
// EXCEL EXPORT (coordinator only, desktop)
// ==========================================

const EXCEL_COLORS = {
    greenDark:   '1B5E20', // semana header bg
    greenMed:    '2E7D32', // días semana bg
    greenLight:  'C8E6C9', // monitor header bg
    timeBg:      'FFF8E1', // fila de horas bg
    timeFont:    'E65100', // texto horas
    white:       'FFFFFF',
    gray:        'F5F5F5',
};

function styleCell(cell, { bgColor, fontColor, bold = false, fontSize = 11, italic = false } = {}) {
    if (bgColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
    cell.font = { bold, italic, size: fontSize, color: { argb: 'FF' + (fontColor || '000000') } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

// ExcelJS pesa ~1 MB, así que no se incluye en index.html: se carga bajo
// demanda la primera vez que se exporta, para no penalizar el arranque.
function ensureExcelJS() {
    if (typeof ExcelJS !== 'undefined') return Promise.resolve(true);
    return new Promise(resolve => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
    });
}

async function exportToExcel() {
    const monitors = appState.personal;
    if (monitors.length === 0) {
        showToast('No hay monitores para exportar', 'warning');
        return;
    }

    showLoading('Preparando exportación...');
    const excelReady = await ensureExcelJS();
    hideLoading();
    if (!excelReady) {
        showToast('No se pudo cargar la librería de Excel. Comprueba tu conexión.', 'error');
        return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Padel Pro Manager';

    for (const monitor of monitors) {
        const safeName = monitor.name.substring(0, 31).replace(/[:\\/?*[\]]/g, '-');
        const sheet = workbook.addWorksheet(safeName);
        sheet.columns = Array(8).fill({ width: 22 });
        buildMonitorSheet(sheet, monitor);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Clases_Padel_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Excel exportado correctamente', 'success');
}

function buildMonitorSheet(sheet, monitor) {
    const dayNames = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
    const classes = appState.classes.filter(c => c.monitorId === monitor.id);

    // Monitor name header
    const headerRow = sheet.addRow([`Monitor: ${monitor.name}`]);
    sheet.mergeCells(headerRow.number, 1, headerRow.number, 8);
    styleCell(headerRow.getCell(1), { bgColor: EXCEL_COLORS.greenLight, fontColor: EXCEL_COLORS.greenDark, bold: true, fontSize: 13 });
    headerRow.height = 22;
    sheet.addRow([]);

    if (classes.length === 0) {
        sheet.addRow(['Sin clases registradas']);
        return;
    }

    // Group by week
    const weekMap = {};
    const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;

    // Helper: parse date string safely, ignoring time part
    function parseDate(dateStr) {
        if (!dateStr) return null;
        const clean = String(dateStr).slice(0, 10); // "YYYY-MM-DD"
        const [y, mo, dd] = clean.split('-').map(Number);
        if (!y || !mo || !dd || isNaN(y) || isNaN(mo) || isNaN(dd)) return null;
        return { y, mo, dd, date: new Date(y, mo - 1, dd) };
    }

    classes.forEach(cls => {
        const parsed = parseDate(cls.date);
        if (!parsed) return;
        const { y, mo, dd, date } = parsed;
        const dayOfWeek = (date.getDay() + 6) % 7;
        const monday = new Date(y, mo - 1, dd - dayOfWeek);
        const weekKey = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
        if (!weekMap[weekKey]) weekMap[weekKey] = { monday, classes: [] };
        weekMap[weekKey].classes.push(cls);
    });

    Object.keys(weekMap).sort().forEach(weekKey => {
        const { monday, classes: weekClasses } = weekMap[weekKey];
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        // Week header row
        const weekRow = sheet.addRow([`SEMANA: ${fmt(monday)} - ${fmt(sunday)}`]);
        sheet.mergeCells(weekRow.number, 1, weekRow.number, 8);
        styleCell(weekRow.getCell(1), { bgColor: EXCEL_COLORS.greenDark, fontColor: EXCEL_COLORS.white, bold: true, fontSize: 11 });
        weekRow.height = 18;

        // Day names header row
        const dayRow = sheet.addRow(['', ...dayNames]);
        dayRow.getCell(1).value = '';
        styleCell(dayRow.getCell(1), { bgColor: EXCEL_COLORS.greenMed });
        dayNames.forEach((_, i) => {
            styleCell(dayRow.getCell(i + 2), { bgColor: EXCEL_COLORS.greenMed, fontColor: EXCEL_COLORS.white, bold: true });
        });
        dayRow.height = 18;

        // Bin classes by day
        const byDay = Array.from({ length: 7 }, () => []);
        weekClasses.forEach(cls => {
            const parsed = parseDate(cls.date);
            if (!parsed) return;
            const idx = (parsed.date.getDay() + 6) % 7;
            if (idx >= 0 && idx < 7) byDay[idx].push(cls);
        });
        byDay.forEach(d => d.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')));

        const maxClasses = Math.max(...byDay.map(d => d.length), 0);

        for (let ci = 0; ci < maxClasses; ci++) {
            // Time row
            const timeValues = [''];
            byDay.forEach(dayCls => {
                const cls = dayCls[ci];
                timeValues.push(cls ? `${cls.startTime} - ${cls.endTime}` : '');
            });
            const timeRow = sheet.addRow(timeValues);
            styleCell(timeRow.getCell(1), { bgColor: EXCEL_COLORS.gray });
            for (let col = 2; col <= 8; col++) {
                styleCell(timeRow.getCell(col), {
                    bgColor: timeValues[col - 1] ? EXCEL_COLORS.timeBg : EXCEL_COLORS.gray,
                    fontColor: timeValues[col - 1] ? EXCEL_COLORS.timeFont : '000000',
                    bold: !!timeValues[col - 1],
                });
            }
            timeRow.height = 16;

            // Student rows
            const maxStudents = Math.max(...byDay.map(d => (d[ci] ? d[ci].students.length : 0)), 1);
            for (let si = 0; si < maxStudents; si++) {
                const studentValues = [''];
                byDay.forEach(dayCls => {
                    const cls = dayCls[ci];
                    if (!cls) { studentValues.push(''); return; }
                    const sid = cls.students[si];
                    if (!sid) { studentValues.push(''); return; }
                    const student = appState.students.find(s => s.id === sid);
                    studentValues.push(student ? `${student.name} (${student.level || '-'})` : '');
                });
                const studentRow = sheet.addRow(studentValues);
                for (let col = 1; col <= 8; col++) {
                    studentRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                }
                studentRow.height = 15;
            }
        }

        sheet.addRow([]); // blank row between weeks
    });
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
