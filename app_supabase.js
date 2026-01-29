// ================================================
// APP.JS - VERSION SUPABASE
// Aplicación de Gestión de Clases de Pádel
// Integración con Supabase Database
// ================================================

// ==========================================
// APPLICATION STATE
// ==========================================
const appState = {
    students: [],
    classes: [],
    currentWeekStart: null,
    selectedClass: null,
    editingStudent: null,
    // Multi-user system
    monitors: [],
    currentUser: null, // { id, name, role: 'coordinator' | 'monitor' }
};

// Configuration
const CONFIG = {
    hoursStart: 8,
    hoursEnd: 22,
    maxStudentsPerClass: 4,
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
};

// ====================================================================================
// UTILITY FUNCTIONS
// ====================================================================================

// Generate unique ID
function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Format date to DD/MM/YYYY
function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

// Get Monday of current week
function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

// Get date for specific day of week
function getDateForDay(weekStart, dayIndex) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayIndex);
    return date;
}

// Format time to HH:MM
function formatTime(time) {
    return time.padStart(5, '0');
}

// Show/hide loading overlay
function showLoading(message = 'Cargando...') {
    const overlay = document.getElementById('loadingOverlay');
    const text = overlay.querySelector('.loading-text');
    if (text) text.textContent = message;
    overlay.classList.remove('hidden');
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.add('hidden');
}

// ====================================================================================
// AUTHENTICATION & USER MANAGEMENT
// ====================================================================================

function login(role, monitorId = null, monitorName = null) {
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
            // Create new monitor on first login (async)
            (async () => {
                const newMonitor = await addMonitor(monitorName, '', '');
                appState.currentUser = {
                    id: newMonitor.id,
                    name: newMonitor.name,
                    role: 'monitor',
                };
                localStorage.setItem('padelApp_currentUser', JSON.stringify(appState.currentUser));
            })();
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

// ====================================================================================
// MONITOR MANAGEMENT (with Supabase)
// ====================================================================================

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
        appState.monitors.push(result);

        if (isCoordinator()) {
            renderMonitorsList();
        }
        return result;
    } catch (error) {
        console.error('Error adding monitor:', error);
        showToast('Error al agregar monitor', 'error');
        throw error;
    }
}

