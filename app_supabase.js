// ==========================================
// PADEL CLASS MANAGEMENT - BACKUP (SUPABASE COPY)
// Synchronized copy of app.js
// ==========================================

const appState = {
    students: [],
    classes: [],
    currentWeekStart: null,
    selectedClass: null,
    editingStudent: null,
    monitors: [],
    currentUser: null,
    viewingMonitorId: null,
};

const CONFIG = {
    hoursStart: 8,
    hoursEnd: 23,
    maxStudentsPerClass: 4,
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
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

// ==========================================
// AUTHENTICATION & USER MANAGEMENT
// ==========================================

async function login(role, monitorId = null, monitorName = null) {
    if (role === 'coordinator') {
        appState.currentUser = {
            id: 'coordinator',
            name: 'Coordinador',
            role: 'coordinator',
        };
    } else if (role === 'monitor') {
        if (monitorId) {
            const monitor = getMonitorById(monitorId);
            if (monitor) {
                appState.currentUser = {
                    id: monitor.id,
                    name: monitor.name,
                    role: 'monitor',
                };
            }
        } else if (monitorName) {
            try {
                const newMonitor = await addMonitor(monitorName, '', '');
                appState.currentUser = {
                    id: newMonitor.id,
                    name: newMonitor.name,
                    role: 'monitor',
                };
            } catch (error) {
                showToast('Error al crear monitor', 'error');
                return;
            }
        }
    }

    localStorage.setItem('padelApp_currentUser', JSON.stringify(appState.currentUser));
    hideLoginScreen();
    showMainApp();
}

function logout() {
    appState.currentUser = null;
    localStorage.removeItem('padelApp_currentUser');
    showLoginScreen();
    hideMainApp();
}

function getCurrentUser() {
    return appState.currentUser;
}

function isCoordinator() {
    return appState.currentUser && appState.currentUser.role === 'coordinator';
}

function isMonitor() {
    return appState.currentUser && appState.currentUser.role === 'monitor';
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

function getMonitorStats(monitorId) {
    const classes = appState.classes.filter(c => c.monitorId === monitorId);
    const studentIds = new Set();
    classes.forEach(cls => {
        cls.students.forEach(sid => studentIds.add(sid));
    });

    return {
        totalClasses: classes.length,
        totalStudents: studentIds.size,
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
        };

        const result = await db.createClass(newClass);
        const converted = db.convertClassFromDB(result);
        appState.classes.push(converted);

        renderCalendar();
        showToast('Clase creada correctamente', 'success');
        return converted;
    } catch (error) {
        console.error('Error adding class:', error);
        showToast('Error al crear clase', 'error');
        throw error;
    }
}

async function updateClass(classId, updates) {
    try {
        await db.updateClass(classId, updates);

        const classIndex = appState.classes.findIndex(c => c.id === classId);
        if (classIndex !== -1) {
            appState.classes[classIndex] = { ...appState.classes[classIndex], ...updates };
        }

        renderCalendar();
        showToast('Clase actualizada', 'success');
    } catch (error) {
        console.error('Error updating class:', error);
        showToast('Error al actualizar clase', 'error');
    }
}

async function deleteClass(classId) {
    try {
        await db.deleteClass(classId);

        appState.classes = appState.classes.filter(c => c.id !== classId);

        renderCalendar();
        showToast('Clase eliminada', 'success');
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

    let classes = appState.classes.filter(cls => {
        const classDate = new Date(cls.date);
        return classDate >= weekStart && classDate < weekEnd;
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

// ... (rest of file matches app.js)
