// ==========================================
// DATABASE SERVICE LAYER
// Abstracción para todas las operaciones con Supabase
// ==========================================

const db = {
    // ==========================================
    // MONITORS
    // ==========================================

    async getMonitors() {
        try {
            const { data, error } = await supabase
                .from('monitors')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting monitors:', error);
            throw error;
        }
    },

    async getMonitorById(id) {
        try {
            const { data, error } = await supabase
                .from('monitors')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting monitor:', error);
            return null;
        }
    },

    async createMonitor(monitor) {
        try {
            const { data, error } = await supabase
                .from('monitors')
                .upsert([{
                    id: monitor.id,
                    name: monitor.name,
                    email: monitor.email,
                    phone: monitor.phone,
                    role: monitor.role || 'monitor',
                    created_date: monitor.createdDate || new Date().toISOString()
                }], { onConflict: 'id' })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating monitor:', error);
            throw error;
        }
    },

    async updateMonitor(id, updates) {
        try {
            const { data, error } = await supabase
                .from('monitors')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating monitor:', error);
            throw error;
        }
    },

    async deleteMonitor(id) {
        try {
            const { error } = await supabase
                .from('monitors')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting monitor:', error);
            throw error;
        }
    },

    // ==========================================
    // STUDENTS
    // ==========================================

    async getStudents() {
        try {
            const { data, error } = await supabase
                .from('students')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting students:', error);
            throw error;
        }
    },

    async getStudentById(id) {
        try {
            const { data, error } = await supabase
                .from('students')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting student:', error);
            return null;
        }
    },

    async createStudent(student) {
        try {
            const { data, error } = await supabase
                .from('students')
                .upsert([{
                    id: student.id,
                    name: student.name,
                    email: student.email,
                    phone: student.phone,
                    level: student.level,
                    registered_date: student.registeredDate || new Date().toISOString()
                }], { onConflict: 'id' })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating student:', error);
            throw error;
        }
    },

    async updateStudent(id, updates) {
        try {
            const { data, error } = await supabase
                .from('students')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating student:', error);
            throw error;
        }
    },

    async deleteStudent(id) {
        try {
            const { error } = await supabase
                .from('students')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting student:', error);
            throw error;
        }
    },

    // ==========================================
    // CLASSES
    // ==========================================

    async getClasses() {
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .order('date', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting classes:', error);
            throw error;
        }
    },

    async getClassById(id) {
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting class:', error);
            return null;
        }
    },

    async getClassesByDateRange(startDate, endDate) {
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .gte('date', startDate.toISOString())
                .lt('date', endDate.toISOString())
                .order('date', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting classes by date:', error);
            throw error;
        }
    },

    async getClassesByMonitor(monitorId) {
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .eq('monitor_id', monitorId)
                .order('date', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting classes by monitor:', error);
            throw error;
        }
    },

    async createClass(classData) {
        try {
            const _dateStr = new Date(classData.date).toLocaleDateString('sv');
            const { data, error } = await supabase
                .from('classes')
                .upsert([{
                    id: classData.id,
                    day: classData.day,
                    date: classData.date,
                    start_at: `${_dateStr}T${classData.startTime}:00`,
                    end_at: `${_dateStr}T${classData.endTime}:00`,
                    students: classData.students,
                    max_capacity: classData.maxCapacity || 4,
                    status: classData.status || 'active',
                    is_completed: classData.isCompleted || false,
                    monitor_id: classData.monitorId,
                    monitor_name: classData.monitorName,
                    comments: classData.comments || null
                }], { onConflict: 'monitor_id,start_at' })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating class:', error);
            try { console.error('Error details:', JSON.stringify(error, null, 2)); } catch (e) {}
            throw error;
        }
    },

    async updateClass(id, updates) {
        try {
            // Convert camelCase to snake_case for database
            const dbUpdates = {};
            if (updates.day !== undefined) dbUpdates.day = updates.day;
            if (updates.date !== undefined) dbUpdates.date = updates.date;
            if (updates.date !== undefined && updates.startTime !== undefined)
                dbUpdates.start_at = `${new Date(updates.date).toLocaleDateString('sv')}T${updates.startTime}:00`;
            if (updates.date !== undefined && updates.endTime !== undefined)
                dbUpdates.end_at = `${new Date(updates.date).toLocaleDateString('sv')}T${updates.endTime}:00`;
            if (updates.students !== undefined) dbUpdates.students = updates.students;
            if (updates.maxCapacity !== undefined) dbUpdates.max_capacity = updates.maxCapacity;
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.isCompleted !== undefined) dbUpdates.is_completed = updates.isCompleted;
            if (updates.monitorId !== undefined) dbUpdates.monitor_id = updates.monitorId;
            if (updates.monitorName !== undefined) dbUpdates.monitor_name = updates.monitorName;
            if (updates.comments !== undefined) dbUpdates.comments = updates.comments;
            if (updates.paid !== undefined) dbUpdates.paid = updates.paid;

            const { data, error } = await supabase
                .from('classes')
                .upsert({ id, ...dbUpdates }, { onConflict: 'monitor_id,start_at' })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating class:', error);
            try { console.error('Error details:', JSON.stringify(error, null, 2)); } catch (e) {}
            throw error;
        }
    },

    async deleteClass(id) {
        try {
            const { error } = await supabase
                .from('classes')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting class:', error);
            throw error;
        }
    },

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================

    // Convertir datos de Supabase (snake_case) a formato app (camelCase)
    convertClassFromDB(dbClass) {
        if (!dbClass) return null;
        const _startAt = new Date(dbClass.start_at);
        const _DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        return {
            id: dbClass.id,
            day: _DAYS_ES[(_startAt.getDay() + 6) % 7],
            date: _startAt.toLocaleDateString('sv'),
            startTime: new Date(dbClass.start_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            }),
            endTime: new Date(dbClass.end_at).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            }),
            students: dbClass.students || [],
            maxCapacity: dbClass.max_capacity,
            status: dbClass.status,
            isCompleted: dbClass.is_completed,
            monitorId: dbClass.monitor_id,
            monitorName: dbClass.monitor_name,
            comments: dbClass.comments || '',
            paid: dbClass.paid || false
        };
    },

    convertStudentFromDB(dbStudent) {
        if (!dbStudent) return null;
        return {
            id: dbStudent.id,
            name: dbStudent.name,
            email: dbStudent.email,
            phone: dbStudent.phone,
            level: dbStudent.level,
            registeredDate: dbStudent.registered_date
        };
    },

    convertMonitorFromDB(dbMonitor) {
        if (!dbMonitor) return null;
        return {
            id: dbMonitor.id,
            name: dbMonitor.name,
            email: dbMonitor.email,
            phone: dbMonitor.phone,
            role: dbMonitor.role,
            createdDate: dbMonitor.created_date
        };
    }
};
// Variable para guardar el usuario actual
let currentUser = null;

// Función para manejar el inicio de sesión
async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-msg');

    try {
        errorMsg.style.display = 'none';
        
        // 1. Intentamos iniciar sesión con Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

        // 2. Si no hay error, guardamos el usuario y mostramos la app
        currentUser = data.user;
        mostrarApp();
        alert('¡Bienvenida/o! Sesión iniciada correctamente.');

    } catch (error) {
        console.error('Error de login:', error);
        errorMsg.textContent = 'Usuario o contraseña incorrectos';
        errorMsg.style.display = 'block';
    }
}

function mostrarApp() {
    // Ocultamos el login
    document.getElementById('login-view').style.display = 'none';
    // Mostramos la app
    document.getElementById('app-view').style.display = 'block';
    
    // AQUÍ ES IMPORTANTE: Recargar los datos ahora que tenemos permiso
    // Si tienes funciones como cargarClases() o inicializarApp(), llámalas aquí:
    if (typeof cargarMonitores === 'function') cargarMonitores();
    if (typeof cargarClases === 'function') cargarClases(); 
}

// Opcional: Comprobar si ya había sesión iniciada al recargar la página
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        mostrarApp();
    }
}

// Ejecutar comprobación al iniciar
checkSession();