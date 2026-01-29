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

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

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

// ==========================================
// AUTHENTICATION & USER MANAGEMENT
// ==========================================

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
            // Create new monitor on first login
            const newMonitor = addMonitor(monitorName, '', '');
            appState.currentUser = {
                id: newMonitor.id,
                name: newMonitor.name,
                role: 'monitor',
            };
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

function addMonitor(name, email, phone) {
    const monitor = {
        id: generateId(),
        name,
        email,
        phone,
        role: 'monitor',
        createdDate: new Date().toISOString(),
    };

    appState.monitors.push(monitor);
    saveToLocalStorage();
    if (isCoordinator()) {
        renderMonitorsList();
    }
    return monitor;
}

function updateMonitor(monitorId, updates) {
    const monitorIndex = appState.monitors.findIndex(m => m.id === monitorId);
    if (monitorIndex !== -1) {
        appState.monitors[monitorIndex] = { ...appState.monitors[monitorIndex], ...updates };
        saveToLocalStorage();
        if (isCoordinator()) {
            renderMonitorsList();
        }
        showToast('Monitor actualizado', 'success');
    }
}

function deleteMonitor(monitorId) {
    // Remove monitor
    appState.monitors = appState.monitors.filter(m => m.id !== monitorId);

    // Remove all classes associated with this monitor
    appState.classes = appState.classes.filter(c => c.monitorId !== monitorId);

    saveToLocalStorage();
    if (isCoordinator()) {
        renderMonitorsList();
        renderCalendar();
    }
    showToast('Monitor eliminado', 'success');
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
// LOCAL STORAGE
// ==========================================

function saveToLocalStorage() {
    localStorage.setItem('padelApp_students', JSON.stringify(appState.students));
    localStorage.setItem('padelApp_classes', JSON.stringify(appState.classes));
    localStorage.setItem('padelApp_monitors', JSON.stringify(appState.monitors));
}

function loadFromLocalStorage() {
    const students = localStorage.getItem('padelApp_students');
    const classes = localStorage.getItem('padelApp_classes');
    const monitors = localStorage.getItem('padelApp_monitors');
    const currentUser = localStorage.getItem('padelApp_currentUser');

    if (students) {
        appState.students = JSON.parse(students);
    }

    if (classes) {
        appState.classes = JSON.parse(classes);
    }

    if (monitors) {
        appState.monitors = JSON.parse(monitors);
    }

    if (currentUser) {
        appState.currentUser = JSON.parse(currentUser);
    }
}

// ==========================================
// STUDENT MANAGEMENT
// ==========================================

function addStudent(name, email, phone) {
    const student = {
        id: generateId(),
        name,
        email,
        phone,
        registeredDate: new Date().toISOString(),
    };

    appState.students.push(student);
    saveToLocalStorage();
    renderStudentsList();
    renderStudentsSelector();
    showToast('Alumno agregado correctamente', 'success');
    return student;
}

function deleteStudent(studentId) {
    // Remove from students array
    appState.students = appState.students.filter(s => s.id !== studentId);

    // Remove from all classes
    appState.classes.forEach(cls => {
        cls.students = cls.students.filter(sid => sid !== studentId);
    });

    saveToLocalStorage();
    renderStudentsList();
    renderStudentsSelector();
    renderCalendar();
    showToast('Alumno eliminado', 'success');
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

function addClass(day, startTime, endTime, studentIds) {
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
        // Coordinator can assign any monitor (we'll get this from form later)
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
        isCompleted: false, // Nueva propiedad para marcar clase como completada manualmente
        monitorId,
        monitorName,
    };

    appState.classes.push(newClass);
    saveToLocalStorage();
    renderCalendar();
    showToast('Clase creada correctamente', 'success');
    return newClass;
}

function updateClass(classId, updates) {
    const classIndex = appState.classes.findIndex(c => c.id === classId);
    if (classIndex !== -1) {
        appState.classes[classIndex] = { ...appState.classes[classIndex], ...updates };
        saveToLocalStorage();
        renderCalendar();
        showToast('Clase actualizada', 'success');
    }
}

function deleteClass(classId) {
    appState.classes = appState.classes.filter(c => c.id !== classId);
    saveToLocalStorage();
    renderCalendar();
    showToast('Clase eliminada', 'success');
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
    // Si la clase está marcada como completada manualmente, mostrarla como completa (verde)
    if (cls.isCompleted) return 'full';

    const count = cls.students.length;
    const max = cls.maxCapacity;
    const percentage = (count / max) * 100;

    if (percentage >= 100) return 'full';
    if (percentage > 0) return 'partial';
    return 'empty';
}

// ==========================================
// UI RENDERING
// ==========================================

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    // Render time column
    renderTimeColumn(grid);

    // Render day columns
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

    // Header
    const header = document.createElement('div');
    header.className = 'day-header';
    header.innerHTML = `
        <span class="day-header-name">${dayName}</span>
        <span class="day-header-date">${formatDate(date)}</span>
    `;
    dayColumn.appendChild(header);

    // Hour cells
    for (let hour = CONFIG.hoursStart; hour < CONFIG.hoursEnd; hour++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';

        // Find classes for this time slot
        const classesInSlot = getClassesForTimeSlot(dayName, hour);

        if (classesInSlot.length > 0) {
            classesInSlot.forEach(cls => {
                const classCard = createClassCard(cls);
                cell.appendChild(classCard);
            });
            cell.classList.add('has-class');
        } else {
            // Add click handler to create new class
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

    // Only return classes that START in this hour slot
    return weekClasses.filter(cls => {
        if (cls.day !== day) return false;

        const startHour = parseInt(cls.startTime.split(':')[0]);

        // Only show the class in the hour where it starts
        return hour === startHour;
    });
}

function createClassCard(cls) {
    const occupancy = getClassOccupancy(cls);
    const card = document.createElement('div');
    card.className = `class-card class-${occupancy}`;

    const studentsCount = cls.students.length;
    const maxCapacity = cls.maxCapacity;

    // Calculate duration in hours for proper height
    const startTimeParts = cls.startTime.split(':');
    const endTimeParts = cls.endTime.split(':');
    const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
    const endMinutes = parseInt(endTimeParts[0]) * 60 + parseInt(endTimeParts[1]);
    const durationMinutes = endMinutes - startMinutes;
    const durationHours = durationMinutes / 60;

    // Apply height based on duration (60px per hour is the base cell height)
    // Subtract spacing so classes don't visually bleed into the next hour
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
            // Could add student details modal here
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

    // Set start time
    const startParts = cls.startTime.split(':');
    document.getElementById('classStartHour').value = startParts[0];
    document.getElementById('classStartMinute').value = startParts[1] || '00';

    // Set end time
    const endParts = cls.endTime.split(':');
    document.getElementById('classEndHour').value = endParts[0];
    document.getElementById('classEndMinute').value = endParts[1] || '00';

    renderStudentsSelector();

    // Select students
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

    // Determinar si mostrar el indicador de completado manualmente
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

    // Actualizar el texto del botón de completado en el modal
    updateToggleCompletedButton(cls);

    openModal('classDetailsModal');
}

// ==========================================
// FORM HANDLERS
// ==========================================

function handleClassFormSubmit(e) {
    e.preventDefault();

    const day = document.getElementById('classDay').value;

    // Build time from separate hour and minute selects
    const startHour = document.getElementById('classStartHour').value;
    const startMinute = document.getElementById('classStartMinute').value;
    const startTime = `${startHour}:${startMinute}`;

    const endHour = document.getElementById('classEndHour').value;
    const endMinute = document.getElementById('classEndMinute').value;
    const endTime = `${endHour}:${endMinute}`;

    // Get selected students
    const selectedStudents = Array.from(
        document.querySelectorAll('#studentsSelector input[type="checkbox"]:checked')
    ).map(cb => cb.value);

    if (selectedStudents.length > CONFIG.maxStudentsPerClass) {
        showToast(`Máximo ${CONFIG.maxStudentsPerClass} alumnos por clase`, 'error');
        return;
    }

    if (appState.selectedClass) {
        // Update existing class
        const dayIndex = CONFIG.days.indexOf(day);
        const date = getDateForDay(appState.currentWeekStart, dayIndex);

        updateClass(appState.selectedClass, {
            day,
            date: date.toISOString(),
            startTime,
            endTime,
            students: selectedStudents,
        });
        appState.selectedClass = null;
    } else {
        // Add new class
        addClass(day, startTime, endTime, selectedStudents);
    }

    closeModal('classModal');
}

function handleStudentFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('studentName').value.trim();
    const email = document.getElementById('studentEmail').value.trim();
    const phone = document.getElementById('studentPhone').value.trim();

    if (!name) {
        showToast('El nombre es obligatorio', 'error');
        return;
    }

    addStudent(name, email, phone);
    closeModal('studentModal');
    document.getElementById('studentForm').reset();
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

function toggleClassCompleted(classId) {
    const cls = getClassById(classId);
    if (!cls) return;

    // Toggle the isCompleted status
    const newStatus = !cls.isCompleted;
    updateClass(classId, { isCompleted: newStatus });

    // Update button text
    updateToggleCompletedButton(cls);

    // Refresh the class details view
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

function handleMonitorFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('monitorName').value.trim();
    const email = document.getElementById('monitorEmail').value.trim();
    const phone = document.getElementById('monitorPhone').value.trim();

    if (!name) {
        showToast('El nombre es obligatorio', 'error');
        return;
    }

    addMonitor(name, email, phone);
    closeMonitorModal();
    showToast('Monitor agregado correctamente', 'success');
}

function showMonitorLogin() {
    const select = document.getElementById('monitorSelect');

    // Clear and populate select with existing monitors
    select.innerHTML = '<option value="">--- Nuevo Monitor ---</option>';
    appState.monitors.forEach(monitor => {
        const option = document.createElement('option');
        option.value = monitor.id;
        option.textContent = monitor.name;
        select.appendChild(option);
    });

    // Show/hide new name input based on selection
    select.addEventListener('change', function () {
        const newNameGroup = document.getElementById('newMonitorNameGroup');
        newNameGroup.style.display = this.value === '' ? 'block' : 'none';
    });

    openModal('monitorLoginModal');
}

function closeMonitorLoginModal() {
    closeModal('monitorLoginModal');
}

function handleMonitorLogin() {
    const select = document.getElementById('monitorSelect');
    const monitorId = select.value;

    if (monitorId) {
        // Existing monitor
        login('monitor', monitorId);
    } else {
        // New monitor
        const newName = document.getElementById('newMonitorName').value.trim();
        if (!newName) {
            showToast('Por favor ingresa tu nombre', 'error');
            return;
        }
        login('monitor', null, newName);
    }

    closeMonitorLoginModal();
}

// ==========================================
// EVENT LISTENERS
// ==========================================

function initializeEventListeners() {
    // Student modal
    document.getElementById('addStudentBtn').addEventListener('click', () => {
        document.getElementById('studentForm').reset();
        openModal('studentModal');
    });

    document.getElementById('closeStudentModal').addEventListener('click', () => {
        closeModal('studentModal');
    });

    document.getElementById('cancelStudentBtn').addEventListener('click', () => {
        closeModal('studentModal');
    });

    document.getElementById('studentForm').addEventListener('submit', handleStudentFormSubmit);

    // Class modal
    document.getElementById('addClassBtn').addEventListener('click', () => {
        appState.selectedClass = null;
        openAddClassModal();
    });

    document.getElementById('closeClassModal').addEventListener('click', () => {
        closeModal('classModal');
        appState.selectedClass = null;
    });

    document.getElementById('cancelClassBtn').addEventListener('click', () => {
        closeModal('classModal');
        appState.selectedClass = null;
    });

    document.getElementById('classForm').addEventListener('submit', handleClassFormSubmit);

    // Class details modal
    document.getElementById('closeClassDetailsModal').addEventListener('click', () => {
        closeModal('classDetailsModal');
    });

    document.getElementById('editClassBtn').addEventListener('click', () => {
        const classId = appState.selectedClass;
        closeModal('classDetailsModal');
        openEditClassModal(classId);
    });

    document.getElementById('deleteClassBtn').addEventListener('click', () => {
        if (confirm('¿Estás seguro de eliminar esta clase?')) {
            deleteClass(appState.selectedClass);
            closeModal('classDetailsModal');
        }
    });

    // Toggle completed status
    document.getElementById('toggleCompletedBtn').addEventListener('click', () => {
        toggleClassCompleted(appState.selectedClass);
    });

    // Week navigation
    document.getElementById('prevWeekBtn').addEventListener('click', () => navigateWeek(-1));
    document.getElementById('nextWeekBtn').addEventListener('click', () => navigateWeek(1));
    document.getElementById('todayBtn').addEventListener('click', goToToday);

    // Sidebar toggle
    document.getElementById('toggleSidebarBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
    });

    document.getElementById('closeSidebarBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
    });

    // Student search
    document.getElementById('studentSearch').addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        const studentCards = document.querySelectorAll('.student-card');

        studentCards.forEach(card => {
            const name = card.querySelector('h4').textContent.toLowerCase();
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
// UI MANAGEMENT (Login & Dashboard)
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

function viewMonitorClasses(monitorId) {
    // Temporarily switch view to show this monitor's calendar
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    // Hide coordinator dashboard, show calendar
    document.getElementById('coordinatorDashboard').style.display = 'none';
    document.getElementById('calendarSectionContainer').style.display = 'block';

    // Store the selected monitor to filter classes
    appState.viewingMonitorId = monitorId;

    // Update page title
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

function confirmDeleteMonitor(monitorId) {
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    if (confirm(`¿Estás seguro de eliminar al monitor "${monitor.name}"? Se eliminarán también todas sus clases.`)) {
        deleteMonitor(monitorId);
    }
}

function editMonitor(monitorId) {
    const monitor = getMonitorById(monitorId);
    if (!monitor) return;

    // For now, just show a simple prompt (can be improved with modal later)
    const newName = prompt('Nuevo nombre:', monitor.name);
    if (newName && newName.trim()) {
        updateMonitor(monitorId, { name: newName.trim() });
    }
}

// ==========================================
// INITIALIZATION
// ==========================================

function initializeApp() {
    // Load data from localStorage
    loadFromLocalStorage();

    // Set current week
    appState.currentWeekStart = getMonday(new Date());

    // Initialize event listeners
    initializeEventListeners();

    // Check if user is logged in
    if (appState.currentUser) {
        // User is logged in, show main app
        hideLoginScreen();
        showMainApp();
    } else {
        // Show login screen
        hideMainApp();
        showLoginScreen();
    }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
