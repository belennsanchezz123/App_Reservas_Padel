// ==========================================
// DATABASE SERVICE LAYER
// Abstracción para todas las operaciones con Supabase
// ==========================================

const db = {
    // ==========================================
    // PERSONAL (tabla 'personal': coordinador / monitor / recepción)
    // ==========================================

    async getPersonal() {
        try {
            const { data, error } = await supabase
                .from('personal')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting monitors:', error);
            throw error;
        }
    },

    async getPersonalById(id) {
        try {
            const { data, error } = await supabase
                .from('personal')
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

    async createPersonal(monitor) {
        try {
            const { data, error } = await supabase
                .from('personal')
                .upsert([{
                    id: monitor.id,
                    name: monitor.name,
                    email: monitor.email || null,
                    phone: monitor.phone || null,
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

    async updatePersonal(id, updates) {
        try {
            const { data, error } = await supabase
                .from('personal')
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

    async deletePersonal(id) {
        try {
            const { error } = await supabase
                .from('personal')
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

    // Roster de alumnos con SOLO columnas no sensibles (id, name, level, active),
    // vía la vista `students_roster`. Lo usa el panel del alumno: por RLS un alumno
    // no puede leer la tabla `students` de los demás (email/teléfono), pero sí este
    // roster, necesario para calcular el nivel medio de las clases en los avisos.
    async getStudentsRoster() {
        try {
            const { data, error } = await supabase
                .from('students_roster')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting students roster:', error);
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

    // Devuelve el alumno vinculado a un usuario de Supabase Auth (o null).
    // Se usa en el login para deducir el rol 'usuario'.
    async getStudentByAuthId(authUserId) {
        try {
            const { data, error } = await supabase
                .from('students')
                .select('*')
                .eq('auth_user_id', authUserId)
                .maybeSingle();

            if (error) throw error;
            return data || null;
        } catch (error) {
            console.error('Error getting student by auth id:', error);
            return null;
        }
    },

    async createStudent(student) {
        try {
            const row = {
                id: student.id,
                name: student.name,
                email: student.email || null,
                phone: student.phone || null,
                level: student.level,
                registered_date: student.registeredDate || new Date().toISOString()
            };
            if (student.authUserId !== undefined) row.auth_user_id = student.authUserId || null;
            const { data, error } = await supabase
                .from('students')
                .upsert([row], { onConflict: 'id' })
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
                    precio: classData.precio != null ? classData.precio : undefined,
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
            if (updates.comments !== undefined) dbUpdates.comments = updates.comments || null;
            if (updates.paid !== undefined) dbUpdates.paid = updates.paid;
            if (updates.precio !== undefined) dbUpdates.precio = updates.precio;

            // UPDATE por clave primaria (id). Antes se usaba un upsert con
            // onConflict:'monitor_id,start_at'; al enviar solo unos campos (p. ej.
            // solo `students`) faltaban monitor_id/start_at, así que intentaba
            // INSERTAR una fila con un id ya existente y violaba classes_pkey
            // (error 23505). Con update por id la modificación es directa y segura.
            const { data, error } = await supabase
                .from('classes')
                .update(dbUpdates)
                .eq('id', id)
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
                    precio: c.precio != null ? c.precio : undefined,
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

        // Fecha del día: la fuente FIABLE es start_at, no el campo `date`.
        // start_at se guarda como hora de pared local (toLocaleDateString('sv') + start_time),
        // así que su parte de fecha (substring, sin parsear a Date) es el día local correcto.
        // El campo `date` es timestamptz: si la clase se guardó a MEDIANOCHE local, su
        // representación en UTC cae en el día ANTERIOR (bug off-by-one, p. ej. jueves 16 a las
        // 00:00 CEST -> "2026-07-15T22:00:00Z"), por lo que no sirve como día de la clase.
        const dateStr = dbClass.start_at
            ? String(dbClass.start_at).substring(0, 10)
            : String(dbClass.date || '').substring(0, 10);
        const startHour = parseInt(startTime.split(':')[0], 10);
        const dateObj = new Date(`${dateStr}T${startTime}:00`);
        // day derivado de la fecha ya corregida, para que nunca discrepe del día real.
        const day = _DAYS_ES[(dateObj.getDay() + 6) % 7] || dbClass.day;

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
            precio: dbClass.precio != null ? Number(dbClass.precio) : null,
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
            authUserId: dbStudent.auth_user_id || null,
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

    convertPersonalFromDB(dbMonitor) {
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

    // Todos los pagos de todos los alumnos, en una sola llamada lógica.
    // Pagina de 1000 en 1000 para superar el límite por defecto de Supabase,
    // de modo que escala aunque haya muchísimos pagos. La usa "Gestión de clase".
    async getAllPayments() {
        try {
            const pageSize = 1000;
            let from = 0;
            let all = [];
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { data, error } = await supabase
                    .from('student_payments')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .range(from, from + pageSize - 1);
                if (error) throw error;
                if (!data || data.length === 0) break;
                all = all.concat(data);
                if (data.length < pageSize) break;
                from += pageSize;
            }
            return all;
        } catch (error) {
            console.error('Error getting all payments:', error);
            throw error;
        }
    },

    // Pagos cobrados en un rango de fechas (por paid_date). from/to en formato
    // 'YYYY-MM-DD' (ambos inclusive). Devuelve solo pagos con fecha de pago.
    async getPaymentsByDateRange(from, to) {
        try {
            const { data, error } = await supabase
                .from('student_payments')
                .select('*')
                .not('paid_date', 'is', null)
                .gte('paid_date', from)
                .lte('paid_date', to)
                .order('created_at', { ascending: true });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting payments by date range:', error);
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
            if (updates.method !== undefined) dbUpdates.method = updates.method || null;
            if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;
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
    // STUDENT RECOVERIES (clases por recuperar)
    // ==========================================

    async getRecoveriesByStudent(studentId) {
        try {
            const { data, error } = await supabase
                .from('student_recoveries')
                .select('*')
                .eq('student_id', studentId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting student recoveries:', error);
            throw error;
        }
    },

    // Todas las recuperaciones pendientes (recovered_at nulo) del club.
    // La usa el coordinador en "Gestión de clase".
    async getPendingRecoveries() {
        try {
            const { data, error } = await supabase
                .from('student_recoveries')
                .select('*')
                .is('recovered_at', null);
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting pending recoveries:', error);
            throw error;
        }
    },

    async createRecovery(recovery) {
        try {
            const { data, error } = await supabase
                .from('student_recoveries')
                .insert([{
                    student_id: recovery.studentId,
                    origin_class_id: recovery.originClassId || null,
                    origin_date: recovery.originDate || null,
                    notes: recovery.notes || null,
                }])
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating recovery:', error);
            throw error;
        }
    },

    async markRecovered(id, recoveredClassId) {
        try {
            const { data, error } = await supabase
                .from('student_recoveries')
                .update({
                    recovered_at: new Date().toISOString(),
                    recovered_class_id: recoveredClassId || null,
                })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error marking recovery as recovered:', error);
            throw error;
        }
    },

    async deleteRecovery(id) {
        try {
            const { error } = await supabase
                .from('student_recoveries')
                .delete()
                .eq('id', id);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting recovery:', error);
            throw error;
        }
    },

    convertRecoveryFromDB(r) {
        if (!r) return null;
        return {
            id: r.id,
            studentId: r.student_id,
            originClassId: r.origin_class_id || null,
            originDate: r.origin_date || null,
            recoveredAt: r.recovered_at || null,
            recoveredClassId: r.recovered_class_id || null,
            notes: r.notes || null,
            createdAt: r.created_at,
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
                    court: match.court || null,
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
            if (updates.court !== undefined) dbUpdates.court = updates.court;
            if (updates.winner !== undefined) dbUpdates.winner = updates.winner;
            if (updates.isCompleted !== undefined) dbUpdates.is_completed = updates.isCompleted;
            if (updates.comments !== undefined) dbUpdates.comments = updates.comments || null;

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
            court: m.court !== null && m.court !== undefined ? parseInt(m.court, 10) : null,
            winner: m.winner || null,
            isCompleted: m.is_completed || false,
            comments: m.comments || '',
            createdAt: m.created_at,
        };
    },

    // ==========================================
    // TORNEOS
    // ==========================================

    async getTournaments() {
        try {
            const { data, error } = await supabase
                .from('tournaments')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting tournaments:', error);
            throw error;
        }
    },

    async createTournament(t) {
        try {
            const { data, error } = await supabase
                .from('tournaments')
                .insert([{
                    name: t.name,
                    format: t.format,
                    seeding: t.seeding,
                    status: t.status || 'setup',
                    num_pairs: t.numPairs || 0,
                    num_groups: t.numGroups || 0,
                    qualifiers_per_group: t.qualifiersPerGroup || 0,
                    bracket_size: t.bracketSize || 0,
                }])
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating tournament:', error);
            throw error;
        }
    },

    async updateTournament(id, updates) {
        try {
            const dbUpdates = {};
            if (updates.name !== undefined) dbUpdates.name = updates.name;
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.numPairs !== undefined) dbUpdates.num_pairs = updates.numPairs;
            if (updates.numGroups !== undefined) dbUpdates.num_groups = updates.numGroups;
            if (updates.qualifiersPerGroup !== undefined) dbUpdates.qualifiers_per_group = updates.qualifiersPerGroup;
            if (updates.bracketSize !== undefined) dbUpdates.bracket_size = updates.bracketSize;
            if (updates.winnerPairId !== undefined) dbUpdates.winner_pair_id = updates.winnerPairId;
            const { data, error } = await supabase
                .from('tournaments').update(dbUpdates).eq('id', id).select().single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating tournament:', error);
            throw error;
        }
    },

    async deleteTournament(id) {
        try {
            // tournament_pairs y tournament_matches se borran en cascada (ON DELETE CASCADE).
            const { error } = await supabase.from('tournaments').delete().eq('id', id);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting tournament:', error);
            throw error;
        }
    },

    async getTournamentPairs(tournamentId) {
        try {
            const { data, error } = await supabase
                .from('tournament_pairs').select('*')
                .eq('tournament_id', tournamentId)
                .order('seed', { ascending: true });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting tournament pairs:', error);
            throw error;
        }
    },

    // Inserta varias parejas de una vez (devuelve las filas con id).
    async createTournamentPairs(pairs) {
        try {
            const rows = pairs.map(p => ({
                tournament_id: p.tournamentId,
                player1_id: p.player1Id,
                player2_id: p.player2Id,
                name: p.name || null,
                seed: p.seed ?? null,
                group_index: p.groupIndex ?? null,
            }));
            const { data, error } = await supabase.from('tournament_pairs').insert(rows).select();
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error creating tournament pairs:', error);
            throw error;
        }
    },

    async updateTournamentPair(id, updates) {
        try {
            const dbUpdates = {};
            if (updates.seed !== undefined) dbUpdates.seed = updates.seed;
            if (updates.groupIndex !== undefined) dbUpdates.group_index = updates.groupIndex;
            const { data, error } = await supabase
                .from('tournament_pairs').update(dbUpdates).eq('id', id).select().single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating tournament pair:', error);
            throw error;
        }
    },

    async getTournamentMatches(tournamentId) {
        try {
            const { data, error } = await supabase
                .from('tournament_matches').select('*')
                .eq('tournament_id', tournamentId)
                .order('phase', { ascending: true })
                .order('round', { ascending: true })
                .order('slot', { ascending: true });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting tournament matches:', error);
            throw error;
        }
    },

    async createTournamentMatches(matches) {
        try {
            const rows = matches.map(m => ({
                tournament_id: m.tournamentId,
                phase: m.phase,
                group_index: m.groupIndex ?? null,
                round: m.round || 0,
                slot: m.slot || 0,
                pair_a_id: m.pairAId || null,
                pair_b_id: m.pairBId || null,
                label_a: m.labelA || null,
                label_b: m.labelB || null,
            }));
            const { data, error } = await supabase.from('tournament_matches').insert(rows).select();
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error creating tournament matches:', error);
            throw error;
        }
    },

    async updateTournamentMatch(id, updates) {
        try {
            const dbUpdates = {};
            if (updates.pairAId !== undefined) dbUpdates.pair_a_id = updates.pairAId;
            if (updates.pairBId !== undefined) dbUpdates.pair_b_id = updates.pairBId;
            if (updates.winnerPairId !== undefined) dbUpdates.winner_pair_id = updates.winnerPairId;
            if (updates.score !== undefined) dbUpdates.score = updates.score;
            if (updates.labelA !== undefined) dbUpdates.label_a = updates.labelA;
            if (updates.labelB !== undefined) dbUpdates.label_b = updates.labelB;
            const { data, error } = await supabase
                .from('tournament_matches').update(dbUpdates).eq('id', id).select().single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating tournament match:', error);
            throw error;
        }
    },

    convertTournamentFromDB(t) {
        if (!t) return null;
        return {
            id: t.id,
            name: t.name,
            format: t.format,
            seeding: t.seeding,
            status: t.status,
            numPairs: t.num_pairs,
            numGroups: t.num_groups,
            qualifiersPerGroup: t.qualifiers_per_group,
            bracketSize: t.bracket_size,
            winnerPairId: t.winner_pair_id || null,
            createdAt: t.created_at,
        };
    },

    convertTournamentPairFromDB(p) {
        if (!p) return null;
        return {
            id: p.id,
            tournamentId: p.tournament_id,
            player1Id: p.player1_id,
            player2Id: p.player2_id,
            name: p.name || '',
            seed: p.seed,
            groupIndex: p.group_index,
        };
    },

    convertTournamentMatchFromDB(m) {
        if (!m) return null;
        return {
            id: m.id,
            tournamentId: m.tournament_id,
            phase: m.phase,
            groupIndex: m.group_index,
            round: m.round,
            slot: m.slot,
            pairAId: m.pair_a_id || null,
            pairBId: m.pair_b_id || null,
            labelA: m.label_a || null,
            labelB: m.label_b || null,
            winnerPairId: m.winner_pair_id || null,
            score: m.score || null,
        };
    },

    // ==========================================
    // CLASS REQUESTS (solicitudes de inscripción alumno -> monitor)
    // ==========================================

    // Solicitudes de un monitor filtradas por estado (por defecto pendientes).
    async getRequestsByMonitor(monitorId, status = 'pendiente') {
        try {
            const { data, error } = await supabase
                .from('class_requests')
                .select('*')
                .eq('monitor_id', monitorId)
                .eq('status', status)
                .order('created_at', { ascending: true });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting requests by monitor:', error);
            throw error;
        }
    },

    // Todas las solicitudes de un alumno (para "Mis solicitudes").
    async getRequestsByStudent(studentId) {
        try {
            const { data, error } = await supabase
                .from('class_requests')
                .select('*')
                .eq('student_id', studentId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting requests by student:', error);
            throw error;
        }
    },

    // Solicitud pendiente concreta de un alumno para una clase (evitar duplicados).
    async getPendingRequestForClass(classId, studentId) {
        try {
            const { data, error } = await supabase
                .from('class_requests')
                .select('*')
                .eq('class_id', classId)
                .eq('student_id', studentId)
                .eq('status', 'pendiente')
                .maybeSingle();
            if (error) throw error;
            return data || null;
        } catch (error) {
            console.error('Error getting pending request for class:', error);
            return null;
        }
    },

    // Todas las solicitudes pendientes de una clase (para auto-rechazo al llenarse).
    async getPendingRequestsForClass(classId) {
        try {
            const { data, error } = await supabase
                .from('class_requests')
                .select('*')
                .eq('class_id', classId)
                .eq('status', 'pendiente');
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting pending requests for class:', error);
            throw error;
        }
    },

    async createRequest(request) {
        try {
            const { data, error } = await supabase
                .from('class_requests')
                .insert([{
                    class_id: request.classId,
                    student_id: request.studentId,
                    monitor_id: request.monitorId,
                    status: 'pendiente',
                }])
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating request:', error);
            throw error;
        }
    },

    async updateRequestStatus(id, status, reason = null) {
        try {
            const { data, error } = await supabase
                .from('class_requests')
                .update({
                    status,
                    reason,
                    resolved_at: new Date().toISOString(),
                })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating request status:', error);
            throw error;
        }
    },

    // Solicitudes con un pago en curso que todavía retienen plaza ("holds").
    // Una solicitud cuyo plazo ya venció no retiene nada: la plaza vuelve a estar
    // libre aunque el webhook de expiración de Stripe aún no haya llegado.
    async getActiveHolds() {
        try {
            const { data, error } = await supabase
                .from('class_requests')
                .select('*')
                .eq('status', 'aceptada_pendiente_pago')
                .gt('payment_expires_at', new Date().toISOString());
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting active holds:', error);
            return [];
        }
    },

    async getRequestById(id) {
        try {
            const { data, error } = await supabase
                .from('class_requests')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        } catch (error) {
            console.error('Error getting request by id:', error);
            return null;
        }
    },

    convertRequestFromDB(r) {
        if (!r) return null;
        return {
            id: r.id,
            classId: r.class_id,
            studentId: r.student_id,
            monitorId: r.monitor_id,
            status: r.status,
            reason: r.reason || null,
            createdAt: r.created_at,
            resolvedAt: r.resolved_at || null,
            // Datos del cobro (Stripe)
            price: r.price != null ? Number(r.price) : null,
            stripeSessionId: r.stripe_session_id || null,
            checkoutUrl: r.checkout_url || null,
            paymentExpiresAt: r.payment_expires_at || null,
            paidAt: r.paid_at || null,
        };
    },

    // ==========================================
    // PAGOS STRIPE (Cloudflare Pages Functions, no Supabase)
    // La clave secreta de Stripe vive solo en el servidor: el navegador se limita
    // a pedir el link de pago y a consultar el estado.
    // ==========================================

    // El monitor acepta -> el servidor crea la sesión de Checkout y retiene la plaza.
    async createCheckoutSession(requestId, monitorId) {
        const res = await fetch('/api/checkout/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId, monitorId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo generar el link de pago');
        return data;
    },

    // El alumno vuelve de Stripe: confirma el estado real por si el webhook aún no llegó.
    async getCheckoutStatus(requestId) {
        const res = await fetch(`/api/checkout/status?requestId=${encodeURIComponent(requestId)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo consultar el estado del pago');
        return data;
    },

    // El alumno se da de baja de una clase (>=24h). Si estaba pagada, el servidor
    // le genera una clase por recuperar. Devuelve { ok, recovery }.
    async leaveClass(classId, studentId) {
        const res = await fetch('/api/enrollment/leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classId, studentId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo procesar la baja');
        return data;
    },

    // ==========================================
    // NOTIFICATIONS (bus genérico, reutilizable)
    // ==========================================

    async getNotifications(recipientId) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('recipient_id', recipientId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting notifications:', error);
            throw error;
        }
    },

    async getUnreadNotifications(recipientId) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('recipient_id', recipientId)
                .eq('is_read', false)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting unread notifications:', error);
            throw error;
        }
    },

    async createNotification(notification) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .insert([{
                    recipient_id: notification.recipientId,
                    recipient_role: notification.recipientRole,
                    type: notification.type,
                    request_id: notification.requestId || null,
                    class_id: notification.classId || null,
                    message: notification.message || null,
                }])
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    },

    async markNotificationRead(id) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error marking notification read:', error);
            throw error;
        }
    },

    async markAllNotificationsRead(recipientId) {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('recipient_id', recipientId)
                .eq('is_read', false);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error marking all notifications read:', error);
            throw error;
        }
    },

    convertNotificationFromDB(n) {
        if (!n) return null;
        return {
            id: n.id,
            recipientId: n.recipient_id,
            recipientRole: n.recipient_role,
            type: n.type,
            requestId: n.request_id || null,
            classId: n.class_id || null,
            message: n.message || null,
            isRead: !!n.is_read,
            createdAt: n.created_at,
        };
    },
};

// NOTA: la lógica de sesión (login, logout, comprobación de sesión) vive
// exclusivamente en app.js (handleLogin / initializeApp). No añadir aquí
// funciones de autenticación duplicadas.