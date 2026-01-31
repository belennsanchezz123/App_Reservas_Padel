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
    hoursEnd: 23,
    maxStudentsPerClass: 4,
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    // Snap interval in minutes when dragging/resizing classes (can be 15 or 30)
    snapMinutes: 15,
};

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

async function updateClass(classId, updates) {
    try {
        try {
            await db.updateClass(classId, updates);
            const classIndex = appState.classes.findIndex(c => c.id === classId);
            if (classIndex !== -1) {
                appState.classes[classIndex] = { ...appState.classes[classIndex], ...updates };
            }
            renderCalendar();
            saveToLocalStorage();
            showToast('Clase actualizada', 'success');
        } catch (dbError) {
            console.warn('db.updateClass falló, aplicando cambio localmente:', dbError);
            const classIndex = appState.classes.findIndex(c => c.id === classId);
            if (classIndex !== -1) {
                appState.classes[classIndex] = { ...appState.classes[classIndex], ...updates };
            }
            renderCalendar();
            saveToLocalStorage();
            showToast('Clase actualizada localmente (sin conexión)', 'warning');
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
            appState.classes = appState.classes.filter(c => c.id !== classId);
            renderCalendar();
            saveToLocalStorage();
            showToast('Clase eliminada', 'success');
        } catch (dbError) {
            console.warn('db.deleteClass falló, eliminando localmente:', dbError);
            appState.classes = appState.classes.filter(c => c.id !== classId);
            renderCalendar();
            saveToLocalStorage();
            showToast('Clase eliminada localmente (sin conexión)', 'warning');
        }
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
    if (!grid) {
        console.warn('renderCalendar: element #calendarGrid not found');
        return;
    }
    grid.innerHTML = '';

    if (!appState.currentWeekStart) {
        appState.currentWeekStart = getMonday(new Date());
    }

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

    let monitorDisplay = '';
    if (isCoordinator() && cls.monitorName) {
        monitorDisplay = `<div class="class-card-monitor">👤 ${cls.monitorName}</div>`;
    }

    card.innerHTML = `
        <div class="class-card-time">${cls.startTime} - ${cls.endTime}</div>
        <div class="class-card-occupancy">${studentsCount}/${maxCapacity}</div>
        ${monitorDisplay}
    `;

    // Add resize handle for adjusting duration visually
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.title = 'Arrastrar para ajustar duración';
    card.appendChild(resizeHandle);

    // Resize logic: snap to 15 minutes
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
            markClassPendingSave(cls.id, { endTime: newEndTime });
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // Drag-to-move logic: change start time by dragging the card vertically and change day by dragging horizontally
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

            // Update class locally first and mark pending save
            markClassPendingSave(cls.id, { startTime: newStartTime, endTime: newEndTime, day: newDay, date: newDate });
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

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
            <div class="student-card-header">
                <h4>${student.name} ${levelDisplay}</h4>
                <div class="student-card-actions">
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

// Render students into quick dropdown list
function renderStudentsDropdown(filter = '') {
    // Prefer modal list container, fallback to old dropdown id
    const container = document.getElementById('studentsModalList') || document.getElementById('studentsDropdownList');
    if (!container) return;
    container.innerHTML = '';

    const q = (filter || '').toLowerCase();
    const list = appState.students.filter(s => s.name.toLowerCase().includes(q));

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
        label.innerHTML = `<strong style="display:block">${s.name}</strong><div class="meta">${s.email || ''}</div>`;

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
        const list = appState.students.filter(s => s.name.toLowerCase().includes(query) || (s.email || '').toLowerCase().includes(query));
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

    // initialize temporary selection for this form
    appState.tempSelectedStudents = [];
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

    // initialize temporary selection with class students
    appState.tempSelectedStudents = Array.isArray(cls.students) ? [...cls.students] : [];
    renderStudentsSelector();

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
    closeSaveChangesModal();
    cancelPendingSave();
}

function saveChanges() {
    closeConfirmChangesModal();
    closeSaveChangesModal();
    performPendingSave();
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
            if (studentsModalSearch) { studentsModalSearch.value = ''; studentsModalSearch.focus(); }
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
        // Check if Supabase is configured. If not, fallback to localStorage.
        if (typeof supabase === 'undefined' || !supabase) {
            console.warn('Supabase no está configurado. Usando datos locales (localStorage) como fallback.');
            loadFromLocalStorage();
        } else {
            // Try loading data from Supabase, but fallback to localStorage on error
            try {
                await loadAllData();
            } catch (loadError) {
                console.warn('Carga desde Supabase falló, usando localStorage como fallback:', loadError);
                loadFromLocalStorage();
            }
        }

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

    // Prevent clicks inside dropdown from closing it via document click
    // No special stopPropagation needed for modal; modal background click handler closes modal already.

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
