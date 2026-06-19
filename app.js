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
    monitors: [],
    currentUser: null,
    viewingMonitorId: null,
    matches: [],
    recepcionTab: 'pagos',
    matchTempPlayers: [],
    cajaPayments: [],
    cajaCounted: '',
    matchesView: 'list',
    calendarDate: null,
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

        // Fetch the monitor row linked to this auth user
        const { data: monitorRow, error: monitorError } = await supabase
            .from('monitors')
            .select('*')
            .eq('auth_user_id', data.user.id)
            .single();

        if (monitorError || !monitorRow) {
            console.error('No se encontró fila en monitors para este usuario:', monitorError);
            errorMsg.textContent = 'Usuario no autorizado. Contacta con el administrador.';
            errorMsg.style.display = 'block';
            await supabase.auth.signOut();
            return;
        }

        appState.currentUser = {
            id: monitorRow.id,
            name: monitorRow.name,
            permissions: monitorRow.permissions || [],
        };

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
    appState.currentUser = null;
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

        const result = await db.createMonitor(monitor);
        const converted = db.convertMonitorFromDB(result);
        appState.monitors.push(converted);

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
        await db.updateMonitor(monitorId, updates);
        const monitorIndex = appState.monitors.findIndex(m => m.id === monitorId);
        if (monitorIndex !== -1) {
            appState.monitors[monitorIndex] = { ...appState.monitors[monitorIndex], ...updates };
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
        await db.deleteMonitor(monitorId);

        appState.monitors = appState.monitors.filter(m => m.id !== monitorId);
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
    return appState.monitors;
}

