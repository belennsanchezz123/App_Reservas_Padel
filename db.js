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
                    start_time: classData.startTime,
                    end_time: classData.endTime,
                    start_at: `${_dateStr}T${classData.startTime}:00`,
                    end_at: `${_dateStr}T${classData.endTime}:00`,
                    students: classData.students,
                    max_capacity: classData.maxCapacity || 4,
                    status: classData.status || 'active',
                    is_completed: classData.isCompleted || false,
                    monitor_id: classData.monitorId,
                    monitor_name: classData.monitorName,
                    comments: classData.comments || null,
                    recurring_group_id: classData.recurringGroupId || null
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
            if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
            if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
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

    async deleteClassesByGroup(groupId) {
        try {
            const { error } = await supabase
                .from('classes')
                .delete()
                .eq('recurring_group_id', groupId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting recurring group:', error);
            throw error;
        }
    },

    async createClasses(classesArray) {
        try {
            const rows = classesArray.map(c => {
                const dateStr = new Date(c.date).toLocaleDateString('sv');
                return {
                    id: c.id,
                    day: c.day,
                    date: c.date,
                    start_at: `${dateStr}T${c.startTime}:00`,
                    end_at: `${dateStr}T${c.endTime}:00`,
                    students: c.students,
                    max_capacity: c.maxCapacity || 4,
                    status: c.status || 'active',
                    is_completed: c.isCompleted || false,
                    monitor_id: c.monitorId,
                    monitor_name: c.monitorName,
                    comments: c.comments || null,
                    recurring_group_id: c.recurringGroupId || null,
                };
            });
            const { data, error } = await supabase.from('classes').insert(rows).select();
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error creating classes batch:', error);
            try { console.error('Error details:', JSON.stringify(error, null, 2)); } catch (e) {}
            throw error;
        }
    },

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================

    // Convertir datos de Supabase (snake_case) a formato app (camelCase)
    convertClassFromDB(dbClass) {
        if (!dbClass) return null;
        const _DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

        // Usar start_time/end_time (tipo TIME, sin zona horaria) cuando existen.
        // start_at es timestamptz y el navegador lo convierte a local causando desfase +2h en CEST.
        const startTime = dbClass.start_time
            ? String(dbClass.start_time).substring(0, 5)
            : String(dbClass.start_at || '').substring(11, 16);
        const endTime = dbClass.end_time
            ? String(dbClass.end_time).substring(0, 5)
            : String(dbClass.end_at || '').substring(11, 16);

        // date y day: usar columnas directas cuando existen para evitar conversión de zona horaria
        const dateStr = dbClass.date
            ? String(dbClass.date).substring(0, 10)
            : String(dbClass.start_at || '').substring(0, 10);
        const startHour = parseInt(startTime.split(':')[0], 10);
        const dateObj = new Date(`${dateStr}T${startTime}:00`);
        const day = dbClass.day || _DAYS_ES[(dateObj.getDay() + 6) % 7];

        return {
            id: dbClass.id,
            day,
            date: dateStr,
            startTime,
            endTime,
            students: dbClass.students || [],
            maxCapacity: dbClass.max_capacity,
            status: dbClass.status,
            isCompleted: dbClass.is_completed,
            monitorId: dbClass.monitor_id,
            monitorName: dbClass.monitor_name,
            comments: dbClass.comments || '',
            paid: dbClass.paid || false,
            recurringGroupId: dbClass.recurring_group_id || null
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
            registeredDate: dbStudent.registered_date,
            active: dbStudent.active !== false,
        };
    },

    async setStudentActive(id, active) {
        try {
            const { error } = await supabase
                .from('students')
                .update({ active })
                .eq('id', id);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error updating student active status:', error);
            throw error;
        }
    },

    convertMonitorFromDB(dbMonitor) {
        if (!dbMonitor) return null;
        return {
            id: dbMonitor.id,
            name: dbMonitor.name,
            email: dbMonitor.email,
            phone: dbMonitor.phone,
            role: dbMonitor.role,
            permissions: dbMonitor.permissions || [],
            createdDate: dbMonitor.created_date
        };
    },

    // ==========================================
    // STUDENT PAYMENTS
    // ==========================================

    async getPaymentsByStudent(studentId) {
        try {
            const { data, error } = await supabase
                .from('student_payments')
                .select('*')
                .eq('student_id', studentId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting student payments:', error);
            throw error;
        }
    },

    async createPayment(payment) {
        try {
            const { data, error } = await supabase
                .from('student_payments')
                .insert([{
                    student_id: payment.studentId,
                    class_id: payment.classId || null,
                    period: payment.period || null,
                    amount: payment.amount !== null ? payment.amount : null,
                    paid_date: payment.paidDate || null,
                    method: payment.method || null,
                    notes: payment.notes || null,
                }])
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating payment:', error);
            throw error;
        }
    },

    async updatePayment(id, updates) {
        try {
            const dbUpdates = {};
            if (updates.paidDate !== undefined) dbUpdates.paid_date = updates.paidDate;
            if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
            if (updates.method !== undefined) dbUpdates.method = updates.method;
            if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
            const { data, error } = await supabase
                .from('student_payments')
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating payment:', error);
            throw error;
        }
    },

    async deletePayment(id) {
        try {
            const { error } = await supabase
                .from('student_payments')
                .delete()
                .eq('id', id);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting payment:', error);
            throw error;
        }
    },

    convertPaymentFromDB(p) {
        if (!p) return null;
        return {
            id: p.id,
            studentId: p.student_id,
            classId: p.class_id || null,
            period: p.period || null,
            amount: p.amount !== null && p.amount !== undefined ? parseFloat(p.amount) : null,
            paidDate: p.paid_date || null,
            method: p.method || null,
            notes: p.notes || null,
            createdAt: p.created_at,
        };
    },

    // ==========================================
    // MATCHES (partidos por nivel — estilo Playtomic)
    // ==========================================

    async getMatches() {
        try {
            const { data, error } = await supabase
                .from('matches')
                .select('*')
                .order('match_date', { ascending: true })
                .order('start_time', { ascending: true });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting matches:', error);
            throw error;
        }
    },

    async createMatch(match) {
        try {
            const { data, error } = await supabase
                .from('matches')
                .insert([{
                    match_date: match.matchDate,
                    start_time: match.startTime,
                    match_type: match.matchType || 'competitive',
                    level_min: match.levelMin,
                    level_max: match.levelMax,
                    players: match.players || [],
                    comments: match.comments || null,
                }])
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating match:', error);
            throw error;
        }
    },

    async updateMatch(id, updates) {
        try {
            // Conversión camelCase (app) -> snake_case (Supabase)
            const dbUpdates = {};
            if (updates.matchDate !== undefined) dbUpdates.match_date = updates.matchDate;
            if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
            if (updates.matchType !== undefined) dbUpdates.match_type = updates.matchType;
            if (updates.levelMin !== undefined) dbUpdates.level_min = updates.levelMin;
            if (updates.levelMax !== undefined) dbUpdates.level_max = updates.levelMax;
            if (updates.players !== undefined) dbUpdates.players = updates.players;
            if (updates.winner !== undefined) dbUpdates.winner = updates.winner;
            if (updates.isCompleted !== undefined) dbUpdates.is_completed = updates.isCompleted;
            if (updates.comments !== undefined) dbUpdates.comments = updates.comments;

            const { data, error } = await supabase
                .from('matches')
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating match:', error);
            throw error;
        }
    },

    async deleteMatch(id) {
        try {
            const { error } = await supabase
                .from('matches')
                .delete()
                .eq('id', id);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting match:', error);
            throw error;
        }
    },

    convertMatchFromDB(m) {
        if (!m) return null;
        return {
            id: m.id,
            matchDate: m.match_date ? String(m.match_date).substring(0, 10) : null,
            startTime: m.start_time ? String(m.start_time).substring(0, 5) : '',
            matchType: m.match_type || 'competitive',
            levelMin: m.level_min !== null && m.level_min !== undefined ? parseFloat(m.level_min) : null,
            levelMax: m.level_max !== null && m.level_max !== undefined ? parseFloat(m.level_max) : null,
            players: m.players || [],
            winner: m.winner || null,
            isCompleted: m.is_completed || false,
            comments: m.comments || '',
            createdAt: m.created_at,
        };
    },
};

// NOTA: la lógica de sesión (login, logout, comprobación de sesión) vive
// exclusivamente en app.js (handleLogin / initializeApp). No añadir aquí
// funciones de autenticación duplicadas.