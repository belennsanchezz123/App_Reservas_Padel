// ==========================================
// PADEL CLASS MANAGEMENT - SUPABASE VERSION
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
    hoursEnd: 22,
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

// ==========================================
// DATA LOADING FROM SUPABASE
// ==========================================

async function loadAllData() {
    try {
        showLoading('Cargando datos...');

        const [monitorsData, studentsData, classesData] = await Promise.all([
            db.getMonitors(),
            db.getStudents(),
            db.getClasses()
        ]);

        appState.monitors = monitorsData.map(m => db.convertMonitorFromDB(m));
        appState.students = studentsData.map(s => db.convertStudentFromDB(s));
        appState.classes = classesData.map(c => db.convertClassFromDB(c));

        console.log('✅ Datos cargados:', {
            monitors: appState.monitors.length,
            students: appState.students.length,
            classes: appState.classes.length
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
// UI RENDERING
// ==========================================

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
    if (!container) {
        console.warn('renderStudentsList: element #studentsList not found');
        return;
    }
    container.innerHTML = '';

    if (appState.students.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 2rem;">No hay alumnos registrados</p>';
        return;
    }

    appState.students.forEach(student => {
        const classCount = getStudentClassCount(student.id);
        const card = document.createElement('div');
        card.className = 'student-card';

        const levelDisplay = student.level !== null && student.level !== undefined
            ? `<span class="level-badge">Nivel: ${student.level}</span>`
            : '';

        card.innerHTML = `
            <h4>${student.name} ${levelDisplay}</h4>
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
    if (!container) {
        console.warn('renderStudentsSelector: element #studentsSelector not found');
        return;
    }
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

function renderMonitorsList() {
    const container = document.getElementById('monitorsList');
    if (!container) return;

    container.innerHTML = '';

    if (appState.monitors.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 2rem;">No hay monitores registrados. Agrega el primer monitor.</p>';
        return;
    }

    appState.monitors.forEach(monitor => {
        const stats = getMonitorStats(monitor.id);
        const card = document.createElement('div');
        card.className = 'monitor-card';

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
            <div class="monitor-card-stats">
                <div class="stat-item">
                    <span class="stat-value">${stats.totalClasses}</span>
                    <span class="stat-label">Clases</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${stats.totalStudents}</span>
                    <span class="stat-label">Alumnos</span>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
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

// ==========================================
// FORM HANDLERS
// ==========================================

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
        await addStudent(name, email, phone, level !== '' ? parseFloat(level) : null);
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
    renderWeekTitle();
    renderCalendar();
}

function goToToday() {
    appState.currentWeekStart = getMonday(new Date());
    renderWeekTitle();
    renderCalendar();
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================

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

function showMonitorLogin() {
    const select = document.getElementById('monitorSelect');

    select.innerHTML = '<option value="">--- Nuevo Monitor ---</option>';
    appState.monitors.forEach(monitor => {
        const option = document.createElement('option');
        option.value = monitor.id;
        option.textContent = monitor.name;
        select.appendChild(option);
    });

    select.addEventListener('change', function () {
        const newNameGroup = document.getElementById('newMonitorNameGroup');
        newNameGroup.style.display = this.value === '' ? 'block' : 'none';
    });

    openModal('monitorLoginModal');
}

function closeMonitorLoginModal() {
    closeModal('monitorLoginModal');
}

async function handleMonitorLogin() {
    const select = document.getElementById('monitorSelect');
    const monitorId = select.value;

    if (monitorId) {
        login('monitor', monitorId);
    } else {
        const newName = document.getElementById('newMonitorName').value.trim();
        if (!newName) {
            showToast('Por favor ingresa tu nombre', 'error');
            return;
        }
        await login('monitor', null, newName);
    }

    closeMonitorLoginModal();
}

// ==========================================
// UI MANAGEMENT
// ==========================================

function showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'flex';
}

function hideLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'none';
}

function showMainApp() {
    const mainContainer = document.querySelector('.main-container');
    const header = document.querySelector('.header');
    if (mainContainer) mainContainer.style.display = 'flex';
    if (header) header.style.display = 'block';

    updateHeaderForUser();

    if (isCoordinator()) {
        showCoordinatorDashboard();
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
        const roleEmoji = currentUser.role === 'coordinator' ? '👔' : '🎾';
        userDisplay.innerHTML = `${roleEmoji} ${currentUser.name}`;
    }
}

function showCoordinatorDashboard() {
    const calendarSection = document.getElementById('calendarSectionContainer');
    const coordinatorDashboard = document.getElementById('coordinatorDashboard');
    const sidebar = document.getElementById('sidebar');

    if (calendarSection) calendarSection.style.display = 'none';
    if (coordinatorDashboard) {
        coordinatorDashboard.style.display = 'block';
        renderMonitorsList();
    }
    if (sidebar) sidebar.style.display = 'none';
}

function showMonitorView() {
    const calendarSection = document.getElementById('calendarSectionContainer');
    const coordinatorDashboard = document.getElementById('coordinatorDashboard');
    const sidebar = document.getElementById('sidebar');

    if (calendarSection) calendarSection.style.display = 'block';
    if (coordinatorDashboard) coordinatorDashboard.style.display = 'none';
    if (sidebar) sidebar.style.display = 'block';

    renderCalendar();
    renderStudentsList();
}

function viewMonitorClasses(monitorId) {
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    document.getElementById('coordinatorDashboard').style.display = 'none';
    document.getElementById('calendarSectionContainer').style.display = 'block';

    appState.viewingMonitorId = monitorId;

    const weekTitle = document.getElementById('weekTitle');
    weekTitle.innerHTML = `
        <button class="btn btn-sm" onclick="backToCoordinatorDashboard()">← Volver al Dashboard</button>
        Clases de ${monitor.name}
    `;

    renderCalendar();
}

function backToCoordinatorDashboard() {
    appState.viewingMonitorId = null;
    renderWeekTitle();
    showCoordinatorDashboard();
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

function initializeEventListeners() {
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
    });

    const cancelClassBtnEl = getEl('cancelClassBtn');
    if (cancelClassBtnEl) cancelClassBtnEl.addEventListener('click', () => {
        closeModal('classModal');
        appState.selectedClass = null;
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
    if (deleteClassBtnEl) deleteClassBtnEl.addEventListener('click', async () => {
        if (confirm('¿Estás seguro de eliminar esta clase?')) {
            await deleteClass(appState.selectedClass);
            closeModal('classDetailsModal');
        }
    });

    const toggleCompletedBtnEl = getEl('toggleCompletedBtn');
    if (toggleCompletedBtnEl) toggleCompletedBtnEl.addEventListener('click', () => toggleClassCompleted(appState.selectedClass));

    // Week navigation
    const prevWeekBtn = getEl('prevWeekBtn');
    if (prevWeekBtn) prevWeekBtn.addEventListener('click', () => navigateWeek(-1));
    const nextWeekBtn = getEl('nextWeekBtn');
    if (nextWeekBtn) nextWeekBtn.addEventListener('click', () => navigateWeek(1));
    const todayBtnEl = getEl('todayBtn');
    if (todayBtnEl) todayBtnEl.addEventListener('click', goToToday);

    // Sidebar toggle
    const toggleSidebarBtnEl = getEl('toggleSidebarBtn');
    if (toggleSidebarBtnEl) toggleSidebarBtnEl.addEventListener('click', () => {
        const sidebarEl = getEl('sidebar');
        if (sidebarEl) sidebarEl.classList.toggle('active');
    });

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
        // Check if Supabase is configured
        if (typeof supabase === 'undefined' || !supabase) {
            hideLoading();
            alert('⚠️ Supabase no está configurado.\n\nPor favor:\n1. Edita config.js con tus credenciales\n2. Ejecuta schema.sql en Supabase\n3. Recarga la página');
            return;
        }

        // Load data from Supabase
        await loadAllData();

        // Set current week
        appState.currentWeekStart = getMonday(new Date());

        // Initialize event listeners
        initializeEventListeners();

        // Check if user is logged in (from localStorage)
        const savedUser = localStorage.getItem('padelApp_currentUser');
        if (savedUser) {
            appState.currentUser = JSON.parse(savedUser);
            hideLoginScreen();
            showMainApp();
        } else {
            hideMainApp();
            showLoginScreen();
        }
    } catch (error) {
        console.error('Error initializing app:', error);
        hideLoading();
        alert('❌ Error al inicializar la aplicación.\n\nDetalles en la consola (F12)');
    }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