function getMonitorById(monitorId) {
    return appState.monitors.find(m => m.id === monitorId);
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

        const [monitorsData, studentsData, classesData, matchesData] = await Promise.all([
            db.getMonitors(),
            db.getStudents(),
            db.getClasses(),
            db.getMatches().catch(err => {
                // La tabla matches puede no existir aún (ejecutar matches.sql).
                console.warn('No se pudieron cargar los partidos (¿falta ejecutar matches.sql?):', err);
                return [];
            })
        ]);

        appState.monitors = monitorsData.map(m => db.convertMonitorFromDB(m));
        appState.students = studentsData.map(s => db.convertStudentFromDB(s));
        appState.classes = classesData.map(c => db.convertClassFromDB(c));
        appState.matches = matchesData.map(m => db.convertMatchFromDB(m));

        // Torneos (función definida en tournaments.js; tolera tabla inexistente).
        if (typeof loadTournaments === 'function') await loadTournaments();

        console.log('✅ Datos cargados:', {
            monitors: appState.monitors.length,
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
        localStorage.setItem('padelApp_monitors', JSON.stringify(appState.monitors || []));
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
        appState.monitors = monitors ? JSON.parse(monitors) : [];
        appState.currentUser = savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
        console.warn('loadFromLocalStorage failed:', e);
        appState.students = appState.students || [];
        appState.classes = appState.classes || [];
        appState.monitors = appState.monitors || [];
    }
}

// ==========================================
// UI RENDERING
// ==========================================

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthGrid = document.getElementById('monthCalendarGrid');

    if (!appState.currentWeekStart) {
        appState.currentWeekStart = getMonday(new Date());
    }

    if (!appState.currentMonthDate) {
        appState.currentMonthDate = new Date();
    }

    const isMobile = window.innerWidth <= 768;

    if (isMobile && monthGrid) {
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

function renderMonthCalendar() {
    const monthGrid = document.getElementById('monthCalendarGrid');
    if (!monthGrid) return;

    const baseDate = new Date(appState.currentMonthDate || new Date());
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    const startDay = (firstOfMonth.getDay() + 6) % 7; // 0 = lunes

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthTitleEl = document.getElementById('monthTitle');
    if (monthTitleEl) {
        monthTitleEl.textContent = formatMonthYearSpanish(baseDate);
        monthTitleEl.setAttribute('aria-hidden', 'false');
    }

    monthGrid.innerHTML = '';

    const todayStr = formatDateISO(new Date());
    const selectedDayStr = appState.selectedDayDate ? formatDateISO(appState.selectedDayDate) : null;

    const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;
    for (let cellIndex = 0; cellIndex < totalCells; cellIndex++) {
        const cell = document.createElement('div');
        cell.className = 'month-day-cell';

        const dayNumber = cellIndex - startDay + 1;
        if (dayNumber < 1 || dayNumber > daysInMonth) {
            cell.classList.add('empty');
            monthGrid.appendChild(cell);
            continue;
        }

        const cellDate = new Date(year, month, dayNumber);
        const cellDateStr = formatDateISO(cellDate);

        const classesForDay = getClassesForDate(cellDate);

        const hasClasses = classesForDay.length > 0;
        if (hasClasses) cell.classList.add('has-classes');

        if (cellDateStr === todayStr) {
            cell.classList.add('today');
        }

        if (selectedDayStr && cellDateStr === selectedDayStr) {
            cell.classList.add('selected-day');
        }

        const dayLabel = document.createElement('div');
        dayLabel.className = 'month-day-number';
        dayLabel.textContent = String(dayNumber);
        cell.appendChild(dayLabel);

        if (hasClasses) {
            const badge = document.createElement('div');
            badge.className = 'month-day-badge';
            // En móvil solo mostramos el número de clases (ej: "3")
            badge.textContent = `${classesForDay.length}`;
            cell.appendChild(badge);
        }

        cell.addEventListener('click', () => {
            appState.selectedDayDate = cellDate.toISOString();
            renderDayClassesPanel(cellDate);
            // Re-render month to actualizar el resaltado del día seleccionado
            renderMonthCalendar();
        });

        monthGrid.appendChild(cell);
    }

    if (!appState.selectedDayDate) {
        appState.selectedDayDate = new Date(year, month, new Date().getDate()).toISOString();
    }
    renderDayClassesPanel(new Date(appState.selectedDayDate));
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

    const d = new Date(date);
    const weekdayIndex = (d.getDay() + 6) % 7; // 0=Lunes
    const weekdayName = CONFIG.days[weekdayIndex];

    titleEl.textContent = `${weekdayName} ${formatDate(d)}`;

    const classesForDay = getClassesForDate(d);
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
        }

        dayColumn.appendChild(cell);
    }

    gridEl.appendChild(timeColumn);
    gridEl.appendChild(dayColumn);

    // Guardar el día actualmente mostrado para el botón de añadir desde vista diaria
    appState.selectedDayDate = d.toISOString();
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
            const newDay = CONFIG.days[finalDayIndex];
            const newDate = getDateForDay(appState.currentWeekStart, finalDayIndex).toISOString();

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
                
                // Feedback táctil (opcional)
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

                let finalDayIndex = initialDayIndex + dayShift;
                if (finalDayIndex < 0) finalDayIndex = 0;
                if (finalDayIndex > 6) finalDayIndex = 6;

                const candidateStart = minutesToTime(finalStart);
                const candidateEnd = minutesToTime(finalEnd);
                const candidateDate = getDateForDay(appState.currentWeekStart, finalDayIndex).toISOString();

                // Comprobar solapamiento con otra clase antes de aplicar cambios
                if (hasClassTimeConflict(candidateDate, candidateStart, candidateEnd, cls.id)) {
                    showToast('No se puede mover la clase: ya hay otra en ese horario', 'error');
                    return;
                }

                markClassPendingSave(cls.id, {
                    startTime: candidateStart,
                    endTime: candidateEnd,
                    day: CONFIG.days[finalDayIndex],
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

function confirmDeleteStudent(studentId) {
    const student = getStudentById(studentId);
    if (!student) return;
    const ok = confirm(`¿Eliminar alumno ${student.name}? Esta acción no se puede deshacer.`);
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
            });
            pill.appendChild(removeBtn);
            selectedWrap.appendChild(pill);
        });
    }

    // Search input
    const searchWrap = document.createElement('div');
    searchWrap.style.margin = '0.5rem 0';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = 'studentsSelectorSearch';
    searchInput.placeholder = 'Buscar alumno...';
    searchInput.style.width = '100%';
    searchInput.style.padding = '0.5rem';
    searchInput.style.border = '1px solid var(--gray-200)';
    searchInput.style.borderRadius = '6px';
    searchWrap.appendChild(searchInput);

    // Results list
    const results = document.createElement('div');
    results.id = 'studentsSelectorResults';
    results.style.maxHeight = '180px';
    results.style.overflow = 'auto';
    results.style.marginTop = '0.5rem';

    function renderResults(q = '') {
        results.innerHTML = '';
        const query = (q || '').toLowerCase();
        const list = appState.students.filter(s => s.active !== false && (s.name.toLowerCase().includes(query) || (s.email || '').toLowerCase().includes(query)));
        if (list.length === 0) {
            const e = document.createElement('div');
            e.style.color = 'var(--gray-500)';
            e.style.padding = '0.5rem 0';
            e.textContent = 'No se encontraron alumnos';
            results.appendChild(e);
            return;
        }
        list.forEach(s => {
            const item = document.createElement('div');
            item.className = 'student-search-item';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.padding = '0.5rem';
            item.style.borderBottom = '1px solid var(--gray-100)';

            const left = document.createElement('div');
            left.innerHTML = `<strong>${s.name}</strong><div style="font-size:0.85rem; color:var(--gray-600);">${s.email || ''}</div>`;

            const action = document.createElement('button');
            action.className = 'btn btn-secondary';
            action.textContent = selected.includes(s.id) ? 'Quitar' : 'Añadir';
            action.addEventListener('click', (e) => {
                e.stopPropagation();
                if (selected.includes(s.id)) {
                    const idx = selected.indexOf(s.id);
                    if (idx !== -1) selected.splice(idx, 1);
                } else {
                    selected.push(s.id);
                }
                renderSelectedPills();
                renderResults(searchInput.value);
            });

            item.appendChild(left);
            item.appendChild(action);
            results.appendChild(item);
        });
    }

    // Wire search
    searchInput.addEventListener('input', (e) => renderResults(e.target.value));

    // Initial render
    container.appendChild(selectedWrap);
    container.appendChild(searchWrap);
    container.appendChild(results);
    renderSelectedPills();
    renderResults('');
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

    const monitors = appState.monitors.filter(m => (m.permissions || []).includes('monitor'));

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

        card.innerHTML = `
            <div class="monitor-card-header">
                <h3>👤 ${monitor.name}</h3>
                <div class="monitor-card-actions">
                    <button class="btn-icon-sm" onclick="viewMonitorClasses('${monitor.id}')" title="Ver clases">📅</button>
                    <button class="btn-icon-sm" onclick="editMonitor('${monitor.id}')" title="Editar">✏️</button>
                    <button class="btn-icon-sm btn-danger-sm" onclick="confirmDeleteMonitor('${monitor.id}')" title="Eliminar">🗑️</button>
                </div>
            </div>
            <div class="monitor-card-info">
                <p>📧 ${monitor.email || 'Sin email'}</p>
                <p>📞 ${monitor.phone || 'Sin teléfono'}</p>
            </div>
            <button class="monitor-details-toggle" onclick="toggleMonitorDetails(this)">
                Ver detalles ▼
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

        container.appendChild(card);
    });
}

function toggleMonitorDetails(btn) {
    const panel = btn.nextElementSibling;
    const open = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    btn.textContent = open ? 'Ocultar detalles ▲' : 'Ver detalles ▼';
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

        const clickAttr = empty ? '' : `style="cursor:pointer;" onclick="toggleMonthDetail(this)"`;
        return `<tr class="${empty ? 'month-row-empty' : 'month-row-clickable'}" ${clickAttr}>
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
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('active');
}