async function updateMonitor(monitorId, updates) {
    try {
        const result = await db.updateMonitor(monitorId, updates);
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

        // Remove from local state
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

// ====================================================================================
// STUDENT MANAGEMENT (with Supabase)
// ====================================================================================

async function addStudent(name, email, phone) {
    try {
        const student = {
            id: generateId(),
            name,
            email,
            phone,
            registeredDate: new Date().toISOString(),
        };

        const result = await db.createStudent(student);
        appState.students.push(result);

        renderStudentsList();
        renderStudentsSelector();
        showToast('Alumno agregado correctamente', 'success');
        return result;
    } catch (error) {
        console.error('Error adding student:', error);
        showToast('Error al agregar alumno', 'error');
        throw error;
    }
}

async function deleteStudent(studentId) {
    try {
        await db.deleteStudent(studentId);

        // Remove from local state
        appState.students = appState.students.filter(s => s.id !== studentId);

        // Remove from all classes
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

function getStudentById(studentId) {
    return appState.students.find(s => s.id === studentId);
}

function getStudentClassCount(studentId) {
    return appState.classes.filter(cls => cls.students.includes(studentId)).length;
}

// ====================================================================================
// CLASS MANAGEMENT (with Supabase)
// ====================================================================================

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

        // Convert from DB format to app format
        const convertedClass = db.convertClassFromDB(result);
        appState.classes.push(convertedClass);

        renderCalendar();
        showToast('Clase creada correctamente', 'success');
        return convertedClass;
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

    // Filter by monitor if current user is a monitor
    if (isMonitor()) {
        const currentUser = getCurrentUser();
        classes = classes.filter(cls => cls.monitorId === currentUser.id);
    }

    // Filter by viewing monitor if coordinator is viewing specific monitor
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

// ====================================================================================
// DATA LOADING FROM SUPABASE
// ====================================================================================

async function loadAllData() {
    try {
        showLoading('Cargando datos desde la base de datos...');

        // Load monitors
        const monitorsData = await db.getMonitors();
        appState.monitors = monitorsData.map(m => db.convertMonitorFromDB(m));

        // Load students
        const studentsData = await db.getStudents();
        appState.students = studentsData.map(s => db.convertStudentFromDB(s));

        // Load classes
        const classesData = await db.getClasses();
        appState.classes = classesData.map(c => db.convertClassFromDB(c));

        console.log('✅ Data loaded:', {
            monitors: appState.monitors.length,
            students: appState.students.length,
            classes: appState.classes.length
        });

        hideLoading();
    } catch (error) {
        console.error('❌ Error loading data:', error);
        hideLoading();
        showToast('Error al cargar datos. Verifica tu configuración de Supabase.', 'error');
        throw error;
    }
}

// ====================================================================================
// UI RENDERING
// ====================================================================================

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    renderTimeColumn(grid);

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        renderDayColumn(grid, dayIndex);
    }
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
    const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
    const endMinutes = parseInt(endTimeParts[0]) * 60 + parseInt(endTimeParts[1]);
    const durationMinutes = endMinutes - startMinutes;
    const durationHours = durationMinutes / 60;

    const cardHeight = (durationHours * 60) - 15;
    card.style.minHeight = `${cardHeight}px`;

    let monitorDisplay = '';
    if (isCoordinator() && cls.monitorName) {
        monitorDisplay = `<div class="class-card-monitor">👤 ${cls.monitorName}</div>`;
    }

    card.innerHTML = `
        <div class="class-card-time">${cls.startTime} - ${cls.endTime}</div>
        <div class="class-card-occupancy">${studentsCount}/${maxCapacity}</div>
        <div class="class-card-students">
            ${studentsCount === 0 ? 'Sin alumnos' :
            studentsCount === 1 ? '1 alumno' :
                `${studentsCount} alumnos`}
        </div>
        ${monitorDisplay}
    `;

    card.addEventListener('click', (e) => {
        e.stopPropagation();
        showClassDetails(cls.id);
    });

    return card;
}

function renderStudentsList() {
    const container = document.getElementById('studentsList');
    container.innerHTML = '';

    if (appState.students.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 2rem;">No hay alumnos registrados</p>';
        return;
    }

    appState.students.forEach(student => {
        const classCount = getStudentClassCount(student.id);
        const card = document.createElement('div');
        card.className = 'student-card';

        card.innerHTML = `
            <h4>${student.name}</h4>
            <p>${student.email || 'Sin email'}</p>
            <p>${student.phone || 'Sin teléfono'}</p>
            <div class="student-stats">${classCount} ${classCount === 1 ? 'clase' : 'clases'}</div>
        `;

        card.addEventListener('click', () => {
            showToast(`${student.name}: ${classCount} clases`, 'success');
        });

        container.appendChild(card);
    });
}

function renderStudentsSelector() {
    const container = document.getElementById('studentsSelector');
    container.innerHTML = '';

    if (appState.students.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-500);">Primero debes agregar alumnos</p>';
        return;
    }

    appState.students.forEach(student => {
        const wrapper = document.createElement('div');
        wrapper.className = 'student-checkbox';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `student-${student.id}`;
        checkbox.value = student.id;

        const label = document.createElement('label');
        label.htmlFor = `student-${student.id}`;
        label.textContent = student.name;

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
    });
}

function renderWeekTitle() {
    const title = document.getElementById('weekTitle');
    const weekStart = new Date(appState.currentWeekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const startStr = formatDate(weekStart);
    const endStr = formatDate(weekEnd);

    title.textContent = `Semana del ${startStr} - ${endStr}`;
}

// ====================================================================================
// MODAL MANAGEMENT
// ====================================================================================

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

    renderStudentsSelector();
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

    renderStudentsSelector();

    cls.students.forEach(studentId => {
        const checkbox = document.querySelector(`#student-${studentId}`);
        if (checkbox) checkbox.checked = true;
    });

    appState.selectedClass = classId;
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
                studentsHtml += `<div class="student-item">${student.name}</div>`;
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
        ${studentsHtml}
    `;

    appState.selectedClass = classId;
    updateToggleCompletedButton(cls);
    openModal('classDetailsModal');
}

// ====================================================================================
// FORM HANDLERS (async versions)
// ====================================================================================

async function handleClassFormSubmit(e) {
    e.preventDefault();

    const day = document.getElementById('classDay').value;

    const startHour = document.getElementById('classStartHour').value;
    const startMinute = document.getElementById('classStartMinute').value;
    const startTime = `${startHour}:${startMinute}`;

    const endHour = document.getElementById('classEndHour').value;
    const endMinute = document.getElementById('classEndMinute').value;
    const endTime = `${endHour}:${endMinute}`;

    const selectedStudents = Array.from(
        document.querySelectorAll('#studentsSelector input[type="checkbox"]:checked')
    ).map(cb => cb.value);

    if (selectedStudents.length > CONFIG.maxStudentsPerClass) {
        showToast(`Máximo ${CONFIG.maxStudentsPerClass} alumnos por clase`, 'error');
        return;
    }

    try {
        showLoading('Guardando clase...');

        if (appState.selectedClass) {
            const dayIndex = CONFIG.days.indexOf(day);
            const date = getDateForDay(appState.currentWeekStart, dayIndex);

            await updateClass(appState.selectedClass, {
                day,
                date: date.toISOString(),
                startTime,
                endTime,
                students: selectedStudents,
            });
            appState.selectedClass = null;
        } else {
            await addClass(day, startTime, endTime, selectedStudents);
        }

        hideLoading();
        closeModal('classModal');
    } catch (error) {
        hideLoading();
        console.error('Error saving class:', error);
    }
}

async function handleStudentFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('studentName').value.trim();
    const email = document.getElementById('studentEmail').value.trim();
    const phone = document.getElementById('studentPhone').value.trim();

    if (!name) {
        showToast('El nombre es obligatorio', 'error');
        return;
    }

    try {
        showLoading('Guardando alumno...');
        await addStudent(name, email, phone);
        hideLoading();
        closeModal('studentModal');
        document.getElementById('studentForm').reset();
    } catch (error) {
        hideLoading();
        console.error('Error saving student:', error);
    }
}

// ====================================================================================
// NAVIGATION
// ====================================================================================

function navigateWeek(direction) {
    const currentWeek = new Date(appState.currentWeekStart);
    currentWeek.setDate(currentWeek.getDate() + (direction * 7));
    appState.currentWeekStart = currentWeek;
    renderWeekTitle();
    renderCalendar();
}

function goToToday() {
    appState.currentWeekStart = getMonday(new Date());
    renderWeekTitle();
    renderCalendar();
}

// ====================================================================================
// TOAST NOTIFICATIONS
// ====================================================================================

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? '✓' : '✕';

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-in-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ====================================================================================
// LOGIN/LOGOUT UI
// ====================================================================================

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
}

function hideLoginScreen() {
    document.getElementById('loginScreen').style.display = 'none';
}

function showMainApp() {
    document.querySelector('.header').style.display = 'block';
    document.querySelector('.main-container').style.display = 'flex';

    const userDisplay = document.getElementById('userDisplay');
    if (appState.currentUser) {
        userDisplay.textContent = `${appState.currentUser.role === 'coordinator' ? '👔' : '🎾'} ${appState.currentUser.name}`;
    }

    if (isCoordinator()) {
        showCoordinatorDashboard();
    } else {
        showMonitorView();
    }

    renderWeekTitle();
    renderCalendar();
    renderStudentsList();
}

function hideMainApp() {
    document.querySelector('.header').style.display = 'none';
    document.querySelector('.main-container').style.display = 'none';
}

function showCoordinatorDashboard() {
    document.getElementById('coordinatorDashboard').style.display = 'block';
    document.getElementById('calendarSectionContainer').style.display = 'block';
    document.getElementById('sidebar').style.display = 'block';
    renderMonitorsList();
}

function showMonitorView() {
    document.getElementById('coordinatorDashboard').style.display = 'none';
    document.getElementById('calendarSectionContainer').style.display = 'block';
    document.getElementById('sidebar').style.display = 'block';
}

// (Continuará en el próximo archivo debido al límite de caracteres...)