function openAddClassModal(day = '', hour = null) {
    const form = document.getElementById('classForm');
    form.reset();

    appState.selectedClass = null;

    document.getElementById('classModalTitle').textContent = 'Nueva Clase';

    if (day) {
        document.getElementById('classDay').value = day;
    }

    if (hour !== null) {
        document.getElementById('classStartHour').value = String(hour).padStart(2, '0');
        document.getElementById('classStartMinute').value = '00';
        document.getElementById('classEndHour').value = String(hour + 1).padStart(2, '0');
        document.getElementById('classEndMinute').value = '00';
    }

    // initialize temporary selection for this form
    appState.tempSelectedStudents = [];
    renderStudentsSelector();

    const commentsEl = document.getElementById('classComments');
    if (commentsEl) commentsEl.value = '';

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
    document.getElementById('classDay').value = cls.day;

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
        cls.students.forEach(studentId => {
            const student = getStudentById(studentId);
            if (student) {
                const levelHtml = (student.level !== null && student.level !== undefined) ? `<span class="level-badge" style="margin-left:0.5rem">Nivel: ${student.level}</span>` : '';
                studentsHtml += `<div class="student-item">${student.name}${levelHtml}</div>`;
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
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('¿Cancelar los cambios realizados arrastrando la clase?')) {
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
        const date = getDateForDay(appState.currentWeekStart, dayIndex);
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
                await addClassOnDate(date, day, startTime, endTime, selectedStudents, comments, null);
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

async function addClassOnDate(date, day, startTime, endTime, studentIds, comments, recurringGroupId = null) {
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
    appState.currentWeekStart = currentWeek;
    // Sincronizar mes y día seleccionado con la nueva semana
    appState.currentMonthDate = new Date(currentWeek);
    appState.selectedDayDate = currentWeek.toISOString();
    renderWeekTitle();
    renderCalendar();
}

function goToToday() {
    const today = new Date();
    appState.currentWeekStart = getMonday(today);
    appState.currentMonthDate = new Date(today);
    appState.selectedDayDate = today.toISOString();
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
            const ok = confirm('La semana siguiente ya tiene clases. ¿Quieres copiar igualmente y añadir más?');
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
        appState.currentWeekStart = targetWeekStart;
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

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-message">${message}</div>
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

    if (isCoordinator()) {
        showCoordinatorDashboard();
    } else if (isRecepcion()) {
        showRecepcionView();
    } else {
        showMonitorView();
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
        userDisplay.innerHTML = `${roleEmoji} ${currentUser.name}`;
    }
}

function showCoordinatorDashboard() {
    const calendarSection = document.getElementById('calendarSectionContainer');
    const coordinatorDashboard = document.getElementById('coordinatorDashboard');
    const recepcionDashboard = document.getElementById('recepcionDashboard');
    const sidebar = document.getElementById('sidebar');

    if (calendarSection) calendarSection.style.display = 'none';
    if (recepcionDashboard) recepcionDashboard.style.display = 'none';
    if (coordinatorDashboard) {
        coordinatorDashboard.style.display = 'block';
        renderMonitorsList();
    }
    if (sidebar) sidebar.style.display = 'none';
}

function showMonitorView() {
    const calendarSection = document.getElementById('calendarSectionContainer');
    const coordinatorDashboard = document.getElementById('coordinatorDashboard');
    const recepcionDashboard = document.getElementById('recepcionDashboard');
    const sidebar = document.getElementById('sidebar');

    if (calendarSection) calendarSection.style.display = 'block';
    if (coordinatorDashboard) coordinatorDashboard.style.display = 'none';
    if (recepcionDashboard) recepcionDashboard.style.display = 'none';
    if (sidebar) sidebar.style.display = 'block';

    renderCalendar();
    renderStudentsList();
}

function showRecepcionView() {
    const calendarSection = document.getElementById('calendarSectionContainer');
    const coordinatorDashboard = document.getElementById('coordinatorDashboard');
    const recepcionDashboard = document.getElementById('recepcionDashboard');
    const sidebar = document.getElementById('sidebar');

    if (calendarSection) calendarSection.style.display = 'none';
    if (coordinatorDashboard) coordinatorDashboard.style.display = 'none';
    if (recepcionDashboard) recepcionDashboard.style.display = 'block';
    if (sidebar) sidebar.style.display = 'none';

    switchRecepcionTab(appState.recepcionTab || 'pagos');
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
    const searchWrap = document.getElementById('recepcionSearchWrap');
    if (searchWrap) searchWrap.style.visibility = tab === 'pagos' ? 'visible' : 'hidden';

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
    const counted = parseFloat(appState.cajaCounted);
    let diffHtml = '';
    if (!isNaN(counted) && appState.cajaCounted !== '') {
        const diff = counted - efectivo;
        const cls = Math.abs(diff) < 0.005 ? 'ok' : (diff > 0 ? 'over' : 'under');
        const label = cls === 'ok' ? '✅ Cuadra' : (diff > 0 ? `🔼 Sobra ${eur(Math.abs(diff))}` : `🔽 Falta ${eur(Math.abs(diff))}`);
        diffHtml = `<span class="caja-diff caja-diff-${cls}">${label}</span>`;
    }
    document.getElementById('cajaReconcile').innerHTML = `
        <div class="caja-reconcile-box">
            <span class="caja-reconcile-title">🧮 Cuadre de caja (efectivo)</span>
            <div class="caja-reconcile-row">
                <span>Efectivo esperado: <strong>${eur(efectivo)}</strong></span>
                <label class="caja-reconcile-input">Efectivo contado:
                    <input type="number" min="0" step="0.5" placeholder="0.00"
                        value="${escapeHtml(appState.cajaCounted)}"
                        oninput="updateCajaCounted(this.value)">
                </label>
                ${diffHtml}
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
    renderCajaView();
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
            if (!confirm(`La pista ${newCourt} ya tiene un partido que se solapa a las ${newTime}. ¿Mover de todos modos?`)) {
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
        if (!confirm(`La pista ${court} ya tiene un partido que se solapa a esa hora. ¿Crear de todos modos?`)) return;
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

function confirmDeleteMatch(matchId) {
    const match = appState.matches.find(m => m.id === matchId);
    if (!match) return;
    if (!confirm('¿Eliminar este partido?')) return;
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

    document.getElementById('coordinatorDashboard').style.display = 'none';
    document.getElementById('calendarSectionContainer').style.display = 'block';

    appState.viewingMonitorId = monitorId;

    renderWeekTitle();
    renderCalendar();
}

function backToCoordinatorDashboard() {
    appState.viewingMonitorId = null;
    renderWeekTitle();
    showCoordinatorDashboard();
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

    if (confirm(`¿Estás seguro de eliminar al monitor "${monitor.name}"? Se eliminarán también todas sus clases.`)) {
        await deleteMonitor(monitorId);
    }
}

async function editMonitor(monitorId) {
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    const newName = prompt('Nuevo nombre:', monitor.name);
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
        const newDate = new Date(year, month, 1);
        appState.currentMonthDate = newDate;
        appState.currentWeekStart = getMonday(newDate);
        appState.selectedDayDate = newDate.toISOString();
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

            // Tomar como base el día que se está mostrando en la vista diaria
            const baseDate = appState.selectedDayDate ? new Date(appState.selectedDayDate) : new Date();

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
                modal.classList.remove('active');
            }
        });
    });
}

// ==========================================
// INITIALIZATION
// ==========================================

async function initializeApp() {
    try {
        const loginView = document.getElementById('login-view');

        // Inicializar fechas, títulos y listeners siempre, antes del check de sesión,
        // para que estén listos cuando el usuario haga login.
        const today = new Date();
        appState.currentWeekStart = getMonday(today);
        appState.currentMonthDate = new Date(today);
        appState.selectedDayDate = today.toISOString();
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

                // Fetch monitor row to get name and permissions
                const { data: monitorRow, error: monitorError } = await supabase
                    .from('monitors')
                    .select('*')
                    .eq('auth_user_id', data.session.user.id)
                    .single();

                if (monitorError || !monitorRow) {
                    console.warn('Usuario sin fila en monitors, cerrando sesión.');
                    await supabase.auth.signOut().catch(() => {});
                    if (loginView) loginView.style.display = 'flex';
                    hideMainApp();
                    hideLoading();
                    return;
                }

                appState.currentUser = {
                    id: monitorRow.id,
                    name: monitorRow.name,
                    permissions: monitorRow.permissions || [],
                };

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
        alert('❌ Error al inicializar la aplicación.\n\nDetalles en la consola (F12)');
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
    const monitors = appState.monitors;
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
